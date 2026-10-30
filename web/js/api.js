/* =========================================================
   api.js — 前端与后端的唯一通道
   职责：
     1. token 存取
     2. 统一 fetch 封装（错误转中文提示）
     3. 登录 / bootstrap / 保存
   设计要点：
     · saveState 做 400ms 防抖 + 串行队列，避免一次操作触发多次写
     · 版本冲突（409）不静默吞掉，明确提示用户刷新，绝不假装保存成功
   ========================================================= */
(function (global) {
  'use strict';

  const TOKEN_KEY = 'cwsj_token_v1';
  /* 与前端同源。自动识别挂载前缀：
     直接跑在根路径 → ''；挂 nginx 的 /cwsj/ 下 → '/cwsj'。
     不写死的原因：上线后 nginx 反代到子路径时，写死 '' 会让所有接口打到站点根，整站 404。 */
  const BASE = (function () {
    try {
      const s = document.currentScript;
      if (!s || !s.src) return '';
      const p = new URL(s.src).pathname;          // '/js/api.js' 或 '/cwsj/js/api.js'
      const i = p.lastIndexOf('/js/api.js');      // 下标必须基于 pathname，不能用整串 URL 的下标
      if (i < 0) return '';
      return p.slice(0, i).replace(/\/$/, '');    // '' 或 '/cwsj'
    } catch (e) { return ''; }
  })();

  let token = localStorage.getItem(TOKEN_KEY) || '';
  let version = 0;
  let conflictLock = false;

  function setToken(t) {
    token = t || '';
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }
  function getToken() { return token; }

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new Error('连不上服务器，请检查网络');
    }
    let data = null;
    try { data = await res.json(); } catch (_) { /* 非 JSON 响应 */ }

    if (res.ok) return data;

    if (res.status === 401) {
      setToken('');
      const msg = (data && data.msg) || '登录已过期，请重新登录';
      const err = new Error(msg);
      err.code = 'UNAUTHORIZED';
      throw err;
    }
    if (res.status === 409 && data && data.code === 'VERSION_CONFLICT') {
      version = data.version;
      const err = new Error(data.msg || '数据已被他人更新');
      err.code = 'VERSION_CONFLICT';
      err.state = data.state;
      throw err;
    }
    const err = new Error((data && data.msg) || ('请求失败（' + res.status + '）'));
    err.code = (data && data.code) || 'HTTP_' + res.status;
    throw err;
  }

  const Api = {
    setToken, getToken,
    get version() { return version; },

    async login(account, pwd, role) {
      const r = await request('POST', '/api/login', { account, pwd, role });
      setToken(r.token);
      version = 0;
      return r;
    },

    async bootstrap() {
      const r = await request('GET', '/api/bootstrap');
      version = r.version;
      return r;                      // { version, state, me }
    },

    async changePassword(oldPwd, newPwd) {
      return request('POST', '/api/change-password', { oldPwd, newPwd });
    },

    /* ---- 完成记录：原子写 ----
       不走整份 state 覆盖，服务端只改这一条，两家门店同时提交也不会互相冲掉 */
    async submitRecord(payload) {
      const r = await request('POST', '/api/record/submit', payload);
      if (typeof r.version === 'number') version = r.version;
      return r;
    },
    async revokeRecord(taskId, periodKey) {
      const r = await request('POST', '/api/record/revoke', { taskId, periodKey });
      if (typeof r.version === 'number') version = r.version;
      return r;
    },

    /* ---- 管理员后台：门店与人员账号 ----
       服务端是权威：接口返回最新 state，前端就地替换，避免「本地改了、库没改」 */
    async adminSave(kind, mode, id, patch) {
      const r = await request('POST', '/api/admin/' + kind, { mode, id, patch });
      Api.applyServerState(r);
      return r;
    },
    async adminResetPwd(target, newPwd) {
      return request('POST', '/api/admin/password', Object.assign({}, target, { newPwd }));
    },
    /* 把服务端返回的 state 合并进 __BOOT_STATE（state 变量与它同一个对象引用） */
    applyServerState(r) {
      if (!r) return;
      if (typeof r.version === 'number') version = r.version;
      if (r.state && window.__BOOT_STATE) {
        const cur = window.__BOOT_STATE;
        Object.keys(cur).forEach((k) => { if (!(k in r.state)) delete cur[k]; });
        Object.assign(cur, r.state);
      }
      if (typeof window.__refreshAfterServerWrite === 'function') window.__refreshAfterServerWrite();
    },

    async uploadImage(dataUrl) {
      const r = await request('POST', '/api/upload', { dataUrl });
      if (!r || !r.url) throw new Error('上传返回异常');
      /* 落库时带上挂载前缀，页面里直接 <img src> 就能显示 */
      return BASE + r.url;
    },

    /* ---- 保存：防抖 + 串行 ---- */
    _timer: null,
    _pending: null,                     // 还没发出去的最新快照（页面卸载时要抢救它）
    _queue: Promise.resolve(),
    queueSave(stateObj, immediate) {
      if (!token) return;                 // 未登录不保存，避免登录页触发 401 循环
      Api._pending = stateObj;
      clearTimeout(Api._timer);
      /* immediate = 关键操作（提交/修改需求等）不防抖，立刻发：
         否则「提交完马上刷新或切账号」会把还没发出的保存打断 → 数据悄悄丢了。
         2026-10-22 实测复现：提交需求后 400ms 内 reload，服务端没有这条需求。 */
      Api._timer = setTimeout(() => {
        Api._timer = null;
        const snapshot = JSON.parse(JSON.stringify(Api._pending));
        Api._pending = null;
        Api._queue = Api._queue.then(() => Api._flush(snapshot, 0)).catch(() => {});
      }, immediate ? 0 : 400);
    },
    /** 页面即将卸载时调用：把防抖里还没发的保存用 keepalive 请求送出去（尽力而为） */
    flushNow() {
      if (!Api._timer || !Api._pending || !token) return;
      clearTimeout(Api._timer);
      Api._timer = null;
      const snapshot = Api._pending;
      Api._pending = null;
      try {
        fetch(BASE + '/api/state', {
          method: 'PUT',
          keepalive: true,                 // 让请求在页面卸载后继续完成
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ version, data: snapshot }),
        });
      } catch (_) { /* 尽力而为，失败不影响卸载 */ }
    },
    async _flush(snapshot, retry) {
      if (conflictLock || !token) return;
      try {
        const r = await request('PUT', '/api/state', { version, data: snapshot });
        version = r.version;
      } catch (e) {
        if (!token) return;               // token 已被清掉，静默退出
        if (e.code === 'UNAUTHORIZED') {
          setToken('');
          toast('登录已过期，请重新登录', 'err');
          setTimeout(() => { if (!document.querySelector('#login-view:not(.hidden)')) location.reload(); }, 300);
          return;
        }
        if (e.code === 'VERSION_CONFLICT') {
          /* 后写覆盖（LWW）：不拦截、不刷新，拿服务端最新版本号直接重发，
             本次提交覆盖他人改动；历史可在「数据快照 → 最近改动」里查与还原。 */
          if (retry < 3) {
            version = e.version || version;
            await new Promise((r) => setTimeout(r, 120));
            return Api._flush(snapshot, retry + 1);
          }
          toast('保存失败：多次冲突（数据仍在本页，请重试）', 'err');
          return;
        }
        if (retry < 2) {
          await new Promise((r) => setTimeout(r, 800));
          return Api._flush(snapshot, retry + 1);
        }
        toast('保存失败：' + e.message + '（数据仍在本页，请勿关闭）', 'err');
      }
    },
  };

  Api.base = BASE;          /* 供其它模块拼接口地址（自动识别 /cwsj 前缀） */
  global.Api = Api;
})(window);
