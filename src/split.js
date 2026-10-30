'use strict';
/* 拆表读写层（2026-10-30，仅测试环境启用）
   readState()      : 从各表拼回前端熟悉的结构（tasks/demands/records/contacts/stores + 配置）
   syncToTables()   : 把整份 state 同步回各表（写路径仍走 state_doc，这里做镜像）
   tableCounts()    : 核对用，返回各表条数 */

const path = require('path');
const S = require(path.join(__dirname, 'db.js'));
const db = S.db;

const DDL = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, title TEXT, cycle TEXT, status TEXT, dept TEXT, creator_id TEXT,
  start_date TEXT, stop_date TEXT, deadline TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT, payload_json TEXT);
CREATE TABLE IF NOT EXISTS demands (
  id TEXT PRIMARY KEY, code TEXT, store_id TEXT, title TEXT, status TEXT, assign_to TEXT,
  archived_at TEXT, deleted_at TEXT, created_at TEXT, updated_at TEXT, payload_json TEXT);
CREATE TABLE IF NOT EXISTS task_records (
  id TEXT PRIMARY KEY, task_id TEXT, store_id TEXT, occ_key TEXT, status TEXT,
  submitted_at TEXT, updated_at TEXT, payload_json TEXT);
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY, name TEXT, dept TEXT, phone TEXT, title TEXT,
  updated_at TEXT, deleted_at TEXT, payload_json TEXT);
CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY, name TEXT, city TEXT, region_id TEXT, account TEXT, updated_at TEXT, payload_json TEXT);
CREATE TABLE IF NOT EXISTS config_kv (k TEXT PRIMARY KEY, v_json TEXT, updated_at TEXT);
`;

function ensureSchema() { db.exec(DDL); }

function hasTables() {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").get();
  if (!row) return false;
  return db.prepare('SELECT COUNT(*) c FROM tasks').get().c > 0;
}

function getConfig(k, fallback) {
  const row = db.prepare('SELECT v_json FROM config_kv WHERE k = ?').get(k);
  if (!row) return fallback;
  try { return JSON.parse(row.v_json); } catch (e) { return fallback; }
}

/* 从表拼回原结构；payload_json 里存了完整对象，优先用它，保证字段不丢 */
function readState() {
  ensureSchema();
  const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };

  const tasks = db.prepare('SELECT payload_json FROM tasks ORDER BY created_at DESC').all()
    .map(r => parse(r.payload_json)).filter(Boolean);
  const demands = db.prepare('SELECT payload_json FROM demands ORDER BY created_at DESC').all()
    .map(r => parse(r.payload_json)).filter(Boolean);
  const records = db.prepare('SELECT payload_json FROM task_records').all()
    .map(r => parse(r.payload_json)).filter(Boolean);
  const contacts = db.prepare('SELECT payload_json FROM contacts ORDER BY name').all()
    .map(r => parse(r.payload_json)).filter(Boolean);
  const stores = db.prepare('SELECT payload_json FROM stores ORDER BY id').all()
    .map(r => parse(r.payload_json)).filter(Boolean);

  return {
    tasks: tasks,
    demands: demands,
    records: records,
    contacts: contacts,
    stores: stores,
    regions: getConfig('regions', []),
    departments: getConfig('departments', []),
    hq: getConfig('hq', []),
    assessCfg: getConfig('assessCfg', null),
  };
}

function upsert(table, cols, row) {
  const ph = cols.map(() => '?').join(',');
  const set = cols.filter(c => c !== 'id').map(c => c + '=excluded.' + c).join(',');
  db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${ph})
              ON CONFLICT(id) DO UPDATE SET ${set}`)
    .run(...cols.map(c => row[c] === undefined ? null : row[c]));
}

