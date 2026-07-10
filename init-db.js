const sqlite3 = require('sqlite3').verbose();

console.log('Initializing database tables...');

const db = new sqlite3.Database('./database.db');

// Enhanced database schema for universal system with multi-tenant support
db.serialize(() => {
  // Organizations table for multi-tenant support
  db.run(`
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- healthcare, education, corporate, manufacturing, government, retail
      address TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      domain TEXT, -- organization domain for email-based auto-assignment
      settings TEXT, -- JSON for organization-specific settings
      is_active INTEGER DEFAULT 1,
      deleted INTEGER DEFAULT 0, -- Soft delete flag
      deleted_at DATETIME, -- When organization was deleted
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Enhanced users table with organization binding
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      digital_id TEXT PRIMARY KEY,
      organization_id INTEGER DEFAULT 1,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      role TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      industry_type TEXT NOT NULL, -- healthcare, education, corporate, etc.
      is_verified INTEGER DEFAULT 0,
      is_approved INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      profile_data TEXT, -- JSON for industry-specific data
      last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
  `);

  // Enhanced attendance table
  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      digital_id TEXT NOT NULL,
      organization_id INTEGER DEFAULT 1,
      attendance_method TEXT DEFAULT 'manual', -- qr, gps, manual, biometric
      location_data TEXT, -- JSON for GPS coordinates, location info
      punch_type TEXT NOT NULL, -- in, out, break_start, break_end
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      verified_by TEXT, -- For manager verification
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY (digital_id) REFERENCES users (digital_id),
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
  `);

  // **NEW TABLE: Pending requests for manual punch with admin approval**
  db.run(`
    CREATE TABLE IF NOT EXISTS pending_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      digital_id TEXT NOT NULL,
      organization_id INTEGER DEFAULT 1,
      punch_type TEXT NOT NULL, -- in, out, break_start, break_end
      requested_timestamp DATETIME NOT NULL, -- when user wants to punch
      attendance_method TEXT DEFAULT 'manual',
      location_data TEXT, -- JSON for GPS coordinates, location info
      notes TEXT,
      status TEXT DEFAULT 'pending', -- pending, approved, rejected
      admin_id TEXT, -- who approved/rejected
      admin_notes TEXT, -- admin's reason/comments
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      decision_at DATETIME,
      FOREIGN KEY (digital_id) REFERENCES users (digital_id),
      FOREIGN KEY (organization_id) REFERENCES organizations (id),
      FOREIGN KEY (admin_id) REFERENCES users (digital_id)
    );
  `);

  // QR codes table for secure attendance - Enhanced for single-use
  db.run(`
    CREATE TABLE IF NOT EXISTS qr_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER DEFAULT 1,
      assigned_user TEXT, -- User this QR is assigned to (for single-use)
      code TEXT NOT NULL UNIQUE, -- QR data (JSON string)
      location_name TEXT NOT NULL,
      valid_from DATETIME DEFAULT CURRENT_TIMESTAMP,
      valid_until DATETIME NOT NULL,
      is_active INTEGER DEFAULT 1,
      is_used INTEGER DEFAULT 0, -- For single-use QR codes
      used_by TEXT, -- Who actually used it
      used_method TEXT, -- 'scan' or 'manual'
      used_at DATETIME, -- When it was used
      usage_count INTEGER DEFAULT 0,
      max_usage INTEGER DEFAULT 0, -- 0 for unlimited
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id),
      FOREIGN KEY (assigned_user) REFERENCES users (digital_id),
      FOREIGN KEY (used_by) REFERENCES users (digital_id)
    );
  `);

  // Organization codes table for user registration verification
  db.run(`
    CREATE TABLE IF NOT EXISTS organization_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      code TEXT NOT NULL UNIQUE,
      description TEXT,
      created_by TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      usage_count INTEGER DEFAULT 0,
      max_uses INTEGER, -- NULL for unlimited
      expires_at DATETIME, -- NULL for no expiration
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id),
      FOREIGN KEY (created_by) REFERENCES users (digital_id)
    );
  `);

  // Organization setups table for managing multiple organization configurations
  db.run(`
    CREATE TABLE IF NOT EXISTS organization_setups (
      id TEXT PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      setup_name TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      address TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      settings TEXT,
      codes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
  `);

  // Subjects table for education industry - stores individual subjects
  db.run(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER DEFAULT 1,
      subject_code TEXT UNIQUE NOT NULL,
      subject_name TEXT NOT NULL,
      description TEXT,
      credits INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
  `);

  // Classes table for education industry - now represents class groups/containers
  db.run(`
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER DEFAULT 1,
      class_code TEXT UNIQUE NOT NULL,
      class_name TEXT NOT NULL,
      semester TEXT,
      academic_year TEXT,
      max_students INTEGER DEFAULT 50,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
  `);

  // Class-Subjects junction table - links classes to subjects with teachers
  db.run(`
    CREATE TABLE IF NOT EXISTS class_subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      teacher_id TEXT NOT NULL,
      schedule_time TEXT,
      room_number TEXT,
      max_students INTEGER DEFAULT 50,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes (id),
      FOREIGN KEY (subject_id) REFERENCES subjects (id),
      FOREIGN KEY (teacher_id) REFERENCES users (digital_id),
      UNIQUE(class_id, subject_id, teacher_id)
    );
  `);

  // Students table for education industry
  db.run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      roll_number TEXT UNIQUE NOT NULL,
      email TEXT,
      phone TEXT,
      class_id INTEGER,
      organization_id INTEGER DEFAULT 1,
      parent_contact TEXT,
      emergency_contact TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes (id),
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
  `);

  // Lectures table for education industry - individual lecture instances scheduled by teachers
  db.run(`
    CREATE TABLE IF NOT EXISTS lectures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_subject_id INTEGER NOT NULL,
      teacher_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      scheduled_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      room_number TEXT,
      status TEXT DEFAULT 'scheduled', -- scheduled, ongoing, completed, cancelled
      attendance_taken INTEGER DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_subject_id) REFERENCES class_subjects (id),
      FOREIGN KEY (teacher_id) REFERENCES users (digital_id)
    );
  `);

  // Subject attendance table for education industry - tracks attendance per subject
  db.run(`
    CREATE TABLE IF NOT EXISTS subject_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lecture_id INTEGER, -- Link to specific lecture instance
      class_subject_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      date DATE NOT NULL,
      is_present INTEGER NOT NULL,
      marked_by TEXT NOT NULL,
      marked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      late_arrival INTEGER DEFAULT 0,
      early_departure INTEGER DEFAULT 0,
      FOREIGN KEY (lecture_id) REFERENCES lectures (id),
      FOREIGN KEY (class_subject_id) REFERENCES class_subjects (id),
      FOREIGN KEY (student_id) REFERENCES students (id),
      FOREIGN KEY (marked_by) REFERENCES users (digital_id),
      UNIQUE(lecture_id, student_id)
    );
  `);

  // Enhanced departments/facilities table for industry-specific organization
  db.run(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER DEFAULT 1,
      name TEXT NOT NULL,
      type TEXT, -- department, ward, facility, etc.
      manager_id TEXT,
      location TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id),
      FOREIGN KEY (manager_id) REFERENCES users (digital_id)
    );
  `);

  // Faculty table for education industry
  db.run(`
    CREATE TABLE IF NOT EXISTS faculty (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faculty_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      department_id INTEGER,
      position TEXT,
      specialization TEXT,
      is_active INTEGER DEFAULT 1,
      organization_id INTEGER DEFAULT 2,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments (id),
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
  `);

  // Faculty-Class association table for education industry
  db.run(`
    CREATE TABLE IF NOT EXISTS faculty_classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faculty_id TEXT NOT NULL,
      class_id INTEGER NOT NULL,
      role TEXT DEFAULT 'instructor', -- instructor, assistant, guest, etc.
      is_primary INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (faculty_id) REFERENCES faculty (faculty_id),
      FOREIGN KEY (class_id) REFERENCES classes (id),
      UNIQUE(faculty_id, class_id)
    );
  `);

  // Create class schedules table for education industry
  db.run(`
    CREATE TABLE IF NOT EXISTS class_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      teacher_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL, -- 0=Sunday, 1=Monday, ..., 6=Saturday
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      room_number TEXT,
      recurring INTEGER DEFAULT 1, -- 1=weekly recurring, 0=one-time
      start_date DATE NOT NULL,
      end_date DATE,
      is_active INTEGER DEFAULT 1,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes (id),
      FOREIGN KEY (teacher_id) REFERENCES users (digital_id)
    );
  `);

  console.log(' Database tables initialized successfully');
});

db.close((err) => {
  if (err) {
    console.error('❌ Error closing database:', err);
  } else {
    console.log(' Database connection closed');
  }
});
