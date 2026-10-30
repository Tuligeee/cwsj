/* =========================================================
   import.js — 任务批量导入（前端模块）
   独立文件：样式自带（注入 <style>）、逻辑自包含，
   对原有代码的唯一侵入是 view-hq.js 里那一行按钮。

   流程：选文件 → POST /api/import/parse（后端解析+校验） → 预览表
        → 有错则「确认导入」置灰 → 无错点确认 → POST /api/import/commit
   ========================================================= */
(function (global) {
  'use strict';

  /* 与 api.js 同源的挂载前缀推导：直接借 api.js 那个 script 标签，
     它一定在页面里，比 document.currentScript 稳（异步调用时为 null） */
  const BASE = (function () {
    try {
      const s = document.querySelector('script[src*="js/api.js"]') || document.currentScript;
      if (!s || !s.src) return '';
      const p = new URL(s.src).pathname;
      const i = p.lastIndexOf('/js/api.js');
      if (i < 0) return '';
      return p.slice(0, i).replace(/\/$/, '');
    } catch (e) { return ''; }
  })();

  const MAX_BYTES = 8 * 1024 * 1024;
  const ACCEPT = /\.(xlsx|xls|csv)$/i;

  /* ---------------- 样式（自带，不动 app.css） ---------------- */
  const CSS = `
.imp-drop{border:1.5px dashed var(--line);border-radius:10px;padding:24px 18px;text-align:center;
  cursor:pointer;background:var(--panel-2);transition:border-color .15s,background .15s}
.imp-drop:hover,.imp-drop.on{border-color:var(--brand);background:var(--brand-50)}
.imp-drop .imp-t1{font-size:13.5px;font-weight:650;color:var(--text)}
.imp-drop .imp-t2{font-size:11.5px;color:var(--text-3);margin-top:6px;line-height:1.6}
.imp-file{display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--text-2)}
.imp-file b{color:var(--text);font-weight:600}
.imp-ext{font-size:10px;font-weight:700;letter-spacing:.4px;padding:3px 6px;border-radius:4px;
  background:var(--brand-50);color:var(--brand);flex-shrink:0}
.imp-link{font-size:12px;color:var(--brand);cursor:pointer;background:none;border:none;padding:0;font-family:inherit}
.imp-link:hover{text-decoration:underline}
.imp-sum{display:flex;gap:20px;align-items:center;padding:9px 12px;border-radius:8px;
  background:var(--panel-2);font-size:12.5px;color:var(--text-2)}
.imp-sum b{font-size:15px;font-weight:700;margin-right:4px}
.imp-sum .imp-n-ok b{color:var(--ok-tx)}
.imp-sum .imp-n-bad b{color:var(--danger-tx)}
.imp-wrap{max-height:min(46vh,340px);overflow:auto;border:1px solid var(--line);border-radius:9px}
.imp-tbl{width:100%;border-collapse:collapse;font-size:12px}
.imp-tbl th{position:sticky;top:0;background:var(--panel-3);color:var(--text-2);font-weight:600;
  text-align:left;padding:7px 9px;white-space:nowrap;border-bottom:1px solid var(--line);z-index:1}
.imp-tbl td{padding:7px 9px;border-bottom:1px solid var(--line-2);vertical-align:top;color:var(--text)}
.imp-tbl tr:last-child td{border-bottom:none}
.imp-tbl tr.imp-bad td{background:var(--danger-bg)}
.imp-tbl .imp-c{text-align:center;white-space:nowrap;color:var(--text-2)}
.imp-tbl .imp-no{color:var(--text-3);font-variant-numeric:tabular-nums}
.imp-err{color:var(--danger-tx);font-size:11.5px;line-height:1.5;margin-top:2px}
.imp-okx{color:var(--ok-tx);font-size:11.5px}
.imp-tip{font-size:11.5px;color:var(--text-3);margin-top:8px;line-height:1.6}
.imp-busy{padding:26px;text-align:center;font-size:13px;color:var(--text-2)}
`;

  function injectCss() {
    if (document.getElementById('cwsj-import-css')) return;
    const st = document.createElement('style');
    st.id = 'cwsj-import-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------------- 请求 ---------------- */
  function authToken() {
    return (global.Api && Api.getToken && Api.getToken()) || localStorage.getItem('cwsj_token_v1') || '';
  }

  async function postJson(path, body) {
    const res = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + authToken() },
      body: JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* 非 JSON */ }
    if (!res.ok) {
      const e = new Error((data && data.msg) || ('请求失败（' + res.status + '）'));
      e.payload = data;
      throw e;
    }
    return data;
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error('读取文件失败，请重试'));
      fr.readAsDataURL(file);
    });
  }

  function humanSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  /* ---------------- 主弹窗 ---------------- */
  function open(onDone) {
    injectCss();

    let file = null;          // 当前选中的 File
    let dataUrl = '';         // base64
    let busy = false;

    const dropBox = h('div', { class: 'imp-drop' });
    const preview = h('div', { style: { marginTop: '14px' } });
    const btnCommit = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => doCommit() }, '确认导入');

    const input = h('input', {
      type: 'file', accept: '.xlsx,.xls,.csv',
      style: { display: 'none' },
      onchange: (e) => { const f = e.target.files && e.target.files[0]; if (f) takeFile(f); e.target.value = ''; }
    });

    function paintDrop() {
      clear(dropBox);
      if (!file) {
        dropBox.appendChild(h('div', { class: 'imp-t1' }, '点击选择文件，或把 Excel 拖到这里'));
        dropBox.appendChild(h('div', { class: 'imp-t2' },
          '支持 .xlsx / .xls / .csv，单个文件 ≤ 8MB'));
        return;
      }
      const ext = (file.name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4);
      dropBox.appendChild(h('div', { class: 'imp-file' }, [
        h('span', { class: 'imp-ext', text: ext }),
        h('b', { text: file.name }),
        h('span', { style: { color: 'var(--text-3)' }, text: humanSize(file.size) }),
        h('button', { class: 'imp-link', style: { marginLeft: 'auto' }, onclick: (e) => { e.stopPropagation(); input.click(); } }, '重新选择'),
        h('button', { class: 'imp-link', onclick: (e) => { e.stopPropagation(); reset(); } }, '清除')
      ]));
    }

    function reset() {
      file = null; dataUrl = ''; busy = false;
      clear(preview);
      paintDrop();
      btnCommit.disabled = true;
      btnCommit.textContent = '确认导入';
    }

    function setBusy(text) {
      clear(preview);
      preview.appendChild(h('div', { class: 'imp-busy', text: text }));
    }

    async function takeFile(f) {
      if (!ACCEPT.test(f.name)) { toast('只支持 .xlsx / .xls / .csv 文件', 'err'); return; }
      if (f.size > MAX_BYTES) { toast('文件超过 8MB，请拆成多个文件导入', 'err'); return; }
      file = f;
      paintDrop();
      btnCommit.disabled = true;
      setBusy('正在解析并校验…');
      try {
        const url = await readAsDataUrl(f);
        dataUrl = url;
        const r = await postJson('/api/import/parse', { filename: f.name, base64: url });
        paintPreview(r);
      } catch (e) {
        clear(preview);
        preview.appendChild(h('div', {
          class: 'imp-err', style: { padding: '12px', background: 'var(--danger-bg)', borderRadius: '8px', fontSize: '12.5px' },
          text: '✕ ' + e.message
        }));
        btnCommit.disabled = true;
      }
    }

    /* ---------------- 预览表 ---------------- */
    function paintPreview(r) {
      clear(preview);
      const s = r.summary;

      const sum = h('div', { class: 'imp-sum' }, [
        h('span', {}, [h('b', { text: String(s.total) }), '行数据']),
        h('span', { class: 'imp-n-ok' }, [h('b', { text: String(s.ok) }), '条可导入']),
        s.bad ? h('span', { class: 'imp-n-bad' }, [h('b', { text: String(s.bad) }), '条不合格']) : null,
        h('span', { style: { marginLeft: 'auto', color: 'var(--text-3)' }, text: '合计 ' + s.storeTotal + ' 个门店次' })
      ]);
      preview.appendChild(sum);

      const thead = h('thead', {}, h('tr', {}, [
        h('th', { style: { width: '42px' } }, '行'),
        h('th', {}, '任务标题'),
        h('th', { style: { width: '62px' } }, '类型'),
        h('th', { style: { width: '52px' } }, '门店'),
        h('th', { style: { width: '132px' } }, '时间'),
        h('th', { style: { width: '46%' } }, '状态')
      ]));

      const tbody = h('tbody');
      r.rows.forEach((row) => {
        const st = row.ok
          ? h('div', { class: 'imp-okx', text: '✓ 可以导入' })
          : h('div', {}, row.errors.map((e, i) => h('div', { class: 'imp-err', text: (i === 0 ? '' : '· ') + e })));
        tbody.appendChild(h('tr', { class: row.ok ? '' : 'imp-bad' }, [
          h('td', { class: 'imp-c imp-no', text: String(row.rowNo) }),
          h('td', { text: row.brief.title }),
          h('td', { class: 'imp-c', text: row.brief.cycleLabel }),
          h('td', { class: 'imp-c', text: row.brief.storeCount ? String(row.brief.storeCount) : '—' }),
          h('td', { class: 'imp-c', text: row.brief.timeText || '—' }),
          h('td', {}, st)
        ]));
      });

      preview.appendChild(h('div', { class: 'imp-wrap' }, h('table', { class: 'imp-tbl' }, [thead, tbody])));

      if (r.canCommit) {
        preview.appendChild(h('div', { class: 'imp-tip' },
          '全部通过校验。点「确认导入」后会一次性创建 ' + s.ok + ' 条任务，门店立即可见。'));
        btnCommit.disabled = false;
        btnCommit.textContent = '确认导入 ' + s.ok + ' 条';
      } else {
        preview.appendChild(h('div', { class: 'imp-tip', style: { color: 'var(--danger-tx)' } },
          '有 ' + s.bad + ' 行不合格 —— 按「整批回滚」规则，本次一条都不会导入。请改好表格后重新上传。'));
        btnCommit.disabled = true;
        btnCommit.textContent = '有 ' + s.bad + ' 行需修正';
      }
    }

    /* ---------------- 确认导入 ---------------- */
    async function doCommit() {
      if (busy || !dataUrl) return;
      busy = true;
      const old = btnCommit.textContent;
      btnCommit.disabled = true;
      btnCommit.textContent = '正在导入…';
      try {
        const r = await postJson('/api/import/commit', { filename: file.name, base64: dataUrl });
        toast('已导入 ' + r.added + ' 条任务', 'ok');
        inst.close();
        /* 服务端已 +1 版本：重新 bootstrap，避免下一次整份保存带着旧版本号 */
        try {
          const b = await Api.bootstrap();
          Api.applyServerState({ version: b.version, state: b.state });
        } catch (_) { /* 拉不到就让用户手动刷新，任务已经进库了 */ }
        onDone && onDone();
      } catch (e) {
        busy = false;
        btnCommit.disabled = false;
        btnCommit.textContent = old;
        toast(e.message, 'err');
        /* 版本冲突（别人刚改过）：直接把最新情况摊开，让用户重导 */
        if (e.payload && e.payload.code === 'VERSION_CONFLICT') {
          preview.appendChild(h('div', {
            class: 'imp-err', style: { marginTop: '10px', padding: '10px 12px', background: 'var(--danger-bg)', borderRadius: '8px' }
          }, e.message));
        }
      }
    }

    /* 拖拽 */
    dropBox.addEventListener('click', () => { if (!busy) input.click(); });
    dropBox.addEventListener('dragover', (e) => { e.preventDefault(); dropBox.classList.add('on'); });
    dropBox.addEventListener('dragleave', () => dropBox.classList.remove('on'));
    dropBox.addEventListener('drop', (e) => {
      e.preventDefault();
      dropBox.classList.remove('on');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) takeFile(f);
    });

    paintDrop();

    const body = h('div', {}, [
      input,
      dropBox,
      h('div', { class: 'row', style: { marginTop: '12px', gap: '14px', alignItems: 'center' } }, [
        h('span', { class: 'imp-tip', style: { margin: '0' }, text: '第一次用？' }),
        h('button', {
          class: 'imp-link', onclick: () => downloadTemplate('xlsx')
        }, '下载 Excel 模板'),
        h('button', { class: 'imp-link', onclick: () => downloadTemplate('csv') }, '下载 CSV 模板')
      ]),
      preview
    ]);

    const inst = openModal({
      title: '批量导入派发任务',
      sub: '一行一个任务；先预览校验，全部通过才会真正下发',
      wide: true,
      body: body,
      footer: [
        h('button', { class: 'btn', onclick: () => inst.close() }, '取消'),
        btnCommit
      ]
    });

    function downloadTemplate(fmt) {
      const url = BASE + '/api/import/template' + (fmt === 'csv' ? '?format=csv' : '');
      fetch(url, { headers: { Authorization: 'Bearer ' + authToken() } })
        .then((res) => {
          if (!res.ok) throw new Error('模板下载失败（' + res.status + '）');
          return res.blob();
        })
        .then((blob) => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = '任务批量导入模板.' + (fmt === 'csv' ? 'csv' : 'xlsx');
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        })
        .catch((e) => toast(e.message, 'err'));
    }

    return inst;
  }

  global.CwsjImport = { open: open };
})(window);
