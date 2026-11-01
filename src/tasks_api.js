'use strict';
/* 任务资源接口（2026-10-30，测试环境）
   POST   /api/tasks          新增或整体更新一条任务（按 id upsert）
   PATCH  /api/tasks/:id      局部更新
   DELETE /api/tasks/:id      删除任务及其记录（软删除先不做，保持与现网一致语义）
   POST   /api/tasks/:id/stop
   POST   /api/tasks/:id/resume
   实现方式：在服务端读整份 state → 改 → saveState()，冲突自动重试 3 次。
   好处：前端可以只提交"一条任务"，不用整份回写，避免互相覆盖。 */

const S = require('./db.js');
const split = require('./split.js');
const changelog = require('./changelog.js');

function withRetry(mutator, tries) {
  const max = tries || 5;
  for (let i = 0; i < max; i++) {
    const st = S.getState();
    if (!st) return { ok: false, msg: '数据未初始化' };
    const state = st.state;
    const _before = changelog.capture(state);
    const out = mutator(state);
    if (out && out.fail) return { ok: false, msg: out.fail };
    const r = S.saveState(state, st.version, out && out.actorId || 'api');
    if (r.ok) {
      try { changelog.commit(_before, state, (out && out.actorId) || 'api'); } catch (e) { console.error('changelog.fail', e.message); }
      try { split.syncToTables(state); } catch (e) { /* 镜像失败不回滚业务保存 */ }
      try { require('./snapshots').snapshot(state, r.version, actorId, 'API 写入'); } catch (e) {}
      return { ok: true, version: r.version, result: out && out.result };
    }
    if (r.code !== 'VERSION_CONFLICT') return { ok: false, msg: '保存失败' };
  }
  return { ok: false, msg: '并发冲突，请重试' };
}

function findTask(state, id) {
  return (state.tasks || []).find(t => t.id === id) || null;
}

function upsertTask(state, task, actorId) {
  if (!task || !task.id) return { fail: '缺少任务 id' };
  state.tasks = state.tasks || [];
  const i = state.tasks.findIndex(t => t.id === task.id);
  if (i >= 0) Object.assign(state.tasks[i], task);
  else state.tasks.unshift(task);
  return { actorId: actorId, result: task };
}

function patchTask(state, id, patch, actorId) {
  const t = findTask(state, id);
  if (!t) return { fail: '任务不存在' };
  Object.assign(t, patch || {});
  return { actorId: actorId, result: t };
}

function dropTask(state, id) {
  const before = (state.tasks || []).length;
  state.tasks = (state.tasks || []).filter(t => t.id !== id);
  if (state.tasks.length === before) return { fail: '任务不存在' };
  state.records = (state.records || []).filter(r => r.taskId !== id);
  return { result: true };
}

function register(app, requireAuth, log) {
  /* 仅总部可维护任务；门店账号一律拒绝（2026-11-01 单测发现接口未校验角色） */
  const hqOnly = (req, res, next) => {
    if (!req.actor || !req.actor.isHq) return res.status(403).json({ ok: false, msg: '仅总部账号可维护任务' });
    next();
  };
  /* 改/停/删：只有任务发布人、管理员或管委会可以操作 */
  const ownerOrAdmin = (req, res, next) => {
    const state = require('./db.js').getState().state;
    const t = (state.tasks || []).find(x => x.id === req.params.id);
    if (!t) return res.status(404).json({ ok: false, msg: '任务不存在' });
    const a = req.actor || {};
    if (t.creatorId !== a.id && !a.isAdmin && !a.isCommittee) {
      return res.status(403).json({ ok: false, msg: '只有任务发布人或管理员可以修改该任务' });
    }
    next();
  };
  app.post('/api/tasks', requireAuth, hqOnly, (req, res) => {
    const task = (req.body || {}).task;
    if (!task || !task.id) return res.status(400).json({ ok: false, msg: '缺少任务 id' });
    /* 创建接口不接受覆盖已存在的任务，避免误覆盖（改任务请用 PATCH） */
    const exists = (require('./db.js').getState().state.tasks || []).some(t => t.id === task.id);
    if (exists) return res.status(409).json({ ok: false, msg: '任务 ID 已存在：' + task.id });
    const r = withRetry(st => upsertTask(st, task, req.actor.id));
    if (!r.ok) return res.status(400).json({ ok: false, msg: r.msg });
    log(req.actor.id, 'task.upsert', task && task.id);
    res.json({ ok: true, version: r.version, task: r.result });
  });

  app.patch('/api/tasks/:id', requireAuth, hqOnly, ownerOrAdmin, (req, res) => {
    const r = withRetry(st => patchTask(st, req.params.id, (req.body || {}).patch, req.actor.id));
    if (!r.ok) return res.status(400).json({ ok: false, msg: r.msg });
    log(req.actor.id, 'task.patch', req.params.id);
    res.json({ ok: true, version: r.version, task: r.result });
  });

  app.delete('/api/tasks/:id', requireAuth, hqOnly, ownerOrAdmin, (req, res) => {
    const r = withRetry(st => dropTask(st, req.params.id));
    if (!r.ok) return res.status(400).json({ ok: false, msg: r.msg });
    log(req.actor.id, 'task.delete', req.params.id);
    res.json({ ok: true, version: r.version });
  });

  app.post('/api/tasks/:id/stop', requireAuth, hqOnly, ownerOrAdmin, (req, res) => {
    const r = withRetry(st => patchTask(st, req.params.id, { status: 'stopped', stoppedAt: new Date().toISOString() }, req.actor.id));
    if (!r.ok) return res.status(400).json({ ok: false, msg: r.msg });
    log(req.actor.id, 'task.stop', req.params.id);
    res.json({ ok: true, version: r.version, task: r.result });
  });

  app.post('/api/tasks/:id/resume', requireAuth, hqOnly, ownerOrAdmin, (req, res) => {
    const r = withRetry(st => patchTask(st, req.params.id, { status: 'active', stoppedAt: null }, req.actor.id));
    if (!r.ok) return res.status(400).json({ ok: false, msg: r.msg });
    log(req.actor.id, 'task.resume', req.params.id);
    res.json({ ok: true, version: r.version, task: r.result });
  });
}

module.exports = { register, withRetry };
