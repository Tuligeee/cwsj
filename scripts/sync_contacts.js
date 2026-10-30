/* =========================================================
   sync_contacts.js — 把「现有账号」一次性同步成通讯录联系人
   对象：19 位门店店长 + 23 位总部人员
   规则：
     · 只用 source='account' 的条目参与重建，人工新增/编辑过的联系人不动
     · 已有同 refId 的条目就地更新，不重复插入
     · 负责工作(duty) 已人工填写的不覆盖
   跑法：node scripts/sync_contacts.js
   ========================================================= */
const { db, DB_PATH } = require('../src/db');

const st = db.prepare('SELECT version,data FROM state_doc WHERE id = 1').get();
if (!st) { console.error('数据库未初始化'); process.exit(1); }
const state = JSON.parse(st.data);
if (!Array.isArray(state.contacts)) state.contacts = [];

const genId = () => 'C' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function upsert(refId, payload) {
  const exist = state.contacts.find((c) => c.refId === refId);
  if (exist) {
    const keepDuty = exist.duty && exist.duty !== '待补充' ? exist.duty : payload.duty;
    Object.assign(exist, payload, { duty: keepDuty });
    return 'update';
  }
  state.contacts.push(Object.assign({ id: genId(), source: 'account' }, payload, { refId }));
  return 'add';
}

let add = 0, upd = 0;
/* 门店店长 */
for (const s of state.stores || []) {
  if (!s.mgr) continue;
  const r = upsert(s.id, {
    name: s.mgr, dept: '门店', title: s.name + ' 店长',
    duty: '本店事务对接', phone: s.phone || '', wechat: '', email: '', account: s.account || '',
  });
  r === 'add' ? add++ : upd++;
}
/* 总部人员 */
for (const u of state.hq || []) {
  const r = upsert(u.id, {
    name: u.name, dept: u.dept || '总部', title: u.title || '',
    duty: '待补充', phone: u.phone || '', wechat: '', email: '', account: u.account || '',
  });
  r === 'add' ? add++ : upd++;
}

const next = st.version + 1;
db.prepare("UPDATE state_doc SET version = ?, data = ?, updated_at = datetime('now','localtime'), updated_by = 'sync_contacts' WHERE id = 1")
  .run(next, JSON.stringify(state));

console.log(`通讯录同步完成：新增 ${add} 条，更新 ${upd} 条`);
console.log(`当前联系人总数：${state.contacts.length}`);
const byDept = {};
state.contacts.forEach((c) => { byDept[c.dept] = (byDept[c.dept] || 0) + 1; });
console.log('分组：' + Object.entries(byDept).map(([k, v]) => `${k} ${v}`).join(' / '));
console.log(`state 版本 v${st.version} → v${next}（数据库 ${DB_PATH}）`);
