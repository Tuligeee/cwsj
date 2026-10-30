/* =========================================================
   db.js — SQLite 初始化与种子导入
   设计取舍（阶段 1）：
   - users 表：只存登录相关（账号 / 密码哈希 / 角色），独立可查
   - state_doc 表：整个业务数据存一列 JSON，配 version 乐观锁
     好处：前端 loadState/saveState 两个出口直接对接，零信息损失
     代价：整份覆盖写，靠 version 冲突检测防止"后写覆盖先写"
   阶段 2 再按需拆表（tasks / records / demands 各自成表）
   ========================================================= */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { buildSeedState } = require('./seedState');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'cwsj.db');
const SEED_PATH = path.join(__dirname, '..', 'data', 'seed.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');   // 允许并发读，写不阻塞读
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id        TEXT PRIMARY KEY,
  type      TEXT NOT NULL CHECK (type IN ('store','hq')),
  account   TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pwd_hash  TEXT NOT NULL,
  name      TEXT NOT NULL,
  enabled   INTEGER NOT NULL DEFAULT 1,
  profile   TEXT NOT NULL,           -- JSON，不含密码
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS state_doc (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  version    INTEGER NOT NULL DEFAULT 1,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  userId TEXT,
  action TEXT,
  detail TEXT
);
`);

const DEFAULT_STORE_PWD = process.env.DEFAULT_STORE_PWD || 'Cwsj123456';

/** 首次启动或空库时导入种子 */
function seedIfEmpty() {
  const hasState = db.prepare('SELECT 1 FROM state_doc WHERE id = 1').get();
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  /* SEED_FORCE=1：只补写 state_doc（补任务/需求种子），不动已有账号与密码 */
  const FORCE = process.env.SEED_FORCE === '1';
  const keepUsers = FORCE && userCount > 0;
  if (!FORCE && hasState && userCount > 0) return { seeded: false };

  const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const stores = seed.STORE_SEED || [];
  const hqUsers = seed.HQ_SEED || [];
  const departments = seed.DEPARTMENTS || [];
  const hqPwd = seed.HQ_PWD || DEFAULT_STORE_PWD;
  /* 门店与总部用同一个初始密码；真实种子里写在 META.initPwd */
  const initPwd = (seed.META && seed.META.initPwd) || hqPwd;

  const CITY_REGION = { 苏州: '华东区', 南京: '华东区', 无锡: '华东区', 杭州: '华东区', 武汉: '华中区' };
  /* 真实种子带 REGIONS（一区~四区）；演示种子退回默认两区 */
  const regions = (seed.REGIONS && seed.REGIONS.length)
    ? seed.REGIONS
    : [{ id: 'RG1', name: '华东区' }, { id: 'RG2', name: '华中区' }];

  /* 密码只进 users.pwd_hash，profile JSON 里绝不能带 pwd（会随 bootstrap 发到前端） */
  const stripPwd = (o) => { const c = Object.assign({}, o); delete c.pwd; delete c.password; return c; };

  const storeRows = stores.map((s) => stripPwd({
    ...s,
    type: 'store',
    account: s.account || s.code,
    regionId: s.regionId || (regions.find((r) => r.name === (CITY_REGION[s.city] || '')) || {}).id || null,
    enabled: s.enabled !== false,
  }));
  const hqRows = hqUsers.map((u) => stripPwd({
    ...u,
    type: 'hq',
    account: u.account || u.id,
    enabled: u.enabled !== false,
  }));

  /* 补种模式下用 OR IGNORE：已有账号（含已改过的密码）原样保留，只补缺失的人 */
  const insUser = db.prepare(
    (keepUsers
      ? 'INSERT OR IGNORE INTO users (id,type,account,pwd_hash,name,enabled,profile) VALUES (?,?,?,?,?,?,?)'
      : 'INSERT OR REPLACE INTO users (id,type,account,pwd_hash,name,enabled,profile) VALUES (?,?,?,?,?,?,?)')
  );
  const tx = db.transaction(() => {
    for (const s of storeRows) {
      insUser.run(s.id, 'store', s.account, bcrypt.hashSync(initPwd, 10), s.name, s.enabled ? 1 : 0, JSON.stringify(s));
    }
    for (const u of hqRows) {
      insUser.run(u.id, 'hq', u.account, bcrypt.hashSync(hqPwd, 10), u.name, u.enabled ? 1 : 0, JSON.stringify(u));
    }
    /* 示例业务数据（任务/记录/需求）只在 SEED_BIZ=demo 时导入。
       真实模式必须为空：示例任务的 storeIds 指向虚构门店，混进真实门店会串数据。 */
    let biz = null;
    if (process.env.SEED_BIZ === 'demo') {
      try {
        biz = buildSeedState();
        if (biz.stores.length !== storeRows.length || biz.hq.length !== hqRows.length) {
          console.warn(`[seed] 前后端人员数量不一致：前端 ${biz.stores.length}店/${biz.hq.length}人，users 表 ${storeRows.length}店/${hqRows.length}人`);
        }
      } catch (e) {
        console.warn('[seed] 复用前端种子失败，回退空集合：' + e.message);
      }
    }

    const state = {
      meta: { version: 'v1', seededAt: new Date().toISOString(), source: (seed.META && seed.META.source) || 'demo' },
      regions: (biz && biz.regions.length) ? biz.regions : regions,
      stores: storeRows,
      hq: hqRows,
      departments: (biz && biz.departments.length) ? biz.departments : departments,
      tasks: (biz && biz.tasks) || [],
      records: (biz && biz.records) || [],
      demands: (biz && biz.demands) || [],
      contacts: (biz && biz.contacts) || [],
      assessCfg: (biz && biz.assessCfg) || seed.ASSESS_DEFAULT || {
        mode: 'ratio', base: 100, completionWeight: 50, ontimeWeight: 30,
        lateSubmitDeduct: 2, overdueMissDeduct: 5, demandOverdueDeduct: 5, demandFailDeduct: 10, passLine: 60,
      },
    };
    db.prepare('INSERT OR REPLACE INTO state_doc (id,version,data,updated_by) VALUES (1,1,?,?)')
      .run(JSON.stringify(state), 'seed');
  });
  tx();
  return {
    seeded: true, stores: storeRows.length, hq: hqRows.length,
    hqPwdIsDefault: hqPwd === DEFAULT_STORE_PWD,
  };
}

/* -------- 读写封装 -------- */
function getState() {
  const row = db.prepare('SELECT version,data,updated_at FROM state_doc WHERE id = 1').get();
  if (!row) return null;
  return { state: JSON.parse(row.data), version: row.version, updatedAt: row.updated_at };
}

function saveState(data, version, userId) {
  const cur = db.prepare('SELECT version FROM state_doc WHERE id = 1').get();
  if (!cur) return { ok: false, code: 'NO_STATE' };
  if (Number(version) !== cur.version) return { ok: false, code: 'VERSION_CONFLICT', version: cur.version };
  const next = cur.version + 1;
  db.prepare("UPDATE state_doc SET version=?, data=?, updated_at=datetime('now','localtime'), updated_by=? WHERE id=1")
    .run(next, JSON.stringify(data), userId || null);
  return { ok: true, version: next };
}

function findUserByAccount(account, type) {
  const sql = type ? 'SELECT * FROM users WHERE account = ? AND type = ?' : 'SELECT * FROM users WHERE account = ?';
  return type ? db.prepare(sql).get(account, type) : db.prepare(sql).get(account);
}
function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}
function setPassword(id, plain) {
  db.prepare('UPDATE users SET pwd_hash = ? WHERE id = ?').run(bcrypt.hashSync(plain, 10), id);
}
function log(userId, action, detail) {
  try {
    db.prepare('INSERT INTO audit_log (userId,action,detail) VALUES (?,?,?)').run(userId || null, action, detail ? String(detail).slice(0, 500) : null);
  } catch (_) { /* 日志失败不影响主流程 */ }
}

function listAudit(limit, offset) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  return {
    total: db.prepare('SELECT COUNT(*) AS c FROM audit_log').get().c,
    rows: db.prepare("SELECT a.id, a.userId, a.action, a.detail, a.at, COALESCE(u.name, a.userId) AS name " +
      "FROM audit_log a LEFT JOIN users u ON u.id = a.userId ORDER BY a.id DESC LIMIT ? OFFSET ?").all(lim, off),
  };
}

module.exports = {
  db, DB_PATH, DEFAULT_STORE_PWD,
  seedIfEmpty, getState, saveState,
  findUserByAccount, findUserById, setPassword, log, listAudit,
};
