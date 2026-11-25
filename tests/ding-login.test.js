'use strict';
/* 钉钉登录单测（2026-11-24）
   不依赖 better-sqlite3 / 真实钉钉：把 ./db、./auth、./ding 三个模块换成内存假件，
   跑的是 server.js 里挂载的同一份路由（ding_login.mount）。
   覆盖：开始跳转、单身份登录、多身份选择、state 重放、未绑定钉钉号。 */

const Module = require('module');
const path = require('path');

/* ---------- 假数据 ---------- */
const users = [
  { id: 'ST01', type: 'store', name: '南昌一店', account: 'nanchang1', enabled: 1 },
  { id: 'ST02', type: 'store', name: '南昌二店', account: 'nanchang2', enabled: 1 },
  { id: 'HQ24', type: 'hq', name: '张文华', account: 'zhangwh', enabled: 1 },
  { id: 'ST09', type: 'store', name: '停用门店', account: 'off9', enabled: 0 },
];
const map = [
  { user_id: 'ST01', ding_userid: 'ding_zhang' },
  { user_id: 'HQ24', ding_userid: 'ding_zhang' },   // 一个钉钉号绑两个账号
  { user_id: 'ST02', ding_userid: 'ding_li' },
  { user_id: 'ST09', ding_userid: 'ding_off' },     // 绑了但账号停用
];

const fakeDb = {
  db: {
    exec() {},
    prepare(sql) {
      if (/FROM users u\s+JOIN ding_map/.test(sql)) {
        return {
          all: (dingUserid) => map
            .filter(m => m.ding_userid === dingUserid)
            .map(m => users.find(u => u.id === m.user_id))
            .filter(u => u && u.enabled)
            .sort((a, b) => (a.type < b.type ? 1 : -1) || (a.id < b.id ? -1 : 1)),
        };
      }
      return { all: () => [], get: () => undefined, run: () => {} };
    },
  },
};

const fakeAuth = { SECRET: 'test-secret' };
const fakeDing = { loadEnv: () => ({ DINGTALK_APP_KEY: 'mock-app-key' }), getToken: async () => 'tok' };

/* ---------- 注入假模块 ---------- */
const SRC = path.join(__dirname, '..', 'src');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const fromSrc = parent && parent.filename && parent.filename.startsWith(SRC);
  if (fromSrc && request === './db') return fakeDb;
  if (fromSrc && request === './auth') return fakeAuth;
  if (fromSrc && request === './ding') return fakeDing;
  return origLoad.apply(this, arguments);
};

process.env.DING_MOCK = '1';
process.env.DING_LOGIN_BASE = 'https://example.test/cwsj-stg';

const express = require('express');
const jwt = require('jsonwebtoken');
const dl = require('../src/ding_login');

const app = express();
app.use(express.json());
dl.mount(app, { sign: (u) => jwt.sign({ uid: u.id, t: u.type }, 'test-secret'), log: () => {} });

/* ---------- 迷你断言 ---------- */
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' → ' + extra : '')); }
}

(async () => {
  const srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const get = (p) => fetch(base + p, { redirect: 'manual' });
  const post = (p, body) => fetch(base + p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(r => r.json().then(j => ({ status: r.status, ...j })));

  console.log('\n[1] 开始跳转');
  const start = await get('/api/auth/ding/start');
  const loc = start.headers.get('location') || '';
  ok('302 到钉钉授权页', start.status === 302 && loc.startsWith('https://login.dingtalk.com/oauth2/auth?'), loc);
  const u = new URL(loc);
  ok('redirect_uri 用配置的域名前缀', u.searchParams.get('redirect_uri') === 'https://example.test/cwsj-stg/api/auth/ding/callback', u.searchParams.get('redirect_uri'));
  ok('client_id 取自钉钉凭据', u.searchParams.get('client_id') === 'mock-app-key');
  const state = u.searchParams.get('state');

  console.log('\n[2] 单身份：钉钉号只绑一个账号');
  const cb1 = await get('/api/auth/ding/callback?code=ding_li&state=' + state);
  const loc1 = cb1.headers.get('location') || '';
  ok('回调 302 回登录页', cb1.status === 302 && loc1.startsWith('https://example.test/cwsj-stg/?ding='), loc1);
  ok('单身份不带 pick', !loc1.includes('pick=1'));
  const ticket1 = new URL(loc1).searchParams.get('ding');
  ok('URL 里没有 token', !/token|jwt/i.test(loc1));
  const ex1 = await post('/api/auth/ding/token', { ticket: ticket1 });
  ok('ticket 换到 token', ex1.ok === true && !!ex1.token, JSON.stringify(ex1));
  ok('身份是南昌二店', ex1.user && ex1.user.id === 'ST02', JSON.stringify(ex1.user));

  console.log('\n[3] state 只能使用一次');
  const replay = await get('/api/auth/ding/callback?code=ding_li&state=' + state);
  ok('重放被拒并回错误', replay.status === 302 && (replay.headers.get('location') || '').includes('ding_err='), replay.headers.get('location'));

  console.log('\n[4] 多身份：一个钉钉号绑两个账号');
  const st2 = new URL((await get('/api/auth/ding/start')).headers.get('location')).searchParams.get('state');
  const cb2 = await get('/api/auth/ding/callback?code=ding_zhang&state=' + st2);
  const loc2 = cb2.headers.get('location') || '';
  ok('带 pick=1 进选身份页', loc2.includes('pick=1'), loc2);
  const ticket2 = new URL(loc2).searchParams.get('ding');
  const ex2 = await post('/api/auth/ding/token', { ticket: ticket2 });
  ok('直接换被拒，返回 NEED_PICK', ex2.code === 'NEED_PICK' && Array.isArray(ex2.candidates) && ex2.candidates.length === 2, JSON.stringify(ex2));
  const pick = await post('/api/auth/ding/pick', { ticket: ticket2, userId: 'HQ24' });
  ok('选定 HQ24 拿到 token', pick.ok === true && pick.user.id === 'HQ24', JSON.stringify(pick));
  const bad = await post('/api/auth/ding/pick', { ticket: ticket2, userId: 'ST09' });
  ok('不能选票据外的身份', bad.status === 400, JSON.stringify(bad));

  console.log('\n[5] 异常：没绑定 / 账号停用');
  const st3 = new URL((await get('/api/auth/ding/start')).headers.get('location')).searchParams.get('state');
  const cb3 = await get('/api/auth/ding/callback?code=ding_nobody&state=' + st3);
  ok('未绑定钉钉号 → 提示绑定', (cb3.headers.get('location') || '').includes('ding_err='), cb3.headers.get('location'));
  const st4 = new URL((await get('/api/auth/ding/start')).headers.get('location')).searchParams.get('state');
  const cb4 = await get('/api/auth/ding/callback?code=ding_off&state=' + st4);
  ok('账号停用 → 不给登录', (cb4.headers.get('location') || '').includes('ding_err='), cb4.headers.get('location'));

  console.log('\n[6] 票据校验');
  const forged = await post('/api/auth/ding/token', { ticket: 'not-a-ticket' });
  ok('伪造 ticket 被拒', forged.status === 400, JSON.stringify(forged));
  const empty = await post('/api/auth/ding/token', {});
  ok('空 ticket 被拒', empty.status === 400, JSON.stringify(empty));

  srv.close();
  console.log('\n结果：通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试崩了：', e); process.exit(1); });
