const express = require('express');
const { likeQueries, commentQueries } = require('../db/database');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

// ======================== Likes ========================

// POST /api/likes — toggle like
router.post('/likes', requireLogin, (req, res) => {
  try {
    const { target_type, target_id } = req.body;
    if (!target_type || !target_id) {
      return res.status(400).json({ error: '缺少参数' });
    }
    if (!['photo', 'member', 'event'].includes(target_type)) {
      return res.status(400).json({ error: '无效的目标类型' });
    }
    const result = likeQueries.toggle(req.user.id, target_type, target_id);
    const count = likeQueries.count.get(target_type, target_id).count;
    res.json({ success: true, liked: result.liked, count });
  } catch (err) {
    console.error('Toggle like error:', err);
    res.status(500).json({ error: '操作失败' });
  }
});

// GET /api/likes — check like status & count
router.get('/likes', (req, res) => {
  try {
    const { target_type, target_id, user_id } = req.query;
    if (!target_type || !target_id) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const count = likeQueries.count.get(target_type, target_id).count;
    let liked = false;
    if (user_id) {
      liked = !!likeQueries.hasLiked.get(user_id, target_type, target_id);
    }
    res.json({ count, liked });
  } catch (err) {
    console.error('Get likes error:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// ======================== Comments ========================

// GET /api/comments
router.get('/comments', (req, res) => {
  try {
    const { target_type, target_id } = req.query;
    if (!target_type || !target_id) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const comments = commentQueries.findByTarget.all(target_type, target_id);
    res.json({ comments });
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ error: '获取评论失败' });
  }
});

// POST /api/comments
router.post('/comments', requireLogin, (req, res) => {
  try {
    const { target_type, target_id, content } = req.body;
    if (!target_type || !target_id || !content) {
      return res.status(400).json({ error: '缺少参数' });
    }
    if (!['photo', 'member', 'event'].includes(target_type)) {
      return res.status(400).json({ error: '无效的目标类型' });
    }
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > 500) {
      return res.status(400).json({ error: '评论内容1-500字' });
    }
    const result = commentQueries.create.run(req.user.id, target_type, target_id, trimmed);
    // Fetch the created comment with user name
    const comment = require('../db/database').db.prepare(
      'SELECT c.*, u.name as user_name FROM comments c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?'
    ).get(result.lastInsertRowid);
    res.json({ success: true, comment });
  } catch (err) {
    console.error('Create comment error:', err);
    res.status(500).json({ error: '评论失败' });
  }
});

// DELETE /api/comments/:id
router.delete('/comments/:id', requireLogin, (req, res) => {
  try {
    const { db } = require('../db/database');
    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
    if (!comment) return res.status(404).json({ error: '评论不存在' });
    if (!req.user.is_admin && comment.user_id !== req.user.id) {
      return res.status(403).json({ error: '无权删除' });
    }
    commentQueries.delete.run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

module.exports = router;
