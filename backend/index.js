require('dotenv').config();

const integrationController = require('./controllers/integrationController');

const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
const QRCode = require('qrcode');
const { check, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 4000;

// ---------------------------------------------------------------------------
// Environment variables - MUST be provided via backend/.env (see .env.example).
// No hard-coded secrets are allowed as fallbacks (security hardening).
// ---------------------------------------------------------------------------
function requireEnv(name, minLength = 16) {
  const value = process.env[name];
  if (!value || typeof value !== 'string' || value.trim().length < minLength) {
    console.error(`❌ Missing or insecure "${name}". Set it in backend/.env (see backend/.env.example).`);
    process.exit(1);
  }
  return value.trim();
}

const EMAIL_USER = requireEnv('EMAIL_USER');
const EMAIL_PASS = requireEnv('EMAIL_PASS');
const JWT_SECRET = requireEnv('JWT_SECRET');
const JWT_RESET_SECRET = requireEnv('JWT_RESET_SECRET');

// CORS with an explicit allow-list (from env). Never reflect arbitrary origins
// together with credentials for a browser-facing API.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:4000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Allow same-origin / non-browser requests (curl, server-to-server, etc.).
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Deny unknown origins - the browser will block the response.
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Security headers (no extra dependency needed).
// CSP allows inline scripts/styles and https CDNs because the bundled frontend
// uses them; it still blocks object/embed, framing, and off-origin base URIs.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https:; " +
    "style-src 'self' 'unsafe-inline' https:; " +
    "img-src 'self' data: blob: https:; " +
    "font-src 'self' data: https:; " +
    "connect-src 'self'; " +
    "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  );
  next();
});
app.use(express.static(path.join(__dirname, "../frontend")));

// Enhanced logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Database: single shared connection (backend/database.db).
// All modules (routes, helpers/models, stores) use this same connection so
// reads and writes cannot land in different files.
const { db, dbFile } = require('./config/database');

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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted INTEGER DEFAULT 0
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

  
  console.log('ℹ  Organization codes will be generated manually by admins only');
});

// Enhanced JWT authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    console.log(' No authorization header provided');
    return res.status(401).json({ success: false, message: "Authorization required" });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    console.log(' No token found in authorization header');
    return res.status(401).json({ success: false, message: "Access token missing" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error(' JWT verification error:', err.message);
      
      if (err.name === 'TokenExpiredError') {
        return res.status(403).json({ success: false, message: "Token expired, please login again" });
      } else if (err.name === 'JsonWebTokenError') {
        return res.status(403).json({ success: false, message: "Invalid token" });
      }
      return res.status(403).json({ success: false, message: "Token verification failed" });
    }
    
    console.log(` Token verified successfully for user: ${user.digital_id}`);
    req.user = user;
    next();
  });
}

// Enhanced admin middleware with better role checking
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.role) {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  
  const role = req.user.role.toLowerCase().trim();
  const allowedAdminRoles = ['admin', 'administrator', 'system administrator', 'super admin'];
  
  if (!allowedAdminRoles.includes(role)) {
    console.log(` Access denied for role: ${req.user.role}`);
    return res.status(403).json({ success: false, message: "Admin privileges required" });
  }
  
  console.log(` Admin access granted for: ${req.user.digital_id}`);
  next();
}

// Enhanced teacher middleware
function requireTeacher(req, res, next) {
  if (!req.user || !req.user.role) {
    return res.status(403).json({ success: false, message: "Teacher access required" });
  }
  
  const role = req.user.role.toLowerCase().trim();
  const teacherRoles = ['teacher', 'professor', 'faculty', 'instructor', 'lecturer', 'educator'];
  
  if (!teacherRoles.some(teacherRole => role.includes(teacherRole))) {
    console.log(` Teacher access denied for role: ${req.user.role}`);
    return res.status(403).json({ success: false, message: "Teacher access required" });
  }
  
  console.log(` Teacher access granted for: ${req.user.digital_id}`);
  next();
}

// ========== ROUTE MODULES ==========

