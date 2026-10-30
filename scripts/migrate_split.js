'use strict';
/* 拆表迁移（2026-10-30）
   把 state_doc 里的整份 JSON 拆进独立表；state_doc 原样保留，作为回退依据。
   幂等：可重复执行，按主键 upsert。
   用法：node scripts/migrate_split.js [--dry-run] */

const path = require('path');
const S = require(path.join(__dirname, '..', 'src', 'db.js'));

const DRY = process.argv.includes('--dry-run');
const db = S.db;

const DDL = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT,
  cycle TEXT,
  status TEXT,
  dept TEXT,
  creator_id TEXT,
  start_date TEXT,
  stop_date TEXT,
  deadline TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  payload_json TEXT
);
CREATE TABLE IF NOT EXISTS demands (
  id TEXT PRIMARY KEY,
  code TEXT,
  store_id TEXT,
  title TEXT,
  status TEXT,
  assign_to TEXT,
  archived_at TEXT,
  deleted_at TEXT,
  created_at TEXT,
  updated_at TEXT,
  payload_json TEXT
);
CREATE TABLE IF NOT EXISTS task_records (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  store_id TEXT,
  occ_key TEXT,
  status TEXT,
  submitted_at TEXT,
  updated_at TEXT,
  payload_json TEXT
);
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT,
  dept TEXT,
  phone TEXT,
  title TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  payload_json TEXT
);
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT,
  city TEXT,
  region_id TEXT,
  account TEXT,
  updated_at TEXT,
  payload_json TEXT
);
CREATE TABLE IF NOT EXISTS config_kv (
  k TEXT PRIMARY KEY,
  v_json TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_records_task ON task_records(task_id, store_id);
CREATE INDEX IF NOT EXISTS idx_demands_store ON demands(store_id, status);
`;

function upsert(table, cols, row) {
  const ph = cols.map(() => '?').join(',');
  const set = cols.filter(c => c !== 'id').map(c => c + '=excluded.' + c).join(',');
  const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${ph})
               ON CONFLICT(id) DO UPDATE SET ${set}`;
  db.prepare(sql).run(...cols.map(c => row[c] === undefined ? null : row[c]));
}

function main() {
  const st = S.getState();
  if (!st || !st.state) throw new Error('state_doc 为空，无法迁移');
  const data = st.state;
  const now = new Date().toISOString();

  const tasks = data.tasks || [];
  const demands = data.demands || [];
  const records = data.records || [];
  const contacts = data.contacts || [];
  const stores = data.stores || [];

  console.log('迁移前 JSON 条数：', JSON.stringify({
    tasks: tasks.length, demands: demands.length, records: records.length,
    contacts: contacts.length, stores: stores.length,
  }));

  if (DRY) {
    console.log('dry-run：只打印，不写库');
    return;
  }

  db.exec(DDL);

  const tx = db.transaction(() => {
    tasks.forEach(t => upsert('tasks',
      ['id', 'title', 'cycle', 'status', 'dept', 'creator_id', 'start_date', 'stop_date', 'deadline', 'created_at', 'updated_at', 'deleted_at', 'payload_json'],
      {
        id: t.id, title: t.title, cycle: t.cycle, status: t.status, dept: t.dept,
        creator_id: t.creatorId, start_date: t.startDate || null, stop_date: t.stopDate || null,
        deadline: t.deadline || null, created_at: t.createdAt || null,
        updated_at: t.updatedAt || now, deleted_at: t.deletedAt || null,
        payload_json: JSON.stringify(t),
      }));

    demands.forEach(d => upsert('demands',
      ['id', 'code', 'store_id', 'title', 'status', 'assign_to', 'archived_at', 'deleted_at', 'created_at', 'updated_at', 'payload_json'],
      {
        id: d.id, code: d.code || null, store_id: d.storeId || null, title: d.title || null,
        status: d.status || null, assign_to: (d.assign && d.assign.toId) || null,
        archived_at: d.archivedAt || null, deleted_at: d.deletedAt || null,
        created_at: d.createdAt || null, updated_at: d.updatedAt || now,
        payload_json: JSON.stringify(d),
      }));

    records.forEach(r => upsert('task_records',
      ['id', 'task_id', 'store_id', 'occ_key', 'status', 'submitted_at', 'updated_at', 'payload_json'],
      {
        id: r.id || (r.taskId + '|' + r.storeId + '|' + (r.key || '')), task_id: r.taskId, store_id: r.storeId,
        occ_key: r.key || null, status: r.status || null,
        submitted_at: r.submittedAt || r.at || null, updated_at: r.updatedAt || now,
        payload_json: JSON.stringify(r),
      }));

    contacts.forEach(c => upsert('contacts',
      ['id', 'name', 'dept', 'phone', 'title', 'updated_at', 'deleted_at', 'payload_json'],
      {
        id: c.id, name: c.name || null, dept: c.dept || null, phone: c.phone || c.tel || null,
        title: c.title || null, updated_at: c.updatedAt || now, deleted_at: c.deletedAt || null,
        payload_json: JSON.stringify(c),
      }));

    stores.forEach(s => upsert('stores',
      ['id', 'name', 'city', 'region_id', 'account', 'updated_at', 'payload_json'],
      {
        id: s.id, name: s.name || null, city: s.city || null, region_id: s.regionId || null,
        account: s.account || null, updated_at: s.updatedAt || now,
        payload_json: JSON.stringify(s),
      }));

    /* 配置类：不影响业务主数据，但 bootstrap 需要 */
    const kv = { assessCfg: data.assessCfg, departments: data.departments, regions: data.regions, hq: data.hq, meta: { migratedAt: now, sourceVersion: st.version } };
    Object.keys(kv).forEach(k => {
      db.prepare(`INSERT INTO config_kv (k, v_json, updated_at) VALUES (?,?,?)
                  ON CONFLICT(k) DO UPDATE SET v_json=excluded.v_json, updated_at=excluded.updated_at`)
        .run(k, JSON.stringify(kv[k] === undefined ? null : kv[k]), now);
    });
  });
  tx();

  const counts = {
    tasks: db.prepare('SELECT COUNT(*) c FROM tasks').get().c,
    demands: db.prepare('SELECT COUNT(*) c FROM demands').get().c,
    records: db.prepare('SELECT COUNT(*) c FROM task_records').get().c,
    contacts: db.prepare('SELECT COUNT(*) c FROM contacts').get().c,
    stores: db.prepare('SELECT COUNT(*) c FROM stores').get().c,
    config: db.prepare('SELECT COUNT(*) c FROM config_kv').get().c,
  };
  console.log('迁移后表内条数：', JSON.stringify(counts));

  const ok = counts.tasks === tasks.length && counts.demands === demands.length
    && counts.records === records.length && counts.contacts === contacts.length
    && counts.stores === stores.length;
  console.log(ok ? '核对结果：全部一致 ✅' : '核对结果：不一致 ❌');
  if (!ok) process.exitCode = 1;
}

main();
