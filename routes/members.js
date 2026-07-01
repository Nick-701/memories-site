const express = require('express');
const multer = require('multer');
const path = require('path');
const { userQueries, photoQueries } = require('../db/database');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

const avatarStorage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'public', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'avatar-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    cb(null, allowed.test(path.extname(file.originalname)));
  }
});

// GET /api/members — all members
router.get('/', (req, res) => {
  try {
    const members = userQueries.findAll.all();
    res.json({ members });
  } catch (err) {
    console.error('Get members error:', err);
    res.status(500).json({ error: '获取队员列表失败' });
  }
});

// GET /api/members/:id — single member with their photos
router.get('/:id', (req, res) => {
  try {
    const member = userQueries.findById.get(req.params.id);
    if (!member) return res.status(404).json({ error: '队员不存在' });
    const photos = photoQueries.findByUser.all(req.params.id);
    res.json({ member, photos });
  } catch (err) {
    console.error('Get member error:', err);
    res.status(500).json({ error: '获取队员信息失败' });
  }
});

// PUT /api/members/:id — update bio (and optional avatar)
router.put('/:id', requireLogin, (req, res) => {
  try {
    // Members can only edit themselves, admins can edit anyone
    if (!req.user.is_admin && req.user.id !== parseInt(req.params.id)) {
      return res.status(403).json({ error: '只能编辑自己的信息' });
    }
    const { bio } = req.body;
    const member = userQueries.findById.get(req.params.id);
    if (!member) return res.status(404).json({ error: '队员不存在' });

    userQueries.updateProfile.run(bio || member.bio, member.avatar, req.params.id);
    const updated = userQueries.findById.get(req.params.id);
    res.json({ success: true, member: updated });
  } catch (err) {
    console.error('Update member error:', err);
    res.status(500).json({ error: '更新失败' });
  }
});

// POST /api/members/:id/avatar — upload avatar
router.post('/:id/avatar', requireLogin, avatarUpload.single('avatar'), (req, res) => {
  try {
    if (!req.user.is_admin && req.user.id !== parseInt(req.params.id)) {
      return res.status(403).json({ error: '只能修改自己的头像' });
    }
    if (!req.file) return res.status(400).json({ error: '请选择头像图片' });

    const member = userQueries.findById.get(req.params.id);
    if (!member) return res.status(404).json({ error: '队员不存在' });

    userQueries.updateProfile.run(member.bio, req.file.filename, req.params.id);
    const updated = userQueries.findById.get(req.params.id);
    res.json({ success: true, member: updated });
  } catch (err) {
    console.error('Upload avatar error:', err);
    res.status(500).json({ error: '上传头像失败' });
  }
});

module.exports = router;
