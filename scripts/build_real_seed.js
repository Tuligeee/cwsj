/* =========================================================
   build_real_seed.js — 用钉钉真实组织数据生成 data/seed.json
   输入：data/dingtalk-org.json（由 pull_dingtalk_org.js 生成）
         Desktop/自动化合集/线上推广/门店映射.json（品牌真实店名，可选）
   输出：data/seed.json（覆盖），db.js 首次启动据此建 users + state

   账号规则（2026-10-21 用户确认）：
     · 门店：一家门店一个账号 —— account = 钉钉部门名（如「浏阳二店」）
     · 总部：一人一个账号 —— account = 姓名
     · 手机号：用户选择「先留空」，字段保留不填
   ========================================================= */
const fs = require('fs');
const path = require('path');

const ORG = path.join(__dirname, '..', 'data', 'dingtalk-org.json');
const OUT = path.join(__dirname, '..', 'data', 'seed.json');
const MAP_CANDIDATES = [
  'C:/Users/Tuilge/Desktop/自动化合集/线上推广/门店映射.json',
];
const INIT_PWD = process.env.INIT_PWD || 'Cwsj123456';

/* ---------- 门店账号：拼音，不用汉字、不用手机号 ---------- */
/* 账号必须归属门店而非个人，所以用「城市拼音 + 店序号」：liuyang2 / suzhou3
   城市拼音手写映射，避免装 pinyin 依赖；未覆盖的城市退回 S 编号 */