// Import route modules
let authRoutes, attendanceRoutes, adminRoutes, facultyRoutes, reportsRoutes, organizationRoutes, studentRoutes;

try {
  authRoutes = require('./routes/auth');
  attendanceRoutes = require('./routes/attendance');
  adminRoutes = require('./routes/admin');
  facultyRoutes = require('./routes/faculty');
  reportsRoutes = require('./routes/reports');
  organizationRoutes = require('./routes/organization');
  studentRoutes = require('./routes/student');
  console.log(' All route modules loaded successfully');
} catch (error) {
  console.error(' Error loading route modules:', error);
  process.exit(1);
}

// Add database middleware for all routes
app.use((req, res, next) => {
  req.db = db; // Make database available to all routes
  next();
});

// ========== REGISTRATION ENDPOINTS ==========

// Organization code validation for user registration (direct endpoint)
app.post('/api/validate-org-code', (req, res) => {
  const { code, industry_type } = req.body;

  if (!code) {
    return res.status(400).json({ success: false, message: "Organization code is required" });
  }

  req.db.get(`
    SELECT oc.*, o.name as organization_name, o.type as organization_industry, o.contact_email as admin_email
    FROM organization_codes oc
    LEFT JOIN organizations o ON oc.organization_id = o.id
    WHERE UPPER(oc.code) = ? AND oc.is_active = 1
  `, [code.toUpperCase()], (err, codeData) => {
    if (err) {
      console.error(" Code validation error:", err);
      return res.status(500).json({ success: false, message: "Failed to validate code" });
    }

    if (!codeData) {
      return res.status(404).json({ success: false, message: "Invalid organization code" });
    }

    // Check if code is expired
    if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: "Organization code has expired" });
    }

    // Check usage limit
    if (codeData.max_uses && codeData.usage_count >= codeData.max_uses) {
      return res.status(400).json({ success: false, message: "Organization code usage limit exceeded" });
    }

    console.log(` Organization code validated: ${code} for org: ${codeData.organization_name}`);
    res.json({
      success: true,
      message: "Organization code is valid",
      organization_name: codeData.organization_name,
      organization_id: codeData.organization_id,
      admin_name: codeData.admin_email ? codeData.admin_email.split('@')[0] : 'Organization Admin',
      organization: {
        id: codeData.organization_id,
        name: codeData.organization_name,
        industry: codeData.organization_industry
      },
      code: {
        id: codeData.id,
        description: codeData.description,
        usage_count: codeData.usage_count,
        max_uses: codeData.max_uses,
        expires_at: codeData.expires_at
      }
    });
  });
});

// Mount route modules with error handling
try {
  app.use('/api', authRoutes);
  app.use('/api/attendance', attendanceRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/faculty', facultyRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/organization', organizationRoutes);
  app.use('/api/student', studentRoutes);
  console.log(' All route modules mounted successfully');
} catch (error) {
  console.error(' Error mounting route modules:', error);
  process.exit(1);
}

// ========== INTEGRATION ROUTES ==========

// Google Classroom Integration
app.get('/api/integrations/google/auth-url', authenticateToken, requireAdmin, integrationController.generateGoogleAuthUrl);
app.get('/api/integrations/google/callback', integrationController.handleGoogleCallback);
app.post('/api/integrations/google/sync', authenticateToken, requireAdmin, integrationController.syncGoogleClassrooms);
app.get('/api/integrations/google/status', authenticateToken, integrationController.getGoogleConnectionStatus);

// Teach Us App Integration  
app.get('/api/integrations/teachus/test', authenticateToken, requireAdmin, integrationController.testTeachUsConnection);
app.post('/api/integrations/teachus/push', authenticateToken, requireTeacher, integrationController.pushAttendanceToTeachUs);
app.get('/api/integrations/teachus/pull', authenticateToken, requireAdmin, integrationController.pullAttendanceFromTeachUs);

// Integration Statistics
app.get('/api/integrations/stats', authenticateToken, integrationController.getIntegrationStats);

// ========== REMAINING ROUTES ==========

