/* 自绘日期 / 时间选择器（2026-10-30）
   替换原生 <input type=date|datetime-local|time> 的弹层：
   - 点整块区域就打开，不必点日历图标
   - 面板样式跟系统一致（圆角、主色、10px 网格）
   - 手机端变成底部抽屉
   原生 input 仍保留，只做值载体，oninput/onchange 照常触发。 */
(function () {
  'use strict';

  var WD = ['日', '一', '二', '三', '四', '五', '六'];
  var SEL = 'input[type="date"],input[type="datetime-local"],input[type="time"]';

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function parse(input) {
    var v = input.value;
    if (!v) return null;
    var d;
    if (input.type === 'date') d = new Date(v + 'T00:00:00');
    else if (input.type === 'time') d = new Date('2000-01-01T' + v + ':00');
    else d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  function label(input) {
    var d = parse(input);
    if (!d) return '';
    if (input.type === 'time') return pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (input.type === 'datetime-local') {
      return ymd(d) + '  ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    return ymd(d);
  }

  function fire(input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  var panel = null, opener = null, input = null, view = null, hh = 18, mm = 0, picked = null;

  function close() {
    if (panel) panel.remove();
    if (opener) opener.classList.remove('dp-on');
    panel = opener = input = null;
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onKey, true);
  }

  function onDocDown(e) {
    if (!panel) return;
    if (panel.contains(e.target) || (opener && opener.contains(e.target))) return;
    close();
  }

  function onKey(e) { if (e.key === 'Escape') close(); }

  function cell(cls, text, onclick, extra) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = text;
    if (onclick) b.addEventListener('click', onclick);
    if (extra) Object.keys(extra).forEach(function (k) { b.setAttribute(k, extra[k]); });
    return b;
  }

  /* ---------- 日历 ---------- */
  function renderCalendar(box) {
    var head = document.createElement('div');
    head.className = 'dp-head';

    var prev = cell('dp-nav', '‹', function () {
      view.setMonth(view.getMonth() - 1); renderCalendar(box);
    });
    var next = cell('dp-nav', '›', function () {
      view.setMonth(view.getMonth() + 1); renderCalendar(box);
    });
    var title = document.createElement('div');
    title.className = 'dp-title';
    title.textContent = view.getFullYear() + ' 年 ' + (view.getMonth() + 1) + ' 月';

    head.appendChild(prev); head.appendChild(title); head.appendChild(next);
    box.innerHTML = '';
    box.appendChild(head);

    var grid = document.createElement('div');
    grid.className = 'dp-grid';
    WD.forEach(function (w) {
      var c = document.createElement('div');
      c.className = 'dp-wd';
      c.textContent = w;
      grid.appendChild(c);
    });

    var first = new Date(view.getFullYear(), view.getMonth(), 1);
    var start = first.getDay();
    var days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    var todayStr = ymd(new Date());

    for (var i = 0; i < start; i++) grid.appendChild(document.createElement('div'));

    for (var d = 1; d <= days; d++) {
      (function (day) {
        var date = new Date(view.getFullYear(), view.getMonth(), day);
        var s = ymd(date);
        var cls = 'dp-day';
        if (s === todayStr) cls += ' dp-today';
        if (picked && s === ymd(picked)) cls += ' dp-pick';
        if (date.getDay() === 0 || date.getDay() === 6) cls += ' dp-weekend';
        grid.appendChild(cell(cls, String(day), function () {
          picked = date;
          if (input.type === 'date') {
            input.value = s;
            fire(input); close();
          } else {
            applyDateTime();
            renderCalendar(box);
          }
        }));
      })(d);
    }
    box.appendChild(grid);
  }

  function applyDateTime() {
    if (!picked) return;
    var s = ymd(picked);
    if (input.type === 'datetime-local') input.value = s + 'T' + pad(hh) + ':' + pad(mm);
    fire(input);
  }

  /* ---------- 时间列 ---------- */
  function renderTime(box) {
    var wrap = document.createElement('div');
    wrap.className = 'dp-time';

    var hTitle = document.createElement('div');
    hTitle.className = 'dp-tlabel';
    hTitle.textContent = '时';
    var hCol = document.createElement('div');
    hCol.className = 'dp-tcol';
    for (var i = 0; i < 24; i++) {
      (function (h) {
        hCol.appendChild(cell('dp-titem' + (h === hh ? ' dp-pick' : ''), pad(h), function () {
          hh = h; refreshTime(box);
        }));
      })(i);
    }

    var mTitle = document.createElement('div');
    mTitle.className = 'dp-tlabel';
    mTitle.textContent = '分';
    var mCol = document.createElement('div');
    mCol.className = 'dp-tcol';
    [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 59].forEach(function (m) {
      mCol.appendChild(cell('dp-titem' + (m === mm ? ' dp-pick' : ''), pad(m), function () {
        mm = m; refreshTime(box);
      }));
    });

    wrap.appendChild(hCol); wrap.appendChild(mCol);
    box.appendChild(wrap);
    /* 打开时把选中的时分滚到可见位置 */
    requestAnimationFrame(function () {
      [hCol, mCol].forEach(function (col) {
        var sel = col.querySelector('.dp-titem.dp-pick');
        if (!sel) return;
        var top = sel.offsetTop - col.clientHeight / 2 + sel.offsetHeight / 2;
        col.scrollTop = Math.max(0, top);
      });
    });

    var btn = cell('dp-ok', input.type === 'datetime-local' ? '确定' : '确定', function () {
      if (input.type === 'time') {
        input.value = pad(hh) + ':' + pad(mm);
        fire(input); close();
      } else {
        applyDateTime(); close();
      }
    });
    var bar = document.createElement('div');
    bar.className = 'dp-foot';
    bar.appendChild(btn);
    box.appendChild(bar);
  }

  function refreshTime(box) {
    box.querySelectorAll('.dp-titem').forEach(function (b) { b.classList.remove('dp-pick'); });
    var keepScroll = box.querySelectorAll('.dp-tcol');
    var items = box.querySelectorAll('.dp-tcol');
    if (items[0]) items[0].querySelectorAll('.dp-titem')[hh].classList.add('dp-pick');
    if (items[1]) {
      var mins = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 59];
      var idx = mins.indexOf(mm);
      if (idx >= 0) items[1].querySelectorAll('.dp-titem')[idx].classList.add('dp-pick');
    }
  }

  /* ---------- 快捷 ---------- */
  function renderQuick(box) {
    var bar = document.createElement('div');
    bar.className = 'dp-quick';
    var now = new Date();
    var opts;
    if (input.type === 'time') {
      opts = [['18:00', [18, 0]], ['23:59', [23, 59]], ['12:00', [12, 0]], ['09:00', [9, 0]]];
      opts.forEach(function (o) {
        bar.appendChild(cell('dp-chip', o[0], function () {
          hh = o[1][0]; mm = o[1][1];
          if (input.type === 'time') { input.value = pad(hh) + ':' + pad(mm); fire(input); close(); }
        }));
      });
    } else {
      opts = [['今天', 0], ['明天', 1], ['三天后', 3], ['一周后', 7]];
      opts.forEach(function (o) {
        bar.appendChild(cell('dp-chip', o[0], function () {
          picked = new Date(now.getFullYear(), now.getMonth(), now.getDate() + o[1]);
          view = new Date(picked.getFullYear(), picked.getMonth(), 1);
          if (input.type === 'date') {
            input.value = ymd(picked); fire(input); close();
          } else {
            applyDateTime();
            var cal = box.querySelector('.dp-cal');
            if (cal) renderCalendar(cal);
          }
        }));
      });
    }
    box.appendChild(bar);
  }

  function open(inp, trigger) {
    close();
    input = inp; opener = trigger;
    trigger.classList.add('dp-on');

    var d = parse(inp) || new Date();
    hh = d.getHours(); mm = d.getMinutes();
    picked = inp.type === 'time' ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
    view = new Date(d.getFullYear(), d.getMonth(), 1);

    panel = document.createElement('div');
    panel.className = 'dp-panel' + (inp.type === 'time' ? ' dp-panel-time' : '');

    if (inp.type !== 'time') {
      var cal = document.createElement('div');
      cal.className = 'dp-cal';
      panel.appendChild(cal);
      renderCalendar(cal);
    }
    if (inp.type !== 'date') renderTime(panel);
    renderQuick(panel);

    document.body.appendChild(panel);

    /* 定位：默认在下方，空间不够翻上去 */
    var r = trigger.getBoundingClientRect();
    var pw = panel.offsetWidth, ph = panel.offsetHeight;
    var left = Math.min(r.left, window.innerWidth - pw - 12);
    left = Math.max(12, left);
    var top = r.bottom + 6;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';

    setTimeout(function () {
      document.addEventListener('mousedown', onDocDown, true);
      document.addEventListener('keydown', onKey, true);
    }, 0);
  }

  /* ---------- 把原生 input 换成触发器 ---------- */
  function enhance(root) {
    var list = (root || document).querySelectorAll(SEL);
    Array.prototype.forEach.call(list, function (inp) {
      /* 自愈：表单重绘时 input 会被移走，触发器要跟着重建，否则只剩标签 */
      if (inp.dataset.dpDone) {
        if (!inp._dpBtn || !inp._dpBtn.isConnected) attach(inp);
        return;
      }
      inp.dataset.dpDone = '1';
      inp.classList.add('dp-native');
      attach(inp);
    });
  }

  function attach(inp) {
    {

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dp-trigger' + (inp.value ? '' : ' dp-empty');
      btn.dataset.dpType = inp.type;
      btn.textContent = label(inp) || (inp.type === 'time' ? '选择时间' : '选择日期');
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (panel && input === inp) { close(); return; }
        open(inp, btn);
      });

      if (inp._dpBtn && inp._dpBtn.parentNode) inp._dpBtn.remove();
      inp._dpBtn = btn;
      inp.parentNode.insertBefore(btn, inp.nextSibling);
      inp.addEventListener('input', function () {
        btn.textContent = label(inp) || (inp.type === 'time' ? '选择时间' : '选择日期');
        btn.classList.toggle('dp-empty', !inp.value);
      });
      inp.addEventListener('change', function () {
        btn.textContent = label(inp) || (inp.type === 'time' ? '选择时间' : '选择日期');
        btn.classList.toggle('dp-empty', !inp.value);
      });
    }
  }

  var mo = new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      Array.prototype.forEach.call(m.addedNodes || [], function (n) {
        if (n.nodeType !== 1) return;
        enhance(n);
        if (n.matches && n.matches(SEL)) enhance(n.parentNode || document);
      });
    });
  });

  function boot() {
    enhance(document);
    mo.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.DpPicker = { open: open, close: close };
})();
