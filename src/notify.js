'use strict';
/* 钉钉提醒引擎（2026-10-30）
   A 组：任务（新任务 / 临期 / 逾期 / 逾期每日催办 / 门店已提交）
   B 组：提需（提交 / 通过待派发 / 驳回 / 派单 / 完成待确认 / 已确认 / 退回重做 / 临近期望完成日）
   C 组：堆积（超期未处理 / 待评估超 24h / 待确认超 48h）

   安全默认：dry=true（只写预演记录，不真发），enabled=false（定时扫描默认不跑）
   去重：notify_log(event_key, person_id) 唯一
   免打扰：22:00–08:00 不发
   限流：每人每天最多 maxPerDay 条
*/

const path = require('path');
const S = require(path.join(__dirname, 'db.js'));
const db = S.db;
const ding = require('./ding.js');

const LINK_BASE = process.env.CWSJ_LINK || 'http://47.114.33.192/cwsj/';
const QUIET_FROM = 22;   // 22:00
const QUIET_TO = 8;      // 08:00
const MAX_PER_DAY = Number(process.env.NOTIFY_MAX_PER_DAY || 10);
const BRAND_PREFIX = '【纯玩世界 · 门店任务管理】';

db.exec(`
CREATE TABLE IF NOT EXISTS notify_log (
  event_key TEXT NOT NULL,
  person_id TEXT NOT NULL,
  scenario TEXT,
  entity_id TEXT,
  title TEXT,
  body TEXT,
  status TEXT,
  created_at TEXT,
  sent_at TEXT,
  reason TEXT,
  PRIMARY KEY (event_key, person_id)
);
CREATE TABLE IF NOT EXISTS notify_cfg (
  k TEXT PRIMARY KEY,
  v TEXT
);
`);

/* ---------- 配置 ---------- */
function cfg() {
  /* 硬闸：测试环境设 NOTIFY_OFF=1，任何情况下都不发钉钉 */
  if (process.env.NOTIFY_OFF === '1') return { enabled: false, dry: true, maxPerDay: 10, whitelist: [] };
  const get = (k, d) => {
    const r = db.prepare('SELECT v FROM notify_cfg WHERE k = ?').get(k);
    return r ? r.v : d;
  };
  const wl = String(get('whitelist', '') || '').split(',').map(s => s.trim()).filter(Boolean);
  return {
    enabled: get('enabled', '1') === '1',
    dry: get('dry', '0') === '1',
    maxPerDay: Number(get('max_per_day', String(MAX_PER_DAY))),
    whitelist: wl,
  };
}
function setCfg(patch) {
  const st = db.prepare('INSERT INTO notify_cfg (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v');
  Object.keys(patch).forEach(k => st.run(k, String(patch[k])));
}

