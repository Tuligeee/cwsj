/* =========================================================
   ui.js — 通用 UI 组件
   ========================================================= */

/* ---------------- Toast ---------------- */
function toast(msg, kind) {
  const root = $('#toast-root');
  if (!root) { console.log(msg); return; }
  const n = h('div', { class: 'toast' + (kind ? ' ' + kind : '') }, msg);
  root.appendChild(n);
  setTimeout(() => { n.style.transition = 'opacity .25s'; n.style.opacity = '0'; setTimeout(() => n.remove(), 260); }, 2400);
}

/* ---------------- Modal ---------------- */
let _modalStack = [];
function openModal(opt) {
  const mask = h('div', { class: 'modal-mask' });
  const body = h('div', { class: 'modal-body' });
  if (opt.body) body.appendChild(opt.body);
  const foot = h('div', { class: 'modal-foot' });
  /* 必须跳过 null/false：调用方常用 `cond ? node : null` 占位，
     直接 appendChild(null) 会抛 TypeError，整个弹窗打不开（通讯录「新增联系人」就是这么挂的） */
  (opt.footer || []).forEach(f => { if (f) foot.appendChild(f); });
  const box = h('div', { class: 'modal' + (opt.wide ? ' wide' : opt.narrow ? ' narrow' : '') }, [
    h('div', { class: 'modal-head' }, [
      h('div', {}, [
        h('h3', { text: opt.title || '' }),
        opt.sub ? h('div', { class: 'mh-sub', text: opt.sub }) : null
      ]),
      h('button', { class: 'modal-close', onclick: () => inst.close(), title: '关闭' }, '×')
    ]),
    body,
    (opt.footer && opt.footer.length) ? foot : null
  ]);
  mask.appendChild(box);
  mask.addEventListener('mousedown', e => { if (e.target === mask && opt.maskClosable !== false) inst.close(); });
  /* 打开弹窗时锁住背景页滚动，否则手机上滑动会穿透到下面的页面 */
  if (!_modalStack.length) document.body.style.overflow = 'hidden';
  $('#modal-root').appendChild(mask);

  const inst = {
    mask: mask, box: box, body: body, foot: foot,
    close: function () {
      const i = _modalStack.indexOf(inst); if (i >= 0) _modalStack.splice(i, 1);
      mask.remove();
      if (!_modalStack.length) document.body.style.overflow = '';
      if (_modalStack.length) _modalStack[_modalStack.length - 1].box.style.filter = '';
    },
    setTitle: t => { box.querySelector('h3').textContent = t; }
  };
  /* 2026-11-09：原实现把滤镜加在新弹窗上（反了），叠层时新窗口反而发虚。
     正确做法：压暗下面那一层，新弹窗保持清晰。 */
  if (_modalStack.length) {
    _modalStack[_modalStack.length - 1].box.style.filter = 'saturate(.65) opacity(.9)';
    mask.classList.add('nested');
  }
  _modalStack.push(inst);
  return inst;
}
function closeTopModal() { if (_modalStack.length) _modalStack[_modalStack.length - 1].close(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTopModal(); });

function confirmDialog(opt) {
  const inst = openModal({
    title: opt.title || '确认操作', narrow: true,
    body: h('div', { style: { fontSize: '13.5px', lineHeight: '1.75', whiteSpace: 'pre-wrap', color: 'var(--text-2)' } }, opt.message || ''),
    footer: [
      h('button', { class: 'btn', onclick: () => inst.close() }, '取消'),
      h('button', { class: 'btn ' + (opt.danger ? 'btn-danger' : 'btn-primary'), onclick: () => { inst.close(); opt.onOk && opt.onOk(); } }, opt.okText || '确定')
    ]
  });
  return inst;
}

/* ---------------- 基础片段 ---------------- */

/* ---------------- 图标集（lucide 路径，1.5 stroke）---------------- */
const ICON_PATHS = {
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  checklist: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  board: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 10v10"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="13" y="8" width="3" height="10"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  dot: '',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M8 2.5v4M16 2.5v4M3 9.5h18"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2"/>'
};
function iconSvg(name, size) {
  const p = ICON_PATHS[name] || '';
  const s = size || 18;
  return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor"'
    + ' stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
}


/* 下拉式多选筛选（2026-11-05）：选项再多也只占一个按钮
   cfg = { label, options: [{v,t,n}], selected: Set, onChange() } */
function multiSelectFilter(cfg) {
  const label = cfg.label;
  const opts = () => (typeof cfg.options === 'function' ? cfg.options() : (cfg.options || []));
  let open = false, pop = null, query = '';

  const txt = h('span', { class: 'msel-t' });
  const cnt = h('span', { class: 'msel-n' });
  const btn = h('button', {
    class: 'msel-btn', type: 'button', 'aria-haspopup': 'listbox',
    onclick: (e) => { e.stopPropagation(); toggle(); }
  }, [txt, cnt, h('span', { class: 'msel-car', html: iconSvg('chevron', 12) })]);

  function labelText() {
    const sel = cfg.selected;
    const list = opts();
    if (!sel || sel.size === 0) return label;
    if (sel.size === 1) {
      const one = list.find(o => sel.has(o.v));
      return label + ' · ' + (one ? one.t : '1 项');
    }
    return label;
  }
  function refresh() {
    txt.textContent = labelText();
    cnt.textContent = cfg.selected && cfg.selected.size ? String(cfg.selected.size) : '';
    cnt.style.display = cnt.textContent ? 'inline-flex' : 'none';
    btn.classList.toggle('on', !!(cfg.selected && cfg.selected.size));
  }

  function paintPop() {
    const list = opts().filter(o => !query || String(o.t).toLowerCase().indexOf(query.toLowerCase()) >= 0);
    const rows = h('div', { class: 'msel-list' });
    if (!list.length) rows.appendChild(h('div', { class: 'msel-empty', text: '没有匹配的选项' }));
    list.forEach(o => {
      const on = cfg.selected.has(o.v);
      rows.appendChild(h('button', {
        class: 'msel-opt' + (on ? ' on' : ''), type: 'button', role: 'option', 'aria-selected': on ? 'true' : 'false',
        onclick: (e) => {
          e.stopPropagation();
          on ? cfg.selected.delete(o.v) : cfg.selected.add(o.v);
          refresh(); paintPop(); cfg.onChange && cfg.onChange();
        }
      }, [
        h('span', { class: 'msel-ck', html: on ? iconSvg('check', 12) : '' }),
        h('span', { class: 'msel-o', text: o.t }),
        h('span', { class: 'msel-c', text: o.n === undefined ? '' : String(o.n) })
      ]));
    });
    const body = h('div', { class: 'msel-body' }, [rows]);
    if (list.length > 8 || query) {
      // 搜索只在选项多时出现，避免小集合多一个控件
    }
    return body;
  }

  function openPop() {
    const list = opts();
    const popBox = h('div', { class: 'msel-pop' });
    if (list.length > 8) {
      popBox.appendChild(h('input', {
        class: 'msel-search', type: 'text', placeholder: '搜索' + label,
        oninput: (e) => { query = e.target.value.trim(); popBox.querySelector('.msel-body').replaceWith(paintPop()); }
      }));
    }
    popBox.appendChild(paintPop());
    const foot = h('div', { class: 'msel-foot' }, [
      h('button', {
        class: 'msel-act', type: 'button',
        onclick: (e) => { e.stopPropagation(); cfg.selected.clear(); refresh(); popBox.querySelector('.msel-body').replaceWith(paintPop()); cfg.onChange && cfg.onChange(); }
      }, '清空'),
      h('button', {
        class: 'msel-act msel-act-primary', type: 'button',
        onclick: (e) => { e.stopPropagation(); closePop(); }
      }, '完成')
    ]);
    popBox.appendChild(foot);
    const r = btn.getBoundingClientRect();
    popBox.style.top = (r.bottom + 6) + 'px';
    popBox.style.left = Math.min(r.left, window.innerWidth - 280) + 'px';
    document.body.appendChild(popBox);
    pop = popBox;
    open = true;
    document.addEventListener('click', outside);
    document.addEventListener('keydown', esc);
  }
  function closePop() {
    if (pop) pop.remove();
    pop = null; open = false; query = '';
    document.removeEventListener('click', outside);
    document.removeEventListener('keydown', esc);
  }
  function toggle() { open ? closePop() : openPop(); }
  function outside(e) { if (pop && !pop.contains(e.target) && !btn.contains(e.target)) closePop(); }
  function esc(e) { if (e.key === 'Escape') closePop(); }

  refresh();
  return { el: btn, refresh: refresh };
}


