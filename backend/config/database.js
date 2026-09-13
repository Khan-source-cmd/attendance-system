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

  // ---- Sector-specific operational tables (replace all mock/demo data) ----
  const sectorTables = `
    CREATE TABLE IF NOT EXISTS production_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'Idle',
      efficiency INTEGER DEFAULT 0,
      output INTEGER DEFAULT 0,
      workers INTEGER DEFAULT 0,
      target_output INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
    CREATE TABLE IF NOT EXISTS equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'Operational',
      location TEXT,
      last_maintenance TEXT,
      next_maintenance TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
    CREATE TABLE IF NOT EXISTS safety_areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'Compliant',
      last_inspection TEXT,
      next_due TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
    CREATE TABLE IF NOT EXISTS store_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      current_value TEXT,
      target_value TEXT,
      percentage INTEGER DEFAULT 0,
      status TEXT DEFAULT 'success',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      current_qty INTEGER DEFAULT 0,
      minimum INTEGER DEFAULT 0,
      status TEXT DEFAULT 'good',
      supplier TEXT,
      last_restocked TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
    CREATE TABLE IF NOT EXISTS staff_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      employee_name TEXT NOT NULL,
      position TEXT,
      date TEXT,
      start_time TEXT,
      end_time TEXT,
      hours INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Scheduled',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'Planning',
      progress INTEGER DEFAULT 0,
      deadline TEXT,
      team TEXT,
      members INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
    CREATE TABLE IF NOT EXISTS meeting_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      capacity INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Available',
      next_booking TEXT,
      current_meeting TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
    CREATE TABLE IF NOT EXISTS public_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      today_count INTEGER DEFAULT 0,
      avg_wait_time TEXT,
      satisfaction INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
    CREATE TABLE IF NOT EXISTS compliance_areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'Compliant',
      last_audit TEXT,
      next_due TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      person_name TEXT NOT NULL,
      department TEXT,
      position TEXT,
      date TEXT,
      start_time TEXT,
      end_time TEXT,
      hours INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Scheduled',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      room TEXT,
      doctor TEXT,
      department TEXT,
      status TEXT DEFAULT 'stable',
      last_visit TEXT,
      next_appointment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
    CREATE TABLE IF NOT EXISTS compliance_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      check_type TEXT NOT NULL,
      status TEXT DEFAULT 'pass',
      result_pct INTEGER DEFAULT 0,
      message TEXT,
      staff TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
  `;
  sectorTables.split(';').filter(s => s.trim()).forEach(stmt => db.run(stmt));
});

module.exports = { db, dbFile };