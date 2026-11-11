/* =========================================================
   view-hq.js — 管理公司端页面
   ========================================================= */

/* =========================================================
   门店提需
   ========================================================= */
/* 2026-10-29 手机端预览开关：只有带 ?ui=m2 且屏宽<=900 时才走移动端分支 */
function M2() {
  return window.innerWidth <= 900;
}

/* 日期快捷 chips：[标签, 相对天数] → 一排按钮，点一下把日期填进去 */
function dateChips(items, onPick) {
  const wrap = h('div', { class: 'dchips' });
  items.forEach(([label, days]) => {
    wrap.appendChild(h('button', {
      type: 'button', class: 'dchip',
      onclick: (e) => { if (e) e.preventDefault(); onPick(days); }
    }, label));
  });
  return wrap;
}

function pageHqDemands() {
  const wrap = h('div');
  /* 状态/分类多选（空 = 全部需求）；默认选中「待我评估」/「我负责处理」 */
  const tabSet = new Set([isCommittee() ? 'review' : 'mine']);
  const statBox = h('div');
  const tabsBar = h('div', { class: 'tabs chip-tabs seg-track' });
  const mfBarBoxD = h('div');   /* 手机端药丸容器 */
  const listBox = h('div');

  function pool() { return visibleDemands(); }

  /** 每个分类的判定函数 */
  const COND = {
    review: d => d.status === 'pending',
    assign: d => d.status === 'approved',
    mine: d => d.assign && d.assign.toId === me.id && d.status === 'assigned',
    done: d => d.status === 'completed' || d.status === 'confirmed',
    rejected: d => d.status === 'rejected',
    archived: d => !!d.archivedAt
  };
  const TABS = () => {
    const arr = [];
    if (isCommittee()) {
      arr.push(['review', '待我评估', pool().filter(COND.review).length]);
      arr.push(['assign', '待派发', pool().filter(COND.assign).length]);
    }
    arr.push(['mine', '我负责处理', pool().filter(COND.mine).length]);
    arr.push(['done', '已完成', pool().filter(COND.done).length]);
    arr.push(['rejected', '已驳回', pool().filter(COND.rejected).length]);
    arr.push(['archived', '已归档', archivedDemands().length]);
    return arr;
  };

  /** 多选取并集 */
  function listFor() {
    let l = tabSet.has('archived') ? archivedDemands() : pool();
    if (tabSet.size) l = l.filter(d => Array.from(tabSet).some(k => COND[k] && COND[k](d)));
    return l.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /* after = 操作完成后的回调。默认只重绘列表；
     若调用方来自「需求详情」弹窗，会传一个「用最新数据重开详情」的函数进来，
     否则弹窗会停在旧状态、按钮也不更新（2026-10-22：管委会通过后看不到「派发责任人」）。 */
  function actionsFor(d, after) {
    const done = after || paint;
    const acts = [];
    // 卡片本身可点击查看详情，按钮必须阻止冒泡
    const stop = fn => e => { if (e) e.stopPropagation(); fn(); };
    if (isCommittee() && d.status === 'pending') {
      acts.push(h('button', { class: 'btn btn-sm btn-ok', onclick: stop(() => openReviewModal(d, 'pass', done)) }, '通过'));
      acts.push(h('button', { class: 'btn btn-sm', onclick: stop(() => openReviewModal(d, 'reject', done)) }, '驳回'));
    }
    if (isCommittee() && d.status === 'approved') {
      acts.push(h('button', { class: 'btn btn-sm btn-primary', onclick: stop(() => openAssignModal(d, done)) }, '派发责任人'));
    }
    if (d.status === 'assigned' && d.assign && d.assign.toId === me.id) {
      acts.push(h('button', { class: 'btn btn-sm btn-primary', onclick: stop(() => openHandleModal(d, done)) }, '完成处理'));
    }
    return acts;
  }

  function paint() {
    const all = pool();
    clear(statBox);
    const fig = (val, label, cls) => h('div', { class: 'kpi' + (cls ? ' ' + cls : '') }, [
      h('div', { class: 'kpi-v', text: String(val) }),
      h('div', { class: 'kpi-l', text: label })
    ]);
    const LD = {
      pending: M2() ? '待评估' : '待评估需求',
      approved: M2() ? '待派发' : '已通过待派发',
      assigned: '处理中',
      completed: M2() ? '待门店确认' : '待门店确认',
      rejected: M2() ? '已驳回' : '已驳回'
    };
    statBox.appendChild(h('div', { class: 'kpi-strip k5' }, [
      fig(all.filter(d => d.status === 'pending').length, LD.pending),
      fig(all.filter(d => d.status === 'approved').length, LD.approved),
      fig(all.filter(d => d.status === 'assigned').length, LD.assigned),
      fig(all.filter(d => d.status === 'completed').length, M2() ? '待确认' : LD.completed),
      fig(all.filter(d => d.status === 'rejected').length, LD.rejected)
    ]));

    clear(tabsBar);
    tabsBar.appendChild(h('div', {
      class: 'tab' + (tabSet.size === 0 ? ' active' : ''),
      onclick: () => { tabSet.clear(); paint(); }
    }, [h('span', { text: '全部需求' }), h('span', { class: 'cnt' }, String(pool().length))]));
    TABS().forEach(([k, label, n]) => tabsBar.appendChild(h('div', {
      class: 'tab' + (tabSet.has(k) ? ' active' : ''), onclick: () => { tabSet.has(k) ? tabSet.delete(k) : tabSet.add(k); paint(); }
    }, [label, h('span', { class: 'cnt' }, String(n))])));
    const hasReview = tabSet.has('review');

    if (typeof paintMobileBar === 'function') paintMobileBar();
    const list = listFor();
    clear(listBox);
    if (!list.length) {
      listBox.appendChild(emptyNode(hasReview ? '没有待评估的需求' : '当前筛选下暂无需求', null, 'inbox'));
      return;
    }
    const l = h('div', { class: 'task-list' });
    list.forEach(d => {
      const card = renderDemandCard(d, {
        onDeleted: paint,
        onClick: () => openDemandDetail(d, {
          /* 传「工厂函数」而不是现成的按钮数组：详情弹窗里的操作完成后，
             要用**最新数据**重新生成按钮（状态变了，按钮也该变） */
          getActions: (dd, after) => actionsFor(dd, after),
          onAction: paint
        })
      });
      const acts = actionsFor(d);
      if (canArchiveDemand(d)) acts.push(h('button', {
        class: 'btn btn-sm', style: { opacity: '.8' },
        onclick: (e) => { if (e) e.stopPropagation(); archiveDemandById(d.id, true); toast('已归档'); paint(); }
      }, '归档'));
      if (me.admin && d.archivedAt) acts.push(h('button', {
        class: 'btn btn-sm', style: { opacity: '.8' },
        onclick: (e) => { if (e) e.stopPropagation(); archiveDemandById(d.id, false); toast('已取消归档'); paint(); }
      }, '取消归档'));
      if (acts.length) {
        const bar = h('div', { class: 'tc-foot', style: { borderTop: '1px dashed var(--line)' } }, [
          h('span', { class: 'fhint todo-hint', style: { margin: '0' }, text: '待你处理：' + (d.status === 'pending' ? '评估需求是否通过' : d.status === 'approved' ? '选择责任人并派发' : '提交处理结果') }),
          h('div', { class: 'row' }, acts)
        ]);
        card.appendChild(bar);
      }
      l.appendChild(card);
    });
    listBox.appendChild(l);
  }

  /* 手机端药丸回显（放在 paint 之后定义也行：函数提升） */
  function paintMobileBar() {
    if (!M2()) return;
    const one = tabSet.size === 1 ? Array.from(tabSet)[0] : null;
    const stText = tabSet.size === 0 ? '全部需求'
      : one ? ((TABS().find(t => t[0] === one) || [0, '已选'])[1]) : '已选 ' + tabSet.size + ' 项';
    clear(mfBarBoxD);
    mfBarBoxD.appendChild(h('div', { class: 'mf-bar' }, [
      filterPill({
        label: '状态', value: stText, active: tabSet.size > 0,
        onClick: () => openFilterSheet({
          title: '需求状态', multi: true,
          options: [['review', '待我评估'], ['assign', '待派发'], ['mine', '我负责处理'],
                    ['done', '已完成'], ['rejected', '已驳回'], ['archived', '已归档']]
            .map(([k, t]) => ({ v: k, t: t })),
          selected: tabSet, onChange: () => paint()
        })
      })
    ]));
  }

  /* 页面级操作放顶栏（与任务管理一致） */
  setPageActions([
    h('button', { class: 'btn btn-sm', onclick: exportDemands }, '导出 CSV')
  ]);
  paint();
  paintMobileBar();
  if (M2()) {
    wrap.appendChild(mfBarBoxD);
  } else {
    wrap.appendChild(h('div', { class: 'flt-bar' }, [
      h('div', { class: 'flt-group flt-seg' }, [h('span', { class: 'flt-gl', text: '状态' }), tabsBar]),
      h('span', { class: 'flt-hint', text: '可多选' })
    ]));
  }
  wrap.appendChild(statBox); wrap.appendChild(listBox);
  return wrap;
}

function exportDemands(range) {
  const rows = [['需求编号', '门店', '标题', '期望部门', '状态', '提交时间', '评估人', '评估结果', '评估意见', '责任人', '责任部门', '期望完成', '实际完成', '处理说明', '门店评分']];
  const lo = range ? range.from.getTime() : -Infinity;
  const hi = range ? new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate(), 23, 59, 59).getTime() : Infinity;
  state.demands.slice()
    .filter(d => { const t = new Date(d.createdAt).getTime(); return t >= lo && t <= hi; })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).forEach(d => {
    rows.push([
      d.code, d.storeName, d.title, d.targetDept || '不限',
      (DEMAND_STATUS[d.status] || {}).label || d.status, ymdhm(d.createdAt),
      d.review ? d.review.byName : '', d.review ? (d.review.result === 'pass' ? '通过' : '驳回') : '', d.review ? d.review.comment : '',
      d.assign ? d.assign.toName : '', d.assign ? d.assign.dept : '', d.assign ? d.assign.expectDate : '',
      d.complete ? ymdhm(d.complete.at) : '', d.complete ? d.complete.text : '',
      d.confirm ? d.confirm.rating + ' 星' : ''
    ]);
  });
  downloadText('门店需求台账_' + ymd(new Date()) + '.csv', toCsv(rows));
  toast('已导出 CSV', 'ok');
}

/* ---------------- 评估 ---------------- */
function openReviewModal(d, preset, onDone) {
  let result = preset || 'pass';
  const comment = textareaNode({ rows: '4', placeholder: result === 'pass' ? '通过理由 / 附加要求 / 预算与资源说明' : '驳回原因，便于门店后续改进' });
  const seg = h('div', { class: 'row' });
  function paintSeg() {
    clear(seg);
    [['pass', '✅ 评估通过', 'btn-ok'], ['reject', '⛔ 驳回需求', 'btn-danger']].forEach(([v, t, c]) => {
      seg.appendChild(h('button', {
        class: 'btn btn-sm ' + (result === v ? c : ''), onclick: () => { result = v; paintSeg(); }
      }, t));
    });
  }
  paintSeg();
  const inst = openModal({
    title: '管委会评估需求', sub: d.code + '　' + d.storeName,
    body: h('div', {}, [
      h('div', { class: 'done-box', style: { background: 'var(--panel-2)', color: 'var(--text-2)', marginBottom: '16px' } }, [
        h('div', { class: 'db-t' }, [h('span', {}, d.title), h('span', { style: { fontWeight: '400' }, text: '期望部门：' + (d.targetDept || '不限') })]),
        h('div', { class: 'db-c', text: d.desc || '（无描述）' }),
        thumbsNode(d.images)
      ]),
      fgroup('评估结论', seg, null, true),
      fgroup('评估意见', comment, '意见会同步给提出门店，也会记入流转日志', true)
    ]),
    footer: [
      h('button', { class: 'btn', onclick: () => inst.close() }, '取消'),
      h('button', {
        class: 'btn ' + (result === 'pass' ? 'btn-ok' : 'btn-danger'), onclick: () => {
          if (!comment.value.trim()) { toast('请填写评估意见', 'err'); return; }
          reviewDemand(d.id, result, comment.value.trim());
          inst.close(); toast(result === 'pass' ? '已通过，请继续派发责任人' : '已驳回', 'ok');
          onDone && onDone();
        }
      }, result === 'pass' ? '确认通过' : '确认驳回')
    ]
  });
}

/* ---------------- 派发 ---------------- */
function openAssignModal(d, onDone) {
  const sel = h('select', { class: 'select' });
  hqSelectList().forEach(g => {
    const og = h('optgroup', { label: g.dept });
    g.users.forEach(u => og.appendChild(h('option', { value: u.id }, u.name + '（' + u.title + '）')));
    sel.appendChild(og);
  });
  if (d.targetDept) {
    const hit = Array.from(sel.querySelectorAll('option')).find(o => {
      const u = getHq(o.value); return u && u.dept === d.targetDept;
    });
    if (hit) sel.value = hit.value;
  }
  const expect = inputNode({ type: 'date', value: ymd(addDays(new Date(), 3)) });
  expect.min = ymd(new Date());
  expect.classList.add('inp-date');
  const expectChips = dateChips([
    ['明天', 1], ['3 天后', 3], ['一周后', 7], ['两周后', 14]
  ], (n) => { expect.value = ymd(addDays(new Date(), n)); expect.classList.remove('inp-err'); });
  const note = textareaNode({ rows: '3', placeholder: '给责任人的补充说明（可选）' });
  const inst = openModal({
    title: '派发责任人', sub: d.code + '　' + d.title,
    body: h('div', {}, [
      h('div', { class: 'done-box', style: { background: 'var(--ok-bg)', color: 'var(--ok-tx)', marginBottom: '16px' }, text: '评估意见：' + (d.review ? d.review.comment : '—') }),
      fgroup('责任人（管理公司）', sel, '按部门分组，默认推荐门店期望部门的对接人', true),
      fgroup('期望完成时间', expect, '超过该时间未处理，会在提醒中心持续提示', true),
      expectChips,
      fgroup('派发说明（可选）', note)
    ]),
    footer: [
      h('button', { class: 'btn', onclick: () => inst.close() }, '取消'),
      h('button', {
        class: 'btn btn-primary', onclick: () => {
          if (!expect.value) { toast('请选择期望完成时间', 'err'); return; }
          assignDemand(d.id, sel.value, expect.value, note.value.trim());
          inst.close(); toast('已派发给 ' + (getHq(sel.value) || {}).name, 'ok'); onDone && onDone();
        }
      }, '确认派发')
    ]
  });
}

/* ---------------- 完成处理 ---------------- */
function openHandleModal(d, onDone) {
  const text = textareaNode({ rows: '5', placeholder: '说明处理结果、交付物、后续注意事项' });
  const images = [], links = [];
  const inst = openModal({
    title: '提交处理结果', sub: d.code + '　' + d.title,
    body: h('div', {}, [
      h('div', { class: 'done-box', style: { background: 'var(--panel-2)', color: 'var(--text-2)', marginBottom: '16px' } }, [
        h('div', { class: 'db-t' }, [h('span', {}, d.storeName + ' 提出'), h('span', { style: { fontWeight: '400' }, text: '期望完成：' + (d.assign ? d.assign.expectDate : '—') })]),
        h('div', { class: 'db-c', text: d.desc || '' })
      ]),
      fgroup('处理说明', text, null, true),
      fgroup('图片凭证（可选）', imgUploader(images, null, 6)),
      fgroup('相关链接（可选）', linkEditor(links, null))
    ]),
    footer: [
      h('button', { class: 'btn', onclick: () => inst.close() }, '取消'),
      h('button', {
        class: 'btn btn-ok', onclick: () => {
          if (!text.value.trim()) { toast('请填写处理说明', 'err'); return; }
          completeDemand(d.id, text.value.trim(), images.slice(), links.filter(l => l.url));
          inst.close(); toast('已提交，等待门店确认', 'ok'); onDone && onDone();
        }
      }, '提交完成')
    ]
  });
}

/* =========================================================
   我发布的任务
   ========================================================= */
