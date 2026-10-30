'use strict';
/* 钉钉单聊提醒模块（2026-10-29）
   - 凭据从 /opt/cwsj/.ding.env 读取（chmod 600），不从代码里写死
   - 只做两件事：给人发单聊、刷新通讯录快照
   失败一律抛错，由调用方记录，不静默吞掉。 */

const fs = require('fs');
const path = require('path');

const ENV_FILE = process.env.DING_ENV_FILE || '/opt/cwsj/.ding.env';
const API = 'https://oapi.dingtalk.com';
const API2 = 'https://api.dingtalk.com';

function loadEnv() {
  const out = {};
  try {
    fs.readFileSync(ENV_FILE, 'utf8').split('\n').forEach(line => {
      const s = line.trim();
      if (!s || s.startsWith('#')) return;
      const i = s.indexOf('=');
      if (i < 0) return;
      out[s.slice(0, i).trim()] = s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    });
  } catch (e) {
    throw new Error('读取 ' + ENV_FILE + ' 失败：' + e.message);
  }
  if (!out.DINGTALK_APP_KEY || !out.DINGTALK_APP_SECRET || !out.DINGTALK_ROBOT_CODE) {
    throw new Error('钉钉凭据不完整（需要 DINGTALK_APP_KEY / APP_SECRET / ROBOT_CODE）');
  }
  return out;
}

let _tok = null;
let _tokExp = 0;

async function getToken(force) {
  const now = Date.now();
  if (!force && _tok && now < _tokExp - 60000) return _tok;
  const env = loadEnv();
  const url = API + '/gettoken?appkey=' + encodeURIComponent(env.DINGTALK_APP_KEY)
    + '&appsecret=' + encodeURIComponent(env.DINGTALK_APP_SECRET);
  const r = await fetch(url);
  const j = await r.json();
  if (j.errcode !== 0) throw new Error('gettoken 失败：' + j.errcode + ' ' + j.errmsg);
  _tok = j.access_token;
  _tokExp = now + (j.expires_in || 7200) * 1000;
  return _tok;
}

/* 发一条单聊消息。返回 {ok, reason} —— 不抛异常，调用方好记录。 */
async function sendSingle(dingUserId, content) {
  try {
    const env = loadEnv();
    const tok = await getToken();
    const r = await fetch(API2 + '/v1.0/robot/oToMessages/batchSend', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-acs-dingtalk-access-token': tok,
      },
      body: JSON.stringify({
        robotCode: env.DINGTALK_ROBOT_CODE,
        userIds: [dingUserId],
        msgKey: 'sampleText',
        msgParam: JSON.stringify({ content: content }),
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, reason: 'HTTP ' + r.status + ' ' + JSON.stringify(j).slice(0, 200) };
    const bad = (j.invalidStaffIdList || []).concat(j.filteredStaffIdList || []);
    if (bad.length) return { ok: false, reason: '收件人无效：' + bad.join(',') };
    return { ok: true, key: j.processQueryKey || '' };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/* 拉一次通讯录：递归部门 + 分页成员 */
async function fetchAllPeople() {
  const tok = await getToken();
  const q = (u) => u + (u.includes('?') ? '&' : '?') + 'access_token=' + tok;
  const listSub = async (deptId) => {
    const r = await fetch(q(API + '/topapi/v2/department/listsub'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dept_id: deptId }),
    }).then(x => x.json());
    if (r.errcode !== 0) throw new Error('listsub 失败：' + r.errmsg);
    return r.result || [];
  };
  const listUsers = async (deptId) => {
    const out = [];
    let cursor = 0;
    for (let guard = 0; guard < 50; guard++) {
      const r = await fetch(q(API + '/topapi/v2/user/list'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dept_id: deptId, cursor: cursor, size: 100 }),
      }).then(x => x.json());
      if (r.errcode !== 0) throw new Error('user/list 失败：' + r.errmsg);
      const res = r.result || {};
      (res.list || []).forEach(u => out.push(u));
      if (!res.has_more) break;
      cursor = res.next_cursor;
    }
    return out;
  };

  const depts = [];
  const seen = new Set();
  const walk = async (id, depth) => {
    const subs = await listSub(id);
    for (const d of subs) {
      if (seen.has(d.dept_id)) continue;
      seen.add(d.dept_id);
      depts.push({ id: d.dept_id, name: d.name });
      if (depth < 5) await walk(d.dept_id, depth + 1);
    }
  };
  await walk(1, 0);
  const dname = {};
  depts.forEach(d => { dname[d.id] = d.name; });
  dname[1] = '根部门';

  const people = new Map();
  for (const did of [1].concat(depts.map(d => d.id))) {
    const users = await listUsers(did);
    users.forEach(u => {
      if (!u.userid) return;
      if (!people.has(u.userid)) {
        people.set(u.userid, {
          userid: u.userid, name: u.name, title: u.title || '',
          mobile: u.mobile || '', depts: [],
        });
      }
      people.get(u.userid).depts.push(dname[did] || String(did));
    });
  }
  return { people: Array.from(people.values()), deptCount: depts.length + 1 };
}

/* 发送 Markdown 单聊消息（标题 + 正文，钉钉 sampleMarkdown） */
async function sendMarkdown(dingUserId, title, text) {
  try {
    const env = loadEnv();
    const tok = await getToken();
    const r = await fetch(API2 + '/v1.0/robot/oToMessages/batchSend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-acs-dingtalk-access-token': tok },
      body: JSON.stringify({
        robotCode: env.DINGTALK_ROBOT_CODE,
        userIds: [dingUserId],
        msgKey: 'sampleMarkdown',
        msgParam: JSON.stringify({ title: title, text: text }),
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, reason: 'HTTP ' + r.status + ' ' + JSON.stringify(j).slice(0, 200) };
    const bad = (j.invalidStaffIdList || []).concat(j.filteredStaffIdList || []);
    if (bad.length) return { ok: false, reason: '收件人无效：' + bad.join(',') };
    return { ok: true, key: j.processQueryKey || '' };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

module.exports = { loadEnv, getToken, sendSingle, sendMarkdown, fetchAllPeople, ENV_FILE };