const CITY_PY = {
  南昌: 'nanchang', 苏州: 'suzhou', 滁州: 'chuzhou', 威海: 'weihai', 潍坊: 'weifang',
  泰安: 'taian', 鄂州: 'ezhou', 余干: 'yugan', 浏阳: 'liuyang', 成都: 'chengdu',
  萍乡: 'pingxiang', 杭州: 'hangzhou', 武汉: 'wuhan',
};
const CN_NUM = { 一: '1', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9' };

/** 「浏阳二店」→ liuyang2；「滁州店」→ chuzhou */
function accountOf(deptName) {
  let rest = deptName.replace(/店$/, '');
  let city = '';
  for (const cn of Object.keys(CITY_PY)) {
    if (rest.startsWith(cn)) { city = CITY_PY[cn]; rest = rest.slice(cn.length); break; }
  }
  const num = CN_NUM[rest] || rest.replace(/[^0-9]/g, '');
  return city ? city + num : '';
}
/* 冲突兜底：同拼音撞车时追加序号 */
function uniqueAccount(base, fallback, used) {
  let acc = base || fallback;
  if (!used[acc]) { used[acc] = 1; return acc; }
  used[acc] += 1;
  return acc + used[acc];
}

const org = JSON.parse(fs.readFileSync(ORG, 'utf8'));

/* ---------- 总部手机号映射（用户要求总部账号用手机号） ----------
   钉钉接口不返回他人手机号，只能人工维护：data/hq-phones.json = { "姓名": "手机号" }
   没配手机号的人退回 HQ+序号，等拿到号码再补，重跑本脚本即可 */
const PHONES_PATH = path.join(__dirname, '..', 'data', 'hq-phones.json');
let phoneMap = {};
if (fs.existsSync(PHONES_PATH)) {
  try { phoneMap = JSON.parse(fs.readFileSync(PHONES_PATH, 'utf8')); } catch (e) { console.warn('hq-phones.json 解析失败：' + e.message); }
}
const badPhone = Object.entries(phoneMap).filter(([, v]) => !/^1[3-9]\d{9}$/.test(String(v)));
if (badPhone.length) console.warn('⚠ 手机号格式不对：' + badPhone.map(([k, v]) => `${k}=${v}`).join('、'));

/* ---------- 品牌映射（可选，缺文件也能跑） ---------- */
let brandMap = [];
for (const p of MAP_CANDIDATES) {
  if (fs.existsSync(p)) {
    try { brandMap = JSON.parse(fs.readFileSync(p, 'utf8')).门店 || []; } catch (_) { brandMap = []; }
    break;
  }
}
function matchBrand(deptName) {
  const hit = brandMap.find(
    (m) => (m.别名 || []).some((a) => a.includes(deptName) || deptName.includes(a)) || (m.真实店名 || '').includes(deptName)
  );
  return hit ? hit.真实店名 : '';
}
/* 从部门名推城市：去掉「一店/二店/三店/店」后缀 */
function cityOf(deptName) {
  return deptName.replace(/[一二三四五六七八九十]店$/, '').replace(/店$/, '') || deptName;
}

/* ---------- 区 → regions ---------- */
const regionNames = [];
org.stores.forEach((s) => { if (!regionNames.includes(s.region)) regionNames.push(s.region); });
const regions = regionNames.map((name, i) => ({ id: 'RG' + (i + 1), name }));

/* ---------- 门店 ---------- */
const usedAcc = {};
const stores = org.stores.map((s, i) => {
  const brand = matchBrand(s.deptName);
  const regionId = (regions.find((r) => r.name === s.region) || {}).id || null;
  const code = 'S' + String(i + 1).padStart(3, '0');
  return {
    id: 'ST' + String(i + 1).padStart(2, '0'),
    code,
    name: s.deptName,                 // 钉钉部门名，店长最熟的叫法
    brand: brand,                     // 品牌全称，未匹配为空
    city: cityOf(s.deptName),
    addr: '',
    mgr: s.manager || '',
    phone: '',                        // 用户选择先留空
    openDays: 0,
    regionId,
    enabled: true,
    account: uniqueAccount(accountOf(s.deptName), code.toLowerCase(), usedAcc),
    type: 'store',
    dingDeptId: s.deptId,
    memberCount: s.memberCount || 0,
  };
});

/* ---------- 总部 ---------- */
/* 账号 = 手机号（用户 2026-10-22 定）；没有号码的人退回 HQ+序号占位，不影响其他人登录 */
const hq = org.hq.map((u, i) => {
  const isDingAdmin = u.labels.includes('主管理员') || u.labels.includes('子管理员');
  /* 平台所有者固定给管理员权限（钉钉标签里未必是管理员） */
  const isPlatformOwner = u.name === (process.env.OWNER_NAME || '李灏铭');
  const phone = String(phoneMap[u.name] || '').trim();
  const hqNo = 'HQ' + String(i + 1).padStart(2, '0');
  return {
    id: hqNo,
    account: /^1[3-9]\d{9}$/.test(phone) ? phone : hqNo,
    name: u.name,
    dept: isPlatformOwner ? '管委会' : '',      // 钉钉无职务信息，留空待补
    title: isPlatformOwner ? '超级管理员' : (u.title || ''),
    committee: isPlatformOwner,                 // 老板拿全部权限（后端 auth.js 有同名判定）
    /* 人事权限已并入管理员，不再单独写 hr 字段 */
    admin: isDingAdmin || isPlatformOwner,
    enabled: true,
    phone,                            // 有号码就一起存，作为联系人
    wechat: '',
    email: '',
    duty: '',
    // 密码不进种子文件：统一由 HQ_PWD / META.initPwd 在 db.js 里哈希后写入 users 表
    type: 'hq',
    dingUserId: u.userId,
    dingLabels: u.labels,
  };
});

/* ---------- 部门与考核默认值（沿用现有口径，待用户按真实架构调整） ---------- */
const DEPARTMENTS = ['管委会', '营销部', '采购部', '质检部', '人事部', '财务部', '技术部', '调研组', 'AI组', '后台组'];
const DEPT_COLOR = {
  '管委会': '#4F6BED', '营销部': '#E4592B', '采购部': '#0F9D58', '质检部': '#7C4DE0',
  '人事部': '#1F7FE8', '财务部': '#C98A00', '技术部': '#0E8C8C', '调研组': '#D24B9B',
  'AI组': '#5B3FE0', '后台组': '#5A6478',
};
const ASSESS_DEFAULT = {
  mode: 'ratio', base: 100, completionWeight: 50, ontimeWeight: 30,
  lateSubmitDeduct: 2, overdueMissDeduct: 5, demandOverdueDeduct: 5, demandFailDeduct: 10, passLine: 60,
};

const out = {
  META: { source: 'dingtalk', pulledAt: org.pulledAt, builtAt: new Date().toISOString(), initPwd: INIT_PWD },
  REGIONS: regions,
  STORE_SEED: stores,
  HQ_SEED: hq,
  DEPARTMENTS,
  DEPT_COLOR,
  HQ_PWD: INIT_PWD,
  ASSESS_DEFAULT,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');

/* ---------- 报告 ---------- */
console.log(`写入 ${OUT}`);
console.log(`门店 ${stores.length} 家 / 区 ${regions.length} 个 / 总部 ${hq.length} 人 / 初始密码 ${INIT_PWD}`);
const noBrand = stores.filter((s) => !s.brand);
if (noBrand.length) console.log(`⚠ 品牌未匹配 ${noBrand.length} 家：` + noBrand.map((s) => s.name).join('、'));
const admins = hq.filter((u) => u.admin);
console.log(`总部管理员（据钉钉标签）：${admins.length} 人 —— ` + admins.map((u) => u.name + '(' + u.account + ')').join('、'));
console.log('\n===== 门店账号对照表（密码统一 ' + INIT_PWD + '）=====');
stores.forEach((s) => console.log(`${s.account.padEnd(12)} ${s.name.padEnd(8)} ${s.mgr}  [${s.code}]`));
console.log('\n===== 总部账号对照表 =====');
hq.forEach((u) => console.log(`${u.account.padEnd(13)} ${u.name}${u.admin ? '  ★管理员' : ''}${/^1[3-9]\d{9}$/.test(u.account) ? '' : '  ←待补手机号'}`));
const missing = hq.filter((u) => !/^1[3-9]\d{9}$/.test(u.account));
if (missing.length) console.log(`\n⚠ ${missing.length} 人还没手机号，暂用编号占位：` + missing.map((u) => u.name).join('、'));