function pageHqTasks() {
  const wrap = h('div');
  /* 任务来源多选：我发布的 / 其他部门发布的（两个都选 = 全公司） */
  const scopeSet = new Set(isCommittee() ? ['mine', 'others'] : ['mine']);
  const tabSet = new Set(['active']);   // 任务状态多选（空 = 全部）
  const deptSet = new Set();             // 发布部门多选（空 = 全部）
  /* 任务类型由左侧导航决定（单选取代原来的多选，2026-11-11） */
  const cycleSet = new Set((window.__hqCycle && window.__hqCycle !== 'all') ? [window.__hqCycle] : []);
  const statBox = h('div');
  const scopeBar = h('div', { class: 'm2-toolrow', style: { marginLeft: 'auto' } });
  const tabsBar = h('div', { class: 'tabs chip-tabs seg-track' });
  const cycleBar = h('div', { class: 'tabs chip-tabs' });
  const clearSlot = h('span', { class: 'flt-clear-slot' });
  const listBox = h('div');
  /* 筛选行标签（与任务来源行同宽，保证两行选项左对齐） */
  const statusLabel = null; /* 标签已内联到 .flt-group，保留变量避免旧引用报错 */
  /* 手机端的部门筛选：与其他页一致，渲染成 .tabs 交给 m2-ui 收进弹窗 */
  const deptBar = h('div');
  const mfBarBox = h('div');   /* 手机端药丸容器，paint 时重建以回显筛选状态 */
  let repaintDept = null;   /* paintDeptBar 在下面的块里定义，这里留一个函数级引用给 paint 用 */

  /** 当前「任务来源」选中的范围说明 */
  function scopeTip() {
    if (scopeSet.size === 0) return '未选择';
    if (scopeSet.size === 2) return '全部部门';
    return scopeSet.has('mine') ? '我发布的' : '其他部门发布的';
  }
  /** 应用「任务来源」筛选后的任务 */
  function sourceItems() {
    const mineOn = scopeSet.has('mine'), othersOn = scopeSet.has('others');
    return state.tasks.filter(t => (mineOn && t.creatorId === me.id) || (othersOn && t.creatorId !== me.id));
  }
  function base() {
    let l = sourceItems();
    if (deptSet.size) l = l.filter(t => deptSet.has(t.dept));
    if (cycleSet.size) l = l.filter(t => cycleSet.has(t.cycle));
    if (tabSet.size) l = l.filter(t => (t.status === 'active' ? tabSet.has('active') : tabSet.has('stopped')));
    return l.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /* 任务来源筛选行：与门店端发布人筛选同构（标签 + 多选 chips + 清除），新建任务按钮并入同一行右端 */
  function paintScope() {
    /* 2026-10-29：两端统一，不再用「我发布的 / 其他部门」段选；部门筛选见下方 deptBar */
    clear(scopeBar);
    scopeBar.appendChild(h('div', { class: 'm2-toolrow' }, [
      M2() ? null : h('button', {
        class: 'btn',
        onclick: () => (window.CwsjImport ? window.CwsjImport.open(paintAll) : toast('批量导入模块未加载，请刷新页面', 'err'))
      }, '批量导入'),
      h('button', { class: 'btn btn-primary', onclick: () => openTaskForm(null, paintAll) }, '+ 新建任务')
    ]));
  }

  /* 手机端：不再放「我发布的 / 其他部门」段选，默认只看我发布的；
     管委会要看全公司时用筛选里的范围项（后续批次加） */
  function paintScopeMobile() {
    clear(scopeBar);
    scopeBar.appendChild(h('div', { class: 'm2-toolrow' }, [
      h('button', { class: 'btn m2-newtask', onclick: () => openTaskForm(null, paintAll) }, '+ 新建任务')
    ]));
  }

  function renderActions() {
    const anyFilter = deptSet.size || cycleSet.size || tabSet.size !== 1 || !tabSet.has('active');
    setPageActions([
      anyFilter ? h('button', {
        class: 'btn btn-sm btn-ghost',
        onclick: () => {
          deptSet.clear(); cycleSet.clear(); tabSet.clear(); tabSet.add('active');
          if (typeof cycleFilter !== 'undefined' && cycleFilter) cycleFilter.refresh();
          paint();
        }
      }, '清除筛选') : null,
      M2() ? null : h('button', {
        class: 'btn btn-sm',
        onclick: () => (window.CwsjImport ? window.CwsjImport.open(paintAll) : toast('批量导入模块未加载，请刷新页面', 'err'))
      }, '批量导入'),
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => openTaskForm(null, paintAll) }, '+ 新建任务')
    ]);
  }

  /* 手机端筛选：三颗药丸，选项进底部弹层（2026-11-06） */
  function buildMobileBar() {
    const stText = tabSet.size === 1 && tabSet.has('stopped') ? '已停止'
      : tabSet.size === 1 && tabSet.has('active') ? '进行中' : '全部';
    const deptText = deptSet.size === 0 ? '全部'
      : deptSet.size === 1 ? Array.from(deptSet)[0] : '已选 ' + deptSet.size + ' 个';
    const cycText = cycleSet.size === 0 ? '全部'
      : cycleSet.size === 1 ? (CYCLE_LABEL[Array.from(cycleSet)[0]] || '1 项') : '已选 ' + cycleSet.size + ' 个';
    return h('div', { class: 'mf-bar' }, [
      filterPill({
        label: '状态', value: stText, active: stText !== '全部',
        onClick: () => {
          const cur = new Set(tabSet.size === 1 ? Array.from(tabSet) : []);
          openFilterSheet({
            title: '任务状态', multi: false,
            options: [{ v: 'active', t: '进行中' }, { v: 'stopped', t: '已停止' }],
            selected: cur,
            onChange: () => { tabSet.clear(); if (cur.size) tabSet.add(Array.from(cur)[0]); paint(); }
          });
        }
      }),
      filterPill({
        label: '部门', value: deptText, active: deptSet.size > 0, count: deptSet.size || '',
        onClick: () => openFilterSheet({
          title: '部门', multi: true,
          options: Array.from(new Set(state.tasks.map(t => t.dept).filter(Boolean)))
            .map(d => ({ v: d, t: d, n: state.tasks.filter(x => x.dept === d).length })),
          selected: deptSet, onChange: () => paint()
        })
      }),
      filterPill({
        label: '类型', value: cycText, active: cycleSet.size > 0, count: cycleSet.size || '',
        onClick: () => openFilterSheet({
          title: '任务类型', multi: true,
          options: [['daily', '每日必做'], ['weekly', '每周必做'], ['monthly', '每月必做'], ['once', '专项任务']]
            .map(([k, t]) => ({ v: k, t: t, n: state.tasks.filter(x => x.cycle === k).length })),
          selected: cycleSet, onChange: () => paint()
        })
      })
    ]);
  }

  function paint() {
    const src = sourceItems();
    let overdueTotal = 0, dueTotal = 0, doneTotal = 0, expTotal = 0;
    src.filter(t => t.status === 'active').forEach(t => {
      const p = taskProgress(t);
      overdueTotal += p.overdue; dueTotal += p.dueSoon; doneTotal += p.done; expTotal += p.expected;
    });
    const actN = src.filter(t => t.status === 'active').length;

    /* 类型下拉的数量随部门筛选联动（cycleFilter 在下面定义，paint 首次调用时已存在） */
    if (typeof cycleFilter !== 'undefined' && cycleFilter) cycleFilter.refresh();

    /* 顶栏操作随筛选状态刷新 */
    renderActions();
    /* 手机端药丸回显 */
    if (M2() && mfBarBox) { clear(mfBarBox); mfBarBox.appendChild(buildMobileBar()); }

    clear(tabsBar);
    tabsBar.appendChild(h('div', {
      class: 'tab' + (tabSet.size === 0 ? ' active' : ''),
      onclick: () => { tabSet.clear(); paint(); }
    }, [h('span', { text: '全部' }), h('span', { class: 'cnt' }, String(src.length))]));
    [['active', '进行中', actN], ['stopped', '已停止', src.length - actN]].forEach(([k, l, n]) => tabsBar.appendChild(h('div', {
      class: 'tab' + (tabSet.has(k) ? ' active' : ''), onclick: () => { tabSet.has(k) ? tabSet.delete(k) : tabSet.add(k); paint(); }
    }, [l, h('span', { class: 'cnt' }, String(n))])));

    clear(statBox);
    /* KPI 条：一块面板 + 内部发丝线，主指标左宽，其余降级读数（第二批 v2） */
    const coverN = new Set(src.filter(t => t.status === 'active').flatMap(t => t.storeIds)).size;
    const fig = (val, label, cls) => h('div', { class: 'kpi' + (cls ? ' ' + cls : '') }, [
      h('div', { class: 'kpi-v', text: String(val) }),
      h('div', { class: 'kpi-l', text: label })
    ]);
    /* 手机上列宽只有 90px，标签用短名，避免折行 */
    const L = {
      doing: M2() ? '进行中' : '进行中任务',
      overdue: M2() ? '逾期门店' : '逾期未提交门店',
      due: M2() ? '即将到期' : '即将到期门店',
      rate: M2() ? '完成率' : '本期完成率'
    };
    statBox.appendChild(h('div', { class: 'kpi-strip' }, [
      h('div', { class: 'kpi-main' }, [
        h('span', { class: 'kpi-v', text: String(actN) }),
        h('div', { class: 'kpi-lblock' }, [
          h('div', { class: 'kpi-l', text: L.doing })
        ])
      ]),
      fig(overdueTotal, L.overdue, overdueTotal ? 'is-danger' : ''),
      fig(dueTotal, L.due, dueTotal ? 'is-warn' : ''),
      fig(expTotal ? pct(doneTotal, expTotal).toFixed(1) + '%' : '—', L.rate)
    ]));

    const list = base();
    clear(listBox);
    if (!list.length) {
      listBox.appendChild(emptyNode(scopeSet.size === 0 ? '未选择任务来源，当前没有可显示的任务'
        : (scopeSet.size === 1 && scopeSet.has('mine') ? '还没有你发布的任务，点击右上角「新建任务」下发'
          : '当前筛选下没有任务'), null, 'checklist'));
      return;
    }
    const l = h('div', { class: 'task-list' });
    list.forEach(t => l.appendChild(taskAdminCard(t, paintAll)));
    listBox.appendChild(l);
  }

  function paintAll() { paintScope(); paint(); }

  paintAll();
  /* 2026-10-29：部门筛选与右侧按钮放同一行，避免中间留一条空白 */
  const topRow = h('div', { class: 'hq-top' });
  wrap.appendChild(topRow);
  {
    /* 部门：平铺胶囊 + 溢出折叠（方案 A） */
    deptBar.classList.add('flt-group');
    deptBar.appendChild(h('span', { class: 'flt-gl', text: '部门' }));
    {
      const cnt0 = {};
      state.tasks.forEach(t => { if (t.dept) cnt0[t.dept] = (cnt0[t.dept] || 0) + 1; });
      const deptFilter = chipFilterWithMore({
        label: '部门', max: 4,
        options: () => Array.from(new Set(state.tasks.map(t => t.dept).filter(Boolean)))
          .map(d => ({ v: d, t: d, n: cnt0[d] || 0 })),
        selected: deptSet,
        onChange: () => { paintAll(); }
      });
      deptBar.appendChild(deptFilter.el);
      repaintDept = () => deptFilter.refresh();
    }

    /* 类型：同样平铺，4 个以内不会折叠 */
    cycleBar.classList.add('flt-group');
    cycleBar.appendChild(h('span', { class: 'flt-gl', text: '类型' }));
    const cycleFilter = chipFilterWithMore({
      label: '类型', max: 4,
      options: () => {
        const scoped = deptSet.size ? state.tasks.filter(t => deptSet.has(t.dept)) : state.tasks;
        return ['daily', 'weekly', 'monthly', 'once'].map(k => [k, CYCLE_LABEL[k]])
          .map(([k, l]) => ({ v: k, t: l, n: scoped.filter(t => t.cycle === k).length }));
      },
      selected: cycleSet,
      onChange: () => paint()
    });
    cycleBar.appendChild(cycleFilter.el);
    /* 手机：药丸 + 弹层；桌面：状态底板 + 矩形标签（2026-11-06） */
    if (M2()) {
      wrap.appendChild(mfBarBox);
    } else {
      /* 类型已移到左侧导航（桌面端），筛选条只留 状态 / 部门 */
      const bar = h('div', { class: 'flt-bar' }, [
        h('div', { class: 'flt-group flt-seg' }, [h('span', { class: 'flt-gl', text: '状态' }), tabsBar]),
        h('span', { class: 'flt-sep' }),
        deptBar
      ]);
      wrap.appendChild(bar);
    }

  }
  wrap.appendChild(statBox); wrap.appendChild(listBox);
  return wrap;
}

/** 管理视角任务卡 */
function taskAdminCard(t, refresh) {
  const p = taskProgress(t);
  const m = t.status === 'active' ? null : { label: '已停止', tag: 'tag-gray' };
  /* 状态只在异常时才上色：正常态中性，临期黄、逾期红、已停止灰 */
  const stCls = t.status !== 'active' ? ' st-stopped' : (p.overdue ? ' st-overdue' : p.dueSoon ? ' st-due' : '');
  const openDetail = () => openTaskDetail({ task: t, due: occDue(t, new Date()), key: occKey(t, new Date()), rec: null, status: 'normal' });
  const card = h('div', {
    class: 'task-card hq-card' + stCls, dataset: { taskId: t.id || '' },
    title: '点击查看进度明细',
    onclick: (ev) => { if (ev.target.closest('a,button,img')) return; openDetail(); }
  });
  card.appendChild(h('div', { class: 'tc-head' }, [
    h('div', { style: { flex: '1', minWidth: '0' } }, [
      h('div', { class: 'tc-title', text: t.title }),
      h('div', { class: 'tc-meta' }, [
        tagNode(CYCLE_LABEL[t.cycle], CYCLE_TAG[t.cycle]),
        h('span', {}, cycleDesc(t)),
        h('span', { class: 'sep' }, '·'),
        h('span', {}, t.dept + ' · ' + t.creatorName),
        /* 手机上只留「类型 / 时间 / 部门·人」，重要程度与发布日进详情看 */
        M2() ? null : h('span', { class: 'sep' }, '·'),
        M2() ? null : h('span', {}, '重要程度'),
        M2() ? null : starsNode(t.priority),
        M2() ? null : h('span', { class: 'sep' }, '·'),
        M2() ? null : h('span', {}, '发布于 ' + ymd(t.createdAt))
      ])
    ]),
    h('div', { class: 'tc-right' }, [
      p.overdue ? tagNode('逾期 ' + p.overdue + ' 家', 'tag-red') : null,
      p.dueSoon ? tagNode('临期 ' + p.dueSoon + ' 家', 'tag-yellow') : null,
      m ? tagNode(m.label, m.tag) : null
    ])
  ]));
  if (t.content) card.appendChild(h('div', { class: 'tc-body', text: t.content }));

  /* 任务附件：图片 + 链接（与门店端卡片同一套组件，2026-11-03） */
  const tImg = (typeof thumbsNode === 'function') ? thumbsNode(t.images) : null;
  if (tImg) card.appendChild(tImg);
  const tLink = (typeof linksNode === 'function') ? linksNode(t.links) : null;
  if (tLink) card.appendChild(tLink);

  /* 进度：一条 + 右侧数字，不再重复文案 */
  const rateCls = p.rate >= 90 ? 'ok' : p.rate >= 60 ? '' : 'danger';
  card.appendChild(h('div', { class: 'tc-progress' }, [
    h('div', { class: 'tc-bar' }, progressNode(p.rate, rateCls)),
    h('span', { class: 'tc-num', text: p.done + '/' + p.expected + ' · ' + p.rate.toFixed(0) + '%' })
  ]));

  /* 只留 ⋯ 菜单；主操作变成整卡点击（破坏性操作仍带二次确认） */
  const moreBtn = h('button', {
    class: 'btn-more', title: '更多操作', html: iconSvg('more', 16),
    onclick: (ev) => {
      ev.stopPropagation();
      const items = [
        ['进度明细', () => openDetail()],
        ['督办看板', () => openTaskBoardFor(t)],
        (t.creatorId === me.id || isCommittee()) ? ['编辑', () => openTaskForm(t, refresh)] : null,
        t.status === 'active'
          ? ['停止任务', () => confirmDialog({
            title: '停止任务', message: '停止后该任务不再生成新的周期实例，已产生的完成记录会保留。', okText: '停止任务',
            onOk: () => { stopTask(t.id); toast('任务已停止'); refresh(); }
          })]
          : ['恢复运行', () => { resumeTask(t.id); toast('任务已恢复运行', 'ok'); refresh(); }],
        t.creatorId === me.id ? ['删除任务', () => confirmDialog({
          title: '删除任务', message: '删除后任务及其全部完成记录将不可恢复，确定继续？', danger: true, okText: '删除',
          onOk: () => { removeTask(t.id); toast('任务已删除'); refresh(); }
        }), 'danger'] : null
      ].filter(Boolean);
      const r = ev.currentTarget.getBoundingClientRect();
      const pop = h('div', { class: 'menu-pop', style: { top: (r.bottom + 6) + 'px', left: Math.max(8, r.right - 150) + 'px' } },
        items.map(([label, fn, cls]) => h('button', {
          class: cls || '',
          onclick: (e2) => { e2.stopPropagation(); pop.remove(); document.removeEventListener('click', close); fn(); }
        }, label)));
      const close = () => { pop.remove(); document.removeEventListener('scroll', close, true); };
      document.body.appendChild(pop);
      setTimeout(() => document.addEventListener('click', close), 0);
      document.addEventListener('scroll', close, true);
    }
  });
  card.appendChild(moreBtn);
  return card;
}

