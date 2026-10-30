/* =========================================================
   export_accounts.js — 生成门店/总部账号对照表（HTML，可直接打印）
   输入：data/seed.json
   输出：docs/门店账号对照表.html
   用途：把每家店的账号密码发给店长；不要发错店
   ========================================================= */
const fs = require('fs');
const path = require('path');

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'seed.json'), 'utf8'));
const OUT = path.join(__dirname, '..', 'docs', '门店账号对照表.html');
const PWD = (seed.META && seed.META.initPwd) || (seed.HQ_PWD || '');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const regions = seed.REGIONS || [];
const stores = seed.STORE_SEED || [];
const hq = seed.HQ_SEED || [];

function storeRows() {
  return regions.map((r) => {
    const list = stores.filter((s) => s.regionId === r.id);
    if (!list.length) return '';
    return `<tr class="grp"><td colspan="5">${esc(r.name)}</td></tr>` + list.map((s) => `
      <tr>
        <td class="mono">${esc(s.account)}</td>
        <td>${esc(s.name)}</td>
        <td>${esc(s.brand || '—')}</td>
        <td>${esc(s.mgr || '—')}</td>
        <td class="mono">${esc(PWD)}</td>
      </tr>`).join('');
  }).join('');
}

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>门店任务管理平台 · 账号对照表</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px 32px 48px; font: 14px/1.6 "Microsoft YaHei", "PingFang SC", sans-serif; color: #1f2430; background: #fff; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #6b7280; font-size: 13px; margin-bottom: 20px; }
  .warn { background: #fef6e7; border-left: 3px solid #e8a33d; padding: 10px 14px; font-size: 13px; margin-bottom: 22px; border-radius: 4px; }
  h2 { font-size: 15px; margin: 26px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #eef0f4; }
  th { background: #f7f8fa; font-weight: 600; color: #4b5563; }
  tr.grp td { background: #f9fafb; font-weight: 600; color: #4f6bed; padding-top: 12px; }
  .mono { font-family: Consolas, "Courier New", monospace; font-weight: 600; }
  .hd { display: flex; gap: 10px; align-items: center; }
  .hd b { font-size: 13px; }
  .badge { font-size: 11px; background: #eef2ff; color: #4f6bed; padding: 1px 7px; border-radius: 10px; }
  .todo { font-size: 11px; background: #fef3c7; color: #92400e; padding: 1px 6px; border-radius: 10px; font-family: "Microsoft YaHei", sans-serif; font-weight: 400; }
  @media print { body { padding: 12mm; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
</style></head>
<body>
  <h1>门店任务管理平台 · 账号对照表</h1>
  <div class="sub">共 ${stores.length} 家门店 / ${hq.length} 个总部账号 · 生成于 ${new Date().toLocaleDateString('zh-CN')}</div>

  <div class="warn">
    <b>一店一号</b>：账号属于门店，不跟人走。店长换人不换号。<br>
    初始密码统一为 <b class="mono">${esc(PWD)}</b>，首次登录后请立即在右上角菜单修改。
  </div>

  <h2>门店账号（${stores.length} 个）</h2>
  <table>
    <thead><tr><th style="width:130px">账号</th><th style="width:110px">门店</th><th>品牌全称</th><th style="width:80px">店长</th><th style="width:120px">初始密码</th></tr></thead>
    <tbody>${storeRows()}</tbody>
  </table>

  <h2>总部账号（${hq.length} 个）</h2>
  <table>
    <thead><tr><th style="width:100px">账号</th><th style="width:110px">姓名</th><th>管理员</th><th style="width:120px">初始密码</th></tr></thead>
    <tbody>${hq.map((u) => `
      <tr><td class="mono">${esc(u.account)}${/^1[3-9]\d{9}$/.test(u.account) ? '' : ' <span class="todo">待登记</span>'}</td><td>${esc(u.name)}</td><td>${u.admin ? '<span class="badge">★ 管理员</span>' : '—'}</td><td class="mono">${esc(PWD)}</td></tr>`).join('')}</tbody>
  </table>
</body></html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
console.log('已生成 ' + OUT);
console.log(`门店 ${stores.length} / 总部 ${hq.length} / 密码 ${PWD}`);
