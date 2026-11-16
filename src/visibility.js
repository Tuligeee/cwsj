'use strict';
/* 隐私任务「可见人」变更通知（2026-11-16）
   只在"从无到有"时发一条站内消息；移除不发，钉钉也不发（避免打扰）。
   单独成模块的原因：任务保存有两条路径（PUT /api/state 整份、PATCH /api/tasks 单条），
   两边都要调，否则从任务表单保存时不会通知。 */
const inbox = require('./inbox');

function buildRows(task, added) {
  const id = String(task.id || '');
  const link = '#task=' + encodeURIComponent(id);
  return added.map((uid, i) => ({
    key: 'V1|' + id + '|' + uid + '|' + Date.now() + '|' + i,
    scenario: 'V1', entityId: id,
    title: '你获得了一条任务的查看权限',
    body: '**你获得了一条任务的查看权限**\n\n- 任务：' + (task.title || '') +
      '\n- 发布人：' + (task.creatorName || '') + '\n- 部门：' + (task.dept || '') +
      '\n\n[点这里查看](' + link + ')',
    hash: link,
    to: { id: uid },
  }));
}

/** 对比新旧任务，把新加入的可见人通知一遍；返回发出的条数 */
function notifyNewVisible(oldTask, newTask) {
  try {
    if (!newTask || !newTask.privacy || !Array.isArray(newTask.visibleTo)) return 0;
    const before = new Set((oldTask && oldTask.visibleTo) || []);
    const added = newTask.visibleTo.filter((uid) => uid && uid !== newTask.creatorId && !before.has(uid));
    if (!added.length) return 0;
    return inbox.ingest(buildRows(newTask, added));
  } catch (e) {
    console.error('visibility.notify', e.message);
    return 0;
  }
}

module.exports = { notifyNewVisible };
