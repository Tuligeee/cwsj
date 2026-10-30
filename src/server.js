/* =========================================================
   server.js — 门店任务管理平台 · 后端
   阶段 1 目标：登录 + 读到同一份数据（多设备共享）
   接口：
     GET  /api/health
     POST /api/login            {account,pwd,role}
     GET  /api/bootstrap        登录后拉取全量数据
     PUT  /api/state            {version,data} 乐观锁
     POST /api/change-password  {oldPwd,newPwd}
   ========================================================= */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');

const {
  db, seedIfEmpty, getState, saveState, findUserByAccount, findUserById,
  setPassword, log, DB_PATH, DEFAULT_STORE_PWD, listAudit } = require('./db');
const { sign, requireAuth, need } = require('./auth');
const split = require('./split');

const PORT = Number(process.env.PORT || 8789);
/* 前端静态目录：默认取 cwsj-server/web（与 src 同级）。
   早期版本误写成 '..','..','门店任务管理平台'，解析到不存在目录，首页必 404。 */
const WEB_DIR = process.env.WEB_DIR || path.resolve(__dirname, '..', 'web');
/* 门店实拍图落盘目录，与 SQLite 同盘，备份时整目录带走 */
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(__dirname, '..', 'data', 'uploads');
/* 🔴 上传接口只返回**不带前缀**的路径（/uploads/xxx）。
   前缀由前端 web/js/api.js 的 `BASE + r.url` 统一拼 —— 只有一处负责，
   本地（BASE=''）与线上（BASE='/cwsj'）都正确。
   2026-10-22 踩过：服务端也拼了 BASE_PATH，结果变成 /cwsj/cwsj/uploads/... → 图片全 404。
   注意：nginx 的 `proxy_pass http://127.0.0.1:8789/`（带尾斜杠）会把 /cwsj/uploads/x 剥成
   /uploads/x，所以后端这里挂 /uploads 就够，不需要知道挂载前缀。 */

const app = express();
app.use(express.json({ limit: '12mb' }));

/* 简单的访问日志（PM2 会收进日志文件） */
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api/')) {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - t0}ms ${req.actor ? req.actor.id : '-'}`);
    }
  });
  next();
});

/* ---------------- 健康检查 ---------------- */
app.get('/api/health', (req, res) => {
  const st = getState();
  res.json({ ok: true, version: st ? st.version : null, updatedAt: st ? st.updatedAt : null, db: DB_PATH });
});

/* ---------------- 登录 ---------------- */
/* 不要求前端选身份：账号在库里全局唯一，服务端查出是门店还是管理公司 */
app.post('/api/login', (req, res) => {
  const { account, pwd } = req.body || {};
  if (!account || !pwd) return res.status(400).json({ ok: false, msg: '请输入账号和密码' });

  const key = String(account).trim();
  const row = findUserByAccount(key);
  if (!row) return res.status(401).json({ ok: false, msg: '账号或密码错误' });
  if (!row.enabled) return res.status(403).json({ ok: false, msg: '该账号已被停用，请联系管理员' });
  if (!bcrypt.compareSync(String(pwd), row.pwd_hash)) {
    log(row.id, 'login.fail', `账号 ${key}`);
    return res.status(401).json({ ok: false, msg: '账号或密码错误' });
  }

  const profile = JSON.parse(row.profile);
  const token = sign({ id: row.id, type: row.type });
  log(row.id, 'login.ok', `${row.name}`);
  res.json({
    ok: true,
    token,
    user: { ...profile, id: row.id, type: row.type, account: row.account },
    mustChangePwd: row.pwd_hash.startsWith('$2a$10$') ? isDefaultPwd(String(pwd)) : false,
  });
});

function isDefaultPwd(plain) {
  return plain === (require('./db').DEFAULT_STORE_PWD) || plain === '123456';
}

/* ---------------- 拉取全量数据 ---------------- */
/* 按角色裁剪提需（2026-10-29）：门店只看本店；普通总部只看到派给自己的；
   管委会/管理员看全部。注意：PUT 时必须合并回去，见下方 scopeMerge。 */
function trimDemands(actor, all) {
  if (!Array.isArray(all)) return [];
  if (actor.isCommittee || actor.isAdmin) return all;
  if (actor.isStore) return all.filter(d => d.storeId === actor.id);
  return all.filter(d => (d.assign && d.assign.toId === actor.id) || d.deletedBy === actor.id);
}