/* ---------------- 新建/编辑任务表单 ---------------- */
function openTaskForm(task, onDone, opts) {
  const isEdit = !!task;
  const carry = (opts && opts.fromTask) || null;
  const d = task || (carry ? Object.assign({}, carry, { id: undefined, status: 'active', stoppedAt: null }) : null) || {
    title: '', content: '', cycle: 'daily', time: '18:00', weekday: 5, monthDay: 25,
    deadline: ymdhm(addDays(new Date(), 3)), storeIds: [], priority: 4, remindBeforeMin: 120, remindOverdue: true,
    images: [], links: [], startDate: ymd(new Date()), stopDate: ''
  };
  const ref = {
    title: inputNode({ value: d.title, placeholder: '例如：营业前设备自检与卫生清洁' }),
    content: textareaNode({ rows: '4', value: d.content, placeholder: '写清做什么、做到什么标准、需要上传什么凭证' }),
    time: inputNode({ type: 'time', value: d.time || '18:00', style: { width: '150px' } }),
    showFrom: inputNode({ type: 'time', value: d.showFrom || '', style: { width: '150px' } }),
    weekday: selectNode(WD_CN.map((w, i) => ({ v: i + 1, t: '每周' + w })), d.weekday || 5, { style: { width: '160px' } }),
    monthDay: selectNode(Array.from({ length: 31 }, (_, i) => ({ v: i + 1, t: '每月 ' + (i + 1) + ' 日' })), d.monthDay || 25, { style: { width: '160px' } }),
    deadline: inputNode({ type: 'datetime-local', value: (d.deadline || '').slice(0, 16) }),
    startDate: inputNode({ type: 'date', value: d.startDate || ymd(new Date()) }),
    stopDate: inputNode({ type: 'date', value: d.stopDate || '' }),
    remind: null
  };
  /* 实时校验：结束日期早于开始日期就立刻标红（2026-10-30） */
  function checkDateRange() {
    const bad = !!(ref.stopDate.value && ref.startDate.value && ref.stopDate.value < ref.startDate.value);
    ref.stopDate.classList.toggle('inp-err', bad);
    if (ref.stopDate.value) ref.stopDate.min = ref.startDate.value || '';
    return !bad;
  }
  function checkDeadline() {
    if (cycle !== 'once') { ref.deadline.classList.remove('inp-err'); return true; }
    const bad = !!ref.deadline.value && new Date(ref.deadline.value).getTime() < Date.now() - 60000;
    ref.deadline.classList.toggle('inp-err', bad);
    return !bad;
  }
  ref.deadline.addEventListener('input', checkDeadline);
  ref.deadline.addEventListener('change', checkDeadline);
  ref.startDate.addEventListener('input', checkDateRange);
  ref.startDate.addEventListener('change', checkDateRange);
  ref.stopDate.addEventListener('input', checkDateRange);
  ref.stopDate.addEventListener('change', checkDateRange);
  /* 到期前提醒：chip 单选，档位随周期变化（2026-10-30） */
  let remindMin = (d.remindBeforeMin === undefined ? 120 : d.remindBeforeMin);
  const REMIND_OPTS = {
    daily: [[0, '不提醒'], [15, '15 分钟'], [30, '30 分钟'], [60, '1 小时'], [120, '2 小时'], [240, '4 小时'], [720, '12 小时']],
    weekly: [[0, '不提醒'], [60, '1 小时'], [120, '2 小时'], [720, '12 小时'], [1440, '1 天'], [2880, '2 天'], [4320, '3 天']],
    monthly: [[0, '不提醒'], [120, '2 小时'], [720, '12 小时'], [1440, '1 天'], [4320, '3 天'], [10080, '7 天']],
    once: [[0, '不提醒'], [120, '2 小时'], [720, '12 小时'], [1440, '1 天'], [4320, '3 天'], [10080, '7 天']]
  };
  const remindRow = h('div', { class: 'tabs', style: { flexWrap: 'wrap' } });
  const remindHint = h('span', { class: 'fhint', style: { margin: '6px 0 0', display: 'block' }, text: '' });
  const remindTitleEl = h('div', { class: 'rm-title' });
  function remindTitle() {
    const hit = (REMIND_OPTS[cycle] || []).find(o => o[0] === remindMin);
    const t = hit ? hit[1] : '不提醒';
    return remindMin === 0 ? '到期不提醒，只在逾期后提示' : '到期前 ' + t + ' 提醒门店';
  }
  let remindAdjusted = false;
  function paintRemind() {
    const opts = REMIND_OPTS[cycle] || REMIND_OPTS.daily;
    if (!opts.some(o => o[0] === remindMin)) {
      remindMin = opts[2] ? opts[2][0] : 0;
      remindAdjusted = true;
    }
    clear(remindRow);
    opts.forEach(([v, t]) => {
      remindRow.appendChild(h('div', {
        class: 'tab' + (v === remindMin ? ' active' : ''),
        onclick: () => { remindMin = v; remindAdjusted = false; paintRemind(); }
      }, t));
    });
    if (remindTitleEl) remindTitleEl.textContent = remindTitle();
    remindHint.textContent = remindAdjusted
      ? '该周期不支持原来的提前量，已自动改为「' + (opts.find(o => o[0] === remindMin) || [0, ''])[1] + '」'
      : '';
  }

  let cycle = d.cycle;
  let priority = d.priority;
  paintRemind();
  let remindOverdue = d.remindOverdue !== false;
  const images = (d.images || []).slice();
  const links = (d.links || []).slice().map(l => ({ title: l.title, url: l.url }));

  /* 周期选择 */
  const cycleRow = h('div', { class: 'radio-cards' });
  const CYCLE_INFO = [
    ['daily', '每日必做', '每天重复，长期运行'],
    ['weekly', '每周必做', '每周指定星期重复'],
    ['monthly', '每月必做', '每月指定日期重复'],
    ['once', '专项任务', '执行一次后停止']
  ];
  function paintCycle() {
    clear(cycleRow);
    if (isEdit) {
      /* 已下发的任务不允许改周期：四个卡片渲染成灰态，不可点击，也不给"新建"按钮（防误触） */
      CYCLE_INFO.forEach(([v, t, sub]) => {
        cycleRow.appendChild(h('div', {
          class: 'radio-card' + (cycle === v ? ' on' : '') + ' rc-locked',
          title: '任务已下发，周期不可修改'
        }, [
          h('div', { class: 'rc-t', text: t }),
          h('div', { class: 'rc-d', text: sub })
        ]));
      });
      cycleRow.appendChild(h('div', {
        class: 'fhint', style: { width: '100%', margin: '6px 0 0' },
        text: '任务已下发，周期不可修改（修改会让历史考核数据的含义变化）。需要换周期请停止此任务后重新下发一条。'
      }));
      return;
    }
    CYCLE_INFO.forEach(([v, t, sub]) => cycleRow.appendChild(h('div', {
      class: 'radio-card' + (cycle === v ? ' on' : ''), onclick: () => { cycle = v; paintCycle(); paintDynamic(); paintRemind(); }
    }, [h('div', { class: 'rc-t', text: t }), h('div', { class: 'rc-d', text: sub })])));
  }
  const dynBox = h('div');
  function paintDynamic() {
    clear(dynBox);
    const rec = cycle !== 'once';
    dynBox.appendChild(h('div', { class: 'fgrid c2' }, [
      fgroup('截止时刻', ref.time, '门店需在该时刻前完成并提交', true),
      cycle === 'daily'
        ? fgroup('开始显示时间（可选）', ref.showFrom, '留空 = 全天显示。晚班任务填 13:00，13 点前不出现在门店「今日」，只在折叠行里提示', false)
        : h('div', { style: { display: 'none' } }, [ref.showFrom]),
      cycle === 'weekly' ? fgroup('每周哪一天', ref.weekday, null, true)
        : cycle === 'monthly' ? fgroup('每月哪一天', ref.monthDay, '若当月不足该日，自动取当月最后一天', true)
          : cycle === 'once' ? fgroup('截止时间（日期+时间）', ref.deadline, '专项任务到点未完成即标红', true)
            : h('div', {})
    ]));
    if (cycle === 'once') ref.time.parentNode && (ref.time.parentNode.style.display = 'none');
    dynBox.appendChild(h('div', { class: 'fgrid c2' }, [
      fgroup(rec ? '生效开始日期' : '派发日期', ref.startDate, rec ? '循环任务从该日期起长期运行' : null, rec),
      rec ? fgroup('结束日期（可选）', ref.stopDate, '留空 = 长期运行不停', false) : h('div', {})
    ]));
  }

  const picker = storePicker(d.storeIds || [], null);
  const star = starPicker(d.priority, v => { priority = v; });

  const body = h('div', {}, [
    fgroup('任务标题', ref.title, null, true),
    fgroup('任务说明', ref.content, '门店在任务卡片上会看到这段说明', true),
    fgroup('任务类型', cycleRow, '每日/每周/每月必做 = 设定一次后长期自动循环；专项任务 = 只下发一次'),
    dynBox,
    fgroup('派发门店', picker.node, '可多选，按城市分组展示', true),
    fgroup('重要程度', star, '影响门店端任务的排序与提醒强度'),
    fgroup('提醒门店', h('div', { class: 'rm-box' }, [
      h('div', { class: 'rm-head' }, [
        remindTitleEl,
        h('div', { class: 'rm-sub', text: '按当前周期可选的最小档位；改周期后档位会自动调整' })
      ]),
      remindRow,
      remindHint,
      h('div', { style: { marginTop: '10px' } },
        switchNode(remindOverdue, '逾期后每天再提醒一次（任务在门店端标红）', v => { remindOverdue = v; }))
    ])),
    fgroup('任务附件图片（可选）', imgUploader(images, null, 4)),
    fgroup('相关链接（可选）', linkEditor(links, null))
  ]);
  paintCycle(); paintDynamic();

  const inst = openModal({
    title: isEdit ? '编辑任务' : '新建任务',
    sub: isEdit ? task.title : '下发任务到指定门店，可设置循环周期与提醒规则',
    wide: true,
    body: body,
    footer: [
      h('button', { class: 'btn', onclick: () => inst.close() }, '取消'),
      h('button', {
        class: 'btn btn-primary', onclick: () => {
          const title = ref.title.value.trim();
          const content = ref.content.value.trim();
          if (!title) { toast('请填写任务标题', 'err'); return; }
          if (!content) { toast('请填写任务说明', 'err'); return; }
          const storeIds = picker.get();
          if (!storeIds.length) { toast('请至少选择一家门店', 'err'); return; }
          if (cycle !== 'once' && !ref.time.value) { toast('请设置截止时刻', 'err'); return; }
          if (cycle === 'once' && !ref.deadline.value) { toast('请设置截止时间', 'err'); return; }
          /* 日期校验（2026-10-30）：截止不能早于现在；结束日期不能早于开始日期 */
          if (cycle === 'once') {
            const dl = new Date(ref.deadline.value).getTime();
            if (dl < Date.now() - 60000) {
              ref.deadline.classList.add('inp-err');
              toast('截止时间不能早于现在', 'err'); return;
            }
            ref.deadline.classList.remove('inp-err');
          }
          if (cycle !== 'once' && ref.stopDate.value && ref.startDate.value
            && ref.stopDate.value < ref.startDate.value) {
            ref.stopDate.classList.add('inp-err');
            toast('结束日期不能早于开始日期', 'err'); return;
          }
          ref.stopDate.classList.remove('inp-err');
          const payload = {
            title: title, content: content, cycle: cycle,
            time: cycle === 'once' ? (ref.deadline.value.slice(11, 16) || '18:00') : ref.time.value,
            showFrom: (cycle === 'daily' && ref.showFrom.value) ? ref.showFrom.value : null,
            weekday: Number(ref.weekday.value), monthDay: Number(ref.monthDay.value),
            deadline: cycle === 'once' ? new Date(ref.deadline.value).toISOString() : null,
            storeIds: storeIds, priority: priority,
            remindBeforeMin: Number(remindMin) || 0, remindOverdue: remindOverdue,
            images: images.slice(), links: links.filter(l => l.url && /^https?:/i.test(l.url)),
            startDate: (function () {
              /* 周期任务：若本期已过（月任务 monthDay 已过 / 周任务本周该天已过），
                 自动把生效日顺延到下一个周期的起点，避免"刚发布就逾期" */
              const sd = ref.startDate.value || ymd(new Date());
              const now = new Date();
              if (cycle === 'monthly') {
                const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                const day = Math.min(Number(ref.monthDay.value) || 1, last);
                if (day < now.getDate()) {
                  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                  return ymd(next);
                }
              }
              if (cycle === 'weekly') {
                const wd = Number(ref.weekday.value) || 7;      // 1=周一 … 7=周日
                const curWd = now.getDay() === 0 ? 7 : now.getDay();
                if (wd < curWd) {
                  const ahead = 7 - curWd + wd;                  // 到下个周几还有几天
                  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead);
                  return ymd(next);
                }
              }
              return sd;
            })(),
            stopDate: (cycle !== 'once' && ref.stopDate.value) ? ref.stopDate.value : null,
            dept: me.dept
          };
          if (isEdit) {
            Object.assign(task, payload);
            saveState();
            toast('任务已更新', 'ok');
          } else {
            const nt = createTask(payload);
            const shifted = nt && nt.startDate && nt.startDate > ymd(new Date());
            toast('任务已下发到 ' + storeIds.length + ' 家门店' +
              (shifted ? '（今天这点已过，首期从 ' + nt.startDate + ' 开始）' : ''), 'ok');
          }
          inst.close();
          onDone && onDone();
        }
      }, isEdit ? '保存修改' : '确认下发')
    ]
  });
}

/* =========================================================
   任务督办（任务 × 门店 矩阵）
   ========================================================= */