// Education industry specific endpoints
app.get('/api/classes', authenticateToken, (req, res) => {
  const { include_subjects } = req.query;
  req.db.all('SELECT * FROM classes WHERE organization_id = ? AND is_active = 1', [req.user.organization_id || 2], (err, classes) => {
    if (err) {
      console.error('Error fetching classes:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch classes' });
    }

    if (include_subjects === 'true') {
      // Get subjects for each class
      const classesWithSubjects = classes.map(cls => {
        return new Promise((resolve) => {
          req.db.all(`
            SELECT cs.*, s.subject_name, s.subject_code, u.name as teacher_name, u.email as teacher_email
            FROM class_subjects cs
            JOIN subjects s ON cs.subject_id = s.id
            LEFT JOIN users u ON cs.teacher_id = u.digital_id
            WHERE cs.class_id = ? AND cs.is_active = 1
          `, [cls.id], (err, subjects) => {
            if (err) {
              console.error('Error fetching subjects for class:', cls.id, err);
              resolve({ ...cls, subjects: [] });
            } else {
              resolve({ ...cls, subjects: subjects || [] });
            }
          });
        });
      });

      Promise.all(classesWithSubjects).then(results => {
        res.json({ success: true, classes: results });
      });
    } else {
      res.json({ success: true, classes: classes });
    }
  });
});

// Regular users endpoint for teachers (non-admin access to faculty/staff)
app.get('/api/users', authenticateToken, (req, res) => {
  const { limit = 200, active_only = 'true', role } = req.query;
  const organizationId = req.user.organization_id;

  let query = `
    SELECT digital_id, name, phone, role, email, industry_type,
           is_verified, is_approved, is_active, created_at
    FROM users
    WHERE organization_id = ?
  `;
  let params = [organizationId];

  // Add filters
  if (active_only === 'true') {
    query += ` AND is_active = 1 AND is_verified = 1 `;
  }

  if (role) {
    query += ` AND role LIKE ? `;
    params.push(`%${role}%`);
  } else {
    // Default to faculty roles for teachers
    query += ` AND role IN ('Teacher', 'Professor', 'Lecturer', 'Instructor', 'Assistant Professor', 'Faculty', 'Administrator') `;
  }

  query += ` ORDER BY name ASC LIMIT ? `;
  params.push(parseInt(limit));

  req.db.all(query, params, (err, users) => {
    if (err) {
      console.error(" Users fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch users" });
    }

    console.log(` Fetched ${users.length} users for teacher access`);
    res.json({ success: true, users });
  });
});

// Regular subjects endpoint for teachers (non-admin access)
app.get('/api/subjects', authenticateToken, (req, res) => {
  const organizationId = req.user.organization_id;
  const { active_only = 'true' } = req.query;

  let query = `SELECT * FROM subjects WHERE organization_id = ?`;
  let params = [organizationId];

  if (active_only === 'true') {
    query += ` AND is_active = 1`;
  }

  query += ` ORDER BY subject_code ASC`;

  req.db.all(query, params, (err, subjects) => {
    if (err) {
      console.error(" Subjects fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch subjects" });
    }

    console.log(` Fetched ${subjects.length} subjects for teacher access`);
    res.json({ success: true, subjects });
  });
});

app.get('/api/classes/:classId/students', authenticateToken, (req, res) => {
  const { classId } = req.params;
  req.db.all('SELECT * FROM students WHERE class_id = ? AND is_active = 1', [classId], (err, students) => {
    if (err) {
      console.error('Error fetching students:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch students' });
    }
    res.json({ success: true, students });
  });
});

