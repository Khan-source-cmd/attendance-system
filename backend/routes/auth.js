/**
 * Universal Attendance System - Authentication Routes
 * Handles user registration, login, verification, and profile management
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const os = require('os');

// Import middleware
const { authenticateToken } = require('../middleware/auth');

// Environment variables (set via backend/.env, loaded by the server entry point)
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const JWT_SECRET = process.env.JWT_SECRET;

// Persistent stores (OTP, reset tokens, rate limits) backed by SQLite so they
// survive restarts and work across multiple Node processes.
const {
  setOTP,
  getOTP,
  incrementOTPAttempts,
  deleteOTP,
  setResetToken,
  getResetToken,
  markResetTokenUsed,
  deleteResetToken,
  checkRateLimit,
  logAudit
} = require('../utils/stores');

// Enhanced digital ID generation - globally unique across all users with cleanup
function generateDigitalId(role, industry, organizationId, db, callback) {
  // Use the new clean Digital ID generation function
  if (typeof generateCleanDigitalId === 'function') {
    generateCleanDigitalId(role, industry, organizationId, callback);
  } else {
    // Fallback to old method if cleanup functions aren't available
    const prefix = `${industry.toUpperCase().substring(0,3)}-${role.toUpperCase().substring(0,3)}`;

    db.get(
      "SELECT digital_id FROM users WHERE digital_id LIKE ? ORDER BY digital_id DESC LIMIT 1",
      [`${prefix}-%`],
      (err, row) => {
        let number = 1;
        if (!err && row && row.digital_id) {
          const match = row.digital_id.match(/-(\d+)$/);
          if (match) {
            number = parseInt(match[1], 10) + 1;
          }
        }
        callback(`${prefix}-${String(number).padStart(4, '0')}`);
      }
    );
  }
}

// Auto-assign organization based on email domain
function getOrganizationByEmail(email, db) {
  return new Promise((resolve, reject) => {
    const domain = email.split('@')[1];
    
    db.get(
      "SELECT id FROM organizations WHERE domain = ? AND is_active = 1",
      [domain],
      (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.id : 1); // Default to organization 1 if no match
      }
    );
  });
}

// Output encoding for emails (prevents HTML injection via user-supplied
// fields like name/organization name) and log redaction for PII.
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const maskEmail = (email) => {
  if (!email || typeof email !== 'string' || !email.includes('@')) return '[redacted]';
  const [local, domain] = email.split('@');
  const shown = local.slice(0, 2);
  return `${shown}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
};

// Enhanced Nodemailer transporter with retry logic
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  pool: true,
  maxConnections: 5,
  maxMessages: 10,
  retryDelay: 1000,
  retryMax: 3,
  // Prevent slow/hung SMTP connections from blocking requests indefinitely
  connectionTimeout: 10000,   // 10s to establish the SMTP connection
  greetingTimeout: 10000,     // 10s to receive the server greeting
  socketTimeout: 20000        // 20s max idle on the socket during a send
});



// Enhanced OTP email with organization branding
async function sendOTP(email, otp, digital_id, name, organizationName = "Universal Attendance") {
  // Header-safe + HTML-safe rendering of user-supplied values.
  const safeOrg = escapeHtml(String(organizationName)).replace(/[\r\n]+/g, ' ');
  const safeName = escapeHtml(name);
  const mailOptions = {
    from: `"${safeOrg.replace(/"/g, '')}" <${EMAIL_USER}>`,
    to: email,
    subject: `Welcome to ${safeOrg} - Verify Your Account`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: white; border-radius: 10px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2c3e50; margin: 0;">Welcome ${safeName}!</h1>
            <p style="color: #7f8c8d; margin: 10px 0;">Your account has been successfully created at ${safeOrg}</p>
          </div>
          
          <div style="background: linear-gradient(135deg, #3498db 0%, #2980b9 100%); padding: 30px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <h3 style="color: white; margin: 0 0 15px 0;">Verification Code</h3>
            <h1 style="color: white; font-size: 36px; letter-spacing: 8px; margin: 0;">${otp}</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 15px 0 0 0;">This code expires in 10 minutes</p>
          </div>
          
          <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #27ae60; margin-top: 0;">Your Login Credentials</h4>
            <p style="margin: 5px 0;"><strong>Digital ID:</strong> <code style="background: #d4edda; padding: 2px 6px; border-radius: 3px;">${digital_id}</code></p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
            <p style="color: #6c757d; font-size: 12px; margin: 10px 0 0 0;">
              <i class="fas fa-info-circle"></i> Save these credentials securely for future logins.
            </p>
          </div>
          
          <div style="border-top: 1px solid #e9ecef; padding-top: 20px; text-align: center;">
            <p style="color: #6c757d; font-size: 12px; margin: 0;">
              If you didn't create this account, please ignore this email or contact support.
            </p>
          </div>
        </div>
      </div>
    `
  };
  
  await transporter.sendMail(mailOptions);
  console.log(` Welcome email sent to ${maskEmail(email)} at ${escapeHtml(organizationName)}`);
}

// Enhanced registration route for creating new organizations (Admin Setup)
router.post('/register-organization', async (req, res) => {
  try {
    const {
      name, phone, email, password, industry_type,
      organization_name, organization_type, organization_address,
      organization_contact_email, organization_contact_phone
    } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    // Rate limiting - relaxed for development
    if (!(await checkRateLimit(`register_org_${clientIp}`, 10, 300000))) { // 10 attempts per 5 minutes
      return res.status(429).json({ success: false, message: "Too many organization registration attempts. Please wait 5 minutes." });
    }

    // Validation
    if (!name || !phone || !email || !password || !industry_type || !organization_name) {
      return res.status(400).json({ success: false, message: "All required fields must be provided" });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Please provide a valid email address" });
    }

    // Password validation
    if (password.length < 12) {
      return res.status(400).json({ success: false, message: "Password must be at least 12 characters long" });
    }

    // Check if email already exists
    const existingUser = await new Promise((resolve, reject) => {
      req.db.get("SELECT email FROM users WHERE email = ?", [email.toLowerCase()], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });

    if (existingUser) {
      return res.status(409).json({ success: false, message: "Email already registered" });
    }

    // Check if organization name already exists
    const existingOrg = await new Promise((resolve, reject) => {
      req.db.get("SELECT name FROM organizations WHERE name = ?", [organization_name], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });

    if (existingOrg) {
      return res.status(409).json({ success: false, message: "Organization name already exists" });
    }

    // Create new organization
    const organizationId = await new Promise((resolve, reject) => {
      const stmt = req.db.prepare(`
        INSERT INTO organizations (
          name, type, address, contact_email, contact_phone, domain, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run([
        organization_name,
        organization_type || industry_type,
        organization_address || null,
        organization_contact_email || email,
        organization_contact_phone || phone,
        null, // domain (can be set later)
        1 // is_active
      ], function(err) {
        if (err) reject(err);
        resolve(this.lastID);
      });
      stmt.finalize();
    });

    // Generate unique digital ID for admin
    const digital_id = await new Promise((resolve) => {
      generateDigitalId('Administrator', industry_type, organizationId, req.db, resolve);
    });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create admin user
    await new Promise((resolve, reject) => {
      const stmt = req.db.prepare(`
        INSERT INTO users (
          digital_id, organization_id, name, phone, role, email, password,
          industry_type, profile_data, is_verified, is_approved, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run([
        digital_id, organizationId, name, phone, 'Administrator', email.toLowerCase(), hashedPassword,
        industry_type, JSON.stringify({}), 1, 1, 1 // Auto-verify and approve admin
      ], function(err) {
        if (err) reject(err);
        resolve();
      });
      stmt.finalize();
    });

    // Generate JWT token for immediate login
    const tokenPayload = {
      digital_id: digital_id,
      role: 'Administrator',
      industry_type: industry_type,
      organization_id: organizationId,
      name: name,
      email: email.toLowerCase(),
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

    console.log(` New organization created: ${organization_name} (ID: ${organizationId})`);
    console.log(` Admin user created: ${digital_id} (${name})`);

    res.json({
      success: true,
      token: token,
      digital_id: digital_id,
      organization_id: organizationId,
      organization_name: organization_name,
      role: 'Administrator',
      name: name,
      industry_type: industry_type,
      message: "Organization and admin account created successfully!"
    });

  } catch (error) {
    console.error(" Organization registration error:", error);
    console.error(" Error details:", {
      message: error.message,
      stack: error.stack,
      code: error.code,
      errno: error.errno
    });
    res.status(500).json({
      success: false,
      message: "Organization registration failed. Please try again.",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Enhanced registration route with organization code validation (Hybrid Approach)
router.post('/register', async (req, res) => {
  let transactionStarted = false;

  try {
    const { name, phone, role, email, password, industry_type, organization_code, profile_data } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    console.log('🔄 Registration attempt started:', {
      email: maskEmail(email),
      organization_code: organization_code ? '***' + String(organization_code).slice(-2) : undefined,
      industry_type,
      timestamp: new Date().toISOString()
    });

    // Rate limiting
    if (!(await checkRateLimit(`register_${clientIp}`, 3, 300000))) { // 3 attempts per 5 minutes
      console.log('⏱️ Rate limit exceeded for IP:', clientIp);
      return res.status(429).json({ success: false, message: "Too many registration attempts. Please wait 5 minutes." });
    }

    // Validation
    if (!name || !phone || !role || !email || !password || !industry_type) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ success: false, message: "All required fields must be provided" });
    }

    // Organization code validation (required for hybrid approach)
    if (!organization_code) {
      console.log('❌ Organization code missing');
      return res.status(400).json({ success: false, message: "Organization code is required for registration" });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log('❌ Invalid email format:', maskEmail(email));
      return res.status(400).json({ success: false, message: "Please provide a valid email address" });
    }

    // Password validation
    if (password.length < 12) {
      console.log('❌ Password too short');
      return res.status(400).json({ success: false, message: "Password must be at least 12 characters long" });
    }

    // Server-side role whitelist to prevent privilege escalation / self-admin.
    // The server, never the client, decides which roles a self-registering user
    // may hold. Admin/owner-style roles can ONLY be assigned via /organization/register.
    const SELF_REGISTER_ROLES = {
      healthcare: ['doctor', 'nurse', 'technician', 'receptionist', 'pharmacist', 'staff', 'patient'],
      education: ['teacher', 'professor', 'student', 'librarian', 'counselor'],
      corporate: ['employee', 'manager', 'executive', 'developer', 'analyst', 'hr', 'intern', 'sales representative'],
      manufacturing: ['worker', 'operator', 'supervisor', 'quality inspector', 'maintenance', 'safety officer'],
      government: ['officer', 'clerk', 'inspector', 'coordinator'],
      retail: ['sales associate', 'cashier', 'manager', 'stock clerk', 'customer service']
    };
    const normalizedIndustry = (industry_type || '').toLowerCase().trim();
    const normalizedRole = (role || '').toLowerCase().trim();
    const allowedRoles = SELF_REGISTER_ROLES[normalizedIndustry] || [];

    // Block admin/owner-style roles regardless of casing/spelling, and any role
    // not on the explicit per-industry whitelist.
    if (/admin|owner|root/i.test(normalizedRole) || !allowedRoles.includes(normalizedRole)) {
      console.log('❌ Role not permitted for self-registration:', role);
      return res.status(400).json({
        success: false,
        message: 'Role is not permitted for self-registration. Please contact your administrator.'
      });
    }

    console.log('✅ Basic validation passed, validating organization code...');

    // Validate organization code first
    const orgValidation = await new Promise((resolve, reject) => {
      req.db.get(`
        SELECT oc.*, o.name as organization_name, o.type as organization_industry
        FROM organization_codes oc
        LEFT JOIN organizations o ON oc.organization_id = o.id
        WHERE UPPER(oc.code) = ? AND oc.is_active = 1
      `, [String(organization_code || '').trim().toUpperCase()], (err, codeData) => {
        if (err) {
          console.error('❌ Database error during org code validation:', err);
          reject(err);
        } else {
          resolve(codeData);
        }
      });
    });

    if (!orgValidation) {
      console.log('❌ Invalid organization code:', organization_code);
      return res.status(400).json({ success: false, message: "Invalid organization code. Please check the code or contact your administrator." });
    }

    // Check if code is expired
    if (orgValidation.expires_at && new Date(orgValidation.expires_at) < new Date()) {
      console.log('❌ Organization code expired');
      return res.status(400).json({ success: false, message: "Organization code has expired. Please contact your administrator for a new code." });
    }

    // Check usage limit
    if (orgValidation.max_uses && orgValidation.usage_count >= orgValidation.max_uses) {
      console.log('❌ Organization code usage limit exceeded');
      return res.status(400).json({ success: false, message: "Organization code usage limit exceeded. Please contact your administrator." });
    }

    console.log('✅ Organization code validated successfully');

    // Check if email already exists AND is verified
    const existingUser = await new Promise((resolve, reject) => {
      req.db.get("SELECT email, is_verified FROM users WHERE email = ?", [email.toLowerCase()], (err, row) => {
        if (err) {
          console.error('❌ Database error checking existing user:', err);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });

    if (existingUser && existingUser.is_verified) {
      console.log('❌ Email already registered and verified:', maskEmail(email));
      return res.status(409).json({ success: false, message: "Email already registered and verified" });
    } else if (existingUser && !existingUser.is_verified) {
      console.log('ℹ️ Found unverified user, cleaning up...');
      // Delete the unverified account and allow re-registration
      await new Promise((resolve, reject) => {
        req.db.run("DELETE FROM users WHERE email = ? AND is_verified = 0", [email.toLowerCase()], (err) => {
          if (err) {
            console.error('❌ Error deleting unverified user:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }

    // Use organization from validated code
    const organizationId = orgValidation.organization_id;
    console.log('🏢 Using organization ID:', organizationId);

    // Generate unique digital ID
    const digital_id = await new Promise((resolve, reject) => {
      generateDigitalId(role, industry_type, organizationId, req.db, (result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error('Failed to generate digital ID'));
        }
      });
    });

    console.log('🆔 Generated digital ID:', digital_id);

    // Hash password with increased rounds for better security
    const hashedPassword = await bcrypt.hash(password, 12);
    console.log('🔐 Password hashed successfully');

    // Use database transaction for atomicity
    transactionStarted = true;
    console.log('🔄 Starting database transaction...');

    await new Promise((resolve, reject) => {
      req.db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          console.error('❌ Failed to begin transaction:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });

    // Insert user with organization binding - Auto-approve for hybrid approach
    await new Promise((resolve, reject) => {
      const stmt = req.db.prepare(`
        INSERT INTO users (
          digital_id, organization_id, name, phone, role, email, password,
          industry_type, profile_data, is_verified, is_approved, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run([
        digital_id, organizationId, name, phone, role, email.toLowerCase(), hashedPassword,
        industry_type, JSON.stringify(profile_data || {}), 0, 1, 1 // Auto-verify and auto-approve
      ], function(err) {
        if (err) {
          console.error('❌ Failed to insert user:', err);
          reject(err);
        } else {
          console.log('✅ User inserted successfully');
          resolve();
        }
      });
      stmt.finalize();
    });

    // Update organization code usage count
    await new Promise((resolve, reject) => {
      req.db.run(
        "UPDATE organization_codes SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [orgValidation.id],
        (err) => {
          if (err) {
            console.error('❌ Failed to update org code usage:', err);
            reject(err);
          } else {
            console.log('✅ Organization code usage updated');
            resolve();
          }
        }
      );
    });

    // Commit transaction
    await new Promise((resolve, reject) => {
      req.db.run('COMMIT', (err) => {
        if (err) {
          console.error('❌ Failed to commit transaction:', err);
          reject(err);
        } else {
          console.log('✅ Transaction committed successfully');
          resolve();
        }
      });
    });

    transactionStarted = false;

    // Get organization name for email branding
    const orgName = orgValidation.organization_name || "Universal Attendance";
    console.log('📧 Preparing to send OTP email to:', maskEmail(email));

    // Generate and send OTP (persisted so it survives restarts)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await setOTP(digital_id, {
      otp,
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
      attempts: 0
    });

    try {
      await sendOTP(email, otp, digital_id, name, orgName);
      console.log('✅ OTP email sent successfully');
    } catch (emailError) {
      console.error('❌ Failed to send OTP email:', emailError);
      // Don't fail registration if email fails, but log it
      console.warn('⚠️ Registration succeeded but OTP email failed');
    }

    // Log new registration for admin review (optional monitoring)
    console.log(`✅ User registered successfully: ${digital_id} (${name}) in organization: ${orgName} (Code: ${organization_code})`);

    // Send response immediately after successful registration
    const responseData = {
      success: true,
      digital_id,
      organization: orgName,
      message: "Registration successful! Please check your email for verification code."
    };

    console.log('📤 Sending registration response:', responseData);
    res.json(responseData);

  } catch (error) {
    console.error("❌ Registration error:", error);

    // Rollback transaction if it was started
    if (transactionStarted) {
      console.log('🔄 Rolling back transaction due to error...');
      try {
        await new Promise((resolve) => {
          req.db.run('ROLLBACK', () => resolve());
        });
      } catch (rollbackError) {
        console.error('❌ Failed to rollback transaction:', rollbackError);
      }
    }

    // Send error response
    res.status(500).json({
      success: false,
      message: "Registration failed. Please try again.",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Enhanced OTP Verification with attempt limiting
router.post('/verify', async (req, res) => {
  const { digital_id, otp } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;
  
  // Rate limiting
  if (!(await checkRateLimit(`verify_${clientIp}`, 5, 300000))) { // 5 attempts per 5 minutes
    return res.status(429).json({ success: false, message: "Too many verification attempts. Please wait." });
  }
  
  if (!digital_id || !otp) {
    return res.status(400).json({ success: false, message: "Digital ID and OTP are required" });
  }

  const otpEntry = await getOTP(digital_id);
  if (!otpEntry) {
    return res.status(404).json({ success: false, message: "OTP not found or expired. Please request a new one." });
  }

  if (Date.now() > otpEntry.expires) {
    await deleteOTP(digital_id);
    return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
  }

  // Increment attempts
  const newAttempts = (otpEntry.attempts || 0) + 1;

  if (newAttempts > 3) {
    await deleteOTP(digital_id);
    return res.status(400).json({ success: false, message: "Too many failed attempts. Please register again." });
  }

  if (otpEntry.otp !== otp.trim()) {
    await incrementOTPAttempts(digital_id, newAttempts);
    return res.status(400).json({ success: false, message: `Invalid OTP. ${4 - newAttempts} attempts remaining.` });
  }

  // Get user information after verification for direct login
  req.db.get("SELECT u.*, o.name as organization_name, o.type as organization_type FROM users u LEFT JOIN organizations o ON u.organization_id = o.id WHERE u.digital_id = ?", [digital_id], (err, user) => {
    if (err) {
      console.error(" User retrieval error:", err);
      return res.status(500).json({ success: false, message: "Verification failed" });
    }
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    // Update user verification status
    req.db.run("UPDATE users SET is_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE digital_id = ?", [digital_id], (updateErr) => {
      if (updateErr) {
        console.error(" Verification error:", updateErr);
        return res.status(500).json({ success: false, message: "Verification failed" });
      }
      
      // Generate JWT token for direct login
      const tokenPayload = { 
        digital_id: user.digital_id, 
        role: user.role, 
        industry_type: user.industry_type,
        organization_id: user.organization_id,
        name: user.name,
        email: user.email,
        iat: Math.floor(Date.now() / 1000)
      };
      
      const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });
      
      deleteOTP(digital_id).catch(() => {});
      console.log(` User verified and logged in: ${digital_id}`);
      
      res.json({ 
        success: true, 
        message: "Account verified successfully!",
        token: token,
        digital_id: user.digital_id,
        role: user.role,
        name: user.name,
        industry_type: user.industry_type
      });
    });
  });
});

// Enhanced resend OTP endpoint with better rate limiting
router.post('/resend-otp', async (req, res) => {
  const { digital_id } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;
  
  // Rate limiting for resend requests
  if (!(await checkRateLimit(`resend_${clientIp}`, 3, 600000))) { // 3 attempts per 10 minutes
    return res.status(429).json({ success: false, message: 'Too many resend requests. Please wait 10 minutes.' });
  }
  
  if (!digital_id) {
    return res.status(400).json({ success: false, message: 'Digital ID required' });
  }
  
  try {
    const user = await new Promise((resolve, reject) => {
      req.db.get(
        `SELECT u.name, u.email, u.is_verified, u.organization_id, o.name as org_name 
         FROM users u 
         LEFT JOIN organizations o ON u.organization_id = o.id 
         WHERE u.digital_id = ?`, 
        [digital_id], 
        (err, row) => {
          if (err) reject(err);
          resolve(row);
        }
      );
    });
    
    if (!user || user.is_verified) {
      return res.status(400).json({ success: false, message: 'Invalid resend request' });
    }
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await setOTP(digital_id, {
      otp,
      expires: Date.now() + 10 * 60 * 1000,
      attempts: 0
    });
    
    await sendOTP(user.email, otp, digital_id, user.name, user.org_name || 'Universal Attendance');
    
    console.log(` OTP resent to: ${digital_id}`);
    res.json({ success: true, message: 'Verification code resent successfully' });
  } catch (error) {
    console.error(" Resend OTP error:", error);
    res.status(500).json({ success: false, message: "Failed to resend OTP" });
  }
});

// Enhanced Login with comprehensive error handling and security
router.post('/login', async (req, res) => {
  try {
    const { digital_id, password } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    // Rate limiting for login attempts
    if (!(await checkRateLimit(`login_${clientIp}`, 10, 900000))) { // 10 attempts per 15 minutes
      return res.status(429).json({ success: false, message: "Too many login attempts. Please wait 15 minutes." });
    }
    
    if (!digital_id || !password) {
      return res.status(400).json({ success: false, message: "Digital ID and password are required" });
    }

    const user = await new Promise((resolve, reject) => {
      req.db.get(
        `SELECT u.*, o.name as organization_name, o.type as organization_type 
         FROM users u 
         LEFT JOIN organizations o ON u.organization_id = o.id 
         WHERE u.digital_id = ?`, 
        [digital_id.trim()], 
        (err, row) => {
          if (err) reject(err);
          resolve(row);
        }
      );
    });

    if (!user) {
      console.log(` Login attempt with non-existent digital ID: ${digital_id}`);
      return res.status(404).json({ success: false, message: "Invalid credentials" });
    }

    if (!user.is_verified) {
      return res.status(403).json({ 
        success: false, 
        message: "Please verify your email first. Check your inbox for verification code.",
        requires_verification: true,
        digital_id: digital_id
      });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: "Account is deactivated. Contact administrator." });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      console.log(` Invalid password attempt for: ${digital_id}`);
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Generate comprehensive JWT token
    const tokenPayload = { 
      digital_id: user.digital_id, 
      role: user.role, 
      industry_type: user.industry_type,
      organization_id: user.organization_id,
      name: user.name,
      email: user.email,
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "24h" });

    // Update last login and login tracking
    req.db.run(
      "UPDATE users SET last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE digital_id = ?", 
      [digital_id]
    );

    // Log successful login (audit log, not the attendance table)
    logAudit({
      digital_id: user.digital_id,
      organization_id: user.organization_id,
      action: 'login',
      details: 'User logged in',
      ip_address: clientIp,
      user_agent: userAgent
    });

    console.log(` User ${digital_id} logged in successfully from ${clientIp}`);

    res.json({
      success: true,
      token,
      digital_id: user.digital_id,
      role: user.role,
      name: user.name,
      industry_type: user.industry_type,
      organization_id: user.organization_id,
      organization_name: user.organization_name,
      organization_type: user.organization_type,
      message: "Login successful"
    });

  } catch (error) {
    console.error(" Login error:", error);
    res.status(500).json({ success: false, message: "Login failed. Please try again." });
  }
});

// Enhanced Profile Route with organization context
router.get('/profile', authenticateToken, (req, res) => {
  const digital_id = req.user.digital_id;

  req.db.get(`
    SELECT u.*, o.name as organization_name, o.type as organization_type, o.contact_email as org_contact,
           d.name as department_name
    FROM users u
    LEFT JOIN organizations o ON u.organization_id = o.id
    LEFT JOIN departments d ON u.profile_data LIKE '%"department":"' || d.name || '"%' AND d.organization_id = u.organization_id
    WHERE u.digital_id = ?
  `, [digital_id], (err, user) => {
    if (err) {
      console.error(" Profile fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch profile" });
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Parse profile data safely
    try {
      user.profile_data = user.profile_data ? JSON.parse(user.profile_data) : {};
    } catch (parseErr) {
      console.error(" Profile data parse error:", parseErr);
      user.profile_data = {};
    }

    // Remove sensitive information
    delete user.password;

    console.log(` Profile fetched for: ${digital_id}`);
    res.json({ success: true, user });
  });
});

// Update Profile Route
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const digital_id = req.user.digital_id;
    // NOTE: the `users` table has no `dateofbirth`/`address` columns, so only
    // update the columns that actually exist to avoid the query failing.
    const { name } = req.body;
    let email = req.body.email;
    let phone = req.body.phone;

    // Validation
    if (!name || !email) {
      return res.status(400).json({ success: false, message: "Name and email are required" });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: "Please provide a valid email address" });
    }

    // Check if email is already taken by another user
    const existingUser = await new Promise((resolve, reject) => {
      req.db.get("SELECT digital_id FROM users WHERE email = ? AND digital_id != ?", [email.toLowerCase(), digital_id], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });

    if (existingUser) {
      return res.status(409).json({ success: false, message: "Email address is already in use" });
    }

    // Update user profile
    await new Promise((resolve, reject) => {
      req.db.run(`
        UPDATE users
        SET name = ?, email = ?, phone = ?, updated_at = CURRENT_TIMESTAMP
        WHERE digital_id = ?
      `, [name, email.toLowerCase(), phone, digital_id], function(err) {
        if (err) reject(err);
        resolve();
      });
    });

    console.log(` Profile updated for: ${digital_id}`);
    res.json({ success: true, message: "Profile updated successfully" });

  } catch (error) {
    console.error(" Profile update error:", error);
    res.status(500).json({ success: false, message: "Failed to update profile" });
  }
});

// Change Password Route
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const digital_id = req.user.digital_id;
    const { currentPassword, newPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Current password and new password are required" });
    }

    if (newPassword.length < 12) {
      return res.status(400).json({ success: false, message: "New password must be at least 12 characters long" });
    }

    // Get current user password
    const user = await new Promise((resolve, reject) => {
      req.db.get("SELECT password FROM users WHERE digital_id = ?", [digital_id], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await new Promise((resolve, reject) => {
      req.db.run("UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE digital_id = ?", [hashedNewPassword, digital_id], function(err) {
        if (err) reject(err);
        resolve();
      });
    });

    console.log(` Password changed for: ${digital_id}`);
    res.json({ success: true, message: "Password changed successfully" });

  } catch (error) {
    console.error(" Password change error:", error);
    res.status(500).json({ success: false, message: "Failed to change password" });
  }
});

// Enhanced Forgot Password Route with email functionality
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    // Rate limiting for forgot password requests
    if (!(await checkRateLimit(`forgot_${clientIp}`, 3, 600000))) { // 3 attempts per 10 minutes
      return res.status(429).json({ success: false, message: 'Too many password reset requests. Please wait 10 minutes.' });
    }

    // Validation
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required' });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }

    // Check if user exists
    const user = await new Promise((resolve, reject) => {
      req.db.get(
        `SELECT u.digital_id, u.name, u.is_verified, u.organization_id, o.name as org_name
         FROM users u
         LEFT JOIN organizations o ON u.organization_id = o.id
         WHERE u.email = ?`,
        [email.toLowerCase()],
        (err, row) => {
          if (err) reject(err);
          resolve(row);
        }
      );
    });

    if (!user) {
      // For security, don't reveal if email exists or not
      console.log(` Password reset attempt for non-existent email: ${maskEmail(email)}`);
      return res.status(200).json({
        success: true,
        message: 'If the email address is registered, you will receive password reset instructions shortly.'
      });
    }

    if (!user.is_verified) {
      return res.status(400).json({
        success: false,
        message: 'Please verify your email address first before resetting password.'
      });
    }

    // Generate secure reset token
    const resetToken = jwt.sign(
      {
        digital_id: user.digital_id,
        email: email.toLowerCase(),
        type: 'password_reset'
      },
      JWT_SECRET,
      { expiresIn: '1h' } // Token expires in 1 hour
    );

    // Store reset token persistently (survives restarts)
    await setResetToken(email.toLowerCase(), {
      token: resetToken,
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
      used: false
    });

    // Get organization name for email branding
    const orgName = user.org_name || 'Universal Attendance';

    // Generate reset link for local development using 127.0.0.1
    const resetLink = `http://127.0.0.1:4000/pages/reset-password.html?token=${resetToken}`;
    const safeOrg = escapeHtml(orgName).replace(/[\r\n]+/g, ' ');
    const safeUserName = escapeHtml(user.name);
    const mailOptions = {
      from: `"${safeOrg.replace(/"/g, '')}" <${EMAIL_USER}>`,
      to: email,
      subject: `Password Reset Request - ${safeOrg}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
          <div style="background: white; border-radius: 10px; padding: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #2c3e50; margin: 0;">Password Reset Request</h1>
              <p style="color: #7f8c8d; margin: 10px 0;">${safeOrg} - Attendance System</p>
            </div>

            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #856404; margin-top: 0;">Hello ${safeUserName}!</h4>
              <p style="margin: 10px 0;">You have requested to reset your password for your ${safeOrg} account.</p>
              <p style="margin: 10px 0; color: #856404;">
                <strong>Digital ID:</strong> ${user.digital_id}
              </p>
            </div>

            <div style="background: linear-gradient(135deg, #3498db 0%, #2980b9 100%); padding: 30px; border-radius: 8px; text-align: center; margin: 20px 0;">
              <h3 style="color: white; margin: 0 0 20px 0;">Reset Your Password</h3>
              <p style="color: rgba(255,255,255,0.9); margin: 0 0 20px 0;">
                Click the button below to reset your password. This link will expire in 1 hour.
              </p>
              <a href="${resetLink}" style="background: white; color: #3498db; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: 600; display: inline-block;">
                Reset Password
              </a>
            </div>

            <div style="background: #d1ecf1; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h5 style="color: #0c5460; margin-top: 0;">Security Information</h5>
              <ul style="color: #0c5460; margin: 10px 0; padding-left: 20px;">
                <li>This reset link expires in 1 hour</li>
                <li>For security, this request was made from IP: ${clientIp}</li>
                <li>If you didn't request this reset, please ignore this email</li>
              </ul>
            </div>

            <div style="border-top: 1px solid #e9ecef; padding-top: 20px; text-align: center;">
              <p style="color: #6c757d; font-size: 12px; margin: 0;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="color: #6c757d; font-size: 11px; margin: 5px 0; word-break: break-all;">
                ${resetLink}
              </p>
            </div>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    console.log(` Password reset email sent to: ${maskEmail(email)}`);
    res.json({
      success: true,
      message: 'Password reset instructions have been sent to your email address.'
    });

  } catch (error) {
    console.error(" Forgot password error:", error);
    res.status(500).json({ success: false, message: "Failed to process password reset request. Please try again." });
  }
});

// Verify reset token endpoint
router.post('/verify-reset-token', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Reset token is required' });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type !== 'password_reset') {
      return res.status(400).json({ success: false, message: 'Invalid token type' });
    }

    // Check if token exists in our persistent store
    const tokenData = await getResetToken(decoded.email);

    if (!tokenData || tokenData.used) {
      return res.status(400).json({ success: false, message: 'Token not found or already used' });
    }

    // Check if token matches (defense in depth against a stale store entry)
    if (tokenData.token !== token) {
      return res.status(400).json({ success: false, message: 'Invalid token' });
    }

    // Check if token is expired
    if (Date.now() > tokenData.expires) {
      return res.status(400).json({ success: false, message: 'Token has expired' });
    }

    console.log(` Reset token verified for: ${maskEmail(decoded.email)}`);
    res.json({
      success: true,
      message: 'Token verified successfully',
      email: decoded.email,
      digital_id: decoded.digital_id
    });

  } catch (error) {
    console.error(' Token verification error:', error);
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({ success: false, message: 'Token has expired' });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(400).json({ success: false, message: 'Invalid token' });
    }
    res.status(500).json({ success: false, message: 'Token verification failed' });
  }
});

// Reset password endpoint
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and new password are required' });
    }

    if (newPassword.length < 12) {
      return res.status(400).json({ success: false, message: 'Password must be at least 12 characters long' });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type !== 'password_reset') {
      return res.status(400).json({ success: false, message: 'Invalid token type' });
    }

    // Check if token exists in our persistent store
    const tokenData = await getResetToken(decoded.email);

    if (!tokenData || tokenData.used) {
      return res.status(400).json({ success: false, message: 'Token not found or already used' });
    }

    // Check if token matches (defense in depth against a stale store entry)
    if (tokenData.token !== token) {
      return res.status(400).json({ success: false, message: 'Invalid token' });
    }

    // Check if token is expired
    if (Date.now() > tokenData.expires) {
      return res.status(400).json({ success: false, message: 'Token has expired' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password in database
    await new Promise((resolve, reject) => {
      req.db.run(
        'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE digital_id = ?',
        [hashedPassword, decoded.digital_id],
        function(err) {
          if (err) reject(err);
          resolve();
        }
      );
    });

    // Mark token as used (persistently)
    await markResetTokenUsed(decoded.email);

    // Log password reset activity (audit log, not the attendance table)
    logAudit({
      digital_id: decoded.digital_id,
      action: 'password_reset',
      details: 'Password reset via email',
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.headers['user-agent'] || 'Unknown'
    });

    console.log(` Password reset successful for: ${decoded.digital_id}`);
    res.json({
      success: true,
      message: 'Password reset successfully! You can now login with your new password.'
    });

  } catch (error) {
    console.error(' Password reset error:', error);
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({ success: false, message: 'Token has expired' });
    } else if (error.name === 'JsonWebTokenError') {
      return res.status(400).json({ success: false, message: 'Invalid token' });
    }
    res.status(500).json({ success: false, message: 'Password reset failed. Please try again.' });
  }
});

// Validate organization code endpoint (for frontend validation)
router.post('/validate-org-code', (req, res) => {
  const { code, industry_type } = req.body;

  if (!code) {
    return res.status(400).json({ success: false, message: "Organization code is required" });
  }

  // Validate organization code
  req.db.get(`
    SELECT oc.*, o.name as organization_name, o.type as organization_industry
    FROM organization_codes oc
    LEFT JOIN organizations o ON oc.organization_id = o.id
    WHERE UPPER(oc.code) = ? AND oc.is_active = 1
  `, [code.toUpperCase()], (err, codeData) => {
    if (err) {
      console.error(" Organization code validation error:", err);
      return res.status(500).json({ success: false, message: "Database error during validation" });
    }

    if (!codeData) {
      return res.status(400).json({ success: false, message: "Invalid organization code" });
    }

    // Check if code is expired
    if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: "Organization code has expired" });
    }

    // Check usage limit
    if (codeData.max_uses && codeData.usage_count >= codeData.max_uses) {
      return res.status(400).json({ success: false, message: "Organization code usage limit exceeded" });
    }

    console.log(` Organization code validated: ${code} for ${codeData.organization_name}`);

    res.json({
      success: true,
      organization_name: codeData.organization_name,
      organization_id: codeData.organization_id,
      admin_name: codeData.admin_name || 'Organization Admin',
      message: "Organization code is valid"
    });
  });
});

// Middleware to set database reference
router.use((req, res, next) => {
  router.db = req.db;
  next();
});

module.exports = router;
