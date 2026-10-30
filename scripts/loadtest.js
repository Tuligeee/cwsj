'use strict';
/* 轻量压测（只压测试环境 8790）
   S1 bootstrap 50 并发 × 20 轮
   S3 PUT state 20 并发 × 5 轮（同一版本号，验证乐观锁）
   S2 record submit 20 并发（临时任务）
   输出 JSON：成功率 / P50 / P95 / 状态码分布 */

const BASE = 'http://127.0.0.1:8790';
const fs = require('fs');

function jwt(uid, typ, secret) {
  const crypto = require('crypto');
  const b64 = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const h = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64(JSON.stringify({ uid, t: typ, exp: Math.floor(Date.now() / 1000) + 3600 }));
  const sig = crypto.createHmac('sha256', secret).update(h + '.' + p).digest();
  return h + '.' + p + '.' + b64(sig);
}

const SECRET = fs.readFileSync('/opt/cwsj-stg/data/jwt.secret', 'utf8').trim();
const TOKEN = jwt('HQ17', 'hq', SECRET);

async function req(method, path, body) {
  const t0 = process.hrtime.bigint();
  let status = 0, json = null;
  try {
    const r = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: body ? JSON.stringify(body) : undefined,
    });
    status = r.status;
    json = await r.json().catch(() => null);
  } catch (e) {
    status = -1;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { status, ms, json };
}

function stats(list) {
  const ok = list.filter(x => x.status >= 200 && x.status < 300);
  const times = ok.map(x => x.ms).sort((a, b) => a - b);
  const pct = (p) => times.length ? Math.round(times[Math.min(times.length - 1, Math.floor(times.length * p))]) : 0;
  const codes = {};
  list.forEach(x => { codes[x.status] = (codes[x.status] || 0) + 1; });
  return {
    total: list.length, ok: ok.length,
    rate: Math.round(ok.length / list.length * 1000) / 10,
    p50: pct(0.5), p95: pct(0.95), max: times.length ? Math.round(times[times.length - 1]) : 0,
    codes,
  };
}

async function runPool(n, fn) {
  const out = [];
  await Promise.all(Array.from({ length: n }, async (_, i) => { out.push(await fn(i)); }));
  return out;
}

(async () => {
  const report = {};

  /* 基线 */
  const boot0 = await req('GET', '/api/bootstrap');
  report.baseline = { version: boot0.json.version, tasks: boot0.json.state.tasks.length };

  /* S1：50 并发 × 20 轮 */
  const s1 = [];
  const t1 = Date.now();
  for (let round = 0; round < 20; round++) {
    const r = await runPool(50, () => req('GET', '/api/bootstrap'));
    s1.push(...r);
  }
  report.S1_bootstrap = stats(s1);
  report.S1_bootstrap.seconds = ((Date.now() - t1) / 1000).toFixed(1);

  /* S3：20 并发 PUT 同一版本 × 5 轮 */
  const s3 = [];
  for (let round = 0; round < 5; round++) {
    const b = await req('GET', '/api/bootstrap');
    const version = b.json.version;
    const state = b.json.state;
    const r = await runPool(20, () => req('PUT', '/api/state', { version, data: state }));
    s3.push(...r);
  }
  report.S3_state_put = stats(s3);

  /* S2：临时任务 + 20 并发提交记录 */
  const tid = 'TL' + Date.now();
  const created = await req('POST', '/api/tasks', {
    task: {
      id: tid, title: '压测临时任务', cycle: 'once', status: 'active', dept: '管委会',
      creatorId: 'HQ17', creatorName: '压测', storeIds: ['ST01'],
      createdAt: new Date().toISOString(), content: '压测',
    },
  });
  report.S2_created = created.status;
  const s2 = [];
  for (let i = 0; i < 20; i++) {
    s2.push(await req('POST', '/api/record/submit', {
      taskId: tid, storeId: 'ST01', key: 'K' + i,
      payload: { status: 'done', at: new Date().toISOString(), text: '压测提交 ' + i },
    }));
  }
  report.S2_record_submit = stats(s2);

  /* 清理 */
  const del = await req('DELETE', '/api/tasks/' + tid);
  report.cleanup = del.status;

  /* 资源占用 */
  const after = await req('GET', '/api/bootstrap');
  report.after = { version: after.json.version, tasks: after.json.state.tasks.length };

  console.log(JSON.stringify(report, null, 1));
})();
