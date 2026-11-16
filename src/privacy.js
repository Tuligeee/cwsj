'use strict';
/* 隐私任务：可见性判定与脱敏（2026-11-16）
   独立成模块的目的：
     1) 服务端两处要用（bootstrap 下发、PUT 回写合并）
     2) 纯函数，可以在 tests/unit-node.js 里直接单测，不用起服务、不碰数据库
   规则：
     · 非隐私任务 → 人人可见
     · 隐私任务 → 发布人 / 发布人勾选的可见人 / 管理员 / 被派到的门店（门店必须能看到自己要交的活）
     · 看不到的人拿到「脱敏存根」：只留统计必需字段，标题说明附件一律不给 */

const REDACT_KEEP = ['id', 'cycle', 'time', 'weekday', 'monthDay', 'deadline', 'startDate', 'stopDate', 'status'];

function canSeeTask(actor, t) {
  if (!t || !t.privacy) return true;
  if (!actor) return false;
  if (actor.isAdmin) return true;
  if (t.creatorId === actor.id) return true;
  if (actor.isStore && Array.isArray(t.storeIds) && t.storeIds.indexOf(actor.id) >= 0) return true;
  return Array.isArray(t.visibleTo) && t.visibleTo.indexOf(actor.id) >= 0;
}

function redactTask(t) {
  const o = { redacted: true };
  REDACT_KEEP.forEach((k) => { if (t[k] !== undefined) o[k] = t[k]; });
  o.storeIds = Array.isArray(t.storeIds) ? t.storeIds.slice() : [];
  return o;
}

/** 记录脱敏：只保留统计需要的字段（内容/图片/说明一律不给） */
function stripRecord(r) {
  return { id: r.id, taskId: r.taskId, storeId: r.storeId, periodKey: r.periodKey, doneAt: r.doneAt, late: r.late };
}

module.exports = { canSeeTask, redactTask, stripRecord, REDACT_KEEP };