app.get('/api/bootstrap', requireAuth, (req, res) => {
  const st = getState();
  if (!st) return res.status(500).json({ ok: false, msg: '数据未初始化' });
  /* 拆表读取（测试环境）：表里有数据就从表拼，读失败自动回退到 state_doc */
  let base = st.state;
  try {
    if (split.hasTables()) base = Object.assign({}, st.state, split.readState());
  } catch (e) {
    log(req.actor.id, 'split.read.fail', e.message);
  }
  const visible = trimDemands(req.actor, base.demands);
  const state = Object.assign({}, base, { demands: visible });
  res.json({ ok: true, version: st.version, updatedAt: st.updatedAt, state: state, me: req.actor });
});

/* ---------------- 保存全量数据（乐观锁） ---------------- */
app.put('/api/state', requireAuth, (req, res) => {
  const { version, data } = req.body || {};
  if (!data || typeof data !== 'object') return res.status(400).json({ ok: false, msg: '数据格式错误' });
  if (version === undefined) return res.status(400).json({ ok: false, msg: '缺少版本号' });

  /* 服务端兜底：门店账号不允许改考核规则与门店名单 */
  if (req.actor.isStore) {
    const cur = getState();
    if (cur && data.assessCfg && JSON.stringify(data.assessCfg) !== JSON.stringify(cur.state.assessCfg)) {
      log(req.actor.id, 'state.deny', '门店账号试图修改考核规则');
      return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '门店账号无权修改考核规则' });
    }
  }

  /* records 只能通过 /api/record/* 原子接口改。整份 PUT 一律沿用服务端现值，
     否则任何人下一次「整份保存」都会把别人刚提交的记录冲掉 —— 这正是并发丢数据的根因。
     例外：管理员显式带 forceRecords:true（仅供测试夹具 reset 使用）。 */
  const cur = getState();
  if (cur && !(req.body && req.body.forceRecords === true && req.actor.isAdmin)) {
    data.records = cur.state.records;
  }

  /* 需求删除校验（2026-10-29）：软删除 + 权限 + 状态限制 + 审计 */
  {
    /* 客户端拿到的是裁剪后的 demands，回写时若直接采用会覆盖别家数据。
       这里把提交内容合并回服务端的完整数组：自己没有权限改的条目一律沿用服务端版本。 */
    {
      const prevArr = (cur && cur.state && cur.state.demands) || [];
      const inArr = Array.isArray(data.demands) ? data.demands : [];
      const canEdit = (d) => {
        if (!d) return false;
        if (req.actor.isCommittee || req.actor.isAdmin) return true;
        if (req.actor.isStore) return d.storeId === req.actor.id;
        return !!(d.assign && d.assign.toId === req.actor.id);
      };
      const inMap = new Map(inArr.map(d => [d.id, d]));
      const merged = [];
      const used = new Set();
      prevArr.forEach(od => {
        const nd = inMap.get(od.id);
        if (!nd) { merged.push(od); return; }
        merged.push(canEdit(od) ? nd : od);
        used.add(od.id);
      });
      inArr.forEach(nd => {
        if (used.has(nd.id)) return;
        if (canEdit(nd)) merged.push(nd);
      });
      data.demands = merged;
    }
    const prevD = (cur && cur.state && cur.state.demands) || [];
    const nextD = Array.isArray(data.demands) ? data.demands : [];
    const prevMap = new Map(prevD.map(d => [d.id, d]));
    const nextMap = new Map(nextD.map(d => [d.id, d]));
    for (const id of prevMap.keys()) {
      if (!nextMap.has(id)) {
        log(req.actor.id, 'demand.harddelete.deny', String(id));
        return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '需求不允许物理删除' });
      }
    }
    for (const [id, nd] of nextMap) {
      const od = prevMap.get(id);
      if (!od) continue;
      if (!od.deletedAt && nd.deletedAt) {
        const isOwner = req.actor.isStore && od.storeId === req.actor.id;
        if (!req.actor.isAdmin && !isOwner) {
          log(req.actor.id, 'demand.delete.deny', (od.code || id) + ' 非本人非管理员');
          return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '无权删除该需求' });
        }
        if (od.status !== 'pending' && od.status !== 'rejected') {
          log(req.actor.id, 'demand.delete.deny', (od.code || id) + ' 状态' + od.status);
          return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '该状态的需求不允许删除' });
        }
        log(req.actor.id, 'demand.delete', (od.code || id) + ' ' + (od.title || ''));
      }
      if (!od.archivedAt && nd.archivedAt) {
        if (!(req.actor.isCommittee || req.actor.isAdmin)) {
          log(req.actor.id, 'demand.archive.deny', (od.code || id) + ' 非管委会非管理员');
          return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '只有管委会或管理员可以归档' });
        }
        if (od.status !== 'completed' && od.status !== 'confirmed') {
          return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '只有已完成的需求可以归档' });
        }
        log(req.actor.id, 'demand.archive', (od.code || id) + ' ' + (od.title || ''));
      }
      if (od.archivedAt && !nd.archivedAt && !(req.actor.isCommittee || req.actor.isAdmin)) {
        return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '只有管委会或管理员可以取消归档' });
      }
      /* 四个动作的服务端校验（2026-10-29）：评估 / 派发 / 处理完成 / 门店确认 */
      const sameJson = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
      if (!sameJson(od.review, nd.review)) {
        if (!req.actor.isCommittee) {
          log(req.actor.id, 'demand.review.deny', (od.code || id) + ' 非管委会');
          return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '只有管委会可以评估需求' });
        }
        if (od.status !== 'pending') {
          return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '只有待评估的需求可以评估' });
        }
      }
      if (!sameJson(od.assign, nd.assign)) {
        if (!req.actor.isCommittee && !req.actor.isAdmin) {
          log(req.actor.id, 'demand.assign.deny', (od.code || id) + ' 非管委会');
          return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '只有管委会可以派发需求' });
        }
        if (od.status !== 'approved') {
          return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '只有已通过的需求可以派发' });
        }
        if (nd.assign && !nd.assign.toId) {
          return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '派发必须指定责任人' });
        }
      }
      if (!sameJson(od.complete, nd.complete)) {
        if (!od.assign || od.assign.toId !== req.actor.id) {
          log(req.actor.id, 'demand.complete.deny', (od.code || id) + ' 非责任人');
          return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '只有该需求的责任人可以提交处理结果' });
        }
        if (od.status !== 'assigned') {
          return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '只有处理中的需求可以提交结果' });
        }
      }
      if (!sameJson(od.confirm, nd.confirm)) {
        if (!req.actor.isStore || od.storeId !== req.actor.id) {
          log(req.actor.id, 'demand.confirm.deny', (od.code || id) + ' 非提出门店');
          return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '只有提出需求的门店可以确认完成' });
        }
        if (od.status !== 'completed') {
          return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '只有已完成的待确认需求可以确认' });
        }
      }
      if (od.deletedAt && !nd.deletedAt && !req.actor.isAdmin) {
        return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '只有管理员可以恢复已删除的需求' });
      }
    }
  }

  let _beforeState = null;
  try { _beforeState = require('./changelog').capture(getState().state); } catch (e) {}
  const r = saveState(data, version, req.actor.id);
  if (r.ok && _beforeState) { try { require('./changelog').commit(_beforeState, data, req.actor.id); } catch (e) { console.error('changelog.fail', e.message); } }
  if (r.ok) { try { require('./snapshots').snapshot(data, r.version, req.actor.id, (req.body && req.body.summary) || '页面保存'); } catch (e) {} }
  /* 双写：保存成功后把整份 state 镜像到各表；失败只记日志，不影响本次保存 */
  if (r.ok) {
    try {
      split.syncToTables(data);
    } catch (e) {
      log(req.actor.id, 'split.sync.fail', e.message);
    }
  }
  if (!r.ok && r.code === 'VERSION_CONFLICT') {
    const st = getState();
    return res.status(409).json({
      ok: false, code: 'VERSION_CONFLICT', version: st.version, state: st.state,
      msg: '数据已被他人更新，已为你载入最新版本，请重试刚才的操作',
    });
  }
  if (!r.ok) return res.status(500).json({ ok: false, msg: '保存失败' });
  log(req.actor.id, 'state.save', `v${r.version}`);
  res.json({ ok: true, version: r.version });
});

