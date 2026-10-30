/* =========================================================
   backup.js — SQLite 在线备份（WAL 模式下不能直接 cp 数据库文件）
   better-sqlite3 的 db.backup() 走 SQLite 官方 backup API，热备份安全。
   用法：node scripts/backup.js            保留最近 14 份
        node scripts/backup.js --keep 30
   ========================================================= */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'cwsj.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');

const keepIdx = process.argv.indexOf('--keep');
const KEEP = keepIdx > 0 ? Number(process.argv[keepIdx + 1]) || 14 : 14;

function stamp() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

(async () => {
  if (!fs.existsSync(DB_PATH)) {
    console.error('[backup] 数据库不存在：' + DB_PATH);
    process.exit(1);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const out = path.join(BACKUP_DIR, `cwsj-${stamp()}.db`);
  const db = new Database(DB_PATH, { readonly: true });
  await db.backup(out);
  db.close();

  // 备份自检：能打开、能数到表，才算真的可用
  // 🔴 关键：db.backup() 出来的库**继承 WAL 模式** → 数据可能还在 -wal 里，
  //    这时单独拷走 .db 会丢数据（等于备份是假的）。这里 checkpoint + 切成 DELETE 模式，
  //    让备份文件自包含、可单独拷走。
  const chk = new Database(out);
  chk.pragma('wal_checkpoint(TRUNCATE)');
  chk.pragma('journal_mode = DELETE');
  const users = chk.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const st = chk.prepare('SELECT version FROM state_doc WHERE id = 1').get();
  chk.close();
  for (const side of ['-wal', '-shm']) {
    const f = out + side;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  console.log(`[backup] ${out}  ${Math.round(fs.statSync(out).size / 1024)}KB  users=${users} version=${st ? st.version : '-'}  (WAL 已合并，单文件自包含)`);

  // 只留最近 KEEP 份
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^cwsj-\d{8}-\d{6}\.db$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP))) {
    fs.unlinkSync(path.join(BACKUP_DIR, f));
    console.log('[backup] 清理旧备份 ' + f);
  }
})().catch((e) => {
  console.error('[backup] 失败：' + e.message);
  process.exit(1);
});
