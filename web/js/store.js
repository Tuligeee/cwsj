/* =========================================================
   store.js — 数据层与业务逻辑
   ========================================================= */

const LS_KEY = 'cwsj_task_platform_v1';
const SESSION_KEY = 'cwsj_session_v1';

let state = null;      // 全部业务数据
let me = null;         // 当前登录用户
let _ri = null;        // 完成记录索引缓存

/* ---------------- 初始化 ---------------- */
const ASSESS_DEFAULT = {
  mode: 'ratio', base: 100, completionWeight: 50, ontimeWeight: 30,
  lateSubmitDeduct: 2, overdueMissDeduct: 5, demandOverdueDeduct: 5, demandFailDeduct: 10, passLine: 60
};

function loadState() {
  /* 服务端模式：数据由 Api.bootstrap() 预先取回，挂在 window.__BOOT_STATE */
  const boot = window.__BOOT_STATE;
  const raw = boot || lsGet(LS_KEY);
  let dirty = false;
  if (raw && raw.meta && raw.tasks) { state = raw; }
  else { state = buildSeed(); dirty = true; }
  /* ---- 旧数据迁移补齐（每新增字段都要在这里补默认值，否则老数据会报错） ---- */
  if (!state.regions) { state.regions = [{ id: 'RG1', name: '华东区' }, { id: 'RG2', name: '华中区' }]; dirty = true; }
  const CITY_REGION = { '苏州': '华东区', '南京': '华东区', '无锡': '华东区', '杭州': '华东区', '武汉': '华中区' };
  state.stores.forEach(s => {
    if (s.regionId === undefined) { s.regionId = (state.regions.find(r => r.name === (CITY_REGION[s.city] || '')) || {}).id || null; dirty = true; }
    if (s.enabled === undefined) { s.enabled = true; dirty = true; }
    if (!s.account) { s.account = s.code; dirty = true; }
  });
  /* 管理公司账号：admin 默认值必须取「种子里的管理员名单」而不是 false，
     否则老数据（那时还没有 admin 字段）会永久失去「管理员后台」入口 */
  const seedAdmins = (typeof HQ_SEED !== 'undefined' ? HQ_SEED : []).filter(u => u.admin).map(u => u.id);
  state.hq.forEach(u => {
    if (u.admin === undefined) { u.admin = seedAdmins.indexOf(u.id) >= 0; dirty = true; }
    if (u.enabled === undefined) { u.enabled = true; dirty = true; }
  });
  /* 兜底自愈：一个管理员都没有时，提升首位管委会成员，避免系统彻底失去管理入口 */
  if (state.hq.length && !state.hq.some(u => u.admin)) {
    (state.hq.find(u => u.committee) || state.hq[0]).admin = true;
    dirty = true;
  }
  if (!state.assessCfg) { state.assessCfg = Object.assign({}, ASSESS_DEFAULT); dirty = true; }
  else state.assessCfg = Object.assign({}, ASSESS_DEFAULT, state.assessCfg);
  _ri = null;
  /* 服务端模式下不自动回写：服务端数据才是权威，避免登录页无 token 时触发保存 */
  if (dirty && !window.__SERVER_MODE) saveState();
}
function saveState(immediate) {
  _ri = null;
  /* 服务端模式：交给 Api 做防抖 + 乐观锁；本地模式：仍然落 localStorage
     immediate=true 用于关键动作（提交/修改需求），立刻发请求，不防抖 */
  if (window.__SERVER_MODE) { Api.queueSave(state, immediate === true); return; }
  lsSet(LS_KEY, state);
}
function resetDemo() {
  state = buildSeed();
  _ri = null;
  saveState();
}

/* ---------------- 会话 ---------------- */
function getStore(id) { return state.stores.find(s => s.id === id) || null; }
function getHq(id) { return state.hq.find(u => u.id === id) || null; }
function getUser(id) { return getStore(id) || getHq(id); }
function userName(id) { const u = getUser(id); return u ? u.name : '—'; }

async function login(account, pwd) {
  /* 服务端模式：账号密码交给后端校验，前端不接触任何密码数据；
     门店 / 管理公司由后端按账号识别，前端不再传角色 */
  if (window.__SERVER_MODE) {
    try {
      const r = await Api.login(account, pwd);
      me = r.user;
      return { ok: true, user: r.user, mustChangePwd: r.mustChangePwd };
    } catch (e) {
      return { ok: false, msg: e.message || '登录失败' };
    }
  }
  /* 本地单机模式（离线演示用）：先查门店再查管理公司 */
  const key = String(account).trim().toLowerCase();
  const u = state.stores.find(x => String(x.account || x.code || '').toLowerCase() === key)
    || state.hq.find(x => String(x.account || x.id || '').toLowerCase() === key);
  if (!u) return { ok: false, msg: '账号或密码错误' };
  if (u.enabled === false) return { ok: false, msg: '该账号已被停用，请联系管理员' };
  if (u.pwd !== pwd) return { ok: false, msg: '账号或密码错误' };
  me = u;
  lsSet(SESSION_KEY, { type: u.type, id: u.id });
  return { ok: true, user: u };
}
function restoreSession() {
  /* 服务端模式：bootstrap 已带回 me，token 无效时 boot() 会直接落到登录页 */
  if (window.__SERVER_MODE) { me = window.__BOOT_ME || null; return me; }
  const s = lsGet(SESSION_KEY);
  if (!s) return null;
  me = s.type === 'store' ? getStore(s.id) : getHq(s.id);
  return me;
}
function logout() {
  me = null;
  localStorage.removeItem(SESSION_KEY);
  if (window.__SERVER_MODE && window.Api) Api.setToken('');
}
const isStore = () => !!me && me.type === 'store';
const isHq = () => !!me && me.type === 'hq';
const isCommittee = () => isHq() && !!me.committee;
/* 人事权限并入管理员：管理员自带通讯录维护权；部门为「人事部」的人自动具备 */
const isHR = () => isHq() && (!!me.admin || me.dept === '人事部');
const canEditContacts = () => isCommittee() || isHR();

