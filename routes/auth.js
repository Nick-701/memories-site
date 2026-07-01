const express = require('express');
const bcrypt = require('bcryptjs');
const { userQueries } = require('../db/database');

const router = express.Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
  try {
    const { inviteCode, name, password } = req.body;
    if (!inviteCode || !name || !password) {
      return res.status(400).json({ error: '请填写邀请码、姓名和密码' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: '密码至少4位' });
    }

    const invited = userQueries.findByInviteCode.get(inviteCode.trim());
    if (!invited) {
      return res.status(400).json({ error: '邀请码无效' });
    }
    if (invited.password_hash) {
      return res.status(400).json({ error: '该邀请码已被使用' });
    }
    if (invited.name !== name.trim()) {
      return res.status(400).json({ error: '姓名与名单不匹配' });
    }

    const hash = bcrypt.hashSync(password, 10);
    userQueries.updatePassword.run(hash, invited.id);

    req.session.userId = invited.id;
    const user = userQueries.findById.get(invited.id);
    res.json({ success: true, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: '注册失败' });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) {
      return res.status(400).json({ error: '请输入姓名和密码' });
    }

    const user = userQueries.findByName.get(name.trim());
    if (!user || !user.password_hash) {
      return res.status(400).json({ error: '用户不存在或未注册' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(400).json({ error: '密码错误' });
    }

    req.session.userId = user.id;
    const safe = userQueries.findById.get(user.id);
    res.json({ success: true, user: safe });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: '登录失败' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  const user = userQueries.findById.get(req.session.userId);
  res.json({ user: user || null });
});

module.exports = router;
