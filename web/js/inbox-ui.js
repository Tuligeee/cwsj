/* 站内平台消息 UI（2026-11-01 重做）
   - 入口：顶栏图标（收件箱 + 未读数字角标），不再用右侧悬浮球
   - 面板：桌面从顶栏锚定覆盖，手机为底部抽屉；不再挤压页面布局
   - 点条目：标记已读 + 深链接跳转对应任务/提需 */
(function (global) {
  'use strict';

  const SCEN_LABEL = {
    A1: '新任务', A2: '即将到期', A3: '已逾期', A4: '催办', A5: '已提交',
    B1: '待评估', B2: '待派发', B3: '已驳回', B4: '派单', B5: '待确认',
    B6: '已确认', B7: '退回重做', B8: '临近完成', C1: '超期', C2: '评估堆积', C3: '确认堆积'
  };

  const ICON_TRAY =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 13h4l1.5 2h5L16 13h4"/>' +
    '<path d="M4 13 6.2 5.6A2 2 0 0 1 8.1 4h7.8a2 2 0 0 1 1.9 1.6L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>' +
    '</svg>';

  const BASE = (window.Api && window.Api.base) || '';
  let unread = 0;
  let built = false;
  let isOpen = false;

  function token() { return localStorage.getItem('cwsj_token_v1') || ''; }

  async function api(path, method, body) {
    const r = await fetch(BASE + path, {
      method: method || 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' },
        token() ? { Authorization: 'Bearer ' + token() } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(k => {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(c => c && n.appendChild(c));
    return n;
  }

  function timeText(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (d.toDateString() === new Date().toDateString()) return hm;
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
  }

  function dayLabel(iso) {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return '今天';
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return '昨天';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  /* 正文去噪：去品牌前缀、去 markdown、压缩成一句话 */
  function cleanBody(body) {
    return String(body || '')
      .replace(/^【[^】]+】\s*/, '')
      .replace(/\*\*/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^[-·]\s*/gm, '')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 4)
      .join(' · ');
  }

  /* 正文与标题重复的片段去掉（很多场景标题就是正文第一行） */
  function bodyText(r) {
    const segs = cleanBody(r.body).split(' · ').filter(Boolean);
    const t = String(r.title || '').trim();
    return segs.filter(s => s !== t && s !== t.replace(/（.*?）/g, '')).join(' · ');
  }

  function build() {
    if (built || !document.body) return;
    const host = document.getElementById('msg-slot');
    if (!host) return;
    built = true;

    const badge = el('span', { class: 'msg-badge hide', text: '0' });
    const btn = el('button', {
      class: 'icon-btn msg-btn', id: 'msg-btn', title: '平台消息',
      'aria-label': '平台消息', 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
      onclick: toggle
    }, [el('span', { html: ICON_TRAY }), badge]);
    host.appendChild(btn);

    const listBox = el('div', { class: 'msg-list' });
    const countPill = el('span', { class: 'msg-count zero', text: '0' });
    const markAll = el('button', {
      class: 'msg-tbtn', title: '全部标记为已读',
      html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span>全部已读</span>',
      onclick: async (e) => {
        e.stopPropagation();
        markAll.disabled = true;
        try { await api('/api/inbox/read', 'POST', { keys: [] }); } catch (err) {}
        markAll.disabled = false;
        await refresh();
      }
    });
    const closeBtn = el('button', {
      class: 'msg-x', title: '关闭', 'aria-label': '关闭',
      html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
      onclick: close
    });

    const panel = el('div', {
      class: 'msg-panel', role: 'dialog', 'aria-modal': 'false', 'aria-label': '平台消息'
    }, [
      el('div', { class: 'msg-handle' }),
      el('div', { class: 'msg-head' }, [
        el('h3', { class: 'msg-title', text: '平台消息' }),
        countPill,
        el('div', { class: 'msg-actions' }, [markAll, closeBtn]),
      ]),
      listBox,
    ]);
    const mask = el('div', { class: 'msg-mask', onclick: close });

    document.body.appendChild(mask);
    document.body.appendChild(panel);

    global.__inbox = { refresh, open, close };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) close(); });
    setInterval(pollBadge, 60000);
    setTimeout(pollBadge, 1200);
  }

  function renderRows(rows) {
    const list = document.querySelector('.msg-list');
    if (!list) return;
    list.innerHTML = '';
    if (!rows.length) {
      list.appendChild(el('div', { class: 'msg-empty' }, [
        el('div', { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13h4l1.5 2h5L16 13h4"/><path d="M4 13 6.2 5.6A2 2 0 0 1 8.1 4h7.8a2 2 0 0 1 1.9 1.6L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/></svg>' }),
        el('p', { class: 'p', text: '还没有消息' }),
        el('p', { class: 's', text: '任务提醒和需求流转会出现在这里' }),
      ]));
      return;
    }
    let lastDay = '';
    rows.forEach(r => {
      const when = r.created_at || r.sent_at;
      const dl = dayLabel(when);
      if (dl !== lastDay) {
        lastDay = dl;
        list.appendChild(el('div', { class: 'msg-day', text: dl }));
      }
      const unreadNow = !r.read_at;
      const item = el('div', {
        class: 'msg-item' + (unreadNow ? '' : ' read'),
        tabindex: '0', role: 'button'
      }, [
        el('span', { class: 'msg-dot' }),
        el('div', {}, [
          el('div', { class: 'msg-t', text: r.title || '通知' }),
          el('div', { class: 'msg-b', text: bodyText(r) }),
          el('div', { class: 'msg-m' }, [
            el('span', { class: 'msg-tag', text: SCEN_LABEL[r.scenario] || '通知' }),
            el('span', { text: timeText(when) }),
          ]),
        ]),
      ]);
      const go = async () => {
        const wasUnread = !item.classList.contains('read');
        item.classList.add('read');
        try { await api('/api/inbox/read', 'POST', { keys: [r.event_key] }); } catch (e) {}
        if (wasUnread) {
          /* 角标与面板计数同步减 1，避免关掉后数字还是旧的 */
          unread = Math.max(0, unread - 1);
          paintBadge();
          const pill = document.querySelector('.msg-count');
          if (pill) { pill.textContent = String(unread); pill.classList.toggle('zero', !unread); }
        }
        close();
        if (r.hash) {
          location.hash = r.hash;
          if (typeof applyDeepLink === 'function') setTimeout(applyDeepLink, 120);
        }
      };
      item.addEventListener('click', go);
      item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      list.appendChild(item);
    });
  }

  async function refresh() {
    try {
      const r = await api('/api/inbox?limit=60');
      unread = r.unread || 0;
      paintBadge();
      const pill = document.querySelector('.msg-count');
      if (pill) {
        pill.textContent = unread ? String(unread) : '0';
        pill.classList.toggle('zero', !unread);
      }
      renderRows(r.rows || []);
    } catch (e) { /* 未登录或网络问题：静默 */ }
  }

  function paintBadge() {
    const b = document.querySelector('.msg-badge');
    if (!b) return;
    b.textContent = unread > 99 ? '99+' : String(unread);
    b.classList.toggle('hide', unread <= 0);
  }

  async function pollBadge() {
    if (!token()) return;
    try {
      const r = await api('/api/inbox/unread');
      unread = r.unread || 0;
      paintBadge();
      const pill = document.querySelector('.msg-count');
      if (pill) { pill.textContent = String(unread); pill.classList.toggle('zero', !unread); }
    } catch (e) {}
  }

  function open() {
    const p = document.querySelector('.msg-panel');
    const m = document.querySelector('.msg-mask');
    const b = document.getElementById('msg-btn');
    if (!p) return;
    isOpen = true;
    p.classList.add('show');
    if (m) m.classList.add('show');
    if (b) b.setAttribute('aria-expanded', 'true');
    document.documentElement.style.overflow = window.innerWidth <= 900 ? 'hidden' : '';
    refresh();
  }

  function close() {
    const p = document.querySelector('.msg-panel');
    const m = document.querySelector('.msg-mask');
    const b = document.getElementById('msg-btn');
    isOpen = false;
    if (p) p.classList.remove('show');
    if (m) m.classList.remove('show');
    if (b) { b.setAttribute('aria-expanded', 'false'); if (b.focus) b.focus(); }
    document.documentElement.style.overflow = '';
  }

  function toggle() { isOpen ? close() : open(); }

  document.addEventListener('DOMContentLoaded', () => setTimeout(build, 400));
  if (document.readyState !== 'loading') setTimeout(build, 400);
})(window);