/* =========================================================
   任务周期 / 实例
   ========================================================= */
const CYCLE_LABEL = { daily: '每日必做', weekly: '每周必做', monthly: '每月必做', once: '专项任务' };
const CYCLE_TAG = { daily: 'tag-blue', weekly: 'tag-purple', monthly: 'tag-yellow', once: 'tag-gray' };

/** 该周期的截止时间 */
function occDue(t, date) {
  const d = startOfDay(date);
  if (t.cycle === 'daily') return atTime(ymd(d), t.time);
  if (t.cycle === 'weekly') return atTime(ymd(addDays(startOfWeek(d), (t.weekday || 7) - 1)), t.time);
  if (t.cycle === 'monthly') {
    const m = startOfMonth(d);
    const last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    return atTime(ymd(new Date(m.getFullYear(), m.getMonth(), Math.min(t.monthDay || 1, last))), t.time);
  }
  return new Date(t.deadline);
}
/** 周期唯一键 */
function occKey(t, date) {
  if (t.cycle === 'daily') return ymd(date);
  if (t.cycle === 'weekly') return weekKey(date);
  if (t.cycle === 'monthly') return monthKey(date);
  return 'once';
}
/** 该周期是否处于任务生效区间 */
function taskActiveOn(t, date) {
  if (t.cycle === 'once') return true;
  const due = occDue(t, date).getTime();
  if (t.startDate && due < atTime(t.startDate, '00:00').getTime()) return false;
  if (t.stopDate && due > atTime(t.stopDate, '23:59').getTime()) return false;
  return true;
}
/** 周期描述文案 */
function cycleDesc(t) {
  if (t.cycle === 'daily') return '每天 ' + t.time + ' 前';
  if (t.cycle === 'weekly') return '每周' + WD_CN[(t.weekday || 7) - 1] + ' ' + t.time + ' 前';
  if (t.cycle === 'monthly') return '每月 ' + (t.monthDay || 1) + ' 日 ' + t.time + ' 前';
  return '截止 ' + ymdhm(new Date(t.deadline));
}

/* ---------------- 完成记录 ---------------- */
const REC_SEP = '|';
function recKey(taskId, storeId, key) { return taskId + REC_SEP + storeId + REC_SEP + key; }
function recIndex() {
  if (!_ri) {
    _ri = {};
    state.records.forEach(r => { _ri[recKey(r.taskId, r.storeId, r.periodKey)] = r; });
  }
  return _ri;
}
function getRecord(taskId, storeId, key) { return recIndex()[recKey(taskId, storeId, key)] || null; }

/* ---------------- 状态计算 ---------------- */
const ST_ORDER = { overdue: 0, due: 1, normal: 2, late: 3, done: 4, na: 5 };
const ST_LABEL = { overdue: '已逾期', due: '即将到期', normal: '进行中', late: '逾期完成', done: '已完成', na: '不适用' };

function occStatus(due, task, rec, now) {
  if (rec) {
    const late = rec.late || new Date(rec.doneAt).getTime() > new Date(due).getTime() + 60000;
    return late ? 'late' : 'done';
  }
  const n = (now ? new Date(now) : new Date()).getTime();
  const d = new Date(due).getTime();
  if (n > d) return 'overdue';
  if (d - n <= (task.remindBeforeMin || 0) * 60000) return 'due';
  return 'normal';
}
function statusTagCls(st) {
  return st === 'overdue' ? 'tag-red' : st === 'due' ? 'tag-yellow' : st === 'done' ? 'tag-green'
    : st === 'late' ? 'tag-yellow' : st === 'normal' ? 'tag-gray' : 'tag-gray';
}

/* ---------------- 门店任务分桶 ---------------- */
/**
 * 返回门店在指定日期的任务分桶
 * bucket: today / week / month / future
 */
function storeBuckets(storeId, day, now) {
  const nowD = now ? new Date(now) : new Date();
  const ds = startOfDay(day).getTime(), de = endOfDay(day).getTime();
  const ws = startOfWeek(day).getTime(), we = endOfWeek(day).getTime();
  const ms = startOfMonth(day).getTime(), me2 = endOfMonth(day).getTime();
  const out = { today: [], week: [], month: [], future: [] };
  state.tasks.forEach(t => {
    if (t.status !== 'active') return;
    if (!t.storeIds.includes(storeId)) return;
    if (!taskActiveOn(t, day)) return;
    const due = occDue(t, day);
    const key = occKey(t, day);
    const rec = getRecord(t.id, storeId, key);
    const st = occStatus(due, t, rec, nowD);
    const item = { task: t, due: due, key: key, rec: rec, status: st };
    if (st === 'overdue') { out.today.push(item); return; }
    const dt = due.getTime();
    if (dt >= ds && dt <= de) out.today.push(item);
    else if (dt >= ws && dt <= we) out.week.push(item);
    else if (dt >= ms && dt <= me2) out.month.push(item);
    else out.future.push(item);
  });
  const cmp = (a, b) => (ST_ORDER[a.status] - ST_ORDER[b.status]) || (a.due - b.due);
  out.today.sort(cmp); out.week.sort(cmp); out.month.sort(cmp); out.future.sort(cmp);
  return out;
}

