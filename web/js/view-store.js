/* =========================================================
   view-store.js — 共享组件 + 门店端页面
   ========================================================= */

const STATUS_META = {
  normal: { cls: '', label: '进行中', tag: 'tag-gray', cd: 'cd-normal' },
  due: { cls: 'st-due', label: '即将到期', tag: 'tag-yellow', cd: 'cd-due' },
  overdue: { cls: 'st-overdue', label: '已逾期', tag: 'tag-red', cd: 'cd-over' },
  done: { cls: 'st-done', label: '已完成', tag: 'tag-green', cd: 'cd-done' },
  late: { cls: 'st-done', label: '逾期完成', tag: 'tag-yellow', cd: 'cd-done' },
  na: { cls: '', label: '不适用', tag: 'tag-gray', cd: 'cd-normal' }
};
const PRIORITY_TIP = { 1: '低', 2: '较低', 3: '一般', 4: '重要', 5: '非常重要' };

/* =========================================================
   任务卡片
   ========================================================= */
function renderTaskCard(item, opts) {
  opts = opts || {};
  const t = item.task;
  const m = item.notStarted ? { cls: '', label: '待生效', tag: 'tag-gray', cd: 'cd-normal' } : (STATUS_META[item.status] || STATUS_META.normal);
  const card = h('div', { class: 'task-card ' + m.cls, dataset: { taskId: t.id || '' } });

  /* 头部 */
  const meta = h('div', { class: 'tc-meta' }, [
    tagNode(CYCLE_LABEL[t.cycle], CYCLE_TAG[t.cycle]),
    h('span', {}, cycleDesc(t)),
    h('span', { class: 'sep' }, '·'),
    h('span', {}, t.dept + ' · ' + t.creatorName + ' 发布'),
    h('span', { class: 'sep' }, '·'),
    h('span', {}, '重要程度'),
    starsNode(t.priority)
  ]);
  if (opts.showStore) {
    const s = getStore(opts.storeId);
    meta.appendChild(h('span', { class: 'sep' }, '·'));
    meta.appendChild(h('span', { style: { fontWeight: '600', color: 'var(--text-2)' } }, '受派门店：' + (s ? s.name : '—')));
  }
  card.appendChild(h('div', { class: 'tc-head' }, [
    h('div', { style: { flex: '1', minWidth: '0' } }, [
      h('div', { class: 'tc-title', text: t.title }),
      meta
    ]),
    h('div', { class: 'tc-right' }, [tagNode(m.label, m.tag)])
  ]));

  /* 正文 */
  if (t.content) card.appendChild(h('div', { class: 'tc-body', text: t.content }));
  const tImg = thumbsNode(t.images);
  if (tImg) card.appendChild(h('div', {}, [h('div', { class: 'fhint', style: { marginTop: '9px', marginBottom: '0' }, text: '任务附件图片' }), tImg]));
  const tLink = linksNode(t.links);
  if (tLink) card.appendChild(tLink);

  /* 完成反馈 */
  if (item.rec) {
    const r = item.rec;
    const box = h('div', { class: 'done-box' }, [
      h('div', { class: 'db-t' }, [
        h('span', {}, '✓ 门店已提交（' + (r.by || '') + '）'),
        h('span', { style: { fontWeight: '400' } }, ymdhm(r.doneAt) + (r.late ? ' · 逾期提交' : ' · 按时提交'))
      ]),
      r.text ? h('div', { class: 'db-c', text: r.text }) : null
    ]);
    const ri = thumbsNode(r.images);
    if (ri) box.appendChild(ri);
    const rl = linksNode(r.links);
    if (rl) box.appendChild(rl);
    card.appendChild(box);
  } else if (item.status === 'overdue') {
    card.appendChild(h('div', {
      class: 'done-box', style: { background: 'var(--danger-bg)', color: 'var(--danger-tx)' },
      text: '该任务已超过截止时间且未提交，系统已记录逾期。请尽快补交并说明原因。'
    }));
  }

  /* 底部 */
  const firstDue = item.notStarted ? firstDueAfter(t) : null;
  const cd = h('span', { class: 'countdown ' + m.cd },
    item.notStarted
      ? ('生效 ' + (t.startDate || '—') + (firstDue ? ' · 首次到期 ' + ymdhm(firstDue) : ''))
      : (item.rec ? ('完成于 ' + ymdhm(item.rec.doneAt)) : (ymdhm(item.due) + ' · ' + countdown(item.due))));
  const footLeft = h('div', { class: 'row' }, [
    h('span', { class: 'fhint', style: { margin: '0' }, text: item.notStarted ? '本期状态：' : (t.cycle === 'daily' ? '今日截止：' : (t.cycle === 'once' ? '截止时间：' : '本期截止：')) }),
    cd
  ]);
  const btns = h('div', { class: 'row' });
  if (opts.mode === 'store') {
    if (item.rec) {
      btns.appendChild(h('button', { class: 'btn btn-sm', onclick: () => openDoneModal(item, opts.onDone) }, '修改提交'));
      btns.appendChild(h('button', {
        class: 'btn btn-sm btn-ghost', onclick: () => confirmDialog({
          title: '撤销提交', message: '撤销后该任务回到「未完成」状态，会重新进入逾期/临期统计。确定继续？',
          danger: true, okText: '确定撤销',
          onOk: async () => {
            try { await revokeDone(t.id, me.id, item.key); toast('已撤销提交'); opts.onDone && opts.onDone(); }
            catch (e) { toast('撤销失败：' + e.message, 'err'); }
          }
        })
      }, '撤销'));
    } else if (!item.notStarted) {
      btns.appendChild(h('button', { class: 'btn btn-sm btn-primary', onclick: () => openDoneModal(item, opts.onDone) }, '提交完成'));
    }
  }
  btns.appendChild(h('button', { class: 'btn btn-sm btn-ghost', onclick: () => openTaskDetail(item, opts) }, '详情'));
  card.appendChild(h('div', { class: 'tc-foot' }, [footLeft, btns]));
  return card;
}

/* ---------------- 提交完成弹窗 ---------------- */
function openDoneModal(item, onDone) {
  const t = item.task;
  const text = textareaNode({ placeholder: '填写完成情况说明，例如：已完成全部 3 台机器自检，2 号机出卡偶发延迟已报修。', rows: '4' });
  const images = [];
  const links = [];
  const up = imgUploader(images, null, 6);
  const le = linkEditor(links, null);
  const requireImg = (t.priority >= 4);

  const inst = openModal({
    title: '提交任务完成情况',
    sub: t.title + '　|　' + cycleDesc(t),
    body: h('div', {}, [
      h('div', {
        class: 'done-box', style: { background: 'var(--panel-2)', color: 'var(--text-2)', marginBottom: '16px' }
      }, [
        h('div', { class: 'db-t' }, [
          h('span', { text: CYCLE_LABEL[t.cycle] + ' · ' + t.dept }),
          h('span', { style: { fontWeight: '400' }, text: '截止 ' + ymdhm(item.due) })
        ]),
        h('div', { class: 'db-c' }, t.content || '（无详细说明）')
      ]),
      fgroup('完成说明', text, null, true),
      fgroup('图片凭证', up, requireImg ? '该任务重要程度 ' + t.priority + ' 星，建议上传现场照片' : null),
      fgroup('相关链接（可选）', le, '可填写报表、工单、在线文档等链接')
    ]),
    footer: [
      h('button', { class: 'btn', onclick: () => inst.close() }, '取消'),
      h('button', {
        class: 'btn btn-primary', onclick: async () => {
          const txt = text.value.trim();
          if (!txt) { toast('请填写完成说明', 'err'); return; }
          try {
            await submitDone(t.id, me.id, item.key, { text: txt, images: images.slice(), links: links.filter(l => l.url) });
            inst.close();
            toast('提交成功' + (item.status === 'overdue' ? '（本次为逾期补交）' : ''), 'ok');
            onDone && onDone();
          } catch (e) {
            /* 提交失败绝不关弹窗：内容要留在页面上，让人能重试 */
            toast('提交失败：' + e.message + '（内容仍在本页）', 'err');
          }
        }
      }, item.status === 'overdue' ? '逾期补交' : '提交完成')
    ]
  });
}

