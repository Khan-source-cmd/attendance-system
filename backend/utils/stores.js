/**
 * Persistent runtime stores backed by SQLite (survive restarts, work across
 * multiple Node processes). Replaces the old in-memory Maps for:
 *   - Email verification OTPs
 *   - Password reset tokens
 *   - Rate limiting
 *
 * Uses the shared connection from ../config/database.
 */
const { db } = require('../config/database');

/* --------------------------- OTP ----------------------------------------- */

function setOTP(identifier, data) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO otp_verifications (identifier, otp, expires_at, attempts)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(identifier) DO UPDATE SET
         otp = excluded.otp,
         expires_at = excluded.expires_at,
         attempts = excluded.attempts`,
      [identifier, data.otp, data.expires, data.attempts || 0],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

function getOTP(identifier) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT otp, expires_at AS expires, attempts FROM otp_verifications WHERE identifier = ?',
      [identifier],
      (err, row) => (err ? reject(err) : resolve(row || null))
    );
  });
}

function incrementOTPAttempts(identifier, currentAttempts) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE otp_verifications SET attempts = ? WHERE identifier = ?',
      [currentAttempts, identifier],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

function deleteOTP(identifier) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM otp_verifications WHERE identifier = ?', [identifier],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

/* --------------------------- Reset tokens -------------------------------- */

function setResetToken(email, data) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO password_reset_tokens (email, token, expires_at, used)
       VALUES (?, ?, ?, 0)
       ON CONFLICT(email) DO UPDATE SET
         token = excluded.token,
         expires_at = excluded.expires_at,
         used = 0`,
      [email.toLowerCase(), data.token, data.expires],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

function getResetToken(email) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT token, expires_at AS expires, used FROM password_reset_tokens WHERE email = ?',
      [email.toLowerCase()],
      (err, row) => (err ? reject(err) : resolve(row || null))
    );
  });
}

function markResetTokenUsed(email) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE password_reset_tokens SET used = 1 WHERE email = ?',
      [email.toLowerCase()],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

function deleteResetToken(email) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM password_reset_tokens WHERE email = ?', [email.toLowerCase()],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

/* --------------------------- Rate limiting ------------------------------- */

/**
 * Sliding-window rate limiter. Returns a Promise<boolean> (true = allowed).
 * Fail-open on storage errors so a store hiccup doesn't break logins.
 */
function checkRateLimit(key, limit = 5, windowMs = 60000) {
  const now = Date.now();
  const windowStart = now - windowMs;

  return new Promise((resolve) => {
    db.get(
      'SELECT COUNT(*) AS c FROM rate_limits WHERE rate_key = ? AND ts > ?',
      [key, windowStart],
      (err, row) => {
        if (err) return resolve(true);
        if (row.c >= limit) return resolve(false);

        db.run('INSERT INTO rate_limits (rate_key, ts) VALUES (?, ?)', [key, now], (err2) => {
          if (err2) return resolve(true);
          // Opportunistically prune stale entries for this key.
          db.run('DELETE FROM rate_limits WHERE rate_key = ? AND ts <= ?', [key, windowStart], () => {});
          resolve(true);
        });
      }
    );
  });
}

/**
 * Read-only rate-limit probe. Returns Promise<boolean> (true = already over the
 * limit) WITHOUT recording a new hit. Pair with recordRateLimitHit() so that
 * only failed attempts count toward the limit (successful logins stay free).
 * Fail-open on storage errors.
 */
function peekRateLimit(key, limit = 5, windowMs = 60000) {
  const windowStart = Date.now() - windowMs;

  return new Promise((resolve) => {
    db.get(
      'SELECT COUNT(*) AS c FROM rate_limits WHERE rate_key = ? AND ts > ?',
      [key, windowStart],
      (err, row) => {
        if (err) return resolve(false);
        resolve(row.c >= limit);
      }
    );
  });
}

/**
 * Record a single hit for a key (use for failed attempts only). Fail-open.
 */
function recordRateLimitHit(key, windowMs = 60000) {
  const now = Date.now();
  const windowStart = now - windowMs;

  return new Promise((resolve) => {
    db.run('INSERT INTO rate_limits (rate_key, ts) VALUES (?, ?)', [key, now], (err) => {
      if (err) return resolve(false);
      // Opportunistically prune stale entries for this key.
      db.run('DELETE FROM rate_limits WHERE rate_key = ? AND ts <= ?', [key, windowStart], () => {});
      resolve(true);
    });
  });
}

/**
 * Clear every hit for a key (e.g. after a successful login). Fail-open.
 */
function clearRateLimit(key) {
  return new Promise((resolve) => {
    db.run('DELETE FROM rate_limits WHERE rate_key = ?', [key], () => resolve(true));
  });
}

/* --------------------------- Audit log ----------------------------------- */

/**
 * Persist a security/audit event (login, password reset, etc.).
 * Fail-open: auditing must never break the primary request.
 */
function logAudit(entry) {
  const { digital_id = null, organization_id = null, action, details = null, ip_address = null, user_agent = null } = entry;
  db.run(
    `INSERT INTO audit_logs (digital_id, organization_id, action, details, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [digital_id, organization_id, action, details, ip_address, user_agent],
    (err) => { if (err) console.error('audit_logs insert failed:', err.message); }
  );
}

module.exports = {
  setOTP,
  getOTP,
  incrementOTPAttempts,
  deleteOTP,
  setResetToken,
  getResetToken,
  markResetTokenUsed,
  deleteResetToken,
  checkRateLimit,
  peekRateLimit,
  recordRateLimitHit,
  clearRateLimit,
  logAudit
};