/** 未来 N 天 + 已逾期的未完成实例（用于提醒中心） */
function pendingOccurrences(storeId, aheadDays, now) {
  const nowD = now ? new Date(now) : new Date();
  const limit = addDays(endOfDay(nowD), aheadDays).getTime();
  const list = [], seen = new Set();
  for (let i = -10; i <= aheadDays + 1; i++) {
    const day = addDays(nowD, i);
    state.tasks.forEach(t => {
      if (t.status !== 'active' || !t.storeIds.includes(storeId)) return;
      if (!taskActiveOn(t, day)) return;
      const key = occKey(t, day);
      const sig = t.id + REC_SEP + key;
      if (seen.has(sig)) return;
      seen.add(sig);
      const due = occDue(t, day);
      const rec = getRecord(t.id, storeId, key);
      if (rec) return;
      if (due.getTime() > limit) return;
      const st = occStatus(due, t, null, nowD);
      if (st !== 'overdue' && st !== 'due') return;
      if (st === 'overdue' && !t.remindOverdue) return;
      list.push({ task: t, due: due, key: key, status: st });
    });
  }
  return list.sort((a, b) => ST_ORDER[a.status] - ST_ORDER[b.status] || a.due - b.due);
}

/* ---------------- 任务进度（管理公司视角） ---------------- */
function taskProgress(task, now) {
  const nowD = now ? new Date(now) : new Date();
  const res = { expected: 0, done: 0, lateDone: 0, overdue: 0, dueSoon: 0, rate: 0, cells: [] };
  task.storeIds.forEach(sid => {
    if (task.status === 'active' && !taskActiveOn(task, nowD)) { res.cells.push({ storeId: sid, status: 'na' }); return; }
    const due = occDue(task, nowD);
    const key = occKey(task, nowD);
    const rec = getRecord(task.id, sid, key);
    const st = occStatus(due, task, rec, nowD);
    res.cells.push({ storeId: sid, status: st, due: due, key: key, rec: rec });
    res.expected++;
    if (st === 'done') res.done++;
    else if (st === 'late') { res.done++; res.lateDone++; }
    else if (st === 'overdue') res.overdue++;
    else if (st === 'due') res.dueSoon++;
  });
  res.rate = pct(res.done, res.expected);
  return res;
}

/* ---------------- 门店完成统计 ---------------- */
function storeCompletion(storeId, days, now) {
  const nowD = now ? new Date(now) : new Date();
  const from = addDays(startOfDay(nowD), -(days - 1));
  const acc = () => ({ expected: 0, done: 0, ontime: 0, late: 0, missed: 0 });
  const total = acc();
  const byCycle = { daily: acc(), weekly: acc(), monthly: acc(), once: acc() };
  const trend = [];
  const seen = new Set();
  const dayStats = {};

  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    const dkey = ymd(day);
    if (!dayStats[dkey]) dayStats[dkey] = acc();
    state.tasks.forEach(t => {
      if (!t.storeIds.includes(storeId)) return;
      if (!taskActiveOn(t, day)) return;
      const due = occDue(t, day);
      /* 专项任务（once）没有「日」的概念，只在某一个时间点结算：
         · 到了截止当天 → 计入（交了算完成，没交算逾期未交）
         · 截止日还没到，但门店**已经提交** → 立即计入
           （原来的写法是一律「非截止日跳过」，导致提前完成的任务在考核里查不到：
             任务卡片显示 1/1、100%，考核统计却是 0 —— 2026-10-22 用户实测反馈）
         · 截止日早于统计窗口的，不再复算进来 */
      if (t.cycle === 'once' && ymd(due) !== ymd(day)) {
        const recEarly = getRecord(t.id, storeId, 'once');
        if (!recEarly) return;                       // 没交且不是截止日 → 不算
        if (ymd(due) < ymd(from)) return;            // 截止日早于窗口 → 不算
      }
      const key = occKey(t, day);
      const sig = t.id + REC_SEP + key;
      if (seen.has(sig)) return;
      seen.add(sig);
      const rec = getRecord(t.id, storeId, key);
      /* 口径（2026-10-22 用户确认，「应到 / 实到」语义）：
         · 已到截止时刻 → 一定计入「应完成」，提交了算已完成，没提交算逾期未提交
         · 未到截止时刻 → 只有「已经提交」的才计入（应完成 +1、已完成 +1）
           否则提前交的任务当天看不到，且会把未来天数全算成应完成
         提前提交的完成时间早于截止 → 按时完成，不计逾期 */
      if (!rec && due.getTime() > nowD.getTime()) return;
      [total, byCycle[t.cycle] || total, dayStats[dkey]].forEach(a => {
        if (!a) return;
        a.expected++;
        if (rec) {
          a.done++;
          if (rec.late || new Date(rec.doneAt).getTime() > due.getTime() + 60000) a.late++; else a.ontime++;
        } else a.missed++;
      });
    });
  }
  for (const k in dayStats) trend.push({ day: k, ...dayStats[k] });
  trend.sort((a, b) => a.day < b.day ? -1 : 1);

  function fin(a) {
    return {
      expected: a.expected, done: a.done, ontime: a.ontime, late: a.late, missed: a.missed,
      rate: pct(a.done, a.expected), ontimeRate: pct(a.ontime, a.expected)
    };
  }
  return {
    storeId, days, ...fin(total),
    byCycle: { daily: fin(byCycle.daily), weekly: fin(byCycle.weekly), monthly: fin(byCycle.monthly), once: fin(byCycle.once) },
    trend: trend
  };
}

