/* =========================================================
   app.js — 登录、路由、导航、提醒中心
   ========================================================= */

const ROUTES = {
  store: [
    {
      /* 周期不再拆成 4 个导航项，合并成一个「我的任务」页，页内用「今日/本周/本月/全部」筛选
         专项任务(once) 排序规则不同，保留为独立入口 */
      g: '我的任务', items: [{ id: 'tasks', label: '我的任务', icon: '☀️' }]
    },
    {
      g: '需求与协同', items: [
        { id: 'demands', label: '我的提需', icon: '✉️' },
        { id: 'contacts', label: '通讯录', icon: '📇' }
      ]
    },
    { g: '数据', items: [{ id: 'mystats', label: '我的数据', icon: '📊' }] },
    { g: '更多', items: window.innerWidth <= 900 ? [{ id: 'more', label: '更多', icon: '⋯' }] : [] }
  ],
  hq: [
    {
      g: '门店协同', items: [
        { id: 'hq-demands', label: '门店提需', icon: '📥' }
      ]
    },
    {
      g: '任务管理', items: [
        { id: 'hq-tasks', label: '任务管理', icon: '📝' },
        { id: 'hq-board', label: '任务督办看板', icon: '📋' }
      ]
    },
    {
      g: '公司', items: [
        { id: 'hq-contacts', label: '通讯录', icon: '📇' },
        { id: 'hq-stats', label: '数据统计与考核', icon: '📊' },
        { id: 'admin', label: '管理员后台', icon: '🛡️', admin: true }
      ]
    },
    { g: '更多', items: window.innerWidth <= 900 ? [{ id: 'more', label: '更多', icon: '⋯' }] : [] }
  ]
};

const PAGE_TITLE = {
  tasks: ['我的任务', '按今日 / 本周 / 本月 / 全部筛选 · 临期标黄 · 逾期标红'],
  once: ['专项任务', '只下发一次的任务；未完成的按截止时间置顶'],
  demands: ['我的提需', '向管理公司各部门提需求，管委会评估后派发责任人'],
  contacts: ['通讯录', '什么事找谁 · 由人事部维护'],
  mystats: ['我的数据', '门店任务完成情况统计，用于考核'],
  'hq-demands': ['门店提需', '评估 → 派发 → 处理 → 门店确认'],
  'hq-tasks': ['任务管理', '默认看我发布的；管委会可切换看全公司'],
  'hq-board': ['任务督办看板', '任务 × 门店矩阵，快速定位逾期门店'],
  'hq-contacts': ['通讯录', '管理公司各部门职责与对接人 · 由人事部维护'],
  'hq-stats': ['数据统计与考核', '门店任务完成 + 管理公司需求处理数据'],
  admin: ['管理员后台', '门店与分区 · 部门与账号 · 权限分配'],
  more: ['更多', '手机端未放进底部导航的页面']
};

let currentRoute = null;

/* ---------------- 导航徽标 ---------------- */
function navBadge(id) {
  if (!me) return 0;
  if (isStore()) {
    /* 合并成一个「我的任务」入口后，徽标 = 今日 + 逾期未完成 的数量 */
    if (id === 'tasks') {
      const b = storeBuckets(me.id, new Date());
      return b.today.filter(x => x.status !== 'done' && x.status !== 'late').length;
    }
    if (id === 'demands') {
      return visibleDemands().filter(d => d.storeId === me.id && d.status === 'completed').length;
    }
  } else {
    if (id === 'hq-demands') {
      let n = 0;
      if (isCommittee()) n += visibleDemands().filter(d => d.status === 'pending' || d.status === 'approved').length;
      n += visibleDemands().filter(d => d.assign && d.assign.toId === me.id && d.status === 'assigned').length;
      return n;
    }
  }
  return 0;
}