let _boardFilter = { dept: new Set(), cycle: new Set(), status: new Set(), onlyProblem: false };
function pageHqBoard() {
  const wrap = h('div', { class: 'board-page' });
  const filterBox = h('div', { class: M2() ? 'flt-bare' : 'flt' });
  const boardBox = h('div');

  function tasksFiltered() {
    return state.tasks.filter(t => {
      if (_boardFilter.dept.size && !_boardFilter.dept.has(t.dept)) return false;
      if (_boardFilter.cycle.size && !_boardFilter.cycle.has(t.cycle)) return false;
      if (_boardFilter.status.size && !_boardFilter.status.has(t.status)) return false;
      if (_boardFilter.onlyProblem) {
        const p = taskProgress(t);
        if (!p.overdue) return false;
      }
      return true;
    }).sort((a, b) => {
      const pa = taskProgress(a), pb = taskProgress(b);
      return (pb.overdue - pa.overdue) || (pb.dueSoon - pa.dueSoon) || 0;
    });
  }

  function paint() {
    clear(boardBox);
    const list = tasksFiltered();
    if (!list.length) { boardBox.appendChild(emptyNode('没有符合条件的任务', '📋')); return; }
    if (M2()) { paintCards(list); return; }
    /* 门店列 47px + 城市合并表头（2026-10-29 改版） */
    const all = allStores();
    const badSet = new Set();
    list.forEach(t => {
      const pp = taskProgress(t);
      pp.cells.forEach(cc => { if (cc.status === 'overdue' || cc.status === 'due') badSet.add(cc.storeId); });
    });
    const stores = (_boardFilter.onlyProblem && badSet.size) ? all.filter(s => badSet.has(s.id)) : all;
    const groups = [];
    stores.forEach(s => {
      const m = s.name.match(/^(.*?)([一二三四五六七八九十]+)?店$/);
      const city = m ? m[1] : s.name;
      const branch = (m && m[2]) ? m[2] + '店' : '店';
      const last = groups[groups.length - 1];
      if (last && last.city === city) last.items.push({ s: s, branch: branch });
      else groups.push({ city: city, items: [{ s: s, branch: branch }] });
    });
    const thead = h('thead');
    const hr1 = h('tr', { class: 'city-row' });
    hr1.appendChild(h('th', { class: 'task-col' }, ''));
    groups.forEach(g => hr1.appendChild(h('th', { colspan: String(g.items.length) }, g.city)));
    hr1.appendChild(h('th', { class: 'prog-col', rowspan: '2', text: '本期进度' }));
    const hr2 = h('tr');
    hr2.appendChild(h('th', { class: 'task-col' }, h('span', { class: 'bm-corner', text: '任务 / 门店' })));
    groups.forEach(g => g.items.forEach(it => hr2.appendChild(h('th', {
      class: 'store-col', title: it.s.name
    }, [h('b', { text: g.city }), h('span', { text: it.branch })]))));
    thead.appendChild(hr1); thead.appendChild(hr2);

    const tbody = h('tbody');
    list.forEach(t => {
      const p = taskProgress(t);
      const tr = h('tr');
      tr.appendChild(h('td', { class: 'task-col' }, [
        h('div', { class: 'bm-title', text: t.title }),
        h('div', { class: 'bm-meta' }, [
          tagNode(CYCLE_LABEL[t.cycle], CYCLE_TAG[t.cycle]),
          h('span', { class: 'bm-sub', text: cycleDesc(t) + ' · ' + t.dept })
        ])
      ]));
      stores.forEach(s => {
        const cell = p.cells.find(c => c.storeId === s.id);
        const st = cell ? cell.status : 'na';
        const M = STATUS_META[st] || STATUS_META.na;
        /* 逾期不再写文字：浅红块即可，悬停显示逾期时长（2026-11-06） */
        const glyph = st === 'done' || st === 'late' ? '✓' : '';
        let tip = s.name + '：' + M.label;
        if (st === 'overdue' && cell && cell.due) {
          const hrs = Math.max(1, Math.floor((Date.now() - new Date(cell.due).getTime()) / 3600000));
          tip = s.name + '：逾期 ' + (hrs < 24 ? hrs + ' 小时' : Math.floor(hrs / 24) + ' 天');
        }
        const td = h('td', {}, h('div', {
          class: 'cell ' + (st === 'na' ? 'na' : st), title: tip,
          onclick: st === 'na' ? null : (() => openCellDetail(t, s.id, cell))
        }, glyph));
        tr.appendChild(td);
      });
      tr.appendChild(h('td', { class: 'prog-col' }, [
        h('div', { class: 'bm-prog', text: p.done + '/' + p.expected }),
        progressNode(p.rate, p.rate >= 90 ? 'ok' : p.rate >= 60 ? '' : 'danger')
      ]));
      tbody.appendChild(tr);
    });
    const table = h('table', { class: 'matrix tbl' }, [thead, tbody]);
    boardBox.appendChild(h('div', { class: 'tbl-wrap' }, table));
    boardBox.appendChild(h('div', { class: 'row mt10 board-legend' }, [
      h('span', { class: 'bm-legend', text: '图例' }),
      ...['done', 'late', 'due', 'overdue', 'normal'].map(k => h('span', { class: 'row', style: { gap: '4px' } }, [
        h('span', { class: 'cell legend-sw ' + k }),
        h('span', { class: 'fhint', style: { margin: '0' }, text: STATUS_META[k].label })
      ])),
      h('span', { class: 'bm-legend bm-legend-tail', text: '点击单元格查看门店反馈' })
    ]));
  }


  /* 手机端督办看板（2026-11-06 重设计）：
     ① 汇总条：逾期门店 / 临期 / 完成率
     ② 任务行：一行看清 完成几/共几、逾期几家；点开直接在行内铺门店状态格 */
  function paintCards(list) {
    const box = h('div', { class: 'bd' });

    /* ---- 汇总条 ---- */
    const sum = list.reduce((a, t) => {
      const p = taskProgress(t);
      a.overdue += p.overdue; a.due += p.dueSoon; a.done += p.done; a.exp += p.expected;
      return a;
    }, { overdue: 0, due: 0, done: 0, exp: 0 });
    const rate = sum.exp ? (sum.done / sum.exp * 100) : 0;
    box.appendChild(h('div', { class: 'bd-sum' }, [
      h('div', { class: 'bd-sum-i' + (sum.overdue ? ' od' : '') }, [
        h('span', { class: 'bd-sum-v', text: String(sum.overdue) }),
        h('span', { class: 'bd-sum-l', text: '逾期门店' })
      ]),
      h('div', { class: 'bd-sum-i' + (sum.due ? ' due' : '') }, [
        h('span', { class: 'bd-sum-v', text: String(sum.due) }),
        h('span', { class: 'bd-sum-l', text: '即将到期' })
      ]),
      h('div', { class: 'bd-sum-i' }, [
        h('span', { class: 'bd-sum-v', text: rate.toFixed(0) + '%' }),
        h('span', { class: 'bd-sum-l', text: '总体完成' })
      ])
    ]));

    /* ---- 任务行 ---- */
    const rows = h('div', { class: 'bd-rows' });
    list.forEach(t => {
      const p = taskProgress(t);
      const pct = Math.round(p.rate);
      const row = h('div', { class: 'bd-row' + (p.overdue ? ' od' : '') });
      const head = h('button', { class: 'bd-head', type: 'button' }, [
        h('div', { class: 'bd-left' }, [
          h('div', { class: 'bd-title', text: t.title }),
          h('div', { class: 'bd-meta', text: cycleDesc(t) + ' · ' + t.dept }),
          h('div', { class: 'bd-bar' }, progressNode(p.rate, pct >= 90 ? 'ok' : pct >= 60 ? '' : 'danger')),
          h('div', { class: 'bd-tags' }, [
            p.overdue ? h('span', { class: 'bd-tag od', text: '逾期 ' + p.overdue }) : null,
            p.dueSoon ? h('span', { class: 'bd-tag due', text: '临期 ' + p.dueSoon }) : null,
            h('span', { class: 'bd-tag ok', text: '完成 ' + p.done + '/' + p.expected })
          ])
        ]),
        h('div', { class: 'bd-right' }, [
          h('span', { class: 'bd-pct', text: pct + '%' }),
          h('span', { class: 'bd-car', html: iconSvg('chevron', 14) })
        ])
      ]);

      /* 行内展开：每店一个状态格 */
      const panel = h('div', { class: 'bd-panel' });
      let built = false;
      head.onclick = () => {
        const open = row.classList.contains('open');
        rows.querySelectorAll('.bd-row.open').forEach(r => {
          r.classList.remove('open');
          const pp = r.querySelector('.bd-panel'); if (pp) pp.style.display = 'none';
        });
        if (open) return;
        row.classList.add('open');
        if (!built) {
          const grid = h('div', { class: 'bd-grid' });
          const storeName = sid => {
            const s = allStores().find(x => x.id === sid);
            return s ? s.name : sid;
          };
          p.cells.forEach(cc => {
            const st = cc.status;
            const short = storeName(cc.storeId).replace(/^.*?(一|二|三)?店$/, m => m);
            grid.appendChild(h('button', {
              class: 'bd-cell', type: 'button',
              onclick: (e) => {
                e.stopPropagation();
                if (st === 'na') return;
                openCellDetail(t, cc.storeId, cc);
              }
            }, [
              h('span', { class: 'cell ' + st, style: { width: '20px', height: '20px', margin: '0 0 4px' } }),
              h('span', { class: 'bd-cell-n', text: short })
            ]));
          });
          panel.appendChild(grid);
          panel.appendChild(h('div', { class: 'bd-panel-foot' }, [
            h('button', { class: 'bd-more', onclick: (e) => { e.stopPropagation(); openBoardTaskDetail(t); } }, '看详细反馈 ›')
          ]));
          built = true;
        }
        panel.style.display = 'block';
      };

      row.appendChild(head);
      row.appendChild(panel);
      rows.appendChild(row);
    });
    box.appendChild(rows);
    boardBox.appendChild(box);
  }

  const problemChk = h('input', { type: 'checkbox' });
  problemChk.checked = !!_boardFilter.onlyProblem;
  problemChk.addEventListener('change', () => { _boardFilter.onlyProblem = problemChk.checked; paint(); });

  /* 桌面筛选条：状态=底板页签，部门/类型=矩形标签+更多折叠（与任务管理同一套） */
  function paintFilter() {
    if (M2()) { paintFilterMobile(); return; }
    clear(filterBox);
    filterBox.className = 'flt-bar';

    const segTabs = h('div', { class: 'tabs chip-tabs seg-track' });
    const curSt = _boardFilter.status.size === 1 ? Array.from(_boardFilter.status)[0] : '';
    [['', '全部'], ['active', '进行中'], ['stopped', '已停止']].forEach(([v2, t2]) => {
      segTabs.appendChild(h('div', {
        class: 'tab' + (curSt === v2 ? ' active' : ''),
        onclick: () => { _boardFilter.status.clear(); if (v2) _boardFilter.status.add(v2); paintFilter(); paint(); }
      }, h('span', { text: t2 })));
    });
    filterBox.appendChild(h('div', { class: 'flt-group flt-seg' }, [
      h('span', { class: 'flt-gl', text: '状态' }), segTabs
    ]));

    const deptCnt = {};
    state.tasks.forEach(t => { if (t.dept) deptCnt[t.dept] = (deptCnt[t.dept] || 0) + 1; });
    filterBox.appendChild(h('div', { class: 'flt-group' }, [
      h('span', { class: 'flt-gl', text: '部门' }),
      chipFilterWithMore({
        label: '部门', max: 4,
        options: () => state.departments.map(d => ({ v: d, t: d, n: deptCnt[d] || 0 })),
        selected: _boardFilter.dept,
        onChange: () => paint()
      }).el
    ]));

    const cycCnt = {};
    state.tasks.forEach(t => { if (t.cycle) cycCnt[t.cycle] = (cycCnt[t.cycle] || 0) + 1; });
    filterBox.appendChild(h('div', { class: 'flt-group' }, [
      h('span', { class: 'flt-gl', text: '类型' }),
      chipFilterWithMore({
        label: '类型', max: 4,
        options: () => ['daily', 'weekly', 'monthly', 'once'].map(k => [k, CYCLE_LABEL[k]])
          .map(([k, l]) => ({ v: k, t: l, n: cycCnt[k] || 0 })),
        selected: _boardFilter.cycle,
        onChange: () => paint()
      }).el
    ]));

    filterBox.appendChild(h('button', {
      class: 'cf-chip' + (_boardFilter.onlyProblem ? ' on' : ''),
      type: 'button',
      onclick: () => {
        _boardFilter.onlyProblem = !_boardFilter.onlyProblem;
        problemChk.checked = _boardFilter.onlyProblem;
        paintFilter(); paint();
      }
    }, [
      h('span', { text: '只看有逾期' }),
      _boardFilter.onlyProblem ? h('span', { class: 'cf-x', html: iconSvg('check', 10) }) : null
    ]));
  }

  /* 手机端筛选：三个按钮，点了弹出选择面板，选完就收起 */
  function paintFilterMobile() {
    clear(filterBox);
    const pills = [
      ['部门', _boardFilter.dept, state.departments.map(d => ({ v: d, t: d }))],
      ['类型', _boardFilter.cycle, [
        { v: 'daily', t: '每日必做' }, { v: 'weekly', t: '每周必做' },
        { v: 'monthly', t: '每月必做' }, { v: 'once', t: '专项任务' }
      ]],
      ['状态', _boardFilter.status, [{ v: 'active', t: '进行中' }, { v: 'stopped', t: '已停止' }]]
    ];
    const row = h('div', { class: 'm2-fpills' });
    pills.forEach(([label, set, opts]) => row.appendChild(h('button', {
      class: 'm2-fpill' + (set.size ? ' on' : ''),
      onclick: () => openM2FilterSheet(label, opts, set)
    }, [label, set.size ? h('span', { class: 'n' }, String(set.size)) : null, h('span', { class: 'car' }, '▾')])));
    row.appendChild(h('button', {
      class: 'm2-fpill' + (_boardFilter.onlyProblem ? ' on' : ''),
      onclick: () => { _boardFilter.onlyProblem = !_boardFilter.onlyProblem; problemChk.checked = _boardFilter.onlyProblem; paintFilterMobile(); paint(); }
    }, ['只看逾期']));
    filterBox.appendChild(row);
  }

  /* 弹出式多选面板 */
  function openM2FilterSheet(label, opts, set) {
    const body = h('div', { class: 'm2-sheet' });
    const paintSheet = () => {
      clear(body);
      opts.forEach(o => {
        const on = set.has(o.v);
        body.appendChild(h('button', {
          class: 'm2-opt' + (on ? ' on' : ''),
          onclick: () => {
            on ? set.delete(o.v) : set.add(o.v);
            paintSheet(); paintFilterMobile(); paint();
          }
        }, [h('span', { class: 't', text: o.t }), h('span', { class: 'ck', text: on ? '✓' : '' })]));
      });
    };
    paintSheet();
    openModal({
      title: label,
      sub: '可多选，点一下即生效',
      body: body,
      footer: [
        h('button', { class: 'btn', onclick: () => { set.clear(); paintSheet(); paintFilterMobile(); paint(); } }, '清空'),
        h('button', { class: 'btn btn-primary', onclick: () => closeTopModal() }, '完成')
      ]
    });
  }
  paintFilter();
  setPageActions([
    M2() ? null : h('button', { class: 'btn btn-sm', onclick: exportBoard }, '导出督办表 CSV')
  ]);

  paint();
  wrap.appendChild(filterBox); wrap.appendChild(boardBox);
  return wrap;
}


/* 手机端督办：某任务的全部门店状态 */
function openBoardTaskDetail(t) {
  const p = taskProgress(t);
  const stores = allStores();
  const body = h('div', { class: 'store-list' }, stores.map(s => {
    const cell = p.cells.find(c => c.storeId === s.id);
    const st = cell ? cell.status : 'na';
    const M = STATUS_META[st] || STATUS_META.na;
    return h('div', {
      class: 'si',
      onclick: () => { if (cell) { closeTopModal(); openCellDetail(t, s.id, cell); } }
    }, [
      h('div', { class: 'nm', text: s.name }),
      h('span', { class: 'si-pill ' + (st === 'na' ? 'na' : st), text: M.label }),
      cell ? h('span', { class: 'si-go', text: '›' }) : null
    ]);
  }));
  openModal({
    title: t.title,
    sub: cycleDesc(t) + ' · ' + t.dept + ' · 本期 ' + (p.done || 0) + '/' + (p.expected || 0) + ' 家完成',
    body: body,
    footer: [h('button', { class: 'btn', onclick: () => closeTopModal() }, '关闭')]
  });
}

function openTaskBoardFor(t) {
  _boardFilter.dept = new Set([t.dept]);
  _boardFilter.cycle = new Set([t.cycle]);
  _boardFilter.status = new Set();
  _boardFilter.onlyProblem = false;
  go('hq-board');
}

function openCellDetail(t, storeId, cell) {
  const s = getStore(storeId);
  const M = STATUS_META[cell ? cell.status : 'na'];
  const rec = cell ? cell.rec : null;
  const due = cell ? cell.due : occDue(t, new Date());
  const body = h('div', {}, [
    h('dl', { class: 'dl' }, [
      h('dt', {}, '门店'), h('dd', {}, s.name + '（店长 ' + s.mgr + '）'),
      h('dt', {}, '任务'), h('dd', {}, t.title),
      h('dt', {}, '任务类型'), h('dd', {}, tagNode(CYCLE_LABEL[t.cycle], CYCLE_TAG[t.cycle])),
      h('dt', {}, '本期截止'), h('dd', {}, ymdhm(due)),
      h('dt', {}, '当前状态'), h('dd', {}, tagNode(M.label, M.tag)),
      h('dt', {}, '发布部门'), h('dd', {}, t.dept + ' · ' + t.creatorName)
    ]),
    rec ? h('div', { class: 'mt14' }, [
      h('div', { class: 'fhint', style: { margin: '0 0 6px' }, text: '门店提交内容（' + (rec.by || '') + ' · ' + ymdhm(rec.doneAt) + (rec.late ? ' · 逾期提交' : '') + '）' }),
      h('div', { class: 'done-box' }, [h('div', { class: 'db-c', text: rec.text || '（未填写说明）' }), thumbsNode(rec.images), linksNode(rec.links)])
    ]) : h('div', { class: 'mt14' }, [
      h('div', { class: 'empty', style: { padding: '26px' } }, [
        h('span', { class: 'eico' }, cell && cell.status === 'overdue' ? '⏰' : '🕓'),
        h('div', { text: cell && cell.status === 'overdue' ? '门店已超过截止时间，尚未提交任何内容' : '门店尚未提交，任务仍在进行中' })
      ])
    ])
  ]);
  openModal({ title: '门店执行明细', sub: s.name + ' · ' + t.title, body: body, footer: [h('button', { class: 'btn', onclick: () => closeTopModal() }, '关闭')] });
}

function exportBoard() {
  const rows = [['任务', '类型', '截止规则', '发布部门', '发布人', '门店', '本期截止', '状态', '提交时间', '提交人', '完成说明']];
  tasksFilteredForExport().forEach(t => {
    const p = taskProgress(t);
    p.cells.forEach(c => {
      const s = getStore(c.storeId);
      const M = STATUS_META[c.status] || STATUS_META.na;
      rows.push([t.title, CYCLE_LABEL[t.cycle], cycleDesc(t), t.dept, t.creatorName, s ? s.name : '',
        c.due ? ymdhm(c.due) : '', M.label, c.rec ? ymdhm(c.rec.doneAt) : '', c.rec ? c.rec.by : '', c.rec ? c.rec.text : '']);
    });
  });
  downloadText('任务督办明细_' + ymd(new Date()) + '.csv', toCsv(rows));
  toast('已导出 CSV', 'ok');
}
function tasksFilteredForExport() {
  return state.tasks.filter(t => {
    if (_boardFilter.dept.size && !_boardFilter.dept.has(t.dept)) return false;
    if (_boardFilter.cycle.size && !_boardFilter.cycle.has(t.cycle)) return false;
    if (_boardFilter.status.size && !_boardFilter.status.has(t.status)) return false;
    if (_boardFilter.onlyProblem && !taskProgress(t).overdue) return false;
    return true;
  });
}

/* =========================================================
   数据统计
   ========================================================= */