// Student schedule endpoint
app.get('/api/student/schedule', authenticateToken, (req, res) => {
  const { date } = req.query;
  const userId = req.user.digital_id;
  const organizationId = req.user.organization_id;

  if (!date) {
    return res.status(400).json({ success: false, message: 'Date parameter is required' });
  }

  console.log(` Student schedule request - User: ${userId}, Date: ${date}, Org: ${organizationId}`);

  // Get student's enrolled classes
  req.db.all(`
    SELECT s.*, c.class_name, c.class_code, c.semester, c.academic_year
    FROM students s
    JOIN classes c ON s.class_id = c.id
    WHERE s.student_id = ? AND s.organization_id = ? AND s.is_active = 1
  `, [userId, organizationId], (err, enrolledClasses) => {
    if (err) {
      console.error('Error fetching enrolled classes:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch enrolled classes' });
    }

    if (!enrolledClasses || enrolledClasses.length === 0) {
      console.log(` No enrolled classes found for student: ${userId}`);
      return res.json({
        success: true,
        lectures: [],
        message: 'No classes enrolled'
      });
    }

    const classIds = enrolledClasses.map(cls => cls.class_id);

    // Get today's lectures for enrolled classes
    req.db.all(`
      SELECT l.*, c.class_name, c.class_code, c.semester, c.academic_year,
             s.subject_name, s.subject_code,
             u.name as teacher_name, u.email as teacher_email
      FROM lectures l
      JOIN classes c ON l.class_id = c.id
      JOIN class_subjects cs ON l.class_subject_id = cs.id
      JOIN subjects s ON cs.subject_id = s.id
      LEFT JOIN users u ON cs.teacher_id = u.digital_id
      WHERE l.class_id IN (${classIds.map(() => '?').join(',')})
      AND l.scheduled_date = ?
      AND l.status IN ('scheduled', 'ongoing', 'completed')
      ORDER BY l.start_time
    `, [...classIds, date], (err, lectures) => {
      if (err) {
        console.error('Error fetching lectures:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch lectures' });
      }

      console.log(` Student schedule loaded: ${lectures.length} lectures for ${userId}`);

      // Format lectures for frontend
      const formattedLectures = lectures.map(lecture => ({
        id: lecture.id,
        title: lecture.title || `${lecture.subject_name} - ${lecture.class_name}`,
        subject_name: lecture.subject_name,
        subject_code: lecture.subject_code,
        class_name: lecture.class_name,
        class_code: lecture.class_code,
        start_time: lecture.start_time,
        end_time: lecture.end_time,
        room_number: lecture.room_number,
        status: lecture.status,
        teacher_name: lecture.teacher_name,
        semester: lecture.semester,
        academic_year: lecture.academic_year
      }));

      res.json({
        success: true,
        lectures: formattedLectures,
        enrolled_classes: enrolledClasses.length,
        date: date
      });
    });
  });
});

// ========== STUDENT APIs ==========

// Get available classes for student enrollment
app.get('/api/student/available-classes', authenticateToken, (req, res) => {
  const organizationId = req.user.organization_id;

  console.log(` Getting available classes for student - Org: ${organizationId}`);

  req.db.all(`
    SELECT c.*, s.subject_name, s.subject_code, u.name as teacher_name
    FROM classes c
    LEFT JOIN class_subjects cs ON c.id = cs.class_id
    LEFT JOIN subjects s ON cs.subject_id = s.id
    LEFT JOIN users u ON cs.teacher_id = u.digital_id
    WHERE c.organization_id = ? AND c.is_active = 1
    ORDER BY c.class_name, s.subject_name
  `, [organizationId], (err, classes) => {
    if (err) {
      console.error('Error fetching available classes:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch available classes' });
    }

    console.log(` Found ${classes.length} available classes`);
    res.json({
      success: true,
      classes: classes
    });
  });
});