/* ---------------- 部门 / 管理公司统计 ---------------- */
function demandStats(days, now) {
  const nowD = now ? new Date(now) : new Date();
  const from = addDays(startOfDay(nowD), -(days - 1)).getTime();
  const list = visibleDemands().filter(d => new Date(d.createdAt).getTime() >= from);
  const c = { total: list.length, pending: 0, approved: 0, assigned: 0, completed: 0, confirmed: 0, rejected: 0 };
  list.forEach(d => { c[d.status] = (c[d.status] || 0) + 1; });

  const reviewed = list.filter(d => d.review);
  const pass = reviewed.filter(d => d.review.result === 'pass').length;
  const reject = reviewed.filter(d => d.review.result === 'reject').length;

  let reviewMs = 0, reviewN = 0;
  reviewed.forEach(d => {
    const v = new Date(d.review.at).getTime() - new Date(d.createdAt).getTime();
    if (v >= 0) { reviewMs += v; reviewN++; }
  });

  const handled = list.filter(d => d.assign && d.complete);
  let handleMs = 0, handleN = 0, overdueHandled = 0, onTimeHandled = 0;
  handled.forEach(d => {
    const v = new Date(d.complete.at).getTime() - new Date(d.assign.at).getTime();
    if (v >= 0) { handleMs += v; handleN++; }
    if (d.assign.expectDate && new Date(d.complete.at).getTime() > atTime(d.assign.expectDate, '23:59').getTime()) overdueHandled++;
    else onTimeHandled++;
  });

  const assignPending = list.filter(d => d.assign && !d.complete);
  assignPending.forEach(d => {
    if (d.assign.expectDate && nowD.getTime() > atTime(d.assign.expectDate, '23:59').getTime()) overdueHandled++;
  });

  /* 按部门：被派发处理量 */
  const byDept = {};
  state.departments.forEach(x => { byDept[x] = { dept: x, assigned: 0, done: 0, onTime: 0, overdue: 0, msSum: 0, msN: 0 }; });
  list.forEach(d => {
    if (!d.assign) return;
    const b = byDept[d.assign.dept]; if (!b) return;
    b.assigned++;
    if (d.complete) {
      b.done++;
      const v = new Date(d.complete.at).getTime() - new Date(d.assign.at).getTime();
      if (v >= 0) { b.msSum += v; b.msN++; }
      if (d.assign.expectDate && new Date(d.complete.at).getTime() > atTime(d.assign.expectDate, '23:59').getTime()) b.overdue++;
      else b.onTime++;
    } else if (d.assign.expectDate && nowD.getTime() > atTime(d.assign.expectDate, '23:59').getTime()) {
      b.overdue++;
    }
  });

  /* 按责任人 */
  const byPerson = {};
  list.forEach(d => {
    if (!d.assign) return;
    const k = d.assign.toId;
    if (!byPerson[k]) byPerson[k] = { id: k, name: d.assign.toName, dept: d.assign.dept, assigned: 0, done: 0, onTime: 0, overdue: 0, msSum: 0, msN: 0 };
    const b = byPerson[k];
    b.assigned++;
    if (d.complete) {
      b.done++;
      const v = new Date(d.complete.at).getTime() - new Date(d.assign.at).getTime();
      if (v >= 0) { b.msSum += v; b.msN++; }
      if (d.assign.expectDate && new Date(d.complete.at).getTime() > atTime(d.assign.expectDate, '23:59').getTime()) b.overdue++;
      else b.onTime++;
    } else if (d.assign.expectDate && nowD.getTime() > atTime(d.assign.expectDate, '23:59').getTime()) {
      b.overdue++;
    }
  });

  return {
    days, ...c,
    window: list,
    passRate: pct(pass, pass + reject),
    rejectRate: pct(reject, pass + reject),
    archiveRate: pct(c.confirmed, c.total),
    resolveRate: pct(c.completed + c.confirmed, c.total),
    avgReviewMs: reviewN ? reviewMs / reviewN : 0,
    avgHandleMs: handleN ? handleMs / handleN : 0,
    overdueHandled, onTimeHandled,
    byDept: Object.values(byDept).filter(x => x.assigned > 0),
    byPerson: Object.values(byPerson).sort((a, b) => b.assigned - a.assigned)
  };
}

/** 管理公司发布任务统计（按部门） */
function taskPublishStats(days, now) {
  const nowD = now ? new Date(now) : new Date();
  const from = addDays(startOfDay(nowD), -(days - 1)).getTime();
  const byDept = {};
  state.departments.forEach(x => { byDept[x] = { dept: x, tasks: 0, covers: 0, done: 0, expected: 0, overdue: 0, dueSoon: 0, open: 0 }; });
  state.tasks.forEach(t => {
    if (new Date(t.createdAt).getTime() < from) return;
    const b = byDept[t.dept]; if (!b) return;
    b.tasks++;
    const p = taskProgress(t, nowD);
    b.covers += t.storeIds.length;
    b.done += p.done; b.expected += p.expected;
    b.overdue += p.overdue; b.dueSoon += p.dueSoon;
    b.open += (p.expected - p.done);
  });
  return { byDept: Object.values(byDept).filter(x => x.tasks > 0) };
}

/* ---------------- 全公司总览（用于首页/考核） ---------------- */
function companyOverview(days, now) {
  const nowD = now ? new Date(now) : new Date();
  const rows = state.stores.map(s => {
    const c = storeCompletion(s.id, days, nowD);
    const city = s.city;
    return { store: s, city: city, ...c };
  });
  const sum = rows.reduce((a, r) => {
    a.expected += r.expected; a.done += r.done; a.ontime += r.ontime; a.late += r.late; a.missed += r.missed;
    return a;
  }, { expected: 0, done: 0, ontime: 0, late: 0, missed: 0 });
  sum.rate = pct(sum.done, sum.expected);
  sum.ontimeRate = pct(sum.ontime, sum.expected);
  return { rows: rows, total: sum };
}

/* =========================================================
   任务写操作
   ========================================================= */