/* ---------------- 任务详情 ---------------- */
function openTaskDetail(item, opts) {
  const t = item.task;
  const p = taskProgress(t);
  const st = t.storeIds.map(sid => {
    const i = p.cells.find(c => c.storeId === sid);
    return { store: getStore(sid), status: i ? i.status : 'na' };
  });
  const body = h('div', {}, [
    h('dl', { class: 'dl' }, [
      h('dt', {}, '任务类型'), h('dd', {}, tagNode(CYCLE_LABEL[t.cycle], CYCLE_TAG[t.cycle])),
      h('dt', {}, '截止规则'), h('dd', {}, cycleDesc(t)),
      h('dt', {}, '重要程度'), h('dd', {}, h('span', { class: 'row' }, [starsNode(t.priority, true), h('span', { class: 'fhint', style: { margin: '0' }, text: PRIORITY_TIP[t.priority] })])),
      h('dt', {}, '发布部门'), h('dd', {}, t.dept + ' · ' + t.creatorName),
      h('dt', {}, '发布时间'), h('dd', {}, ymdhm(t.createdAt)),
      h('dt', {}, '提醒规则'), h('dd', {}, desclineText(t)),
      h('dt', {}, '受派门店'), h('dd', {}, t.storeIds.length + ' 家：' + t.storeIds.map(id => { const s = getStore(id); return s ? s.name : id; }).join('、')),
      h('dt', {}, '本期进度'), h('dd', {}, h('span', { class: 'row' }, [
        h('span', { style: { fontWeight: '650' }, text: p.done + ' / ' + p.expected + ' 家完成' }),
        tagNode('逾期 ' + p.overdue + ' 家', p.overdue ? 'tag-red' : 'tag-gray'),
        tagNode('临期 ' + p.dueSoon + ' 家', p.dueSoon ? 'tag-yellow' : 'tag-gray')
      ]))
    ]),
    t.content ? h('div', { class: 'mt14' }, [h('div', { class: 'fhint', style: { margin: '0 0 6px' }, text: '任务说明' }), h('div', { class: 'tc-body', style: { marginTop: '0' }, text: t.content })]) : null,
    thumbsNode(t.images), linksNode(t.links),
    h('div', { class: 'sub-group' }, [h('h4', {}, '受派门店明细'),
      h('div', { class: 'tbl-wrap', style: { maxHeight: '280px' } }, buildStoreStatusTable(st))
    ])
  ]);
  openModal({ title: '任务详情', sub: t.title, wide: true, body: body, footer: [h('button', { class: 'btn', onclick: () => closeTopModal() }, '关闭')] });
}
function desclineText(t) {
  const r = t.remindBeforeMin;
  const a = r > 0 ? '到期前 ' + dur(r * 60000) + ' 提醒' : '不提前提醒';
  return a + (t.remindOverdue ? '；过期未完成持续提醒' : '；过期不提醒');
}
function buildStoreStatusTable(st) {
  const tb = h('tbody');
  st.forEach(x => {
    const m = STATUS_META[x.status] || STATUS_META.normal;
    tb.appendChild(h('tr', {}, [
      h('td', {}, x.store ? x.store.name : '—'),
      h('td', {}, x.store ? x.store.mgr : '—'),
      h('td', {}, tagNode(m.label, m.tag))
    ]));
  });
  return h('table', { class: 'tbl' }, [
    h('thead', {}, h('tr', {}, [h('th', {}, '门店'), h('th', {}, '店长'), h('th', {}, '本期状态')])),
    tb
  ]);
}

/* =========================================================
   需求卡片 / 流程 / 详情
   ========================================================= */
function demandFlowNode(d, opts) {
  opts = opts || {};
  const s = [2, 0, 0, 0, 0];
  if (d.status === 'pending') s[1] = 1;
  else if (d.status === 'rejected') s[1] = 3;
  else {
    s[1] = 2;
    if (d.status === 'approved') s[2] = 1;
    else {
      s[2] = 2;
      if (d.status === 'assigned') s[3] = 1;
      else { s[3] = 2; s[4] = d.status === 'confirmed' ? 2 : 1; }
    }
  }

  /* 每一步的「完成时间 + 操作人」。数据早就在各节点对象里（review/assign/complete/confirm），
     以前只摆在弹窗最底部的流转记录里，步骤条上看不到 → 用户以为"没有时间"。
     （2026-10-22 用户要求：像钉钉审批流一样每步都能看到谁在什么时候做的） */
  const store = (typeof getStore === 'function' ? getStore(d.storeId) : null) || {};
  const meta = [
    { at: d.createdAt, by: store.mgr || d.storeName || '' },
    { at: d.review && d.review.at, by: d.review && d.review.byName },
    { at: d.assign && d.assign.at, by: d.assign && d.assign.toName },
    { at: d.complete && d.complete.at, by: d.complete && d.complete.byName },
    { at: d.confirm && d.confirm.at, by: d.confirm && (store.mgr || '门店') },
  ];

  const wrap = h('div', { class: 'flow' });
  DEMAND_FLOW.forEach((label, i) => {
    const cls = s[i] === 2 ? 'done' : s[i] === 1 ? 'on' : s[i] === 3 ? 'rej' : '';
    const m = meta[i] || {};
    wrap.appendChild(h('div', { class: 'flow-step ' + (s[i] === 3 ? 'rej' : cls) }, [
      h('div', { class: 'fs-row' }, [
        h('span', { class: 'fs-dot' }, s[i] === 2 ? '✓' : s[i] === 3 ? '×' : String(i + 1)),
        h('span', { text: label })
      ]),
      opts.showMeta
        ? (m.at
          ? h('div', { class: 'fs-meta', text: mdhm(m.at) + (m.by ? ' · ' + m.by : '') })
          : (s[i] === 1 ? h('div', { class: 'fs-meta on-going', text: '进行中' }) : null))
        : null
    ]));
    if (i < DEMAND_FLOW.length - 1) wrap.appendChild(h('span', { class: 'flow-line' }));
  });

  const box = h('div', { class: 'flow-box' }, [wrap]);

  /* 顶部总耗时：已归档算「全程」，在途算「已流转」，驳回算到驳回那一刻 */
  if (opts.showMeta && d.createdAt) {
    const start = new Date(d.createdAt).getTime();
    const endRaw = d.confirm && d.confirm.at ? d.confirm.at
      : d.status === 'rejected' && d.review ? d.review.at : null;
    const end = endRaw ? new Date(endRaw).getTime() : Date.now();
    const label = d.status === 'confirmed' ? '全程耗时' : endRaw ? '处理耗时' : '已流转';
    box.appendChild(h('div', { class: 'flow-total', text: label + ' ' + dur(Math.max(0, end - start)) }));
  }
  return box;
}
function renderDemandCard(d, opts) {
  opts = opts || {};
  const st = DEMAND_STATUS[d.status] || DEMAND_STATUS.pending;
  const card = h('div', {
    class: 'demand-card ' + st.cls,
    dataset: { demandId: d.id || '' },
    style: opts.clickable === false ? null : { cursor: 'pointer' },
    onclick: opts.onClick
  });
  card.appendChild(h('div', { class: 'tc-head' }, [
    h('div', { style: { flex: '1', minWidth: '0' } }, [
      h('div', { class: 'tc-title', text: d.title }),
      h('div', { class: 'tc-meta' }, [
        tagNode(st.label, st.tag),
        h('span', { class: 'code-tag', text: d.code }),
        h('span', { class: 'sep' }, '·'),
        h('span', {}, d.storeName),
        h('span', { class: 'sep' }, '·'),
        h('span', {}, ago(d.createdAt) + '提交')
      ])
    ]),
    h('div', { class: 'tc-right' }, [
      d.assign ? tagNode('→ ' + d.assign.toName + '（' + d.assign.dept + '）', 'tag-purple')
        : tagNode('期望：' + (d.targetDept || '不限部门'), 'tag-line'),
      canDeleteDemand(d) ? h('button', {
        class: 'btn btn-xs btn-del',
        onclick: (e) => { if (e && e.stopPropagation) e.stopPropagation(); confirmDeleteDemand(d, opts.onDeleted); }
      }, '删除') : null
    ])
  ]));
  if (d.desc) card.appendChild(h('div', { class: 'demand-body', text: d.desc }));
  const im = thumbsNode(d.images); if (im) card.appendChild(im);
  const lk = linksNode(d.links); if (lk) card.appendChild(lk);
  if (d.review && d.review.result === 'reject') {
    card.appendChild(h('div', { class: 'done-box', style: { background: 'var(--danger-bg)', color: 'var(--danger-tx)' } },
      h('div', {}, '驳回意见：' + d.review.comment)));
  }
  card.appendChild(demandFlowNode(d));
  return card;
}