/* ---------------- 钉钉提醒（仅管理员） ---------------- */
const ding = require('./ding');

function adminOnly(req, res) {
  if (!req.actor || !req.actor.isAdmin) {
    res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '只有管理员可以管理钉钉提醒' });
    return false;
  }
  return true;
}

app.get('/api/ding/list', requireAuth, (req, res) => {
  if (!adminOnly(req, res)) return;
  const users = db.prepare('SELECT id, type, name FROM users WHERE enabled = 1 ORDER BY type, id').all();
  const maps = db.prepare('SELECT * FROM ding_map').all();
  const mm = new Map(maps.map(m => [m.user_id, m]));
  const rows = users.map(u => {
    const m = mm.get(u.id) || {};
    return {
      userId: u.id, name: u.name, type: u.type,
      dingName: m.ding_name || '', dingUserid: m.ding_userid || '',
      source: m.source || '', updatedAt: m.updated_at || '',
    };
  });
  const cnt = new Map();
  rows.forEach(r => { if (r.dingUserid) cnt.set(r.dingUserid, (cnt.get(r.dingUserid) || 0) + 1); });
  rows.forEach(r => { r.dup = !!(r.dingUserid && cnt.get(r.dingUserid) > 1); });
  const snap = db.prepare('SELECT COUNT(*) AS c, MAX(updated_at) AS m FROM ding_people').get() || {};
  res.json({ ok: true, rows: rows, peopleCount: snap.c || 0, snapshotAt: snap.m || '' });
});