// Enroll student in a class
app.post('/api/student/enroll', authenticateToken, (req, res) => {
  const { class_id } = req.body;
  const studentId = req.user.digital_id;
  const organizationId = req.user.organization_id;

  if (!class_id) {
    return res.status(400).json({ success: false, message: 'Class ID is required' });
  }

  console.log(` Enrolling student ${studentId} in class ${class_id}`);

  // Check if student is already enrolled
  req.db.get(`
    SELECT * FROM students
    WHERE student_id = ? AND class_id = ? AND organization_id = ?
  `, [studentId, class_id, organizationId], (err, existing) => {
    if (err) {
      console.error('Error checking existing enrollment:', err);
      return res.status(500).json({ success: false, message: 'Failed to check enrollment status' });
    }

    if (existing) {
      return res.status(400).json({ success: false, message: 'Already enrolled in this class' });
    }

    // Get student name from users table
    req.db.get(`
      SELECT name FROM users WHERE digital_id = ?
    `, [studentId], (err, user) => {
      if (err) {
        console.error('Error fetching user data:', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch user data' });
      }

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Generate a unique roll number for the student
      const rollNumber = `${studentId}-${class_id}-${Date.now()}`;

      // Create student record with all required fields
      req.db.run(`
        INSERT INTO students (student_id, name, roll_number, email, phone, class_id, organization_id, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `, [studentId, user.name, rollNumber, user.email || '', user.phone || '', class_id, organizationId], function(err) {
        if (err) {
          console.error('Error enrolling student:', err);
          return res.status(500).json({ success: false, message: 'Failed to enroll in class - Database error' });
        }

        console.log(` Student enrolled successfully - ID: ${this.lastID}`);
        res.json({
          success: true,
          message: 'Successfully enrolled in class',
          enrollment_id: this.lastID
        });
      });
    });
  });
});

// Get student's enrolled classes
app.get('/api/student/enrolled-classes', authenticateToken, (req, res) => {
  const studentId = req.user.digital_id;
  const organizationId = req.user.organization_id;

  console.log(` Getting enrolled classes for student: ${studentId}`);

  req.db.all(`
    SELECT s.*, c.class_name, c.class_code, c.semester, c.academic_year, c.max_students
    FROM students s
    JOIN classes c ON s.class_id = c.id
    WHERE s.student_id = ? AND s.organization_id = ? AND s.is_active = 1
  `, [studentId, organizationId], (err, enrolledClasses) => {
    if (err) {
      console.error('Error fetching enrolled classes:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch enrolled classes' });
    }

    console.log(` Found ${enrolledClasses.length} enrolled classes`);
    res.json({
      success: true,
      classes: enrolledClasses
    });
  });
});

// Get student's subjects with faculty information
app.get('/api/student/subjects', authenticateToken, (req, res) => {
  const studentId = req.user.digital_id;
  const organizationId = req.user.organization_id;

  console.log(` Getting subjects for student: ${studentId}`);

  req.db.all(`
    SELECT DISTINCT s.*, u.name as teacher_name, u.email as teacher_email,
           c.class_name, c.class_code
    FROM students st
    JOIN classes c ON st.class_id = c.id
    JOIN class_subjects cs ON c.id = cs.class_id
    JOIN subjects s ON cs.subject_id = s.id
    LEFT JOIN users u ON cs.teacher_id = u.digital_id
    WHERE st.student_id = ? AND st.organization_id = ? AND st.is_active = 1
    ORDER BY s.subject_name
  `, [studentId, organizationId], (err, subjects) => {
    if (err) {
      console.error('Error fetching subjects:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch subjects' });
    }

    console.log(` Found ${subjects.length} subjects`);
    res.json({
      success: true,
      subjects: subjects
    });
  });
});

// Get attendance summary by subject
app.get('/api/student/attendance/summary', authenticateToken, (req, res) => {
  const studentId = req.user.digital_id;
  const organizationId = req.user.organization_id;

  console.log(` Getting attendance summary for student: ${studentId}`);

  req.db.all(`
    SELECT s.subject_name, s.subject_code,
           COUNT(sa.id) as total_lectures,
           SUM(CASE WHEN sa.is_present = 1 THEN 1 ELSE 0 END) as present_count,
           ROUND(
             (SUM(CASE WHEN sa.is_present = 1 THEN 1 ELSE 0 END) * 100.0) / COUNT(sa.id), 2
           ) as attendance_percentage
    FROM students st
    JOIN classes c ON st.class_id = c.id
    JOIN class_subjects cs ON c.id = cs.class_id
    JOIN subjects s ON cs.subject_id = s.id
    LEFT JOIN subject_attendance sa ON cs.id = sa.class_subject_id AND sa.student_id = st.id
    WHERE st.student_id = ? AND st.organization_id = ? AND st.is_active = 1
    GROUP BY s.id, s.subject_name, s.subject_code
    ORDER BY s.subject_name
  `, [studentId, organizationId], (err, attendance) => {
    if (err) {
      console.error('Error fetching attendance summary:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch attendance summary' });
    }

    console.log(` Found attendance data for ${attendance.length} subjects`);
    res.json({
      success: true,
      attendance: attendance
    });
  });
});

