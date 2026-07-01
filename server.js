require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const bcrypt = require('bcryptjs');
const { db, userQueries } = require('./db/database');

const DATA_DIR = process.env.DATA_DIR || __dirname;
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const fs = require('fs');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const PORT = process.env.PORT || 3000;

const app = express();

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: DATA_DIR }),
  secret: process.env.SESSION_SECRET || 'memories-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    httpOnly: true,
  }
}));

// Serve uploaded files from persistent volume
app.use('/uploads', express.static(UPLOADS_DIR));
// Also check the old location as fallback (for legacy photos)
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/members', require('./routes/members'));
app.use('/api/photos', require('./routes/photos'));
app.use('/api/events', require('./routes/events'));
app.use('/api', require('./routes/interactions'));

// Fallback to SPA — serve index.html for any non-API route
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ensure admin user exists on startup
function ensureAdmin() {
  const { count } = userQueries.countAdmins.get();
  if (count === 0) {
    const adminCode = process.env.ADMIN_INVITE_CODE || 'admin2024';
    const hash = bcrypt.hashSync('admin123', 10);
    userQueries.create.run('主持与戏剧表演队', adminCode, hash, 1, '', '队长');
    console.log('========================================');
    console.log('  默认管理员已创建:');
    console.log('  姓名: 主持与戏剧表演队');
    console.log('  邀请码: ' + adminCode);
    console.log('  密码: admin123');
    console.log('  请尽快登录修改密码！');
    console.log('========================================');
  }
}
ensureAdmin();

app.listen(PORT, () => {
  console.log(`\n🎭 主持与戏剧表演队 — 回忆网站已启动`);
  console.log(`   本地访问: http://localhost:${PORT}\n`);
});