app.get('/api/ding/people', requireAuth, (req, res) => {
  if (!adminOnly(req, res)) return;
  const q = String(req.query.q || '').trim();
  const like = '%' + q + '%';
  const rows = db.prepare('SELECT userid, name, title, depts FROM ding_people '
    + 'WHERE (? = \'\' OR name LIKE ? OR depts LIKE ?) ORDER BY name LIMIT 60').all(q, like, like);
  res.json({ ok: true, rows: rows });
});

app.post('/api/ding/bind', requireAuth, (req, res) => {
  if (!adminOnly(req, res)) return;
  const userId = String((req.body || {}).userId || '');
  const dingUserid = String((req.body || {}).dingUserid || '');
  if (!userId) return res.status(400).json({ ok: false, msg: '缺少账号' });
  if (!dingUserid) {
    db.prepare('DELETE FROM ding_map WHERE user_id = ?').run(userId);
    log(req.actor.id, 'ding.unbind', userId);
    return res.json({ ok: true, cleared: true });
  }
  const p = db.prepare('SELECT userid, name FROM ding_people WHERE userid = ?').get(dingUserid);
  if (!p) return res.status(400).json({ ok: false, msg: '钉钉通讯录里没有这个 userid，请先刷新快照' });
  db.prepare('INSERT INTO ding_map (user_id, ding_userid, ding_name, source, updated_by, updated_at) '
    + 'VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET ding_userid=excluded.ding_userid, '
    + 'ding_name=excluded.ding_name, source=excluded.source, updated_by=excluded.updated_by, updated_at=excluded.updated_at')
    .run(userId, p.userid, p.name, 'manual', req.actor.id, new Date().toISOString());
  log(req.actor.id, 'ding.bind', userId + ' -> ' + p.name + '(' + p.userid + ')');
  res.json({ ok: true, dingName: p.name });
});

app.post('/api/ding/test', requireAuth, async (req, res) => {
  if (!adminOnly(req, res)) return;
  const userId = String((req.body || {}).userId || '');
  const m = db.prepare('SELECT * FROM ding_map WHERE user_id = ?').get(userId);
  if (!m || !m.ding_userid) return res.status(400).json({ ok: false, msg: '这个账号还没绑定钉钉' });
  const text = '【纯玩世界 · 门店任务管理】这是一条测试提醒：绑定正常，后续该账号的相关提醒会发到这里。收到即成功。';
  const r = await ding.sendSingle(m.ding_userid, text);
  log(req.actor.id, r.ok ? 'ding.test' : 'ding.test.fail', userId + ' ' + (r.key || r.reason || ''));
  res.json(r.ok ? { ok: true, key: r.key } : { ok: false, msg: r.reason });
});

app.post('/api/ding/refresh', requireAuth, async (req, res) => {
  if (!adminOnly(req, res)) return;
  try {
    const out = await ding.fetchAllPeople();
    const now = new Date().toISOString();
    const up = db.prepare('INSERT INTO ding_people (userid, name, title, depts, updated_at) VALUES (?,?,?,?,?) '
      + 'ON CONFLICT(userid) DO UPDATE SET name=excluded.name, title=excluded.title, depts=excluded.depts, updated_at=excluded.updated_at');
    const tx = db.transaction(list => list.forEach(p => up.run(p.userid, p.name, p.title || '', JSON.stringify(p.depts || []), now)));
    tx(out.people);
    log(req.actor.id, 'ding.refresh', out.people.length + ' 人 / ' + out.deptCount + ' 部门');
    res.json({ ok: true, count: out.people.length, depts: out.deptCount, at: now });
  } catch (e) {
    log(req.actor.id, 'ding.refresh.fail', e.message);
    res.status(500).json({ ok: false, msg: e.message });
  }
});

/* ---------------- 任务资源接口（测试环境拆表第一步） ---------------- */
require('./tasks_api').register(app, requireAuth, log);
require('./demands_api').register(app, requireAuth, log);
require('./contacts_api').register(app, requireAuth, log);
require('./snapshots').register(app, requireAuth, log);
require('./changelog').register(app, requireAuth, log);

