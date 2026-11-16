/* 图片能力 · 纯函数单元测试
   被测对象全部来自产品代码（util.js / ui.js），不是复制品：
   imgSrc、_vwSrc、fitImageSize、isImageFile，以及异步的 readImage 实际压缩结果。 */
(function () {
  var cases = [];

  function eq(actual, expected) {
    var a = JSON.stringify(actual), b = JSON.stringify(expected);
    return { ok: a === b, detail: a === b ? a : ('期望 ' + b + '，实际 ' + a) };
  }

  function t(group, name, fn) {
    var r;
    try { r = fn(); }
    catch (e) { r = { ok: false, detail: '抛错: ' + e.message }; }
    cases.push({ group: group, name: name, ok: !!r.ok, detail: r.detail == null ? '' : String(r.detail) });
  }

  /* ---------------- imgSrc：图片地址归一化 ---------------- */
  t('imgSrc', '普通相对路径不变', function () { return eq(imgSrc('uploads/a.jpg'), 'uploads/a.jpg'); });
  t('imgSrc', '去掉前导斜杠', function () { return eq(imgSrc('/uploads/a.jpg'), 'uploads/a.jpg'); });
  t('imgSrc', '剥掉 /cwsj/ 前缀', function () { return eq(imgSrc('/cwsj/uploads/a.jpg'), 'uploads/a.jpg'); });
  t('imgSrc', '剥掉 /cwsj/cwsj/ 双层前缀', function () { return eq(imgSrc('/cwsj/cwsj/uploads/202610/x.jpg'), 'uploads/202610/x.jpg'); });
  t('imgSrc', '剥掉 /cwsj/cwsj-stg/ 混合前缀', function () { return eq(imgSrc('/cwsj/cwsj-stg/uploads/a.jpg'), 'uploads/a.jpg'); });
  t('imgSrc', '外链原样返回', function () { return eq(imgSrc('https://cdn.x.com/a.jpg'), 'https://cdn.x.com/a.jpg'); });
  t('imgSrc', '协议相对 // 原样返回', function () { return eq(imgSrc('//cdn.x.com/a.jpg'), '//cdn.x.com/a.jpg'); });
  t('imgSrc', 'data URL 原样返回', function () { return eq(imgSrc('data:image/png;base64,AAA'), 'data:image/png;base64,AAA'); });
  t('imgSrc', '空值返回空串', function () { return eq(imgSrc(null), ''); });
  t('imgSrc', '只有空白也返回空串', function () { return eq(imgSrc('   '), ''); });

  /* ---------------- _vwSrc：查看器里的地址判断 ---------------- */
  t('_vwSrc', 'blob URL 原样', function () { return eq(_vwSrc('blob:http://x/1'), 'blob:http://x/1'); });
  t('_vwSrc', '相对路径走 imgSrc 规则', function () { return eq(_vwSrc('/cwsj/uploads/a.jpg'), 'uploads/a.jpg'); });
  t('_vwSrc', '外链原样', function () { return eq(_vwSrc('http://x.com/a.png'), 'http://x.com/a.png'); });

  /* ---------------- fitImageSize：压缩尺寸 ---------------- */
  t('fitImageSize', '4000×3000 → 1920×1440', function () { return eq(fitImageSize(4000, 3000, 1920), { w: 1920, h: 1440 }); });
  t('fitImageSize', '小图不放大', function () { return eq(fitImageSize(800, 600, 1920), { w: 800, h: 600 }); });
  t('fitImageSize', '竖图按长边缩：1200×2400 → 960×1920', function () { return eq(fitImageSize(1200, 2400, 1920), { w: 960, h: 1920 }); });
  t('fitImageSize', '正方形 3000×3000 → 1920×1920', function () { return eq(fitImageSize(3000, 3000, 1920), { w: 1920, h: 1920 }); });
  t('fitImageSize', '刚好等于上限不动', function () { return eq(fitImageSize(1920, 1080, 1920), { w: 1920, h: 1080 }); });
  t('fitImageSize', '极端长图仍守上限', function () { return eq(fitImageSize(600, 12000, 1920), { w: 96, h: 1920 }); });
  t('fitImageSize', 'NaN / 缺参不崩', function () {
    var r = fitImageSize(NaN, undefined, 1920);
    return { ok: r.w === 0 && r.h === 0, detail: JSON.stringify(r) };
  });

  /* ---------------- isImageFile：可上传文件判定 ---------------- */
  t('isImageFile', 'image/png 为真', function () { return eq(isImageFile({ type: 'image/png' }), true); });
  t('isImageFile', 'image/jpeg 为真', function () { return eq(isImageFile({ type: 'image/jpeg' }), true); });
  t('isImageFile', 'application/pdf 为假', function () { return eq(isImageFile({ type: 'application/pdf' }), false); });
  t('isImageFile', '无 MIME 时看扩展名 .JPG', function () { return eq(isImageFile({ type: '', name: 'a.JPG' }), true); });
  t('isImageFile', '无 MIME 时看扩展名 .png', function () { return eq(isImageFile({ type: '', name: 'a.png' }), true); });
  t('isImageFile', '无 MIME 时看扩展名 .txt', function () { return eq(isImageFile({ type: '', name: 'a.txt' }), false); });
  t('isImageFile', '空对象为假', function () { return eq(isImageFile({}), false); });
  t('isImageFile', 'null 为假', function () { return eq(isImageFile(null), false); });

  /* ---------------- 判定状态：openVerdict / warnCountOf ---------------- */
  var V1 = { kind: 'fail', at: '2026-11-14T02:00:00Z', reason: '照片糊', needRedo: true, redoDue: '2026-11-15T02:00:00Z', resolvedAt: null };
  var V2 = { kind: 'warn', at: '2026-11-14T03:00:00Z', reason: '', needRedo: false, resolvedAt: '2026-11-14T04:00:00Z' };

  t('verdict', '没有判定返回 null', function () { return eq(openVerdict({}), null); });
  t('verdict', 'null 记录不崩', function () { return eq(openVerdict(null), null); });
  t('verdict', '未结案的判定原样返回', function () {
    var r = openVerdict({ verdicts: [V1] });
    return { ok: r === V1, detail: r && r.kind };
  });
  t('verdict', '已结案的判定不算未结案', function () { return eq(openVerdict({ verdicts: [V2] }), null); });
  t('verdict', '多条时取最新的未结案那条', function () {
    var b = { kind: 'fail', at: 'x', resolvedAt: null };
    return { ok: openVerdict({ verdicts: [V2, b] }) === b, detail: '' };
  });
  t('warning', '没有判定时次数为 0', function () { return eq(warnCountOf({}), 0); });
  t('warning', '只数警告、不数不合格', function () { return eq(warnCountOf({ verdicts: [V1, V2] }), 1); });
  t('warning', '两条警告计 2 次（含已结案）', function () {
    return eq(warnCountOf({ verdicts: [V2, { kind: 'warn', at: 'y', resolvedAt: null }] }), 2);
  });

  /* ---------------- 考核计分：assessScore ---------------- */
  var CFG = { mode: 'ratio', base: 100, completionWeight: 50, ontimeWeight: 30, lateSubmitDeduct: 2, overdueMissDeduct: 5, warnDeduct: 5, passLine: 60 };
  t('assessScore', '满分 → 100', function () {
    return eq(assessScore(CFG, { rate: 100, ontimeRate: 100 }).total, 100);
  });
  t('assessScore', '一条警告扣 5 分', function () {
    return eq(assessScore(CFG, { rate: 100, ontimeRate: 100, warnN: 1 }).total, 95);
  });
  t('assessScore', '警告分可配成 0（不扣）', function () {
    return eq(assessScore(Object.assign({}, CFG, { warnDeduct: 0 }), { rate: 100, ontimeRate: 100, warnN: 3 }).total, 100);
  });
  t('assessScore', '逾期未交 2 次 + 警告 1 次 = 100 − 10 − 5', function () {
    return eq(assessScore(CFG, { rate: 100, ontimeRate: 100, missed: 2, warnN: 1 }).total, 85);
  });
  t('assessScore', '缺字段不产生 NaN', function () {
    var r = assessScore(CFG, {});
    return { ok: !isNaN(r.total), detail: String(r.total) };
  });
  t('assessScore', '扣分超过基础分时封底 0', function () {
    return eq(assessScore(CFG, { rate: 0, ontimeRate: 0, missed: 100, warnN: 10 }).total, 0);
  });
  t('assessScore', '合格线判定跟着总分走', function () {
    var ok = assessScore(CFG, { rate: 100, ontimeRate: 100 }).pass;
    var no = assessScore(CFG, { rate: 0, ontimeRate: 0, missed: 20 }).pass;
    return { ok: ok === true && no === false, detail: ok + '/' + no };
  });

  /* ---------------- 渲染 ---------------- */
  function render() {
    var rows = document.getElementById('rows');
    var pass = 0, fail = 0, curGroup = '';
    cases.forEach(function (c) {
      if (c.group !== curGroup) {
        curGroup = c.group;
        var head = document.createElement('tr');
        head.innerHTML = '<td colspan="3" class="grp">' + c.group + '</td>';
        rows.appendChild(head);
      }
      if (c.ok) pass++; else fail++;
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + c.name + '</td>'
        + '<td class="' + (c.ok ? 'ok' : 'no') + '">' + (c.ok ? 'PASS' : 'FAIL') + '</td>'
        + '<td class="d">' + (c.detail || '') + '</td>';
      rows.appendChild(tr);
    });
    document.getElementById('sum').innerHTML =
      '<div class="card"><b>' + pass + '</b><span>通过</span></div>' +
      '<div class="card"><b style="color:#DC3D42">' + fail + '</b><span>失败</span></div>' +
      '<div class="card"><b>' + cases.length + '</b><span>总计</span></div>';
    window.__unitResult = { total: cases.length, passed: pass, failed: fail, cases: cases };
  }

  /* ---------------- 异步：readImage 真的压缩了吗 ---------------- */
  function makeJpegBlob(w, h) {
    return new Promise(function (res) {
      var cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      var cx = cv.getContext('2d');
      cx.fillStyle = '#3D57D6'; cx.fillRect(0, 0, w, h);
      cv.toBlob(res, 'image/jpeg', 0.9);
    });
  }

  function measure(dataUrl) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res({ w: im.width, h: im.height }); };
      im.onerror = function () { rej(new Error('解码失败')); };
      im.src = dataUrl;
    });
  }

  async function readImageCase(name, w, h, check) {
    try {
      var blob = await makeJpegBlob(w, h);
      var dataUrl = await readImage(new File([blob], 'big.jpg', { type: 'image/jpeg' }));
      var sz = await measure(dataUrl);
      var r = check(sz, dataUrl);
      cases.push({ group: 'readImage（异步）', name: name, ok: !!r.ok, detail: r.detail });
    } catch (e) {
      cases.push({ group: 'readImage（异步）', name: name, ok: false, detail: '抛错: ' + e.message });
    }
  }

  (async function () {
    await readImageCase('4000×3000 压到长边 1920', 4000, 3000, function (sz) {
      return { ok: Math.max(sz.w, sz.h) === 1920, detail: sz.w + '×' + sz.h };
    });
    await readImageCase('1200×2400 竖图压到高 1920', 1200, 2400, function (sz) {
      return { ok: sz.h === 1920 && sz.w < sz.h, detail: sz.w + '×' + sz.h };
    });
    await readImageCase('800×600 小图不放大', 800, 600, function (sz) {
      return { ok: sz.w === 800 && sz.h === 600, detail: sz.w + '×' + sz.h };
    });
    await readImageCase('输出是 JPEG data URL', 1600, 1200, function (sz, d) {
      return { ok: /^data:image\/jpeg;base64,/.test(d), detail: d.slice(0, 32) + '…' };
    });

    try {
      await readImage(new File([new Uint8Array([1, 2, 3])], 'x.txt', { type: 'text/plain' }));
      cases.push({ group: 'readImage（异步）', name: '非图片文件被拒绝', ok: false, detail: '居然没报错' });
    } catch (e) {
      cases.push({ group: 'readImage（异步）', name: '非图片文件被拒绝', ok: /不是图片/.test(e.message), detail: e.message });
    }

    render();
  })();
})();