/* 平铺胶囊 + 溢出折叠（2026-11-05 方案 A）
   选中的永远排最前且一定可见；超出的收进「更多 +N」，点开是带搜索的完整列表。
   cfg = { label, options: [{v,t,n}] | fn, selected: Set, onChange(), max } */
function chipFilterWithMore(cfg) {
  const BOX = h('span', { class: 'cf-wrap' });
  const moreBtn = h('button', { class: 'cf-more', type: 'button' });

  const opts = () => (typeof cfg.options === 'function' ? cfg.options() : (cfg.options || []));
  const max = cfg.max || 6;

  function refresh() {
    const list = opts();
    const sel = cfg.selected || new Set();
    const picked = list.filter(o => sel.has(o.v));
    const rest = list.filter(o => !sel.has(o.v));
    const room = Math.max(0, max - picked.length);
    const shown = picked.concat(rest.slice(0, room));
    const hidden = rest.slice(room);

    clear(BOX);
    shown.forEach(o => {
      const on = sel.has(o.v);
      BOX.appendChild(h('button', {
        class: 'cf-chip' + (on ? ' on' : ''), type: 'button',
        title: o.t,
        onclick: () => { on ? sel.delete(o.v) : sel.add(o.v); refresh(); cfg.onChange && cfg.onChange(); }
      }, [
        h('span', { text: o.t }),
        o.n === undefined ? null : h('span', { class: 'cf-n', text: String(o.n) }),
        on ? h('span', { class: 'cf-x', html: iconSvg('check', 10) }) : null
      ]));
    });

    BOX.appendChild(moreBtn);   /* clear(BOX) 会把它一起清掉，这里必须挂回来 */
    if (hidden.length) {
      moreBtn.style.display = 'inline-flex';
      moreBtn.innerHTML = '';
      moreBtn.appendChild(h('span', { text: '更多' }));
      moreBtn.appendChild(h('span', { class: 'cf-n', text: '+' + hidden.length }));
      moreBtn.appendChild(h('span', { class: 'cf-car', html: iconSvg('chevron', 11) }));
      moreBtn.onclick = (e) => {
        e.stopPropagation();
        openMultiPop({
          label: cfg.label, options: list, selected: sel,
          onChange: () => { refresh(); cfg.onChange && cfg.onChange(); }
        }, moreBtn);
      };
    } else {
      moreBtn.style.display = 'none';
    }
  }

  refresh();
  return { el: BOX, refresh: refresh };
}

/* 通用多选弹层（带搜索 + 全选/清空） */
function openMultiPop(cfg, anchor) {
  const old = document.querySelector('.msel-pop');
  if (old) old.remove();
  let query = '';
  const pop = h('div', { class: 'msel-pop' });

  function listNode() {
    const rows = h('div', { class: 'msel-list' });
    const list = (cfg.options || []).filter(o => !query || String(o.t).toLowerCase().indexOf(query.toLowerCase()) >= 0);
    if (!list.length) rows.appendChild(h('div', { class: 'msel-empty', text: '没有匹配的选项' }));
    list.forEach(o => {
      const on = cfg.selected.has(o.v);
      rows.appendChild(h('button', {
        class: 'msel-opt' + (on ? ' on' : ''), type: 'button',
        onclick: (e) => {
          e.stopPropagation();
          if (cfg.single) {              /* 单选：选中即替换并收起（2026-11-11） */
            cfg.selected.clear();
            cfg.selected.add(o.v);
            cfg.onChange && cfg.onChange();
            close();
            return;
          }
          on ? cfg.selected.delete(o.v) : cfg.selected.add(o.v);
          cfg.onChange && cfg.onChange();
          body.replaceChild(listNode(), body.firstChild);
        }
      }, [
        h('span', { class: 'msel-ck', html: on ? iconSvg('check', 12) : '' }),
        h('span', { class: 'msel-o', text: o.t }),
        h('span', { class: 'msel-c', text: o.n === undefined ? '' : String(o.n) })
      ]));
    });
    return rows;
  }

  const body = h('div', { class: 'msel-body' }, [listNode()]);
  const many = (cfg.options || []).length > 8;
  if (many) {
    pop.appendChild(h('input', {
      class: 'msel-search', type: 'text', placeholder: '搜索' + cfg.label,
      oninput: (e) => { query = e.target.value.trim(); body.replaceChild(listNode(), body.firstChild); }
    }));
  }
  pop.appendChild(body);
  if (!cfg.single) pop.appendChild(h('div', { class: 'msel-foot' }, [
    h('button', { class: 'msel-act', type: 'button', onclick: () => { cfg.selected.clear(); cfg.onChange && cfg.onChange(); body.replaceChild(listNode(), body.firstChild); } }, '清空'),
    h('button', { class: 'msel-act msel-act-primary', type: 'button', onclick: () => close() }, '完成')
  ]));

  /* 弹层是 fixed 定位：必须跟着锚点走，滚出视口就关掉（2026-11-06） */
  function place() {
    const r = anchor.getBoundingClientRect();
    if (r.bottom < 8 || r.top > window.innerHeight - 8) { close(); return; }
    pop.style.top = (r.bottom + 6) + 'px';
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 264)) + 'px';
  }
  place();
  document.body.appendChild(pop);

  function onScroll() { place(); }
  function close() {
    pop.remove();
    document.removeEventListener('click', out);
    document.removeEventListener('keydown', esc);
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
  }
  function out(e) { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); }
  function esc(e) { if (e.key === 'Escape') close(); }
  setTimeout(() => document.addEventListener('click', out), 0);
  document.addEventListener('keydown', esc);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);
}


/* 手机端筛选药丸（2026-11-06）：横排只显示"当前选了什么"，选项进底部弹层 */
function filterPill(cfg) {
  /* cfg = { label, value, active, count, onClick } */
  return h('button', {
    class: 'mf-pill' + (cfg.active ? ' on' : ''),
    type: 'button', 'aria-haspopup': 'dialog',
    onclick: cfg.onClick
  }, [
    h('span', { class: 'mf-k', text: cfg.label }),
    h('span', { class: 'mf-v', text: cfg.value || '全部' }),
    cfg.count ? h('span', { class: 'mf-n', text: String(cfg.count) }) : null,
    h('span', { class: 'mf-c', html: iconSvg('chevron', 12) })
  ]);
}

