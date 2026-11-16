/* =========================================================
   view-workbench.js — 工作台（左侧导航第一个入口）
   =========================================================
   2026-11-16：先只放入口，页面留出工具位。
   以后要加工具，只改下面的 WB_TOOLS 数组，不用动 HTML / CSS：
     { icon, name, desc, url | onclick }
   加进去之后会自动排成卡片网格。
   ========================================================= */

/* 工作台里的工具清单（现在为空 → 页面显示「工具还没放进来」）
   例：
     { icon: 'chart', name: '账本看板', desc: '投放花费 · 渠道成交 · ROI', url: wbSibling('ledger') }
   icon 取值见 ui.js 的 ICON_PATHS；url 用 wbSibling() 拼，别写死 /cwsj */
const WB_TOOLS = [];

/* 同一台服务器上其它服务的地址：
   当前挂载前缀的最后一段是服务名（IP 下 /cwsj，域名下 /cwsj/cwsj），换成目标服务即可。
   IP 下 /cwsj/ → /ledger/；域名下 /cwsj/cwsj/ → /cwsj/ledger/ */
function wbSibling(name) {
  const base = (window.Api && Api.base) || '';
  const prefix = base.replace(/\/[^/]*$/, '');     /* 去掉服务名那一段 */
  return prefix + '/' + name + '/';
}

function pageWorkbench() {
  const wrap = h('div', { class: 'wb-page' });

  /* 还没有工具 → 占位说明，不假装有内容 */
  if (!WB_TOOLS.length) {
    wrap.appendChild(h('div', { class: 'wb-empty' }, [
      h('div', { class: 'wb-empty-ico', html: iconSvg('grid', 24) }),
      h('div', { class: 'wb-empty-t', text: '工具还没放进来' }),
      h('div', { class: 'wb-empty-d', text: '这一页留给常用工具，加进来后会排成卡片。' })
    ]));
    return wrap;
  }

  const grid = h('div', { class: 'wb-grid' });
  WB_TOOLS.forEach(t => {
    if (!t) return;
    const usable = !!(t.url || t.onclick);
    const card = h('div', { class: 'wb-card' + (usable ? '' : ' off') }, [
      h('div', { class: 'wb-ico', html: iconSvg(t.icon || 'dot', 20) }),
      h('div', { class: 'wb-body' }, [
        h('div', { class: 'wb-n', text: t.name || '' }),
        h('div', { class: 'wb-d', text: t.desc || '' })
      ]),
      usable ? h('span', { class: 'wb-go', text: '\u203a' }) : null
    ]);
    if (t.url) card.addEventListener('click', () => { location.href = t.url; });
    else if (t.onclick) card.addEventListener('click', t.onclick);
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
  return wrap;
}