/* 删除确认 */
function confirmDeleteDemand(d, onDone) {
  const inst = openModal({
    title: '删除这条需求？',
    sub: d.code + ' · ' + d.title,
    body: h('div', { class: 'fhint', style: { margin: '0' } },
      '删除后不能恢复，这条需求的处理记录也会一起消失。'),
    footer: [
      h('button', { class: 'btn', onclick: () => inst.close() }, '取消'),
      h('button', {
        class: 'btn btn-danger',
        onclick: () => { deleteDemandById(d.id); inst.close(); toast('已删除'); onDone && onDone(); }
      }, '删除')
    ]
  });
}

function openDemandDetail(d, opts) {
  opts = opts || {};
  let inst = null;

  /* 操作后自我刷新 —— 详情弹窗里的按钮是**打开时**按当时状态生成的。
     评估通过/派发/完成处理后，状态和按钮都变了，必须关掉重开一次；
     否则用户看到的是旧状态，以为「没反应」，还得手动刷新页面（2026-10-22 的真实反馈）。 */
  function rebuild() {
    const fresh = (typeof findDemand === 'function' ? findDemand(d.id) : null) || d;
    if (inst) inst.close();
    openDemandDetail(fresh, opts);
    opts.onAction && opts.onAction();      // 背后的列表也一起刷
  }

  const st = DEMAND_STATUS[d.status] || DEMAND_STATUS.pending;
  const rows = [
    h('dt', {}, '需求编号'), h('dd', {}, h('span', { class: 'code-tag', text: d.code })),
    h('dt', {}, '提出门店'), h('dd', {}, d.storeName),
    h('dt', {}, '期望部门'), h('dd', {}, d.targetDept || '不限'),
    h('dt', {}, '提交时间'), h('dd', {}, ymdhm(d.createdAt)),
    h('dt', {}, '当前状态'), h('dd', {}, tagNode(st.label, st.tag))
  ];
  if (d.review) {
    rows.push(h('dt', {}, '评估结果'), h('dd', {}, (d.review.result === 'pass' ? '✅ 通过' : '⛔ 驳回') + '　' + d.review.byName + '　' + ymdhm(d.review.at)));
    rows.push(h('dt', {}, '评估意见'), h('dd', {}, d.review.comment || '—'));
  }
  if (d.assign) {
    rows.push(h('dt', {}, '责任人'), h('dd', {}, d.assign.toName + '（' + d.assign.dept + '）'));
    rows.push(h('dt', {}, '期望完成'), h('dd', {}, d.assign.expectDate + (d.assign.note ? '　—　' + d.assign.note : '')));
  }
  if (d.confirm) rows.push(h('dt', {}, '门店评价'), h('dd', {}, h('span', { class: 'row' }, [starsNode(d.confirm.rating), h('span', {}, d.confirm.comment || '')])));

  const body = h('div', {}, [
    h('dl', { class: 'dl' }, rows),
    h('div', { class: 'mt14' }, [
      h('div', { class: 'fhint', style: { margin: '0 0 6px' }, text: '需求描述' }),
      h('div', { class: 'tc-body', style: { marginTop: '0' }, text: d.desc || '（无）' })
    ]),
    d.images && d.images.length ? h('div', { class: 'mt14' }, [h('div', { class: 'fhint', style: { margin: '0 0 6px' }, text: '需求图片' }), thumbsNode(d.images)]) : null,
    linksNode(d.links),
    d.complete ? h('div', { class: 'mt14' }, [
      h('div', { class: 'fhint', style: { margin: '0 0 6px' }, text: '处理结果（' + d.complete.byName + ' · ' + ymdhm(d.complete.at) + '）' }),
      h('div', { class: 'done-box' }, [
        h('div', { class: 'db-c', text: d.complete.text || '（未填写说明）' }),
        thumbsNode(d.complete.images),
        linksNode(d.complete.links)
      ])
    ]) : null,
    h('div', { class: 'sub-group' }, [h('h4', {}, '处理流程'), demandFlowNode(d, { showMeta: true })]),
    h('div', { class: 'sub-group' }, [h('h4', {}, '流转记录'), timelineNode(d.logs)])
  ]);

  /* 支持两种来源：getActions(dd, after) 工厂函数（按钮随状态变），或已经算好的按钮数组 */
  const src = typeof opts.getActions === 'function' ? opts.getActions(d, rebuild) : (opts.actions || []);
  const actions = src.slice();
  /* 被驳回的需求：提出门店可以修改后重新提交（否则门店只能重新提一条，历史就断了） */
  if (isStore() && d.storeId === me.id && d.status === 'rejected') {
    actions.push(h('button', {
      class: 'btn btn-primary',
      onclick: () => openNewDemandModal(rebuild, d)
    }, '修改并重新提交'));
  }
  if (opts.allowStoreConfirm && isStore() && d.storeId === me.id && d.status === 'completed') {
    actions.push(h('button', { class: 'btn', onclick: () => openReopenModal(d, rebuild) }, '退回重做'));
    actions.push(h('button', { class: 'btn btn-ok', onclick: () => openConfirmModal(d, rebuild) }, '确认完成'));
  }
  actions.push(h('button', { class: 'btn btn-ghost', onclick: () => closeTopModal() }, '关闭'));

  inst = openModal({
    title: '需求详情', sub: d.title, wide: true, body: body, footer: actions
  });
  return inst;
}