/* 底部选项弹层：multi=true 多选（带清空/完成），false 单选（点即生效并关闭） */
function openFilterSheet(cfg) {
  const body = h('div', { class: 'mfs' });
  const paintRows = () => {
    clear(body);
    (cfg.options || []).forEach(o => {
      const on = cfg.selected.has(o.v);
      body.appendChild(h('button', {
        class: 'mfs-row' + (on ? ' on' : ''),
        type: 'button', role: 'option', 'aria-selected': on ? 'true' : 'false',
        onclick: () => {
          if (cfg.multi) {
            on ? cfg.selected.delete(o.v) : cfg.selected.add(o.v);
            paintRows();
            cfg.onChange && cfg.onChange();
          } else {
            cfg.selected.clear();
            if (!on) cfg.selected.add(o.v);
            cfg.onChange && cfg.onChange();
            closeTopModal();
          }
        }
      }, [
        h('span', { class: 'mfs-t', text: o.t }),
        o.n === undefined ? null : h('span', { class: 'mfs-n', text: String(o.n) }),
        h('span', { class: 'mfs-ck', html: on ? iconSvg('check', 14) : '' })
      ]));
    });
    if (!(cfg.options || []).length) {
      body.appendChild(h('div', { class: 'mfs-empty', text: '没有可选的选项' }));
    }
  };
  paintRows();
  openModal({
    title: cfg.title,
    sub: cfg.multi ? '可多选' : '单选',
    body: body,
    footer: cfg.multi ? [
      h('button', { class: 'btn', onclick: () => { cfg.selected.clear(); paintRows(); cfg.onChange && cfg.onChange(); } }, '清空'),
      h('button', { class: 'btn btn-primary', onclick: () => closeTopModal() }, '完成')
    ] : null
  });
}

function tagNode(text, cls) { return h('span', { class: 'tag ' + (cls || 'tag-gray'), text: text }); }
function starsNode(n, big) {
  const w = h('span', { class: 'stars' + (big ? ' stars-lg' : '') });
  for (let i = 1; i <= 5; i++) w.appendChild(h('span', { class: i > n ? 'off' : '' }, '★'));
  return w;
}
/* 表格行操作：主操作 + ⋯ 菜单（危险项红字，原有二次确认不变） */
function rowActions(primary, items) {
  const wrap = h('div', { class: 'row-actions' }, [primary]);
  const list = (items || []).filter(Boolean);
  if (!list.length) return wrap;
  wrap.appendChild(h('button', {
    class: 'btn-more row-more', title: '更多操作', html: iconSvg('more', 16),
    onclick: (ev) => {
      ev.stopPropagation();
      const r = ev.currentTarget.getBoundingClientRect();
      const pop = h('div', {
        class: 'menu-pop',
        style: { top: (r.bottom + 6) + 'px', left: Math.max(8, r.right - 150) + 'px' }
      }, list.map(([label, fn, cls]) => h('button', {
        class: cls || '',
        onclick: (e2) => { e2.stopPropagation(); pop.remove(); document.removeEventListener('click', close); fn(); }
      }, label)));
      const close = () => { pop.remove(); document.removeEventListener('scroll', close, true); };
      document.body.appendChild(pop);
      setTimeout(() => document.addEventListener('click', close), 0);
      document.addEventListener('scroll', close, true);
    }
  }));
  return wrap;
}

function progressNode(val, cls) {
  return h('div', { class: 'progress' }, h('div', { class: 'progress-fill ' + (cls || ''), style: { width: clamp(val, 0, 100) + '%' } }));
}
/* 甜甜圈（2026-11-06）：圈上不写字；悬停整段加粗并弹出数据条
   parts = [{k:'按时完成', v:3, c:'ok'|'warn'|'bad'}] */
function donutHover(parts, opts) {
  opts = opts || {};
  const total = parts.reduce((a, b) => a + (b.v || 0), 0);
  const R = 62, SW = 20, C = 2 * Math.PI * R, SZ = 172;
  const wrap = h('div', { class: 'dh-wrap' });
  const tip = h('div', { class: 'dh-tip' });
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + SZ + ' ' + SZ);
  svg.setAttribute('class', 'dh-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '任务结果构成');

  const track = document.createElementNS(svgNS, 'circle');
  track.setAttribute('cx', SZ / 2); track.setAttribute('cy', SZ / 2);
  track.setAttribute('r', R); track.setAttribute('fill', 'none');
  track.setAttribute('stroke', 'var(--panel-3)'); track.setAttribute('stroke-width', SW);
  svg.appendChild(track);

  let off = 0;
  parts.forEach(p => {
    const v = p.v || 0;
    const len = total ? (v / total) * C : 0;
    const c1 = document.createElementNS(svgNS, 'circle');
    c1.setAttribute('cx', SZ / 2); c1.setAttribute('cy', SZ / 2);
    c1.setAttribute('r', R); c1.setAttribute('fill', 'none');
    c1.setAttribute('class', 'dh-seg ' + p.c);
    c1.setAttribute('stroke-width', SW);
    c1.setAttribute('stroke-dasharray', len + ' ' + (C - len));
    c1.setAttribute('stroke-dashoffset', -off);
    c1.setAttribute('transform', 'rotate(-90 ' + SZ / 2 + ' ' + SZ / 2 + ')');
    /* 悬停：整段加粗 + 数据条 */
    const show = (ev) => {
      c1.classList.add('on');
      clear(tip);
      tip.appendChild(h('span', { class: 'dh-sw ' + p.c }));
      tip.appendChild(h('span', { class: 'dh-k', text: p.k }));
      tip.appendChild(h('span', { class: 'dh-v', text: String(v) }));
      tip.appendChild(h('span', { class: 'dh-p', text: total ? (v / total * 100).toFixed(2) + '%' : '—' }));
      tip.classList.add('on');
      move(ev);
    };
    const move = (ev) => {
      if (!ev || !ev.clientX) return;
      /* 贴着指针显示，并夹在视口内，避免被卡片裁掉 */
      const pad = 8;
      const tw = tip.offsetWidth || 150, th = tip.offsetHeight || 28;
      let x = ev.clientX + 14;
      let y = ev.clientY - th - 10;
      if (x + tw > window.innerWidth - pad) x = ev.clientX - tw - 14;
      if (y < pad) y = ev.clientY + 16;
      tip.style.left = Math.round(x) + 'px';
      tip.style.top = Math.round(y) + 'px';
    };
    const hide = () => { c1.classList.remove('on'); tip.classList.remove('on'); };
    c1.addEventListener('mouseenter', show);
    c1.addEventListener('mousemove', move);
    c1.addEventListener('mouseleave', hide);
    c1.addEventListener('click', show);
    off += len;
    svg.appendChild(c1);
  });

  wrap.appendChild(svg);
  if (total) {
    wrap.appendChild(h('div', { class: 'dh-center' }, [
      h('span', { class: 'dh-total', text: String(total) }),
      h('span', { class: 'dh-label', text: opts.centerLabel || '' })
    ]));
  }
  wrap.appendChild(tip);
  return wrap;
}


/* 2026-11-11 换域名：图片地址统一成「相对 app 根」的 uploads/xxx
   兼容 /cwsj/（IP 直连）、/cwsj/cwsj/（域名正式）、/cwsj-stg/（测试）三种挂载前缀 */
