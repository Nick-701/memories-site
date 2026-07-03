const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { photoQueries } = require('../db/database');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;
    cb(null, allowed.test(path.extname(file.originalname)));
  }
});

// GET /api/photos — all photos (feed)
router.get('/', (req, res) => {
  try {
    const photos = photoQueries.findAll.all();
    res.json({ photos });
  } catch (err) {
    console.error('Get photos error:', err);
    res.status(500).json({ error: '获取照片失败' });
  }
});

// GET /api/photos/user/:userId
router.get('/user/:userId', (req, res) => {
  try {
    const photos = photoQueries.findByUser.all(req.params.userId);
    res.json({ photos });
  } catch (err) {
    console.error('Get user photos error:', err);
    res.status(500).json({ error: '获取照片失败' });
  }
});

// POST /api/photos — upload up to 9 photos, or text-only post (朋友圈风格)
router.post('/', requireLogin, (req, res, next) => {
  // Check if there are files - if not, handle as text-only
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return handleTextPost(req, res);
  }
  upload.array('photos', 9)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    // If no files but there's a title, treat as text-only
    if ((!req.files || req.files.length === 0)) {
      if (req.body.title && req.body.title.trim()) {
        return handleTextPost(req, res);
      }
      return res.status(400).json({ error: '请选择照片或输入文字' });
    }
    try {
      const { title = '' } = req.body;
      const postGroup = require('crypto').randomBytes(8).toString('hex');
      const photos = [];
      req.files.forEach(file => {
        const result = photoQueries.create.run(req.user.id, 'individual', file.filename, title, '', postGroup);
        photos.push(photoQueries.findById.get(result.lastInsertRowid));
      });
      res.json({ success: true, photos, postGroup });
    } catch (e) {
      console.error('Upload error:', e);
      res.status(500).json({ error: '上传失败' });
    }
  });
});

function handleTextPost(req, res) {
  try {
    const { title = '' } = req.body;
    if (!title.trim()) return res.status(400).json({ error: '请输入内容' });
    const postGroup = require('crypto').randomBytes(8).toString('hex');
    const result = photoQueries.create.run(req.user.id, 'individual', '', title, '', postGroup);
    const photo = photoQueries.findById.get(result.lastInsertRowid);
    res.json({ success: true, photos: [photo], postGroup, textOnly: true });
  } catch (e) {
    console.error('Text post error:', e);
    res.status(500).json({ error: '发布失败' });
  }
}

// DELETE /api/photos/:id
router.delete('/:id', requireLogin, (req, res) => {
  try {
    const photo = photoQueries.findById.get(req.params.id);
    if (!photo) return res.status(404).json({ error: '照片不存在' });
    if (!req.user.is_admin && photo.user_id !== req.user.id) {
      return res.status(403).json({ error: '无权删除' });
    }
    const filePath = path.join(UPLOADS_DIR, photo.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    photoQueries.delete.run(req.params.id);
    const { db } = require('../db/database');
    db.prepare('DELETE FROM likes WHERE target_type = ? AND target_id = ?').run('photo', req.params.id);
    db.prepare('DELETE FROM comments WHERE target_type = ? AND target_id = ?').run('photo', req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete photo error:', err);
    res.status(500).json({ error: '删除失败' });
  }
});

// DELETE /api/photos — admin clears all photos
router.delete('/', requireLogin, (req, res) => {
  try {
    if (!req.user.is_admin) return res.status(403).json({ error: '需要管理员权限' });
    // Delete all photo files
    const allPhotos = photoQueries.findAll.all();
    allPhotos.forEach(p => {
      const fp = path.join(UPLOADS_DIR, p.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    });
    // Clear DB
    const { db } = require('../db/database');
    db.prepare('DELETE FROM likes WHERE target_type = ?').run('photo');
    db.prepare('DELETE FROM comments WHERE target_type = ?').run('photo');
    db.prepare('DELETE FROM photos').run();
    // Reset avatars
    db.prepare("UPDATE users SET avatar = ''").run();
    res.json({ success: true });
  } catch (err) {
    console.error('Clear photos error:', err);
    res.status(500).json({ error: '清除失败' });
  }
});

module.exports = router;
