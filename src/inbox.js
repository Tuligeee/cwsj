'use strict';
/* 站内平台消息（inbox）—— 2026-10-30
   与钉钉提醒共用同一套事件（A/B/C），只多一个"站内"通道：
   - 每个人的收件箱只包含 person_id = 自己 的记录（服务端过滤，天然按权限隔离）
   - 未读角标 = 未读条数
   - 点开即标记已读，并跳转到对应任务/提需（深链接）
*/

const S = require('./db.js');
const db = S.db;

db.exec(`
CREATE TABLE IF NOT EXISTS inbox (
  event_key TEXT NOT NULL,
  person_id TEXT NOT NULL,
  scenario TEXT,
  entity_id TEXT,
  title TEXT,
  body TEXT,
  hash TEXT,
  created_at TEXT,
  read_at TEXT,
  PRIMARY KEY (event_key, person_id)
);
CREATE INDEX IF NOT EXISTS idx_inbox_person ON inbox(person_id, read_at);
`);

const KEEP_PER_PERSON = 300;

/* 把提醒引擎算出的候选写进站内收件箱（幂等：同一事件同一个人只留一条） */
function ingest(rows) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  const now = new Date().toISOString();
  const ins = db.prepare(`INSERT OR IGNORE INTO inbox
    (event_key, person_id, scenario, entity_id, title, body, hash, created_at, read_at)
    VALUES (?,?,?,?,?,?,?,?,NULL)`);
  let n = 0;
  const tx = db.transaction(() => {
    rows.forEach(r => {
      if (!r || !r.to || !r.to.id) return;
      const info = ins.run(r.key, r.to.id, r.scenario, r.entityId, r.title, r.body, r.hash || '', now);
      n += info.changes;
    });
    /* 每人只保留最近 300 条 */
    db.prepare(`DELETE FROM inbox WHERE rowid NOT IN (
      SELECT rowid FROM (SELECT rowid, person_id, ROW_NUMBER() OVER (PARTITION BY person_id ORDER BY created_at DESC) rn FROM inbox) WHERE rn <= ?
    )`).run(KEEP_PER_PERSON);
  });
  tx();
  return n;
}

function list(personId, limit) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  return db.prepare(`SELECT event_key, scenario, entity_id, title, body, hash, created_at, read_at
                     FROM inbox WHERE person_id = ? ORDER BY created_at DESC LIMIT ?`).all(personId, lim);
}

function unread(personId) {
  return db.prepare('SELECT COUNT(*) c FROM inbox WHERE person_id = ? AND read_at IS NULL').get(personId).c;
}

function markRead(personId, keys) {
  const now = new Date().toISOString();
  if (!Array.isArray(keys) || !keys.length) {
    return db.prepare('UPDATE inbox SET read_at = ? WHERE person_id = ? AND read_at IS NULL').run(now, personId).changes;
  }
  let n = 0;
  const st = db.prepare('UPDATE inbox SET read_at = ? WHERE person_id = ? AND event_key = ? AND read_at IS NULL');
  keys.forEach(k => { n += st.run(now, personId, k).changes; });
  return n;
}

function register(app, requireAuth) {
  app.get('/api/inbox', requireAuth, (req, res) => {
    res.json({
      ok: true,
      unread: unread(req.actor.id),
      rows: list(req.actor.id, req.query.limit),
    });
  });

  app.get('/api/inbox/unread', requireAuth, (req, res) => {
    res.json({ ok: true, unread: unread(req.actor.id) });
  });

  app.post('/api/inbox/read', requireAuth, (req, res) => {
    const keys = (req.body || {}).keys;
    const n = markRead(req.actor.id, keys);
    res.json({ ok: true, updated: n, unread: unread(req.actor.id) });
  });
}

module.exports = { ingest, list, unread, markRead, register };
