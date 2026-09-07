/**
 * Shared SQLite database connection for the whole application.
 *
 * This is the SINGLE source of truth for the database. In the past the app
 * opened multiple connections to different ./database.db files (index.js vs
 * helpers.js), causing reads and writes to land in different files. All modules
 * must import the `db` exported here:
 *   - backend/index.js          (routes + req.db)
 *   - backend/utils/helpers.js  (models layer)
 *   - backend/utils/stores.js   (OTP / reset tokens / rate limits)
 */
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbFile = path.join(__dirname, '..', 'database.db'); // backend/database.db

const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error('❌ Failed to connect to SQLite:', err.message);
    process.exit(1);
  }
  console.log('📦 Universal Attendance System - Database Connected');
});

// Enable foreign key constraints
db.run('PRAGMA foreign_keys = ON');

// Persisted runtime stores (survive restarts, unlike the old in-memory Maps).
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS otp_verifications (
      identifier  TEXT PRIMARY KEY,
      otp         TEXT NOT NULL,
      expires_at  INTEGER NOT NULL,
      attempts    INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      email      TEXT PRIMARY KEY,
      token      TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used       INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      rate_key TEXT NOT NULL,
      ts       INTEGER NOT NULL
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits (rate_key)`);

  // Security/audit event log. Auth events (logins, password resets) live here
  // instead of polluting the attendance domain table and skewing reports.
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      digital_id     TEXT,
      organization_id INTEGER,
      action         TEXT NOT NULL,
      details        TEXT,
      ip_address     TEXT,
      user_agent     TEXT,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_logs_digital_id ON audit_logs (digital_id)`);
});

module.exports = { db, dbFile };