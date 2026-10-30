/* =========================================================
   validate.js — 逐行校验 + 重复检测
   铁律（2026-10-28 用户拍板）：
     · 只要有一行不合格，整批不生效（不会导一半）
     · 与系统里已有任务「任务定义全部字段」一致 = 重复，同样整批失败
     · 同一份文件里两行完全一样，也是重复
   ========================================================= */
const {
  toParts, ymdOf, hmOf, parseCycle, parseWeekday, parseIntLoose, parsePriority,
  parseBool, parseStores, taskSignature,
} = require('./schema');

const CYCLE_LABEL = { daily: '每日', weekly: '每周', monthly: '每月', once: '专项' };
const WD_LABEL = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 把 HH:mm 拼回本地 Date（用于专项任务的 deadline） */
function buildDeadline(parts) {
  if (!parts || !parts.y) return null;
  return new Date(parts.y, parts.m - 1, parts.d, parts.H || 0, parts.M || 0, 0, 0);
}

function validate(all, ctx) {
  const { map, rows } = all;
  const cell = (cells, key) => (map[key] === undefined ? null : cells[map[key]]);

  const existing = new Map();
  (ctx.existingTasks || []).forEach((t) => {
    const sig = taskSignature(t);
    if (!existing.has(sig)) existing.set(sig, t);
  });
  const inFile = new Map();   // 本文件内签名 → 首行行号

  const out = [];
  rows.forEach(({ rowNo, cells }) => {
    const errors = [];
    let dup = null;

    /* ---------- 基础文本 ---------- */
    const title = String(cell(cells, 'title') == null ? '' : cell(cells, 'title')).trim();
    const content = String(cell(cells, 'content') == null ? '' : cell(cells, 'content')).trim();
    if (!title) errors.push('任务标题为空');
    else if (title.length > 60) errors.push('任务标题超过 60 字');
    if (!content) errors.push('任务说明为空');
    else if (content.length > 2000) errors.push('任务说明超过 2000 字');

    /* ---------- 类型 ---------- */
    const cycleRaw = cell(cells, 'cycleRaw');
    const cycle = parseCycle(cycleRaw);
    if (!cycle) {
      errors.push(cycleRaw == null || String(cycleRaw).trim() === ''
        ? '任务类型未填'
        : `任务类型「${String(cycleRaw).trim()}」无法识别（只能是 每日/每周/每月/专项）`);
    }

    /* ---------- 时间 ---------- */
    const dParts = toParts(cell(cells, 'deadlineRaw'));
    const tParts = toParts(cell(cells, 'timeRaw'));
    let time = '';
    let deadline = null;

    if (cycle === 'once') {
      if (!dParts || !dParts.y) {
        errors.push('专项任务必须填「截止时间」（格式 2026-11-05 18:00）');
      } else {
        const dl = buildDeadline(dParts);
        if (!dl || isNaN(dl.getTime())) errors.push('截止时间格式看不懂');
        else { deadline = dl.toISOString(); time = hmOf(dParts); }
      }
    } else if (cycle) {
      /* 周期任务：截止时刻优先取「截止时刻」列，没填就从「截止时间」里抠 HH:mm */
      const src = (tParts && (tParts.H || tParts.M)) ? tParts : (dParts && dParts.y ? dParts : null);
      if (!src) errors.push('周期任务必须填「截止时刻」（格式 18:00）');
      else time = hmOf(src);
    }

    /* ---------- 周期参数 ---------- */
    let weekday = 0, monthDay = 0;
    if (cycle === 'weekly') {
      const wd = parseWeekday(cell(cells, 'weekdayRaw'));
      if (!wd) errors.push('每周任务必须填「每周几」（周一~周日）');
      else weekday = wd;
    }
    if (cycle === 'monthly') {
      const md = parseIntLoose(cell(cells, 'monthDayRaw'), null);
      if (md === null || md < 1 || md > 31) errors.push('每月任务必须填「每月几号」（1-31）');
      else monthDay = md;
    }

    /* ---------- 门店 ---------- */
    const st = parseStores(cell(cells, 'storesRaw'), ctx.stores, ctx.storeIdx);
    st.errors.forEach((e) => errors.push(e));

    /* ---------- 可选字段 ---------- */
    const prRaw = cell(cells, 'priorityRaw');
    let priority = 3;
    if (prRaw !== null && prRaw !== undefined && String(prRaw).trim() !== '') {
      const p = parsePriority(prRaw);
      if (p === null) errors.push('重要程度只能是 1-5（或 ★~★★★★★）');
      else priority = p;
    }

    const rmRaw = cell(cells, 'remindRaw');
    let remindBeforeMin = 120;
    if (rmRaw !== null && rmRaw !== undefined && String(rmRaw).trim() !== '') {
      const n = parseIntLoose(rmRaw, null);
      if (n === null || n < 0 || n > 10080) errors.push('到期前提醒要在 0-10080 分钟之间');
      else remindBeforeMin = n;
    }

    const remindOverdue = parseBool(cell(cells, 'overdueRaw'), true);

    const startParts = toParts(cell(cells, 'startRaw'));
    const stopParts = toParts(cell(cells, 'stopRaw'));
    const startDate = startParts && startParts.y ? ymdOf(startParts) : todayYmd();
    const stopDate = (cycle !== 'once' && stopParts && stopParts.y) ? ymdOf(stopParts) : null;
    if (stopDate && stopDate < startDate) errors.push('停止日期早于开始日期');

    const links = [];
    const linkRaw = cell(cells, 'linksRaw');
    if (linkRaw !== null && linkRaw !== undefined && String(linkRaw).trim() !== '') {
      String(linkRaw).split(/[\s,，、]+/).filter(Boolean).forEach((u) => {
        if (/^https?:\/\//i.test(u)) { if (!links.some((x) => x.url === u)) links.push({ url: u }); }
        else errors.push(`链接「${u}」不是 http/https 开头`);
      });
    }

    /* ---------- 组装 ---------- */
    const task = {
      title, content, cycle: cycle || '',
      time: time || '',
      weekday, monthDay,
      deadline,
      storeIds: st.ids,
      priority, remindBeforeMin, remindOverdue,
      images: [], links,
      startDate, stopDate,
      dept: (ctx.me && ctx.me.dept) || '',
    };

    /* ---------- 重复 ---------- */
    if (cycle && !errors.length) {
      const sig = taskSignature(task);
      const hit = existing.get(sig);
      const sameRow = inFile.get(sig);
      if (hit) dup = { type: 'existing', task: hit };
      else if (sameRow) dup = { type: 'inFile', rowNo: sameRow };
      else inFile.set(sig, rowNo);
      if (dup) {
        errors.push(dup.type === 'existing'
          ? `与已有任务《${hit.title}》完全一致（标题/说明/类型/时间/门店/星级/提醒/起止/链接全部相同）`
          : `与本文件第 ${sameRow} 行完全一致`);
      }
    }

    out.push({
      rowNo,
      ok: errors.length === 0,
      errors,
      dup,
      task: errors.length ? null : task,
      brief: {
        title: title || '（无标题）',
        cycle: cycle || '',
        cycleLabel: cycle ? CYCLE_LABEL[cycle] : '—',
        storeCount: st.ids.length,
        timeText: cycle === 'once'
          ? (dParts && dParts.y ? ymdOf(dParts) + ' ' + hmOf(dParts) : '—')
          : [time, cycle === 'weekly' ? WD_LABEL[weekday] : '', cycle === 'monthly' ? monthDay + '号' : '']
            .filter(Boolean).join(' '),
      },
    });
  });

  const summary = {
    total: out.length,
    ok: out.filter((r) => r.ok).length,
    bad: out.filter((r) => !r.ok).length,
    dup: out.filter((r) => !!r.dup).length,
    storeTotal: out.filter((r) => r.ok).reduce((a, r) => a + (r.task ? r.task.storeIds.length : 0), 0),
  };
  return { rows: out, summary };
}

module.exports = { validate, CYCLE_LABEL };