function openConfirmModal(d, onDone) {
  let rating = 5;
  const comment = textareaNode({ placeholder: '（可选）对本次处理的评价', rows: '3' });
  const inst = openModal({
    title: '确认需求已完成', narrow: true,
    body: h('div', {}, [
      h('div', { class: 'done-box', style: { marginBottom: '15px' } }, [
        h('div', { class: 'db-t' }, [h('span', {}, d.title), h('span', { style: { fontWeight: '400' }, text: d.complete ? ymdhm(d.complete.at) : '' })]),
        h('div', { class: 'db-c', text: d.complete ? (d.complete.text || '') : '' })
      ]),
      fgroup('处理质量评分', starPicker(5, v => { rating = v; })),
      fgroup('评价（可选）', comment)
    ]),
    footer: [
      h('button', { class: 'btn', onclick: () => inst.close() }, '取消'),
      h('button', { class: 'btn btn-ok', onclick: () => { confirmDemand(d.id, rating, comment.value.trim()); inst.close(); toast('已确认归档', 'ok'); onDone && onDone(); } }, '确认完成')
    ]
  });
}
function openReopenModal(d, onDone) {
  const c = textareaNode({ placeholder: '请说明需要重做的原因', rows: '3' });
  const inst = openModal({
    title: '退回重做', narrow: true,
    body: fgroup('退回原因', c, '退回后该需求会回到「处理中」，责任人需重新提交处理结果', true),
    footer: [
      h('button', { class: 'btn', onclick: () => inst.close() }, '取消'),
      h('button', {
        class: 'btn btn-danger', onclick: () => {
          if (!c.value.trim()) { toast('请填写退回原因', 'err'); return; }
          reopenDemand(d.id, c.value.trim()); inst.close(); toast('已退回，等待重新处理'); onDone && onDone();
        }
      }, '确认退回')
    ]
  });
}

/* =========================================================
   提交通讯录页面（门店 / 管理公司共用）
   ========================================================= */
function pageContacts() {
  const wrap = h('div');
  let kw = '';
  let deptFilter = 'all';

  const search = inputNode({ placeholder: '搜索姓名 / 部门 / 负责工作 / 电话', oninput: e => { kw = e.target.value.trim(); paint(); } });
  const toolBar = h('div', { class: 'row', style: { marginBottom: '12px', flexWrap: 'wrap', gap: '10px', alignItems: 'center' } }, [
    h('div', { style: { width: '260px' } }, search),
    canEditContacts() ? h('button', { class: 'btn btn-primary btn-sm m2-hide-mobile', onclick: () => openContactEditor(null, paint) }, '+ 新增联系人') : null
  ]);
  const deptBar = h('div', { class: 'tabs' });
  const listBox = h('div');

  function deptCount(d) { return state.contacts.filter(c => c.dept === d).length; }
  function paintBar() {
    clear(deptBar);
    const mk = (key, label, n) => h('div', {
      class: 'tab' + (deptFilter === key ? ' active' : ''), onclick: () => { deptFilter = key; paint(); }
    }, [label, n !== null ? h('span', { class: 'cnt' }, String(n)) : null]);
    deptBar.appendChild(mk('all', '全部', state.contacts.length));
    /* 除固定部门外，把「门店」「总部」这类来自账号同步的分组也列成 tab，否则筛不到 */
    const extra = Array.from(new Set(state.contacts.map(c => c.dept))).filter(d => d && !state.departments.includes(d));
    state.departments.concat(extra).forEach(d => deptBar.appendChild(mk(d, d, deptCount(d))));
  }
  function match(c) {
    if (deptFilter !== 'all' && c.dept !== deptFilter) return false;
    if (!kw) return true;
    const s = (c.name + c.dept + c.title + c.duty + c.phone + c.wechat + c.email).toLowerCase();
    return s.indexOf(kw.toLowerCase()) >= 0;
  }
  function paint() {
    paintBar();
    clear(listBox);
    const hit = state.contacts.filter(match);
    if (!hit.length) { listBox.appendChild(emptyNode('没有匹配的联系人', '🔍')); return; }
    const byDept = {};
    hit.forEach(c => { (byDept[c.dept] = byDept[c.dept] || []).push(c); });
    state.departments.concat(Object.keys(byDept).filter(d => !state.departments.includes(d))).forEach(dep => {
      if (!byDept[dep]) return;
      const block = h('div', { class: 'dept-block' });
      block.appendChild(h('h4', { class: 'dept-title' }, [
        h('span', { class: 'dt-badge', text: dep }),
        h('span', { style: { color: 'var(--text-3)', fontWeight: '400', fontSize: '12px' }, text: byDept[dep].length + ' 人' })
      ]));
      const grid = h('div', { class: 'contact-grid' });
      byDept[dep].forEach(c => {
        const color = DEPT_COLOR[c.dept] || 'var(--brand)';
        const card = h('div', { class: 'contact-card' }, [
          h('div', { class: 'cc-top' }, [
            h('div', { class: 'cc-av', style: { background: color }, text: c.name.slice(0, 1) }),
            h('div', { style: { flex: '1', minWidth: '0' } }, [
              h('div', { class: 'cc-name' }, [
                c.name,
                h('span', { style: { fontWeight: '400', fontSize: '11.5px', color: 'var(--text-3)', marginLeft: '7px' }, text: c.title })
              ]),
              h('div', { class: 'cc-title', text: c.dept })
            ]),
            canEditContacts() ? h('button', { class: 'btn btn-xs', onclick: () => openContactEditor(c, paint) }, '编辑') : null
          ]),
          h('div', { class: 'cc-duty', text: c.duty || '—' }),
          h('div', { class: 'cc-cs' }, [
            h('span', { onclick: () => copyText(c.phone) }, '📞 ' + c.phone),
            c.wechat ? h('span', { onclick: () => copyText(c.wechat) }, '💬 微信：' + c.wechat) : null,
            c.email ? h('span', { onclick: () => copyText(c.email) }, '✉ ' + c.email) : null
          ])
        ]);
        grid.appendChild(card);
      });
      block.appendChild(grid);
      listBox.appendChild(block);
    });
  }
  paint();
  wrap.appendChild(toolBar); wrap.appendChild(deptBar); wrap.appendChild(listBox);
  return wrap;
}