/* ---------------- 渲染应用骨架 ---------------- */
function renderApp() {
  $('#app').classList.remove('hidden');
  $('#login-view').classList.add('hidden');
  renderSideFoot();
  renderUserChip();
  go(currentRoute || (isStore() ? 'tasks' : 'hq-demands'), true);
}
function renderSideFoot() {
  const f = $('#side-foot');
  clear(f);
  f.appendChild(h('div', {}, [
    h('div', {}, '当前身份'),
    h('div', { style: { color: 'var(--text-2)', fontWeight: '600', marginTop: '2px' } },
      isStore() ? (me.name + ' · 店长 ' + me.mgr) : (me.name + ' · ' + me.dept + ' ' + me.title))
  ]));
}
function renderUserChip() {
  const chip = $('#user-chip');
  clear(chip);
  const av = h('div', { class: 'uav' + (isStore() ? ' g' : '') }, (isStore() ? me.name.slice(0, 1) : me.name.slice(0, 1)));
  chip.appendChild(av);
  chip.appendChild(h('div', {}, [
    h('div', { class: 'un' }, isStore() ? me.name : me.name),
    h('div', { class: 'ur' }, isStore() ? ('门店账号 ' + me.account) : (me.dept + ' · ' + me.title))
  ]));
}

/* ---------------- 路由 ---------------- */
/* ---------- 深链接：钉钉消息里的 #task=<id> / #demand=<id> ---------- */
function applyDeepLink() {
  const m = (location.hash || '').match(/^#(task|demand)=([^&]+)(?:&(fill=1))?/);
  if (!m) return;
  if (!me) { setTimeout(applyDeepLink, 500); return; }   /* 还没登录/还没拉到数据，稍后再试 */
  const kind = m[1];
  const id = decodeURIComponent(m[2]);
  const wantFill = m[3] === 'fill=1';
  const storeSide = isStore();
  try {
    go(kind === 'task' ? (storeSide ? 'tasks' : 'hq-tasks') : (storeSide ? 'demands' : 'hq-demands'));
  } catch (e) { return; }
  const attr = kind === 'task' ? 'taskId' : 'demandId';
  const sel = kind === 'task' ? '[data-task-id]' : '[data-demand-id]';
  let tries = 0;
  const tick = () => {
    const el = Array.prototype.slice.call(document.querySelectorAll(sel)).find(n => n.dataset[attr] === id);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('deep-hit');
      setTimeout(() => el.classList.remove('deep-hit'), 5000);
      /* 直接从消息点进来 → 打开详情弹窗（点卡片自带的按钮，各角色行为一致） */
      try {
        const btns = Array.prototype.slice.call(el.querySelectorAll('button'));
        const click = (re) => { const b = btns.find(x => re.test(x.textContent)); if (b) { b.click(); return true; } return false; };
        if (wantFill) {
          /* 消息里带 &fill=1 → 直接打开填写框（未完成=提交完成，已提交=修改提交） */
          if (!click(/提交完成|修改提交|去提交/)) click(/详情|进度明细|查看/);
        } else {
          if (!click(/详情|进度明细|查看/)) click(/提交完成|修改提交/);
        }
      } catch (e) {}
      return;
    }
    if (tries++ < 16) setTimeout(tick, 250);
  };
  setTimeout(tick, 350);
}
window.addEventListener('hashchange', applyDeepLink);

function go(id, silent) {
  currentRoute = id;
  const routes = ROUTES[isStore() ? 'store' : 'hq'];
  const nav = $('#side-nav');
  clear(nav);
  routes.forEach(grp => {
    const items = grp.items.filter(it => !it.admin || (me && me.admin));
    if (!items.length) return;
    nav.appendChild(h('div', { class: 'nav-group', text: grp.g }));
    items.forEach(it => {
      const n = navBadge(it.id);
      const el = h('div', {
        class: 'nav-item' + (it.id === id ? ' active' : ''),
        dataset: { nav: it.id },        /* 手机端按 id 隐藏部分入口（CSS 里控制，桌面端不受影响） */
        onclick: () => go(it.id)
      }, [
        h('span', { class: 'ni' }, it.icon),
        h('span', { class: 'nl', text: it.label }),
        n > 0 ? h('span', { class: 'nav-badge' }, n > 99 ? '99+' : String(n)) : null
      ]);
      nav.appendChild(el);
    });
  });

  const t = PAGE_TITLE[id] || ['工作台', ''];
  $('#page-title').textContent = t[0];
  $('#page-sub').textContent = t[1]
    + (isStore() ? '（' + me.name + '）' : '')
    + '　·　' + ymd(new Date()) + ' ' + WD_CN[isoWeekday(new Date()) - 1];

  const content = clear($('#content'));
  let node = null;
  try {
    node = isStore() ? PAGE_STORE[id]() : PAGE_HQ[id]();
  } catch (err) {
    console.error(err);
    node = h('div', { class: 'empty' }, [h('span', { class: 'eico' }, '⚠️'), h('div', { text: '页面渲染出错：' + err.message })]);
  }
  content.appendChild(node || emptyNode('页面不存在', '❓'));
  content.scrollTop = 0;
  closeBell();
  if (!silent) refreshBell();
}
function refreshNav() { go(currentRoute, true); }