/* ---------------- 操作日志（仅管理员） ---------------- */
app.get('/api/audit', requireAuth, (req, res) => {
  if (!req.actor.isAdmin) return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '只有管理员可以查看操作日志' });
  const r = listAudit(req.query.limit, req.query.offset);
  res.json({ ok: true, total: r.total, rows: r.rows });
});

/* ---------------- 改密码 ---------------- */
app.post('/api/change-password', requireAuth, (req, res) => {
  const { oldPwd, newPwd } = req.body || {};
  if (!newPwd || String(newPwd).length < 6) return res.status(400).json({ ok: false, msg: '新密码至少 6 位' });
  const row = findUserByAccount(req.actor.account, req.actor.type);
  if (!row) return res.status(404).json({ ok: false, msg: '账号不存在' });
  if (oldPwd !== undefined && !bcrypt.compareSync(String(oldPwd), row.pwd_hash)) {
    return res.status(401).json({ ok: false, msg: '原密码错误' });
  }
  setPassword(req.actor.id, String(newPwd));
  log(req.actor.id, 'pwd.change', '');
  res.json({ ok: true, msg: '密码已修改' });
});

/* ---------------- 图片上传 ---------------- */
/* 前端已用 canvas 压缩到 1080px / quality 0.72 的 JPEG，这里只做解码落盘。
   不收原始大文件：单张上限 3MB，超了直接 413，避免 state 被 base64 撑爆。 */
const MAX_IMG_BYTES = 3 * 1024 * 1024;
const IMG_EXT = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp' };

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true, fallthrough: false, index: false }));

app.post('/api/upload', requireAuth, (req, res) => {
  const dataUrl = (req.body || {}).dataUrl;
  if (typeof dataUrl !== 'string') return res.status(400).json({ ok: false, msg: '缺少图片数据' });

  const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!m) return res.status(400).json({ ok: false, msg: '仅支持 jpeg / png / webp 图片' });

  let buf;
  try { buf = Buffer.from(m[2], 'base64'); } catch (_) { return res.status(400).json({ ok: false, msg: '图片数据损坏' }); }
  if (buf.length < 128) return res.status(400).json({ ok: false, msg: '图片内容为空' });
  if (buf.length > MAX_IMG_BYTES) return res.status(413).json({ ok: false, msg: '图片过大（上限 3MB）' });

  const now = new Date();
  const sub = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dir = path.join(UPLOAD_DIR, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const name = `${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}.${IMG_EXT[m[1]]}`;
  fs.writeFileSync(path.join(dir, name), buf);

  const url = `/uploads/${sub}/${name}`;
  log(req.actor.id, 'img.upload', `${url} ${Math.round(buf.length / 1024)}KB`);
  res.json({ ok: true, url, size: buf.length });
});

/* ---------------- 管理员后台：门店与人员账号 ----------------
   后台 UI 早就有「+ 新增门店 / + 新增人员账号」和登录账号、登录密码输入框，
   但旧实现只把数据 push 进前端 state，users 表里没有记录 → 新建的号根本登不进去。
   这里把保存动作落到 users 表，并与 state_doc 在同一事务里保持一致。 */
const ACCOUNT_RE = /^[A-Za-z0-9._@-]{2,32}$/;
const withoutPwd = (o) => { const c = Object.assign({}, o); delete c.pwd; delete c.password; return c; };

function nextSerialId(box, prefix) {
  let max = 0;
  const re = new RegExp('^' + prefix + '(\\d+)$');
  for (const x of box) { const m = re.exec(x.id || ''); if (m) max = Math.max(max, Number(m[1])); }
  /* 同时看 users 表：state 与 users 可能不同步（异常中断、外部改库、清理不彻底），
     只按 state 算会生成已存在的 id → UNIQUE constraint failed: users.id → 500。
     （2026-10-22 实测：残留两个孤儿账号后，新增门店直接 500） */
  try {
    for (const r of db.prepare('SELECT id FROM users').all()) {
      const m = re.exec(r.id || '');
      if (m) max = Math.max(max, Number(m[1]));
    }
  } catch (_) { /* 表还没建时忽略 */ }
  return prefix + String(max + 1).padStart(2, '0');
}

/* ---------- 账号 ↔ 通讯录联动 ----------
   通讯录要「默认就有所有有账号的人」，所以账号一建就落一条联系人；
   之后改姓名/职务/电话也跟着更新（负责工作 duty 保留人工填写，不被覆盖）。
   联系人用 refId 反指账号，不用姓名匹配（重名会串）。 */
