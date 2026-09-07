/**
 * JWT Authentication Middleware
 * Enhanced with role-based access control for different organization types
 */
const jwt = require('jsonwebtoken');

// Environment variables (set via backend/.env, loaded by the server entry point)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set. Configure backend/.env before starting the server.');
}

// Enhanced JWT authentication middleware
const authenticateToken = (req, res, next) => {
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
};

// Canonical admin role names (lowercase). Centralized so every role guard
// accepts exactly the same set — previously requireAdmin and requireOrgAdmin
// disagreed, causing inconsistent authorization.
const ADMIN_ROLES = [
  'admin',
  'administrator',
  'system administrator',
  'super admin',
  'super_admin',
  'org_admin',
  'organization admin',
  'organization_admin'
];

const isAdminRole = (role) => {
  if (typeof role !== 'string') return false;
  return ADMIN_ROLES.includes(role.toLowerCase().trim());
};

// Enhanced admin middleware with better role checking
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.role) {
    return res.status(403).json({ success: false, message: "Admin access required" });
  }
  
  if (!isAdminRole(req.user.role)) {
    console.log(` Access denied for role: ${req.user.role}`);
    return res.status(403).json({ success: false, message: "Admin privileges required" });
  }
  
  console.log(` Admin access granted for: ${req.user.digital_id}`);
  next();
};

// Enhanced teacher middleware
const requireTeacher = (req, res, next) => {
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
};

// Middleware to require organization admin role (uses the shared canonical
// admin role set, case-insensitive — previously only 'admin'/'org_admin' with
// exact case matching, which denied legitimate 'Administrator' accounts).
const requireOrgAdmin = (req, res, next) => {
    if (!req.user || !isAdminRole(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: 'Access denied: Organization admin privileges required'
        });
    }
    next();
};

// Middleware to require education organization type
const requireEducationOrg = (req, res, next) => {
    if (!req.user || !req.user.industry_type || req.user.industry_type !== 'education') {
        return res.status(403).json({
            success: false,
            message: 'Access denied: Education organization required'
        });
    }
    next();
};

// Middleware to require healthcare organization type
const requireHealthcareOrg = (req, res, next) => {
    if (!req.user || !req.user.industry_type || req.user.industry_type !== 'healthcare') {
        return res.status(403).json({
            success: false,
            message: 'Access denied: Healthcare organization required'
        });
    }
    next();
};

// Middleware to require corporate organization type
const requireCorporateOrg = (req, res, next) => {
    if (!req.user || !req.user.industry_type || req.user.industry_type !== 'corporate') {
        return res.status(403).json({
            success: false,
            message: 'Access denied: Corporate organization required'
        });
    }
    next();
};

module.exports = {
    authenticateToken,
    requireAdmin,
    requireTeacher,
    requireOrgAdmin,
    requireEducationOrg,
    requireHealthcareOrg,
    requireCorporateOrg
};