function createTask(data) {
  const t = Object.assign({
    id: uid('T'), images: [], links: [], remindBeforeMin: 120, remindOverdue: true,
    startDate: ymd(new Date()), stopDate: null, status: 'active',
    creatorId: me.id, creatorName: me.name, createdAt: new Date().toISOString()
  }, data);
  state.tasks.unshift(t);
  if (window.__TASK_API__) { taskApi('POST', '/api/tasks', { task: t }); return t; }
  saveState();
  return t;
}
function findTask(id) { return state.tasks.find(t => t.id === id) || null; }
function demandApi(method, path, body) {
  return fetch(API_BASE + path, {
    method: method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('cwsj_token_v1') },
    body: body ? JSON.stringify(body) : undefined
  }).then(r => r.json()).catch(() => ({ ok: false }));
}
const API_BASE = (window.Api && window.Api.base) || '';
function taskApi(method, path, body) {
  return fetch(API_BASE + path, {
    method: method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('cwsj_token_v1') },
    body: body ? JSON.stringify(body) : undefined
  }).then(r => r.json()).catch(() => ({ ok: false }));
}
function stopTask(id) {
  const t = findTask(id);
  if (t) { t.status = 'stopped'; t.stoppedAt = new Date().toISOString(); }
  if (window.__TASK_API__) { taskApi('POST', '/api/tasks/' + encodeURIComponent(id) + '/stop'); return; }
  saveState();
}
function resumeTask(id) {
  const t = findTask(id);
  if (t) { t.status = 'active'; t.stoppedAt = null; }
  if (window.__TASK_API__) { taskApi('POST', '/api/tasks/' + encodeURIComponent(id) + '/resume'); return; }
  saveState();
}
function removeTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  state.records = state.records.filter(r => r.taskId !== id);
  if (window.__TASK_API__) { taskApi('DELETE', '/api/tasks/' + encodeURIComponent(id)); return; }
  saveState();
}
function patchTaskRemote(id, patch) {
  const t = findTask(id);
  if (t) Object.assign(t, patch);
  if (window.__TASK_API__) return taskApi('PATCH', '/api/tasks/' + encodeURIComponent(id), { patch: patch });
  saveState();
  return Promise.resolve({ ok: true });
}

/* ---------------- 提交完成 ---------------- */
async function submitDone(taskId, storeId, key, payload) {
  const t = findTask(taskId);
  if (!t) return null;
  /* 服务端模式：走原子接口。整份覆盖在并发下会互相冲掉（实测丢数据） */
  if (window.__SERVER_MODE && window.Api) {
    const r = await Api.submitRecord({
      taskId, periodKey: key,
      text: payload.text, images: payload.images || [], links: payload.links || [],
    });
    if (!Array.isArray(state.records)) state.records = [];
    const i = state.records.findIndex(x => x.taskId === taskId && x.storeId === storeId && x.periodKey === key);
    if (i >= 0) state.records[i] = r.record; else state.records.push(r.record);
    _ri = null;
    return r.record;
  }
  let rec = getRecord(taskId, storeId, key);
  const due = occDue(t, new Date());
  const nowIso = new Date().toISOString();
  const isLate = new Date(nowIso).getTime() > due.getTime() + 60000;
  if (rec) {
    Object.assign(rec, payload, { doneAt: nowIso, late: isLate, editedAt: nowIso });
  } else {
    rec = Object.assign({
      id: uid('R'), taskId, storeId, periodKey: key, due: due.toISOString(),
      doneAt: nowIso, late: isLate, by: (me && me.type === 'store') ? me.mgr : (me ? me.name : '')
    }, payload);
    state.records.push(rec);
  }
  saveState();
  return rec;
}
async function revokeDone(taskId, storeId, key) {
  if (window.__SERVER_MODE && window.Api) {
    await Api.revokeRecord(taskId, key);
    state.records = state.records.filter(r => !(r.taskId === taskId && r.storeId === storeId && r.periodKey === key));
    _ri = null;
    return;
  }
  state.records = state.records.filter(r => !(r.taskId === taskId && r.storeId === storeId && r.periodKey === key));
  saveState();
}

/* =========================================================
   需求（提需）流程
   ========================================================= */
const DEMAND_STATUS = {
  pending: { label: '待评估', cls: 'd-pending', tag: 'tag-blue', step: 1 },
  approved: { label: '已通过 · 待派发', cls: 'd-approved', tag: 'tag-yellow', step: 2 },
  assigned: { label: '处理中', cls: 'd-assigned', tag: 'tag-purple', step: 3 },
  completed: { label: '已完成 · 待门店确认', cls: 'd-completed', tag: 'tag-green', step: 4 },
  confirmed: { label: '已确认归档', cls: 'd-confirmed', tag: 'tag-green', step: 5 },
  rejected: { label: '已驳回', cls: 'd-rejected', tag: 'tag-red', step: 0 }
};
const DEMAND_FLOW = ['提交需求', '管委会评估', '派发责任人', '处理完成', '门店确认'];

