const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Use persistent volume on Railway, local path otherwise
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');
const DB_PATH = path.join(DATA_DIR, 'data.db');
// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Ensure db directory permissions are fine
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ======================== Schema ========================
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    invite_code TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    is_admin INTEGER DEFAULT 0,
    bio TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    class_name TEXT DEFAULT '',
    title TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    category TEXT NOT NULL CHECK(category IN ('group','individual')),
    filename TEXT NOT NULL,
    title TEXT DEFAULT '',
    description TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    location TEXT DEFAULT '',
    description TEXT DEFAULT '',
    image TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    target_type TEXT NOT NULL CHECK(target_type IN ('photo','member','event')),
    target_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, target_type, target_id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    target_type TEXT NOT NULL CHECK(target_type IN ('photo','member','event')),
    target_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Safe migration: add columns if missing (won't error if column exists)
try { db.exec('ALTER TABLE users ADD COLUMN title TEXT DEFAULT \'\''); } catch(e) {}

// ======================== User Queries ========================
const userQueries = {
  findByInviteCode: db.prepare('SELECT * FROM users WHERE invite_code = ?'),
  findById: db.prepare('SELECT id, name, is_admin, bio, avatar, class_name, title, invite_code, created_at FROM users WHERE id = ?'),
  findByName: db.prepare('SELECT * FROM users WHERE name = ?'),
  findAll: db.prepare('SELECT id, name, is_admin, bio, avatar, class_name, title, created_at FROM users ORDER BY id'),
  create: db.prepare('INSERT INTO users (name, invite_code, password_hash, is_admin, class_name, title) VALUES (?, ?, ?, ?, ?, ?)'),
  updateProfile: db.prepare('UPDATE users SET bio = ?, avatar = ? WHERE id = ?'),
  updateTitle: db.prepare('UPDATE users SET title = ? WHERE id = ?'),
  updatePassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
  getInviteCodes: db.prepare('SELECT id, name, class_name, title, invite_code, is_admin, password_hash FROM users ORDER BY id'),
  countAdmins: db.prepare('SELECT COUNT(*) as count FROM users WHERE is_admin = 1'),
};

// ======================== Photo Queries ========================
const photoQueries = {
  findAll: db.prepare(`
    SELECT p.*, u.name as user_name FROM photos p
    LEFT JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC
  `),
  findByCategory: db.prepare(`
    SELECT p.*, u.name as user_name FROM photos p
    LEFT JOIN users u ON p.user_id = u.id
    WHERE p.category = ? ORDER BY p.created_at DESC
  `),
  findByUser: db.prepare(`
    SELECT p.*, u.name as user_name FROM photos p
    LEFT JOIN users u ON p.user_id = u.id
    WHERE p.user_id = ? ORDER BY p.created_at DESC
  `),
  findById: db.prepare('SELECT p.*, u.name as user_name FROM photos p LEFT JOIN users u ON p.user_id = u.id WHERE p.id = ?'),
  create: db.prepare('INSERT INTO photos (user_id, category, filename, title, description) VALUES (?, ?, ?, ?, ?)'),
  delete: db.prepare('DELETE FROM photos WHERE id = ?'),
};

// ======================== Event Queries ========================
const eventQueries = {
  findAll: db.prepare('SELECT * FROM events ORDER BY date DESC'),
  findById: db.prepare('SELECT * FROM events WHERE id = ?'),
  create: db.prepare('INSERT INTO events (title, date, location, description, image) VALUES (?, ?, ?, ?, ?)'),
  delete: db.prepare('DELETE FROM events WHERE id = ?'),
};

// ======================== Like Queries ========================
const likeQueries = {
  toggle: function (userId, targetType, targetId) {
    const existing = db.prepare('SELECT id FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?').get(userId, targetType, targetId);
    if (existing) {
      db.prepare('DELETE FROM likes WHERE id = ?').run(existing.id);
      return { liked: false };
    } else {
      db.prepare('INSERT INTO likes (user_id, target_type, target_id) VALUES (?, ?, ?)').run(userId, targetType, targetId);
      return { liked: true };
    }
  },
  count: db.prepare('SELECT COUNT(*) as count FROM likes WHERE target_type = ? AND target_id = ?'),
  hasLiked: db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?'),
  countByTargets: function (targetType, targetIds) {
    if (!targetIds.length) return {};
    const placeholders = targetIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT target_id, COUNT(*) as count FROM likes WHERE target_type = ? AND target_id IN (${placeholders}) GROUP BY target_id`).all(targetType, ...targetIds);
    const map = {};
    rows.forEach(r => { map[r.target_id] = r.count; });
    return map;
  },
  userLikes: db.prepare('SELECT target_id FROM likes WHERE user_id = ? AND target_type = ?'),
};

// ======================== Comment Queries ========================
const commentQueries = {
  findByTarget: db.prepare(`
    SELECT c.*, u.name as user_name FROM comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.target_type = ? AND c.target_id = ?
    ORDER BY c.created_at ASC
  `),
  create: db.prepare('INSERT INTO comments (user_id, target_type, target_id, content) VALUES (?, ?, ?, ?)'),
  delete: db.prepare('DELETE FROM comments WHERE id = ?'),
  countByTargets: function (targetType, targetIds) {
    if (!targetIds.length) return {};
    const placeholders = targetIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT target_id, COUNT(*) as count FROM comments WHERE target_type = ? AND target_id IN (${placeholders}) GROUP BY target_id`).all(targetType, ...targetIds);
    const map = {};
    rows.forEach(r => { map[r.target_id] = r.count; });
    return map;
  },
};

// ======================== Export ========================
module.exports = {
  db,
  userQueries,
  photoQueries,
  eventQueries,
  likeQueries,
  commentQueries,
};