/* ---------- 日期工具 ---------- */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const atTime = (date, hhmm) => {
  const [h, m] = String(hhmm || '23:59').split(':').map(Number);
  const x = new Date(date);
  x.setHours(h || 0, m || 0, 0, 0);
  return x;
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d) => {
  const x = startOfDay(d);
  const wd = x.getDay() === 0 ? 7 : x.getDay(); // 周一=1
  return addDays(x, -(wd - 1));
};
const fmt = (d) => d ? (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : '—';
const fmtDate = (d) => d ? (d.getMonth() + 1) + '月' + d.getDate() + '日' : '—';

/* 当前周期：返回 {key, due} */
function occurrence(task, now) {
  const t = startOfDay(now);
  if (task.cycle === 'daily') return { key: ymd(t), due: atTime(t, task.time) };
  if (task.cycle === 'weekly') {
    const base = addDays(startOfWeek(t), (task.weekday || 7) - 1);
    return { key: ymd(base), due: atTime(base, task.time) };
  }
  if (task.cycle === 'monthly') {
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    const day = Math.min(task.monthDay || 1, last);
    const base = new Date(t.getFullYear(), t.getMonth(), day);
    return { key: ymd(base), due: atTime(base, task.time) };
  }
  const dl = task.deadline ? new Date(task.deadline) : null;
  return { key: dl ? ymd(dl) : ymd(t), due: dl || atTime(t, task.time) };
}

/* ---------- 收件人 ---------- */
function dingOf(userId) {
  const m = db.prepare('SELECT ding_userid FROM ding_map WHERE user_id = ?').get(userId);
  return m ? m.ding_userid : null;
}
function hqDing(h) {
  if (h.dingUserId) return h.dingUserId;
  return dingOf(h.id);
}
function committee() {
  const st = S.getState().state;
  return (st.hq || []).filter(h => h.committee && h.enabled !== false)
    .map(h => ({ id: h.id, name: h.name, ding: hqDing(h) })).filter(x => x.ding);
}

/* ---------- 限流 / 免打扰 ---------- */
function inQuietHours(now) {
  const h = now.getHours();
  return h >= QUIET_FROM || h < QUIET_TO;
}
function sentToday(personId) {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const r = db.prepare(
    "SELECT COUNT(*) c FROM notify_log WHERE person_id = ? AND status = 'sent' AND created_at >= ?"
  ).get(personId, d0.toISOString());
  return r.c;
}

/* ---------- 夜间积压放行：单条直发，多条合并汇总 ---------- */
const SCEN_CN = {
  A1: '新任务', A2: '任务临期', A3: '任务已逾期', A4: '任务催办', A5: '门店已提交',
  B1: '新需求待评估', B2: '需求待派发', B3: '需求被驳回', B4: '派给你的需求',
  B5: '需求待你确认', B6: '门店已确认', B7: '需求被退回', B8: '需求临近完成日',
  C1: '需求超期未处理', C2: '需求待评估超时', C3: '需求待确认超时',
  TEST: '系统测试', VERIFY: '验证消息'
};

function releaseDeferred() {
  const rows = db.prepare("SELECT * FROM notify_log WHERE status = 'deferred' ORDER BY created_at").all();
  if (!rows.length) return { digests: 0, singles: 0, merged: 0 };
  const byPerson = {};
  rows.forEach(r => { (byPerson[r.person_id] = byPerson[r.person_id] || []).push(r); });
  const upSingle = db.prepare("UPDATE notify_log SET status='pending', reason=NULL WHERE event_key=? AND person_id=?");
  const upMerged = db.prepare("UPDATE notify_log SET status='merged', reason='已并入夜间汇总' WHERE event_key=? AND person_id=?");
  const ins = db.prepare(`INSERT OR REPLACE INTO notify_log
    (event_key, person_id, scenario, entity_id, title, body, status, created_at, sent_at, reason)
    VALUES (?,?,?,?,?,?,?,?,NULL,?)`);
  let digests = 0, singles = 0, mergedCnt = 0;
  const today = new Date().toISOString().slice(0, 10);

  Object.keys(byPerson).forEach(pid => {
    const list = byPerson[pid];
    if (list.length === 1) { upSingle.run(list[0].event_key, pid); singles++; return; }
    /* ≥2 条：按场景归组，生成一条汇总 */
    const groups = {};
    list.forEach(r => { (groups[r.scenario] = groups[r.scenario] || []).push(r); });
    const lines = [];
    Object.keys(groups).forEach(code => {
      const arr = groups[code];
      /* 取正文第一条要点里的对象名（去掉「任务：/需求：」前缀），取不到就不列名字 */
      const names = arr.map(r => {
        const b = String(r.body || '');
        /* 优先取「任务：/需求：」那一行；没有就取第一条要点 */
        const pick = (/(?:^|\n)-\s*(?:任务|需求)[:：]\s*(.+)$/m.exec(b)
                   || /(?:^|\n)-\s*(.+)$/m.exec(b) || [])[1] || '';
        return pick.replace(/^(任务|需求|门店|收件人|当前状态)[:：]\s*/, '').trim();
      }).filter(t => t && t !== (SCEN_CN[code] || code)).slice(0, 3);
      const more = arr.length > names.length ? ' 等' : '';
      const label = SCEN_CN[code] || code;
      lines.push('- ' + label + ' ' + arr.length + ' 条' + (names.length ? ('：' + names.join('、') + more) : ''));
    });
    const body = [
      BRAND_PREFIX + '昨晚有 ' + list.length + ' 条提醒',
      '',
      lines.join('\n'),
      '',
      '[' + '打开平台查看' + '](' + LINK_BASE + ')'
    ].join('\n');
    ins.run('DIGEST|' + pid + '|' + today, pid, 'DIGEST', '-',
      '昨晚有 ' + list.length + ' 条提醒', body, 'pending', new Date().toISOString(), '夜间积压合并');
    list.forEach(r => { upMerged.run(r.event_key, r.person_id); mergedCnt++; });
    digests++;
  });
  return { digests, singles, merged: mergedCnt };
}

/* ---------- 生成候选 ---------- */
function build(now) {
  const state = S.getState().state;
  /* 首次运行（从未发过新任务通知）时不补发历史任务，避免上线瞬间刷屏 */
  const firstRunA1 = !db.prepare("SELECT 1 FROM notify_log WHERE scenario='A1' LIMIT 1").get();
  const out = [];
  const push = (o) => out.push(o);
  const link = () => LINK_BASE;
  const taskLink = (id) => LINK_BASE + '#task=' + encodeURIComponent(id);
  const demandLink = (id) => LINK_BASE + '#demand=' + encodeURIComponent(id);
  const records = state.records || [];

  /* ---- A 组：任务 ---- */
  (state.tasks || []).filter(t => t.status === 'active').forEach(task => {
    const occ = occurrence(task, now);
    const beforeMs = (Number(task.remindBeforeMin) || 0) * 60000;
    const remindAt = new Date(occ.due.getTime() - beforeMs);
    const dueText = fmt(occ.due);

    (task.storeIds || []).forEach(storeId => {
      const store = (state.stores || []).find(s => s.id === storeId);
      if (!store) return;
      const rec = records.find(r => r.taskId === task.id && r.storeId === storeId && r.periodKey === occ.key);
      const staff = dingOf(storeId);
      if (!staff) return;
      /* 本期是否已生效：到期日早于生效日 → 本期不适用，不发临期/逾期/催办 */
      const startTs = task.startDate ? atTime(new Date(task.startDate + 'T00:00:00'), '00:00').getTime() : 0;
      const occActive = occ.due.getTime() >= startTs;
      const base = { to: { id: storeId, name: store.mgr || store.name, ding: staff }, store: store.name, task: task.title };

      if (!rec) {
        /* A1 新任务下发：只对 24 小时内新建的任务发；引擎首次运行不补发历史任务 */
        const born = task.createdAt ? new Date(task.createdAt) : null;
        const isFresh = born && (now - born) < 24 * 3600000;
        if (isFresh && !firstRunA1 && occActive) {
          push(Object.assign({}, base, {
            key: 'A1|' + task.id + '|' + storeId + '|' + (task.createdAt || task.startDate),
            scenario: 'A1', entityId: task.id,
            title: '新任务已下发',
            body: ['**新任务已下发**', '',
              '- 任务：' + task.title,
              '- 截止：' + dueText,
              '- 门店：' + store.name, '',
              '[立即查看并提交](' + taskLink(task.id) + ')'].join('\n'),
          }));
        }
        /* A2 临期 */
        if (occActive && now >= remindAt && now < occ.due) {
          const mins = Math.round((occ.due - now) / 60000);
          const left = mins >= 60 ? Math.round(mins / 60) + ' 小时' : mins + ' 分钟';
          push(Object.assign({}, base, {
            key: 'A2|' + task.id + '|' + storeId + '|' + occ.key,
            scenario: 'A2', entityId: task.id,
            title: '任务即将到期',
            body: ['**任务即将到期（还剩 ' + left + '）**', '',
              '- 任务：' + task.title,
              '- 截止：' + dueText,
              '- 当前状态：未提交', '',
              '[现在去提交](' + taskLink(task.id) + ')'].join('\n'),
          }));
        }
        /* A3 逾期 */
        if (occActive && now > new Date(occ.due.getTime() + 60000)) {
          push(Object.assign({}, base, {
            key: 'A3|' + task.id + '|' + storeId + '|' + occ.key,
            scenario: 'A3', entityId: task.id,
            title: '任务已逾期',
            body: ['**任务已逾期**', '',
              '- 任务：' + task.title,
              '- 原定截止：' + dueText,
              '- 当前状态：逾期未提交', '',
              '[立即补交](' + taskLink(task.id) + ')'].join('\n'),
          }));
          /* A4 逾期后每日催办 */
          if (task.remindOverdue !== false) {
            const nine = atTime(startOfDay(now), '09:00');
            if (now >= nine) {
              const days = Math.max(1, Math.round((startOfDay(now) - startOfDay(occ.due)) / 86400000));
              push(Object.assign({}, base, {
                key: 'A4|' + task.id + '|' + storeId + '|' + occ.key + '|' + ymd(now),
                scenario: 'A4', entityId: task.id,
                title: '任务仍未提交',
                body: ['**任务仍未提交（第 ' + days + ' 天）**', '',
                  '- 任务：' + task.title,
                  '- 原定截止：' + dueText,
                  '- 请尽快补交并说明原因', '',
                  '[去提交](' + taskLink(task.id) + ')'].join('\n'),
              }));
            }
          }
        }
      } else if (rec.doneAt && task.creatorId) {
        /* A5 门店已提交 → 通知任务创建人 */
        const creator = (state.hq || []).find(h => h.id === task.creatorId);
        const cd = creator ? hqDing(creator) : dingOf(task.creatorId);
        if (cd) {
          push({
            key: 'A5|' + task.id + '|' + storeId + '|' + occ.key,   /* 当天只通知一次，改提交不再重发 */
            scenario: 'A5', entityId: task.id,
            to: { id: task.creatorId, name: creator ? creator.name : '创建人', ding: cd },
            title: '门店已提交任务',
            body: ['**门店已提交任务**', '',
              '- 任务：' + task.title,
              '- 门店：' + store.name,
              '- 提交人：' + (rec.by || store.mgr || '—'),
              '- 时间：' + fmt(new Date(rec.doneAt)), '',
              '[查看进度明细](' + taskLink(task.id) + ')'].join('\n'),
          });
        }
      }
    });
  });

  /* ---- B / C 组：提需 ---- */
  const hqs = committee();
  (state.demands || []).filter(d => !d.deletedAt).forEach(d => {
    const store = (state.stores || []).find(s => s.id === d.storeId);
    const storeDing = dingOf(d.storeId);
    const toStore = storeDing ? [{ id: d.storeId, name: store ? (store.mgr || store.name) : d.storeName, ding: storeDing }] : [];
    const toAssignee = d.assign && d.assign.toId ? (() => {
      const h = (state.hq || []).find(x => x.id === d.assign.toId);
      const dg = h ? hqDing(h) : dingOf(d.assign.toId);
      return dg ? [{ id: d.assign.toId, name: d.assign.toName || (h && h.name) || '责任人', ding: dg }] : [];
    })() : [];
    const label = (d.code || d.id) + ' ' + (d.title || '');
    const cAt = d.createdAt ? fmt(new Date(d.createdAt)) : '—';

    if (d.status === 'pending') {
      /* B1 新需求待评估 */
      hqs.forEach(h => push({
        key: 'B1|' + d.id + '|' + cAt, scenario: 'B1', entityId: d.id,
        to: h, title: '有新的门店需求待评估',
        body: ['**有新的门店需求待评估**', '',
          '- 需求：' + label,
          '- 门店：' + (d.storeName || '—'),
          '- 提交时间：' + cAt, '',
          '[去评估](' + demandLink(d.id) + ')'].join('\n'),
      }));
      /* C2 待评估超 24 小时 */
      const hrs = Math.floor((now - new Date(d.createdAt)) / 3600000);
      if (hrs >= 24) {
        hqs.forEach(h => push({
          key: 'C2|' + d.id + '|' + ymd(now), scenario: 'C2', entityId: d.id,
          to: h, title: '有需求超 24 小时未评估',
          body: ['**有需求超 24 小时未评估**', '',
            '- 需求：' + label,
            '- 门店：' + (d.storeName || '—'),
            '- 已等待：' + hrs + ' 小时', '',
            '[去评估](' + demandLink(d.id) + ')'].join('\n'),
        }));
      }
    }

    if (d.status === 'approved' && d.review) {
      /* B2 已通过 · 待派发 */
      hqs.forEach(h => push({
        key: 'B2|' + d.id + '|' + (d.review.at || ''), scenario: 'B2', entityId: d.id,
        to: h, title: '需求已通过，待派发',
        body: ['**需求已通过，待派发**', '',
          '- 需求：' + label,
          '- 门店：' + (d.storeName || '—'), '',
          '[去派发](' + demandLink(d.id) + ')'].join('\n'),
      }));
    }

    if (d.status === 'rejected' && d.review) {
      /* B3 被驳回 → 门店 */
      toStore.forEach(s => push({
        key: 'B3|' + d.id + '|' + (d.review.at || ''), scenario: 'B3', entityId: d.id,
        to: s, title: '你的需求被驳回',
        body: ['**你的需求被驳回**', '',
          '- 需求：' + label,
          '- 驳回原因：' + (d.review.comment || '—'), '',
          '[查看并修改后重新提交](' + demandLink(d.id) + ')'].join('\n'),
      }));
    }

    if (d.status === 'assigned' && d.assign) {
      /* B4 派单给你 */
      toAssignee.forEach(s => push({
        key: 'B4|' + d.id + '|' + (d.assign.at || ''), scenario: 'B4', entityId: d.id,
        to: s, title: '有新的需求派给你',
        body: ['**有新的需求派给你**', '',
          '- 需求：' + label,
          '- 来源门店：' + (d.storeName || '—'),
          '- 期望完成：' + (d.assign.expectDate || '未定'),
          d.assign.note ? '- 说明：' + d.assign.note : '', '',
          '[去处理](' + demandLink(d.id) + ')'].join('\n').replace(/\n\n\n/g, '\n\n'),
      }));
      /* B8 临近期望完成日（提前 1 天 09:00） */
      if (d.assign.expectDate) {
        const exp = new Date(d.assign.expectDate + 'T23:59:00');
        const remind = atTime(addDays(startOfDay(exp), -1), '09:00');
        if (now >= remind && now < exp) {
          toAssignee.forEach(s => push({
            key: 'B8|' + d.id + '|' + d.assign.expectDate, scenario: 'B8', entityId: d.id,
            to: s, title: '需求临近期望完成日',
            body: ['**需求临近期望完成日**', '',
              '- 需求：' + label,
              '- 期望完成：' + fmtDate(exp) + '（还剩 1 天）', '',
              '[去处理](' + demandLink(d.id) + ')'].join('\n'),
          }));
        }
        /* C1 超期未处理 */
        if (now > exp) {
          const over = Math.max(1, Math.round((startOfDay(now) - startOfDay(exp)) / 86400000));
          const list = toAssignee.concat(hqs.map(h => ({ id: h.id, name: h.name, ding: h.ding })));
          list.forEach(s => push({
            key: 'C1|' + d.id + '|' + ymd(now), scenario: 'C1', entityId: d.id,
            to: s, title: '需求已超期未处理',
            body: ['**需求已超期未处理**', '',
              '- 需求：' + label,
              '- 期望完成：' + fmtDate(exp) + '（已超 ' + over + ' 天）',
              '- 责任人：' + (d.assign.toName || '—'), '',
              '[去跟进](' + demandLink(d.id) + ')'].join('\n'),
          }));
        }
      }
    }

    if (d.status === 'completed' && d.complete) {
      /* B5 已完成 · 待门店确认 */
      toStore.concat(hqs.map(h => ({ id: h.id, name: h.name, ding: h.ding }))).forEach(s => push({
        key: 'B5|' + d.id + '|' + (d.complete.at || ''), scenario: 'B5', entityId: d.id,
        to: s, title: '需求已处理完成，待确认',
        body: ['**需求已处理完成，待确认**', '',
          '- 需求：' + label,
          '- 处理人：' + (d.complete.byName || '—'),
          '- 处理说明：' + (d.complete.text || '—'), '',
          '[去确认](' + demandLink(d.id) + ')'].join('\n'),
      }));
      /* C3 待确认超 48 小时 */
      const hrs = Math.floor((now - new Date(d.complete.at)) / 3600000);
      if (hrs >= 48) {
        toStore.forEach(s => push({
          key: 'C3|' + d.id + '|' + ymd(now), scenario: 'C3', entityId: d.id,
          to: s, title: '需求完成超 48 小时未确认',
          body: ['**需求完成超 48 小时未确认**', '',
            '- 需求：' + label,
            '- 已完成：' + hrs + ' 小时，仍未确认', '',
            '[去确认](' + demandLink(d.id) + ')'].join('\n'),
        }));
      }
    }

    if (d.status === 'confirmed' && d.confirm) {
      /* B6 门店已确认 → 责任人 */
      toAssignee.forEach(s => push({
        key: 'B6|' + d.id + '|' + (d.confirm.at || ''), scenario: 'B6', entityId: d.id,
        to: s, title: '门店已确认完成',
        body: ['**门店已确认完成**', '',
          '- 需求：' + label,
          '- 评分：' + (d.confirm.rating || 0) + ' 星',
          d.confirm.comment ? '- 评价：' + d.confirm.comment : ''].join('\n').replace(/\n\n\n/g, '\n\n'),
      }));
    }

    /* B7 退回重做：看最后一条日志 */
    const logs = d.logs || [];
    const last = logs[logs.length - 1];
    if (last && last.action === '退回重做' && d.status === 'assigned') {
      toAssignee.forEach(s => push({
        key: 'B7|' + d.id + '|' + last.at, scenario: 'B7', entityId: d.id,
        to: s, title: '需求被退回重做',
        body: ['**需求被退回重做**', '',
          '- 需求：' + label,
          '- 退回原因：' + (last.note || '—'), '',
          '[重新处理](' + demandLink(d.id) + ')'].join('\n'),
      }));
    }
  });

  /* 统一格式：【品牌】+ 一句话标题（同一行）→ 空行 → 分点 → 链接
     用户 2026-10-30 定的开头样式 */
  out.forEach(item => {
    if (!item.body) return;
    const lines = item.body.split('\n');
    const i = lines.findIndex(l => l.trim());
    if (i < 0) return;
    const first = lines[i].replace(/\*\*/g, '').trim();
    lines.splice(i, 1);
    while (lines.length && !lines[0].trim()) lines.shift();
    item.body = BRAND_PREFIX + first + '\n\n' + lines.join('\n').trim();
  });
  return out;
}

/* ---------- 落库 / 发送 ---------- */
function scan(opts) {
  const o = opts || {};
  const c = cfg();
  const dry = o.dry !== undefined ? o.dry : c.dry;
  const now = o.now || new Date();
  const quiet = inQuietHours(now);
  /* 静音时段结束（08:00 之后）→ 放行积压：
     同一人 1 条：原样补发；≥2 条：合成一条「昨晚有 N 条提醒」汇总（用户 2026-11-01 定） */
  let digestInfo = null;
  if (!quiet) {
    try { digestInfo = releaseDeferred(); } catch (e) { console.error('releaseDeferred', e.message); }
  }
  const cands = build(now);
  const ins = db.prepare(`INSERT OR IGNORE INTO notify_log
    (event_key, person_id, scenario, entity_id, title, body, status, created_at, sent_at, reason)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const newRows = [];
  const tx = db.transaction(() => {
    cands.forEach(n => {
      /* 站内消息需要一个可跳转的深链接：任务类带 fill=1（门店点击直接填写） */
      if (!n.hash) {
        n.hash = n.scenario && n.scenario[0] === 'A'
          ? '#task=' + encodeURIComponent(n.entityId) + (['A1', 'A2', 'A3', 'A4'].indexOf(n.scenario) >= 0 ? '&fill=1' : '')
          : '#demand=' + encodeURIComponent(n.entityId);
      }
      let status = dry ? 'dry' : 'pending';
      let reason = dry ? '预演模式，未发送' : '';
      if (quiet) { status = dry ? 'dry' : 'deferred'; reason = '免打扰时段（22:00–08:00）'; }
      else if (!dry && sentToday(n.to.id) >= c.maxPerDay) { status = 'skipped'; reason = '超出每日上限 ' + c.maxPerDay + ' 条'; }
      const info = ins.run(n.key, n.to.id, n.scenario, n.entityId, n.title, n.body,
        status, now.toISOString(), dry ? null : now.toISOString(), reason);
      if (info.changes) newRows.push(Object.assign({}, n, { status, reason }));
    });
  });
  tx();
  /* 记录保留 90 天，超期自动清理（用户 2026-10-31 定） */
  try { db.prepare("DELETE FROM notify_log WHERE coalesce(sent_at, created_at) < datetime('now','-90 days')").run(); } catch (e) {}
  /* 站内收件箱：与钉钉共用同一批候选，但独立存储（不受 dry 影响） */
  try { require('./inbox').ingest(newRows); } catch (e) { console.error('inbox.ingest', e.message); }
  return { total: cands.length, queued: newRows.length, dry, quiet, rows: newRows };
}

/* 真正发送（供后续切换实发时调用） */
async function flush() {
  if (process.env.NOTIFY_OFF === '1') return { ok: false, msg: '该环境禁止发送钉钉' };
  const c = cfg();
  if (c.dry) return { ok: false, msg: '当前是预演模式' };
  /* 只发 pending；deferred 是静音时段积压的，由 scan 在 08:00 后转回 pending */
  const rows = db.prepare("SELECT * FROM notify_log WHERE status = 'pending' LIMIT 50").all();
  let sent = 0, failed = 0;
  const wl = c.whitelist || [];
  /* 测试环境专用：所有外发强制转给指定人（NOTIFY_FORCE_TO），
     不管收件人本来是谁，绝不触达真实门店 */
  const forceTo = (process.env.NOTIFY_FORCE_TO || '').trim();
  for (const r of rows) {
    /* 测试白名单：名单外的人不发钉钉（站内消息照常） */
    if (wl.length && wl.indexOf(r.person_id) < 0) {
      db.prepare("UPDATE notify_log SET status='skipped', reason='测试白名单外' WHERE event_key=? AND person_id=?").run(r.event_key, r.person_id);
      failed++;
      continue;
    }
    const mp = db.prepare('SELECT ding_userid FROM ding_map WHERE user_id = ?').get(r.person_id);
    const h = (S.getState().state.hq || []).find(x => x.id === r.person_id);
    const dingId = (h && h.dingUserId) || (mp && mp.ding_userid);
    if (!dingId) {
      db.prepare("UPDATE notify_log SET status='skipped', reason='没有钉钉账号' WHERE event_key=? AND person_id=?").run(r.event_key, r.person_id);
      failed++; continue;
    }
    let res;
    let realDingId = dingId;
    if (forceTo) {
      const fh = (S.getState().state.hq || []).find(x => x.id === forceTo);
      const fm = db.prepare('SELECT ding_userid FROM ding_map WHERE user_id = ?').get(forceTo);
      realDingId = (fh && fh.dingUserId) || (fm && fm.ding_userid) || dingId;
    }
    try { res = await ding.sendMarkdown(realDingId, r.title, r.body); }
    catch (e) { res = { ok: false, reason: e.message }; }
    if (res.ok) {
      db.prepare("UPDATE notify_log SET status='sent', sent_at=? WHERE event_key=? AND person_id=?").run(new Date().toISOString(), r.event_key, r.person_id);
      sent++;
    } else {
      db.prepare("UPDATE notify_log SET reason=? WHERE event_key=? AND person_id=?").run(String(res.reason || '').slice(0, 200), r.event_key, r.person_id);
      failed++;
    }
    await new Promise(r2 => setTimeout(r2, 120));
  }
  return { ok: true, sent, failed };
}

function list(limit) {
  return db.prepare('SELECT scenario, person_id, entity_id, title, status, created_at, reason FROM notify_log ORDER BY created_at DESC LIMIT ?').all(limit || 50);
}
function clearDry() {
  const r = db.prepare("DELETE FROM notify_log WHERE status = 'dry'").run();
  return r.changes;
}
function stats() {
  const one = (s) => db.prepare('SELECT COUNT(*) c FROM notify_log WHERE status = ?').get(s).c;
  return { dry: one('dry'), pending: one('pending'), sent: one('sent'), skipped: one('skipped'), deferred: one('deferred'), merged: one('merged') };
}

module.exports = { scan, flush, list, clearDry, stats, cfg, setCfg, build };
