/* =========================================================
   auth.js — 登录态与角色判定
   关键原则：角色一律从数据库 real-time 读取后重判，
   绝不相信前端传来的 role / isAdmin 之类的字段。
   ========================================================= */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { findUserById } = require('./db');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SECRET_FILE = path.join(DATA_DIR, 'jwt.secret');

/** 密钥持久化：重启容器/服务后已签发的 token 仍然有效 */
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();
const TTL = process.env.JWT_TTL || '30d';

function sign(user) {
  return jwt.sign({ uid: user.id, t: user.type }, SECRET, { expiresIn: TTL });
}

/** 从 users 表取最新档案，并算出角色（与前端 isStore/isHq/... 一一对应） */
function loadActor(uid) {
  const row = findUserById(uid);
  if (!row || !row.enabled) return null;
  const profile = JSON.parse(row.profile);
  return {
    ...profile,
    id: row.id,
    type: row.type,
    account: row.account,
    enabled: !!row.enabled,
    isStore: row.type === 'store',
    isHq: row.type === 'hq',
    isCommittee: row.type === 'hq' && !!profile.committee,
    /* 人事权限并入管理员（2026-10-22 用户定）：管理员自带通讯录维护权，不再单独开关。
       部门为「人事部」的人仍自动具备，作为兜底。 */
    isHR: row.type === 'hq' && (!!profile.admin || profile.dept === '人事部'),
    isAdmin: row.type === 'hq' && !!profile.admin,
  };
}

/** 中间件：解析 Bearer token 并挂载 req.actor */
function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : (req.query.token || '');
  if (!token) return res.status(401).json({ ok: false, code: 'NO_TOKEN', msg: '请先登录' });
  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch (e) {
    return res.status(401).json({ ok: false, code: 'BAD_TOKEN', msg: '登录已过期，请重新登录' });
  }
  const actor = loadActor(payload.uid);
  if (!actor) return res.status(403).json({ ok: false, code: 'DISABLED', msg: '账号已停用，请联系管理员' });
  req.actor = actor;
  next();
}

/** 角色守卫 */
const need = (...roles) => (req, res, next) => {
  const a = req.actor;
  const pass = roles.some((r) => a[r]);
  if (!pass) return res.status(403).json({ ok: false, code: 'FORBIDDEN', msg: '没有权限执行该操作' });
  next();
};

module.exports = { sign, requireAuth, need, loadActor, SECRET };
