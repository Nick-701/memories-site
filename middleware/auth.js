const { userQueries } = require('../db/database');

// Require login
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: '请先登录' });
  }
  // Attach user to request
  const user = userQueries.findById.get(req.session.userId);
  if (!user) {
    req.session.destroy();
    return res.status(401).json({ error: '用户不存在' });
  }
  req.user = user;
  next();
}

// Require admin
function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: '请先登录' });
  }
  const user = userQueries.findById.get(req.session.userId);
  if (!user || !user.is_admin) {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  req.user = user;
  next();
}

// Optional login — attaches user if logged in, but doesn't block
function optionalLogin(req, res, next) {
  if (req.session.userId) {
    const user = userQueries.findById.get(req.session.userId);
    if (user) req.user = user;
  }
  next();
}

module.exports = { requireLogin, requireAdmin, optionalLogin };
