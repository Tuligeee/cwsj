/* 站内平台消息 UI（2026-10-30）
   - 右侧悬浮按钮 + 未读角标
   - 点击展开抽屉：只显示本人收件箱（服务端按 person_id 过滤）
   - 点条目 → 标记已读 + 跳转对应任务/提需（深链接） */
(function (global) {
  'use strict';

  const SCEN_LABEL = {
    A1: '新任务', A2: '即将到期', A3: '已逾期', A4: '催办', A5: '已提交',
    B1: '待评估', B2: '待派发', B3: '已驳回', B4: '派单', B5: '待确认',
    B6: '已确认', B7: '退回重做', B8: '临近完成', C1: '超期', C2: '评估堆积', C3: '确认堆积'
  };

  const BASE = (window.Api && window.Api.base) || '';
  let unread = 0;
  let timer = null;
  let built = false;

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
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
  }

  function build() {
    if (built || !document.body) return;
    built = true;

    const badge = el('span', { class: 'inbox-badge hidden', text: '0' });
    const fab = el('button', { class: 'inbox-fab', title: '平台消息', onclick: open }, [
      el('span', { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0v4l2 4H4l2-4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>' }),
      badge,
    ]);
    const rail = el('div', { class: 'inbox-rail' }, [fab]);

    const listBox = el('div', { class: 'inbox-list' });
    const subText = el('span', { class: 'inbox-unread zero', text: '' });
    const markAll = el('button', {
      class: 'inbox-act', title: '全部标记为已读',
      html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>全部已读',
      onclick: async () => {
        await api('/api/inbox/read', 'POST', { keys: [] });
        await refresh();
      }
    });
    const closeBtn = el('button', {
      class: 'inbox-x', title: '关闭',
      html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
      onclick: close
    });
    const panel = el('div', { class: 'inbox-panel' }, [
      el('div', { class: 'inbox-head' }, [
        el('div', { class: 'left' }, [el('h3', { text: '平台消息' }), subText]),
        markAll, closeBtn,
      ]),
      listBox,
    ]);
    const mask = el('div', { class: 'inbox-mask', onclick: close });

    document.body.appendChild(rail);
    document.body.appendChild(mask);
    document.body.appendChild(panel);

    global.__inbox = { refresh, open, close };
    setInterval(pollBadge, 60000);
    setTimeout(pollBadge, 1200);
  }

  function renderRows(rows) {
    const list = document.querySelector('.inbox-list');
    if (!list) return;
    list.innerHTML = '';
    if (!rows.length) {
      list.appendChild(el('div', { class: 'inbox-empty', text: '暂时没有消息' }));
      return;
    }
    rows.forEach(r => {
      const unreadNow = !r.read_at;
      const item = el('div', { class: 'inbox-item' + (unreadNow ? '' : ' read') }, [
        el('div', { class: 't' }, [
          unreadNow ? el('span', { class: 'dot' }) : null,
          el('span', { text: r.title || '通知' }),
        ]),
        el('div', { class: 'b', text: (r.body || '').replace(/^【[^】]+】\s*/, '').replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^-\s*/gm, '· ').split('\n').filter(Boolean).slice(0, 3).join(' · ') }),
        el('div', { class: 'm' }, [
          el('span', { class: 'inbox-tag', text: SCEN_LABEL[r.scenario] || '通知' }),
          el('span', { text: timeText(r.created_at) }),
        ]),
      ]);
      item.addEventListener('click', async () => {
        item.classList.add('read');
        try { await api('/api/inbox/read', 'POST', { keys: [r.event_key] }); } catch (e) {}
        close();
        if (r.hash) {
          location.hash = r.hash;
          if (typeof applyDeepLink === 'function') setTimeout(applyDeepLink, 120);
        }
      });
      list.appendChild(item);
    });
  }

  async function refresh() {
    try {
      const r = await api('/api/inbox?limit=60');
      unread = r.unread || 0;
      paintBadge();
      const sub = document.querySelector('.inbox-unread');
      if (sub) {
        sub.textContent = unread ? unread + ' 条未读' : '已全部读过';
        sub.classList.toggle('zero', !unread);
      }
      renderRows(r.rows || []);
    } catch (e) { /* 未登录 或 网络问题：安静忽略 */ }
  }

  function paintBadge() {
    const b = document.querySelector('.inbox-badge');
    if (!b) return;
    b.textContent = unread > 99 ? '99+' : String(unread);
    b.classList.toggle('hidden', unread <= 0);
  }

  async function pollBadge() {
    if (!token()) return;
    try {
      const r = await api('/api/inbox/unread');
      unread = r.unread || 0;
      paintBadge();
    } catch (e) {}
  }

  function open() {
    const p = document.querySelector('.inbox-panel');
    const m = document.querySelector('.inbox-mask');
    if (p) p.classList.add('show');
    if (m) m.classList.add('show');
    refresh();
  }
  function close() {
    const p = document.querySelector('.inbox-panel');
    const m = document.querySelector('.inbox-mask');
    if (p) p.classList.remove('show');
    if (m) m.classList.remove('show');
  }

  document.addEventListener('DOMContentLoaded', () => setTimeout(build, 600));
  if (document.readyState !== 'loading') setTimeout(build, 600);
})(window);