function pageHqStats() {
  const wrap = h('div');
  /* 统计区间：默认「本月」（1 号 ~ 今天） */
  const _now0 = new Date();
  let range = {
    from: new Date(_now0.getFullYear(), _now0.getMonth(), 1),
    to: new Date(_now0.getFullYear(), _now0.getMonth(), _now0.getDate())
  };
  const rangeDays = () => Math.round((range.to - range.from) / 86400000) + 1;
  const rangeEnd = () => new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate(), 23, 59, 59);
  const rangeText = () => range.from.getFullYear() + '-' + String(range.from.getMonth() + 1).padStart(2, '0') + '-' + String(range.from.getDate()).padStart(2, '0')
    + ' ~ ' + range.to.getFullYear() + '-' + String(range.to.getMonth() + 1).padStart(2, '0') + '-' + String(range.to.getDate()).padStart(2, '0');
  const rangeLabel = () => rangeText() + ' · ' + rangeDays() + ' 天';
  let tab = 'store';
  const tabsBar = h('div', { class: 'tabs chip-tabs m2-keep' });
  const body = h('div');

  function paint() {
    clear(tabsBar);
    [['store', '门店任务考核'], ['demand', '需求处理考核'], ['publish', '部门任务发布']].forEach(([k, l]) => {
      tabsBar.appendChild(h('div', { class: 'tab' + (tab === k ? ' active' : ''), onclick: () => { tab = k; paint(); } }, l));
    });
    clear(body);
    if (tab === 'store') paintStore();
    else if (tab === 'demand') paintDemand();
    else paintPublish();
  }

  function paintStore() {
    const ov = companyOverview(rangeDays(), rangeEnd());
    /* 只列本期有任务实例的门店：应完成 = 0 的直接不出现 */
    const rank = ov.rows.filter(r => r.expected > 0).sort((a, b) => b.rate - a.rate);
    const acfg = getAssessCfg();
    const scores = {};
    rank.forEach(r => { scores[r.storeId] = storeAssessScore(r, acfg); });
    /* 主指标独占一块，其余四个收成紧凑小格（不再五张等权卡） */
    body.appendChild(h('div', { class: 'stats-split' }, [
      statLead(ov.total.rate.toFixed(1) + '%', '全区完成率',
        ov.total.done + '/' + ov.total.expected + ' 完成 · ' + ov.total.ontime + ' 按时'),
      h('div', { class: 'stats-mini' }, [
        statNode(String(ov.total.expected), '应完成任务实例'),
        statNode(String(ov.total.done), '已完成'),
        statNode(String(ov.total.missed), '逾期未提交'),
        statNode(ov.total.ontimeRate.toFixed(1) + '%', '按时完成率')
      ])
    ]));
    /* 考核规则：拆成可扫的标签，不再是一句 60 字长文 */
    body.appendChild(h('div', { class: 'st-rule' }, [
      h('span', { class: 'st-rule-k', text: '考核口径' }),
      h('span', { class: 'st-rule-i', text: acfg.mode === 'step' ? '阶梯得分' : '比例折算' }),
      h('span', { class: 'st-rule-i', text: '基础分 ' + acfg.base }),
      h('span', { class: 'st-rule-i', text: '完成率 ' + acfg.completionWeight + ' / 按时率 ' + acfg.ontimeWeight }),
      h('span', { class: 'st-rule-i', text: '逾期提交 -' + acfg.lateSubmitDeduct }),
      h('span', { class: 'st-rule-i', text: '逾期未交 -' + acfg.overdueMissDeduct }),
      h('span', { class: 'st-rule-i', text: '合格线 ' + acfg.passLine })
    ]));
    body.appendChild(h('div', { class: 'card mt14' }, [
      h('div', { class: 'card-head' }, [h('div', {}, [h('h3', {}, '各门店完成率排名'), h('div', { class: 'cd', text: rangeText() + ' · ' + rangeDays() + ' 天 · 用于门店考核' })])]),
      h('div', { class: 'card-body' }, !rank.length ? h('div', { class: 'st-empty' }, [
        h('span', { class: 'st-empty-ic', html: iconSvg('chart', 16) }),
        h('span', { class: 'st-empty-t', text: '本期还没有门店完成记录' }),
        h('span', { class: 'st-empty-s', text: '有提交后这里会按完成率排序' })
      ]) : barChart(rank.map(r => ({
        name: r.store.name,
        value: r.rate,
        text: r.rate.toFixed(1) + '%　(' + r.done + '/' + r.expected + ')',
        /* 三档：达标绿 / 正常蓝 / 偏低琥珀 */
        color: r.rate >= 90 ? 'var(--ok)' : r.rate >= 60 ? 'var(--brand)' : 'var(--warn)'
      })), { max: 100 }))
    ]));
    const grid = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }, class: 'mt14' });
    grid.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'card-head' }, [h('div', {}, [
        h('h3', {}, '全区任务结果构成'),
        h('div', { class: 'cd', text: '应完成 ' + ov.total.expected + ' 个任务实例 · 悬停查看占比' })
      ])]),
      h('div', { class: 'card-body' }, donutHover([
        { k: '按时完成', v: ov.total.ontime, c: 'ok' },
        { k: '逾期完成', v: ov.total.late, c: 'warn' },
        { k: '逾期未提交', v: ov.total.missed, c: 'bad' }
      ], { centerLabel: '实例数' }))
    ]));
    /* 各周期（按全公司聚合） */
    const cycleAgg = { daily: { e: 0, d: 0, o: 0 }, weekly: { e: 0, d: 0, o: 0 }, monthly: { e: 0, d: 0, o: 0 }, once: { e: 0, d: 0, o: 0 } };
    ov.rows.forEach(r => {
      ['daily', 'weekly', 'monthly', 'once'].forEach(k => {
        cycleAgg[k].e += r.byCycle[k].expected; cycleAgg[k].d += r.byCycle[k].done; cycleAgg[k].o += r.byCycle[k].ontime;
      });
    });
    grid.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'card-head' }, [h('div', {}, [h('h3', {}, '各周期完成率'), h('div', { class: 'cd', text: '每日 / 每周 / 每月必做 / 专项任务' })])]),
      h('div', { class: 'card-body' }, ['daily', 'weekly', 'monthly', 'once'].map(k => {
        const a = cycleAgg[k], r2 = pct(a.d, a.e);
        return h('div', { class: 'st-cyc' }, [
          h('span', { class: 'st-cyc-k', text: CYCLE_LABEL[k] }),
          h('span', { class: 'st-cyc-bar' }, h('span', {
            class: 'st-cyc-fill' + (r2 ? '' : ' zero'), style: { width: r2 + '%' }
          })),
          h('span', { class: 'st-cyc-v', text: a.d + '/' + a.e }),
          h('span', { class: 'st-cyc-p', text: r2.toFixed(1) + '%' })
        ]);
      }))
    ]));
    body.appendChild(grid);

    const tbl = h('table', { class: 'tbl' }, [
      h('thead', {}, h('tr', {}, [
        h('th', { class: 'st-th-rank' }, '排名'), h('th', {}, '门店'), h('th', { class: 'num' }, '应完成'),
        h('th', { class: 'num' }, '已完成'), h('th', { class: 'num' }, '完成率'), h('th', { class: 'num' }, '按时'),
        h('th', { class: 'num' }, '逾期完成'), h('th', { class: 'num' }, '逾期未交'),
        h('th', { class: 'num' }, '考核得分'), h('th', {}, '考核建议')
      ])),
      h('tbody', {}, rank.map((r, i) => {
        const sc = scores[r.storeId];
        return h('tr', {}, [
          h('td', { class: 'st-rank' }, String(i + 1)),
          h('td', {}, [
            h('div', { class: 'st-store', text: r.store.name }),
            h('div', { class: 'st-city', text: r.city || '' })
          ]),
          h('td', { class: 'num' }, String(r.expected)),
          h('td', { class: 'num' }, String(r.done)),
          h('td', { class: 'num' }, r.rate.toFixed(1) + '%'),
          h('td', { class: 'num' }, String(r.ontime)),
          h('td', { class: 'num' }, String(r.late)),
          h('td', { class: 'num' + (r.missed ? ' bad' : '') }, String(r.missed)),
          h('td', { class: 'num' }, h('a', {
            href: 'javascript:void(0)', style: { fontWeight: '600', color: sc.pass ? 'var(--ok-tx)' : 'var(--danger-tx)' },
            onclick: () => openScoreDetail(r.store.name, sc, acfg)
          }, sc.total.toFixed(1))),
          h('td', {}, h('span', { class: 'st-grade ' + (sc.pass ? 'pass' : 'fail'), text: sc.pass ? '合格' : '不合格' }))
        ]);
      }))
    ]);
    body.appendChild(h('div', { class: 'sub-group' }, [h('h4', {}, '门店考核明细'), h('div', { class: 'tbl-wrap' }, tbl)]));
  }

  /** 考核得分明细弹窗 */
  function openScoreDetail(name, sc, cfg) {
    openModal({
      title: '考核得分明细', sub: name + ' · ' + (cfg.mode === 'step' ? '阶梯得分模式' : '比例折算模式'),
      body: h('div', {}, [
        h('table', { class: 'tbl' }, [
          h('tbody', {}, [
            h('tr', {}, [h('td', {}, '基础分'), h('td', { class: 'num' }, '+' + sc.basePart.toFixed(1))]),
            h('tr', {}, [h('td', {}, '完成率得分'), h('td', { class: 'num' }, '+' + sc.cScore.toFixed(1))]),
            h('tr', {}, [h('td', {}, '按时率得分'), h('td', { class: 'num' }, '+' + sc.oScore.toFixed(1))]),
            h('tr', {}, [h('td', {}, '逾期提交（补交）' + sc.lateN + ' 次 × ' + cfg.lateSubmitDeduct), h('td', { class: 'num' }, '-' + (sc.lateN * cfg.lateSubmitDeduct).toFixed(1))]),
            h('tr', {}, [h('td', {}, '逾期未交 ' + sc.missN + ' 次 × ' + cfg.overdueMissDeduct), h('td', { class: 'num' }, '-' + (sc.missN * cfg.overdueMissDeduct).toFixed(1))]),
            h('tr', {}, [h('td', { style: { fontWeight: '700' } }, '合计'), h('td', { class: 'num', style: { fontWeight: '700' } }, sc.total.toFixed(1) + ' 分')])
          ])
        ]),
        h('div', { class: 'fhint mt10', text: '合格线 ' + cfg.passLine + ' 分；规则可在「⚙ 考核设置」中调整。' })
      ]),
      footer: [h('button', { class: 'btn', onclick: () => closeTopModal() }, '关闭')]
    });
  }

  function paintDemand() {
    const ds = demandStats(rangeDays(), rangeEnd(), range.to);
    body.appendChild(statRow(6, [
      statNode(String(ds.total), '本期门店提交需求'),
      statNode(ds.passRate.toFixed(1) + '%', '评估通过率', ds.passRate >= 70 ? 'ok' : 'warn'),
      statNode(String(ds.assigned + ds.approved), '待处理（含待派发）', 'warn'),
      statNode(String(ds.completed + ds.confirmed), '已处理完成', 'ok'),
      statNode(ds.avgHandleMs ? dur(ds.avgHandleMs) : '—', '平均处理时长', 'info'),
      statNode(String(ds.overdueHandled), '超期处理/待办', ds.overdueHandled ? 'danger' : 'ok')
    ]));
    const grid = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }, class: 'mt14' });
    grid.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'card-head' }, [h('div', {}, [h('h3', {}, '需求状态分布')])]),
      h('div', { class: 'card-body' }, donutChart([
        { label: '待评估', value: ds.pending, color: 'var(--info)' },
        { label: '待派发', value: ds.approved, color: 'var(--warn)' },
        { label: '处理中', value: ds.assigned, color: 'var(--brand)' },
        { label: '已完成/已确认', value: ds.completed + ds.confirmed, color: 'var(--ok)' },
        { label: '已驳回', value: ds.rejected, color: 'var(--danger)' }
      ], { centerLabel: '需求总数' }))
    ]));
    grid.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'card-head' }, [h('div', {}, [h('h3', {}, '各部门需求处理量')])]),
      h('div', { class: 'card-body' }, ds.byDept.length ? barChart(ds.byDept.slice().sort((a, b) => b.assigned - a.assigned).map(x => ({
        name: x.dept, value: x.assigned,
        text: x.assigned + ' 件（完成 ' + x.done + '）',
        color: DEPT_COLOR[x.dept] || 'var(--brand)'
      }))) : emptyNode('本期没有派发记录', null, 'chart'))
    ]));
    body.appendChild(grid);

    const personRows = ds.byPerson.length ? ds.byPerson.map(x => {
      const rate = pct(x.onTime, x.assigned);
      const ps = personAssessScore(x, getAssessCfg(), ds.window);
      return h('tr', {}, [
        h('td', {}, x.name),
        h('td', {}, tagNode(x.dept, 'tag-line')),
        h('td', { class: 'num' }, String(x.assigned)),
        h('td', { class: 'num' }, String(x.done)),
        h('td', { class: 'num' }, String(x.onTime)),
        h('td', { class: 'num' }, String(x.overdue)),
        h('td', { class: 'num' }, x.msN ? dur(x.msSum / x.msN) : '—'),
        h('td', { class: 'num' }, h('span', {
          style: { fontWeight: '700', color: ps.pass ? 'var(--ok-tx)' : 'var(--danger-tx)' },
          title: '超期 ' + x.overdue + ' 次 × ' + getAssessCfg().demandOverdueDeduct + ' + 退回重做 ' + ps.reopenN + ' 次 × ' + getAssessCfg().demandFailDeduct
        }, ps.total.toFixed(1))),
        h('td', {}, tagNode(rate >= 90 && x.assigned >= 2 ? '优秀' : x.overdue ? '需改进' : '正常', rate >= 90 && x.assigned >= 2 ? 'tag-green' : x.overdue ? 'tag-red' : 'tag-gray'))
      ]);
    }) : [h('tr', {}, h('td', { colspan: '9', style: { textAlign: 'center', color: 'var(--text-3)', padding: '22px' } }, '本期暂无'))];

    const pt = h('table', { class: 'tbl' }, [
      h('thead', {}, h('tr', {}, [
        h('th', {}, '责任人'), h('th', {}, '部门'), h('th', { class: 'num' }, '被派发'), h('th', { class: 'num' }, '已完成'),
        h('th', { class: 'num' }, '按期完成'), h('th', { class: 'num' }, '超期/逾期'), h('th', { class: 'num' }, '平均处理时长'),
        h('th', { class: 'num' }, '考核得分'), h('th', {}, '考核提示')
      ])),
      h('tbody', {}, personRows)
    ]);
    body.appendChild(h('div', { class: 'sub-group' }, [
      h('h4', {}, '管理公司需求处理考核明细'),
      h('div', { class: 'tbl-wrap' }, pt),
      h('div', { class: 'fhint mt10', text: '平均处理时长 = 责任人接到派发 → 提交处理结果 的平均耗时；「按期完成」以派发时设定的期望完成时间为准；考核得分 = 100 − 超期次数 × ' + getAssessCfg().demandOverdueDeduct + ' − 被退回重做次数 × ' + getAssessCfg().demandFailDeduct + '（规则在「⚙ 考核设置」中配置）。' })
    ]));
  }

  function paintPublish() {
    const tp = taskPublishStats(rangeDays(), rangeEnd(), range.to);
    const list = tp.byDept.slice().sort((a, b) => b.tasks - a.tasks);
    const totalTasks = list.reduce((a, b) => a + b.tasks, 0);
    const totalCovers = list.reduce((a, b) => a + b.covers, 0);
    body.appendChild(statRow(4, [
      statNode(String(totalTasks), '本期新发布任务数'),
      statNode(String(totalCovers), '覆盖门店任务次数'),
      statNode(String(list.reduce((a, b) => a + b.overdue, 0)), '当前逾期门店数', 'danger'),
      statNode(String(list.reduce((a, b) => a + b.open, 0)), '当前未完成门店数', 'warn')
    ]));
    body.appendChild(h('div', { class: 'card mt14' }, [
      h('div', { class: 'card-head' }, [h('div', {}, [h('h3', {}, '各部门任务发布量')])]),
      h('div', { class: 'card-body' }, list.length ? barChart(list.map(x => ({
        name: x.dept, value: x.tasks, text: x.tasks + ' 个任务 / 覆盖 ' + x.covers + ' 店次', color: DEPT_COLOR[x.dept] || 'var(--brand)'
      }))) : emptyNode('本期没有新发布任务', '📝'))
    ]));
    const tbl = h('table', { class: 'tbl' }, [
      h('thead', {}, h('tr', {}, [
        h('th', {}, '发布部门'), h('th', { class: 'num' }, '任务数'), h('th', { class: 'num' }, '覆盖门店次数'),
        h('th', { class: 'num' }, '本期应完成'), h('th', { class: 'num' }, '已完成'), h('th', { class: 'num' }, '完成率'),
        h('th', { class: 'num' }, '逾期门店数'), h('th', { class: 'num' }, '临期门店数')
      ])),
      h('tbody', {}, list.map(x => h('tr', {}, [
        h('td', {}, tagNode(x.dept, 'tag-line')),
        h('td', { class: 'num' }, String(x.tasks)),
        h('td', { class: 'num' }, String(x.covers)),
        h('td', { class: 'num' }, String(x.expected)),
        h('td', { class: 'num' }, String(x.done)),
        h('td', { class: 'num' }, pct(x.done, x.expected).toFixed(1) + '%'),
        h('td', { class: 'num' }, String(x.overdue)),
        h('td', { class: 'num' }, String(x.dueSoon))
      ])))
    ]);
    body.appendChild(h('div', { class: 'sub-group' }, [h('h4', {}, '部门发布明细'), h('div', { class: 'tbl-wrap' }, tbl)]));
  }


  const rangeBtn = h('button', {
    class: 'btn btn-sm dr-trigger', type: 'button', title: '选择统计区间',
    onclick: () => openDateRange({
      from: range.from, to: range.to,
      onPick: r => { range = r; rangeBtn.lastChild.textContent = rangeLabel(); paint(); }
    })
  }, [
    h('span', { html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 11h18"/></svg>' }),
    h('span', { text: rangeLabel() })
  ]);
  const toolBar = h('div', { class: 'row', style: { marginBottom: '12px', flexWrap: 'wrap', gap: '10px', alignItems: 'center' } }, [
    rangeBtn,
    h('span', { style: { flex: '1' } }),
    h('button', { class: 'btn btn-sm btn-primary', onclick: () => openAssessSettingsModal(paint) }, '⚙ 考核设置'),
    h('button', { class: 'btn btn-sm', onclick: () => { exportDemands(range); } }, '导出需求台账')
  ]);
  paint();
  wrap.appendChild(toolBar); wrap.appendChild(tabsBar); wrap.appendChild(body);
  return wrap;
}

/* =========================================================
   考核设置
   ========================================================= */
function openAssessSettingsModal(onDone) {
  const c = getAssessCfg();
  let mode = c.mode;
  const num = (v, min, max, step) => inputNode({ type: 'number', value: v, min: min, max: max, step: step || 1, style: { width: '110px' } });
  const ref = {
    base: num(c.base, 0, 1000), completionWeight: num(c.completionWeight, 0, 1000), ontimeWeight: num(c.ontimeWeight, 0, 1000),
    lateSubmitDeduct: num(c.lateSubmitDeduct, 0, 100, 0.5), overdueMissDeduct: num(c.overdueMissDeduct, 0, 100, 0.5),
    demandOverdueDeduct: num(c.demandOverdueDeduct, 0, 100, 0.5), demandFailDeduct: num(c.demandFailDeduct, 0, 100, 0.5),
    passLine: num(c.passLine, 0, 1000, 5)
  };
  const modeRow = h('div', { class: 'radio-cards' });
  const MODES = [
    ['ratio', '比例折算', '得分 = 占分 × 实际比率（如完成率 90% 得 50×90% = 45 分）'],
    ['step', '阶梯得分', '≥95% 得满占分，90~95% 得 90%，80~90% 得 75%，70~80% 得 60%，<70% 得 40%']
  ];
  function paintMode() {
    clear(modeRow);
    MODES.forEach(([v, t, sub]) => modeRow.appendChild(h('div', {
      class: 'radio-card' + (mode === v ? ' on' : ''), onclick: () => { mode = v; paintMode(); paintFormula(); }
    }, [h('div', { class: 'rc-t', text: t }), h('div', { class: 'rc-d', text: sub })])));
  }
  const formula = h('div', { class: 'done-box', style: { background: 'var(--panel-2)', color: 'var(--text-2)', marginBottom: '14px' } });
  function paintFormula() {
    clear(formula);
    const rest = Math.max(0, Number(ref.base.value || 0) - Number(ref.completionWeight.value || 0) - Number(ref.ontimeWeight.value || 0));
    formula.appendChild(h('div', { class: 'db-c' }, '门店考核得分 = 基础分 ' + (Number(ref.base.value) || 0) + '（其中完成率占 ' + ref.completionWeight.value
      + '、按时率占 ' + ref.ontimeWeight.value + '、剩余基础分 ' + rest + '）+ 完成率得分 + 按时率得分 − 逾期提交次数 × '
      + ref.lateSubmitDeduct.value + ' − 逾期未交次数 × ' + ref.overdueMissDeduct.value + '；低于合格线 ' + ref.passLine.value + ' 分判定为不合格。'));
    formula.appendChild(h('div', { class: 'db-c', style: { marginTop: '4px' } }, '需求责任人考核得分 = 100 − 超期处理次数 × ' + ref.demandOverdueDeduct.value + ' − 被门店退回重做次数 × ' + ref.demandFailDeduct.value + '。'));
  }
  const inst = openModal({
    title: '⚙ 考核设置', sub: '配置门店任务考核与需求处理考核的计分规则，保存后立即生效并应用于统计页',
    wide: true,
    body: h('div', {}, [
      fgroup('得分模式', modeRow, null, true),
      formula,
      h('div', { class: 'sub-group', style: { margin: '0 0 14px' } }, [
        h('h4', {}, '门店任务考核'),
        h('div', { class: 'fgrid c2' }, [
          fgroup('基础总分', ref.base, null, true),
          fgroup('合格线（分）', ref.passLine, null, true),
          fgroup('完成率占分', ref.completionWeight, '从基础总分中划出', true),
          fgroup('按时率占分', ref.ontimeWeight, '剩余部分为基础分', true),
          fgroup('逾期提交（补交）每次扣', ref.lateSubmitDeduct, null, true),
          fgroup('逾期未交每次扣', ref.overdueMissDeduct, null, true)
        ])
      ]),
      h('div', { class: 'sub-group', style: { margin: '0' } }, [
        h('h4', {}, '需求处理考核（管理公司责任人）'),
        h('div', { class: 'fgrid c2' }, [
          fgroup('处理超期每次扣', ref.demandOverdueDeduct, '超过派发时设定的期望完成时间', true),
          fgroup('被门店退回重做每次扣', ref.demandFailDeduct, null, true)
        ])
      ])
    ]),
    footer: [
      h('button', { class: 'btn', onclick: () => inst.close() }, '取消'),
      h('button', {
        class: 'btn btn-primary', onclick: () => {
          const base = Number(ref.base.value) || 0;
          const cw = Number(ref.completionWeight.value) || 0;
          const ow = Number(ref.ontimeWeight.value) || 0;
          if (cw + ow > base) { toast('完成率占分 + 按时率占分 不能超过基础总分', 'err'); return; }
          saveAssessCfg({
            mode: mode, base: base, completionWeight: cw, ontimeWeight: ow,
            lateSubmitDeduct: Number(ref.lateSubmitDeduct.value) || 0,
            overdueMissDeduct: Number(ref.overdueMissDeduct.value) || 0,
            demandOverdueDeduct: Number(ref.demandOverdueDeduct.value) || 0,
            demandFailDeduct: Number(ref.demandFailDeduct.value) || 0,
            passLine: Number(ref.passLine.value) || 0
          });
          inst.close(); toast('考核规则已保存', 'ok'); onDone && onDone();
        }
      }, '保存规则')
    ]
  });
  paintMode(); paintFormula();
}

/* =========================================================
   管理员后台（门店 / 分区 / 部门 / 账号 / 权限）
   ========================================================= */
function pageAdmin() {
  if (!isAdmin()) return emptyNode('仅管理员可访问此页面', '🔒');
  const wrap = h('div');
  let tab = 'store';
  const tabsBar = h('div', { class: 'tabs chip-tabs m2-keep' });
  const body = h('div');

  function paint() {
    clear(tabsBar);
    [['store', '门店与分区'], ['account', '部门与账号'], ['audit', '操作日志'], ['ding', '钉钉提醒']].forEach(([k, l]) => {
      tabsBar.appendChild(h('div', { class: 'tab' + (tab === k ? ' active' : ''), onclick: () => { tab = k; paint(); } }, l));
    });
    clear(body);
    if (tab === 'store') paintStoreTab();
    else if (tab === 'account') paintAccountTab();
    else if (tab === 'audit') paintAuditTab();
    else if (tab === 'ding') paintDingTab();
    else paintSnapTab();
  }


  /* 后端存的是 UTC ISO，这里转成本地时间显示（+8） */
  function fmtLocal(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(0, 19);
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
           p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  /* ---------- 提醒记录（只读，管理员 + 管委会） ---------- */
  /* host 为空时挂到当前 tab 的主体；钉钉提醒页会传自己的容器进来 */
  function paintNotifyLogTab(host) {
    const root = host || body;
    const ST_LABEL = { sent: '已发送', skipped: '被拦截', dry: '预演', pending: '待发', deferred: '免打扰' };
    const ST_COLOR = { sent: 'var(--ok)', skipped: 'var(--danger)', dry: 'var(--text-3)', pending: 'var(--warn)', deferred: 'var(--warn)' };
    const SCEN = { A1:'新任务',A2:'临期',A3:'逾期',A4:'催办',A5:'门店已提交',
                   B1:'待评估',B2:'待派发',B3:'已驳回',B4:'派单',B5:'待确认',B6:'已确认',B7:'退回',B8:'临近完成',
                   C1:'超期',C2:'评估堆积',C3:'确认堆积',TEST:'测试',VERIFY:'验证' };
    const state = { days: 7, status: 'all', scenario: '', person: '', q: '', more: false };

    const head = h('div', { class: 'row', style: { gap: '8px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' } });
    const info = h('span', { class: 'fhint', style: { margin: '0' }, text: '加载中' });
    const body2 = h('div', {});
    const moreBox = h('div', { class: 'row', style: { gap: '8px', marginBottom: '10px', flexWrap: 'wrap', display: 'none' } });

    function chip(label, active, onClick) {
      return h('div', { class: 'tab' + (active ? ' active' : ''), style: { cursor: 'pointer' }, onclick: onClick }, label);
    }

    const daysRow = h('div', { class: 'tabs', style: { flexWrap: 'wrap' } });
    const stRow = h('div', { class: 'tabs', style: { flexWrap: 'wrap' } });

    function repaintChips() {
      clear(daysRow); clear(stRow);
      [[1,'今天'],[7,'近 7 天'],[30,'近 30 天'],[0,'全部时间']].forEach(([d, l]) =>
        daysRow.appendChild(chip(l, state.days === d, () => { state.days = d; repaintChips(); load(); })));
      [['all','全部状态'],['sent','已发送'],['skipped','被拦截'],['dry','预演']].forEach(([v, l]) =>
        stRow.appendChild(chip(l, state.status === v, () => { state.status = v; repaintChips(); load(); })));
    }

    const scenSel = selectNode(Object.keys(SCEN).map(k => ({ v: k, t: SCEN[k] })), '', { placeholder: '全部场景', style: { width: '150px' } });
    scenSel.addEventListener('change', () => { state.scenario = scenSel.value; load(); });
    const personInp = inputNode({ placeholder: '收件人 ID（如 ST04 / HQ17）', style: { width: '210px' } });
    const qInp = inputNode({ placeholder: '关键词（标题/内容/任务ID）', style: { width: '230px' } });
    const searchBtn = h('button', { class: 'btn btn-sm', onclick: () => { state.person = personInp.value.trim(); state.q = qInp.value.trim(); load(); } }, '查询');
    moreBox.appendChild(scenSel); moreBox.appendChild(personInp); moreBox.appendChild(qInp); moreBox.appendChild(searchBtn);

    const moreBtn = h('button', { class: 'btn btn-sm btn-ghost', onclick: () => {
      state.more = !state.more; moreBox.style.display = state.more ? '' : 'none';
    } }, '更多筛选');
    const exportBtn = h('button', { class: 'btn btn-sm btn-ghost', onclick: () => {
      const p = new URLSearchParams({ days: String(state.days), status: state.status, scenario: state.scenario, person: state.person, q: state.q });
      window.open(((window.Api && window.Api.base) || '') + '/api/notify/export?' + p.toString(), '_blank');
    } }, '导出 CSV');

    /* 时间与状态是两组选择器，中间留空隙 + 竖分隔，避免看成一组 */
    head.appendChild(daysRow);
    head.appendChild(h('span', { class: 'nlog-sep' }));
    head.appendChild(stRow);
    head.appendChild(moreBtn); head.appendChild(exportBtn);
    head.appendChild(h('span', { style: { flex: '1' } })); head.appendChild(info);
    root.appendChild(head);
    root.appendChild(moreBox);
    root.appendChild(body2);
    repaintChips();

    function load() {
      info.textContent = '加载中';
      const p = new URLSearchParams({ limit: '200', status: state.status });
      if (state.days) p.set('days', String(state.days));
      if (state.scenario) p.set('scenario', state.scenario);
      if (state.person) p.set('person', state.person);
      if (state.q) p.set('q', state.q);
      fetch(((window.Api && window.Api.base) || '') + '/api/notify/log?' + p.toString(), { headers: DING_AUTH() })
        .then(r => r.json())
        .then(r => {
          clear(body2);
          if (!r.ok) { info.textContent = r.msg || '读取失败'; return; }
          info.textContent = '共 ' + r.total + ' 条' + (r.rows.length < r.total ? '（显示最近 ' + r.rows.length + ' 条）' : '');
          if (!r.rows.length) { body2.appendChild(h('div', { class: 'fhint', style: { padding: '30px 0', textAlign: 'center' }, text: '没有符合条件的记录' })); return; }
          /* 手机端：表格换成卡片，避免「标题」被挤成一行一个字 */
          const mobile = window.matchMedia('(max-width: 900px)').matches;
          if (mobile) {
            const list = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
            r.rows.forEach(row => {
              const who = getStore(row.person_id) || getHq(row.person_id);
              list.appendChild(h('div', {
                style: { border: '1px solid var(--line)', borderRadius: '10px', padding: '10px 12px', background: 'var(--panel)' }
              }, [
                h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' } }, [
                  h('span', { style: { fontSize: '11.5px', color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }, text: fmtLocal(row.sent_at || row.created_at) }),
                  tagNode(SCEN[row.scenario] || row.scenario, 'tag-gray'),
                  h('span', { style: { flex: '1' } }),
                  h('span', { style: { fontSize: '12px', fontWeight: '700', color: ST_COLOR[row.status] || 'var(--text-2)' }, text: ST_LABEL[row.status] || row.status }),
                ]),
                h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '3px' } }, [
                  h('b', { style: { fontSize: '13.5px' }, text: who ? who.name : row.person_id }),
                  h('span', { style: { fontSize: '11px', color: 'var(--text-3)' }, text: row.person_id }),
                ]),
                row.title ? h('div', { style: { fontSize: '13px', color: 'var(--text)', lineHeight: '1.5' }, text: row.title }) : null,
                row.reason ? h('div', { style: { fontSize: '11.5px', color: 'var(--danger)', marginTop: '3px' }, text: '原因：' + row.reason }) : null,
              ]));
            });
            body2.appendChild(list);
            return;
          }
          const wrap = h('div', { class: 'card', style: { padding: '0', overflow: 'hidden' } });
          const tb = h('tbody');
          r.rows.forEach(row => {
            const who = getStore(row.person_id) || getHq(row.person_id);
            tb.appendChild(h('tr', {}, [
              h('td', { style: { whiteSpace: 'nowrap', fontSize: '12px' }, text: fmtLocal(row.sent_at || row.created_at) }),
              h('td', { style: { whiteSpace: 'nowrap' } }, [
                h('div', { style: { fontSize: '12.5px', fontWeight:'700' }, text: who ? who.name : row.person_id }),
                h('div', { class: 'fhint', style: { margin: '0', fontSize: '11px' }, text: row.person_id }),
              ]),
              h('td', { style: { whiteSpace: 'nowrap' } }, [tagNode(SCEN[row.scenario] || row.scenario, 'tag-gray')]),
              h('td', { style: { fontSize: '12.5px' } }, [
                h('div', { text: row.title || '—' }),
                row.reason ? h('div', { class: 'fhint', style: { margin: '2px 0 0', fontSize: '11px' }, text: row.reason }) : null,
              ]),
              h('td', { style: { whiteSpace: 'nowrap' } }, [
                h('span', { style: { fontSize: '12px', fontWeight:'700', color: ST_COLOR[row.status] || 'var(--text-2)' }, text: ST_LABEL[row.status] || row.status })
              ]),
            ]));
          });
          wrap.appendChild(h('div', { class: 'tbl-wrap' }, [h('table', { class: 'tbl' }, [
            h('thead', {}, [h('tr', {}, ['时间', '收件人', '场景', '标题', '状态'].map(x => h('th', {}, x)))]),
            tb
          ])]));
          body2.appendChild(wrap);
        })
        .catch(e => { info.textContent = '网络错误：' + e.message; });
    }
    load();
  }

  /* ---------- 数据快照 ---------- */
  function paintSnapTab() {
    const head = h('div', { class: 'row', style: { gap: '8px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' } });
    const info = h('span', { class: 'fhint', style: { margin: '0' }, text: '加载中' });
    head.appendChild(h('button', {
      class: 'btn btn-sm', onclick: () => {
        fetch(((window.Api && window.Api.base) || '') + '/api/snapshots', { method: 'POST', headers: DING_AUTH(), body: JSON.stringify({ summary: '手动快照' }) })
          .then(r => r.json()).then(x => { toast(x.ok ? '已创建快照' : (x.msg || '失败'), x.ok ? null : 'err'); paint(); });
      }
    }, '立即创建快照'));
    head.appendChild(info);
    body.appendChild(head);
    const list = h('div', { class: 'task-list' });
    body.appendChild(list);
    /* 最近改动：可单条恢复 */
    const chBox = h('div', { class: 'card mt14', style: { padding: '10px 12px' } });
    const chList = h('div', {});
    chBox.appendChild(h('div', { style: { fontSize: '13px', fontWeight:'700', marginBottom: '6px' }, text: '最近改动（可单条恢复）' }));
    chBox.appendChild(chList);
    body.appendChild(chBox);
    fetch(((window.Api && window.Api.base) || '') + '/api/changes?limit=20', { headers: DING_AUTH() }).then(r => r.json()).then(r => {
      if (!r.ok) { chList.appendChild(h('div', { class: 'fhint', text: r.msg || '读取失败' })); return; }
      if (!r.rows.length) { chList.appendChild(h('div', { class: 'fhint', text: '暂无改动记录' })); return; }
      const NAME = { tasks: '任务', demands: '提需', contacts: '联系人' };
      const ACT = { create: '新增', update: '修改', delete: '删除' };
      r.rows.forEach(row => {
        chList.appendChild(h('div', {
          class: 'row', style: { gap: '8px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line-2)' }
        }, [
          h('span', { style: { fontSize: '12px' }, text: (NAME[row.entity] || row.entity) + ' · ' + (ACT[row.action] || row.action) }),
          h('span', { class: 'fhint', style: { margin: '0' }, text: row.entity_id + ' · ' + (row.at || '').slice(5, 16).replace('T', ' ') }),
          h('span', { style: { flex: '1' } }),
          h('button', {
            class: 'btn btn-xs', onclick: () => confirmDialog({
              title: '恢复这条改动？',
              message: '把 ' + (NAME[row.entity] || row.entity) + '「' + row.entity_id + '」恢复到这次' + (ACT[row.action] || '') + '之前的状态，其它数据不受影响。',
              okText: '恢复',
              onOk: () => fetch(((window.Api && window.Api.base) || '') + '/api/changes/' + row.id + '/restore', { method: 'POST', headers: DING_AUTH() })
                .then(x => x.json())
                .then(x => { toast(x.ok ? '已恢复单条' : (x.msg || '恢复失败'), x.ok ? null : 'err'); if (x.ok) setTimeout(() => location.reload(), 700); })
            })
          }, '恢复')
        ]));
      });
    }).catch(() => chList.appendChild(h('div', { class: 'fhint', text: '网络错误' })));

    fetch(((window.Api && window.Api.base) || '') + '/api/snapshots', { headers: DING_AUTH() }).then(r => r.json()).then(r => {
      if (!r.ok) { info.textContent = r.msg || '读取失败'; return; }
      info.textContent = '保留最近 ' + r.keep + ' 份 · 共 ' + r.rows.length + ' 份';
      r.rows.forEach(row => {
        list.appendChild(h('div', { class: 'card', style: { padding: '10px 12px', marginBottom: '8px' } }, [
          h('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, [
            h('b', { text: 'v' + row.version }),
            h('span', { class: 'fhint', style: { margin: '0' }, text: (row.created_at || '').slice(0, 19).replace('T', ' ') + ' · ' + (row.actor || '—') }),
            tagNode(Math.round(row.size / 1024) + ' KB', 'tag-line')
          ]),
          h('div', { class: 'fhint', style: { margin: '4px 0 6px' }, text: row.summary || '' }),
          h('button', {
            class: 'btn btn-xs', onclick: () => confirmDialog({
              title: '回滚到这个版本？', message: '将把全库恢复到 v' + row.version + '（' + (row.created_at || '').slice(0, 19).replace('T', ' ') + '）。当前数据会先存一份快照，可再次回滚。',
              danger: true, okText: '回滚',
              onOk: () => {
                fetch(((window.Api && window.Api.base) || '') + '/api/snapshots/' + row.id + '/restore', { method: 'POST', headers: DING_AUTH() })
                  .then(x => x.json())
                  .then(x => { toast(x.ok ? '已回滚到 v' + x.from : (x.msg || '回滚失败'), x.ok ? null : 'err'); if (x.ok) setTimeout(() => location.reload(), 800); });
              }
            })
          }, '回滚到此版本')
        ]));
      });
    }).catch(() => { info.textContent = '网络错误'; });
  }

  /* ---------- 钉钉提醒 ---------- */
  const DING_AUTH = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('cwsj_token_v1') });
  let dFilter = 'all', dq = '', dSub = 'bind';
  function paintDingTab() {
    /* 子切换：账号绑定 / 发送记录（原「提醒记录」独立页并入这里） */
    const subBar = h('div', { class: 'tabs chip-tabs m2-keep dg-sub' });
    const pane = h('div');
    [['bind', '账号绑定'], ['log', '发送记录']].forEach(([k, l]) => {
      subBar.appendChild(h('div', {
        class: 'tab' + (dSub === k ? ' active' : ''), onclick: () => { dSub = k; paint(); }
      }, l));
    });
    body.appendChild(subBar);
    body.appendChild(pane);
    if (dSub === 'log') { paintNotifyLogTab(pane); return; }

    let allRows = [];
    const countBar = h('div', { class: 'dg-counts' });
    const info = h('span', { class: 'dg-meta', text: '加载中' });
    const tblBox = h('div');
    const searchInput = inputNode({
      placeholder: '搜索姓名 / 账号 / 钉钉名',
      oninput: e => { dq = e.target.value.trim(); render(); }
    });
    const btnR = h('button', {
      class: 'btn btn-sm',
      onclick: async () => {
        btnR.disabled = true; btnR.textContent = '刷新中…';
        const r = await fetch(apiUrl('/api/ding/refresh'), { method: 'POST', headers: DING_AUTH() })
          .then(x => x.json()).catch(e => ({ ok: false, msg: e.message }));
        btnR.disabled = false; btnR.textContent = '刷新通讯录';
        if (r.ok) { toast('已刷新 ' + r.count + ' 人'); paint(); } else toast(r.msg || '刷新失败', 'err');
      }
    }, '刷新通讯录');

    function stateOf(row) { return row.dup ? 'dup' : (row.dingUserid ? 'bound' : 'unbound'); }
    function matched(row) {
      if (dFilter !== 'all' && stateOf(row) !== dFilter) return false;
      if (!dq) return true;
      return (row.name + row.userId + (row.dingName || '')).toLowerCase().indexOf(dq.toLowerCase()) >= 0;
    }

    function renderCounts() {
      clear(countBar);
      const n = k => allRows.filter(x => stateOf(x) === k).length;
      [['all', '全部', allRows.length], ['bound', '已绑定', n('bound')],
       ['unbound', '未绑定', n('unbound')], ['dup', '重复', n('dup')]].forEach(([k, label, num]) => {
        countBar.appendChild(h('button', {
          class: 'dg-chip' + (dFilter === k ? ' on' : '') + (k === 'dup' && num ? ' warn' : ''),
          type: 'button',
          onclick: () => { dFilter = k; render(); }
        }, [h('span', { class: 'dg-chip-l', text: label }), h('span', { class: 'dg-chip-n', text: String(num) })]));
      });
    }

    /* 部门分组（与通讯录同一套结构）：总部按部门，门店单独一组 */
    function deptOf(row) {
      if (row.type === 'store') return '门店';
      const h = (state.hq || []).find(x => x.id === row.userId);
      return (h && h.dept) || '总部';
    }
    function render() {
      renderCounts();
      clear(tblBox);
      const rows = allRows.filter(matched);
      if (!rows.length) {
        tblBox.appendChild(h('div', { class: 'dg-empty', text: allRows.length ? '没有匹配的账号' : '还没有账号' }));
        return;
      }
      const order = (state.departments || []).slice();
      if (order.indexOf('门店') < 0) order.push('门店');
      const groups = {};
      rows.forEach(x => { const d = deptOf(x); (groups[d] = groups[d] || []).push(x); });
      const keys = order.filter(d => groups[d]).concat(Object.keys(groups).filter(d => order.indexOf(d) < 0));

      keys.forEach(dep => {
        const list = groups[dep].slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'));
        const sec = h('section', { class: 'dg-sec' });
        const boundN = list.filter(x => stateOf(x) === 'bound').length;
        sec.appendChild(h('div', { class: 'dg-sec-head' }, [
          h('h3', { class: 'dg-sec-t', text: dep }),
          h('span', { class: 'dg-sec-n', text: list.length + ' 人' }),
          dep !== '门店' ? h('span', { class: 'dg-sec-s', text: '已绑定 ' + boundN + '/' + list.length }) : null
        ]));
        const grid = h('div', { class: 'dg-grid' });
        list.forEach(row => {
          const st = stateOf(row);
          const stText = st === 'dup' ? '重复' : (st === 'bound' ? '已绑定' : '未绑定');
          grid.appendChild(h('div', { class: 'dg-card' }, [
            h('div', { class: 'dg-card-top' }, [
              h('span', { class: 'dg-st ' + st }, [h('span', { class: 'dg-dot' })]),
              h('span', { class: 'dg-card-name', text: row.name }),
              h('span', { class: 'dg-card-id', text: row.userId }),
              h('span', { class: 'dg-card-st ' + st, text: stText })
            ]),
            h('div', { class: 'dg-card-sub', text: '钉钉：' + (row.dingName || '—') }),
            h('div', { class: 'dg-card-act' }, [
              h('button', { class: 'btn btn-xs', onclick: () => openDingBind(row) }, st === 'bound' ? '改绑' : '绑定'),
              st === 'bound' ? h('button', { class: 'btn btn-xs', onclick: () => testDing(row) }, '测试') : null
            ])
          ]));
        });
        sec.appendChild(grid);
        tblBox.appendChild(sec);
      });
    }

    pane.appendChild(h('div', { class: 'dg-bar' }, [
      countBar,
      h('div', { class: 'dg-search' }, [searchInput]),
      btnR
    ]));
    pane.appendChild(info);
    pane.appendChild(tblBox);

    fetch(apiUrl('/api/ding/list'), { headers: DING_AUTH() }).then(r => r.json()).then(r => {
      if (!r.ok) { info.textContent = r.msg || '读取失败'; return; }
      allRows = r.rows || [];
      info.textContent = '钉钉通讯录 ' + r.peopleCount + ' 人'
        + (r.snapshotAt ? ' · 快照 ' + r.snapshotAt.slice(0, 16).replace('T', ' ') : '');
      render();
    }).catch(() => { info.textContent = '网络错误'; });
  }

  function testDing(row) {
    toast('正在发送…');
    fetch(apiUrl('/api/ding/test'), { method: 'POST', headers: DING_AUTH(), body: JSON.stringify({ userId: row.userId }) })
      .then(r => r.json())
      .then(r => toast(r.ok ? '已发送给 ' + (row.dingName || row.name) : (r.msg || '发送失败'), r.ok ? null : 'err'))
      .catch(() => toast('网络错误', 'err'));
  }

  function openDingBind(row) {
    const input = h('input', { class: 'inp', placeholder: '搜索钉钉姓名或门店', style: { width: '100%' } });
    const box = h('div', { style: { maxHeight: '46vh', overflow: 'auto', marginTop: '8px' } });
    const inst = openModal({
      title: '绑定钉钉账号', sub: row.name + '（' + row.userId + '）',
      body: h('div', {}, [input, box]),
      footer: [
        h('button', { class: 'btn', onclick: () => inst.close() }, '关闭'),
        h('button', { class: 'btn btn-danger', onclick: () => {
          fetch(apiUrl('/api/ding/bind'), { method: 'POST', headers: DING_AUTH(), body: JSON.stringify({ userId: row.userId }) })
            .then(r => r.json()).then(() => { inst.close(); paint(); toast('已解绑'); });
        } }, '解除绑定')
      ]
    });
    const search = () => {
      clear(box);
      fetch(apiUrl('/api/ding/people?q=' + encodeURIComponent(input.value.trim())), { headers: DING_AUTH() })
        .then(r => r.json()).then(r => {
          if (!r.ok) { box.appendChild(h('div', { class: 'fhint', text: r.msg || '读取失败' })); return; }
          (r.rows || []).forEach(p => {
            box.appendChild(h('div', {
              class: 'card', style: { padding: '9px 11px', marginBottom: '6px', cursor: 'pointer' },
              onclick: () => {
                fetch(apiUrl('/api/ding/bind'), { method: 'POST', headers: DING_AUTH(),
                  body: JSON.stringify({ userId: row.userId, dingUserid: p.userid }) })
                  .then(x => x.json())
                  .then(x => { if (x.ok) { inst.close(); paint(); toast('已绑定 ' + x.dingName); } else toast(x.msg || '绑定失败', 'err'); });
              }
            }, [
              h('div', { style: { fontSize: '13px', fontWeight:'700' }, text: p.name + (p.title ? ' · ' + p.title : '') }),
              h('div', { class: 'fhint', style: { margin: '2px 0 0' }, text: (JSON.parse(p.depts || '[]') || []).slice(0, 3).join(' / ') })
            ]));
          });
          if (!r.rows || !r.rows.length) box.appendChild(h('div', { class: 'fhint', text: '没找到匹配的人' }));
        });
    };
    input.addEventListener('input', () => { clearTimeout(input._t); input._t = setTimeout(search, 250); });
    search();
  }

  /* ---------- 操作日志 ---------- */
  let aFrom = '', aTo = '', aUser = '', aQ = '';
  function paintAuditTab() {
    /* 默认区间：今天 00:00:00 ~ 23:59:59 */
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    if (!aFrom) aFrom = ymd(now) + ' 00:00:00';
    if (!aTo) aTo = ymd(now) + ' 23:59:59';

    /* 时间用一个框（与数据统计同一个选择器），不再并排两个输入框 */
    const ymdOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const parseYmd = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(); };
    let dFrom = parseYmd(aFrom), dTo = parseYmd(aTo);
    const rangeText = h('span', { class: 'al-range-t' });
    function syncRange() {
      const days = Math.round((dTo - dFrom) / 86400000) + 1;
      rangeText.textContent = ymdOf(dFrom) + ' ~ ' + ymdOf(dTo) + ' · ' + days + ' 天';
      aFrom = ymdOf(dFrom) + ' 00:00:00';
      aTo = ymdOf(dTo) + ' 23:59:59';
    }
    const rangeBtn = h('button', {
      class: 'al-range', type: 'button', title: '选择时间区间',
      onclick: () => openDateRange({
        from: dFrom, to: dTo,
        onPick: ({ from, to }) => { dFrom = from; dTo = to; syncRange(); load(); }
      })
    }, [h('span', { class: 'al-range-ic', html: iconSvg('calendar', 14) }), rangeText]);
    syncRange();

    const inUser = inputNode({ value: aUser, placeholder: '请输入操作员工' });
    const inQ = inputNode({ value: aQ, placeholder: '请输入操作内容' });
    const resultBox = h('div');

    function load() {
      syncRange();
      aUser = inUser.value.trim(); aQ = inQ.value.trim();
      clear(resultBox);
      resultBox.appendChild(h('div', { class: 'fhint', text: '加载中' }));
      const qs = new URLSearchParams({ limit: '200' });
      if (aFrom) qs.set('from', aFrom);
      if (aTo) qs.set('to', aTo);
      if (aUser) qs.set('user', aUser);
      if (aQ) {
        qs.set('q', aQ);
        /* 「登录」「提交完成」这类中文词，翻成 action 代码一起查 */
        const hits = Object.keys(window.AUDIT_LABEL || {})
          .filter(k => AUDIT_LABEL[k].indexOf(aQ) >= 0);
        if (hits.length) qs.set('actions', hits.join(','));
      }
      fetch(apiUrl('/api/audit?' + qs.toString()), {
        headers: { Authorization: 'Bearer ' + localStorage.getItem('cwsj_token_v1') }
      }).then(r => r.json()).then(r => {
        clear(resultBox);
        if (!r.ok) { resultBox.appendChild(h('div', { class: 'fhint', text: r.msg || '读取失败' })); return; }
        const rows = r.rows || [];
        const tbl = h('table', { class: 'tbl al-tbl' }, [
          h('thead', {}, h('tr', {}, [
            h('th', { class: 'al-c-time' }, '操作时间'),
            h('th', { class: 'al-c-user' }, '操作人'),
            h('th', {}, '操作内容')
          ])),
          h('tbody', {}, rows.map(row => {
            const label = (window.AUDIT_LABEL && AUDIT_LABEL[row.action]) || row.action;
            const who = row.name || row.userId || '系统';
            const detail = row.detail && row.detail !== who ? row.detail : '';
            return h('tr', {}, [
              h('td', { class: 'al-time', text: row.at }),
              h('td', { class: 'al-user', text: who }),
              h('td', { class: 'al-body' }, [
                h('span', { class: 'al-who', text: '[' + who + ']' }),
                h('span', { class: 'al-act', text: label }),
                detail ? h('span', { class: 'al-detail', text: ' · ' + detail }) : null
              ])
            ]);
          }))
        ]);
        resultBox.appendChild(h('div', { class: 'al-count', text: '共 ' + r.total + ' 条' + (rows.length < r.total ? '，显示最近 ' + rows.length + ' 条' : '') }));
        resultBox.appendChild(h('div', { class: 'al-wrap' }, rows.length ? tbl : h('div', { class: 'al-empty', text: '这段时间没有匹配的操作记录' })));
      }).catch(() => { clear(resultBox); resultBox.appendChild(h('div', { class: 'fhint', text: '网络错误' })); });
    }

    [inUser, inQ].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') load(); }));
    body.appendChild(h('div', { class: 'al-bar' }, [
      h('div', { class: 'al-f' }, [
        h('span', { class: 'al-k', text: '操作时间' }),
        rangeBtn
      ]),
      h('div', { class: 'al-f' }, [
        h('span', { class: 'al-k', text: '操作员工' }),
        inUser
      ]),
      h('div', { class: 'al-f al-f-q' }, [
        h('span', { class: 'al-k', text: '操作内容' }),
        inQ
      ]),
      h('button', { class: 'btn btn-primary btn-sm al-go', onclick: load }, '查询')
    ]));
    body.appendChild(resultBox);
    load();
  }

  /* ---------- 门店与分区 ---------- */
  function paintStoreTab() {
    /* 分区管理 */
    const regionBar = h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '6px' } });
    state.regions.forEach(r => {
      const n = state.stores.filter(s => s.regionId === r.id).length;
      regionBar.appendChild(h('span', { class: 'row', style: { gap: '4px', alignItems: 'center', margin: '0' } }, [
        tagNode(r.name + ' · ' + n + ' 店', 'tag-blue'),
        h('button', {
          class: 'btn btn-xs', title: '删除分区', onclick: () => confirmDialog({
            title: '删除分区', message: '删除「' + r.name + '」后，该分区下的门店将变为「未分区」，确定继续？', danger: true, okText: '删除',
            onOk: () => { removeRegion(r.id); toast('分区已删除'); paint(); }
          })
        }, '×')
      ]));
    });
    regionBar.appendChild(h('button', {
      class: 'btn btn-sm', onclick: () => {
        const name = inputNode({ placeholder: '分区名称，例如：华南区' });
        const inst = openModal({
          title: '新增门店分区', narrow: true,
          body: fgroup('分区名称', name, null, true),
          footer: [
            h('button', { class: 'btn', onclick: () => inst.close() }, '取消'),
            h('button', { class: 'btn btn-primary', onclick: () => { const v = name.value.trim(); if (!v) { toast('请填写分区名称', 'err'); return; } addRegion(v); inst.close(); toast('分区已创建', 'ok'); paint(); } }, '创建')
          ]
        });
      }
    }, '+ 新增分区'));
    body.appendChild(h('div', { class: 'sub-group' }, [h('h4', {}, '门店分区'), regionBar]));

    /* 门店表 */
    const rows = state.stores.map(s => {
      const r = state.regions.find(x => x.id === s.regionId);
      const regionSel = selectNode([{ v: '', t: '未分区' }].concat(state.regions.map(x => ({ v: x.id, t: x.name }))), s.regionId || '', {
        style: { width: '120px' }, onchange: async e => { await updateStore(s.id, { regionId: e.target.value || null }); toast('已更新分区'); paint(); }
      });
      return h('tr', { style: s.enabled === false ? { opacity: '.5' } : null }, [
        h('td', {}, [h('div', { style: { fontWeight:'700' } }, s.name), h('div', { class: 'fhint', style: { margin: 0 } }, s.id + ' · ' + s.addr)]),
        h('td', {}, s.account || s.code),
        h('td', {}, s.mgr),
        h('td', {}, s.city),
        h('td', {}, regionSel),
        h('td', {}, s.enabled === false ? tagNode('已停用', 'tag-red') : tagNode('正常', 'tag-green')),
        h('td', { class: 'op-cell' }, rowActions(
          h('button', { class: 'btn btn-xs', onclick: () => openStoreEditor(s, paint) }, '编辑'),
          [
            ['重置密码', () => openResetPwd(s, paint)],
            [s.enabled === false ? '启用账号' : '停用账号', () => confirmDialog({
              title: (s.enabled === false ? '启用' : '停用') + '门店账号', okText: s.enabled === false ? '启用' : '停用',
              message: s.enabled === false ? '启用后「' + (s.account || s.code) + '」可重新登录。' : '停用后「' + (s.account || s.code) + '」将无法登录系统，历史数据保留。', danger: s.enabled !== false,
              onOk: async () => { await updateStore(s.id, { enabled: s.enabled === false }); toast('已' + (s.enabled === false ? '启用' : '停用')); paint(); }
            })],
            ['删除门店', () => confirmDialog({
              title: '删除门店', message: '将删除「' + s.name + '」及其全部任务完成记录，不可恢复！确定继续？', danger: true, okText: '确认删除',
              onOk: async () => { await removeStore(s.id); toast('门店已删除'); paint(); }
            }), 'danger']
          ]
        ))
      ]);
    });
    const tbl = h('table', { class: 'tbl' }, [
      h('thead', {}, h('tr', {}, [
        h('th', {}, '门店'), h('th', {}, '账号'), h('th', {}, '店长'), h('th', {}, '城市'), h('th', {}, '所属分区'), h('th', {}, '状态'), h('th', {}, '操作')
      ])),
      h('tbody', {}, rows)
    ]);
    body.appendChild(h('div', { class: 'sub-group' }, [
      h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center' } }, [
        h('h4', { style: { margin: 0 } }, '门店账号（' + state.stores.length + '）'),
        h('button', { class: 'btn btn-sm btn-primary m2-hide-mobile', onclick: () => openStoreEditor(null, paint) }, '+ 新增门店')
      ]),
      h('div', { class: 'tbl-wrap mt10' }, tbl)
    ]));
  }

  /* 重置密码：换店长时收回旧密码的唯一手段（账号属于门店，不随人走） */
  function openResetPwd(target, onDone) {
    const pwd = inputNode({ value: '', placeholder: '新密码，至少 6 位' });
    const inst = openModal({
      title: '重置密码 · ' + (target.account || target.name || ''),
      narrow: true,
      body: fgroup('新密码', pwd, '重置后旧密码立即失效，请把新密码告知当前使用人', true),
      footer: [
        h('button', { class: 'btn', onclick: () => inst.close() }, '取消'),
        h('button', {
          class: 'btn btn-primary', onclick: async () => {
            const v = pwd.value.trim();
            if (v.length < 6) { toast('新密码至少 6 位', 'err'); return; }
            try {
              const r = await Api.adminResetPwd({ account: target.account }, v);
              toast((r && r.msg) || '密码已重置', 'ok');
              inst.close(); onDone && onDone();
            } catch (e) { toast(e.message, 'err'); }
          }
        }, '确认重置')
      ]
    });
  }

  function openStoreEditor(s, onDone) {
    const isNew = !s;
    s = s || { name: '', city: '', addr: '', mgr: '', phone: '', code: nextStoreCode(), account: '', regionId: '', enabled: true };
    const ref = {
      name: inputNode({ value: s.name, placeholder: '例如：上海五角场万达店' }),
      city: inputNode({ value: s.city, placeholder: '城市' }),
      addr: inputNode({ value: s.addr || '', placeholder: '商场 + 楼层 + 铺位号' }),
      mgr: inputNode({ value: s.mgr || '', placeholder: '店长姓名' }),
      phone: inputNode({ value: s.phone || '', placeholder: '联系电话' }),
      /* 登录账号绑 account（拼音号），不是内部编号 code；密码留空 = 不修改 */
      account: inputNode({ value: s.account || '', placeholder: '英文/数字，如 nanchang1' }),
      pwd: inputNode({ value: '', placeholder: isNew ? '留空则用初始密码' : '留空则不修改' })
    };
    const regionSel = selectNode([{ v: '', t: '未分区' }].concat(state.regions.map(x => ({ v: x.id, t: x.name }))), s.regionId || '');
    const inst = openModal({
      title: isNew ? '新增门店' : '编辑门店',
      body: h('div', { class: 'fgrid c2' }, [
        fgroup('门店名称', ref.name, null, true),
        fgroup('城市', ref.city, null, true),
        fgroup('详细地址', ref.addr),
        fgroup('店长', ref.mgr, null, true),
        fgroup('登录账号', ref.account, null, true),
        fgroup('登录密码', ref.pwd, null, true),
        fgroup('联系电话', ref.phone),
        fgroup('所属分区', regionSel)
      ]),
      footer: [
        h('button', { class: 'btn', onclick: () => inst.close() }, '取消'),
        h('button', {
          class: 'btn btn-primary', onclick: async () => {
            if (!ref.name.value.trim() || !ref.city.value.trim() || !ref.mgr.value.trim()) { toast('请填写门店名称 / 城市 / 店长', 'err'); return; }
            const account = ref.account.value.trim();
            if (!account) { toast('请填写登录账号', 'err'); return; }
            const dup = state.stores.find(x => (x.account || x.code) === account && x.id !== s.id)
              || state.hq.find(x => x.account === account);
            if (dup) { toast('账号 ' + account + ' 已被使用', 'err'); return; }
            const patch = {
              name: ref.name.value.trim(), city: ref.city.value.trim(), addr: ref.addr.value.trim(),
              mgr: ref.mgr.value.trim(), phone: ref.phone.value.trim(),
              account, pwd: ref.pwd.value.trim(),
              regionId: regionSel.value || null
            };
            try {
              if (isNew) { await addStore(patch); toast('门店已创建，账号 ' + account, 'ok'); }
              else { await updateStore(s.id, patch); toast('门店信息已更新', 'ok'); }
              inst.close(); onDone && onDone();
            } catch (err) { toast(err.message, 'err'); }
          }
        }, isNew ? '创建门店' : '保存修改')
      ]
    });
  }

  /* ---------- 部门与账号 ---------- */
  function paintAccountTab() {
    /* 部门管理 */
    const deptBar = h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '6px' } });
    state.departments.forEach(d => {
      const n = state.hq.filter(u => u.dept === d).length;
      deptBar.appendChild(h('span', { class: 'row', style: { gap: '4px', alignItems: 'center', margin: '0' } }, [
        tagNode(d + ' · ' + n + ' 人', 'tag-line'),
        h('button', {
          class: 'btn btn-xs', title: '删除部门', onclick: () => {
            if (n) { toast('该部门下还有 ' + n + ' 名人员，请先转移', 'err'); return; }
            confirmDialog({
              title: '删除部门', message: '确定删除「' + d + '」？', danger: true, okText: '删除',
              onOk: () => { removeDepartment(d); toast('部门已删除'); paint(); }
            });
          }
        }, '×')
      ]));
    });
    deptBar.appendChild(h('button', {
      class: 'btn btn-sm', onclick: () => {
        const name = inputNode({ placeholder: '部门名称，例如：品牌部' });
        const inst = openModal({
          title: '新增部门', narrow: true,
          body: fgroup('部门名称', name, null, true),
          footer: [
            h('button', { class: 'btn', onclick: () => inst.close() }, '取消'),
            h('button', { class: 'btn btn-primary', onclick: () => { const v = name.value.trim(); if (!v) { toast('请填写部门名称', 'err'); return; } if (state.departments.includes(v)) { toast('部门已存在', 'err'); return; } addDepartment(v); inst.close(); toast('部门已创建', 'ok'); paint(); } }, '创建')
          ]
        });
      }
    }, '+ 新增部门'));
    body.appendChild(h('div', { class: 'sub-group' }, [h('h4', {}, '管理公司部门'), deptBar]));

    /* 账号表 */
    const permTags = u => h('div', { class: 'row', style: { gap: '4px' } }, [
      u.committee ? tagNode('管委会', 'tag-blue') : null,
      u.admin ? tagNode('管理员', 'tag-purple') : null,
      !u.committee && !u.admin ? tagNode('普通', 'tag-gray') : null
    ]);
    const rows = state.hq.map(u => h('tr', { style: u.enabled === false ? { opacity: '.5' } : null }, [
      h('td', {}, [h('div', { style: { fontWeight:'700' } }, u.name), h('div', { class: 'fhint', style: { margin: 0 } }, u.id)]),
      h('td', {}, u.account),
      h('td', {}, tagNode(u.dept, 'tag-line')),
      h('td', {}, u.title),
      h('td', {}, permTags(u)),
      h('td', {}, u.enabled === false ? tagNode('已停用', 'tag-red') : tagNode('正常', 'tag-green')),
      h('td', { class: 'op-cell' }, rowActions(
        h('button', { class: 'btn btn-xs', onclick: () => openHqUserEditor(u, paint) }, '编辑 / 权限'),
        [
          ['重置密码', () => openResetPwd(u, paint)],
          [u.enabled === false ? '启用账号' : '停用账号', () => confirmDialog({
            title: (u.enabled === false ? '启用' : '停用') + '账号', okText: u.enabled === false ? '启用' : '停用', danger: u.enabled !== false,
            message: (u.enabled === false ? '启用后「' : '停用后「') + u.account + ' ' + u.name + '」' + (u.enabled === false ? '可重新登录。' : '将无法登录系统。'),
            onOk: async () => { await updateHqUser(u.id, { enabled: u.enabled === false }); toast('已' + (u.enabled === false ? '启用' : '停用')); paint(); }
          })],
          ['删除账号', () => confirmDialog({
            title: '删除账号', message: '将删除「' + u.name + '」的登录账号（通讯录联系人保留），确定继续？', danger: true, okText: '确认删除',
            onOk: async () => { await removeHqUser(u.id); toast('账号已删除'); paint(); }
          }), 'danger']
      ]))
    ]));
    const tbl = h('table', { class: 'tbl' }, [
      h('thead', {}, h('tr', {}, [
        h('th', {}, '姓名'), h('th', {}, '账号'), h('th', {}, '部门'), h('th', {}, '职务'), h('th', {}, '权限'), h('th', {}, '状态'), h('th', {}, '操作')
      ])),
      h('tbody', {}, rows)
    ]);
    body.appendChild(h('div', { class: 'sub-group' }, [
      h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center' } }, [
        h('h4', { style: { margin: 0 } }, '管理公司人员账号（' + state.hq.length + '）'),
        h('button', { class: 'btn btn-sm btn-primary', onclick: () => openHqUserEditor(null, paint) }, '+ 新增人员账号')
      ]),
      h('div', { class: 'tbl-wrap mt10' }, tbl),
      h('div', { class: 'fhint mt10', text: '权限说明：「管委会」可评估门店需求并派发责任人；「管理员」可进入管理员后台维护门店、分区、部门、账号与权限。' })
    ]));
  }

  function openHqUserEditor(u, onDone) {
    const isNew = !u;
    u = u || { name: '', dept: state.departments[0], title: '', account: '', committee: false, admin: false, phone: '' };
    const ref = {
      name: inputNode({ value: u.name, placeholder: '姓名' }),
      title: inputNode({ value: u.title || '', placeholder: '职务，例如：运营专员' }),
      account: inputNode({ value: u.account || '', placeholder: '手机号或英文账号' }),
      pwd: inputNode({ value: '', placeholder: isNew ? '留空则用初始密码' : '留空则不修改' }),
      phone: inputNode({ value: u.phone || '' })
    };
    const deptSel = selectNode(state.departments.map(d => ({ v: d, t: d })), u.dept);
    let committee = !!u.committee, admin = !!u.admin;
    const permBox = h('div');
    function paintPerm() {
      clear(permBox);
      permBox.appendChild(h('label', { class: 'switch' }, [
        (() => { const i = h('input', { type: 'checkbox' }); i.checked = committee; i.addEventListener('change', () => { committee = i.checked; paintPerm(); }); return i; })(),
        h('span', { text: '管委会成员（可评估门店需求、派发责任人）' })
      ]));
      permBox.appendChild(h('label', { class: 'switch', style: { marginTop: '8px' } }, [
        (() => { const i = h('input', { type: 'checkbox' }); i.checked = admin; i.addEventListener('change', () => { admin = i.checked; paintPerm(); }); return i; })(),
        h('span', { text: '管理员（可进管理员后台管理门店 / 分区 / 部门 / 账号，并维护通讯录）' })
      ]));
    }
    paintPerm();
    const inst = openModal({
      title: isNew ? '新增人员账号' : '编辑人员账号与权限',
      body: h('div', {}, [
        h('div', { class: 'fgrid c2' }, [
          fgroup('姓名', ref.name, null, true),
          fgroup('部门', deptSel, null, true),
          fgroup('职务', ref.title),
          fgroup('联系电话', ref.phone),
          fgroup('登录账号', ref.account, null, true),
          fgroup('登录密码', ref.pwd, null, true)
        ]),
        h('div', { class: 'fgroup' }, [h('label', {}, ['权限分配']), permBox,
          h('div', { class: 'fhint', style: { marginTop: '6px' }, text: '两个都不勾 = 普通（只能提需求、看分配给自己的任务）。管理员已含通讯录维护权。' })])
      ]),
      footer: [
        h('button', { class: 'btn', onclick: () => inst.close() }, '取消'),
        h('button', {
          class: 'btn btn-primary', onclick: async () => {
            if (!ref.name.value.trim()) { toast('请填写姓名', 'err'); return; }
            const account = ref.account.value.trim();
            if (!account) { toast('请填写登录账号', 'err'); return; }
            const lower = account.toLowerCase();
            const dup = state.hq.find(x => (x.account || '').toLowerCase() === lower && x.id !== u.id)
              || state.stores.find(x => (x.account || x.code || '').toLowerCase() === lower);
            if (dup) { toast('账号 ' + account + ' 已被使用', 'err'); return; }
            const patch = {
              name: ref.name.value.trim(), dept: deptSel.value, title: ref.title.value.trim(), phone: ref.phone.value.trim(),
              account, pwd: ref.pwd.value.trim(),
              committee: committee, admin: admin
            };
            try {
              if (isNew) { await addHqUser(Object.assign({ duty: '' }, patch)); toast('账号已创建：' + account, 'ok'); }
              else { await updateHqUser(u.id, patch); toast('已保存', 'ok'); }
              inst.close(); onDone && onDone();
            } catch (err) { toast(err.message, 'err'); }
          }
        }, isNew ? '创建账号' : '保存修改')
      ]
    });
  }

  paint();
  wrap.appendChild(tabsBar); wrap.appendChild(body);
  return wrap;
}

/* ---------------- 管理公司路由表 ---------------- */
const PAGE_HQ = {
  'hq-demands': () => pageHqDemands(),
  more: () => pageMore(),
  'hq-tasks': () => pageHqTasks(),
  'hq-board': () => pageHqBoard(),
  'hq-contacts': () => pageContacts(),
  'hq-stats': () => pageHqStats(),
  'admin': () => pageAdmin()
};