function imgSrc(p) {
  let s = String(p == null ? '' : p).trim();
  if (!s) return '';
  if (/^(https?:)?\/\//i.test(s) || /^data:/i.test(s)) return s;   /* 外链/内联不动 */
  s = s.replace(/^\/+/, '');                    /* 去掉前导斜杠 */
  /* 反复去掉挂载前缀：/cwsj/、/cwsj/cwsj/、/cwsj-stg/ 以及任意深度 */
  while (/^(cwsj-stg|cwsj)\//i.test(s)) s = s.replace(/^(cwsj-stg|cwsj)\//i, '');
  s = s.replace(/^uploads\//i, '');             /* 避免重复 uploads/ */
  return 'uploads/' + s;
}

/* ---------------- 图片查看器：多图 / 缩放 / 左右滑动 ---------------- */
/* 2026-11-12 第三版：
   · 手机滑动改成真正的「轮播」：拖动时三页一起跟手走，左右两张各露一半，
     松手按位移+速度吸附到上一张/下一张，带缓动；不再是「dong」一下切图
   · 首尾不循环，拖到边界有橡皮筋回弹
   · 窗口固定 1200×858，手机上全屏
   · 滚轮上推放大/下拉缩小、双指捏合、放大后可拖动、桌面双击放大/还原 */
let _vwInst = null;

function _vwSrc(p) {
  const s = String(p == null ? '' : p);
  return /^(blob:|data:|https?:|\/\/)/i.test(s) ? s : imgSrc(s);
}

function openViewer(items, start, originEl) {
  items = (items || []).filter(Boolean);
  if (!items.length) return;
  if (_vwInst) { try { _vwInst.destroy(); } catch (_) {} _vwInst = null; }

  const N = items.length;
  /* 转场只在手机做；桌面保持原来的「直接出现」 */
  const mobile = window.matchMedia('(max-width:900px)').matches;
  const originGroup = (originEl && originEl.closest) ? originEl.closest('[data-vg]') : null;
  let closing = false;
  let idx = Math.min(Math.max(0, start | 0), N - 1);
  let s = 1, tx = 0, ty = 0;
  let down = null, moved = false, pinch0 = null, lastTouchAt = 0, animating = false, axis = null;

  const imgL = h('img', { class: 'vw-img', alt: '', draggable: 'false' });
  const imgC = h('img', { class: 'vw-img vw-cur', alt: '', draggable: 'false' });
  const imgR = h('img', { class: 'vw-img', alt: '', draggable: 'false' });
  const pageL = h('div', { class: 'vw-page' }, imgL);
  const pageC = h('div', { class: 'vw-page' }, imgC);
  const pageR = h('div', { class: 'vw-page' }, imgR);
  const track = h('div', { class: 'vw-track' }, [pageL, pageC, pageR]);
  const stage = h('div', { class: 'vw-stage' }, track);

  const count = h('div', { class: 'vw-count' });
  const prev = h('button', { class: 'vw-nav prev', type: 'button', title: '上一张', 'aria-label': '上一张' }, '‹');
  const next = h('button', { class: 'vw-nav next', type: 'button', title: '下一张', 'aria-label': '下一张' }, '›');
  const close = h('button', { class: 'vw-close', type: 'button', title: '关闭（Esc）', 'aria-label': '关闭' }, '×');

  const SVG_DL = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';
  const SVG_SHARE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/></svg>';
  const saveBtn = h('button', { class: 'vw-tool', type: 'button' }, [
    h('span', { class: 'vw-tool-ico', html: SVG_DL }),
    h('span', { text: '保存到相册' })
  ]);
  const tools = h('div', { class: 'vw-tools' }, [saveBtn]);
  if (navigator.share) {
    const shareBtn = h('button', { class: 'vw-tool', type: 'button' }, [
      h('span', { class: 'vw-tool-ico', html: SVG_SHARE }),
      h('span', { text: '分享' })
    ]);
    shareBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      navigator.share({ title: '图片', url: new URL(_vwSrc(items[idx]), location.href).href }).catch(function () {});
    });
    tools.appendChild(shareBtn);
  }
  const tip = h('div', { class: 'vw-tip' });
  let tipTimer = 0;

  const box = h('div', { class: 'vw-box' }, [stage, count, prev, next, close, tools, tip]);
  const root = h('div', { class: 'vw', role: 'dialog', 'aria-modal': 'true' }, box);

  const bodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const REST = 'translateX(-33.3333%)';
  const NEXT = 'translateX(-66.6667%)';
  const PREV = 'translateX(0%)';
  const EASE = 'cubic-bezier(.22,1,.36,1)';

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function zoom(anim) {
    imgC.style.transition = anim ? 'transform .18s ' + EASE : 'none';
    imgC.style.transform = 'translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px) scale(' + s.toFixed(4) + ')';
  }
  function resetZoom() { s = 1; tx = 0; ty = 0; zoom(true); }

  function setPage(img, page, n) {
    const has = n >= 0 && n < N;
    page.style.visibility = has ? '' : 'hidden';
    if (has) { const src = _vwSrc(items[n]); if (img.getAttribute('src') !== src) img.src = src; }
    else img.removeAttribute('src');
  }

  function render(n) {
    idx = n;
    setPage(imgL, pageL, n - 1);
    setPage(imgC, pageC, n);
    setPage(imgR, pageR, n + 1);
    resetZoom();
    count.textContent = (n + 1) + ' / ' + N;
    prev.disabled = n <= 0;
    next.disabled = n >= N - 1;
    track.style.transition = 'none';
    track.style.transform = REST;
  }

  function slideTo(dir) {
    if (animating) return;
    const target = idx + dir;
    if (target < 0 || target >= N) { snapBack(); return; }
    animating = true;
    track.style.transition = 'transform .3s ' + EASE;
    track.style.transform = dir > 0 ? NEXT : PREV;
    setTimeout(function () {
      render(target);          /* 到位后换页并无动画归位：画面内容一致，看不出跳 */
      animating = false;
    }, 310);
  }

  function snapBack() {
    track.style.transition = 'transform .26s ' + EASE;
    track.style.transform = REST;
  }

  /* 下拉关闭：窗口跟着手指往下走、背景渐隐，松手后放大淡出 */
  function dropClose() {
    animating = true;
    root.style.transition = 'opacity .22s ease';
    box.style.transition = 'transform .22s ' + EASE;
    root.style.opacity = '0';
    box.style.transform = 'translateY(70px)';
    setTimeout(destroy, 240);
  }
  /* 下拉不够：弹回原位 */
  function springBack() {
    box.style.transition = 'transform .28s ' + EASE;
    root.style.transition = 'opacity .28s ease';
    box.style.transform = 'translateY(0)';
    root.style.opacity = '1';
    setTimeout(function () {
      box.style.transition = ''; box.style.transform = '';
      root.style.transition = ''; root.style.opacity = '';
    }, 300);
  }

  function go(d) { slideTo(d); }

  function showTip(txt) {
    tip.textContent = txt;
    tip.classList.add('on');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(function () { tip.classList.remove('on'); }, 2000);
  }
  function saveImage() {
    const url = _vwSrc(items[idx]);
    const a = document.createElement('a');
    a.href = url;
    a.download = '图片-' + (idx + 1) + '.jpg';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); }, 30);
    showTip('已保存；若没反应，长按图片也可以保存');
  }
  saveBtn.addEventListener('click', function (e) { e.stopPropagation(); saveImage(); });

  /* ---------- 共享元素转场（FLIP） ---------- */
  /* 找「当前这张图」在页面上的缩略图：按组 + src 匹配，增删过也不会错位；
     不在视口内 / 已被删除 → 返回 null，关闭时退化成缩向屏幕中心 */
  function findAnchor() {
    if (!originGroup || !originGroup.isConnected) return null;
    const want = _vwSrc(items[idx]);
    const list = Array.prototype.slice.call(originGroup.querySelectorAll('img'));
    for (let i = 0; i < list.length; i++) {
      if (list[i].getAttribute('src') === want) {
        const r = list[i].getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return null;
        if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return null;
        return list[i];
      }
    }
    return null;
  }

  function playOpen() {
    if (!mobile || !originEl) return;
    const r0 = originEl.getBoundingClientRect();
    const r1 = imgC.getBoundingClientRect();
    if (!r1.width || !r1.height || !r0.width) return;
    const sc = Math.min(r0.width / r1.width, r0.height / r1.height);
    const dx = (r0.left + r0.width / 2) - (r1.left + r1.width / 2);
    const dy = (r0.top + r0.height / 2) - (r1.top + r1.height / 2);
    imgC.style.transition = 'none';
    imgC.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(' + sc.toFixed(4) + ')';
    root.style.transition = 'none';
    root.style.opacity = '0';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        imgC.style.transition = 'transform .3s cubic-bezier(.22,1,.36,1)';
        imgC.style.transform = 'translate(0px,0px) scale(1)';
        root.style.transition = 'opacity .26s ease';
        root.style.opacity = '1';
      });
    });
  }

  function closeAnimated() {
    if (closing) return;
    if (!mobile) { destroy(); return; }
    if (animating) { destroy(); return; }        /* 切页动画中直接关，避免两套动画打架 */
    closing = true;
    const r1 = imgC.getBoundingClientRect();
    if (!r1.width || !r1.height) { destroy(); return; }
    const anchor = findAnchor();
    let r0;
    if (anchor) {
      r0 = anchor.getBoundingClientRect();
    } else {
      /* 缩略图已不在视口（滑太多张 / 列表滚走了）→ 缩向屏幕中心 */
      const sz = Math.max(16, Math.min(28, window.innerWidth * 0.06));
      r0 = { left: (window.innerWidth - sz) / 2, top: (window.innerHeight - sz) / 2, width: sz, height: sz };
    }
    const sc = Math.min(r0.width / r1.width, r0.height / r1.height);
    const dx = (r0.left + r0.width / 2) - (r1.left + r1.width / 2);
    const dy = (r0.top + r0.height / 2) - (r1.top + r1.height / 2);
    imgC.style.transition = 'transform .28s cubic-bezier(.4,0,.6,1)';
    imgC.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(' + sc.toFixed(4) + ')';
    root.style.transition = 'opacity .28s ease';
    root.style.opacity = '0';
    setTimeout(destroy, 300);
  }

  function destroy() {
    document.removeEventListener('keydown', onKey, true);
    clearTimeout(tipTimer);
    root.remove();
    document.body.style.overflow = bodyOverflow;
    if (_vwInst && _vwInst.destroy === destroy) _vwInst = null;
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      /* 吃掉这次 Esc，避免连带关掉下面的提交弹窗 */
      e.preventDefault(); e.stopPropagation(); closeAnimated();
    }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); s = clamp(s * 1.2, 1, 6); if (s === 1) { tx = 0; ty = 0; } zoom(true); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); s = clamp(s / 1.2, 1, 6); if (s === 1) { tx = 0; ty = 0; } zoom(true); }
  }
  document.addEventListener('keydown', onKey, true);

  prev.addEventListener('click', function (e) { e.stopPropagation(); go(-1); });
  next.addEventListener('click', function (e) { e.stopPropagation(); go(1); });
  close.addEventListener('click', function (e) { e.stopPropagation(); closeAnimated(); });

  /* 滚轮：上推放大、下拉缩小 */
  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.12 : (1 / 1.12);
    s = clamp(s * f, 1, 6);
    if (s === 1) { tx = 0; ty = 0; }
    zoom(false);
  }, { passive: false });

  /* 指针：翻页拖动（未放大）/ 平移（放大后）/ 双指捏合 */
  const pts = new Map();
  stage.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.vw-nav') || e.target.closest('.vw-close')) return;
    if (animating) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { down = { x: e.clientX, y: e.clientY, t: Date.now(), tx: tx, ty: ty }; moved = false; axis = null; }
    if (pts.size === 2) {
      const a = Array.from(pts.values());
      pinch0 = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), s: s };
      down = null;
      track.style.transition = 'none';
      track.style.transform = REST;      /* 双指时不留在半页位置 */
    }
    stage.classList.add('dragging');
  });

  stage.addEventListener('pointermove', function (e) {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2 && pinch0) {
      const a = Array.from(pts.values());
      const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      s = clamp(pinch0.s * (d / Math.max(1, pinch0.d)), 1, 6);
      if (s === 1) { tx = 0; ty = 0; }
      zoom(false);
      return;
    }
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    if (s > 1) { tx = down.tx + dx; ty = down.ty + dy; zoom(false); return; }
    if (e.pointerType !== 'touch') return;

    /* 先锁定方向：竖向是「下拉关闭」，横向才是翻页，避免斜着滑时两个一起动 */
    if (!axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
    }
    if (axis === 'y') {
      if (dy > 0) {
        box.style.transition = 'none';
        box.style.transform = 'translateY(' + dy.toFixed(1) + 'px)';
        root.style.opacity = String(Math.max(0.3, 1 - dy / 420));
      }
      return;
    }
    let d = dx;
    if ((idx === 0 && d > 0) || (idx === N - 1 && d < 0)) d = d * 0.32;   /* 首尾橡皮筋 */
    track.style.transition = 'none';
    track.style.transform = 'translateX(calc(-33.3333% + ' + d.toFixed(1) + 'px))';
  });

  function endPointer(e) {
    if (!pts.has(e.pointerId)) return;
    const isTouch = e.pointerType === 'touch';
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch0 = null;
    if (pts.size === 0) stage.classList.remove('dragging');
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    const dt = Date.now() - down.t;
    const single = pts.size === 0;
    const ax = axis;
    down = null; axis = null;
    if (isTouch) lastTouchAt = Date.now();
    if (s > 1) {
      /* 放大后点一下也要能退出：原来这里直接 return，手机上放大后完全找不到关闭方式 */
      if (isTouch && !moved && dt < 420) { closeAnimated(); return; }
      zoom(true); return;
    }
    if (!single) return;

    if (isTouch) {
      /* 竖向：下拉到阈值就关（跟手位移 + 半透明过渡） */
      if (ax === 'y') {
        const vy = dt < 30 ? 0 : Math.abs(dy) / dt;   /* 瞬时事件（测试/合成）不算快 */
        if (dy > 110 || (dy > 40 && vy > 0.5)) { dropClose(); return; }
        springBack();
        return;
      }
      const v = dt < 30 ? 0 : Math.abs(dx) / dt;
      const far = Math.abs(dx) > 60 || (v > 0.45 && Math.abs(dx) > 24);
      if (far) { slideTo(dx < 0 ? 1 : -1); return; }
      snapBack();
      if (!moved && dt < 420) {
        const r = stage.getBoundingClientRect();
        const fx = (e.clientX - r.left) / r.width;
        if (fx < 0.33) { slideTo(-1); return; }
        if (fx > 0.67) { slideTo(1); return; }
        closeAnimated();
      }
      return;
    }

    /* 桌面：点图片外关闭（点图片本身不动） */
    if (!moved && dt < 420) {
      const onImg = e.target && e.target.closest && e.target.closest('.vw-img');
      if (!onImg) destroy();
    }
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  /* 双击放大 / 还原（触屏禁用：会和点按切换连击） */
  stage.addEventListener('dblclick', function (e) {
    if (!e.target.classList || !e.target.classList.contains('vw-img')) return;
    if (Date.now() - lastTouchAt < 600) return;
    if (s > 1) { resetZoom(); } else { s = 2.2; zoom(true); }
  });

  /* 箭头靠边才亮：必须挂在 box 上，事件才经过按钮区域 */
  box.addEventListener('mousemove', function (e) {
    const r = box.getBoundingClientRect();
    const x = e.clientX - r.left;
    box.classList.toggle('nav-on', x < 120 || x > r.width - 120);
  });
  box.addEventListener('mouseleave', function () { box.classList.remove('nav-on'); });

  /* 点窗口外面（半透明遮罩）关闭 */
  root.addEventListener('click', function (e) { if (e.target === root) closeAnimated(); });

  render(idx);
  document.body.appendChild(root);
  playOpen();
  _vwInst = { destroy: destroy };
  if (close.focus) close.focus();
}