function findDemand(id) { return state.demands.find(d => d.id === id) || null; }
/* 谁提的谁能删；管理公司管理员可删；其他人不行 */
function canDeleteDemand(d) {
  if (!d || !me || d.deletedAt) return false;
  /* 只有「待评估 / 已驳回」可删；已进入流程或已归档的不允许 */
  if (d.status !== 'pending' && d.status !== 'rejected') return false;
  if (me.type === 'hq') return !!me.admin;
  if (me.type === 'store') return d.storeId === me.id;
  return false;
}
function visibleDemands() { return state.demands.filter(d => !d.deletedAt && !d.archivedAt); }
function archivedDemands() { return state.demands.filter(d => !d.deletedAt && d.archivedAt); }
function canArchiveDemand(d) {
  if (!d || !me || !(me.admin || me.isCommittee) || d.deletedAt || d.archivedAt) return false;
  return d.status === 'completed' || d.status === 'confirmed';
}
function archiveDemandById(id, on) {
  const d = findDemand(id);
  if (!d || !(me.admin || me.isCommittee)) return false;
  if (on) {
    d.archivedAt = new Date().toISOString();
    d.archivedBy = me.name;
    d.logs.push({ at: d.archivedAt, by: me.name, action: '归档需求', note: '' });
  } else {
    d.archivedAt = null; d.archivedBy = null;
    d.logs.push({ at: new Date().toISOString(), by: me.name, action: '取消归档', note: '' });
  }
  if (window.__DEMAND_API__) { demandApi('POST', '/api/demands/' + encodeURIComponent(id) + '/archive', { on: !!on }); return true; }
  saveState(true);
  return true;
}
function deleteDemandById(id) {
  const d = findDemand(id);
  if (!d || d.deletedAt) return false;
  if (!canDeleteDemand(d)) return false;
  /* 软删除：记录保留，列表里不再出现；顺便写一条日志，便于事后追溯 */
  d.deletedAt = new Date().toISOString();
  d.deletedBy = me.id;
  d.deletedByName = me.name + (me.type === 'hq' ? '（' + me.dept + '）' : '（' + d.storeName + '）');
  d.logs.push({ at: d.deletedAt, by: d.deletedByName, action: '删除需求', note: '状态：' + ((DEMAND_STATUS[d.status] || {}).label || d.status) });
  if (window.__DEMAND_API__) { demandApi('DELETE', '/api/demands/' + encodeURIComponent(id)); return true; }
  saveState(true);   // 关键动作立刻落库
  return true;
}
function demandNextCode() {
  const d = ymd(new Date()).replace(/-/g, '');
  const n = state.demands.filter(x => x.code && x.code.indexOf('XQ' + d) === 0).length + 1;
  return 'XQ' + d + String(n).padStart(3, '0');
}
function dlog(d, action, note) {
  d.logs.push({ at: new Date().toISOString(), by: me.name + '（' + (me.type === 'store' ? me.name : me.dept) + '）', action: action, note: note || '' });
}
/* 被驳回后由提出门店修改并重新提交：回到「待评估」，清空上一轮的评估/派发/处理结果
   （历史不会丢——都在 logs 里），让管委会重新评审。
   2026-10-22 用户反馈：驳回后门店改不了，只能重新提一条新的，历史就断了。 */
function resubmitDemand(id, patch) {
  const d = findDemand(id);
  if (!d) return null;
  const s = getStore(d.storeId);
  Object.assign(d, patch);
  d.status = 'pending';
  d.review = null;
  d.assign = null;
  d.complete = null;
  d.confirm = null;
  d.logs.push({
    at: new Date().toISOString(),
    by: (s ? s.mgr : '门店') + '（' + d.storeName + '）',
    action: '修改后重新提交',
    note: '等待管委会重新评估'
  });
  saveState(true);   // 重新提交同样是关键动作
  return d;
}
function createDemand(data) {
  const s = getStore(me.id);
  const d = Object.assign({
    id: uid('XQ'), code: demandNextCode(),
    storeId: me.id, storeName: s ? s.name : me.name,
    images: [], links: [], createdAt: new Date().toISOString(),
    status: 'pending', review: null, assign: null, complete: null, confirm: null, logs: []
  }, data);
  d.logs = [{ at: d.createdAt, by: s.mgr + '（' + s.name + '）', action: '提交需求', note: '' }];
  state.demands.unshift(d);
  if (window.__DEMAND_API__) { demandApi('POST', '/api/demands', { demand: d }); return d; }
  saveState(true);   // 提交需求是关键动作：立刻落库，避免"提交完马上刷新就没了"
  return d;
}
function reviewDemand(id, result, comment) {
  const d = findDemand(id); if (!d) return;
  d.review = { byId: me.id, byName: me.name, at: new Date().toISOString(), result: result, comment: comment };
  d.status = result === 'pass' ? 'approved' : 'rejected';
  d.assign = null;
  d.logs.push({ at: d.review.at, by: me.name + '（管委会）', action: result === 'pass' ? '评估通过' : '评估驳回', note: comment });
  if (window.__DEMAND_API__) { demandApi('POST', '/api/demands/' + encodeURIComponent(id) + '/review', { result: result, comment: comment }); return; }
  saveState();
}
function assignDemand(id, toId, expectDate, note) {
  const d = findDemand(id); if (!d) return;
  const u = getHq(toId);
  d.assign = { toId: toId, toName: u ? u.name : '—', dept: u ? u.dept : '—', at: new Date().toISOString(), expectDate: expectDate, note: note || '' };
  d.status = 'assigned';
  d.complete = null;
  d.logs.push({ at: d.assign.at, by: me.name + '（管委会）', action: '派发给 ' + d.assign.toName + '（' + d.assign.dept + '）', note: '期望完成：' + expectDate + (note ? '　' + note : '') });
  if (window.__DEMAND_API__) { demandApi('POST', '/api/demands/' + encodeURIComponent(id) + '/assign', { toId: toId, expectDate: expectDate, note: note }); return; }
  saveState();
}
function completeDemand(id, text, images, links) {
  const d = findDemand(id); if (!d) return;
  d.complete = { byId: me.id, byName: me.name, at: new Date().toISOString(), text: text, images: images || [], links: links || [] };
  d.status = 'completed';
  d.logs.push({ at: d.complete.at, by: me.name + '（' + me.dept + '）', action: '完成处理', note: text });
  if (window.__DEMAND_API__) { demandApi('POST', '/api/demands/' + encodeURIComponent(id) + '/complete', { text: text, images: images, links: links }); return; }
  saveState();
}
function confirmDemand(id, rating, comment) {
  const d = findDemand(id); if (!d) return;
  d.confirm = { at: new Date().toISOString(), rating: rating, comment: comment || '' };
  d.status = 'confirmed';
  const s = getStore(d.storeId);
  d.logs.push({ at: d.confirm.at, by: (s ? s.mgr : '门店') + '（' + d.storeName + '）', action: '确认完成并评分', note: rating + ' 星' + (comment ? '　' + comment : '') });
  if (window.__DEMAND_API__) { demandApi('POST', '/api/demands/' + encodeURIComponent(id) + '/confirm', { rating: rating, comment: comment }); return; }
  saveState();
}
function reopenDemand(id, comment) {
  const d = findDemand(id); if (!d) return;
  d.status = 'assigned';
  d.complete = null; d.confirm = null;
  const s = getStore(d.storeId);
  d.logs.push({ at: new Date().toISOString(), by: (s ? s.mgr : '门店') + '（' + d.storeName + '）', action: '退回重做', note: comment || '' });
  if (window.__DEMAND_API__) { demandApi('POST', '/api/demands/' + encodeURIComponent(id) + '/reopen', { comment: comment }); return; }
  saveState();
}

