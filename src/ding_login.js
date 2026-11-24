'use strict';
/* =========================================================
   ding_login.js — 钉钉登录（扫码 / 钉钉内免登）
   2026-11-24 新增。设计要点：
   · 只认**域名**：钉钉回调地址必须是域名，IP 直连不可用
   · 会话不变：换到人之后仍然签 auth.sign() 那套 JWT，前端一行都不用改
   · token 不进 URL：回调只带回一次性 ticket（5 分钟），前端再换 token
   · 一个钉钉号可能绑多个账号（ding_map 反向不唯一）→ 回多个身份让用户选
   · DING_MOCK=1 时跳过钉钉网络，用 code 直接当 userid，供本地联调
   ========================================================= */
const crypto = require('crypto');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { db } = require('./db');
const { SECRET } = require('./auth');
const ding = require('./ding');

const API2 = 'https://api.dingtalk.com';
const OAPI = 'https://oapi.dingtalk.com';

/* 回调域名前缀：线上 https://mancado.cn/cwsj，测试 https://mancado.cn/cwsj/cwsj-stg
   必须显式配置 —— nginx 会剥掉挂载前缀，服务端自己推不出来。 */
const BASE = (process.env.DING_LOGIN_BASE || '').replace(/\/+$/, '');
const MOCK = process.env.DING_MOCK === '1';

/* ---------- 登录专用凭据 ----------
   扫码登录要的是「开了网页应用能力」的那个应用的 AppKey/AppSecret，
   而机器人用的是另一个（现在恰好是同一个）。
   允许用 DING_LOGIN_APP_KEY / DING_LOGIN_APP_SECRET 单独指定，
   没配就回落到机器人那套。不经过 ding.loadEnv()，因为它强制要求 ROBOT_CODE。 */
const ENV_FILE = process.env.DING_ENV_FILE || '/opt/cwsj/.ding.env';

function readEnvFile() {
  const out = {};
  try {
    fs.readFileSync(ENV_FILE, 'utf8').split('\n').forEach(line => {
      const s = line.trim();
      if (!s || s.startsWith('#')) return;
      const i = s.indexOf('=');
      if (i < 0) return;
      out[s.slice(0, i).trim()] = s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    });
  } catch (e) { /* 读不到就交给调用方报错 */ }
  return out;
}

function loadLoginEnv() {
  const env = readEnvFile();
  const key = env.DING_LOGIN_APP_KEY || env.DINGTALK_APP_KEY || process.env.DING_LOGIN_APP_KEY;
  const secret = env.DING_LOGIN_APP_SECRET || env.DINGTALK_APP_SECRET || process.env.DING_LOGIN_APP_SECRET;
  if (!key || !secret) throw new Error('没有登录用的钉钉应用凭据（DING_LOGIN_APP_KEY / DING_LOGIN_APP_SECRET 或 DINGTALK_APP_KEY / SECRET）');
  return { key, secret };
}

/* ding_map / ding_people 两张表历史上是手工在服务器上建的，仓库里没有建表语句。
   这里补一份 IF NOT EXISTS：新库（比如重建的测试库）也能跑，老库不受影响。 */
