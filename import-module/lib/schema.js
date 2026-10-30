/* =========================================================
   schema.js — 批量导入的「列定义 + 值解析」
   独立模块，不依赖 src/ 下任何业务文件，只依赖 xlsx 的日期工具。
   口径（2026-10-28 与需求方确认）：
     · 一行 = 一个任务；门店写在一列里，顿号/逗号/空格分隔；「全部」= 所有营业门店
     · 四种周期：每日 daily / 每周 weekly / 每月 monthly / 专项 once
     · 门店名认「原名 / 去掉末尾『店』/ 品牌全称」，歧义报错
   ========================================================= */
const XLSX = require('xlsx');

/* ---------------- 列定义 ----------------
   aliases 已做归一化（去空格/去星号/全角括号转半角），和 norm() 保持一致 */
const COLUMNS = [
  { key: 'title', label: '任务标题', required: true, aliases: ['任务标题', '标题', '任务名称', '任务'] },
  { key: 'content', label: '任务说明', required: true, aliases: ['任务说明', '说明', '任务内容', '内容', '要求'] },
  { key: 'cycleRaw', label: '任务类型', required: true, aliases: ['任务类型', '类型', '周期', '周期类型'] },
  { key: 'weekdayRaw', label: '每周几', required: false, aliases: ['每周几', '周几', '星期', '星期几'] },
  { key: 'monthDayRaw', label: '每月几号', required: false, aliases: ['每月几号', '几号', '每月日期'] },
  { key: 'timeRaw', label: '截止时刻', required: false, aliases: ['截止时刻', '截止时间点', '截止时点', '每天截止'] },
  { key: 'deadlineRaw', label: '截止时间', required: false, aliases: ['截止时间', '截止日期', '具体截止时间', '截止'] },
  { key: 'storesRaw', label: '派发门店', required: true, aliases: ['派发门店', '门店', '适用门店', '门店范围', '门店名称'] },
  { key: 'priorityRaw', label: '重要程度', required: false, aliases: ['重要程度', '优先级', '星级', '重要级别'] },
  { key: 'remindRaw', label: '到期前提醒(分钟)', required: false, aliases: ['到期前提醒(分钟)', '到期前提醒', '提前提醒(分钟)', '提前提醒'] },
  { key: 'overdueRaw', label: '过期继续提醒', required: false, aliases: ['过期继续提醒', '过期提醒', '过期是否提醒'] },
  { key: 'startRaw', label: '开始日期', required: false, aliases: ['开始日期', '生效日期', '开始'] },
  { key: 'stopRaw', label: '停止日期', required: false, aliases: ['停止日期', '结束日期', '停止', '结束'] },
  { key: 'linksRaw', label: '相关链接', required: false, aliases: ['相关链接', '链接', '附件链接'] },
];

/** 表头/文本归一化：去所有空白、去星号、全角括号转半角、小写化 */
function norm(v) {
  return String(v == null ? '' : v)
    .replace(/\s+/g, '')
    .replace(/[\*＊]/g, '')
    .replace(/（/g, '(').replace(/）/g, ')')
    .toLowerCase();
}

/* 别名 → 列 key（按 COLUMNS 顺序先到先得，长别名优先参与模糊匹配） */
const ALIAS = (() => {
  const m = new Map();
  COLUMNS.forEach((c) => c.aliases.forEach((a) => { if (!m.has(norm(a))) m.set(norm(a), c.key); }));
  return m;
})();
const ALIAS_BY_LEN = [...ALIAS.keys()].sort((a, b) => b.length - a.length);

/** 表头行 → { key: 列下标 }，容忍改列顺序、多余空列、别名写法 */
function mapHeader(headerRow) {
  const heads = (headerRow || []).map(norm);
  const out = {};
  const usedCols = new Set();

  heads.forEach((h, idx) => {
    if (!h) return;
    const k = ALIAS.get(h);
    if (k && out[k] === undefined) { out[k] = idx; usedCols.add(idx); }
  });
  /* 第二轮：表头里带后缀（如「派发门店(必填)」）时做包含匹配 */
  heads.forEach((h, idx) => {
    if (!h || usedCols.has(idx)) return;
    for (const a of ALIAS_BY_LEN) {
      if (a.length >= 2 && h.indexOf(a) >= 0) {
        const k = ALIAS.get(a);
        if (out[k] === undefined) { out[k] = idx; usedCols.add(idx); }
        return;
      }
    }
  });
  return out;
}