/* ---------------- 通讯录 ---------------- */
function upsertContact(c) {
  if (c.id) {
    const i = state.contacts.findIndex(x => x.id === c.id);
    if (i >= 0) state.contacts[i] = Object.assign(state.contacts[i], c);
  } else {
    c.id = uid('C');
    state.contacts.push(c);
  }
  if (window.__CONTACT_API__) { demandApi('POST', '/api/contacts', { contact: c }); return; }
  saveState();
}
function removeContact(id) {
  state.contacts = state.contacts.filter(c => c.id !== id);
  if (window.__CONTACT_API__) { demandApi('DELETE', '/api/contacts/' + encodeURIComponent(id)); return; }
  saveState();
}

/* =========================================================
   提醒中心
   ========================================================= */
function buildReminders() {
  const now = new Date();
  const out = { urgent: [], soon: [], info: [] };
  if (isStore()) {
    pendingOccurrences(me.id, 7, now).forEach(it => {
      const o = {
        type: 'task', id: it.task.id, key: it.key, due: it.due,
        title: it.task.title,
        meta: CYCLE_LABEL[it.task.cycle] + ' · ' + cycleDesc(it.task)
      };
      if (it.status === 'overdue') out.urgent.push(o); else out.soon.push(o);
    });
    visibleDemands().filter(d => d.storeId === me.id && d.status === 'completed').forEach(d => {
      out.info.push({ type: 'demand', id: d.id, title: d.title, meta: '需求已完成，待你确认：' + d.code });
    });
  } else if (isHq()) {
    if (isCommittee()) {
      visibleDemands().filter(d => d.status === 'pending').forEach(d => {
        out.urgent.push({ type: 'review', id: d.id, title: d.title, meta: '待评估 · ' + d.storeName + ' · ' + d.code });
      });
      visibleDemands().filter(d => d.status === 'approved').forEach(d => {
        out.soon.push({ type: 'assign', id: d.id, title: d.title, meta: '已通过待派发 · ' + d.storeName + ' · ' + d.code });
      });
    }
    visibleDemands().filter(d => d.assign && d.assign.toId === me.id && d.status === 'assigned').forEach(d => {
      const over = d.assign.expectDate && now.getTime() > atTime(d.assign.expectDate, '23:59').getTime();
      const o = { type: 'handle', id: d.id, title: d.title, meta: (over ? '⚠ 已超期望完成时间 · ' : '待处理 · ') + d.storeName + ' · ' + d.code };
      (over ? out.urgent : out.soon).push(o);
    });
    state.tasks.filter(t => t.creatorId === me.id && t.status === 'active').forEach(t => {
      const p = taskProgress(t, now);
      if (p.overdue > 0) out.urgent.push({ type: 'taskstat', id: t.id, title: t.title, meta: '我发布的任务：' + p.overdue + ' 家门店逾期未完成' });
      else if (p.dueSoon > 0) out.soon.push({ type: 'taskstat', id: t.id, title: t.title, meta: '我发布的任务：' + p.dueSoon + ' 家门店即将到期' });
    });
  }
  return out;
}

/* ---------------- 通用查询 ---------------- */
function storesByCity() {
  const g = {};
  state.stores.forEach(s => { (g[s.city] = g[s.city] || []).push(s); });
  return g;
}
function allStores() { return state.stores.slice(); }
function hqByDept() {
  const g = {};
  state.departments.forEach(d => { g[d] = []; });
  state.hq.forEach(u => { (g[u.dept] = g[u.dept] || []).push(u); });
  return g;
}
function hqSelectList() {
  const g = hqByDept();
  const out = [];
  state.departments.forEach(d => { if (g[d] && g[d].length) out.push({ dept: d, users: g[d] }); });
  return out;
}

/* =========================================================
   管理员后台（门店 / 分区 / 部门 / 账号 / 权限）
   ========================================================= */
const isAdmin = () => !!me && !!me.admin;

function nextStoreId() {
  let max = 0;
  state.stores.forEach(s => { const m = /^ST(\d+)$/.exec(s.id); if (m) max = Math.max(max, Number(m[1])); });
  return 'ST' + String(max + 1).padStart(2, '0');
}
function nextStoreCode() {
  let max = 0;
  state.stores.forEach(s => { const m = /^S(\d+)$/.exec(s.code); if (m) max = Math.max(max, Number(m[1])); });
  return 'S' + String(max + 1).padStart(3, '0');
}
function nextHqId() {
  let max = 0;
  state.hq.forEach(u => { const m = /^HQ(\d+)$/.exec(u.id); if (m) max = Math.max(max, Number(m[1])); });
  return 'HQ' + String(max + 1).padStart(2, '0');
}

/* =========================================================
   门店 / 人员账号的增删改
   服务端模式：必须走后端接口 —— 只在 state 里 push 会得到一个「前端看得见、
   users 表里没有」的空壳账号，店长根本登不进去。
   后端接的是管理员后台原有的「+ 新增门店 / + 新增人员账号」按钮，不新增页面。
   ========================================================= */
