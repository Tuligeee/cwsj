'use strict';
/* D1「昨日任务未完成」——每天 10:00 自动发到群（2026-11-16）
   口径：昨天到期、但门店没有提交记录的任务；按门店分组，条数多的排前面。
   - 周期：每日=昨天那一期；每周=昨天正好是该周几；每月=昨天正好是该月几号；专项=昨天截止
   - 已交但被判「待重做」也算没完成，标题后标（待重做）
   - 测试门店默认排除（配置里改）
   - 没有未完成就不发（不刷屏）
   发送通道：钉钉群自定义机器人 webhook（markdown） */

const S = require('./db.js');
const db = S.db;

db.exec(`
CREATE TABLE IF NOT EXISTS group_daily_log (
  d TEXT PRIMARY KEY,
  sent_at TEXT,
  errcode INTEGER,
  errmsg TEXT,
  stores INTEGER,
  items INTEGER
);
`);

const LINK_BASE = (process.env.CWSJ_LINK || 'https://mancado.cn/cwsj/cwsj/').replace(/\/?$/, '/');
const K = 'groupDaily';
const DEF = {
  enabled: 1,
  hour: 10,
  minute: 0,
  url: '',
  exclude: ['ST20'],            /* 测试门店不往群里报 */
  boardLink: LINK_BASE + '#hq-board',
};

function cfg() {
  try {
    const row = db.prepare('SELECT v_json FROM config_kv WHERE k = ?').get(K);
    const o = row ? JSON.parse(row.v_json) : {};
    return Object.assign({}, DEF, o);
  } catch (e) { return Object.assign({}, DEF); }
}
function setCfg(patch) {
  const cur = cfg();
  const next = Object.assign({}, cur, patch || {});
  db.prepare(`INSERT INTO config_kv (k, v_json, updated_at) VALUES (?,?,?)
              ON CONFLICT(k) DO UPDATE SET v_json = excluded.v_json, updated_at = excluded.updated_at`)
    .run(K, JSON.stringify(next), new Date().toISOString());
  return next;
}

const pad2 = (v) => String(v).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const weekKey = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
  return t.getUTCFullYear() + '-W' + String(wk).padStart(2, '0');
};
const monthKey = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1);
const isoWd = (d) => (d.getDay() === 0 ? 7 : d.getDay());
const WD_CN = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' };

/** 这条任务在 dateStr 这天是否到期？返回该期的 periodKey，否则 null */
function periodOf(task, dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  if (task.status !== 'active') return null;
  if (task.startDate && task.startDate > dateStr) return null;
  if (task.stopDate && task.stopDate < dateStr) return null;
  if (task.cycle === 'daily') return dateStr;
  if (task.cycle === 'weekly') return Number(task.weekday) === isoWd(d) ? weekKey(d) : null;
  if (task.cycle === 'monthly') return Number(task.monthDay) === d.getDate() ? monthKey(d) : null;
  if (task.cycle === 'once') {
    if (!task.deadline) return null;
    return String(task.deadline).slice(0, 10) === dateStr ? 'once' : null;
  }
  return null;
}

/** 算出某天的未完成清单 + 拼好的消息文本 */
function build(dateStr, opts) {
  const o = Object.assign({}, cfg(), opts || {});
  const date = dateStr || ymd(new Date(Date.now() - 86400000));
  const st = (S.getState() || {}).state || {};
  const tasks = st.tasks || [];
  const records = st.records || [];
  const stores = st.stores || [];
  const nameOf = (id) => (stores.find((s) => s.id === id) || {}).name || id;
  const skip = new Set((o.exclude || []).map(String));

  const byStore = new Map();
  let totalItems = 0;
  tasks.forEach((t) => {
    const key = periodOf(t, date);
    if (!key) return;
    (t.storeIds || []).forEach((sid) => {
      if (skip.has(String(sid))) return;
      const rec = records.find((r) => r.taskId === t.id && r.storeId === sid && r.periodKey === key);
      let redo = false;
      if (rec) {
        const open = (rec.verdicts || []).filter((v) => !v.resolvedAt).pop();
        if (!open || open.needRedo !== true) return;   /* 交了且没被要求重做 → 算完成 */
        redo = true;
      }
      const list = byStore.get(sid) || { id: sid, name: nameOf(sid), items: [] };
      list.items.push({ title: t.title, dept: t.dept, cycle: t.cycle, redo: redo });
      byStore.set(sid, list);
      totalItems++;
    });
  });

  const rows = Array.from(byStore.values())
    .sort((a, b) => (b.items.length - a.items.length) || String(a.name).localeCompare(String(b.name), 'zh'));

  const d = new Date(date + 'T00:00:00');
  const head = '【昨日任务未完成】' + date.slice(5) + '（' + WD_CN[isoWd(d)] + '）· ' +
    (rows.length ? rows.length + ' 家门店 ' + totalItems + ' 条未交' : '全部完成');
  const lines = ['### ' + head, ''];
  rows.forEach((r) => {
    lines.push('**' + r.name + '（' + r.items.length + '）**');
    lines.push(r.items.map((i) => i.title + (i.redo ? '（待重做）' : '')).join(' / '));
    lines.push('');
  });
  if (rows.length) {
    lines.push('[明细 → 点这里](' + (o.boardLink || DEF.boardLink) + ')');
  }
  const text = lines.join('\n').replace(/\n{3,}$/g, '\n').trimEnd();

  return { date, text, stores: rows, totalStores: rows.length, totalItems, skip: rows.length === 0 };
}