/* ---------------- 值解析 ---------------- */

/** 通用日期/时间部件解析，返回 {y,m,d,H,M} 或 null。数字按 Excel 序列值处理 */
function toParts(v, baseYear) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    return { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate(), H: v.getHours(), M: v.getMinutes() };
  }
  if (typeof v === 'number' && isFinite(v)) {
    const o = XLSX.SSF.parse_date_code(v);
    if (!o) return null;
    return { y: o.y, m: o.m, d: o.d, H: o.H || 0, M: o.M || 0 };
  }
  const s = String(v).trim();
  if (!s) return null;

  /* 🔴 日期、时间必须分两步取。
     曾经写成一条大正则 `…\s*日?(?:[\sT]+(\d{1,2})[:：](\d{1,2}))?`，
     因为时间是**可选组**，`\s*` 先贪婪吃掉空格后可选组匹配失败 →
     正则引擎直接跳过可选组、在日期处"成功结束"，18:00 被静默丢弃（实测 T16:00 变 T00:00）。
     拆开之后：日期用带锚点的正则取前缀，时间在整串里独立扫描。 */
  let dm = s.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/);
  let y = null, mo = null, d = null;
  if (dm) {
    y = Number(dm[1]); mo = Number(dm[2]); d = Number(dm[3]);
  } else {
    dm = s.match(/^(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/);
    if (dm) { y = baseYear || new Date().getFullYear(); mo = Number(dm[1]); d = Number(dm[2]); }
  }

  /* 时间：18:00 / 18点30 / 18时 / 9:5 都认；全文扫描，不受日期部分影响 */
  const tm = s.match(/(\d{1,2})\s*[:：点時时]\s*(\d{1,2})?/);
  const hasT = !!tm;
  const H = hasT ? Number(tm[1]) : 0;
  const Mm = (hasT && tm[2]) ? Number(tm[2]) : 0;
  if (H > 23 || Mm > 59) return null;

  if (y === null) {
    if (!hasT) return null;                       // 既没日期也没时间
    return { y: null, m: null, d: null, H, M: Mm }; // 纯时间
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d, H, M: Mm };
}

const pad2 = (n) => String(n).padStart(2, '0');
const ymdOf = (p) => p ? `${p.y}-${pad2(p.m)}-${pad2(p.d)}` : null;
const hmOf = (p) => p ? `${pad2(p.H)}:${pad2(p.M)}` : null;

/** 任务类型：每日/每周/每月/专项，也吃英文 */
function parseCycle(v) {
  const s = norm(v);
  if (!s) return null;
  if (/每日|每天|daily/.test(s)) return 'daily';
  if (/每周|weekly/.test(s)) return 'weekly';
  if (/每月|monthly/.test(s)) return 'monthly';
  if (/专项|一次性|一次性的|once/.test(s)) return 'once';
  return null;
}

/** 周几：周一..周日 / 星期一 / 1..7 / 一..日 */
function parseWeekday(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' || /^\d+$/.test(String(v).trim())) {
    const n = Number(String(v).trim());
    return n >= 1 && n <= 7 ? n : null;
  }
  const s = norm(v);
  const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7, 七: 7 };
  const m = s.match(/[周星期]([一二三四五六日天七])/)
    || s.match(/^([一二三四五六日天七])$/);
  if (m) return map[m[1]] || null;
  if (/sun/.test(s)) return 7;
  if (/mon/.test(s)) return 1;
  if (/tue/.test(s)) return 2;
  if (/wed/.test(s)) return 3;
  if (/thu/.test(s)) return 4;
  if (/fri/.test(s)) return 5;
  if (/sat/.test(s)) return 6;
  return null;
}

function parseIntLoose(v, fallback) {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v === 'number') return Math.round(v);
  const m = String(v).match(/-?\d+/);
  return m ? Number(m[0]) : fallback;
}

/** 星级：认 1-5 数字，也认「★★★★」「5星」 */
function parsePriority(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v);
  const stars = (s.match(/[★⭐]/g) || []).length;
  if (stars) return Math.max(1, Math.min(5, stars));
  const n = parseIntLoose(s, null);
  if (n === null) return null;
  return n >= 1 && n <= 5 ? n : null;
}