function openContactEditor(c, onDone) {
  const isNew = !c;
  c = c || { name: '', dept: '人事部', title: '', duty: '', phone: '', wechat: '', email: '' };
  const ref = {
    name: inputNode({ value: c.name }), title: inputNode({ value: c.title }),
    phone: inputNode({ value: c.phone }), wechat: inputNode({ value: c.wechat }),
    email: inputNode({ value: c.email })
  };
  const deptSel = selectNode(state.departments.map(d => ({ v: d, t: d })), c.dept);
  const duty = textareaNode({ rows: '3', placeholder: '例如：门店招聘与排班、考勤与绩效核算、通讯录维护', value: c.duty || '' });
  const inst = openModal({
    title: isNew ? '新增联系人' : '编辑联系人', narrow: false,
    body: h('div', { class: 'fgrid c2' }, [
      fgroup('姓名', ref.name, null, true),
      fgroup('部门', deptSel, null, true),
      fgroup('职务', ref.title),
      fgroup('联系电话', ref.phone),
      fgroup('微信', ref.wechat),
      fgroup('邮箱', ref.email)
    ].concat([
      h('div', { class: 'fgroup', style: { gridColumn: '1 / -1' } }, [
        h('label', {}, ['负责工作 ', h('span', { class: 'req' }, '*')]), duty,
        h('div', { class: 'fhint', text: '写清楚「什么事找谁」，门店同事按这一栏判断该联系谁' })
      ])
    ])),
    footer: [
      !isNew ? h('button', {
        class: 'btn btn-danger', style: { marginRight: 'auto' }, onclick: () => {
          confirmDialog({
            title: '删除联系人', message: '确定删除「' + c.name + '」的联系方式？', danger: true, okText: '删除',
            onOk: () => { removeContact(c.id); inst.close(); toast('已删除'); onDone && onDone(); }
          });
        }
      }, '删除') : null,
      h('button', { class: 'btn', onclick: () => inst.close() }, '取消'),
      h('button', {
        class: 'btn btn-primary', onclick: () => {
          if (!ref.name.value.trim()) { toast('请填写姓名', 'err'); return; }
          if (!duty.value.trim()) { toast('请填写负责工作', 'err'); return; }
          upsertContact({
            id: c.id, name: ref.name.value.trim(), dept: deptSel.value, title: ref.title.value.trim(),
            duty: duty.value.trim(), phone: ref.phone.value.trim(), wechat: ref.wechat.value.trim(), email: ref.email.value.trim()
          });
          inst.close(); toast(isNew ? '已新增联系人' : '已保存'); onDone && onDone();
        }
      }, '保存')
    ]
  });
}

/* =========================================================
   门店端页面
   ========================================================= */
function pageStoreTasks() {
  const wrap = h('div');
  const filterSet = new Set();    // 状态多选（空 = 全部）
  const creatorSet = new Set();   // 发布人多选（空 = 全部）
  let period = 'today';           // today | week | month | all（周期筛选，不再拆成 4 个页面）
  let cycleFilter = 'all';        // all | daily | weekly | monthly | once（专项任务并入本页）

  const periodBar = h('div', { class: 'tabs period-tabs' });
  const filterBar = h('div', { style: { marginBottom: '10px' } });
  const tabsBar = h('div', { class: 'tabs' });
  const listBox = h('div');
  /* 筛选行标签（与发布人筛选行同宽，保证选项左对齐） */
  const statusLabel = h('div', { class: 'frow' }, [h('span', { class: 'flabel', text: '任务状态（可多选）：' })]);

  /** 本店全部在用任务的发布人（去重） */
  function creatorOptions() {
    const map = {};
    state.tasks.forEach(t => {
      if (t.status !== 'active' || !t.storeIds.includes(me.id)) return;
      if (!map[t.creatorId]) map[t.creatorId] = { v: t.creatorId, t: t.creatorName + '（' + t.dept + '）' };
    });
    return Object.values(map).sort((a, b) => a.t.localeCompare(b.t, 'zh'));
  }

  /** 按周期取实例：分桶互斥，一个任务只属于一个周期。
      今日 = 今天到期（含逾期），本周 = 本周剩余几天到期，本月 = 本月剩余周到期，全部 = 所有。
      2026-10-29 用户要求：本周不再包含今日，本月不再包含本周。 */
  function periodItems(p) {
    const b = storeBuckets(me.id, new Date());
    if (p === 'today') return b.today.slice();
    if (p === 'week') return b.week.slice();
    if (p === 'month') return b.month.slice();
    return b.today.concat(b.week, b.month, b.future);
  }
  /** 应用发布人筛选后的基础列表（按状态与截止时间统一排序） */
  function baseItems() {
    let items = periodItems(period);
    if (creatorSet.size) items = items.filter(x => creatorSet.has(x.task.creatorId));
    return items.sort((a, b) => (ST_ORDER[a.status] - ST_ORDER[b.status]) || (a.due - b.due));
  }
  /* 专项任务（cycle=once）的实例：与原来独立页同一套取数 */
  function onceItems() {
    const nowD = new Date();
    const out = [];
    state.tasks.forEach(t => {
      if (t.status !== 'active' || t.cycle !== 'once' || !t.storeIds.includes(me.id)) return;
      if (creatorSet.size && !creatorSet.has(t.creatorId)) return;
      const due = new Date(t.deadline);
      const key = occKey(t, due);
      const rec = getRecord(t.id, me.id, key);
      out.push({ task: t, due: due, key: key, rec: rec, status: occStatus(due, t, rec, nowD) });
    });
    const w = x => (x.status === 'done' || x.status === 'late') ? 1 : 0;
    return out.sort((a, b) => (w(a) - w(b)) || (w(a) ? new Date(b.due) - new Date(a.due) : a.due - b.due));
  }

  function data() {
    let items = cycleFilter === 'once' ? onceItems() : baseItems();
    if (filterSet.size) {
      const stOk = x => x.status === 'done' || x.status === 'late';
      items = items.filter(x =>
        (filterSet.has('unfinished') && !stOk(x)) ||
        (filterSet.has('finished') && stOk(x)) ||
        filterSet.has(x.status));
    }
    return items;
  }

  function paint() {
    /* 周期筛选：今日 / 本周 / 本月 / 全部（专项任务不受周期影响，选中时隐藏） */
    clear(periodBar);
    [['today', '今日'], ['week', '本周'], ['month', '本月'], ['all', '全部']].forEach(([k, label]) => {
      periodBar.appendChild(h('div', {
        class: 'tab' + (period === k && cycleFilter !== 'once' ? ' active' : ''),
        onclick: () => { period = k; cycleFilter = 'all'; filterSet.clear(); paint(); }
      }, [h('span', { text: label }), h('span', { class: 'cnt' }, String(periodItems(k).length))]));
    });
    /* 专项任务：作为周期条最右一个选项，点了只看专项任务 */
    periodBar.appendChild(h('div', {
      class: 'tab' + (cycleFilter === 'once' ? ' active' : ''),
      onclick: () => { cycleFilter = cycleFilter === 'once' ? 'all' : 'once'; filterSet.clear(); paint(); }
    }, [h('span', { text: '专项' }), h('span', { class: 'cnt' }, String(onceItems().length))]));
    /* 选中项若被挤到屏幕外，自动滚进视野 */
    const activeTab = periodBar.querySelector('.tab.active');
    if (activeTab && activeTab.scrollIntoView) activeTab.scrollIntoView({ inline: 'nearest', block: 'nearest' });

    /* 发布人多选 chips */
    clear(filterBar);
    filterBar.appendChild(h('div', { class: 'frow' }, [
      h('span', { class: 'flabel', text: '任务发布人（可多选）：' }),
      creatorSet.size ? h('button', { class: 'btn btn-xs', onclick: () => { creatorSet.clear(); paint(); } }, '× 清除') : null,
      h('button', { class: 'btn btn-xs', style: { marginLeft: 'auto' }, onclick: () => { paint(); toast('已刷新'); } }, '↻ 刷新')
    ]));
    const opts = creatorOptions();
    if (opts.length) {
      filterBar.appendChild(chipMulti(opts, creatorSet, paint));
    } else {
      filterBar.appendChild(h('span', { class: 'fhint', text: '暂无任务' }));
    }

    const base = baseItems();
    const doneN = base.filter(x => x.status === 'done' || x.status === 'late').length;
    const overdueN = base.filter(x => x.status === 'overdue').length;
    const dueN = base.filter(x => x.status === 'due').length;
    clear(tabsBar);
    const defs = [
      ['unfinished', '未完成', base.length - doneN],
      ['due', '即将到期', dueN],
      ['overdue', '已逾期', overdueN],
      ['finished', '已完成', doneN]
    ];
    tabsBar.appendChild(h('div', {
      class: 'tab' + (filterSet.size === 0 ? ' active' : ''),
      onclick: () => { filterSet.clear(); paint(); }
    }, [h('span', { text: '全部状态' }), h('span', { class: 'cnt' }, String(base.length))]));
    defs.forEach(([k, label, n]) => tabsBar.appendChild(h('div', {
      class: 'tab' + (filterSet.has(k) ? ' active' : ''), onclick: () => { filterSet.has(k) ? filterSet.delete(k) : filterSet.add(k); paint(); }
    }, [label, h('span', { class: 'cnt' }, String(n))])));

    const items = data();
    clear(listBox);
    if (!items.length) {
      listBox.appendChild(emptyNode(
        creatorSet.size ? '所选发布人在本期没有符合条件的任务'
          : (filterSet.size === 0 ? '本期没有任务，先休息一下吧' : '当前筛选下没有任务'), '✅'));
    } else {
      listBox.appendChild(taskList(items));
    }
  }
  function taskList(items) {
    const l = h('div', { class: 'task-list' });
    items.forEach(it => l.appendChild(renderTaskCard(it, { mode: 'store', onDone: paint })));
    return l;
  }

  paint();
  wrap.appendChild(periodBar); wrap.appendChild(filterBar); wrap.appendChild(statusLabel); wrap.appendChild(tabsBar); wrap.appendChild(listBox);
  return wrap;
}