/* 旧接口保留：单张调用 */
function lightbox(src) { openViewer([src], 0); }

function thumbsNode(images) {
  if (!images || !images.length) return null;
  const w = h('div', { class: 'thumbs', dataset: { vg: uid('vg') } });
  images.forEach(function (src, i) {
    w.appendChild(h('img', {
      class: 'thumb', src: imgSrc(src), alt: '', loading: 'lazy',
      onclick: function (e) { openViewer(images, i, e.currentTarget); }
    }));
  });
  return w;
}


function linksNode(links) {
  if (!links || !links.length) return null;
  const w = h('div', { class: 'links' });
  links.forEach(l => w.appendChild(h('a', {
    class: 'link-item', href: l.url, target: '_blank', rel: 'noopener',
    onclick: e => { if (/^javascript:/i.test(l.url)) e.preventDefault(); }
  }, [h('span', { class: 'lk-ico', html: iconSvg('link', 13) }), h('span', {}, l.title || l.url)])));
  return w;
}

/* ---------------- 统计卡 ---------------- */
function statNode(num, label, kind, sub) {
  return h('div', { class: 'stat' + (kind ? ' s-' + kind : '') }, [
    h('div', { class: 'stat-num', text: num }),
    h('div', { class: 'stat-label', text: label }),
    sub ? h('div', { class: 'stat-sub', text: sub }) : null
  ]);
}
/* 主指标卡：一个大数 + 说明 + 一行小字 */
function statLead(num, label, sub) {
  return h('div', { class: 'stat stat-lead' }, [
    h('div', { class: 'stat-num', text: num }),
    h('div', { class: 'stat-label', text: label }),
    sub ? h('div', { class: 'stat-sub', text: sub }) : null
  ]);
}
function statRow(cols, items) {
  return h('div', { class: 'stat-row', style: { gridTemplateColumns: 'repeat(' + cols + ',1fr)' } }, items);
}

