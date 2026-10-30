/* =========================================================
   m2-ui.js — 手机端统一交互层（只在 ?ui=m2 时加载）
   1. 隐藏所有「导出」按钮（电脑端不受影响）
   2. 多选筛选条（发布人/部门/任务类型）→ 一个按钮 + 弹出面板
      保留在页面上的：周期（今日/本周/本月/全部）、状态（全部/进行中/已停止）
   3. 顺序统一：筛选在上，统计看板在下，内容列表最后
   依赖：ui.js 里的 h() / openModal() / toast()
   ========================================================= */
(function () {
  var MOBILE = window.matchMedia('(max-width:900px)');
  if (!MOBILE.matches) return;

  /* 这些是高频单值切换，留在页面上不动 */
  var KEEP_LABEL = /状态/;
  /* 状态类筛选按选项文字识别，避免没有标签时被误收进弹窗 */
  var STATUS_RE = /全部状态|进行中|已停止|待评估|处理中|已完成|已驳回|未完成|即将到期|已逾期|已解决|待管委会|进行中任务/;
  var DEPT_RE = /部$|组$|管委会|总部|门店$/;
  var EXPORT = /导出/;

  function content() { return document.getElementById('content'); }

  /* 所有候选筛选组（周期条除外） */
  function groups() {
    var c = content();
    if (!c) return [];
    return Array.prototype.filter.call(
      c.querySelectorAll('.tabs'),
      function (g) { return !g.classList.contains('period-tabs') && !g.classList.contains('m2-keep'); }
    );
  }

  function labelOf(g) {
    var prev = g.previousElementSibling;
    var raw = '';
    while (prev) {
      if (prev.classList && prev.classList.contains('m2-fpills')) {
        prev = prev.previousElementSibling;
        continue;
      }
      var el = prev.querySelector ? prev.querySelector('.flabel, .fhint') : null;
      if (el) { raw = el.textContent || ''; break; }
      if (/flabel|fhint/.test(prev.className || '')) { raw = prev.textContent || ''; break; }
      break;
    }
    return raw.replace(/[（(][^)）]*[)）]/g, '').replace(/[：:]/g, '').trim();
  }

  function optionsOf(g) {
    return Array.prototype.filter.call(g.children, function (c) {
      return c.classList && c.classList.contains('tab');
    });
  }

  /* ---- 把一个多选筛选组换成按钮 ---- */
  function convert(g, idx) {
    if (g.dataset.m2src) return;
    var label = labelOf(g);
    var tabs = optionsOf(g);
    if (tabs.length < 2) return;
    var isStatusGroup = tabs.some(function (t) { return STATUS_RE.test(t.textContent || ''); });
    if (g.classList.contains('m2-single')) { convertStatus(g, idx, false); return; }
    if (KEEP_LABEL.test(label) || isStatusGroup) {
      /* 状态不收起：保留整排，可左右滑（2026-10-29 用户指定） */
      g.classList.add("m2-scroll");
      return;
    }
    if (!label) {
      var deptLike = tabs.filter(function (t) { return DEPT_RE.test((t.textContent || "").replace(/\d+/g, "").trim()); }).length;
      if (deptLike >= 2) label = "部门";
    }
    if (label === "部门") { convertStatus(g, idx, true); return; }

    g.dataset.m2src = '1';
    g.style.display = 'none';
    /* 收进弹窗后，原来那行「发布部门（可多选）：」标签就没用了，一起藏掉 */
    var pv = g.previousElementSibling;
    if (pv && /frow/.test(pv.className || '')) pv.classList.add('m2-hide');

    var on = tabs.filter(function (t) { return t.classList.contains('active'); });
    var btn = document.createElement('button');
    btn.className = 'm2-fpill' + (on.length ? ' on' : '');
    btn.appendChild(document.createTextNode(label || '筛选'));
    if (on.length) {
      var n = document.createElement('span');
      n.className = 'n'; n.textContent = String(on.length);
      btn.appendChild(n);
    }
    var car = document.createElement('span');
    car.className = 'car'; car.textContent = '▾';
    btn.appendChild(car);

    var row = document.createElement('div');
    row.className = 'm2-fpills m2-auto';
    row.appendChild(btn);
    g.parentNode.insertBefore(row, g);
    g.__m2pill = { btn: btn, label: label };

    btn.onclick = function () { openSheet(idx); };
  }


  /* ---- 状态类筛选：一个大按钮显示当前值，点开单选 ---- */
  function stripCount(t) {
    return (t || '').replace(/\s*\d+\s*$/, '').trim();
  }

  function refreshStatusPill(g) {
    var p = g.__m2pill;
    if (!p) return;
    var tabs = optionsOf(g);
    var on = null;
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].classList.contains('active')) { on = tabs[i]; break; }
    }
    if (!on) on = tabs[0];
    p.btn.textContent = '';
    p.btn.appendChild(document.createTextNode(stripCount(on ? on.textContent : '') || '状态'));
    var car = document.createElement('span');
    car.className = 'car'; car.textContent = '\u25be';
    p.btn.appendChild(car);
  }

  function openStatusSheet(idx) {
    var box = document.createElement('div');
    box.className = 'm2-sheet';
    var inst = null;
    function paint() {
      box.innerHTML = '';
      var g = groups()[idx];
      if (!g) return;
      optionsOf(g).forEach(function (tab, j) {
        var on = tab.classList.contains('active');
        var b = document.createElement('button');
        b.className = 'm2-opt' + (on ? ' on' : '');
        var t = document.createElement('span');
        t.className = 't'; t.textContent = stripCount(tab.textContent);
        var ck = document.createElement('span');
        ck.className = 'ck'; ck.textContent = on ? '\u2713' : '';
        b.appendChild(t); b.appendChild(ck);
        b.onclick = function () {
          var cur = groups()[idx];
          if (!cur) return;
          var tabs = optionsOf(cur);
          var chosen = tabs[j];
          if (!chosen) return;
          var exclusive = !!(cur.__m2pill && cur.__m2pill.exclusive);
          var wasOn = chosen.classList.contains('active');
          chosen.click();
          if (exclusive && !wasOn) {
            /* 单选互斥：把其它已选中的取消掉 */
            window.setTimeout(function () {
              var g2 = groups()[idx];
              if (!g2) return;
              optionsOf(g2).forEach(function (t, k) {
                if (k !== j && t.classList.contains('active')) t.click();
              });
            }, 120);
          }
          window.setTimeout(function () {
            var cur2 = groups()[idx];
            if (cur2) refreshStatusPill(cur2);
            if (inst) inst.close();
          }, 260);
        };
        box.appendChild(b);
      });
    }
    paint();
    inst = openModal({ title: '状态', sub: '点一下即生效', body: box });
  }

  function convertStatus(g, idx, exclusive) {
    if (g.dataset.m2src) return;
    var tabs = optionsOf(g);
    if (tabs.length < 2) return;
    g.dataset.m2src = '1';
    g.style.display = 'none';
    var pv = g.previousElementSibling;
    if (pv && /frow/.test(pv.className || '')) pv.classList.add('m2-hide');
    var row = document.createElement('div');
    row.className = 'm2-fpills m2-auto';
    var btn = document.createElement('button');
    btn.className = 'm2-fpill on';
    row.appendChild(btn);
    g.parentNode.insertBefore(row, g);
    g.__m2pill = { btn: btn, label: '', single: true, exclusive: !!exclusive };
    refreshStatusPill(g);
    btn.onclick = function () { openStatusSheet(idx); };
  }

  /* ---- 长的规则说明折叠成一行 ---- */
  var FOLD_RE = /得分\s*=|考核规则|规则由管理公司/;
  function foldLongHints() {
    var c = content();
    if (!c) return;
    Array.prototype.forEach.call(c.querySelectorAll('div, p'), function (el) {
      if (el.dataset.m2fold === '1' || el.children.length) return;
      var t = (el.textContent || '').trim();
      if (t.length < 70 || !FOLD_RE.test(t)) return;
      el.dataset.m2fold = '1';
      var btn = document.createElement('button');
      btn.className = 'm2-fold-btn';
      btn.appendChild(document.createTextNode('考核规则怎么算'));
      var car = document.createElement('span');
      car.className = 'car'; car.textContent = '\u25be';
      btn.appendChild(car);
      el.parentNode.insertBefore(btn, el);
      el.classList.add('m2-fold-body', 'm2-hide');
      btn.onclick = function () {
        var hidden = el.classList.contains('m2-hide');
        el.classList.toggle('m2-hide', !hidden);
        car.textContent = hidden ? '\u25b4' : '\u25be';
      };
    });
  }

  /* ---- 已转换的按钮跟随选择刷新（那一行可能原地更新，不触发重扫） ---- */
  function refreshPill(g) {
    var p = g.__m2pill;
    if (!p) return;
    if (p.single) { refreshStatusPill(g); return; }
    var on = optionsOf(g).filter(function (t) { return t.classList.contains('active'); });
    p.btn.className = 'm2-fpill' + (on.length ? ' on' : '');
    p.btn.textContent = '';
    p.btn.appendChild(document.createTextNode(p.label || '筛选'));
    if (on.length) {
      var n = document.createElement('span');
      n.className = 'n'; n.textContent = String(on.length);
      p.btn.appendChild(n);
    }
    var car = document.createElement('span');
    car.className = 'car'; car.textContent = '▾';
    p.btn.appendChild(car);
  }

  /* ---- 弹出面板 ---- */
  function openSheet(idx) {
    var box = document.createElement('div');
    box.className = 'm2-sheet';
    var inst = null;

    function paint() {
      box.innerHTML = '';
      var g = groups()[idx];
      if (!g) return;
      optionsOf(g).forEach(function (tab, j) {
        var on = tab.classList.contains('active');
        var b = document.createElement('button');
        b.className = 'm2-opt' + (on ? ' on' : '');
        var t = document.createElement('span'); t.className = 't'; t.textContent = (tab.textContent || '').trim();
        var ck = document.createElement('span'); ck.className = 'ck'; ck.textContent = on ? '✓' : '';
        b.appendChild(t); b.appendChild(ck);
        b.onclick = function () {
          /* 页面可能刚重渲染过，按索引重新取当前节点再点，避免点到失效的旧节点 */
          var cur = groups()[idx];
          if (cur) {
            var fresh = optionsOf(cur)[j];
            if (fresh) fresh.click();
          }
          window.setTimeout(function () { paint(); scan(); }, 160);
        };
        box.appendChild(b);
      });
    }

    paint();
    var g0 = groups()[idx];
    inst = openModal({
      title: labelOf(g0) || '筛选',
      sub: '可多选，点一下即生效',
      body: box,
      footer: [
        h('button', {
          class: 'btn', onclick: function () {
            var g = groups()[idx];
            if (g) optionsOf(g).filter(function (t) { return t.classList.contains('active'); })
              .forEach(function (t) { t.click(); });
            window.setTimeout(paint, 160);
          }
        }, '清空'),
        h('button', { class: 'btn btn-primary', onclick: function () { inst.close(); } }, '完成')
      ]
    });
  }


  /* ---- 页面内的「刷新」收到顶栏，做成图标按钮 ---- */
  function syncRefresh() {
    var c = content();
    var tb = document.querySelector('.tb-right');
    if (!c || !tb) return;
    var btns = Array.prototype.filter.call(c.querySelectorAll('button'), function (b) {
      return /刷新/.test(b.textContent || '');
    });
    var slot = tb.querySelector('.m2-refresh');
    if (btns.length) {
      btns.forEach(function (b) { b.classList.add('m2-hide'); });
      if (!slot) {
        slot = document.createElement('button');
        slot.className = 'icon-btn m2-refresh';
        slot.title = '刷新';
        slot.setAttribute('aria-label', '刷新');
        slot.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';
        slot.onclick = function () {
          var now = Array.prototype.filter.call(content().querySelectorAll('button'), function (b) {
            return /刷新/.test(b.textContent || '');
          })[0];
          if (now) now.click();
        };
        var bell = tb.querySelector('.bell-wrap');
        tb.insertBefore(slot, bell || tb.firstChild);
      }
    } else if (slot) {
      slot.parentNode.removeChild(slot);
    }
  }

  /* ---- 时间范围这类原生下拉，统一成胶囊 + 弹窗 ---- */
  function refreshSelect(sel) {
    var btn = sel.__m2pill;
    if (!btn) return;
    var opt = sel.options[sel.selectedIndex];
    btn.textContent = '';
    btn.appendChild(document.createTextNode(((opt && opt.text) || '时间范围').trim()));
    var car = document.createElement('span');
    car.className = 'car'; car.textContent = '\u25be';
    btn.appendChild(car);
  }

  function openSelectSheet(sel) {
    var box = document.createElement('div');
    box.className = 'm2-sheet';
    var inst = null;
    function paint() {
      box.innerHTML = '';
      Array.prototype.forEach.call(sel.options, function (o, i) {
        var on = i === sel.selectedIndex;
        var b = document.createElement('button');
        b.className = 'm2-opt' + (on ? ' on' : '');
        var t = document.createElement('span'); t.className = 't'; t.textContent = o.text;
        var ck = document.createElement('span'); ck.className = 'ck'; ck.textContent = on ? '\u2713' : '';
        b.appendChild(t); b.appendChild(ck);
        b.onclick = function () {
          sel.value = o.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          if (inst) inst.close();
          window.setTimeout(function () { refreshSelect(sel); }, 150);
        };
        box.appendChild(b);
      });
    }
    paint();
    inst = openModal({ title: '时间范围', sub: '点一下即生效', body: box });
  }

  function syncSelects() {
    var c = content();
    if (!c) return;
    Array.prototype.forEach.call(c.querySelectorAll('select'), function (sel) {
      /* 只转换「时间范围」这类下拉；管理员后台门店的「所属分区」下拉、表格内的下拉都不动 */
      var texts = Array.prototype.map.call(sel.options, function (o) { return o.text || ''; }).join(' ');
      if (!/天|周|月|年|近|全部/.test(texts)) return;
      if (sel.closest('table, .tbl-wrap')) return;
      if (sel.dataset.m2sel !== '1') {
        sel.dataset.m2sel = '1';
        sel.classList.add('m2-hide');
        var row = document.createElement('div');
        row.className = 'm2-fpills m2-auto';
        var btn = document.createElement('button');
        btn.className = 'm2-fpill';
        row.appendChild(btn);
        sel.parentNode.insertBefore(row, sel);
        btn.onclick = function () { openSelectSheet(sel); };
        sel.__m2pill = btn;
      }
      refreshSelect(sel);
    });
  }

  /* ---- 让筛选按钮排到主操作按钮（如「新增联系人」）之前 ---- */
  function liftPills() {
    var c = content();
    if (!c) return;
    Array.prototype.forEach.call(c.querySelectorAll('.m2-fpills.m2-auto'), function (row) {
      var prev = row.previousElementSibling;
      while (prev && prev.classList && prev.classList.contains('row') && prev.querySelector('.btn-primary')) {
        row.parentNode.insertBefore(row, prev);
        prev = row.previousElementSibling;
      }
    });
  }

  /* ---- 工具行：把筛选按钮并进「新建任务」那一行 ---- */
  function mergeToolrow() {
    var c = content();
    if (!c) return;
    var tr = c.querySelector('.m2-toolrow');
    if (!tr) return;
    var pills = c.querySelector('.m2-fpills.m2-auto');
    if (pills && pills.parentNode !== tr) {
      tr.insertBefore(pills, tr.firstChild);
    }
  }
  /* ---- 顺序：筛选在前，统计看板在后 ---- */
  function liftFilters() {
    var c = content();
    if (!c) return;
    Array.prototype.forEach.call(c.querySelectorAll('.stat-row'), function (sr) {
      var n = sr.nextElementSibling, moved = [];
      while (n && moved.length < 4) {
        if (n.classList && (n.classList.contains('tabs') || n.classList.contains('m2-fpills'))) {
          moved.push(n); n = n.nextElementSibling;
        } else { break; }
      }
      moved.forEach(function (m) { sr.parentNode.insertBefore(m, sr); });
    });
  }

  function hideExports() {
    var c = content();
    if (!c) return;
    Array.prototype.forEach.call(c.querySelectorAll('button'), function (b) {
      if (EXPORT.test(b.textContent || '')) b.classList.add('m2-hide');
    });
  }

  var pending = false;
  function scan() {
    pending = false;
    var c = content();
    if (!c) return;
    hideExports();
    groups().forEach(function (g, i) { g.dataset.m2src ? refreshPill(g) : convert(g, i); });
    syncRefresh();
    syncSelects();
    liftPills();
    mergeToolrow();
    foldLongHints();
    /* 统计卡数量打标，供 CSS 决定几列 */
    Array.prototype.forEach.call(c.querySelectorAll('.stat-row'), function (sr) {
      sr.setAttribute('data-n', String(sr.children.length));
    });
    liftFilters();
  }
  function schedule() {
    if (pending) return;
    pending = true;
    window.setTimeout(scan, 80);
  }

  function boot() {
    var c = content();
    if (!c) return;
    new MutationObserver(schedule).observe(c, { childList: true, subtree: true });
    scan();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();