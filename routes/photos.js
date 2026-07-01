const express = require('express');
const multer = require('multer');
const path = require('path');
const { photoQueries } = require('../db/database');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const fs = require('fs');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Configure multer for photo uploads
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('仅支持图片格式 (jpg, png, gif, webp, bmp)'));
    }
  }
});

// GET /api/photos — list photos (optional ?category=group|individual)
router.get('/', (req, res) => {
  try {
    const { category } = req.query;
    let photos;
    if (category && ['group', 'individual'].includes(category)) {
      photos = photoQueries.findByCategory.all(category);
    } else {
      photos = photoQueries.findAll.all();
    }
    res.json({ photos });
  } catch (err) {
    console.error('Get photos error:', err);
    res.status(500).json({ error: '获取照片失败' });
  }
});

// GET /api/photos/user/:userId — photos by a specific user
router.get('/user/:userId', (req, res) => {
  try {
    const photos = photoQueries.findByUser.all(req.params.userId);
    res.json({ photos });
  } catch (err) {
    console.error('Get user photos error:', err);
    res.status(500).json({ error: '获取照片失败' });
  }
});

// POST /api/photos — upload photo
router.post('/', requireLogin, upload.single('photo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择照片' });
    }
    const { title = '', description = '' } = req.body;
    // Admin uploads are 'group', members upload 'individual'
    const category = req.user.is_admin ? 'group' : 'individual';

    const result = photoQueries.create.run(
      req.user.id, category, req.file.filename, title, description
    );
    const photo = photoQueries.findById.get(result.lastInsertRowid);
    res.json({ success: true, photo });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: '上传失败' });
  }
});

// DELETE /api/photos/:id
router.delete('/:id', requireLogin, (req, res) => {
  try {
    const photo = photoQueries.findById.get(req.params.id);
    if (!photo) return res.status(404).json({ error: '照片不存在' });
    // Only admin or the owner can delete
    if (!req.user.is_admin && photo.user_id !== req.user.id) {
      return res.status(403).json({ error: '无权删除' });
    }
    // Delete file
    const filePath = path.join(UPLOADS_DIR, photo.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    // Delete DB record
    photoQueries.delete.run(req.params.id);
    // Also delete associated likes & comments
    const { db } = require('../db/database');
    db.prepare('DELETE FROM likes WHERE target_type = ? AND target_id = ?').run('photo', req.params.id);
    db.prepare('DELETE FROM comments WHERE target_type = ? AND target_id = ?').run('photo', req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete photo error:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

module.exports = router;
