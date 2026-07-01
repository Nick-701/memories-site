const express = require('express');
const crypto = require('crypto');
const { db, userQueries } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

function shortCode() { return crypto.randomBytes(4).toString('hex'); }

const router = express.Router();

// POST /api/admin/import — import roster (format: "姓名 班级" per line, or "姓名,班级")
router.post('/import', requireAdmin, (req, res) => {
  try {
    const { names } = req.body; // multi-line string, each line: "姓名 班级" or "姓名,班级"
    if (!names || typeof names !== 'string' || !names.trim()) {
      return res.status(400).json({ error: '请提供名单（每行：姓名 班级）' });
    }

    const lines = names.split(/[\n]+/).map(l => l.trim()).filter(Boolean);
    const entries = lines.map(line => {
      // Split by space, comma, or Chinese comma
      const parts = line.split(/[ ,，]+/);
      const name = parts[0]?.trim();
      const className = parts.slice(1).join(' ')?.trim() || '';
      return { name, className };
    }).filter(e => e.name);

    if (!entries.length) {
      return res.status(400).json({ error: '未能解析出有效姓名' });
    }

    const insert = db.prepare('INSERT INTO users (name, invite_code, is_admin, class_name) VALUES (?, ?, 0, ?)');
    const results = [];
    const insertMany = db.transaction((entries) => {
      for (const { name, className } of entries) {
        const existing = userQueries.findByName.get(name);
        if (existing) {
          results.push({ name, className, inviteCode: existing.invite_code, skipped: true });
          continue;
        }
        const code = shortCode();
        insert.run(name, code, className);
        results.push({ name, className, inviteCode: code, skipped: false });
      }
    });
    insertMany(entries);

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

// GET /api/admin/export — export all users as .xls (HTML table format, Excel compatible)
router.get('/export', requireAdmin, (req, res) => {
  try {
    const users = userQueries.getInviteCodes.all();
    const rows = users.map(u => {
      const registered = u.password_hash ? '是' : '否';
      const admin = u.is_admin ? '是' : '否';
      return `<tr><td>${escXls(u.name)}</td><td>${escXls(u.class_name||'')}</td><td>${escXls(u.invite_code)}</td><td>${registered}</td><td>${admin}</td></tr>`;
    }).join('');
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>队员名单</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table border="1"><tr><th>姓名</th><th>班级</th><th>邀请码</th><th>是否注册</th><th>是否管理员</th></tr>${rows}</table></body></html>`;
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=队员名单.xls');
    res.send(html);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: '导出失败' });
  }
});

function escXls(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

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
