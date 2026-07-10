const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db');

console.log('Initializing database schema...');

db.serialize(() => {z
  // Organizations table for multi-tenant support
  db.run(`
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      address TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      domain TEXT,
      settings TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Organization setups table for managing multiple organization configurations
  db.run(`
    CREATE TABLE IF NOT EXISTS organization_setups (
      id TEXT PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      address TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      settings TEXT,
      codes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
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
      industry_type TEXT NOT NULL,
      is_verified INTEGER DEFAULT 0,
      is_approved INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      profile_data TEXT,
      last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
  `);

  // Pending requests table for manual punch approvals
  db.run(`
    CREATE TABLE IF NOT EXISTS pending_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      digital_id TEXT NOT NULL,
      organization_id INTEGER NOT NULL,
      punch_type TEXT NOT NULL,
      attendance_method TEXT,
      requested_timestamp DATETIME NOT NULL,
      location_data TEXT,
      notes TEXT,
      status TEXT DEFAULT 'pending',
      admin_id TEXT,
      admin_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      decision_at DATETIME,
      FOREIGN KEY (digital_id) REFERENCES users (digital_id),
      FOREIGN KEY (organization_id) REFERENCES organizations (id),
      FOREIGN KEY (admin_id) REFERENCES users (digital_id)
    );
  `);

  // Attendance logs table
  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      digital_id TEXT NOT NULL,
      organization_id INTEGER NOT NULL,
      punch_type TEXT NOT NULL,
      timestamp DATETIME NOT NULL,
      location_data TEXT,
      ip_address TEXT,
      attendance_method TEXT,
      notes TEXT,
      verified_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (digital_id) REFERENCES users (digital_id),
      FOREIGN KEY (organization_id) REFERENCES organizations (id),
      FOREIGN KEY (verified_by) REFERENCES users (digital_id)
    );
  `);

  // QR codes table
  db.run(`
    CREATE TABLE IF NOT EXISTS qr_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      assigned_user TEXT,
      code TEXT UNIQUE,
      location_name TEXT,
      valid_until DATETIME,
      max_usage INTEGER DEFAULT 1,
      usage_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id),
      FOREIGN KEY (assigned_user) REFERENCES users (digital_id),
      FOREIGN KEY (created_by) REFERENCES users (digital_id)
    );
  `);

  // Organization codes table for registration verification
  db.run(`
    CREATE TABLE IF NOT EXISTS organization_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      max_uses INTEGER,
      usage_count INTEGER DEFAULT 0,
      expires_at DATETIME,
      is_active INTEGER DEFAULT 1,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id),
      FOREIGN KEY (created_by) REFERENCES users (digital_id)
    );
  `);

  // Subjects table for educational system
  db.run(`
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      subject_code TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      description TEXT,
      credits INTEGER DEFAULT 3,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id)
    );
  `);

  // Classes table for organizing subjects and students
  db.run(`
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      class_code TEXT NOT NULL,
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

  // Class subjects junction table
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
      FOREIGN KEY (teacher_id) REFERENCES users (digital_id)
    );
  `);

  // Students table for enrollment
  db.run(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      class_id INTEGER,
      class_subject_id INTEGER,
      roll_number TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users (digital_id),
      FOREIGN KEY (class_id) REFERENCES classes (id),
      FOREIGN KEY (class_subject_id) REFERENCES class_subjects (id)
    );
  `);

  // Default organizations for different industries
  const defaultOrganizations = [
    {id: 1, name: 'Universal Demo Hospital', type: 'healthcare', contact_email: 'admin@hospital.com', contact_phone: '+1-555-0101', address: '123 Medical Center Dr'},
    {id: 2, name: 'Universal Demo University', type: 'education', contact_email: 'admin@university.com', contact_phone: '+1-555-0202', address: '456 University Ave'},
    {id: 3, name: 'Universal Demo Corporation', type: 'corporate', contact_email: 'admin@corporation.com', contact_phone: '+1-555-0303', address: '789 Business Blvd'},
    {id: 4, name: 'Universal Demo Manufacturing', type: 'manufacturing', contact_email: 'admin@manufacturing.com', contact_phone: '+1-555-0404', address: '321 Industrial Way'}
  ];

  defaultOrganizations.forEach(org => {
    db.run(`
      INSERT OR IGNORE INTO organizations (id, name, type, contact_email, contact_phone, address)
      VALUES (?, ?, ?, ?, ?, ?);
    `, [org.id, org.name, org.type, org.contact_email, org.contact_phone, org.address]);
  });

  console.log('Database schema initialized successfully');

  // Verify organizations were created
  db.all('SELECT id, name, contact_phone, contact_email FROM organizations', [], (err, rows) => {
    if (err) {
      console.error('Error verifying organizations:', err);
    } else {
      console.log('Organizations created:');
      rows.forEach(row => {
        console.log(`ID: ${row.id}, Name: ${row.name}, Phone: ${row.contact_phone}, Email: ${row.contact_email}`);
      });
    }
    db.close();
  });
});
