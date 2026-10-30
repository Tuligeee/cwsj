/* =========================================================
   parse.js — 把上传的 .xlsx / .csv 读成「表头 + 数据行」
   两个坑（都在真实文件里遇到过）：
     1. Excel 另存的 CSV 是 GBK 编码，直接 utf8 解码中文会变乱码 → 检测到非法
        UTF-8 就退到 TextDecoder('gbk')（Node 22 自带的 full-icu 支持）
     2. 表头不一定在第 1 行（有人习惯先写个大标题、或空两行）→ 前 12 行里
        找含「任务标题 / 标题」的那一行当表头
   ========================================================= */
const XLSX = require('xlsx');
const { mapHeader, norm } = require('./schema');

const MAX_BYTES = 8 * 1024 * 1024;   // 8MB，正常模板几百 KB 足够

function decodeCsv(buf) {
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.slice(3).toString('utf8');
  }
  const utf8 = buf.toString('utf8');
  if (utf8.indexOf('\uFFFD') >= 0) {
    try { return new TextDecoder('gbk').decode(buf); } catch (_) { return utf8; }
  }
  return utf8;
}

/** 读出二维数组（含真实行号），返回 { ok, error, headers, map, rows, sheetName } */
function readSheet(buf, filename) {
  if (!buf || !buf.length) return { ok: false, error: '文件是空的' };
  if (buf.length > MAX_BYTES) return { ok: false, error: '文件超过 8MB，请拆成多个文件导入' };

  const isCsv = /\.csv$/i.test(filename || '');
  let wb;
  try {
    wb = isCsv
      ? XLSX.read(decodeCsv(buf), { type: 'string', raw: true, cellDates: false })
      : XLSX.read(buf, { type: 'buffer', raw: true, cellDates: false });
  } catch (e) {
    return { ok: false, error: '文件解析失败：' + (e.message || '格式不支持') };
  }

  const sheetName = wb.SheetNames.find((n) => n === '任务导入') || wb.SheetNames[0];
  if (!sheetName) return { ok: false, error: '文件里没有工作表' };
  const ws = wb.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: true, defval: null });
  if (!grid.length) return { ok: false, error: '工作表是空的' };

  /* 找表头行 */
  let hi = -1;
  for (let i = 0; i < Math.min(grid.length, 12); i++) {
    const cells = (grid[i] || []).map(norm);
    if (cells.some((c) => c === '任务标题' || c === '标题' || c === '任务名称')) { hi = i; break; }
  }
  if (hi < 0) return { ok: false, error: '没找到表头行：A1 附近需要有「任务标题」这一列，请用系统里下载的模板填写' };

  const headers = grid[hi] || [];
  const map = mapHeader(headers);
  const missing = [];
  if (map.title === undefined) missing.push('任务标题');
  if (map.content === undefined) missing.push('任务说明');
  if (map.cycleRaw === undefined) missing.push('任务类型');
  if (map.storesRaw === undefined) missing.push('派发门店');
  if (missing.length) {
    return { ok: false, error: '缺少必需的列：' + missing.join('、') + '（表头文字被改过？请重新下载模板）' };
  }

  const rows = [];
  for (let i = hi + 1; i < grid.length; i++) {
    const cells = grid[i] || [];
    const hasValue = cells.some((c) => c !== null && c !== undefined && String(c).trim() !== '');
    if (!hasValue) continue;
    rows.push({ rowNo: i + 1, cells });
  }
  if (!rows.length) return { ok: false, error: '表头下面没有数据行' };

  return { ok: true, headers, map, rows, sheetName };
}

module.exports = { readSheet, MAX_BYTES };
