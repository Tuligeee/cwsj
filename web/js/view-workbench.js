/* =========================================================
   view-workbench.js — 工作台（任务平台里的工具入口页）
   =========================================================
   2026-11-16：任务平台搬到根路径后，这一页就是「一个入口点所有工具」。
   要加工具，只改下面的 WB_TOOLS 数组，不用动 HTML / CSS：
     { icon, name, desc, url | onclick }
   加进去之后会自动排成卡片网格。
   ========================================================= */

/* 同一台服务器上其它服务的地址：
   Api.base 就是任务平台自己挂载的前缀（IP 下 ''、域名下 '/cwsj'），
   兄弟服务就在它下面一级，直接拼即可。
     IP    ：''      + /tool/ledger/ → /tool/ledger/
     域名  ：'/cwsj' + /tool/ledger/ → /cwsj/tool/ledger/
   🔴 2026-11-16 之前这里会「去掉最后一段」，那是任务平台还挂在 /cwsj/cwsj 时的算法；
      搬到根路径后必须直接用 Api.base，否则域名下会算成 /tool/... 跑到对方主站去。 */
function wbSibling(name) {
  const base = ((window.Api && Api.base) || '').replace(/\/$/, '');
  return base + '/' + name + '/';
}

/* 工作台里的工具清单
   icon 取值见 ui.js 的 ICON_PATHS
   ⚠️ 套餐中枢（taocan）、码表核对（meter）现在还在老路径；等第二批搬进 /tool/ 时，
      把这两行的 wbSibling('taocan') / wbSibling('meter') 改成 wbSibling('tool/taocan') 等即可。 */
const WB_TOOLS = [
  {
    icon: 'chart',
    name: '账本看板',
    desc: '投放花费 · 渠道成交 · ROI',
    url: wbSibling('tool/ledger')
  },
  {
    icon: 'board',
    name: '套餐中枢',
    desc: '套餐库 · 绑券 · 抖音上架',
    url: wbSibling('taocan')
  },
  {
    icon: 'checklist',
    name: '码表核对',
    desc: '机台码表填报与对账',
    url: wbSibling('meter')
  }
];

function pageWorkbench() {
  const wrap = h('div', { class: 'wb-page' });

  /* 一个工具都没有 → 占位说明，不假装有内容 */
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
