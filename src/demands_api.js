'use strict';
/* 提需资源接口（2026-10-30，测试环境）
   把提需的每个动作拆成独立接口，服务端做权限校验，前端不用整份回写。
   动作与现网语义完全一致：提交 / 重新提交 / 评估 / 派发 / 完成 / 确认 / 退回 / 归档 / 删除。 */

const S = require('./db.js');
const split = require('./split.js');
const changelog = require('./changelog.js');

const STATUS = {
  pending: '待评估', approved: '已通过 · 待派发', assigned: '处理中',
  completed: '已完成 · 待门店确认', confirmed: '已确认归档', rejected: '已驳回',
};

function withRetry(mutator, actorId) {
  for (let i = 0; i < 5; i++) {
    const st = S.getState();
    if (!st) return { ok: false, msg: '数据未初始化' };
    const state = st.state;
    const _before = changelog.capture(state);
    const out = mutator(state, actorId);
    if (out && out.fail) return { ok: false, status: out.status || 400, msg: out.fail };
    const r = S.saveState(state, st.version, actorId || 'api');
    if (r.ok) {
      try { changelog.commit(_before, state, actorId); } catch (e) {}
      try { split.syncToTables(state); } catch (e) { /* 镜像失败不影响业务 */ }
      try { require('./snapshots').snapshot(state, r.version, actorId, 'API 写入'); } catch (e) {}
      return { ok: true, version: r.version, result: out && out.result };
    }
    if (r.code !== 'VERSION_CONFLICT') return { ok: false, msg: '保存失败' };
  }
  return { ok: false, msg: '并发冲突，请重试' };
}

const find = (state, id) => (state.demands || []).find(d => d.id === id) || null;

function pushLog(d, actorName, action, note) {
  d.logs = d.logs || [];
  d.logs.push({ at: new Date().toISOString(), by: actorName || '系统', action: action, note: note || '' });
}

