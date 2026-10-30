/* =========================================================
   seed.js — 示例数据（首次打开时写入本地存储）
   ========================================================= */

/** 生成一张占位"现场照片"（内联 SVG，避免外部依赖） */
function ph(text, c1, c2) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/>' +
    '</linearGradient></defs>' +
    '<rect width="480" height="360" fill="url(#g)"/>' +
    '<circle cx="392" cy="72" r="46" fill="rgba(255,255,255,0.13)"/>' +
    '<circle cx="88" cy="300" r="66" fill="rgba(255,255,255,0.10)"/>' +
    '<text x="240" y="178" font-family="sans-serif" font-size="25" font-weight="600" fill="#ffffff" text-anchor="middle">' + text + '</text>' +
    '<text x="240" y="212" font-family="sans-serif" font-size="14" fill="rgba(255,255,255,0.75)" text-anchor="middle">现场照片 · 示意</text>' +
    '</svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

const DEPARTMENTS = ['管委会', '营销部', '采购部', '质检部', '人事部', '财务部', '技术部', '调研组', 'AI组', '后台组'];

const DEPT_COLOR = {
  '管委会': '#4F6BED', '营销部': '#E4592B', '采购部': '#0F9D58', '质检部': '#7C4DE0',
  '人事部': '#1F7FE8', '财务部': '#C98A00', '技术部': '#0E8C8C', '调研组': '#D24B9B',
  'AI组': '#5B3FE0', '后台组': '#5A6478'
};

const HQ_PWD = '123456';

const STORE_SEED = [
  { id: 'ST01', code: 'S001', name: '苏州东吴天街店', city: '苏州', addr: '吴中区东吴北路 东吴天街 4F-08', mgr: '刘婷', phone: '138-0021-3301', openDays: 420, strength: 0.93, region: '华东区' },
  { id: 'ST02', code: 'S002', name: '苏州大悦城店', city: '苏州', addr: '相城区元和街道 大悦城 3F-12', mgr: '王倩', phone: '138-0021-3302', openDays: 365, strength: 0.88, region: '华东区' },
  { id: 'ST03', code: 'S003', name: '苏州绿宝广场店', city: '苏州', addr: '高新区狮山路 绿宝广场 2F-19', mgr: '陈晨', phone: '138-0021-3303', openDays: 210, strength: 0.71, region: '华东区' },
  { id: 'ST04', code: 'S004', name: '武汉新荣天街店', city: '武汉', addr: '江岸区解放大道 新荣天街 5F-03', mgr: '李锐', phone: '138-0021-3304', openDays: 300, strength: 0.85, region: '华中区' },
  { id: 'ST05', code: 'S005', name: '武汉光谷天地店', city: '武汉', addr: '洪山区关山大道 光谷天地 1F-22', mgr: '张涛', phone: '138-0021-3305', openDays: 160, strength: 0.67, region: '华中区' },
  { id: 'ST06', code: 'S006', name: '南京河西天街店', city: '南京', addr: '建邺区江东中路 河西天街 4F-15', mgr: '赵雪', phone: '138-0021-3306', openDays: 275, strength: 0.90, region: '华东区' },
  { id: 'ST07', code: 'S007', name: '无锡万象城店', city: '无锡', addr: '滨湖区青祁路 万象城 3F-07', mgr: '周航', phone: '138-0021-3307', openDays: 190, strength: 0.78, region: '华东区' },
  { id: 'ST08', code: 'S008', name: '杭州滨江天街店', city: '杭州', addr: '滨江区江汉路 滨江天街 2F-31', mgr: '孙悦', phone: '138-0021-3308', openDays: 95, strength: 0.60, region: '华东区' }
];