function contactFromAccount(type, row) {
  if (type === 'store') {
    if (!row.mgr) return null;
    return {
      refId: row.id, name: row.mgr, dept: '门店', title: row.name + ' 店长',
      duty: '本店事务对接', phone: row.phone || '', account: row.account, source: 'account',
    };
  }
  return {
    refId: row.id, name: row.name, dept: row.dept || '总部', title: row.title || '',
    duty: '待补充', phone: row.phone || '', account: row.account, source: 'account',
  };
}
function syncContact(state, type, row) {
  if (!Array.isArray(state.contacts)) state.contacts = [];
  const fresh = contactFromAccount(type, row);
  if (!fresh) return;
  const exist = state.contacts.find((c) => c.refId === row.id);
  if (exist) {
    Object.assign(exist, { name: fresh.name, dept: fresh.dept, title: fresh.title, phone: fresh.phone, account: fresh.account });
  } else {
    state.contacts.push(Object.assign({ id: 'C' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }, fresh));
  }
}

/** 新增 / 编辑 / 删除账号；返回 { ok, code, msg, version, state } */
function saveAccount(actor, kind, mode, id, patch) {
  const type = kind === 'hq' ? 'hq' : 'store';
  const st = getState();
  if (!st) return { ok: false, code: 500, msg: '数据未初始化' };
  const state = st.state;
  const box = type === 'store' ? state.stores : state.hq;
  patch = patch || {};

  /* ---- 删除 ---- */
  if (mode === 'delete') {
    const idx = box.findIndex((x) => x.id === id);
    if (idx < 0) return { ok: false, code: 404, msg: '对象不存在' };
    /* 防止把最后一个管理员删掉，导致整个系统没人能改权限 */
    if (type === 'hq' && box[idx].admin) {
      const others = box.filter((x) => x.id !== id && x.admin && x.enabled !== false).length;
      if (others === 0) return { ok: false, code: 400, msg: '这是最后一个管理员账号，不能删除。请先把管理员权限交给别人。' };
    }
    box.splice(idx, 1);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  } else {
    /* ---- 新增 / 编辑 ---- */
    const account = String(patch.account || '').trim();
    const name = String(patch.name || '').trim();
    if (!name) return { ok: false, code: 400, msg: '请填写名称' };
    if (!ACCOUNT_RE.test(account)) return { ok: false, code: 400, msg: '登录账号只能由字母/数字/._@- 组成，2~32 位' };

    const dup = db.prepare('SELECT id FROM users WHERE account = ? COLLATE NOCASE').get(account);
    if (dup && dup.id !== id) return { ok: false, code: 409, msg: `账号 ${account} 已被使用（门店与总部不能同号）` };

    const pwdPlain = String(patch.pwd || '').trim();
    const enabled = patch.enabled === undefined ? true : !!patch.enabled;
    const profile = withoutPwd(Object.assign({}, patch, { type, account, name, enabled }));

    if (mode === 'create') {
      const newId = nextSerialId(box, type === 'store' ? 'ST' : 'HQ');
      const hash = bcrypt.hashSync(pwdPlain || DEFAULT_STORE_PWD, 10);
      db.prepare('INSERT INTO users (id,type,account,pwd_hash,name,enabled,profile) VALUES (?,?,?,?,?,?,?)')
        .run(newId, type, account, hash, name, enabled ? 1 : 0, JSON.stringify(Object.assign({}, profile, { id: newId })));
      box.push(Object.assign({}, profile, { id: newId, account, name, enabled }));
      id = newId;
      syncContact(state, type, box[box.length - 1]);
    } else {
      const row = box.find((x) => x.id === id);
      if (!row) return { ok: false, code: 404, msg: '对象不存在' };
      /* 最后一个管理员不许自我降权：否则后台永久进不去，只能靠服务器上的 grant_owner.js 救 */
      if (type === 'hq' && row.admin && patch.admin === false) {
        const others = box.filter((x) => x.id !== id && x.admin && x.enabled !== false).length;
        if (others === 0) return { ok: false, code: 400, msg: '这是最后一个管理员，不能取消管理员权限。请先给其他人开启管理员。' };
      }
      Object.assign(row, profile, { account, name, enabled });
      syncContact(state, type, row);
      const has = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
      if (has) {
        db.prepare('UPDATE users SET account = ?, name = ?, enabled = ?, profile = ? WHERE id = ?')
          .run(account, name, enabled ? 1 : 0, JSON.stringify(row), id);
        /* 密码留空 = 不修改，避免「编辑门店信息」把密码重置成初始值 */
        if (pwdPlain) db.prepare('UPDATE users SET pwd_hash = ? WHERE id = ?').run(bcrypt.hashSync(pwdPlain, 10), id);
      } else {
        /* 历史遗留：state 里有、users 里没有 → 顺手补建，否则永远登不进 */
        db.prepare('INSERT OR REPLACE INTO users (id,type,account,pwd_hash,name,enabled,profile) VALUES (?,?,?,?,?,?,?)')
          .run(id, type, account, bcrypt.hashSync(pwdPlain || DEFAULT_STORE_PWD, 10), name, enabled ? 1 : 0, JSON.stringify(row));
      }
    }
  }

  /* state 改了必须推进版本号，否则前端下次 PUT 会撞 409 */
  const nextVersion = st.version + 1;
  db.prepare("UPDATE state_doc SET version = ?, data = ?, updated_at = datetime('now','localtime'), updated_by = ? WHERE id = 1")
    .run(nextVersion, JSON.stringify(state), actor.id);

  log(actor.id, `admin.${type}.${mode}`, `${patch.account || id}`);
  return { ok: true, id, version: nextVersion, state };
}