/* ---------------- 专项任务（与其他任务页同构的列表页） ---------------- */
function pageAllTasks() {
  const wrap = h('div');
  const filterSet = new Set();    // 状态多选（空 = 全部）
  const creatorSet = new Set();   // 发布人多选（空 = 全部）

  const filterBar = h('div', { style: { marginBottom: '10px' } });
  const tabsBar = h('div', { class: 'tabs' });
  const listBox = h('div');
  /* 筛选行标签（与发布人筛选行同宽，保证选项左对齐） */
  const statusLabel = h('div', { class: 'frow' }, [h('span', { class: 'flabel', text: '任务状态（可多选）：' })]);

  function creatorOptions() {
    const map = {};
    state.tasks.forEach(t => {
      if (t.status !== 'active' || t.cycle !== 'once' || !t.storeIds.includes(me.id)) return;
      if (!map[t.creatorId]) map[t.creatorId] = { v: t.creatorId, t: t.creatorName + '（' + t.dept + '）' };
    });
    return Object.values(map).sort((a, b) => a.t.localeCompare(b.t, 'zh'));
  }

  /** 本店全部专项任务实例：未完成在前（按截止时间升序），已完成在后（倒序） */
  function allItems() {
    const nowD = new Date();
    const out = [];
    state.tasks.forEach(t => {
      if (t.status !== 'active' || t.cycle !== 'once' || !t.storeIds.includes(me.id)) return;
      if (creatorSet.size && !creatorSet.has(t.creatorId)) return;
      const due = new Date(t.deadline);
      const key = occKey(t, due);
      const rec = getRecord(t.id, me.id, key);
      out.push({ task: t, due: due, key: key, rec: rec, status: occStatus(due, t, rec, nowD) });
    });
    const w = x => (x.status === 'done' || x.status === 'late') ? 1 : 0;
    return out.sort((a, b) => (w(a) - w(b)) || (w(a) ? new Date(b.due) - new Date(a.due) : a.due - b.due));
  }

  function paint() {
    /* 发布人多选 chips */
    clear(filterBar);
    filterBar.appendChild(h('div', { class: 'frow' }, [
      h('span', { class: 'flabel', text: '任务发布人（可多选）：' }),
      creatorSet.size ? h('button', { class: 'btn btn-xs', onclick: () => { creatorSet.clear(); paint(); } }, '× 清除') : null,
      h('button', { class: 'btn btn-xs', style: { marginLeft: 'auto' }, onclick: () => { paint(); toast('已刷新'); } }, '↻ 刷新')
    ]));
    const opts = creatorOptions();
    filterBar.appendChild(opts.length ? chipMulti(opts, creatorSet, paint) : h('span', { class: 'fhint', text: '暂无专项任务' }));

    /* 状态多选页签 */
    const base = allItems();
    const doneN = base.filter(x => x.status === 'done' || x.status === 'late').length;
    const overdueN = base.filter(x => x.status === 'overdue').length;
    const dueN = base.filter(x => x.status === 'due').length;
    clear(tabsBar);
    const defs = [
      ['unfinished', '未完成', base.length - doneN],
      ['due', '即将到期', dueN],
      ['overdue', '已逾期', overdueN],
      ['finished', '已完成', doneN]
    ];
    tabsBar.appendChild(h('div', {
      class: 'tab' + (filterSet.size === 0 ? ' active' : ''),
      onclick: () => { filterSet.clear(); paint(); }
    }, [h('span', { text: '全部状态' }), h('span', { class: 'cnt' }, String(base.length))]));
    defs.forEach(([k, label, n]) => tabsBar.appendChild(h('div', {
      class: 'tab' + (filterSet.has(k) ? ' active' : ''), onclick: () => { filterSet.has(k) ? filterSet.delete(k) : filterSet.add(k); paint(); }
    }, [label, h('span', { class: 'cnt' }, String(n))])));

    const stOk = x => x.status === 'done' || x.status === 'late';
    let items = base;
    if (filterSet.size) {
      items = base.filter(x =>
        (filterSet.has('unfinished') && !stOk(x)) ||
        (filterSet.has('finished') && stOk(x)) ||
        filterSet.has(x.status));
    }
    clear(listBox);
    if (!items.length) {
      listBox.appendChild(emptyNode(creatorSet.size || filterSet.size ? '当前筛选下没有专项任务' : '暂无专项任务；每日 / 每周 / 每月必做请看对应任务页', '🎯'));
    } else {
      const l = h('div', { class: 'task-list' });
      items.forEach(it => l.appendChild(renderTaskCard(it, { mode: 'store', onDone: paint })));
      listBox.appendChild(l);
      listBox.appendChild(h('p', { class: 'fhint', style: { margin: '10px 2px 0' } },
        '未完成的专项任务按截止时间置顶；每日 / 每周 / 每月必做请看对应任务页'));
    }
  }

  paint();
  wrap.appendChild(filterBar); wrap.appendChild(statusLabel); wrap.appendChild(tabsBar); wrap.appendChild(listBox);
  return wrap;
}