/** 是/否 */
function parseBool(v, fallback) {
  if (v === null || v === undefined || v === '') return fallback;
  const s = norm(v);
  if (/^(是|要|y|yes|true|1|开|开启)$/.test(s)) return true;
  if (/^(否|不要|不|n|no|false|0|关|关闭)$/.test(s)) return false;
  return fallback;
}

/* ---------------- 门店匹配 ---------------- */
const ALL_WORDS = ['全部', '所有', '全部门店', '所有门店', '全店', 'all'];

/**
 * 建索引：系统里的门店 → 归一化键
 * 认三种写法：原名 / 去掉末尾「店」/ 品牌全称（含括号里的字去掉也认一次）
 */
function buildStoreIndex(stores) {
  const idx = new Map();      // 归一化键 → Set(storeId)
  const add = (k, id) => {
    if (!k) return;
    if (!idx.has(k)) idx.set(k, new Set());
    idx.get(k).add(id);
  };
  stores.forEach((s) => {
    const name = norm(s.name);
    add(name, s.id);
    if (name.endsWith('店')) add(name.slice(0, -1), s.id);
    const brand = norm(s.brand);
    if (brand) {
      add(brand, s.id);
      const noParen = brand.replace(/\([^)]*\)/g, '');
      if (noParen && noParen !== brand) add(noParen, s.id);
    }
    if (s.code) add(norm(s.code), s.id);
    if (s.account) add(norm(s.account), s.id);
    if (s.id) add(norm(s.id), s.id);      // 兜底：直接填 ST01 这种内部 ID 也认
  });
  return idx;
}

const STORE_SEP = /[、,，;；\/|\s]+/;

/**
 * 解析门店单元格 → { ids: [], errors: [], unknown: [] }
 * 「全部」展开为所有 enabled 门店
 */
function parseStores(raw, stores, idx) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return { ids: [], errors: ['派发门店为空'] };
  if (ALL_WORDS.includes(norm(text))) {
    return { ids: stores.filter((s) => s.enabled !== false).map((s) => s.id), errors: [] };
  }
  const ids = [];
  const errors = [];
  const unknown = [];
  text.split(STORE_SEP).map((x) => x.trim()).filter(Boolean).forEach((token) => {
    const hit = idx.get(norm(token));
    if (!hit || !hit.size) { unknown.push(token); return; }
    if (hit.size > 1) { errors.push(`门店「${token}」有歧义，请写完整店名`); return; }
    const id = [...hit][0];
    if (!ids.includes(id)) ids.push(id);
  });
  if (unknown.length) errors.push(`门店不存在：${unknown.join('、')}`);
  if (!ids.length && !errors.length) errors.push('派发门店为空');
  return { ids, errors };
}

/* ---------------- 任务签名（判重用） ----------------
   口径：任务**定义**的全部字段（标题/说明/类型/周期参数/时间/门店集合/星级/提醒/起止/链接），
   不含 id、发布人、部门、创建时间、状态 —— 那是元数据，不是任务内容本身。 */
function taskSignature(t) {
  const links = (t.links || []).map((l) => (typeof l === 'string' ? l : l.url)).filter(Boolean).sort();
  const once = t.cycle === 'once';
  return JSON.stringify([
    String(t.title || '').trim(),
    String(t.content || '').trim().replace(/\r\n/g, '\n'),
    t.cycle || '',
    t.cycle === 'weekly' ? Number(t.weekday || 0) : 0,
    t.cycle === 'monthly' ? Number(t.monthDay || 0) : 0,
    once ? '' : String(t.time || ''),
    once && t.deadline ? new Date(t.deadline).toISOString() : '',
    (t.storeIds || []).slice().sort().join(','),
    Number(t.priority || 3),
    Number(t.remindBeforeMin === undefined ? 120 : t.remindBeforeMin),
    !!t.remindOverdue,
    t.startDate || '',
    t.stopDate || '',
    links.join('|'),
  ]);
}

module.exports = {
  COLUMNS, norm, mapHeader, toParts, ymdOf, hmOf,
  parseCycle, parseWeekday, parseIntLoose, parsePriority, parseBool,
  buildStoreIndex, parseStores, taskSignature, ALL_WORDS,
};