const HQ_SEED = [
  { id: 'HQ01', account: 'HQ01', name: '陈立', dept: '管委会', title: '管委会主任', committee: true, admin: true, phone: '139-0100-0001', wechat: 'chenli_hq', email: 'chenli@cwsj.com', duty: '统筹全公司运营，门店重大需求最终裁决；新店拓展与关店评估' },
  { id: 'HQ02', account: 'HQ02', name: '周敏', dept: '管委会', title: '管委会副主任', committee: true, phone: '139-0100-0002', wechat: 'zhoumin_hq', email: 'zhoumin@cwsj.com', duty: '门店需求评估与派发，跨部门协同推进，月度经营分析' },
  { id: 'HQ03', account: 'HQ03', name: '马超', dept: '管委会', title: '管委会委员', committee: true, phone: '139-0100-0003', wechat: 'machao_hq', email: 'machao@cwsj.com', duty: '门店需求评估，制度与流程规范制定，任务执行督办' },
  { id: 'HQ04', account: 'HQ04', name: '李婉', dept: '营销部', title: '营销总监', committee: false, phone: '139-0100-0004', wechat: 'liwan_hq', email: 'liwan@cwsj.com', duty: '品牌推广、活动策划、门店物料与氛围布置、会员社群运营' },
  { id: 'HQ05', account: 'HQ05', name: '王浩', dept: '采购部', title: '采购经理', committee: false, phone: '139-0100-0005', wechat: 'wanghao_hq', email: 'wanghao@cwsj.com', duty: '卡牌与周边采购、补货计划、供应商对接、门店退货与调拨' },
  { id: 'HQ06', account: 'HQ06', name: '赵静', dept: '质检部', title: '质检主管', committee: false, phone: '139-0100-0006', wechat: 'zhaojing_hq', email: 'zhaojing@cwsj.com', duty: '门店服务与卫生标准检查、安全隐患排查、客诉责任认定' },
  { id: 'HQ07', account: 'HQ07', name: '孙倩', dept: '人事部', title: '人事经理', committee: false, phone: '139-0100-0007', wechat: 'sunqian_hq', email: 'sunqian@cwsj.com', duty: '门店招聘与排班、考勤与绩效核算、员工培训、通讯录维护' },
  { id: 'HQ08', account: 'HQ08', name: '吴磊', dept: '财务部', title: '财务主管', committee: false, phone: '139-0100-0008', wechat: 'wulei_hq', email: 'wulei@cwsj.com', duty: '门店营收核对、盘点表审核、费用报销、月度经营报表' },
  { id: 'HQ09', account: 'HQ09', name: '郑凯', dept: '技术部', title: '技术负责人', committee: false, phone: '139-0100-0009', wechat: 'zhengkai_hq', email: 'zhengkai@cwsj.com', duty: '门店设备维护、收银与抓机系统升级、硬件故障处理' },
  { id: 'HQ10', account: 'HQ10', name: '何雨', dept: '调研组', title: '调研分析师', committee: false, phone: '139-0100-0010', wechat: 'heyu_hq', email: 'heyu@cwsj.com', duty: '商圈与客流调研、竞品门店走访、选址数据支持、客群画像' },
  { id: 'HQ11', account: 'HQ11', name: '林川', dept: 'AI组', title: 'AI产品经理', committee: false, phone: '139-0100-0011', wechat: 'linchuan_hq', email: 'linchuan@cwsj.com', duty: 'AI能力落地门店场景、智能选品与补货预测、数据看板建设' },
  { id: 'HQ12', account: 'HQ12', name: '徐峰', dept: '后台组', title: '后台组长', committee: false, phone: '139-0100-0012', wechat: 'xufeng_hq', email: 'xufeng@cwsj.com', duty: '门店水电与物业对接、消防与物业投诉处理、仓储物流、后台保障' },
  { id: 'HQ13', account: 'HQ13', name: '蒋楠', dept: '营销部', title: '营销专员', committee: false, phone: '139-0100-0013', wechat: 'jiangnan_hq', email: 'jiangnan@cwsj.com', duty: '门店陈列与画面更新、活动执行落地、物料收发与验收' },
  { id: 'HQ14', account: 'HQ14', name: '张宁', dept: '财务部', title: '财务会计', committee: false, phone: '139-0100-0014', wechat: 'zhangning_hq', email: 'zhangning@cwsj.com', duty: '门店日结数据核对、发票与凭证处理、盘点差异跟进' }
];