/* ---------------- 我的提需 ---------------- */
function pageMyDemands() {
  const wrap = h('div');
  const groupSet = new Set();   // 状态多选（空 = 全部）
  const statBox = h('div');
  const tabsBar = h('div', { class: 'tabs' });
  const listBox = h('div');
  const GROUP = {
    pending: d => d.status === 'pending',
    doing: d => d.status === 'approved' || d.status === 'assigned',
    done: d => d.status === 'completed' || d.status === 'confirmed',
    rejected: d => d.status === 'rejected',
    archived: d => !!d.archivedAt
  };
  const GROUP_DEFS = [['pending', '待评估'], ['doing', '处理中'], ['done', '已完成'], ['rejected', '已驳回'], ['archived', '已归档']];
  /* 多个状态取并集 */
  const passFilter = d => groupSet.size === 0 || GROUP_DEFS.some(([k]) => groupSet.has(k) && GROUP[k](d));
  function paint() {
    /* 默认不含归档；选中「已归档」时只看归档的 */
    const allMine = state.demands.filter(d => !d.deletedAt && d.storeId === me.id);
    const mine = allMine.filter(d => groupSet.has('archived') ? !!d.archivedAt : !d.archivedAt);
    clear(statBox);
    statBox.appendChild(statRow(4, [
      statNode(String(mine.length), '累计提交需求'),
      statNode(String(mine.filter(GROUP.pending).length), '待管委会评估', 'info'),
      statNode(String(mine.filter(GROUP.doing).length), '处理中', 'warn'),
      statNode(String(mine.filter(GROUP.done).length), '已解决归档', 'ok')
    ]));
    clear(tabsBar);
    tabsBar.appendChild(h('div', {
      class: 'tab' + (groupSet.size === 0 ? ' active' : ''),
      onclick: () => { groupSet.clear(); paint(); }
    }, [h('span', { text: '全部状态' }), h('span', { class: 'cnt' }, String(mine.length))]));
    GROUP_DEFS.forEach(([k, l]) => {
      tabsBar.appendChild(h('div', {
        class: 'tab' + (groupSet.has(k) ? ' active' : ''),
        onclick: () => { groupSet.has(k) ? groupSet.delete(k) : groupSet.add(k); paint(); }
      }, [l, h('span', { class: 'cnt' }, String(allMine.filter(GROUP[k]).length))]));
    });
    const list = mine.filter(passFilter).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    clear(listBox);
    if (!list.length) listBox.appendChild(emptyNode(groupSet.size ? '所选状态下没有需求' : '这里还没有需求记录', '✉'));
    else {
      const l = h('div', { class: 'task-list' });
      list.forEach(d => l.appendChild(renderDemandCard(d, {
        onDeleted: paint,
        onClick: () => openDemandDetail(findDemand(d.id), { allowStoreConfirm: true, onAction: paint })
      })));
      listBox.appendChild(l);
    }
  }
  const toolBar = h('div', { class: 'row', style: { marginBottom: '12px' } }, [
    h('button', { class: 'btn btn-primary', style: { marginLeft: 'auto' }, onclick: () => openNewDemandModal(paint) }, '+ 提交新需求')
  ]);
  paint();
  wrap.appendChild(toolBar); wrap.appendChild(statBox); wrap.appendChild(tabsBar); wrap.appendChild(listBox);
  return wrap;
}

/* existing 有值 = 驳回后修改重提（预填原内容，保存后回到待评估） */
function openNewDemandModal(onDone, existing) {
  const isEdit = !!existing;
  const title = inputNode({ value: isEdit ? existing.title : '', placeholder: '一句话说清需求，例如：申请增加一台卡牌补货展示柜' });
  const desc = textareaNode({ rows: '5', value: isEdit ? existing.desc : '', placeholder: '背景 + 具体诉求 + 期望结果，写得越具体，管委会评估越快' });
  const deptSel = selectNode([{ v: '', t: '不限部门（由管委会决定）' }].concat(state.departments.map(d => ({ v: d, t: d }))), isEdit ? (existing.targetDept || '') : '');
  const images = isEdit && existing.images ? existing.images.slice() : [];
  const links = isEdit && existing.links ? existing.links.slice() : [];
  const inst = openModal({
    title: isEdit ? '修改需求' : '提交新需求',
    sub: isEdit ? '原需求被驳回，修改后将重新进入待评估，管委会会重新审核' : '提交后由管委会成员评估，通过即派发责任人',
    body: h('div', {}, [
      fgroup('需求标题', title, null, true),
      fgroup('需求描述', desc, '建议写明：现状 / 影响 / 期望解决方式 / 期望时间', true),
      fgroup('期望对接部门', deptSel, '不确定可留空，由管委会指定'),
      fgroup('图片（可选）', imgUploader(images, null, 6)),
      fgroup('相关链接（可选）', linkEditor(links, null))
    ]),
    footer: [
      h('button', { class: 'btn', onclick: () => inst.close() }, '取消'),
      h('button', {
        class: 'btn btn-primary', onclick: () => {
          if (!title.value.trim()) { toast('请填写需求标题', 'err'); return; }
          if (!desc.value.trim()) { toast('请填写需求描述', 'err'); return; }
          const payload = {
            title: title.value.trim(), desc: desc.value.trim(), targetDept: deptSel.value,
            images: images.slice(), links: links.filter(l => l.url)
          };
          if (isEdit) {
            resubmitDemand(existing.id, payload);
            inst.close();
            toast('已修改并重新提交，等待管委会重新评估', 'ok');
          } else {
            createDemand(payload);
            inst.close();
            toast('需求已提交，等待管委会评估', 'ok');
          }
          onDone && onDone();
        }
      }, isEdit ? '保存并重新提交' : '提交需求')
    ]
  });
}

