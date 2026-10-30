'use strict';
/* 通讯录资源接口（2026-10-30，测试环境）
   权限：管委会 / 管理员 / 人事部（与前端 canEditContacts 一致） */

const S = require('./db.js');
const split = require('./split.js');
const changelog = require('./changelog.js');

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
      try { split.syncToTables(state); } catch (e) {}
      try { require('./snapshots').snapshot(state, r.version, actorId, 'API 写入'); } catch (e) {}
      return { ok: true, version: r.version, result: out && out.result };
    }
    if (r.code !== 'VERSION_CONFLICT') return { ok: false, msg: '保存失败' };
  }
  return { ok: false, msg: '并发冲突，请重试' };
}

function canEdit(actor) {
  if (!actor) return false;
  if (actor.isCommittee || actor.isAdmin) return true;
  return actor.type === 'hq' && actor.dept === '人事部';
}

function register(app, requireAuth, log) {
  app.post('/api/contacts', requireAuth, (req, res) => {
    if (!canEdit(req.actor)) return res.status(403).json({ ok: false, msg: '只有管委会 / 管理员 / 人事部可以维护通讯录' });
    const c = (req.body || {}).contact;
    if (!c || !c.name) return res.status(400).json({ ok: false, msg: '缺少姓名' });
    const r = withRetry((state) => {
      state.contacts = state.contacts || [];
      if (!c.id) c.id = 'C' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const i = state.contacts.findIndex(x => x.id === c.id);
      if (i >= 0) Object.assign(state.contacts[i], c);
      else state.contacts.push(c);
      return { result: c };
    }, req.actor.id);
    if (!r.ok) return res.status(r.status || 400).json({ ok: false, msg: r.msg });
    log(req.actor.id, 'contact.upsert', c.name);
    res.json({ ok: true, version: r.version, contact: r.result });
  });

  app.patch('/api/contacts/:id', requireAuth, (req, res) => {
    if (!canEdit(req.actor)) return res.status(403).json({ ok: false, msg: '无权修改通讯录' });
    const r = withRetry((state) => {
      const c = (state.contacts || []).find(x => x.id === req.params.id);
      if (!c) return { fail: '联系人不存在', status: 404 };
      Object.assign(c, (req.body || {}).patch || {});
      return { result: c };
    }, req.actor.id);
    if (!r.ok) return res.status(r.status || 400).json({ ok: false, msg: r.msg });
    log(req.actor.id, 'contact.patch', req.params.id);
    res.json({ ok: true, version: r.version, contact: r.result });
  });

  app.delete('/api/contacts/:id', requireAuth, (req, res) => {
    if (!canEdit(req.actor)) return res.status(403).json({ ok: false, msg: '无权删除通讯录' });
    const r = withRetry((state) => {
      const before = (state.contacts || []).length;
      state.contacts = (state.contacts || []).filter(x => x.id !== req.params.id);
      if (state.contacts.length === before) return { fail: '联系人不存在', status: 404 };
      return { result: true };
    }, req.actor.id);
    if (!r.ok) return res.status(r.status || 400).json({ ok: false, msg: r.msg });
    log(req.actor.id, 'contact.delete', req.params.id);
    res.json({ ok: true, version: r.version });
  });
}

module.exports = { register };
