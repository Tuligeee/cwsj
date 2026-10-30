/* =========================================================
   grant_owner.js — 把全部权限开给指定账号（默认老板本人的手机号）
   同步两处，缺一处就会出现「前端显示是管理员、后端判定没权限」：
     1. users.profile  → 登录与接口鉴权（auth.js 从库实时重判）
     2. state_doc.hq   → 平台里人员列表的展示
   不会重建库、不动任务与记录，可反复执行。

   跑法：node scripts/grant_owner.js [账号]
   ========================================================= */
const path = require('path');
const { db, DB_PATH } = require('../src/db');

const ACCOUNT = process.argv[2] || process.env.OWNER_ACCOUNT || '18639065205';
/* 人事权限已并入管理员（2026-10-22），不再单列 hr */
const PERMS = { admin: true, committee: true, title: '超级管理员', dept: '管委会' };

const row = db.prepare("SELECT id,account,profile FROM users WHERE account = ? AND type = 'hq'").get(ACCOUNT);
if (!row) {
  console.error(`找不到总部账号 ${ACCOUNT}（数据库 ${DB_PATH}）`);
  process.exit(1);
}

/* 1. users.profile */
const profile = Object.assign(JSON.parse(row.profile), PERMS);
db.prepare('UPDATE users SET profile = ? WHERE id = ?').run(JSON.stringify(profile), row.id);

/* 2. state_doc.hq */
const st = db.prepare('SELECT version,data FROM state_doc WHERE id = 1').get();
const state = JSON.parse(st.data);
const hqUser = (state.hq || []).find((u) => u.account === ACCOUNT);
if (hqUser) {
  Object.assign(hqUser, PERMS);
  db.prepare("UPDATE state_doc SET version = version + 1, data = ?, updated_at = datetime('now','localtime'), updated_by = 'grant_owner' WHERE id = 1")
    .run(JSON.stringify(state));
} else {
  console.warn(`state.hq 里没找到 ${ACCOUNT}，只更新了 users 表`);
}

console.log(`已授权 ${ACCOUNT}（${profile.name}）：` + JSON.stringify(PERMS));
console.log('有效权限：管理员后台 ✓  管委会 ✓  人事/通讯录 ✓');
if (hqUser) console.log(`state 版本已 +1（现 v${st.version + 1}），前端需重新登录或刷新才会看到新权限`);
