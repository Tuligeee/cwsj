/* =========================================================
   util.js — 通用工具函数（无依赖，纯浏览器环境）
   ========================================================= */

const DAY_MS = 86400000;

/* ---------- DOM ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function h(tag, attrs, children) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset' && typeof v === 'object') Object.assign(e.dataset, v);
      else e.setAttribute(k, v);
    }
  }
  if (children !== null && children !== undefined) {
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c === null || c === undefined || c === false) return;
      e.appendChild(typeof c === 'object' && c.nodeType ? c : document.createTextNode(String(c)));
    });
  }
  return e;
}

/** 只做文本转义，用于 html 模板字符串 */
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }

/* ---------- ID ---------- */
let _seq = 0;
function uid(prefix = 'id') {
  _seq++;
  return `${prefix}_${Date.now().toString(36)}${_seq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/* ---------- 日期 ---------- */
const pad2 = n => String(n).padStart(2, '0');

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMinutes(d, n) { return new Date(d.getTime() + n * 60000); }
/** 周一为一周起点 */
function startOfWeek(d) { const x = startOfDay(d); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd); }
function endOfWeek(d) { const x = endOfDay(startOfWeek(d)); return addDays(x, 6); }
function startOfMonth(d) { const x = startOfDay(d); x.setDate(1); return x; }
function endOfMonth(d) { const x = new Date(d.getFullYear(), d.getMonth() + 1, 0); x.setHours(23, 59, 59, 999); return x; }

function ymd(d) { const x = new Date(d); return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`; }
/** 2026-10-13 09:30 */
function ymdhm(d) { const x = new Date(d); return `${ymd(x)} ${pad2(x.getHours())}:${pad2(x.getMinutes())}`; }
/* 简短时间：10-22 11:26（流程节点上用，省空间） */
function mdhm(d) { const x = new Date(d); return `${pad2(x.getMonth() + 1)}-${pad2(x.getDate())} ${pad2(x.getHours())}:${pad2(x.getMinutes())}`; }
function hm(d) { const x = new Date(d); return `${pad2(x.getHours())}:${pad2(x.getMinutes())}`; }

/** ISO 周键：2026-W42 */
function weekKey(d) {
  const x = startOfDay(d);
  const t = new Date(x.getFullYear(), x.getMonth(), x.getDate());
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const w1 = new Date(t.getFullYear(), 0, 4);
  const no = 1 + Math.round(((t - w1) / DAY_MS - 3 + ((w1.getDay() + 6) % 7)) / 7);
  return `${t.getFullYear()}-W${pad2(no)}`;
}
function monthKey(d) { const x = new Date(d); return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}`; }

const WD_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
/** 1=周一 ... 7=周日 */
function isoWeekday(d) { return ((new Date(d).getDay() + 6) % 7) + 1; }

/** 'yyyy-MM-dd' + 'HH:mm' → Date */
function atTime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

/** 相对时间：3分钟前 / 2小时前 / 昨天 14:20 / 2026-10-01 */
function ago(d, now) {
  const t = new Date(d).getTime();
  const n = (now ? new Date(now) : new Date()).getTime();
  const diff = n - t;
  if (diff < 0) return future(d, now);
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 172800000) return `昨天 ${hm(d)}`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
  return ymdhm(d);
}

/** 倒计时描述：距截止 3小时12分 / 已逾期 1天3小时 */
function countdown(due, now) {
  const d = new Date(due).getTime();
  const n = (now ? new Date(now) : new Date()).getTime();
  const diff = d - n;
  const abs = Math.abs(diff);
  const day = Math.floor(abs / 86400000);
  const hr = Math.floor((abs % 86400000) / 3600000);
  const mi = Math.floor((abs % 3600000) / 60000);
  let s = '';
  if (day > 0) s = `${day}天${hr > 0 ? hr + '小时' : ''}`;
  else if (hr > 0) s = `${hr}小时${mi > 0 ? mi + '分' : ''}`;
  else s = `${Math.max(mi, 0)}分钟`;
  return diff >= 0 ? `距截止 ${s}` : `已逾期 ${s}`;
}

/** 时长（毫秒 → 人性化） */
function dur(ms) {
  if (ms < 0) ms = 0;
  const hr = ms / 3600000;
  if (hr < 1) return `${Math.max(1, Math.round(ms / 60000))}分钟`;
  if (hr < 48) return `${hr.toFixed(1)}小时`;
  return `${(hr / 24).toFixed(1)}天`;
}

/* ---------- 数值 ---------- */
const pct = (a, b) => (!b ? 0 : Math.round((a / b) * 1000) / 10);
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

/* ---------- 存储 ---------- */
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('本地存储空间不足，图片请改用链接方式', 'err'); return false; } }

/* ---------- 导出 ---------- */
function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['\ufeff' + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}
function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(rows) { return rows.map(r => r.map(csvCell).join(',')).join('\r\n'); }

/* ---------- 剪贴板 ---------- */
function copyText(t) {
  const done = () => toast('已复制：' + t, 'ok');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(done).catch(() => fallbackCopy(t, done));
  } else fallbackCopy(t, done);
}
function fallbackCopy(t, cb) {
  const ta = document.createElement('textarea');
  ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); cb(); } catch (e) { toast('复制失败，请手动选择', 'err'); }
  document.body.removeChild(ta);
}

/* ---------- 图片压缩 ---------- */
function readImage(file, maxW = 1080, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('不是图片文件'));
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('读取失败'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片解析失败'));
      img.onload = () => {
        let w = img.width, hgt = img.height;
        if (w > maxW) { hgt = Math.round(hgt * maxW / w); w = maxW; }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = hgt;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hgt);
        ctx.drawImage(img, 0, 0, w, hgt);
        resolve(cv.toDataURL('image/jpeg', quality));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ---------- 稳定伪随机（示例数据用） ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---------- 主题 ---------- */
const THEME_KEY = 'cwsj_theme';
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(THEME_KEY, t);
}
function initTheme() { applyTheme(localStorage.getItem(THEME_KEY) || 'light'); }