function register(app, requireAuth, log) {

  /* 新建 / 门店修改后重新提交 */
  app.post('/api/demands', requireAuth, (req, res) => {
    const body = req.body || {};
    const d = body.demand;
    if (!d || !d.id) return res.status(400).json({ ok: false, msg: '缺少需求 id' });
    if (req.actor.isStore && d.storeId !== req.actor.id) {
      return res.status(403).json({ ok: false, msg: '门店只能提交本店的需求' });
    }
    const r = withRetry((state) => {
      state.demands = state.demands || [];
      const i = state.demands.findIndex(x => x.id === d.id);
      if (i >= 0) Object.assign(state.demands[i], d);
      else state.demands.unshift(d);
      return { result: d };
    }, req.actor.id);
    if (!r.ok) return res.status(r.status || 400).json({ ok: false, msg: r.msg });
    log(req.actor.id, 'demand.upsert', d.code || d.id);
    res.json({ ok: true, version: r.version, demand: r.result });
  });

  const action = (path, fn, name) => {
    app.post('/api/demands/:id/' + path, requireAuth, (req, res) => {
      const r = withRetry((state, actorId) => fn(state, req.params.id, req.body || {}, req.actor, actorId), req.actor.id);
      if (!r.ok) return res.status(r.status || 400).json({ ok: false, msg: r.msg });
      log(req.actor.id, 'demand.' + name, req.params.id);
      res.json({ ok: true, version: r.version, demand: r.result });
    });
  };

  /* 评估 */
  action('review', (state, id, body, actor) => {
    const d = find(state, id);
    if (!d) return { fail: '需求不存在', status: 404 };
    if (!actor.isCommittee) return { fail: '只有管委会可以评估', status: 403 };
    if (d.status !== 'pending') return { fail: '只有待评估的需求可以评估', status: 400 };
    const result = body.result === 'pass' ? 'pass' : 'reject';
    d.review = { byId: actor.id, byName: actor.name, at: new Date().toISOString(), result: result, comment: body.comment || '' };
    d.status = result === 'pass' ? 'approved' : 'rejected';
    d.assign = null;
    pushLog(d, actor.name + '（管委会）', result === 'pass' ? '评估通过' : '评估驳回', body.comment);
    return { result: d };
  }, 'review');

  /* 派发 */
  action('assign', (state, id, body, actor) => {
    const d = find(state, id);
    if (!d) return { fail: '需求不存在', status: 404 };
    if (!actor.isCommittee && !actor.isAdmin) return { fail: '只有管委会可以派发', status: 403 };
    if (d.status !== 'approved') return { fail: '只有已通过的需求可以派发', status: 400 };
    if (!body.toId) return { fail: '必须指定责任人', status: 400 };
    const u = (state.hq || []).find(x => x.id === body.toId) || null;
    d.assign = {
      toId: body.toId, toName: u ? u.name : '—', dept: u ? u.dept : '—',
      at: new Date().toISOString(), expectDate: body.expectDate || '', note: body.note || '',
    };
    d.status = 'assigned';
    d.complete = null;
    pushLog(d, actor.name + '（管委会）', '派发给 ' + d.assign.toName + '（' + d.assign.dept + '）',
      '期望完成：' + d.assign.expectDate + (body.note ? '　' + body.note : ''));
    return { result: d };
  }, 'assign');

  /* 处理完成 */
  action('complete', (state, id, body, actor) => {
    const d = find(state, id);
    if (!d) return { fail: '需求不存在', status: 404 };
    if (!d.assign || d.assign.toId !== actor.id) return { fail: '只有该需求的责任人可以提交处理结果', status: 403 };
    if (d.status !== 'assigned') return { fail: '只有处理中的需求可以提交结果', status: 400 };
    d.complete = {
      byId: actor.id, byName: actor.name, at: new Date().toISOString(),
      text: body.text || '', images: body.images || [], links: body.links || [],
    };
    d.status = 'completed';
    pushLog(d, actor.name + '（' + (actor.dept || '') + '）', '完成处理', body.text);
    return { result: d };
  }, 'complete');

  /* 门店确认 */
  action('confirm', (state, id, body, actor) => {
    const d = find(state, id);
    if (!d) return { fail: '需求不存在', status: 404 };
    if (!actor.isStore || d.storeId !== actor.id) return { fail: '只有提出需求的门店可以确认完成', status: 403 };
    if (d.status !== 'completed') return { fail: '只有已完成的待确认需求可以确认', status: 400 };
    d.confirm = { at: new Date().toISOString(), rating: body.rating || 0, comment: body.comment || '' };
    d.status = 'confirmed';
    pushLog(d, actor.name, '确认完成并评分', (body.rating || 0) + ' 星' + (body.comment ? '　' + body.comment : ''));
    return { result: d };
  }, 'confirm');

  /* 退回重做 */
  action('reopen', (state, id, body, actor) => {
    const d = find(state, id);
    if (!d) return { fail: '需求不存在', status: 404 };
    if (!actor.isStore || d.storeId !== actor.id) return { fail: '只有提出需求的门店可以退回', status: 403 };
    if (d.status !== 'completed' && d.status !== 'confirmed') return { fail: '只有已完成的需求可以退回', status: 400 };
    d.status = 'assigned';
    d.complete = null;
    d.confirm = null;
    pushLog(d, actor.name, '退回重做', body.comment || '');
    return { result: d };
  }, 'reopen');

  /* 归档 / 取消归档 */
  action('archive', (state, id, body, actor) => {
    const d = find(state, id);
    if (!d) return { fail: '需求不存在', status: 404 };
    if (!actor.isCommittee && !actor.isAdmin) return { fail: '只有管委会或管理员可以归档', status: 403 };
    const on = body.on !== false;
    if (on) {
      if (d.status !== 'completed' && d.status !== 'confirmed') return { fail: '只有已完成的需求可以归档', status: 400 };
      d.archivedAt = new Date().toISOString();
      d.archivedBy = actor.name;
      pushLog(d, actor.name, '归档需求', '');
    } else {
      d.archivedAt = null;
      d.archivedBy = null;
      pushLog(d, actor.name, '取消归档', '');
    }
    return { result: d };
  }, 'archive');

  /* 软删除 */
  app.delete('/api/demands/:id', requireAuth, (req, res) => {
    const r = withRetry((state, actorId) => {
      const d = find(state, req.params.id);
      if (!d) return { fail: '需求不存在', status: 404 };
      const actor = req.actor;
      const isOwner = actor.isStore && d.storeId === actor.id;
      if (!actor.isAdmin && !isOwner) return { fail: '无权删除该需求', status: 403 };
      if (d.status !== 'pending' && d.status !== 'rejected') return { fail: '该状态的需求不允许删除', status: 400 };
      d.deletedAt = new Date().toISOString();
      d.deletedBy = actor.id;
      d.deletedByName = actor.name;
      pushLog(d, actor.name, '删除需求', '状态：' + (STATUS[d.status] || d.status));
      return { result: d };
    }, req.actor.id);
    if (!r.ok) return res.status(r.status || 400).json({ ok: false, msg: r.msg });
    log(req.actor.id, 'demand.delete', req.params.id);
    res.json({ ok: true, version: r.version, demand: r.result });
  });
}

module.exports = { register };
