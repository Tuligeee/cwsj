/* =========================================================
   seedState.js — 复用前端 buildSeed() 生成服务端初始业务数据
   为什么不在 Node 里重写一份种子：
     前端 web/js/seed.js（427 行）里的任务、完成记录、需求单、日志
     是全套业务口径的样例数据，重写一份必然与前端漂移。
     这里用 vm 把 util.js + seed.js 原样加载进来跑一次 buildSeed()，
     拿到的就是前端首次打开时写入 localStorage 的那份数据，
     保证「本地演示」和「服务端」看到的是同一套东西。
   注意：只取业务数据，密码一律剥掉（密码只存在 users 表里，走 bcrypt）。
   ========================================================= */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WEB_JS_DIR = path.join(__dirname, '..', 'web', 'js');
/* 有依赖顺序：seed.js 用到 util.js 里的 startOfDay / addDays / ymd / mulberry32 */
const FILES = ['util.js', 'seed.js'];

function stripSecrets(list) {
  return (Array.isArray(list) ? list : []).map((o) => {
    const c = Object.assign({}, o);
    delete c.pwd;
    delete c.password;
    return c;
  });
}

/**
 * 生成初始 state；失败返回 null（调用方回退到空集合，不让启动挂掉）
 */
function buildSeedState() {
  const sandbox = {
    console,
    /* util.js / seed.js 里个别分支会碰浏览器 API，给最小桩 */
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    toast: () => {},
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  for (const f of FILES) {
    const p = path.join(WEB_JS_DIR, f);
    if (!fs.existsSync(p)) throw new Error(`缺少前端脚本：${p}`);
    vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: f });
  }

  if (typeof sandbox.buildSeed !== 'function') throw new Error('前端 seed.js 未导出 buildSeed()');
  const raw = sandbox.buildSeed();
  if (!raw || typeof raw !== 'object') throw new Error('buildSeed() 返回空');

  return {
    meta: raw.meta || {},
    regions: raw.regions || [],
    departments: raw.departments || [],
    assessCfg: raw.assessCfg || null,
    stores: stripSecrets(raw.stores),
    hq: stripSecrets(raw.hq),
    tasks: raw.tasks || [],
    records: raw.records || [],
    demands: raw.demands || [],
    contacts: raw.contacts || [],
  };
}

module.exports = { buildSeedState };