/* ---------------- 操作日志 ---------------- */
var AUDIT_LABEL = {
  'login.ok': '登录', 'login.fail': '登录失败', 'state.save': '保存数据', 'state.deny': '保存被拒',
  'demand.delete': '删除需求', 'demand.delete.deny': '删除需求被拒',
  'demand.harddelete.deny': '物理删除被拒', 'img.upload': '上传图片'
};
function openAuditLog() {
  var box = h('div', { class: 'audit-list' });
  box.appendChild(h('div', { class: 'fhint', text: '加载中' }));
  var inst = openModal({
    title: '操作日志', sub: '最近 50 条', body: box,
    footer: [h('button', { class: 'btn', onclick: function () { inst.close(); } }, '关闭')]
  });
  fetch('/cwsj/api/audit?limit=50', { headers: { Authorization: 'Bearer ' + localStorage.getItem('cwsj_token_v1') } })
    .then(function (r) { return r.json(); })
    .then(function (r) {
      clear(box);
      if (!r.ok) {
        box.appendChild(h('div', { class: 'fhint', text: r.msg || '读取失败' }));
        return;
      }
      r.rows.forEach(function (row) {
        var left = h('div', { class: 'ar-l' }, [
          h('div', { class: 'ar-a', text: AUDIT_LABEL[row.action] || row.action }),
          h('div', { class: 'ar-d', text: row.detail || '' })
        ]);
        var right = h('div', { class: 'ar-r' }, [
          h('div', { class: 'ar-u', text: row.name || row.userId || '' }),
          h('div', { class: 'ar-t', text: row.at })
        ]);
        box.appendChild(h('div', { class: 'audit-row' }, [left, right]));
      });
      box.appendChild(h('div', { class: 'fhint', text: '共 ' + r.total + ' 条' }));
    })
    .catch(function () { clear(box); box.appendChild(h('div', { class: 'fhint', text: '网络错误' })); });
}

/* ---------------- 提醒中心 ---------------- */
function refreshBell() {
  const r = buildReminders();
  const n = r.urgent.length + r.soon.length;
  const dot = $('#bell-dot');
  dot.classList.toggle('hidden', n === 0);
  dot.textContent = n > 99 ? '99+' : String(n);
}
function closeBell() { $('#bell-panel').classList.add('hidden'); }
function toggleBell() {
  const p = $('#bell-panel');
  if (!p.classList.contains('hidden')) { closeBell(); return; }
  const r = buildReminders();
  clear(p);
  const total = r.urgent.length + r.soon.length + r.info.length;
  p.appendChild(h('div', { class: 'bp-head' }, [
    h('b', {}, '提醒中心' + (total ? '（' + total + '）' : '')),
    h('button', { class: 'btn btn-xs', onclick: () => { closeBell(); refreshNav(); refreshBell(); } }, '刷新')
  ]));
  if (!total) {
    p.appendChild(h('div', { class: 'bp-empty' }, [h('div', { style: { fontSize: '26px', marginBottom: '8px' } }, '🎉'), h('div', {}, '暂时没有需要处理的提醒')]));
  } else {
    const sec = (title, arr, kind) => {
      if (!arr.length) return;
      p.appendChild(h('div', { class: 'bp-sec', text: title + '（' + arr.length + '）' }));
      arr.forEach(o => p.appendChild(h('div', { class: 'bp-item', onclick: () => jumpTo(o) }, [
        h('div', { class: 'bp-bar ' + kind }),
        h('div', { style: { flex: '1', minWidth: '0' } }, [
          h('div', { class: 'bp-t', text: o.title }),
          h('div', { class: 'bp-m', text: o.meta })
        ])
      ])));
    };
    sec('紧急', r.urgent, 'danger');
    sec('即将到期 / 待跟进', r.soon, '');
    sec('提示', r.info, 'info');
  }
  p.classList.remove('hidden');
}
function jumpTo(o) {
  closeBell();
  if (isStore()) {
    if (o.type === 'task') go('tasks');
    else go('demands');
  } else {
    if (o.type === 'review' || o.type === 'assign') go('hq-demands');
    else if (o.type === 'handle') go('hq-demands');
    else if (o.type === 'taskstat') go('hq-tasks');
  }
}