// Enroll student in class by class code
app.post('/api/student/enroll-by-code', authenticateToken, (req, res) => {
  const { class_code } = req.body;
  const studentId = req.user.digital_id;
  const organizationId = req.user.organization_id;

  if (!class_code) {
    return res.status(400).json({ success: false, message: 'Class code is required' });
  }

  console.log(` Enrolling student ${studentId} in class with code: ${class_code}`);

  // Find the class by code
  req.db.get(`
    SELECT * FROM classes
    WHERE class_code = ? AND organization_id = ? AND is_active = 1
  `, [class_code, organizationId], (err, classData) => {
    if (err) {
      console.error('Error finding class:', err);
      return res.status(500).json({ success: false, message: 'Failed to find class' });
    }

    if (!classData) {
      return res.status(404).json({ success: false, message: 'Class not found with the provided code' });
    }

    // Check if student is already enrolled in this class
    req.db.get(`
      SELECT * FROM students
      WHERE student_id = ? AND class_id = ? AND organization_id = ?
    `, [studentId, classData.id, organizationId], (err, existing) => {
      if (err) {
        console.error('Error checking existing enrollment:', err);
        return res.status(500).json({ success: false, message: 'Failed to check enrollment status' });
      }

      if (existing) {
        return res.status(400).json({ success: false, message: 'Already enrolled in this class' });
      }

      // Get student name from users table
      req.db.get(`
        SELECT name, email, phone FROM users WHERE digital_id = ?
      `, [studentId], (err, user) => {
        if (err) {
          console.error('Error fetching user data:', err);
          return res.status(500).json({ success: false, message: 'Failed to fetch user data' });
        }

        if (!user) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Generate a unique roll number for the student
        const rollNumber = `${studentId}-${classData.id}-${Date.now()}`;

        // Create student record
        req.db.run(`
          INSERT INTO students (student_id, name, roll_number, email, phone, class_id, organization_id, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `, [studentId, user.name, rollNumber, user.email || '', user.phone || '', classData.id, organizationId], function(err) {
          if (err) {
            console.error('Error enrolling student:', err);
            return res.status(500).json({ success: false, message: 'Failed to enroll in class - Database error' });
          }

          console.log(` Student enrolled successfully - ID: ${this.lastID}`);

          // Get class details including subjects
          req.db.all(`
            SELECT s.subject_name, s.subject_code, s.description, s.credits,
                   u.name as teacher_name, u.email as teacher_email
            FROM class_subjects cs
            JOIN subjects s ON cs.subject_id = s.id
            LEFT JOIN users u ON cs.teacher_id = u.digital_id
            WHERE cs.class_id = ? AND cs.is_active = 1
            ORDER BY s.subject_name
          `, [classData.id], (err, subjects) => {
            if (err) {
              console.error('Error fetching class subjects:', err);
              // Still return success but with empty subjects
              return res.json({
                success: true,
                message: 'Successfully enrolled in class',
                enrollment_id: this.lastID,
                class_details: {
                  id: classData.id,
                  class_code: classData.class_code,
                  class_name: classData.class_name,
                  semester: classData.semester,
                  academic_year: classData.academic_year,
                  subjects: []
                }
              });
            }

            // Count total students in the class
            req.db.get(`
              SELECT COUNT(*) as student_count FROM students
              WHERE class_id = ? AND is_active = 1
            `, [classData.id], (err, countResult) => {
              const studentCount = countResult ? countResult.student_count : 0;

              res.json({
                success: true,
                message: 'Successfully enrolled in class',
                enrollment_id: this.lastID,
                class_details: {
                  id: classData.id,
                  class_code: classData.class_code,
                  class_name: classData.class_name,
                  semester: classData.semester,
                  academic_year: classData.academic_year,
                  student_count: studentCount,
                  subjects: subjects || []
                }
              });
            });
          });
        });
      });
    });
  });
});

