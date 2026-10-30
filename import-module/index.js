/* =========================================================
   import-module/index.js — 任务批量导入（独立模块）
   挂载方式（server.js 末尾一行）：
     require('../import-module')(app, { requireAuth, getState, saveState, log });

   接口：
     GET  /api/import/template   下载 xlsx 模板
     POST /api/import/parse      { filename, base64 } → 逐行预览（不落库）
     POST /api/import/commit     { filename, base64 } → 重新校验后原子入库

   🔴 为什么 commit 要把文件再传一次、而不是接收前端已校验的行？
      两次请求之间数据可能变了（别人刚建了同名任务）。重新解析 + 重新判重，
      保证「校验通过」和「真正写库」是同一时刻的判断，不会漏拦重复任务。
      代价只是多传一次几百 KB。
   🔴 为什么入库走服务端而不是前端整份 PUT /api/state？
      批量导入一次插 N 条，整份覆盖会把别人这期间的改动冲掉；
      这里用 getState → 改 tasks → saveState(version) 的乐观锁，冲突直接拒绝整批。
   ========================================================= */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { readSheet } = require('./lib/parse');
const { validate } = require('./lib/validate');
const { buildStoreIndex, COLUMNS } = require('./lib/schema');

const TEMPLATE_XLSX = path.join(__dirname, 'templates', '任务批量导入模板.xlsx');
const TEMPLATE_CSV = path.join(__dirname, 'templates', '任务批量导入模板.csv');

function genTaskIds(n) {
  const stamp = Date.now().toString(36).toUpperCase();
  return Array.from({ length: n }, () => 'T' + stamp + crypto.randomBytes(3).toString('hex').toUpperCase());
}

function decodeBase64(s) {
  const raw = String(s || '').replace(/^data:[^,]*;base64,/, '').replace(/^data:[^,]*,/, '');
  return Buffer.from(raw, 'base64');
}

module.exports = function mountImport(app, deps) {
  const { requireAuth, getState, saveState, log } = deps;

  /* 只有总部账号能用：这个入口长在总部「我发布的任务」页面上。
     门店账号即使直接调接口也会被挡掉。 */
  const hqOnly = (req, res, next) => {
    if (!req.actor || !req.actor.isHq) {
      return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '只有总部账号可以批量导入任务' });
    }
    next();
  };

  /** 解析 + 校验，parse 和 commit 共用同一套逻辑 */
  function analyze(req) {
    const { filename, base64 } = req.body || {};
    if (!base64) return { ok: false, msg: '没有收到文件内容' };
    const buf = decodeBase64(base64);
    const sheet = readSheet(buf, filename);
    if (!sheet.ok) return { ok: false, msg: sheet.error };

    const cur = getState();
    if (!cur) return { ok: false, msg: '数据未初始化' };
    const state = cur.state;

    const result = validate(sheet, {
      stores: state.stores || [],
      storeIdx: buildStoreIndex(state.stores || []),
      existingTasks: state.tasks || [],
      me: req.actor,
    });
    return { ok: true, sheet, result, state, version: cur.version };
  }

  /* ---------------- 模板下载 ---------------- */
  app.get('/api/import/template', requireAuth, hqOnly, (req, res) => {
    const csv = String(req.query.format || '').toLowerCase() === 'csv';
    const file = csv ? TEMPLATE_CSV : TEMPLATE_XLSX;
    if (!fs.existsSync(file)) return res.status(404).json({ ok: false, msg: '模板文件缺失，请联系管理员' });
    const name = csv ? '任务批量导入模板.csv' : '任务批量导入模板.xlsx';
    res.setHeader('Content-Type', csv ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="template.${csv ? 'csv' : 'xlsx'}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    fs.createReadStream(file).pipe(res);
  });

  /* ---------------- 预览 ---------------- */
  app.post('/api/import/parse', requireAuth, hqOnly, (req, res) => {
    let a;
    try { a = analyze(req); } catch (e) { return res.status(500).json({ ok: false, msg: '解析出错：' + e.message }); }
    if (!a.ok) return res.status(400).json({ ok: false, msg: a.msg });

    /* task 字段不回传（预览用 brief 就够了），省带宽也免得前端误用 */
    const rows = a.result.rows.map((r) => ({
      rowNo: r.rowNo, ok: r.ok, errors: r.errors, brief: r.brief,
      dup: r.dup ? (r.dup.type === 'existing' ? { type: 'existing', title: r.dup.task.title } : { type: 'inFile', rowNo: r.dup.rowNo }) : null,
    }));
    res.json({
      ok: true,
      canCommit: a.result.summary.bad === 0,
      summary: a.result.summary,
      rows,
      sheetName: a.sheet.sheetName,
      version: a.version,
    });
  });

  /* ---------------- 确认入库 ---------------- */
  app.post('/api/import/commit', requireAuth, hqOnly, (req, res) => {
    let a;
    try { a = analyze(req); } catch (e) { return res.status(500).json({ ok: false, msg: '解析出错：' + e.message }); }
    if (!a.ok) return res.status(400).json({ ok: false, msg: a.msg });

    const { result, state, version } = a;
    if (result.summary.bad > 0) {
      const first = result.rows.find((r) => !r.ok);
      return res.status(400).json({
        ok: false, code: 'INVALID',
        msg: `还有 ${result.summary.bad} 行不合格，整批未导入。例如第 ${first.rowNo} 行：${first.errors[0]}`,
        summary: result.summary,
      });
    }
    if (!result.rows.length) return res.status(400).json({ ok: false, msg: '没有可导入的行' });

    const now = new Date().toISOString();
    const ids = genTaskIds(result.rows.length);
    const created = result.rows.map((r, i) => Object.assign({}, r.task, {
      id: ids[i],
      status: 'active',
      creatorId: req.actor.id,
      creatorName: req.actor.name,
      createdAt: now,
    }));

    /* 新任务放最前，任务列表按 createdAt 倒序时一眼能看到 */
    state.tasks = created.concat(state.tasks || []);

    const w = saveState(state, version, req.actor.id);
    if (!w.ok) {
      return res.status(409).json({
        ok: false, code: 'VERSION_CONFLICT',
        msg: '导入过程中数据被其他人更新，为保证不重复下发，本次整批未导入，请刷新后重试',
      });
    }

    log(req.actor.id, 'import.commit',
      `${created.length} 条任务 / 合计 ${created.reduce((n, t) => n + t.storeIds.length, 0)} 个门店`);

    res.json({
      ok: true, version: w.version, added: created.length,
      tasks: created.map((t) => ({ id: t.id, title: t.title })),
      summary: result.summary,
    });
  });

  /* 给前端算「模板里有多少列」用，顺便当健康探针 */
  app.get('/api/import/meta', requireAuth, hqOnly, (req, res) => {
    res.json({
      ok: true,
      columns: COLUMNS.map((c) => ({ key: c.key, label: c.label, required: !!c.required })),
      templateReady: fs.existsSync(TEMPLATE_XLSX),
    });
  });
};