/* ---------------- 图表 ---------------- */
function barChart(items, opt) {
  opt = opt || {};
  const max = opt.max || Math.max.apply(null, items.map(i => i.value).concat([1]));
  const wrap = h('div', { class: 'chart-bars' });
  items.forEach(it => {
    const v = it.value;
    const p = max ? clamp((v / max) * 100, 0, 100) : 0;
    wrap.appendChild(h('div', { class: 'bar-row' }, [
      h('div', { class: 'bar-name', title: it.name, text: it.name }),
      h('div', { class: 'bar-track' }, p > 0
        ? h('div', { class: 'bar-fill', style: { width: p + '%', background: it.color || 'var(--brand)' } })
        : null),
      h('div', { class: 'bar-val', text: it.text !== undefined ? it.text : String(v) })
    ]));
  });
  return wrap;
}
function donutChart(items, opt) {
  opt = opt || {};
  const total = items.reduce((a, b) => a + b.value, 0);
  let acc = 0;
  const stops = items.filter(i => i.value > 0).map(i => {
    const from = acc / (total || 1) * 100;
    acc += i.value;
    const to = acc / (total || 1) * 100;
    return i.color + ' ' + from.toFixed(2) + '% ' + to.toFixed(2) + '%';
  }).join(', ');
  const ring = h('div', {
    style: {
      width: '132px', height: '132px', borderRadius: '50%', flex: '0 0 132px',
      background: total ? 'conic-gradient(' + stops + ')' : 'var(--panel-3)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative'
    }
  }, h('div', {
    style: {
      width: '86px', height: '86px', borderRadius: '50%', background: 'var(--panel)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
    }
  }, [
    h('div', { style: { fontSize: '21px', fontWeight: '700', lineHeight: '1.1' }, text: String(opt.centerNum !== undefined ? opt.centerNum : total) }),
    h('div', { style: { fontSize: '10.5px', color: 'var(--text-3)' }, text: opt.centerLabel || '合计' })
  ]));
  const legend = h('div', { class: 'donut-legend' });
  items.forEach(i => legend.appendChild(h('div', { class: 'dl-item' }, [
    h('span', { class: 'dl-dot', style: { background: i.color } }),
    h('span', { text: i.label }),
    h('span', { class: 'dl-val', text: i.text !== undefined ? i.text : String(i.value) })
  ])));
  return h('div', { class: 'donut-wrap' }, [ring, legend]);
}
function sparkNode(points, opt) {
  opt = opt || {};
  const max = Math.max.apply(null, points.map(p => p.v).concat([1]));
  const wrap = h('div', { class: 'spark' });
  points.forEach(p => {
    const hp = max ? clamp((p.v / max) * 100, 3, 100) : 3;
    const color = p.v >= 90 ? 'var(--ok)' : p.v >= 70 ? 'var(--brand)' : p.v >= 50 ? 'var(--warn)' : 'var(--danger)';
    wrap.appendChild(h('i', { style: { height: hp + '%', background: opt.flat ? 'var(--brand)' : color }, title: p.label + '：' + p.v + '%' }));
  });
  return wrap;
}

/* ---------------- 表单片段 ---------------- */
function fgroup(label, control, hint, required) {
  return h('div', { class: 'fgroup' }, [
    h('label', {}, [label, required ? h('span', { class: 'req' }, '*') : null]),
    control,
    hint ? h('div', { class: 'fhint', text: hint }) : null
  ]);
}
function inputNode(attrs) { return h('input', Object.assign({ class: 'input' }, attrs || {})); }
/* ⚠️ textarea 的内容**不是** value 属性：h() 走的是 setAttribute('value', ...)，
   对 <textarea> 等于没赋值 → 编辑任务时「任务说明」、编辑联系人时「负责工作」都是空白，
   点保存还会被「请填写任务说明」拦住。必须单独用 .value 赋。（2026-10-22 实测踩到） */
function textareaNode(attrs) {
  const a = Object.assign({}, attrs || {});
  const v = a.value;
  delete a.value;
  const t = h('textarea', Object.assign({ class: 'textarea' }, a));
  if (v !== undefined && v !== null && v !== '') t.value = v;
  return t;
}
function selectNode(options, value, attrs) {
  const s = h('select', Object.assign({ class: 'select' }, attrs || {}));
  options.forEach(o => {
    const op = h('option', { value: o.v }, o.t);
    if (String(o.v) === String(value)) op.selected = true;
    s.appendChild(op);
  });
  return s;
}

/** 多选筛选 chip 组：options=[{v,t,n}]，selected=Set（空集 = 全部），点击切换选中 */
function chipMulti(options, selected, onChange) {
  const wrap = h('div', { class: 'tabs chip-tabs', style: { flexWrap: 'wrap' } });
  options.forEach(o => {
    wrap.appendChild(h('div', {
      /* 注意：选中态必须在点击时实时读取 selected，不能渲染时固化，否则取消选中会失效 */
      class: 'tab' + (selected.has(o.v) ? ' active' : ''),
      onclick: () => { if (selected.has(o.v)) selected.delete(o.v); else selected.add(o.v); onChange && onChange(); }
    }, [o.t, o.n !== undefined ? h('span', { class: 'cnt' }, String(o.n)) : null]));
  });
  return wrap;
}
function switchNode(checked, label, onChange) {
  const inp = h('input', { type: 'checkbox' });
  inp.checked = !!checked;
  inp.addEventListener('change', () => onChange && onChange(inp.checked));
  return h('label', { class: 'switch' }, [inp, h('span', { text: label })]);
}
function starPicker(value, onChange) {
  const wrap = h('div', { class: 'star-pick' });
  const hint = h('span', { class: 'star-hint' });
  const TIP = { 1: '低', 2: '较低', 3: '一般', 4: '重要', 5: '非常重要' };
  function paint(v) {
    $$('span', wrap).forEach((s, i) => s.classList.toggle('on', i < v));
    hint.textContent = v + ' 星 · ' + TIP[v];
  }
  for (let i = 1; i <= 5; i++) {
    wrap.appendChild(h('span', { onclick: () => { value = i; paint(i); onChange && onChange(i); } }, '★'));
  }
  paint(value || 0);
  return h('div', { class: 'row' }, [wrap, hint]);
}
function storePicker(selected, onChange) {
  const sel = new Set(selected || []);
  const wrap = h('div', { class: 'store-picker' });
  const all = allStores();
  const byCity = storesByCity();
  const bar = h('div', { class: 'row', style: { marginBottom: '8px' } }, [
    h('button', { class: 'btn btn-xs', onclick: () => { all.forEach(s => sel.add(s.id)); render(); } }, '全选'),
    h('button', { class: 'btn btn-xs', onclick: () => { all.forEach(s => sel.delete(s.id)); render(); } }, '清空'),
    h('span', { class: 'fhint', style: { margin: '0 0 0 auto' }, id: 'sp-count' })
  ]);
  const list = h('div');
  function render() {
    clear(list);
    Object.keys(byCity).forEach(city => {
      list.appendChild(h('div', { class: 'sp-city', text: city + '（' + byCity[city].length + ' 家）' }));
      const g = h('div', { class: 'sp-grid' });
      byCity[city].forEach(s => {
        const on = sel.has(s.id);
        g.appendChild(h('label', { class: 'sp-item' + (on ? ' on' : '') }, [
          h('input', { type: 'checkbox', checked: on, onclick: e => { e.preventDefault(); on ? sel.delete(s.id) : sel.add(s.id); render(); } }),
          h('span', { text: s.name })
        ]));
      });
      list.appendChild(g);
    });
    bar.querySelector('#sp-count').textContent = '已选 ' + sel.size + ' / ' + all.length + ' 家';
    onChange && onChange(Array.from(sel));
  }
  wrap.appendChild(bar); wrap.appendChild(list);
  render();
  return { node: wrap, get: () => Array.from(sel) };
}