// Get upcoming lectures
app.get('/api/student/upcoming-lectures', authenticateToken, (req, res) => {
  const studentId = req.user.digital_id;
  const organizationId = req.user.organization_id;
  const today = new Date().toISOString().split('T')[0];

  console.log(` Getting upcoming lectures for student: ${studentId}`);

  req.db.all(`
    SELECT l.*, c.class_name, c.class_code,
           s.subject_name, s.subject_code,
           u.name as teacher_name
    FROM students st
    JOIN classes c ON st.class_id = c.id
    JOIN class_subjects cs ON c.id = cs.class_id
    JOIN subjects s ON cs.subject_id = s.id
    JOIN lectures l ON cs.id = l.class_subject_id
    LEFT JOIN users u ON cs.teacher_id = u.digital_id
    WHERE st.student_id = ? AND st.organization_id = ? AND st.is_active = 1
    AND l.scheduled_date >= ?
    AND l.status IN ('scheduled', 'ongoing')
    ORDER BY l.scheduled_date, l.start_time
    LIMIT 10
  `, [studentId, organizationId, today], (err, lectures) => {
    if (err) {
      console.error('Error fetching upcoming lectures:', err);
      return res.status(500).json({ success: false, message: 'Failed to fetch upcoming lectures' });
    }

    console.log(` Found ${lectures.length} upcoming lectures`);
    res.json({
      success: true,
      lectures: lectures
    });
  });
});