async function addStore(data) {
  if (window.__SERVER_MODE && window.Api) {
    const r = await Api.adminSave('store', 'create', null, data);
    return (state.stores || []).find(s => s.id === r.id) || null;
  }
  const s = Object.assign({
    id: nextStoreId(), code: nextStoreCode(), enabled: true,
    pwd: '123456', type: 'store', regionId: null
  }, data);
  /* 账号默认与门店编码一致，避免新增门店无法登录 */
  if (!s.account) s.account = s.code;
  state.stores.push(s); saveState(); return s;
}
async function updateStore(id, patch) {
  const s = getStore(id); if (!s) return;
  if (window.__SERVER_MODE && window.Api) {
    await Api.adminSave('store', 'update', id, Object.assign({}, s, patch));
    return;
  }
  Object.assign(s, patch); saveState();
}
async function removeStore(id) {
  if (window.__SERVER_MODE && window.Api) {
    await Api.adminSave('store', 'delete', id, null);
  }
  state.stores = state.stores.filter(s => s.id !== id);
  state.records = state.records.filter(r => r.storeId !== id);
  if (!window.__SERVER_MODE) saveState();
}
function addRegion(name) {
  const r = { id: uid('RG'), name: name };
  state.regions.push(r); saveState(); return r;
}
function removeRegion(id) {
  state.regions = state.regions.filter(r => r.id !== id);
  state.stores.forEach(s => { if (s.regionId === id) s.regionId = null; });
  saveState();
}
function addDepartment(name) { state.departments.push(name); saveState(); }
function removeDepartment(name) {
  state.departments = state.departments.filter(d => d !== name);
  saveState();
}
async function addHqUser(data) {
  if (window.__SERVER_MODE && window.Api) {
    const r = await Api.adminSave('hq', 'create', null, data);
    return (state.hq || []).find(u => u.id === r.id) || null;
  }
  const u = Object.assign({
    id: nextHqId(), account: nextHqId(), enabled: true,
    committee: false, admin: false, pwd: '123456', type: 'hq'
  }, data);
  state.hq.push(u);
  state.contacts.push({
    id: uid('C'), name: u.name, dept: u.dept, title: u.title,
    duty: u.duty || '（待人事部补充）', phone: u.phone || '', wechat: '', email: ''
  });
  saveState(); return u;
}
async function updateHqUser(id, patch) {
  const u = getHq(id); if (!u) return;
  if (window.__SERVER_MODE && window.Api) {
    await Api.adminSave('hq', 'update', id, Object.assign({}, u, patch));
    return;
  }
  Object.assign(u, patch);
  const c = state.contacts.find(c => c.name === u.name && c.dept === u.dept);
  if (c && patch.dept) c.dept = patch.dept;
  if (c && patch.title) c.title = patch.title;
  saveState();
}
async function removeHqUser(id) {
  if (window.__SERVER_MODE && window.Api) {
    await Api.adminSave('hq', 'delete', id, null);
    return;
  }
  state.hq = state.hq.filter(u => u.id !== id);
  saveState();
}

/* 服务端写接口返回权威 state 后，清掉完成记录索引缓存 */
window.__refreshAfterServerWrite = function () { _ri = null; };

/* =========================================================
   考核设置与得分计算
   ========================================================= */
function getAssessCfg() { return Object.assign({}, ASSESS_DEFAULT, state.assessCfg || {}); }
function saveAssessCfg(cfg) { state.assessCfg = Object.assign({}, ASSESS_DEFAULT, cfg); saveState(); }

/** 阶梯系数：完成率/按时率 → 折算比例 */
function stepFactor(p) {
  if (p >= 95) return 1;
  if (p >= 90) return 0.9;
  if (p >= 80) return 0.75;
  if (p >= 70) return 0.6;
  return 0.4;
}
/** 门店考核得分（依据考核设置） */
function storeAssessScore(c, cfg) {
  cfg = cfg || getAssessCfg();
  const cw = Number(cfg.completionWeight) || 0;
  const ow = Number(cfg.ontimeWeight) || 0;
  const basePart = Math.max(0, (Number(cfg.base) || 0) - cw - ow); // 剩余基础分
  const cScore = cfg.mode === 'step' ? cw * stepFactor(c.rate) : cw * c.rate / 100;
  const oScore = cfg.mode === 'step' ? ow * stepFactor(c.ontimeRate) : ow * c.ontimeRate / 100;
  const deduct = (c.late || 0) * (Number(cfg.lateSubmitDeduct) || 0) + (c.missed || 0) * (Number(cfg.overdueMissDeduct) || 0);
  const total = basePart + cScore + oScore - deduct;
  return {
    basePart, cScore, oScore, deduct,
    lateN: c.late || 0, missN: c.missed || 0,
    total: Math.round(Math.max(0, total) * 10) / 10,
    pass: total >= (Number(cfg.passLine) || 0)
  };
}
/** 需求责任人考核得分（超期 / 被退回重做 扣分） */
function personAssessScore(x, cfg, window) {
  cfg = cfg || getAssessCfg();
  const reopens = {};
  (window || state.demands).forEach(d => {
    if (!d.assign || d.assign.toId !== x.id) return;
    (d.logs || []).forEach(l => { if (l.action === '退回重做') reopens[d.id] = (reopens[d.id] || 0) + 1; });
  });
  const reopenN = Object.keys(reopens).length;
  const deduct = x.overdue * (Number(cfg.demandOverdueDeduct) || 0) + reopenN * (Number(cfg.demandFailDeduct) || 0);
  const total = Math.round(Math.max(0, 100 - deduct) * 10) / 10;
  return { reopenN, deduct, total, pass: total >= (Number(cfg.passLine) || 0) };
}