/* ---------------- 图片上传 ---------------- */
/* 2026-11-12 重做：
   ① 一个入口 —— 点「+」打开面板，面板里可拖入 / 选本地文件 / 粘图片链接；
   ② 另一个入口 —— 提交弹窗里直接 Ctrl+V 粘贴截图，图片自动进这里；
   ③ 上传队列：每张图立刻出现（上传中转圈 + 「上传中」），失败标红可重试；
   ④ 上限 max 张，超出截断并提示。外部 images 数组仍只存「上传成功后的相对路径」，
      所以提交弹窗里 images.slice() 的逻辑不用改。
   ⑤ 面板里同步显示图片列表和实时计数（2026-11-12 二次修：
      原来面板只有拖放区，粘贴进来的图跑到底下弹窗、被面板挡住，用户看不到）。 */
function imgUploader(images, onChange, max) {
  max = max || 30;
  const wrap = h('div', { class: 'img-uploader' });
  const pv = h('div', { class: 'img-preview', dataset: { vg: uid('vg') } });
  const pend = [];              /* { id, status:'up'|'err', file, blob } */
  let panel = null;             /* { list, count } —— 添加面板打开时才有 */
  let seq = 0;

  function fire() { try { onChange && onChange(images); } catch (_) {} }
  function full() { return images.length + pend.length >= max; }

  /* 生成缩略图节点（提交弹窗和面板共用同一套，状态天然一致） */
  function tileNodes(withAdd) {
    const out = [];
    images.forEach(function (src, i) {
      out.push(h('div', { class: 'img-pv' }, [
        h('img', { src: imgSrc(src), alt: '', onclick: function (e) { openViewer(images, i, e.currentTarget); } }),
        h('button', {
          type: 'button', class: 'img-pv-del', title: '删除',
          onclick: function () { images.splice(i, 1); paint(); fire(); }
        }, '×')
      ]));
    });
    pend.forEach(function (it) {
      const kids = [];
      if (it.blob) kids.push(h('img', { src: it.blob, alt: '' }));
      if (it.status === 'err') {
        kids.push(h('div', { class: 'img-pv-mask' }, [
          h('span', { class: 'img-pv-err', text: '上传失败' }),
          h('button', {
            type: 'button', class: 'img-retry',
            onclick: function (e) { e.stopPropagation(); retry(it); }
          }, '重试')
        ]));
      } else {
        kids.push(h('div', { class: 'img-pv-mask' }, [
          h('span', { class: 'img-spin' }),
          h('span', { class: 'img-pv-tip', text: '上传中' })
        ]));
      }
      kids.push(h('button', {
        type: 'button', class: 'img-pv-del', title: '删除',
        onclick: function () {
          const k = pend.indexOf(it); if (k >= 0) pend.splice(k, 1);
          if (it.blob) { URL.revokeObjectURL(it.blob); it.blob = null; }
          paint();
        }
      }, '×'));
      out.push(h('div', { class: 'img-pv ' + (it.status === 'err' ? 'is-err' : 'is-up') }, kids));
    });
    if (withAdd !== false && !full()) {
      out.push(h('button', {
        type: 'button', class: 'img-add', title: '添加图片（点击选择 / 拖入 / Ctrl+V 粘贴）',
        onclick: function () { openPanel(); }
      }, [
        h('span', { class: 'img-add-plus', text: '+' }),
        h('span', { class: 'img-add-t', text: '添加图片' })
      ]));
    }
    return out;
  }

  function paint() {
    clear(pv);
    tileNodes(true).forEach(function (n) { pv.appendChild(n); });

    if (panel && panel.list && panel.list.isConnected) {
      clear(panel.list);
      const nodes = tileNodes(false);
      if (nodes.length) nodes.forEach(function (n) { panel.list.appendChild(n); });
      else panel.list.appendChild(h('div', {
        class: 'add-img-empty',
        text: '粘贴或拖入的图片会先出现在这里；上传中有转圈，失败可以直接重试'
      }));
      if (panel.count) {
        const upN = pend.filter(function (x) { return x.status === 'up'; }).length;
        const errN = pend.length - upN;
        let txt = '当前 ' + images.length + ' / ' + max + ' 张';
        if (upN && errN) txt += ' · ' + upN + ' 张上传中、' + errN + ' 张失败';
        else if (upN) txt += ' · ' + upN + ' 张上传中';
        else if (errN) txt += ' · ' + errN + ' 张失败';
        panel.count.textContent = txt;
      }
    }
  }

  /* 上传并发限制：30 张不能同时压缩（canvas 在主线程）+ 同时发请求 */
  const PARALLEL = 3;
  const queue = [];
  let running = 0;
  function pump() {
    while (running < PARALLEL && queue.length) {
      const it = queue.shift();
      if (pend.indexOf(it) < 0) continue;          /* 排队期间被删掉了 */
      running++;
      upload(it).finally(function () { running--; pump(); });
    }
  }

  async function upload(it) {
    it.status = 'up'; paint();
    try {
      const dataUrl = await readImage(it.file);
      let url = dataUrl;
      if (window.__SERVER_MODE && window.Api) url = await Api.uploadImage(dataUrl);
      /* 上传期间被用户删掉了：结果直接丢弃，不能写进 images */
      const k = pend.indexOf(it);
      if (k < 0) return;
      pend.splice(k, 1);
      images.push(url);
      if (it.blob) { URL.revokeObjectURL(it.blob); it.blob = null; }
      paint(); fire();
    } catch (err) {
      if (pend.indexOf(it) < 0) return;
      it.status = 'err';
      it.err = (err && err.message) || '上传失败';
      paint();
    }
  }

  function retry(it) { it.status = 'up'; queue.push(it); paint(); pump(); }

  function enqueue(files) {
    const list = Array.prototype.slice.call(files || []).filter(isImageFile);
    if (!list.length) { toast('只能添加图片文件', 'err'); return; }
    let added = 0;
    list.forEach(function (f) {
      if (full()) return;
      added++;
      const it = { id: ++seq, status: 'up', file: f, blob: URL.createObjectURL(f) };
      pend.push(it); queue.push(it);
    });
    paint(); pump();
    /* 只是截断提示，不用红色报错样式 */
    if (added < list.length) toast('最多 ' + max + ' 张图片，已加入 ' + added + ' 张');
  }
  wrap.__enqueue = enqueue;

  /* 拖拽：整个预览区（含「+」）都能接 */
  ['dragenter', 'dragover'].forEach(function (t) {
    pv.addEventListener(t, function (e) { e.preventDefault(); e.stopPropagation(); pv.classList.add('is-over'); });
  });
  ['dragleave', 'dragend'].forEach(function (t) {
    pv.addEventListener(t, function (e) { if (e.target === pv) pv.classList.remove('is-over'); });
  });
  pv.addEventListener('drop', function (e) {
    e.preventDefault(); e.stopPropagation();
    pv.classList.remove('is-over');
    enqueue((e.dataTransfer && e.dataTransfer.files) || []);
  });

  /* —— 添加面板 —— */
  function openPanel() {
    if (panel && panel.list && panel.list.isConnected) return;   /* 已经开着就不重开；提交弹窗被关掉后引用会悬空，不能误判 */
    const file = h('input', { type: 'file', accept: 'image/*', multiple: '', style: { display: 'none' } });
    file.addEventListener('change', function () { enqueue(file.files); file.value = ''; });

    const dz = h('div', { class: 'add-img-drop', tabindex: '0' }, [
      h('span', { class: 'add-img-ico', html: (typeof iconSvg === 'function') ? iconSvg('upload', 24) : '' }),
      h('div', { class: 'add-img-t', text: '把图片拖到这里' }),
      h('div', { class: 'add-img-s', text: '或点击选择文件 · 也可以直接按 Ctrl+V 粘贴截图' })
    ]);
    dz.addEventListener('click', function () { file.click(); });
    dz.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); }
    });
    ['dragenter', 'dragover'].forEach(function (t) {
      dz.addEventListener(t, function (e) { e.preventDefault(); e.stopPropagation(); dz.classList.add('over'); });
    });
    ['dragleave', 'dragend'].forEach(function (t) {
      dz.addEventListener(t, function (e) { if (e.target === dz) dz.classList.remove('over'); });
    });
    dz.addEventListener('drop', function (e) {
      e.preventDefault(); e.stopPropagation(); dz.classList.remove('over');
      enqueue((e.dataTransfer && e.dataTransfer.files) || []);
    });

    const listBox = h('div', { class: 'img-preview add-img-list' });
    const countText = h('div', { class: 'add-img-hint' });

    const urlInput = h('input', { class: 'input', placeholder: '也可以粘贴图片链接，例如 https://...', style: { flex: '1' } });
    function addUrl() {
      const v = urlInput.value.trim();
      if (!/^https?:\/\//i.test(v) && !/^data:image\//i.test(v)) { toast('请输入以 http(s) 开头的图片链接', 'err'); return; }
      if (full()) { toast('最多 ' + max + ' 张图片', 'err'); return; }
      images.push(v); urlInput.value = ''; paint(); fire();
    }
    urlInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } });

    const m = openModal({
      title: '添加图片',
      sub: '拖入 / 选择文件 / 粘贴截图 / 粘贴链接',
      narrow: true,
      body: h('div', { class: 'add-img' }, [
        dz,
        listBox,
        h('div', { class: 'add-img-sep', text: '或使用图片链接' }),
        h('div', { class: 'row' }, [urlInput, h('button', { class: 'btn btn-sm', type: 'button', onclick: addUrl }, '添加')]),
        countText,
        file
      ])
    });

    panel = { list: listBox, count: countText };
    paint();
    /* 关面板时解除引用：包装 close，× / Esc / 点遮罩三种关法都走这里 */
    const origClose = m.close;
    m.close = function () { panel = null; origClose(); };
    /* 不再自动聚焦图片链接输入框：手机上一打开就弹键盘，遮挡半个面板。
       想用链接的人自己点输入框就行。 */
    return m;
  }

  paint();
  wrap.appendChild(pv);
  wrap.appendChild(h('div', {
    class: 'img-up-hint',
    text: '最多 ' + max + ' 张 · 可拖入、可 Ctrl+V 粘贴截图'
  }));
  return wrap;
}

