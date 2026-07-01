const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db, userQueries } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// POST /api/admin/import — import roster
router.post('/import', requireAdmin, (req, res) => {
  try {
    const { names } = req.body; // array of strings or comma-separated string
    let nameList = [];
    if (Array.isArray(names)) {
      nameList = names.map(n => n.trim()).filter(Boolean);
    } else if (typeof names === 'string') {
      nameList = names.split(/[,，\n]+/).map(n => n.trim()).filter(Boolean);
    }
    if (!nameList.length) {
      return res.status(400).json({ error: '请提供名单（姓名列表，逗号或换行分隔）' });
    }

    const insert = db.prepare('INSERT INTO users (name, invite_code, is_admin) VALUES (?, ?, 0)');
    const results = [];
    const insertMany = db.transaction((names) => {
      for (const name of names) {
        // Skip if already exists
        const existing = userQueries.findByName.get(name);
        if (existing) {
          results.push({ name, inviteCode: existing.invite_code, skipped: true });
          continue;
        }
        const code = uuidv4().slice(0, 8); // Short invite code
        insert.run(name, code);
        results.push({ name, inviteCode: code, skipped: false });
      }
    });
    insertMany(nameList);

    res.json({ success: true, results });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: '导入失败' });
  }
});

// GET /api/admin/invites — view all invite codes
router.get('/invites', requireAdmin, (req, res) => {
  try {
    const users = userQueries.getInviteCodes.all();
    res.json({ users });
  } catch (err) {
    console.error('Get invites error:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// DELETE /api/admin/users/:id — remove a user (admin only)
router.delete('/users/:id', requireAdmin, (req, res) => {
  try {
    const user = userQueries.findById.get(req.params.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    if (user.is_admin) return res.status(400).json({ error: '不能删除管理员' });
    db.prepare('DELETE FROM comments WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM likes WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM photos WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

module.exports = router;