/** 发到群（webhook） */
async function send(dateStr, opts) {
  const o = Object.assign({}, cfg(), opts || {});
  const b = build(dateStr, opts);
  if (b.skip) return { ok: true, skipped: true, reason: '没有未完成，不发', date: b.date };
  if (!o.url) return { ok: false, skipped: true, reason: '没有配置群机器人 webhook', date: b.date };
  const body = {
    msgtype: 'markdown',
    markdown: { title: '昨日任务未完成 ' + b.date.slice(5), text: b.text },
  };
  try {
    const r = await fetch(o.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    const errcode = j.errcode === undefined ? -1 : j.errcode;
    try {
      db.prepare(`INSERT INTO group_daily_log (d, sent_at, errcode, errmsg, stores, items) VALUES (?,?,?,?,?,?)
                  ON CONFLICT(d) DO UPDATE SET sent_at=excluded.sent_at, errcode=excluded.errcode,
                    errmsg=excluded.errmsg, stores=excluded.stores, items=excluded.items`)
        .run(b.date, new Date().toISOString(), errcode, String(j.errmsg || ''), b.totalStores, b.totalItems);
    } catch (e) { /* 日志失败不影响发送 */ }
    return { ok: errcode === 0, errcode: errcode, errmsg: j.errmsg || '', date: b.date, stores: b.totalStores, items: b.totalItems };
  } catch (e) {
    return { ok: false, reason: e.message, date: b.date };
  }
}

/** 今天这个时间点要不要发（每分钟调一次） */
async function tick(now) {
  const o = cfg();
  if (!Number(o.enabled)) return null;
  const n = now || new Date();
  if (n.getHours() !== Number(o.hour) || n.getMinutes() !== Number(o.minute)) return null;
  const today = ymd(n);
  const sent = db.prepare('SELECT d FROM group_daily_log WHERE d = ?').get(today);
  if (sent) return null;
  const yesterday = ymd(new Date(n.getTime() - 86400000));
  const r = await send(yesterday);
  /* 没内容的日期也记一笔，避免同一天反复算 */
  try {
    db.prepare('INSERT OR IGNORE INTO group_daily_log (d, sent_at, errcode, errmsg, stores, items) VALUES (?,?,?,?,?,?)')
      .run(today, new Date().toISOString(), r.ok ? 0 : -2, r.reason || r.errmsg || '', r.stores || 0, r.items || 0);
  } catch (e) {}
  console.log('group_daily', JSON.stringify(r));
  return r;
}

let _timer = null;
function start() {
  if (_timer) return;
  _timer = setInterval(() => { tick().catch((e) => console.error('group_daily.tick', e.message)); }, 60000);
  if (_timer.unref) _timer.unref();
  console.log('group_daily 已启动：每天 ' + cfg().hour + ':' + pad2(cfg().minute) + ' 发群');
}

function register(app, requireAuth) {
  const adminOnly = (req, res, next) => {
    if (!req.actor || !req.actor.isAdmin) return res.status(403).json({ ok: false, msg: '只有管理员可以操作' });
    next();
  };
  app.get('/api/group/daily/cfg', requireAuth, adminOnly, (req, res) => {
    const o = cfg();
    res.json({ ok: true, cfg: { enabled: o.enabled, hour: o.hour, minute: o.minute, exclude: o.exclude, hasUrl: !!o.url } });
  });
  app.post('/api/group/daily/cfg', requireAuth, adminOnly, (req, res) => {
    const p = req.body || {};
    const patch = {};
    ['enabled', 'hour', 'minute', 'exclude', 'url', 'boardLink'].forEach((k) => { if (p[k] !== undefined) patch[k] = p[k]; });
    const o = setCfg(patch);
    res.json({ ok: true, cfg: { enabled: o.enabled, hour: o.hour, minute: o.minute, exclude: o.exclude, hasUrl: !!o.url } });
  });
  app.get('/api/group/daily/preview', requireAuth, adminOnly, (req, res) => {
    const b = build(req.query.date);
    res.json({ ok: true, date: b.date, skip: b.skip, totalStores: b.totalStores, totalItems: b.totalItems, text: b.text });
  });
  app.post('/api/group/daily/send', requireAuth, adminOnly, async (req, res) => {
    const r = await send((req.body || {}).date);
    res.json(Object.assign({ ok: r.ok }, r));
  });
  app.get('/api/group/daily/log', requireAuth, adminOnly, (req, res) => {
    const rows = db.prepare('SELECT * FROM group_daily_log ORDER BY sent_at DESC LIMIT 30').all();
    res.json({ ok: true, rows });
  });
}

module.exports = { build, send, tick, start, cfg, setCfg, register, periodOf, ymd };