/* 全局粘贴：剪贴板里有图 → 进图片区；纯文字（含 Excel/Word 的图文混粘）→ 完全放行，
   照常粘进当前输入框。只认页面上可见的那个图片上传区，弹窗关掉自动失效。 */
document.addEventListener('paste', function (e) {
  const boxes = document.querySelectorAll('.img-uploader');
  let host = null;
  for (let i = boxes.length - 1; i >= 0; i--) {
    if (boxes[i].getClientRects().length) { host = boxes[i]; break; }
  }
  if (!host || typeof host.__enqueue !== 'function') return;
  const cd = e.clipboardData;
  if (!cd) return;

  const files = [];
  const items = cd.items || [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind === 'file' && /^image\//.test(items[i].type || '')) {
      const f = items[i].getAsFile(); if (f) files.push(f);
    }
  }
  if (!files.length) {
    const fs = cd.files;
    if (fs && fs.length) for (let i = 0; i < fs.length; i++) if (/^image\//i.test(fs[i].type || '')) files.push(fs[i]);
  }
  if (!files.length) return;                       /* 没有图：纯文字，交给浏览器默认行为 */

  let txt = '';
  try { txt = (cd.getData('text/plain') || '').trim(); } catch (_) {}
  const ae = document.activeElement;
  const inField = ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName) && !ae.readOnly && !ae.disabled;
  if (inField && txt) return;                      /* 图文混粘：按文字走，避免把 Excel 内容变成一张截图 */

  e.preventDefault();
  host.__enqueue(files);
});


/* ---------------- 链接编辑 ---------------- */
function linkEditor(links, onChange) {
  const wrap = h('div');
  const list = h('div', { class: 'links' });
  function paint() {
    clear(list);
    links.forEach((l, i) => {
      list.appendChild(h('div', { class: 'row', style: { marginBottom: '6px' } }, [
        h('input', { class: 'input', style: { flex: '0 0 34%' }, placeholder: '链接名称', value: l.title || '', oninput: e => { l.title = e.target.value; onChange && onChange(links); } }),
        h('input', { class: 'input', style: { flex: '1' }, placeholder: 'https://...', value: l.url || '', oninput: e => { l.url = e.target.value; onChange && onChange(links); } }),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { links.splice(i, 1); paint(); onChange && onChange(links); } }, '删除')
      ]));
    });
  }
  wrap.appendChild(list);
  wrap.appendChild(h('button', {
    class: 'btn btn-sm', type: 'button', style: { marginTop: '4px' },
    onclick: () => { links.push({ title: '', url: '' }); paint(); }
  }, '+ 添加链接'));
  paint();
  return wrap;
}

/* ---------------- 空状态 ---------------- */
function emptyNode(text, icon, iconName) {
  /* iconName 优先：用线性图标替代 emoji（unslop 第 3 遍） */
  const ico = iconName
    ? h('span', { class: 'eico eico-svg', html: iconSvg(iconName, 22) })
    : h('span', { class: 'eico' }, icon || '');
  return h('div', { class: 'empty' }, [ico, h('div', { text: text || '暂无数据' })]);
}

/* ---------------- 时间线 ---------------- */
function timelineNode(logs) {
  const ul = h('ul', { class: 'timeline' });
  (logs || []).slice().reverse().forEach(l => {
    const cls = /驳回/.test(l.action) ? 'rej' : /完成|确认/.test(l.action) ? 'done' : '';
    ul.appendChild(h('li', { class: 'tl-item ' + cls }, [
      h('div', { class: 'tl-t', text: l.action }),
      h('div', { class: 'tl-m', text: l.by + ' · ' + ymdhm(l.at) }),
      l.note ? h('div', { class: 'tl-c', text: l.note }) : null
    ]));
  });
  return ul;
}