app.post('/api/admin/store', requireAuth, (req, res) => {
  if (!req.actor.isAdmin) return res.status(403).json({ ok: false, msg: '没有管理员权限' });
  const { mode, id, patch } = req.body || {};
  const r = saveAccount(req.actor, 'store', mode, id, patch);
  if (!r.ok) return res.status(r.code).json(r);
  res.json({ ok: true, id: r.id, version: r.version, state: r.state });
});

app.post('/api/admin/hq', requireAuth, (req, res) => {
  if (!req.actor.isAdmin) return res.status(403).json({ ok: false, msg: '没有管理员权限' });
  const { mode, id, patch } = req.body || {};
  const r = saveAccount(req.actor, 'hq', mode, id, patch);
  if (!r.ok) return res.status(r.code).json(r);
  res.json({ ok: true, id: r.id, version: r.version, state: r.state });
});

/* 管理员重置密码：换店长时收回旧密码的唯一手段 */
app.post('/api/admin/password', requireAuth, (req, res) => {
  if (!req.actor.isAdmin) return res.status(403).json({ ok: false, msg: '没有管理员权限' });
  const { id, account, newPwd } = req.body || {};
  const pwd = String(newPwd || '').trim();
  if (pwd.length < 6) return res.status(400).json({ ok: false, msg: '新密码至少 6 位' });
  const row = id ? findUserById(id) : findUserByAccount(String(account || '').trim());
  if (!row) return res.status(404).json({ ok: false, msg: '账号不存在' });
  setPassword(row.id, pwd);
  log(req.actor.id, 'admin.pwd.reset', row.account);
  res.json({ ok: true, msg: `已重置 ${row.account} 的密码` });
});

/* ---------------- 任务完成记录：原子写（并发安全） ----------------
   为什么必须单独开接口：
     前端原来是「整份 state 覆盖 + 版本锁」，两家门店同时提交时，
     后写的那个会 409 并把先写的记录覆盖掉 → 实测丢数据。
   这里改成本服务端直接改 records 一条，Node 单线程 + better-sqlite3 同步写，
   两个请求天然串行，不存在读-改-写交错。 */
