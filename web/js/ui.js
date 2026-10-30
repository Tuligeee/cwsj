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
  $('#modal-root').appendChild(mask);

  const inst = {
    mask: mask, box: box, body: body, foot: foot,
    close: function () {
      const i = _modalStack.indexOf(inst); if (i >= 0) _modalStack.splice(i, 1);
      mask.remove();
      if (_modalStack.length) _modalStack[_modalStack.length - 1].box.style.filter = '';
    },
    setTitle: t => { box.querySelector('h3').textContent = t; }
  };
  if (_modalStack.length) box.style.filter = 'saturate(.5) opacity(.85)';
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
function tagNode(text, cls) { return h('span', { class: 'tag ' + (cls || 'tag-gray'), text: text }); }
function starsNode(n, big) {
  const w = h('span', { class: 'stars' + (big ? ' stars-lg' : '') });
  for (let i = 1; i <= 5; i++) w.appendChild(h('span', { class: i > n ? 'off' : '' }, '★'));
  return w;
}
function progressNode(val, cls) {
  return h('div', { class: 'progress' }, h('div', { class: 'progress-fill ' + (cls || ''), style: { width: clamp(val, 0, 100) + '%' } }));
}
function lightbox(src) {
  const lb = h('div', { class: 'lightbox', onclick: () => lb.remove() }, h('img', { src: src }));
  document.body.appendChild(lb);
}
function thumbsNode(images) {
  if (!images || !images.length) return null;
  const w = h('div', { class: 'thumbs' });
  images.forEach(src => w.appendChild(h('img', { class: 'thumb', src: src, onclick: () => lightbox(src) })));
  return w;
}
function linksNode(links) {
  if (!links || !links.length) return null;
  const w = h('div', { class: 'links' });
  links.forEach(l => w.appendChild(h('a', {
    class: 'link-item', href: l.url, target: '_blank', rel: 'noopener',
    onclick: e => { if (/^javascript:/i.test(l.url)) e.preventDefault(); }
  }, [h('span', {}, '🔗'), h('span', {}, l.title || l.url)])));
  return w;
}

/* ---------------- 统计卡 ---------------- */
function statNode(num, label, kind) {
  return h('div', { class: 'stat' + (kind ? ' s-' + kind : '') }, [
    h('div', { class: 'stat-num', text: num }),
    h('div', { class: 'stat-label', text: label })
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
      h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { width: p + '%', background: it.color || 'var(--brand)' } })),
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
  const wrap = h('div', { class: 'tabs', style: { flexWrap: 'wrap' } });
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
function imgUploader(images, onChange, max) {
  max = max || 6;
  const wrap = h('div');
  const pv = h('div', { class: 'img-preview' });
  function paint() {
    clear(pv);
    images.forEach((src, i) => {
      pv.appendChild(h('div', { class: 'img-pv' }, [
        h('img', { src: src, onclick: () => lightbox(src) }),
        h('button', { type: 'button', onclick: () => { images.splice(i, 1); paint(); onChange && onChange(images); } }, '×')
      ]));
    });
    if (images.length < max) pv.appendChild(h('div', {
      class: 'img-drop',
      style: { width: '78px', height: '78px', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' },
      onclick: () => file.click()
    }, '+'));
  }
  const file = h('input', {
    type: 'file', accept: 'image/*', multiple: '', style: { display: 'none' },
    onchange: async e => {
      const fs = Array.from(e.target.files);
      for (const f of fs) {
        if (images.length >= max) { toast('最多上传 ' + max + ' 张图片', 'err'); break; }
        try {
          const dataUrl = await readImage(f);
          /* 服务端模式先落盘换短 URL 再进 state，避免 base64 把整份数据撑爆 */
          if (window.__SERVER_MODE && window.Api) images.push(await Api.uploadImage(dataUrl));
          else images.push(dataUrl);
        } catch (err) { toast('图片上传失败：' + err.message, 'err'); }
      }
      e.target.value = '';
      paint(); onChange && onChange(images);
    }
  });
  const urlInput = h('input', { class: 'input', placeholder: '也可粘贴图片链接后点右侧「添加」', style: { flex: '1' } });
  const urlRow = h('div', { class: 'row', style: { marginTop: '9px' } }, [
    urlInput,
    h('button', {
      class: 'btn btn-sm', type: 'button', onclick: () => {
        const v = urlInput.value.trim();
        if (!/^https?:\/\//i.test(v) && !/^data:image/i.test(v)) { toast('请输入以 http(s) 开头的图片链接', 'err'); return; }
        if (images.length >= max) { toast('最多 ' + max + ' 张图片', 'err'); return; }
        images.push(v); urlInput.value = ''; paint(); onChange && onChange(images);
      }
    }, '添加')
  ]);
  wrap.appendChild(h('div', { class: 'fhint', style: { marginTop: '0', marginBottom: '7px' }, text: '支持本地图片（自动压缩后上传，单次最多 ' + max + ' 张）或图片链接' }));
  wrap.appendChild(pv); wrap.appendChild(file); wrap.appendChild(urlRow);
  paint();
  return wrap;
}

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
function emptyNode(text, icon) {
  return h('div', { class: 'empty' }, [
    h('span', { class: 'eico' }, icon || '🗂'),
    h('div', { text: text || '暂无数据' })
  ]);
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