function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ding_map (
      user_id     TEXT PRIMARY KEY,
      ding_userid TEXT NOT NULL,
      ding_name   TEXT,
      source      TEXT,
      updated_by  TEXT,
      updated_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ding_map_userid ON ding_map (ding_userid);
    CREATE TABLE IF NOT EXISTS ding_people (
      userid     TEXT PRIMARY KEY,
      name       TEXT,
      title      TEXT,
      depts      TEXT,
      updated_at TEXT
    );
  `);
}

/* ---------- state：防 CSRF，10 分钟有效 ---------- */
const states = new Map();
function newState() {
  const s = crypto.randomBytes(16).toString('hex');
  states.set(s, Date.now());
  const cut = Date.now() - 10 * 60 * 1000;
  for (const [k, t] of states) if (t < cut) states.delete(k);
  return s;
}
function takeState(s) {
  const t = states.get(s);
  if (!t) return false;
  states.delete(s);
  return Date.now() - t < 10 * 60 * 1000;
}

/* ---------- 钉钉侧：code → 企业 userId ---------- */
async function codeToDingUserid(code) {
  if (MOCK) return String(code);            // 本地联调：code 就是 userid

  const env = loadLoginEnv();
  const r = await fetch(API2 + '/v1.0/oauth2/userAccessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: env.key,
      clientSecret: env.secret,
      code,
      grantType: 'authorization_code',
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.accessToken) {
    throw new Error('换 accessToken 失败：' + (j.message || j.code || ('HTTP ' + r.status)));
  }

  const me = await fetch(API2 + '/v1.0/contact/users/me', {
    headers: { 'x-acs-dingtalk-access-token': j.accessToken },
  }).then(x => x.json().catch(() => ({})));
  if (!me.unionId) throw new Error('没拿到 unionId：' + (me.message || 'unknown'));

  /* unionId → 企业内 userId（ding_map 存的是 userId） */
  const tok = await ding.getToken();
  const u = await fetch(OAPI + '/topapi/user/getbyunionid?access_token=' + encodeURIComponent(tok), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unionid: me.unionId }),
  }).then(x => x.json().catch(() => ({})));
  if (u.errcode !== 0 || !u.result || !u.result.userid) {
    throw new Error('该钉钉号不在本企业通讯录里（' + (u.errmsg || u.errcode) + '）');
  }
  return u.result.userid;
}

/* ---------- 本地：钉钉 userid → 平台账号 ---------- */
function candidatesOf(dingUserid) {
  return db.prepare(
    'SELECT u.id, u.type, u.name, u.account FROM users u '
    + 'JOIN ding_map m ON m.user_id = u.id '
    + 'WHERE m.ding_userid = ? AND u.enabled = 1 ORDER BY u.type DESC, u.id'
  ).all(dingUserid);
}

function publicUser(row) {
  return { id: row.id, type: row.type, name: row.name, account: row.account };
}

/* ---------- 路由 ---------- */
function startUrl() {
  if (!BASE) throw new Error('没有配置 DING_LOGIN_BASE（例：https://mancado.cn/cwsj/cwsj-stg）');
  let key;
  try {
    key = loadLoginEnv().key;
  } catch (e) {
    if (!MOCK) throw e;                       // 真跑必须凭据齐全；本地 mock 允许没有 .ding.env
    key = 'mock-app-key';
  }
  const state = newState();
  const redirect = BASE + '/api/auth/ding/callback';
  const q = new URLSearchParams({
    redirect_uri: redirect,
    response_type: 'code',
    client_id: key,
    scope: 'openid',
    state,
    prompt: 'consent',
  });
  return 'https://login.dingtalk.com/oauth2/auth?' + q.toString();
}

/* 回调成功：签一张 5 分钟 ticket，把人带回登录页（token 不进 URL） */
function issueTicket(dingUserid, cands) {
  return jwt.sign({ k: 'ding', d: dingUserid, u: cands.map(c => c.id) }, SECRET, { expiresIn: '5m' });
}

function readTicket(ticket) {
  const p = jwt.verify(ticket, SECRET);
  if (!p || p.k !== 'ding') throw new Error('票据无效');
  return p;
}

async function callback(req, res) {
  const back = BASE || '';
  const fail = (msg) => res.redirect(302, back + '/?ding_err=' + encodeURIComponent(msg));
  try {
    const { code, state } = req.query;
    if (!code) return fail('钉钉没有返回授权码');
    if (!state || !takeState(state)) return fail('授权已过期，请重新点击钉钉登录');

    const dingUserid = await codeToDingUserid(String(code));
    const cands = candidatesOf(dingUserid);
    if (!cands.length) return fail('这个钉钉号还没绑定平台账号，请先用账号密码登录后在「钉钉提醒」里绑定');

    const ticket = issueTicket(dingUserid, cands);
    /* 单个身份直接换；多个身份去选人页 */
    return res.redirect(302, back + '/?ding=' + encodeURIComponent(ticket)
      + (cands.length > 1 ? '&pick=1' : ''));
  } catch (e) {
    return fail(e.message || '钉钉登录失败');
  }
}

/* 用 ticket 换 token：cands 里只有一个时才允许直接换 */
function exchange(ticket) {
  const p = readTicket(ticket);
  const cands = candidatesOf(p.d).filter(c => p.u.includes(c.id));
  if (!cands.length) throw new Error('该账号已停用或绑定已解除');
  if (cands.length > 1) {
    const err = new Error('这个钉钉号绑了多个账号，请选择要进入的身份');
    err.code = 'NEED_PICK';
    err.candidates = cands.map(publicUser);
    throw err;
  }
  return cands[0];
}

/* ---------- 钉钉内免登（H5 / JSAPI） ----------
   2026-11-24：这个企业的控制台不提供「扫码登录」能力（所有参数组合都回 900103
   Application does not exist），网页应用能力描述写的就是「免登」，所以主路径改成：
   在钉钉里打开 → dd.runtime.permission.requestAuthCode → 服务端换 userId。
   依赖：DING_CORP_ID（企业 CorpId）、DING_AGENT_ID（默认 4738071575）。 */
const CORP_ID = process.env.DING_CORP_ID || '';
const AGENT_ID = process.env.DING_AGENT_ID || '4738071575';

let _jsapi = { ticket: '', exp: 0 };

async function getJsapiTicket() {
  if (_jsapi.ticket && Date.now() < _jsapi.exp - 60000) return _jsapi.ticket;
  const tok = await ding.getToken();
  const j = await fetch(OAPI + '/get_jsapi_ticket?access_token=' + encodeURIComponent(tok))
    .then(x => x.json()).catch(() => ({}));
  if (j.errcode !== 0 || !j.ticket) throw new Error('取 jsapi_ticket 失败：' + (j.errmsg || j.errcode));
  _jsapi = { ticket: j.ticket, exp: Date.now() + (j.expires_in || 7200) * 1000 };
  return _jsapi.ticket;
}

/* dd.config 签名。corpId 优先用调用方给的（钉钉打开网页应用时会在 URL 上带），
   没有再回落到环境变量 —— 这样没拿到企业 CorpId 也能先跑起来。 */
async function jsapiConfig(url, corpIdFromClient) {
  const corp = /^ding[0-9A-Za-z]{10,}$/.test(String(corpIdFromClient || ''))
    ? String(corpIdFromClient)
    : CORP_ID;
  if (!corp) throw new Error('没有配置 DING_CORP_ID（企业 CorpId），免登录用不了');
  const ticket = await getJsapiTicket();
  const nonceStr = crypto.randomBytes(8).toString('hex');
  const timeStamp = String(Math.floor(Date.now() / 1000));
  const plain = 'jsapi_ticket=' + ticket + '&noncestr=' + nonceStr + '&timestamp=' + timeStamp + '&url=' + url;
  const signature = crypto.createHash('sha1').update(plain).digest('hex');
  return { corpId: corp, agentId: AGENT_ID, timeStamp, nonceStr, signature };
}

/* 免登码 → 企业 userId */
async function h5CodeToUserid(code) {
  if (MOCK) return String(code);
  const tok = await ding.getToken();
  const j = await fetch(OAPI + '/topapi/user/getuserinfo?access_token=' + encodeURIComponent(tok), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  }).then(x => x.json()).catch(() => ({}));
  if (j.errcode !== 0 || !j.result || !j.result.userid) {
    throw new Error('免登码换 userId 失败：' + (j.errmsg || j.errcode));
  }
  return j.result.userid;
}

/* ---------- 路由挂载（server.js 和单测共用同一份） ---------- */
function mount(app, deps) {
  const sign = deps.sign;
  const log = deps.log || (() => {});
  ensureSchema();

  app.get('/api/auth/ding/jsapi', async (req, res) => {
    try {
      const url = String(req.query.url || '');
      if (!url) return res.status(400).json({ ok: false, msg: '缺少页面地址' });
      res.json(Object.assign({ ok: true }, await jsapiConfig(url, req.query.corpId)));
    } catch (e) {
      res.status(500).json({ ok: false, msg: e.message });
    }
  });

  app.post('/api/auth/ding/h5', async (req, res) => {
    const code = String((req.body || {}).code || '');
    if (!code) return res.status(400).json({ ok: false, msg: '缺少免登码' });
    try {
      const dingUserid = await h5CodeToUserid(code);
      const cands = candidatesOf(dingUserid);
      if (!cands.length) {
        return res.json({ ok: false, msg: '这个钉钉号还没绑定平台账号，请先用账号密码登录后在「钉钉提醒」里绑定' });
      }
      if (cands.length > 1) {
        return res.json({ ok: false, code: 'NEED_PICK', msg: '这个钉钉号绑了多个账号，请选择身份',
          candidates: cands.map(publicUser), ticket: issueTicket(dingUserid, cands) });
      }
      const row = cands[0];
      const token = sign({ id: row.id, type: row.type });
      log(row.id, 'login.ding.h5', row.name);
      res.json({ ok: true, token, user: publicUser(row) });
    } catch (e) {
      res.status(400).json({ ok: false, msg: e.message });
    }
  });

  app.get('/api/auth/ding/start', (req, res) => {
    try {
      res.redirect(302, startUrl());
    } catch (e) {
      res.status(500).json({ ok: false, msg: e.message });
    }
  });

  app.get('/api/auth/ding/callback', callback);

  /* 登录页用 ticket 换 token。一个钉钉号绑了多个账号时返回 NEED_PICK + 候选身份。 */
  app.post('/api/auth/ding/token', (req, res) => {
    const ticket = String((req.body || {}).ticket || '');
    if (!ticket) return res.status(400).json({ ok: false, msg: '缺少登录票据' });
    try {
      const row = exchange(ticket);
      const token = sign({ id: row.id, type: row.type });
      log(row.id, 'login.ding', row.name);
      res.json({ ok: true, token, user: publicUser(row) });
    } catch (e) {
      if (e.code === 'NEED_PICK') {
        return res.json({ ok: false, code: 'NEED_PICK', msg: e.message, candidates: e.candidates });
      }
      res.status(400).json({ ok: false, msg: e.message });
    }
  });

  /* 选身份后签发同一套 token */
  app.post('/api/auth/ding/pick', (req, res) => {
    const { ticket, userId } = req.body || {};
    try {
      const p = readTicket(String(ticket || ''));
      const wanted = String(userId || '');
      if (!p.u.includes(wanted)) return res.status(400).json({ ok: false, msg: '身份不匹配，请重新登录' });
      const row = candidatesOf(p.d).find(c => c.id === wanted);
      if (!row) return res.status(400).json({ ok: false, msg: '该账号已停用或绑定已解除' });
      const token = sign({ id: row.id, type: row.type });
      log(row.id, 'login.ding', row.name);
      res.json({ ok: true, token, user: publicUser(row) });
    } catch (e) {
      res.status(400).json({ ok: false, msg: e.message });
    }
  });
}

module.exports = {
  mount, ensureSchema, startUrl, callback, exchange, candidatesOf, publicUser, readTicket, MOCK, BASE,
};
