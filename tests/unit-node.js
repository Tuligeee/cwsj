'use strict';
/* 服务端纯函数单测（2026-11-16）
   跑法：npm run test:unit   （= node tests/unit-node.js）
   只测不依赖数据库/网络的纯函数：隐私可见性与脱敏。 */
const { canSeeTask, redactTask, stripRecord } = require('../src/privacy');

let pass = 0, fail = 0;
const rows = [];
function t(name, fn) {
  let r;
  try { r = fn(); } catch (e) { r = { ok: false, detail: '抛错: ' + e.message }; }
  if (r.ok) { pass++; rows.push(['PASS', name, r.detail || '']); }
  else { fail++; rows.push(['FAIL', name, r.detail || '']); }
}
const ok = (cond, detail) => ({ ok: !!cond, detail: detail === undefined ? '' : String(detail) });

/* ---------- 测试数据 ---------- */
const ADMIN = { id: 'HQ02', isAdmin: true, isStore: false };
const PLAIN = { id: 'HQ11', isAdmin: false, isStore: false };
const INVITEE = { id: 'HQ08', isAdmin: false, isStore: false };
const STORE_IN = { id: 'ST04', isAdmin: false, isStore: true };
const STORE_OUT = { id: 'ST01', isAdmin: false, isStore: true };

const pub = { id: 'T1', privacy: false, title: '公开任务', creatorId: 'HQ02', storeIds: ['ST04'] };
const priv = { id: 'T2', privacy: true, title: '机密', content: '机密内容', creatorId: 'HQ02', storeIds: ['ST04'], visibleTo: ['HQ08'], dept: '财务部', creatorName: '李铭',
  cycle: 'daily', time: '23:00', weekday: 1, monthDay: 1, deadline: null, startDate: '2026-11-16', stopDate: null, status: 'active', priority: 3 };

/* ---------- canSeeTask ---------- */
t('公开任务：所有人可见', () => ok(canSeeTask(PLAIN, pub) && canSeeTask(STORE_OUT, pub) && canSeeTask(ADMIN, pub)));
t('隐私任务：发布人可见', () => ok(canSeeTask({ id: 'HQ02' }, priv)));
t('隐私任务：管理员可见', () => ok(canSeeTask(ADMIN, priv)));
t('隐私任务：被勾选的人可见', () => ok(canSeeTask(INVITEE, priv)));
t('隐私任务：无关总部不可见', () => ok(canSeeTask(PLAIN, priv) === false));
t('隐私任务：被派门店可见（要交活）', () => ok(canSeeTask(STORE_IN, priv)));
t('隐私任务：未派门店不可见', () => ok(canSeeTask(STORE_OUT, priv) === false));
t('隐私任务无 visibleTo 字段不崩', () => ok(canSeeTask(PLAIN, { privacy: true, creatorId: 'X' }) === false));
t('空任务/空角色不崩', () => ok(canSeeTask(PLAIN, null) === true && canSeeTask(null, priv) === false));

/* ---------- redactTask ---------- */
const stub = redactTask(priv);
t('存根标记 redacted', () => ok(stub.redacted === true));
t('存根不带标题/说明/附件', () => ok(!stub.title && !stub.content && !('images' in stub)));
t('存根不带发布人与隐私配置', () => ok(!stub.creatorId && !stub.creatorName && !stub.dept && !('visibleTo' in stub)));
t('存根保留周期字段', () => ok('cycle' in stub && 'time' in stub && 'weekday' in stub && 'monthDay' in stub));
t('存根保留门店用于统计', () => ok(Array.isArray(stub.storeIds) && stub.storeIds[0] === 'ST04'));
t('存根的 storeIds 是副本（改它不影响原任务）', () => {
  const s = redactTask({ id: 'a', storeIds: ['ST04'] });
  s.storeIds.push('ST99');
  return ok(s.storeIds.length === 2 && s.storeIds[1] === 'ST99');
});
t('redactTask 不修改入参', () => ok(priv.title === '机密' && priv.visibleTo.length === 1));

/* ---------- stripRecord ---------- */
const rec = { id: 'R1', taskId: 'T2', storeId: 'ST04', periodKey: '2026-11-16', doneAt: '2026-11-16T01:00:00Z', late: false, text: '机密说明', images: ['uploads/a.jpg'], links: [{ url: 'http://x' }], by: '张建峰' };
const sr = stripRecord(rec);
t('记录存根保留统计字段', () => ok(sr.id && sr.taskId && sr.storeId && sr.periodKey && sr.doneAt !== undefined && sr.late === false));
t('记录存根不带说明/图片/链接/提交人', () => ok(!sr.text && !sr.images && !sr.links && !sr.by));
t('记录存根无隐私内容泄漏', () => ok(JSON.stringify(sr).indexOf('机密') < 0));

/* ---------- 输出 ---------- */
rows.forEach(([s, n, d]) => console.log(s.padEnd(5) + n + (d ? '  → ' + d : '')));
console.log('\n通过 ' + pass + ' / 失败 ' + fail + ' / 共 ' + (pass + fail));
process.exit(fail ? 1 : 0);

