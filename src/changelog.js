'use strict';
/* 改动日志与单条恢复（2026-10-30，测试环境）
   - 每次写入前抓一份 {tasks, demands, contacts} 的浅快照
   - 写入后自动比对，逐条记录 before/after（新增、修改、删除）
   - 管理员可按"某一条改动"恢复，不影响其它数据 */

const S = require('./db.js');
const db = S.db;

db.exec(`
CREATE TABLE IF NOT EXISTS change_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT, entity_id TEXT, action TEXT,
  before_json TEXT, after_json TEXT,
  actor TEXT, at TEXT
);
CREATE INDEX IF NOT EXISTS idx_change_entity ON change_log(entity, entity_id);
`);

function capture(state) {
  const pick = (arr) => (arr || []).map(x => [x.id, JSON.stringify(x)]);
  return {
    tasks: new Map(pick(state.tasks)),
    demands: new Map(pick(state.demands)),
    contacts: new Map(pick(state.contacts)),
  };
}

const insert = () => db.prepare(
  'INSERT INTO change_log (entity, entity_id, action, before_json, after_json, actor, at) VALUES (?,?,?,?,?,?,?)');

function commit(before, state, actorId) {
  const now = new Date().toISOString();
  const rows = [];
  const scan = (entity, arr) => {
    const prev = before[entity] || new Map();
    const seen = new Set();
    (arr || []).forEach(x => {
      seen.add(x.id);
      const nowJson = JSON.stringify(x);
      const oldJson = prev.get(x.id);
      if (!oldJson) rows.push([entity, x.id, 'create', null, nowJson]);
      else if (oldJson !== nowJson) rows.push([entity, x.id, 'update', oldJson, nowJson]);
    });
    prev.forEach((oldJson, id) => {
      if (!seen.has(id)) rows.push([entity, id, 'delete', oldJson, null]);
    });
  };
  scan('tasks', state.tasks);
  scan('demands', state.demands);
  scan('contacts', state.contacts);
  if (!rows.length) return 0;
  const tx = db.transaction(() => {
    const stmt = insert();
    rows.forEach(r => stmt.run(r[0], r[1], r[2], r[3], r[4], actorId || '', now));
    // 只保留最近 2000 条
    db.prepare('DELETE FROM change_log WHERE id NOT IN (SELECT id FROM change_log ORDER BY id DESC LIMIT 2000)').run();
  });
  tx();
  return rows.length;
}

function list(limit, entity) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  if (entity) {
    return db.prepare('SELECT id, entity, entity_id, action, actor, at FROM change_log WHERE entity=? ORDER BY id DESC LIMIT ?').all(entity, lim);
  }
  return db.prepare('SELECT id, entity, entity_id, action, actor, at FROM change_log ORDER BY id DESC LIMIT ?').all(lim);
}

function getLog(id) {
  return db.prepare('SELECT * FROM change_log WHERE id = ?').get(id);
}

/* 恢复到这条改动的"改前"状态：改前不存在 → 删掉；存在 → 覆盖回去 */
function restoreOne(logId, actorId) {
  const row = getLog(logId);
  if (!row) return { ok: false, msg: '记录不存在' };
  const st = S.getState();
  if (!st) return { ok: false, msg: '数据未初始化' };
  const state = st.state;
  const key = row.entity === 'tasks' ? 'tasks' : row.entity === 'demands' ? 'demands' : row.entity === 'contacts' ? 'contacts' : null;
  if (!key) return { ok: false, msg: '不支持的类型' };

  state[key] = state[key] || [];
  const idx = state[key].findIndex(x => x.id === row.entity_id);
  const before = row.before_json ? JSON.parse(row.before_json) : null;

  if (row.action === 'create') {
    if (idx >= 0) state[key].splice(idx, 1);
  } else if (before) {
    if (idx >= 0) state[key][idx] = before;
    else state[key].unshift(before);
  } else {
    return { ok: false, msg: '这条记录没有可恢复的内容' };
  }

  const r = S.saveState(state, st.version, actorId || 'restore');
  if (!r.ok) return { ok: false, msg: r.code === 'VERSION_CONFLICT' ? '数据已被他人更新，请重试' : '恢复失败' };
  try { require('./split.js').syncToTables(state); } catch (e) {}
  try { require('./snapshots').snapshot(state, r.version, actorId || 'restore', '单条恢复 #' + logId); } catch (e) {}
  return { ok: true, version: r.version, entity: row.entity, entityId: row.entity_id, action: row.action };
}

function register(app, requireAuth, log) {
  app.get('/api/changes', requireAuth, (req, res) => {
    if (!req.actor.isAdmin) return res.status(403).json({ ok: false, msg: '只有管理员可以查看改动记录' });
    res.json({ ok: true, rows: list(req.query.limit, req.query.entity) });
  });

  app.post('/api/changes/:id/restore', requireAuth, (req, res) => {
    if (!req.actor.isAdmin) return res.status(403).json({ ok: false, msg: '只有管理员可以恢复' });
    const r = restoreOne(req.params.id, req.actor.id);
    if (!r.ok) return res.status(400).json({ ok: false, msg: r.msg });
    log(req.actor.id, 'change.restore', r.entity + '/' + r.entityId + ' ' + r.action);
    res.json({ ok: true, version: r.version, entity: r.entity, entityId: r.entityId, action: r.action });
  });
}

module.exports = { register, capture, commit, list, getLog, restoreOne };