const _p2 = (n) => String(n).padStart(2, '0');
const _ymd = (d) => `${d.getFullYear()}-${_p2(d.getMonth() + 1)}-${_p2(d.getDate())}`;
const _startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const _addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const _startOfWeek = (d) => { const x = _startOfDay(d); const wd = (x.getDay() + 6) % 7; return _addDays(x, -wd); };
const _atTime = (dateStr, timeStr) => {
  const [y, m, dd] = dateStr.split('-').map(Number);
  const [hh, mm] = String(timeStr || '00:00').split(':').map(Number);
  return new Date(y, m - 1, dd, hh || 0, mm || 0, 0, 0);
};
/** 与前端 store.js 的 occDue 保持一致：算出某个任务在某天的截止时刻 */
function occDue(task, date) {
  const d = _startOfDay(date);
  if (task.cycle === 'daily') return _atTime(_ymd(d), task.time);
  if (task.cycle === 'weekly') return _atTime(_ymd(_addDays(_startOfWeek(d), (task.weekday || 7) - 1)), task.time);
  if (task.cycle === 'monthly') {
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return _atTime(_ymd(new Date(d.getFullYear(), d.getMonth(), Math.min(task.monthDay || 1, last))), task.time);
  }
  return new Date(task.deadline);
}
const _recId = () => 'R' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* 提交/修改完成：只动 records 这一条 */
app.post('/api/record/submit', requireAuth, (req, res) => {
  if (!req.actor.isStore) return res.status(403).json({ ok: false, msg: '只有门店账号可以提交任务' });
  const { taskId, periodKey, text, images, links } = req.body || {};
  if (!taskId || !periodKey) return res.status(400).json({ ok: false, msg: '缺少任务或周期标识' });
  if (!String(text || '').trim()) return res.status(400).json({ ok: false, msg: '请填写完成说明' });

  const storeId = req.actor.id;
  const st = getState();
  if (!st) return res.status(500).json({ ok: false, msg: '数据未初始化' });
  const state = st.state;
  const task = (state.tasks || []).find((t) => t.id === taskId);
  if (!task || task.status !== 'active') return res.status(404).json({ ok: false, msg: '任务不存在或已停止' });
  if (!task.storeIds.includes(storeId)) return res.status(403).json({ ok: false, msg: '该任务没有派给你的门店' });

  const key = String(periodKey);
  const due = occDue(task, new Date());
  const nowIso = new Date().toISOString();
  const late = new Date(nowIso).getTime() > due.getTime() + 60000;
  const payload = {
    text: String(text).trim(),
    images: Array.isArray(images) ? images.slice(0, 6) : [],
    links: Array.isArray(links) ? links.slice(0, 6) : [],
  };

  if (!Array.isArray(state.records)) state.records = [];
  const idx = state.records.findIndex((r) => r.taskId === taskId && r.storeId === storeId && r.periodKey === key);
  let rec;
  if (idx >= 0) {
    rec = state.records[idx];
    Object.assign(rec, payload, { doneAt: nowIso, late, editedAt: nowIso });
  } else {
    rec = Object.assign({
      id: _recId(), taskId, storeId, periodKey: key, due: due.toISOString(),
      doneAt: nowIso, late, by: req.actor.mgr || req.actor.name || '',
    }, payload);
    state.records.push(rec);
  }

  const next = st.version + 1;
  db.prepare("UPDATE state_doc SET version = ?, data = ?, updated_at = datetime('now','localtime'), updated_by = ? WHERE id = 1")
    .run(next, JSON.stringify(state), req.actor.id);
  log(req.actor.id, 'record.submit', `${taskId}/${key}${late ? ' 逾期' : ''}`);
  res.json({ ok: true, record: rec, version: next });
});

/* 撤销完成 */
app.post('/api/record/revoke', requireAuth, (req, res) => {
  if (!req.actor.isStore) return res.status(403).json({ ok: false, msg: '只有门店账号可以撤销提交' });
  const { taskId, periodKey } = req.body || {};
  if (!taskId || !periodKey) return res.status(400).json({ ok: false, msg: '缺少任务或周期标识' });

  const st = getState();
  if (!st) return res.status(500).json({ ok: false, msg: '数据未初始化' });
  const state = st.state;
  const before = (state.records || []).length;
  state.records = (state.records || []).filter(
    (r) => !(r.taskId === taskId && r.storeId === req.actor.id && r.periodKey === String(periodKey))
  );
  if (state.records.length === before) return res.status(404).json({ ok: false, msg: '没有找到这条提交记录' });

  const next = st.version + 1;
  db.prepare("UPDATE state_doc SET version = ?, data = ?, updated_at = datetime('now','localtime'), updated_by = ? WHERE id = 1")
    .run(next, JSON.stringify(state), req.actor.id);
  log(req.actor.id, 'record.revoke', `${taskId}/${periodKey}`);
  res.json({ ok: true, version: next });
});

/* ---------------- 任务批量导入（独立模块，代码全在 import-module/ 里） ---------------- */
require('../import-module')(app, { requireAuth, getState, saveState, log });

/* ---------------- 静态前端 ---------------- */
/* 开发/迭代期不缓存 JS/CSS，避免浏览器拿旧文件；HTML 也设 no-cache */
app.use(express.static(WEB_DIR, {
  extensions: ['html'],
  setHeaders: (res, filePath) => {
    if (/\.(js|css|html)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get('/', (req, res) => res.sendFile(path.join(WEB_DIR, 'index.html')));

/* ---------------- 启动 ---------------- */
const info = seedIfEmpty();
app.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  console.log(`[cwsj] 服务已启动  http://0.0.0.0:${PORT}`);
  console.log(`[cwsj] 静态前端    ${WEB_DIR}`);
  console.log(`[cwsj] 数据库      ${DB_PATH}`);
  console.log(`[cwsj] 种子导入    ${info.seeded ? `完成（门店 ${info.stores} / 总部 ${info.hq}）` : '已有数据，跳过'}`);
});
