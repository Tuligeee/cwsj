'use strict';
/* 整库快照与回滚（2026-10-30，测试环境）
   - 每次保存后写一份快照，只保留最近 60 份
   - 管理员可列出快照、恢复到任意版本（恢复本身也生成新版本并记审计）
   - 单条恢复依赖 change_log（下一步） */

const S = require('./db.js');
const db = S.db;
const KEEP = 60;

db.exec(`
CREATE TABLE IF NOT EXISTS state_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER,
  actor TEXT,
  summary TEXT,
  size INTEGER,
  data_json TEXT,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_snap_version ON state_snapshots(version);
`);

const insertSnap = () => db.prepare('INSERT INTO state_snapshots (version, actor, summary, size, data_json, created_at) VALUES (?,?,?,?,?,?)');
const listSnaps = () => db.prepare('SELECT id, version, actor, summary, size, created_at FROM state_snapshots ORDER BY id DESC LIMIT ?');

function snapshot(state, version, actor, summary) {
  let json;
  try { json = JSON.stringify(state); } catch (e) { return; }
  const info = {
    tasks: (state.tasks || []).length,
    demands: (state.demands || []).length,
    records: (state.records || []).length,
    contacts: (state.contacts || []).length,
  };
  const text = summary || ('任务 ' + info.tasks + ' · 提需 ' + info.demands + ' · 记录 ' + info.records + ' · 联系人 ' + info.contacts);
  insertSnap().run(version, actor || '', text, json.length, json, new Date().toISOString());
  // 只保留最近 KEEP 份
  db.prepare('DELETE FROM state_snapshots WHERE id NOT IN (SELECT id FROM state_snapshots ORDER BY id DESC LIMIT ?)').run(KEEP);
}

function list(limit) {
  return listSnaps().all(limit || 60);
}

function get(id) {
  return db.prepare('SELECT * FROM state_snapshots WHERE id = ?').get(id);
}

/* 恢复到某个快照：把快照内容写成新的 state 版本 */
function restore(id, actorId) {
  const row = get(id);
  if (!row) return { ok: false, msg: '快照不存在' };
  let data;
  try { data = JSON.parse(row.data_json); } catch (e) { return { ok: false, msg: '快照内容损坏' }; }
  const st = S.getState();
  if (!st) return { ok: false, msg: '数据未初始化' };
  const r = S.saveState(data, st.version, actorId || 'restore');
  if (!r.ok) return { ok: false, msg: r.code === 'VERSION_CONFLICT' ? '数据已被他人更新，请稍后重试' : '恢复失败' };
  try { snapshot(data, r.version, actorId || 'restore', '回滚后快照（来源 #' + id + ' v' + row.version + '）'); } catch (e) {}
  return { ok: true, version: r.version, from: row.version };
}

function register(app, requireAuth, log) {
  app.get('/api/snapshots', requireAuth, (req, res) => {
    if (!req.actor.isAdmin) return res.status(403).json({ ok: false, msg: '只有管理员可以查看快照' });
    res.json({ ok: true, rows: list(60), keep: KEEP });
  });

  app.post('/api/snapshots', requireAuth, (req, res) => {
    if (!req.actor.isAdmin) return res.status(403).json({ ok: false, msg: '只有管理员可以创建快照' });
    const st = S.getState();
    if (!st) return res.status(500).json({ ok: false, msg: '数据未初始化' });
    snapshot(st.state, st.version, req.actor.id, (req.body || {}).summary || '手动快照');
    log(req.actor.id, 'snapshot.create', 'v' + st.version);
    res.json({ ok: true });
  });

  app.post('/api/snapshots/:id/restore', requireAuth, (req, res) => {
    if (!req.actor.isAdmin) return res.status(403).json({ ok: false, msg: '只有管理员可以回滚' });
    const r = restore(req.params.id, req.actor.id);
    if (!r.ok) return res.status(400).json({ ok: false, msg: r.msg });
    const st = S.getState();
    try { require('./split.js').syncToTables(st.state); } catch (e) {}
    log(req.actor.id, 'snapshot.restore', '#' + req.params.id + ' v' + r.from + ' → v' + r.version);
    res.json({ ok: true, version: r.version, from: r.from });
  });
}

module.exports = { register, snapshot, list, get, restore };