// Force reload routes (for development)
app.get('/api/reload', (req, res) => {
  try {
    // Clear require cache for route modules
    delete require.cache[require.resolve('./routes/admin')];
    delete require.cache[require.resolve('./routes/organization')];
    delete require.cache[require.resolve('./routes/auth')];
    delete require.cache[require.resolve('./routes/attendance')];
    delete require.cache[require.resolve('./routes/faculty')];
    delete require.cache[require.resolve('./routes/reports')];

    // Re-import routes
    const adminRoutes = require('./routes/admin');
    const organizationRoutes = require('./routes/organization');
    const authRoutes = require('./routes/auth');
    const attendanceRoutes = require('./routes/attendance');
    const facultyRoutes = require('./routes/faculty');
    const reportsRoutes = require('./routes/reports');

    console.log(' Routes reloaded successfully');
    res.json({
      success: true,
      message: "Routes reloaded successfully",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(' Error reloading routes:', error);
    res.status(500).json({
      success: false,
      message: "Failed to reload routes",
      error: error.message
    });
  }
});

// Public landing-page stats (real metrics from the live database + runtime)
const SERVER_STARTED_AT = Date.now();

app.get('/api/stats', (req, res) => {
  const query = (sql, params = []) => new Promise((resolve) => {
    req.db.get(sql, params, (err, row) => resolve(err ? 0 : (row ? row.count || 0 : 0)));
  });

  Promise.all([
    // Active Users: enabled + verified accounts
    query('SELECT COUNT(*) AS count FROM users WHERE is_active = 1 AND is_verified = 1'),
    // Industries Served: distinct active organization types
    query('SELECT COUNT(DISTINCT type) AS count FROM organizations WHERE is_active = 1 AND deleted = 0'),
    // Active Today: distinct users with attendance recorded today
    query(`SELECT COUNT(DISTINCT digital_id) AS count FROM attendance WHERE DATE(timestamp) = DATE('now')`)
  ]).then(([activeUsers, industriesServed, activeToday]) => {
    const uptimeSeconds = Math.max(0, Math.floor((Date.now() - SERVER_STARTED_AT) / 1000));
    res.json({
      success: true,
      stats: {
        activeUsers,
        industriesServed,
        activeToday,
        // Real server runtime: the process has been continuously up since start.
        uptimePercent: uptimeSeconds > 0 ? 100.0 : 0.0
      },
      meta: {
        serverStartedAt: new Date(SERVER_STARTED_AT).toISOString(),
        uptimeSeconds,
        generatedAt: new Date().toISOString()
      }
    });
  }).catch((err) => {
    console.error(' Error fetching public stats:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch stats', error: err.message });
  });
});

// Root endpoint with enhanced information
app.get('/', (req, res) => {
  res.json({
    message: " Universal Attendance System API",
    version: "3.0.0",
    features: [
      "Multi-industry support",
      "Multi-tenant organizations",
      "QR code attendance",
      "GPS tracking",
      "Real-time analytics",
      "Admin dashboard",
      "Teacher class management",
      "Student attendance tracking",
      "Role-based access control",
      "Enhanced security",
      "Manual punch requests with admin approval"
    ],
    industries: ["Healthcare", "Education", "Corporate", "Manufacturing", "Government", "Retail"],
    endpoints: {
      auth: ["/api/register", "/api/login", "/api/verify", "/api/resend-otp", "/api/profile"],
      attendance: ["/api/attendance/punch", "/api/attendance/history", "/api/attendance/my-requests", "/api/attendance/request", "/api/attendance/requests", "/api/attendance/generate-qr", "/api/attendance/punch-qr"],
      admin: ["/api/admin/users", "/api/admin/attendance", "/api/admin/user-status", "/api/admin/dashboard-stats", "/api/admin/dashboard", "/api/admin/organization"],
      organization: ["/api/organization/generate-code", "/api/organization/codes", "/api/organization/"],
      faculty: ["/api/faculty/teacher/classes", "/api/faculty/teacher/class/:id/students", "/api/faculty/teacher/class/:id/attendance"],
      reports: ["/api/reports/dashboard/:industry", "/api/reports/attendance-analytics", "/api/reports/user-performance"],
      integrations: ["/api/integrations/google/*", "/api/integrations/teachus/*"],
      general: ["/api/classes", "/api/classes/:classId/students"],
      test: ["/api/test"]
    },
    status: "Active",
    timestamp: new Date().toISOString()
  });
});

// Enhanced error handling middleware
app.use((err, req, res, next) => {
  console.error(' Global error handler:', {
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  
  res.status(err.status || 500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === 'development' ? err.message : "Something went wrong"
  });
});

// Enhanced 404 handler
app.use((req, res) => {
  console.log(` 404 - Endpoint not found: ${req.method} ${req.path} from ${req.ip}`);
  
  res.status(404).json({
    success: false,
    message: "API endpoint not found",
    requested_path: req.path,
    method: req.method,
    available_endpoints: [
      "POST /api/register", "POST /api/login", "POST /api/verify",
      "GET /api/profile", "POST /api/attendance/punch", "GET /api/attendance/history",
      "POST /api/attendance/request", "GET /api/attendance/requests",
      "POST /api/attendance/requests/:id/approve", "POST /api/attendance/requests/:id/reject",
      "GET /api/faculty/teacher/classes", "POST /api/faculty/teacher/class/:id/attendance"
    ]
  });
});

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('\n Received SIGINT. Gracefully shutting down...');
  
  db.close((err) => {
    if (err) {
      console.error(' Error closing database:', err.message);
    } else {
      console.log(' Database connection closed.');
    }
    process.exit(0);
  });
});

// Start server with enhanced logging
app.listen(PORT, () => {
  console.log("=".repeat(70));
  console.log(" UNIVERSAL ATTENDANCE SYSTEM v3.0 STARTED");
  console.log("=".repeat(70));
  console.log(` Server: http://localhost:${PORT}`);
  console.log(` Database: ${dbFile}`);
  console.log(` Multi-tenant: Organizations & Departments`);
  console.log(` Industries: Healthcare, Education, Corporate, Manufacturing, Government, Retail`);
  console.log(` Features: Enhanced Security, QR Codes, Teacher Management, Admin Panel, Manual Punch Approval`);
  console.log(` Started: ${new Date().toISOString()}`);
  console.log("=".repeat(70));
});

module.exports = app;
