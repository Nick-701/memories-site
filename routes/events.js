const express = require('express');
const { eventQueries } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/events
router.get('/', (req, res) => {
  try {
    const events = eventQueries.findAll.all();
    res.json({ events });
  } catch (err) {
    console.error('Get events error:', err);
    res.status(500).json({ error: '获取活动列表失败' });
  }
});

// POST /api/events (admin only)
router.post('/', requireAdmin, (req, res) => {
  try {
    const { title, date, location = '', description = '' } = req.body;
    if (!title || !date) {
      return res.status(400).json({ error: '请填写活动标题和日期' });
    }
    const result = eventQueries.create.run(title, date, location, description);
    const event = eventQueries.findById.get(result.lastInsertRowid);
    res.json({ success: true, event });
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ error: '创建活动失败' });
  }
});

// DELETE /api/events/:id (admin only)
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const event = eventQueries.findById.get(req.params.id);
    if (!event) return res.status(404).json({ error: '活动不存在' });
    eventQueries.delete.run(req.params.id);
    // Delete associated likes & comments
    const { db } = require('../db/database');
    db.prepare('DELETE FROM likes WHERE target_type = ? AND target_id = ?').run('event', req.params.id);
    db.prepare('DELETE FROM comments WHERE target_type = ? AND target_id = ?').run('event', req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete event error:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

module.exports = router;