/* ---------------- 门店数据 ---------------- */
function pageStoreStats() {
  const wrap = h('div');
  let days = 30;
  const body = h('div');
  function paint() {
    clear(body);
    const c = storeCompletion(me.id, days);
    const ov = companyOverview(days);
    const rank = ov.rows.slice().sort((a, b) => b.rate - a.rate);
    const myRank = rank.findIndex(r => r.storeId === me.id) + 1;
    const acfg = getAssessCfg();
    const asc = storeAssessScore(c, acfg);

    if (M2()) {
      /* 手机端：结论先行（考核得分 + 排名），其余数字分两组、各一行 */
      body.appendChild(h('div', { class: 'm2-hero' }, [
        h('div', { class: 'mh-top' }, [
          h('span', { class: 'mh-k', text: '考核得分' }),
          h('span', { class: 'mh-v ' + (asc.pass ? 'ok' : 'bad'), text: asc.pass ? '合格' : '不合格' })
        ]),
        h('div', { class: 'mh-num' }, [h('b', {}, String(asc.total)), h('span', { text: ' 分' })]),
        h('div', { class: 'mh-sub', text: '全区完成率排名 ' + myRank + ' / ' + ov.rows.length })
      ]));
      body.appendChild(h('div', { class: 'm2-sec', text: '本周期任务' }));
      body.appendChild(h('div', { class: 'm2-inline' }, [
        h('span', { class: 'mi' }, [h('span', { class: 'mk', text: '应完成' }), h('span', { class: 'mv', text: String(c.expected) })]),
        h('span', { class: 'mi' }, [h('span', { class: 'mk', text: '已完成' }), h('span', { class: 'mv', text: String(c.done) })]),
        h('span', { class: 'mi' }, [h('span', { class: 'mk', text: '完成率' }), h('span', { class: 'mv', text: c.rate.toFixed(1) + '%' })]),
        h('span', { class: 'mi' }, [h('span', { class: 'mk', text: '按时率' }), h('span', { class: 'mv', text: c.ontimeRate.toFixed(1) + '%' })])
      ]));
    } else body.appendChild(statRow(6, [
      statNode(String(c.expected), '应完成任务数（近' + days + '天）'),
      statNode(String(c.done), '已完成', 'ok'),
      statNode(c.rate.toFixed(1) + '%', '完成率', c.rate >= 90 ? 'ok' : c.rate >= 75 ? 'warn' : 'danger'),
      statNode(c.ontimeRate.toFixed(1) + '%', '按时完成率', c.ontimeRate >= 85 ? 'ok' : c.ontimeRate >= 70 ? 'warn' : 'danger'),
      statNode(myRank + ' / ' + ov.rows.length, '全区完成率排名', myRank <= 2 ? 'ok' : myRank > ov.rows.length - 2 ? 'danger' : 'info'),
      statNode(asc.total + ' 分', '考核得分（' + (asc.pass ? '≥' + acfg.passLine + ' 合格' : '不合格') + '）', asc.pass ? 'ok' : 'danger')
    ]));
    body.appendChild(h('div', { class: 'fhint', style: { margin: '-4px 0 4px' },
      text: '得分 = 基础 ' + asc.basePart + ' + 完成率得分 ' + asc.cScore.toFixed(1) + ' + 按时率得分 ' + asc.oScore.toFixed(1)
        + ' − 扣分 ' + asc.deduct + '（逾期提交 ' + asc.lateN + ' 次、逾期未交 ' + asc.missN + ' 次）· 规则由管理公司在「考核设置」中配置' }));

    const grid = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' } });
    grid.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'card-head' }, [h('div', {}, [h('h3', {}, '各周期完成率')])]),
      h('div', { class: 'card-body' }, barChart([
        { name: '每日必做', value: c.byCycle.daily.rate, text: c.byCycle.daily.rate.toFixed(1) + '%　(' + c.byCycle.daily.done + '/' + c.byCycle.daily.expected + ')' },
        { name: '每周必做', value: c.byCycle.weekly.rate, text: c.byCycle.weekly.rate.toFixed(1) + '%　(' + c.byCycle.weekly.done + '/' + c.byCycle.weekly.expected + ')', color: 'var(--brand)' },
        { name: '每月必做', value: c.byCycle.monthly.rate, text: c.byCycle.monthly.rate.toFixed(1) + '%　(' + c.byCycle.monthly.done + '/' + c.byCycle.monthly.expected + ')', color: 'var(--brand)' },
        { name: '专项任务', value: c.byCycle.once.rate, text: c.byCycle.once.rate.toFixed(1) + '%　(' + c.byCycle.once.done + '/' + c.byCycle.once.expected + ')', color: 'var(--brand)' }
      ], { max: 100 }))
    ]));
    grid.appendChild(h('div', { class: 'card' }, [
      h('div', { class: 'card-head' }, [h('div', {}, [h('h3', {}, '任务结果构成')])]),
      h('div', { class: 'card-body' }, donutChart([
        { label: '按时完成', value: c.ontime, color: 'var(--ok)' },
        { label: '逾期完成', value: c.late, color: 'var(--warn)' },
        { label: '未完成/逾期未交', value: c.missed, color: 'var(--danger)' }
      ], { centerLabel: '任务实例' }))
    ]));
    body.appendChild(h('div', { class: 'mt14' }, grid));

    const tr = c.trend.slice(-14);
    body.appendChild(h('div', { class: 'card mt14' }, [
      h('div', { class: 'card-head' }, [
        h('div', {}, [h('h3', {}, '近 14 天每日完成率')]),
        h('span', { class: 'cd', text: '柱高 = 当日应完成任务的完成比例' })
      ]),
      h('div', { class: 'card-body' }, [
        sparkNode(tr.map(t => ({ label: t.day, v: pct(t.done, t.expected) }))),
        h('div', { class: 'row', style: { justifyContent: 'space-between', marginTop: '7px' } },
          tr.map(t => h('span', { style: { flex: '1', textAlign: 'center', fontSize: '9.5px', color: 'var(--text-3)' }, text: t.day.slice(5) })))
      ])
    ]));

    const tbl = h('table', { class: 'tbl' }, [
      h('thead', {}, h('tr', {}, [h('th', {}, '门店'), h('th', {}, '城市'), h('th', { class: 'num' }, '应完成'), h('th', { class: 'num' }, '已完成'), h('th', { class: 'num' }, '完成率'), h('th', { class: 'num' }, '按时率'), h('th', { class: 'num' }, '逾期完成'), h('th', { class: 'num' }, '未完成')])),
      h('tbody', {}, rank.map(r => h('tr', { style: r.storeId === me.id ? { background: 'var(--brand-50)', fontWeight: '600' } : null }, [
        h('td', {}, r.store.name + (r.storeId === me.id ? '（本店）' : '')),
        h('td', {}, r.city),
        h('td', { class: 'num' }, String(r.expected)),
        h('td', { class: 'num' }, String(r.done)),
        h('td', { class: 'num' }, r.rate.toFixed(1) + '%'),
        h('td', { class: 'num' }, r.ontimeRate.toFixed(1) + '%'),
        h('td', { class: 'num' }, String(r.late)),
        h('td', { class: 'num' }, String(r.missed))
      ])))
    ]);
    body.appendChild(h('div', { class: 'sub-group' }, [h('h4', {}, '全区门店完成情况对比'), h('div', { class: 'tbl-wrap' }, tbl)]));
  }
  const toolBar = h('div', { class: 'row', style: { marginBottom: '12px', flexWrap: 'wrap', gap: '10px', alignItems: 'center' } }, [
    selectNode([{ v: 7, t: '近 7 天' }, { v: 30, t: '近 30 天' }, { v: 60, t: '近 60 天' }], days, {
      style: { width: '130px' }, onchange: e => { days = Number(e.target.value); paint(); }
    }),
    h('button', { class: 'btn btn-sm', style: { marginLeft: 'auto' }, onclick: exportStoreStats }, '导出 CSV')
  ]);
  paint();
  wrap.appendChild(toolBar); wrap.appendChild(body);
  return wrap;
}
function exportStoreStats() {
  const days = 30;
  const rows = [['门店', '城市', '应完成', '已完成', '完成率%', '按时完成', '按时率%', '逾期完成', '未完成']];
  companyOverview(days).rows.forEach(r => rows.push([r.store.name, r.city, r.expected, r.done, r.rate.toFixed(1), r.ontime, r.ontimeRate.toFixed(1), r.late, r.missed]));
  downloadText('门店任务完成情况_' + ymd(new Date()) + '.csv', toCsv(rows));
  toast('已导出 CSV', 'ok');
}

/* ---------------- 门店端路由表 ---------------- */
const PAGE_STORE = {
  tasks: () => pageStoreTasks(),
  more: () => pageMore(),
  once: () => pageAllTasks(),
  demands: () => pageMyDemands(),
  contacts: () => pageContacts(),
  mystats: () => pageStoreStats()
};

/* ---------------- 更多（手机端未放进底部导航的页面） ---------------- */
function pageMore() {
  const wrap = h('div');
  const items = isStore()
    ? [['mystats', '我的数据', '任务完成率、按时率、考核得分']]
    : [['hq-contacts', '通讯录', '各部门对接人与电话'],
       ['hq-stats', '数据统计与考核', '全区完成率、门店排名与考核规则'],
       ['admin', '管理员后台', '门店与分区 · 账号（手机端只读）']];
  const list = h('div', { class: 'more-list' });
  items.forEach(([id, name, desc]) => {
    list.appendChild(h('div', { class: 'more-row', onclick: () => go(id) }, [
      h('div', { class: 'mr-body' }, [
        h('div', { class: 'mr-n', text: name }),
        h('div', { class: 'mr-d', text: desc })
      ]),
      h('span', { class: 'mr-go', text: '\u203a' })
    ]));
  });
  wrap.appendChild(list);
  wrap.appendChild(h('p', { class: 'fhint', style: { margin: '12px 2px 0' } },
    isStore() ? '其余页面在底部导航里' : '通讯录、数据统计、管理员后台放在这里；常用三页在底部导航'));
  return wrap;
}