/* ---------------- 主构建函数 ---------------- */
function buildSeed() {
  const now = new Date();
  const TODAY = startOfDay(now);
  const iso = d => new Date(d).toISOString();
  const ALL = STORE_SEED.map(s => s.id);
  const rnd = mulberry32(20261013);

  /* ---- 人员 ---- */
  const regions = ['华东区', '华中区'].map((name, i) => ({ id: 'RG' + (i + 1), name: name }));
  const stores = STORE_SEED.map(s => ({
    id: s.id, code: s.code, name: s.name, city: s.city, addr: s.addr,
    mgr: s.mgr, phone: s.phone, openDays: s.openDays,
    regionId: (regions.find(r => r.name === s.region) || {}).id || null,
    enabled: true, account: s.code, pwd: HQ_PWD, type: 'store'
  }));

  const hq = HQ_SEED.map(u => ({
    id: u.id, account: u.account, name: u.name, dept: u.dept, title: u.title,
    committee: !!u.committee, admin: !!u.admin, enabled: true,
    phone: u.phone, wechat: u.wechat, email: u.email,
    duty: u.duty, pwd: HQ_PWD, type: 'hq'
  }));

  /* ---- 任务 ---- */
  let tseq = 0;
  function mkTask(o) {
    tseq++;
    return Object.assign({
      id: 'T' + String(tseq).padStart(3, '0'),
      images: [], links: [],
      remindBeforeMin: 120,
      remindOverdue: true,
      startDate: ymd(addDays(TODAY, -40)),
      stopDate: null,
      status: 'active',
      createdAt: iso(addDays(TODAY, -40))
    }, o);
  }

  const tasks = [
    mkTask({
      title: '营业前设备自检与卫生清洁', cycle: 'daily', time: '09:30',
      content: '开店前完成全部抓机/卡牌机通电自检，确认出卡、退币、屏幕显示正常；\n完成地面、玻璃、机器外壳的清洁并拍照上传。\n如发现设备异常，立即在"我的提需"中提交技术部处理。',
      dept: '质检部', creatorId: 'HQ06', creatorName: '赵静',
      storeIds: ALL.slice(), priority: 5, remindBeforeMin: 60,
      images: [ph('开店前设备自检', '#4F6BED', '#7C4DE0')],
      links: [{ title: '《门店日常检查标准 V3.2》', url: 'https://docs.cwsj.com/store/daily-check-v3' }]
    }),
    mkTask({
      title: '每日营业数据与卡牌销售上报', cycle: 'daily', time: '12:00',
      content: '汇总昨日营业结束后台数据（营业额、客单价、卡牌销售 TOP5），当日 12:00 前在系统内提交复核截图。',
      dept: '财务部', creatorId: 'HQ08', creatorName: '吴磊',
      storeIds: ALL.slice(), priority: 4, remindBeforeMin: 240
    }),
    mkTask({
      title: '卡牌库存盘点并拍照上传', cycle: 'daily', time: '18:00',
      content: '核对当日卡牌进出库数量，拍摄库存货架全景照上传；缺货品项在备注中列明，采购部次日安排补货。',
      dept: '采购部', creatorId: 'HQ05', creatorName: '王浩',
      storeIds: ALL.slice(), priority: 3, remindBeforeMin: 480
    }),
    mkTask({
      title: '闭店安全检查（电源 / 门锁 / 监控）', cycle: 'daily', time: '22:00',
      content: '闭店前确认所有设备断电、收银抽屉清空落锁、监控在线、消防通道通畅，拍照留档。',
      dept: '后台组', creatorId: 'HQ12', creatorName: '徐峰',
      storeIds: ALL.slice(), priority: 5, remindBeforeMin: 240
    }),
    mkTask({
      title: '会员社群当日内容发布', cycle: 'daily', time: '20:00',
      content: '按营销部提供的当日素材，在门店会员群发布 1 条内容并截图回传。',
      dept: '营销部', creatorId: 'HQ04', creatorName: '李婉',
      storeIds: ['ST01', 'ST02', 'ST04', 'ST06', 'ST08'], priority: 2, remindBeforeMin: 720
    }),
    mkTask({
      title: '每周设备维护保养并拍照', cycle: 'weekly', weekday: 5, time: '18:00',
      content: '按《设备周保养清单》完成清洁、润滑、紧固与测试，逐项拍照上传，异常项提交技术部工单。',
      dept: '技术部', creatorId: 'HQ09', creatorName: '郑凯',
      storeIds: ALL.slice(), priority: 4, remindBeforeMin: 240,
      links: [{ title: '《设备周保养清单》', url: 'https://docs.cwsj.com/tech/weekly-maintain' }]
    }),
    mkTask({
      title: '每周竞品与客流调研反馈', cycle: 'weekly', weekday: 7, time: '20:00',
      content: '记录本周同商圈竞品门店的活动、价格、客流变化，填写调研表并上传 2 张现场照片。',
      dept: '调研组', creatorId: 'HQ10', creatorName: '何雨',
      storeIds: ALL.slice(), priority: 3, remindBeforeMin: 720
    }),
    mkTask({
      title: '每周员工排班表提交', cycle: 'weekly', weekday: 6, time: '12:00',
      content: '提交下周门店排班表，注明兼职与调休安排，人事部审核后生效。',
      dept: '人事部', creatorId: 'HQ07', creatorName: '孙倩',
      storeIds: ALL.slice(), priority: 3, remindBeforeMin: 1440
    }),
    mkTask({
      title: '月度全盘盘点表与库存照片', cycle: 'monthly', monthDay: 28, time: '18:00',
      content: '完成当月全品类盘点，提交盘点表并上传货架与仓储照片，差异项附说明。',
      dept: '财务部', creatorId: 'HQ08', creatorName: '吴磊',
      storeIds: ALL.slice(), priority: 5, remindBeforeMin: 2880
    }),
    mkTask({
      title: '月度消防与安全隐患自查', cycle: 'monthly', monthDay: 25, time: '17:00',
      content: '按消防自查表逐项检查灭火器、应急灯、疏散标识、用电线路，上传自查表与关键点位照片。',
      dept: '质检部', creatorId: 'HQ06', creatorName: '赵静',
      storeIds: ALL.slice(), priority: 5, remindBeforeMin: 4320
    }),
    mkTask({
      title: '月度竞品门店走访报告', cycle: 'monthly', monthDay: 20, time: '18:00',
      content: '完成 3 家同商圈竞品走访，提交图文报告（陈列、价格、活动、客流），供营销部与调研组使用。',
      dept: '调研组', creatorId: 'HQ10', creatorName: '何雨',
      storeIds: ALL.slice(), priority: 3, remindBeforeMin: 2880
    }),
    mkTask({
      id: 'T101', title: '双十一活动物料布置与验收', cycle: 'once',
      deadline: iso(atTime(ymd(addDays(TODAY, 3)), '18:00')),
      content: '按营销部下发的双十一物料清单完成门店布置：主视觉吊旗、门口地贴、机台贴纸、抽奖箱摆放；\n完成后拍摄 4 张全景照（正面 / 侧面 / 收银台 / 活动区）上传验收。',
      dept: '营销部', creatorId: 'HQ04', creatorName: '李婉',
      storeIds: ['ST01', 'ST02', 'ST04', 'ST06'], priority: 5, remindBeforeMin: 1440,
      images: [ph('双十一物料效果图', '#E4592B', '#C9302C')],
      links: [{ title: '《双十一门店布置指导手册》', url: 'https://docs.cwsj.com/mkt/1111-guide' }],
      createdAt: iso(addDays(TODAY, -6)), startDate: ymd(addDays(TODAY, -6))
    }),
    mkTask({
      id: 'T102', title: '新版收银系统升级与操作培训', cycle: 'once',
      deadline: iso(atTime(ymd(addDays(TODAY, 7)), '20:00')),
      content: '技术部远程推送升级包后，门店需在指定窗口完成升级；\n组织当班员工完成 30 分钟操作培训，上传培训签到表照片。',
      dept: '技术部', creatorId: 'HQ09', creatorName: '郑凯',
      storeIds: ALL.slice(), priority: 4, remindBeforeMin: 2880,
      createdAt: iso(addDays(TODAY, -4)), startDate: ymd(addDays(TODAY, -4))
    }),
    mkTask({
      id: 'T103', title: '门店空调外机降噪整改', cycle: 'once',
      deadline: iso(atTime(ymd(addDays(TODAY, -1)), '18:00')),
      content: '商场物业下发噪音整改通知，需配合后台组完成外机减震垫安装与围挡加装，整改后拍照回传。',
      dept: '后台组', creatorId: 'HQ12', creatorName: '徐峰',
      storeIds: ['ST03', 'ST05'], priority: 4, remindBeforeMin: 1440,
      createdAt: iso(addDays(TODAY, -9)), startDate: ymd(addDays(TODAY, -9))
    }),
    mkTask({
      id: 'T104', title: '秋季新品卡牌陈列调整', cycle: 'once',
      deadline: iso(atTime(ymd(TODAY), '23:00')),
      content: '新品卡牌到店后，按"新品尝鲜区"标准调整陈列顺序与价签，上传陈列完成照。',
      dept: '营销部', creatorId: 'HQ13', creatorName: '蒋楠',
      storeIds: ['ST01', 'ST03', 'ST07'], priority: 3, remindBeforeMin: 480,
      createdAt: iso(addDays(TODAY, -2)), startDate: ymd(addDays(TODAY, -2))
    }),
    mkTask({
      id: 'T105', title: '冬季门店氛围布置方案落地', cycle: 'once',
      deadline: iso(atTime(ymd(addDays(TODAY, 26)), '18:00')),
      content: '按冬季氛围方案完成门店整体布置（暖光氛围灯、冬季主题立牌、冬季限定卡牌专区），拍照回传。',
      dept: '营销部', creatorId: 'HQ13', creatorName: '蒋楠',
      storeIds: ['ST01', 'ST02'], priority: 3, remindBeforeMin: 2880,
      createdAt: iso(addDays(TODAY, -1)), startDate: ymd(addDays(TODAY, -1))
    }),
    mkTask({
      id: 'T106', title: '三季度消防检查记录补交', cycle: 'once',
      deadline: iso(atTime(ymd(addDays(TODAY, -1)), '18:00')),
      content: '三季度消防检查纸质记录需补扫上传至系统归档，含检查表、整改项照片与责任人签字页。\n逾期未交将影响门店季度安全评级，请尽快补交。',
      dept: '质检部', creatorId: 'HQ06', creatorName: '赵静',
      storeIds: ['ST01', 'ST03', 'ST05', 'ST07'], priority: 5, remindBeforeMin: 1440,
      images: [ph('消防检查记录示例', '#7C4DE0', '#4F6BED')],
      createdAt: iso(addDays(TODAY, -7)), startDate: ymd(addDays(TODAY, -7))
    })
  ];

  /* ---- 历史完成记录（用于考核统计） ---- */
  const records = [];
  const seen = new Set();
  for (let back = 35; back >= 0; back--) {
    const day = addDays(TODAY, -back);
    tasks.forEach(t => {
      if (t.status !== 'active' || t.cycle === 'once') return;
      if (!taskActiveOnSeed(t, day)) return;
      const due = occDueSeed(t, day);
      if (due.getTime() > now.getTime()) return;
      t.storeIds.forEach(sid => {
        const key = t.id + '|' + sid + '|' + occKeySeed(t, day);
        if (seen.has(key)) return;
        seen.add(key);
        const st = STORE_SEED.find(s => s.id === sid);
        const p = clamp((st ? st.strength : 0.8) + (rnd() - 0.5) * 0.18, 0.2, 0.99);
        if (rnd() > p) return; // 未完成
        const late = rnd() < 0.12;
        const doneAt = new Date(due.getTime() + (late ? (0.6 + rnd() * 6) * 3600000 : -(0.1 + rnd() * 2.2) * 3600000));
        records.push({
          id: 'R' + records.length, taskId: t.id, storeId: sid,
          periodKey: occKeySeed(t, day), due: due.toISOString(), doneAt: doneAt.toISOString(),
          late: late, text: late ? '已完成，因现场客流较大提交延迟，照片已补传。' : '', images: [], links: [],
          by: (st ? st.mgr : '店长')
        });
      });
    });
  }

  /* ---- 门店需求 ---- */
  function dl(at, by, action, note) { return { at: iso(at), by: by, action: action, note: note || '' }; }
  const demands = [
    {
      id: 'XQ01', code: 'XQ20261009001', storeId: 'ST04', storeName: '武汉新荣天街店',
      title: '商场空调外机噪音被投诉，申请协助整改', targetDept: '后台组',
      desc: '商场物业本周连续两次收到隔壁商铺投诉，我店空调外机运行噪音偏大。\n已自行尝试调整运行时段，效果有限。请后台组协助联系物业并安排减震整改。',
      images: [ph('外机安装位置', '#5A6478', '#2E3644')], links: [], createdAt: iso(addDays(TODAY, -12)),
      status: 'confirmed',
      review: { byId: 'HQ02', byName: '周敏', at: iso(addDays(TODAY, -11)), result: 'pass', comment: '属安全与合规事项，紧急程度高，通过。' },
      assign: { toId: 'HQ12', toName: '徐峰', dept: '后台组', at: iso(addDays(TODAY, -11)), expectDate: ymd(addDays(TODAY, -5)), note: '已联系物业，安排本周内加装减震垫。' },
      complete: { byId: 'HQ12', byName: '徐峰', at: iso(addDays(TODAY, -6)), text: '已完成外机减震垫加装与围挡加装，与物业共同验收通过，附整改后照片。', images: [ph('整改完成后', '#0F9D58', '#0B7A44')], links: [] },
      confirm: { at: iso(addDays(TODAY, -5)), rating: 5, comment: '处理很快，商场没有再投诉，感谢。' },
      logs: [
        dl(addDays(TODAY, -12), '李锐（武汉新荣天街店）', '提交需求', ''),
        dl(addDays(TODAY, -11), '周敏（管委会）', '评估通过', '属安全与合规事项，紧急程度高，通过。'),
        dl(addDays(TODAY, -11), '周敏（管委会）', '派发给 徐峰（后台组）', '期望完成：' + ymd(addDays(TODAY, -5))),
        dl(addDays(TODAY, -6), '徐峰（后台组）', '完成处理', '已完成外机减震垫加装与围挡加装'),
        dl(addDays(TODAY, -5), '李锐（武汉新荣天街店）', '确认完成并评分', '5 星')
      ]
    },
    {
      id: 'XQ02', code: 'XQ20261011002', storeId: 'ST01', storeName: '苏州东吴天街店',
      title: '周末客流大，申请增加兼职工时', targetDept: '人事部',
      desc: '近三周周末日均客流较上月增长约 40%，现有排班在 14:00-18:00 高峰段明显不足，\n申请每周六、周日各增加 1 名兼职 6 小时工时。',
      images: [], links: [{ title: '近三周客流统计表', url: 'https://bi.cwsj.com/store/ST01/traffic' }],
      createdAt: iso(addDays(TODAY, -8)),
      status: 'completed',
      review: { byId: 'HQ01', byName: '陈立', at: iso(addDays(TODAY, -7)), result: 'pass', comment: '客流数据支撑充分，同意试运行一个月。' },
      assign: { toId: 'HQ07', toName: '孙倩', dept: '人事部', at: iso(addDays(TODAY, -7)), expectDate: ymd(addDays(TODAY, -3)), note: '试运行 1 个月，按实际工时结算。' },
      complete: { byId: 'HQ07', byName: '孙倩', at: iso(addDays(TODAY, -4)), text: '已完成兼职招募与排班调整，本周六起执行，试运行一个月后复盘。', images: [], links: [] },
      confirm: null,
      logs: [
        dl(addDays(TODAY, -8), '刘婷（苏州东吴天街店）', '提交需求', ''),
        dl(addDays(TODAY, -7), '陈立（管委会）', '评估通过', '客流数据支撑充分，同意试运行一个月。'),
        dl(addDays(TODAY, -7), '陈立（管委会）', '派发给 孙倩（人事部）', '期望完成：' + ymd(addDays(TODAY, -3))),
        dl(addDays(TODAY, -4), '孙倩（人事部）', '完成处理', '已完成兼职招募与排班调整')
      ]
    },
    {
      id: 'XQ03', code: 'XQ20261012003', storeId: 'ST05', storeName: '武汉光谷天地店',
      title: '收银系统高峰时段频繁卡顿', targetDept: '技术部',
      desc: '每天 19:00-21:00 收银系统出现明显卡顿，单笔结账耗时由 20 秒拉长到 1 分钟以上，\n上周已出现 3 次顾客放弃排队的情况。请技术部排查。',
      images: [ph('收银卡顿截图', '#DC3D42', '#A82A2E')], links: [], createdAt: iso(addDays(TODAY, -1)),
      status: 'pending', review: null, assign: null, complete: null, confirm: null,
      logs: [dl(addDays(TODAY, -1), '张涛（武汉光谷天地店）', '提交需求', '')]
    },
    {
      id: 'XQ04', code: 'XQ20261013004', storeId: 'ST06', storeName: '南京河西天街店',
      title: '申请新版收银系统操作培训', targetDept: '技术部',
      desc: '门店近期新入职 3 名员工，未接受过新版收银系统培训，希望技术部安排一次线上培训。',
      images: [], links: [], createdAt: iso(addDays(TODAY, -1)),
      status: 'pending', review: null, assign: null, complete: null, confirm: null,
      logs: [dl(addDays(TODAY, -1), '赵雪（南京河西天街店）', '提交需求', '')]
    },
    {
      id: 'XQ05', code: 'XQ20261010005', storeId: 'ST02', storeName: '苏州大悦城店',
      title: '隔壁新开同类门店，申请调整营销方案', targetDept: '营销部',
      desc: '同楼层 3 楼本月新开一家卡牌主题店，主打低价体验，对我店客流有分流影响。\n申请针对该情况调整本店营销方案（体验价套餐 / 会员专享）。',
      images: [ph('竞品门店现场', '#E4592B', '#8B4FE0'), ph('竞品价格牌', '#D24B9B', '#7C4DE0')],
      links: [], createdAt: iso(addDays(TODAY, -3)),
      status: 'approved',
      review: { byId: 'HQ03', byName: '马超', at: iso(addDays(TODAY, -2)), result: 'pass', comment: '竞争应对必要，通过；建议先出低成本方案试跑。' },
      assign: null, complete: null, confirm: null,
      logs: [
        dl(addDays(TODAY, -3), '王倩（苏州大悦城店）', '提交需求', ''),
        dl(addDays(TODAY, -2), '马超（管委会）', '评估通过', '竞争应对必要，通过；建议先出低成本方案试跑。')
      ]
    },
    {
      id: 'XQ06', code: 'XQ20261009006', storeId: 'ST03', storeName: '苏州绿宝广场店',
      title: '申请增加一台卡牌补货展示柜', targetDept: '采购部',
      desc: '现有展示柜容量已满，热销卡牌经常性缺货展示。申请增加一台三层补货展示柜（预算约 3200 元）。',
      images: [ph('现有展示柜', '#0F9D58', '#0B7A44')],
      links: [{ title: '展示柜选型比价表', url: 'https://docs.cwsj.com/purchase/shelf-compare' }],
      createdAt: iso(addDays(TODAY, -4)),
      status: 'assigned',
      review: { byId: 'HQ02', byName: '周敏', at: iso(addDays(TODAY, -3)), result: 'pass', comment: '陈列是转化关键，预算合理，通过。' },
      assign: { toId: 'HQ05', toName: '王浩', dept: '采购部', at: iso(addDays(TODAY, -3)), expectDate: ymd(addDays(TODAY, 4)), note: '已完成比价，走常规采购流程。' },
      complete: null, confirm: null,
      logs: [
        dl(addDays(TODAY, -4), '陈晨（苏州绿宝广场店）', '提交需求', ''),
        dl(addDays(TODAY, -3), '周敏（管委会）', '评估通过', '陈列是转化关键，预算合理，通过。'),
        dl(addDays(TODAY, -3), '周敏（管委会）', '派发给 王浩（采购部）', '期望完成：' + ymd(addDays(TODAY, 4)))
      ]
    },
    {
      id: 'XQ07', code: 'XQ20261008007', storeId: 'ST07', storeName: '无锡万象城店',
      title: '申请更换门口灯箱画面', targetDept: '营销部',
      desc: '门口灯箱画面为开业时版本，已使用近 7 个月，落灰且内容过时，申请更换为最新主视觉。',
      images: [ph('门口灯箱现状', '#C98A00', '#9A6A00')], links: [], createdAt: iso(addDays(TODAY, -9)),
      status: 'rejected',
      review: { byId: 'HQ01', byName: '陈立', at: iso(addDays(TODAY, -8)), result: 'reject', comment: '本季度物料预算已用完，顺延至下季度统一更换全部门店灯箱，本单不单独处理。' },
      assign: null, complete: null, confirm: null,
      logs: [
        dl(addDays(TODAY, -9), '周航（无锡万象城店）', '提交需求', ''),
        dl(addDays(TODAY, -8), '陈立（管委会）', '评估驳回', '本季度物料预算已用完，顺延至下季度统一更换全部门店灯箱。')
      ]
    },
    {
      id: 'XQ08', code: 'XQ20261012008', storeId: 'ST08', storeName: '杭州滨江天街店',
      title: '申请补充冬季节日主题物料', targetDept: '营销部',
      desc: '商场将在 11 月开展统一节日氛围活动，申请同步补充本店节日主题物料（立牌、拉旗、贴纸）。',
      images: [], links: [], createdAt: iso(addDays(TODAY, -2)),
      status: 'assigned',
      review: { byId: 'HQ03', byName: '马超', at: iso(addDays(TODAY, -2)), result: 'pass', comment: '与商场活动协同，通过。' },
      assign: { toId: 'HQ13', toName: '蒋楠', dept: '营销部', at: iso(addDays(TODAY, -2)), expectDate: ymd(addDays(TODAY, 5)), note: '物料已在制作，预计 3 个工作日内发出。' },
      complete: null, confirm: null,
      logs: [
        dl(addDays(TODAY, -2), '孙悦（杭州滨江天街店）', '提交需求', ''),
        dl(addDays(TODAY, -2), '马超（管委会）', '评估通过', '与商场活动协同，通过。'),
        dl(addDays(TODAY, -2), '马超（管委会）', '派发给 蒋楠（营销部）', '期望完成：' + ymd(addDays(TODAY, 5)))
      ]
    }
  ];

  /* ---- 通讯录 ---- */
  const contacts = hq.map(u => ({
    id: 'C' + u.id, name: u.name, dept: u.dept, title: u.title, duty: u.duty,
    phone: u.phone, wechat: u.wechat, email: u.email
  }));
  contacts.push({
    id: 'CS1', name: '园区服务前台', dept: '人事部', title: '前台 / 客服值班',
    duty: '门店日常咨询、考勤异常报备、系统账号与密码问题转接',
    phone: '400-820-1100', wechat: 'cwsj-service', email: 'service@cwsj.com'
  });

  return {
    meta: { version: 1, seedDay: ymd(TODAY), createdAt: iso(now) },
    departments: DEPARTMENTS.slice(),
    regions: regions,
    assessCfg: {
      mode: 'ratio',          // ratio=比例折算  step=阶梯得分
      base: 100,              // 基础分
      completionWeight: 50,   // 完成率占分
      ontimeWeight: 30,       // 按时率占分（剩余 20 分为基础分）
      lateSubmitDeduct: 2,    // 任务逾期提交（补交）每次扣
      overdueMissDeduct: 5,   // 任务逾期未交每次扣
      demandOverdueDeduct: 5, // 需求处理超期每次扣
      demandFailDeduct: 10,   // 需求被退回重做每次扣
      passLine: 60            // 合格线
    },
    stores: stores,
    hq: hq,
    tasks: tasks,
    records: records,
    demands: demands,
    contacts: contacts
  };
}

/* 以下三个函数是 store.js 中同名函数的种子期副本，
   避免 seed.js 依赖 store.js 的加载顺序 */
function occDueSeed(t, date) {
  const d = startOfDay(date);
  if (t.cycle === 'daily') return atTime(ymd(d), t.time);
  if (t.cycle === 'weekly') return atTime(ymd(addDays(startOfWeek(d), (t.weekday || 7) - 1)), t.time);
  if (t.cycle === 'monthly') {
    const m = startOfMonth(d);
    const last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    return atTime(ymd(new Date(m.getFullYear(), m.getMonth(), Math.min(t.monthDay || 1, last))), t.time);
  }
  return new Date(t.deadline);
}
function occKeySeed(t, date) {
  if (t.cycle === 'daily') return ymd(date);
  if (t.cycle === 'weekly') return weekKey(date);
  if (t.cycle === 'monthly') return monthKey(date);
  return 'once';
}
function taskActiveOnSeed(t, date) {
  if (t.cycle === 'once') return true;
  const due = occDueSeed(t, date).getTime();
  if (t.startDate && due < atTime(t.startDate, '00:00').getTime()) return false;
  if (t.stopDate && due > atTime(t.stopDate, '23:59').getTime()) return false;
  return true;
}