/* ---------------- 登录页 ---------------- */
let loginRole = 'store';
function renderLogin() {
  $('#app').classList.add('hidden');
  const wrap = clear($('#login-view'));
  wrap.classList.remove('hidden');

  const accBox = h('div', { class: 'acc-chips hidden' });
  const accInput = inputNode({ placeholder: '请输入账号', autocomplete: 'off' });
  const pwd = h('input', { class: 'input', type: 'password', placeholder: '请输入密码', value: '' });
  const err = h('div', { class: 'login-err' });

  function fillAcc(account) {
    accInput.value = account;
    pwd.value = '';
    err.textContent = '';
    pwd.focus();
  }
  function paintAcc() {
    /* 安全：线上版本不再枚举账号清单，也不预填默认密码 */
    clear(accBox);
    accBox.classList.add('hidden');
  }
  paintAcc();

  /* 不再让用户选身份：账号本身就是唯一的，服务端按账号查出是门店还是管理公司 */
  async function doLogin() {
    if (!accInput.value.trim() || !pwd.value) { err.textContent = '请输入账号和密码'; return; }
    err.textContent = '登录中…';
    const r = await login(accInput.value, pwd.value);
    if (!r.ok) { err.textContent = r.msg; return; }
    err.textContent = '';
    currentRoute = null;
    /* 服务端模式：登录成功后拉一次全量数据 */
    if (window.__SERVER_MODE) {
      try {
        const b = await Api.bootstrap();
        window.__BOOT_STATE = b.state;
        window.__BOOT_ME = b.me;
        loadState();
      } catch (e) {
        err.textContent = '加载数据失败：' + e.message;
        return;
      }
    }
    renderApp();
    setTimeout(applyDeepLink, 400);
    toast('欢迎回来，' + r.user.name, 'ok');
    if (r.mustChangePwd) setTimeout(() => toast('当前仍是初始密码，建议尽快修改', 'err'), 1500);
  }
  pwd.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  accInput.addEventListener('keydown', e => { if (e.key === 'Enter') pwd.focus(); });

  const card = h('div', { class: 'login-card' }, [
    h('div', { class: 'login-left' }, [
      h('div', { class: 'login-logo' }, '纯'),
      h('h2', {}, '纯玩世界'),
      h('p', {}, '连锁门店任务管理平台 · 门店与管理公司协同工作台'),
      h('div', { class: 'login-feats' }, [
        h('div', { class: 'login-feat' }, [h('i', {}, '1'), h('span', {}, '每日 / 每周 / 每月必做任务一次设定长期循环，专项任务执行完即停')]),
        h('div', { class: 'login-feat' }, [h('i', {}, '2'), h('span', {}, '任务与需求均支持文字 + 图片 + 链接，凭证留痕可追溯')]),
        h('div', { class: 'login-feat' }, [h('i', {}, '3'), h('span', {}, '临期自动标黄、逾期标红，到期前与过期后双重提醒')]),
        h('div', { class: 'login-feat' }, [h('i', {}, '4'), h('span', {}, '门店提需 → 管委会评估 → 派发责任人 → 门店确认，全程留痕')]),
        h('div', { class: 'login-feat' }, [h('i', {}, '5'), h('span', {}, '门店完成情况与管理公司需求处理数据自动汇总，直接用于考核')])
      ])
    ]),
    h('div', { class: 'login-right' }, [
      h('h3', {}, '登录'),
      h('p', { class: 'lsub' }, '输入账号和密码，系统自动识别门店或管理公司'),
      h('div', { class: 'field' }, [h('label', {}, '账号'), accInput]),
      h('div', { class: 'field' }, [h('label', {}, '密码'), pwd]),
      err,
      h('button', { class: 'btn btn-primary', style: { width: '100%', justifyContent: 'center', padding: '10px' }, onclick: doLogin }, '登录'),
      h('div', { class: 'login-hint' }, [
        h('div', { class: 'ht' }, '账号或密码忘记了，请联系管理公司管理员重置'),
        accBox
      ])
    ])
  ]);
  wrap.appendChild(card);
}