/* 整份同步：先删掉表里多出来的行，再 upsert（保证与 state 完全一致） */
function syncToTables(state) {
  ensureSchema();
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    const tasks = state.tasks || [];
    const ids = tasks.map(t => t.id);
    if (ids.length) {
      db.prepare(`DELETE FROM tasks WHERE id NOT IN (${ids.map(() => '?').join(',')})`).run(...ids);
    } else {
      db.prepare('DELETE FROM tasks').run();
    }
    tasks.forEach(t => upsert('tasks',
      ['id', 'title', 'cycle', 'status', 'dept', 'creator_id', 'start_date', 'stop_date', 'deadline', 'created_at', 'updated_at', 'deleted_at', 'payload_json'],
      {
        id: t.id, title: t.title, cycle: t.cycle, status: t.status, dept: t.dept,
        creator_id: t.creatorId, start_date: t.startDate || null, stop_date: t.stopDate || null,
        deadline: t.deadline || null, created_at: t.createdAt || null,
        updated_at: t.updatedAt || now, deleted_at: t.deletedAt || null,
        payload_json: JSON.stringify(t),
      }));

    const demands = state.demands || [];
    const dids = demands.map(d => d.id);
    if (dids.length) {
      db.prepare(`DELETE FROM demands WHERE id NOT IN (${dids.map(() => '?').join(',')})`).run(...dids);
    } else {
      db.prepare('DELETE FROM demands').run();
    }
    demands.forEach(d => upsert('demands',
      ['id', 'code', 'store_id', 'title', 'status', 'assign_to', 'archived_at', 'deleted_at', 'created_at', 'updated_at', 'payload_json'],
      {
        id: d.id, code: d.code || null, store_id: d.storeId || null, title: d.title || null,
        status: d.status || null, assign_to: (d.assign && d.assign.toId) || null,
        archived_at: d.archivedAt || null, deleted_at: d.deletedAt || null,
        created_at: d.createdAt || null, updated_at: d.updatedAt || now,
        payload_json: JSON.stringify(d),
      }));

    const records = state.records || [];
    const rids = records.map(r => r.id || (r.taskId + '|' + r.storeId + '|' + (r.key || '')));
    if (rids.length) {
      db.prepare(`DELETE FROM task_records WHERE id NOT IN (${rids.map(() => '?').join(',')})`).run(...rids);
    } else {
      db.prepare('DELETE FROM task_records').run();
    }
    records.forEach(r => upsert('task_records',
      ['id', 'task_id', 'store_id', 'occ_key', 'status', 'submitted_at', 'updated_at', 'payload_json'],
      {
        id: r.id || (r.taskId + '|' + r.storeId + '|' + (r.key || '')), task_id: r.taskId, store_id: r.storeId,
        occ_key: r.key || null, status: r.status || null,
        submitted_at: r.submittedAt || r.at || null, updated_at: r.updatedAt || now,
        payload_json: JSON.stringify(r),
      }));

    const contacts = state.contacts || [];
    const cids = contacts.map(c => c.id);
    if (cids.length) {
      db.prepare(`DELETE FROM contacts WHERE id NOT IN (${cids.map(() => '?').join(',')})`).run(...cids);
    } else {
      db.prepare('DELETE FROM contacts').run();
    }
    contacts.forEach(c => upsert('contacts',
      ['id', 'name', 'dept', 'phone', 'title', 'updated_at', 'deleted_at', 'payload_json'],
      {
        id: c.id, name: c.name || null, dept: c.dept || null, phone: c.phone || c.tel || null,
        title: c.title || null, updated_at: c.updatedAt || now, deleted_at: c.deletedAt || null,
        payload_json: JSON.stringify(c),
      }));

    const stores = state.stores || [];
    const sids = stores.map(s => s.id);
    if (sids.length) {
      db.prepare(`DELETE FROM stores WHERE id NOT IN (${sids.map(() => '?').join(',')})`).run(...sids);
    } else {
      db.prepare('DELETE FROM stores').run();
    }
    stores.forEach(s => upsert('stores',
      ['id', 'name', 'city', 'region_id', 'account', 'updated_at', 'payload_json'],
      {
        id: s.id, name: s.name || null, city: s.city || null, region_id: s.regionId || null,
        account: s.account || null, updated_at: s.updatedAt || now,
        payload_json: JSON.stringify(s),
      }));

    const kv = {
      assessCfg: state.assessCfg, departments: state.departments, regions: state.regions,
      hq: state.hq, meta: { syncedAt: now },
    };
    Object.keys(kv).forEach(k => {
      db.prepare(`INSERT INTO config_kv (k, v_json, updated_at) VALUES (?,?,?)
                  ON CONFLICT(k) DO UPDATE SET v_json=excluded.v_json, updated_at=excluded.updated_at`)
        .run(k, JSON.stringify(kv[k] === undefined ? null : kv[k]), now);
    });
  });
  tx();
}

function tableCounts() {
  ensureSchema();
  const one = (t) => db.prepare('SELECT COUNT(*) c FROM ' + t).get().c;
  return {
    tasks: one('tasks'), demands: one('demands'), records: one('task_records'),
    contacts: one('contacts'), stores: one('stores'), config: one('config_kv'),
  };
}

module.exports = { readState, syncToTables, tableCounts, hasTables, ensureSchema };
