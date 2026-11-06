/* 日期区间选择器：左侧预设 + 双月日历（2026-11-04，数据统计页使用）
   用法：openDateRange({ from: Date, to: Date, onPick: ({from,to}) => {} })
*/
function openDateRange(opts) {
  const o = opts || {};
  const today = startOfDay(new Date());
  let selFrom = o.from ? startOfDay(new Date(o.from)) : monthStart(today);
  let selTo = o.to ? startOfDay(new Date(o.to)) : today;
  let base = monthStart(selFrom);

  /* 面板定位：短区间从起始月开始；跨 3 个月以上的长区间则让「结束月」落在右列，
     保证用户打开就能看到区间右端，而不是停在一个看不见结尾的月份 */
  function computeBase() {
    const a = monthStart(selFrom);
    const b = monthStart(selTo || selFrom);
    const monthsApart = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
    return monthsApart >= 2 ? new Date(b.getFullYear(), b.getMonth() - 1, 1) : a;
  }
  let hover = null;

  const overlay = h('div', { class: 'dr-overlay' });
  const panel = h('div', { class: 'dr-panel', role: 'dialog', 'aria-label': '选择日期区间' });
  const presetCol = h('div', { class: 'dr-presets' });
  const monthsBox = h('div', { class: 'dr-months' });
  const selText = h('span', { class: 'dr-sel' });

  const PRESETS = [
    ['今天', () => [today, today]],
    ['最近一周', () => [addDays(today, -6), today]],
    ['最近一个月', () => [addDays(today, -29), today]],
    ['最近三个月', () => [addDays(today, -89), today]],
    ['本月', () => [monthStart(today), today]],
    ['上月', () => {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return [s, e];
    }]
  ];

  function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function sameDay(a, b) { return a && b && ymd(a) === ymd(b); }
  function inRange(d) {
    const end = selTo || hover;
    if (!selFrom || !end) return false;
    const lo = selFrom <= end ? selFrom : end;
    const hi = selFrom <= end ? end : selFrom;
    return d > lo && d < hi;
  }

  function paintPresets() {
    clear(presetCol);
    PRESETS.forEach(([label, fn]) => {
      const [f, t] = fn();
      const on = sameDay(f, selFrom) && sameDay(t, selTo);
      presetCol.appendChild(h('button', {
        class: 'dr-preset' + (on ? ' on' : ''), type: 'button',
        onclick: () => { selFrom = f; selTo = t; base = computeBase(); hover = null; paintAll(); }
      }, label));
    });
  }

  function paintMonths() {
    clear(monthsBox);
    for (let i = 0; i < 2; i++) {
      const m = new Date(base.getFullYear(), base.getMonth() + i, 1);
      const head = h('div', { class: 'dr-mhead' }, [
        i === 0 ? h('button', {
          class: 'dr-arrow', type: 'button', 'aria-label': '上个月',
          onclick: () => { base = new Date(base.getFullYear(), base.getMonth() - 1, 1); paintMonths(); }
        }, '‹') : h('span', { class: 'dr-arrow-blank' }),
        h('b', { text: m.getFullYear() + ' 年 ' + (m.getMonth() + 1) + ' 月' }),
        i === 1 ? h('button', {
          class: 'dr-arrow', type: 'button', 'aria-label': '下个月',
          onclick: () => { base = new Date(base.getFullYear(), base.getMonth() + 1, 1); paintMonths(); }
        }, '›') : h('span', { class: 'dr-arrow-blank' })
      ]);
      const week = h('div', { class: 'dr-week' }, ['日', '一', '二', '三', '四', '五', '六'].map(w => h('span', { text: w })));
      const grid = h('div', { class: 'dr-grid' });
      const first = new Date(m.getFullYear(), m.getMonth(), 1);
      const lead = first.getDay();
      const startCell = addDays(first, -lead);
      for (let k = 0; k < 42; k++) {
        const d = addDays(startCell, k);
        const cls = ['dr-day'];
        if (d.getMonth() !== m.getMonth()) cls.push('other');
        if (sameDay(d, today)) cls.push('today');
        if (sameDay(d, selFrom) || sameDay(d, selTo)) cls.push('edge');
        if (selFrom && selTo && sameDay(d, selFrom)) cls.push('start');
        if (selFrom && selTo && sameDay(d, selTo)) cls.push('end');
        if (inRange(d)) cls.push('in');
        grid.appendChild(h('button', {
          class: cls.join(' '), type: 'button', text: String(d.getDate()),
          onclick: () => {
            if (!selFrom || (selFrom && selTo)) { selFrom = d; selTo = null; }
            else if (d < selFrom) { selTo = selFrom; selFrom = d; }
            else { selTo = d; }
            hover = null; base = computeBase(); paintAll();
          },
          onmouseenter: () => { if (selFrom && !selTo) { hover = d; paintMonths(); } }
        }));
      }
      monthsBox.appendChild(h('div', { class: 'dr-month' }, [head, week, grid]));
    }
  }

  function paintSel() {
    const f = selFrom, t = selTo || selFrom;
    const days = Math.round((startOfDay(t) - startOfDay(f)) / 86400000) + 1;
    selText.textContent = ymd(f) + ' ~ ' + ymd(t) + ' · ' + days + ' 天';
  }

  function paintAll() { paintPresets(); paintMonths(); paintSel(); }

  const foot = h('div', { class: 'dr-foot' }, [
    selText,
    h('button', { class: 'btn btn-sm', type: 'button', onclick: () => close() }, '取消'),
    h('button', {
      class: 'btn btn-sm btn-primary', type: 'button',
      onclick: () => { const t = selTo || selFrom; close(); o.onPick && o.onPick({ from: startOfDay(selFrom), to: startOfDay(t) }); }
    }, '确定')
  ]);

  panel.appendChild(h('div', { class: 'dr-head' }, [h('b', {}, '选择统计区间'), h('span', { class: 'dr-hint', text: '左右两个月份可连续翻月，点两次选起止日期' })]));
  panel.appendChild(h('div', { class: 'dr-body' }, [presetCol, monthsBox]));
  panel.appendChild(foot);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  function close() {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  }
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  paintAll();
}