/* ---------------- 修改密码 ---------------- */
function openChangePwdModal() {
  const oldPwd = inputNode({ type: 'password', placeholder: '当前密码', autocomplete: 'current-password' });
  const newPwd = inputNode({ type: 'password', placeholder: '新密码（至少 6 位）', autocomplete: 'new-password' });
  const newPwd2 = inputNode({ type: 'password', placeholder: '再输一次新密码', autocomplete: 'new-password' });
  const err = h('div', { class: 'login-err' });

  const inst = openModal({
    title: '修改密码',
    sub: '修改后当前登录仍然有效',
    narrow: true,
    body: h('div', {}, [
      h('div', { class: 'field' }, [h('label', {}, '当前密码'), oldPwd]),
      h('div', { class: 'field' }, [h('label', {}, '新密码'), newPwd]),
      h('div', { class: 'field' }, [h('label', {}, '确认新密码'), newPwd2]),
      err,
    ]),
    footer: [
      h('button', { class: 'btn', onclick: () => inst.close() }, '取消'),
      h('button', {
        class: 'btn btn-primary', onclick: async () => {
          if (!newPwd.value || newPwd.value.length < 6) { err.textContent = '新密码至少 6 位'; return; }
          if (newPwd.value !== newPwd2.value) { err.textContent = '两次输入的新密码不一致'; return; }
          try {
            await Api.changePassword(oldPwd.value, newPwd.value);
            inst.close();
            toast('密码已修改', 'ok');
          } catch (e) { err.textContent = e.message; }
        }
      }, '保存'),
    ],
  });
}

/* ---------------- 顶栏交互 ---------------- */
function bindTopbar() {
  $('#bell-btn').addEventListener('click', e => { e.stopPropagation(); toggleBell(); });
  $('#theme-btn').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });
  const chip = $('#user-chip'), menu = $('#user-menu');
  chip.addEventListener('click', e => {
    e.stopPropagation();
    if (!menu.classList.contains('hidden')) { menu.classList.add('hidden'); return; }
    clear(menu);
    menu.appendChild(h('div', { class: 'um-head' }, [
      h('b', {}, me.name + (isStore() ? '' : '　' + me.title)),
      h('span', {}, isStore() ? (me.account + '　' + me.city) : (me.account + '　' + me.dept))
    ]));


    menu.appendChild(h('div', {
      class: 'um-item', onclick: () => {
        menu.classList.add('hidden');
        go(isStore() ? 'tasks' : 'hq-demands');
        refreshBell();
      }
    }, '🏠 我的工作台'));
    menu.appendChild(h('div', {
      class: 'um-item', onclick: () => {
        menu.classList.add('hidden');
        logout(); renderLogin(); toast('已退出登录');
      }
    }, '↩ 退出登录'));
    menu.appendChild(h('div', {
      class: 'um-item', onclick: () => {
        menu.classList.add('hidden');
        openChangePwdModal();
      }
    }, '🔑 修改密码'));
    menu.classList.remove('hidden');
  });
  document.addEventListener('click', () => {
    $('#user-menu').classList.add('hidden');
    closeBell();
  });
  $('#bell-panel').addEventListener('click', e => e.stopPropagation());
  $('#user-menu').addEventListener('click', e => e.stopPropagation());
}

/* ---------------- 启动 ---------------- */
let _booted = false;
async function boot() {
  if (_booted) return;
  _booted = true;
  initTheme();

  /* 本构建始终走服务端模式（本地单机演示请用桌面原版） */
  window.__SERVER_MODE = true;

  /* 有 token 就先换数据；token 失效会自动落到登录页 */
  if (Api.getToken()) {
    try {
      const r = await Api.bootstrap();
      window.__BOOT_STATE = r.state;
      window.__BOOT_ME = r.me;
    } catch (e) {
      if (e.code !== 'UNAUTHORIZED') toast('连不上服务器：' + e.message, 'err');
    }
  }

  loadState();
  bindTopbar();
  if (restoreSession()) { renderApp(); setTimeout(applyDeepLink, 700); }
  else renderLogin();
  setInterval(() => { if (me) refreshBell(); }, 60000);
}
/* 页面被刷新/关闭/切后台时，把防抖里还没发出的保存抢救出去。
   否则「提交需求 → 立刻刷新或切账号」会打断 PUT，数据就悄悄丢了（2026-10-22 实测复现）。 */
const _flushPending = () => { try { window.Api && Api.flushNow && Api.flushNow(); } catch (_) {} };
window.addEventListener('pagehide', _flushPending);
window.addEventListener('beforeunload', _flushPending);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') _flushPending(); });

document.addEventListener('DOMContentLoaded', boot);
