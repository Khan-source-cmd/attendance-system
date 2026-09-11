/**
 * Universal Attendance System - Attendance Routes
 * Handles attendance tracking, QR codes, manual requests, and history
 */

const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');

// Import middleware
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Shared persistent rate limiter (SQLite-backed, survives restarts)
const { checkRateLimit } = require('../utils/stores');

// Get user's current attendance state
function getUserAttendanceState(db, digitalId, callback) {
  const query = `
    SELECT punch_type, timestamp
    FROM attendance
    WHERE digital_id = ?
    ORDER BY timestamp DESC, id DESC
    LIMIT 1
  `;

  db.get(query, [digitalId], (err, lastPunch) => {
    if (err) {
      callback(err, null);
      return;
    }

    // Determine current state based on last punch
    let currentState = 'ready'; // Default state - ready to punch in

    if (lastPunch) {
      switch (lastPunch.punch_type) {
        case 'in':
          currentState = 'checked_in'; // Last action was punch in, so currently checked in
          break;
        case 'out':
          currentState = 'checked_out'; // Last action was punch out, so currently checked out
          break;
        case 'break_start':
          currentState = 'on_break'; // Last action was break start, so currently on break
          break;
        case 'break_end':
          currentState = 'checked_in'; // Last action was break end, so back to checked in
          break;
        default:
          currentState = 'ready';
      }
    }

    callback(null, {
      state: currentState,
      last_punch: lastPunch,
      last_punch_type: lastPunch ? lastPunch.punch_type : null,
      last_punch_time: lastPunch ? lastPunch.timestamp : null
    });
  });
}

// Validate punch type against current state
function validatePunchTransition(currentState, requestedPunchType) {
  const validTransitions = {
    'ready': ['in'], // Can only punch in when ready
    'checked_in': ['out', 'break_start'], // Can punch out or start break when checked in
    'on_break': ['break_end'], // Can only end break when on break
    'checked_out': ['in'] // Can only punch in when checked out
  };

  const allowedPunches = validTransitions[currentState] || [];

  if (!allowedPunches.includes(requestedPunchType)) {
    // Generate user-friendly error message
    let errorMessage = '';

    switch (currentState) {
      case 'ready':
        errorMessage = 'You are already punched out. Please punch in first.';
        break;
      case 'checked_in':
        if (requestedPunchType === 'in') {
          errorMessage = 'You are already punched in. Please punch out first.';
        } else if (requestedPunchType === 'break_end') {
          errorMessage = 'You are not currently on break. Please start a break first.';
        } else {
          errorMessage = `Invalid action: You are currently punched in. You can only punch out or start a break.`;
        }
        break;
      case 'on_break':
        if (requestedPunchType === 'break_start') {
          errorMessage = 'You are already on break. Please end your current break first.';
        } else if (requestedPunchType === 'in') {
          errorMessage = 'You are currently on break. Please end your break first.';
        } else if (requestedPunchType === 'out') {
          errorMessage = 'You are currently on break. Please end your break before punching out.';
        } else {
          errorMessage = 'You are currently on break. You can only end your break.';
        }
        break;
      case 'checked_out':
        if (requestedPunchType === 'out') {
          errorMessage = 'You are already punched out. Please punch in first.';
        } else if (requestedPunchType === 'break_start') {
          errorMessage = 'You must punch in before starting a break.';
        } else if (requestedPunchType === 'break_end') {
          errorMessage = 'You must start a break before ending it.';
        } else {
          errorMessage = 'You are currently punched out. You can only punch in.';
        }
        break;
      default:
        errorMessage = 'Invalid punch request. Please try again.';
    }

    return {
      valid: false,
      error: errorMessage,
      current_state: currentState,
      requested_punch: requestedPunchType,
      allowed_punches: allowedPunches
    };
  }

  return {
    valid: true,
    current_state: currentState,
    requested_punch: requestedPunchType,
    allowed_punches: allowedPunches
  };
}

// Submit manual punch request (requires approval)
router.post('/request', authenticateToken, async (req, res) => {
  const { punch_type, requested_timestamp, notes, attendance_method = 'manual', location_data } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;
  
  if (!punch_type || !requested_timestamp) {
    return res.status(400).json({ success: false, message: "Punch type and timestamp are required" });
  }

  // Validate punch type
  const validPunchTypes = ['in', 'out', 'break_start', 'break_end'];
  if (!validPunchTypes.includes(punch_type)) {
    return res.status(400).json({ success: false, message: "Invalid punch type" });
  }

  // Rate limiting for manual requests
  if (!(await checkRateLimit(`manual_request_${req.user.digital_id}`, 10, 3600000))) { // 10 requests per hour
    return res.status(429).json({ success: false, message: "Too many manual requests. Please wait." });
  }

  req.db.run(`
    INSERT INTO pending_requests (digital_id, organization_id, punch_type, requested_timestamp, attendance_method, location_data, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    req.user.digital_id,
    req.user.organization_id || 1,
    punch_type,
    requested_timestamp,
    attendance_method,
    JSON.stringify(location_data || {}),
    notes || ''
  ], function(err) {
    if (err) {
      console.error(" Manual request submission error:", err);
      return res.status(500).json({ success: false, message: "Failed to submit request" });
    }

    console.log(` Manual ${punch_type} request submitted by ${req.user.digital_id} for ${requested_timestamp}`);

    res.json({
      success: true,
      message: `${punch_type.toUpperCase().replace('_', ' ')} request submitted for admin approval`,
      request_id: this.lastID,
      status: 'pending'
    });
  });
});

// Get pending requests (admin only)
router.get('/requests', authenticateToken, requireAdmin, (req, res) => {
  const { status = 'pending', limit = 50, offset = 0 } = req.query;
  const organizationId = req.user.organization_id;

  let query = `
    SELECT pr.*, u.name, u.role, u.industry_type
    FROM pending_requests pr
    LEFT JOIN users u ON pr.digital_id = u.digital_id
    WHERE pr.organization_id = ?
  `;
  let params = [organizationId];

  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    query += ` AND pr.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  req.db.all(query, params, (err, requests) => {
    if (err) {
      console.error(" Pending requests fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch requests" });
    }

    // Parse location data
    const processedRequests = requests.map(req => ({
      ...req,
      location_data: req.location_data ? JSON.parse(req.location_data) : null
    }));

    console.log(` Admin fetched ${requests.length} pending requests`);
    res.json({ success: true, requests: processedRequests });
  });
});

// Approve manual punch request (admin only)
router.post('/requests/:id/approve', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { admin_notes } = req.body;
  const adminId = req.user.digital_id;
  const organizationId = req.user.organization_id;

  // First check if request exists and is pending
  req.db.get(
    "SELECT * FROM pending_requests WHERE id = ? AND organization_id = ? AND status = 'pending'",
    [id, organizationId],
    (err, request) => {
      if (err || !request) {
        return res.status(404).json({ success: false, message: "Request not found or already processed" });
      }

      // Begin transaction for atomic operation
      req.db.serialize(() => {
        req.db.run("BEGIN TRANSACTION");

        // Insert actual attendance record with requested timestamp
        req.db.run(`
          INSERT INTO attendance (digital_id, organization_id, attendance_method, location_data, punch_type, timestamp, notes, verified_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          request.digital_id,
          request.organization_id,
          request.attendance_method,
          request.location_data,
          request.punch_type,
          request.requested_timestamp,
          `Manual entry approved by admin: ${request.notes || ''}`,
          adminId
        ], function(attendanceErr) {
          if (attendanceErr) {
            req.db.run("ROLLBACK");
            console.error(" Attendance creation error:", attendanceErr);
            return res.status(500).json({ success: false, message: "Failed to create attendance record" });
          }

          // Update request status
          req.db.run(`
            UPDATE pending_requests 
            SET status = 'approved', admin_id = ?, admin_notes = ?, decision_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [adminId, admin_notes || '', id], function(updateErr) {
            if (updateErr) {
              req.db.run("ROLLBACK");
              console.error(" Request update error:", updateErr);
              return res.status(500).json({ success: false, message: "Failed to update request" });
            }

            req.db.run("COMMIT", (commitErr) => {
              if (commitErr) {
                console.error(" Transaction commit error:", commitErr);
                return res.status(500).json({ success: false, message: "Failed to approve request" });
              }

              console.log(` Manual ${request.punch_type} request approved by ${adminId} for user ${request.digital_id}`);

              res.json({
                success: true,
                message: `${request.punch_type.toUpperCase().replace('_', ' ')} request approved successfully`,
                attendance_id: this.lastID,
                approved_by: adminId,
                approved_at: new Date().toISOString()
              });
            });
          });
        });
      });
    }
  );
});

// Reject manual punch request (admin only)
router.post('/requests/:id/reject', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { admin_notes, reason } = req.body;
  const adminId = req.user.digital_id;
  const organizationId = req.user.organization_id;

  req.db.get(
    "SELECT * FROM pending_requests WHERE id = ? AND organization_id = ? AND status = 'pending'",
    [id, organizationId],
    (err, request) => {
      if (err || !request) {
        return res.status(404).json({ success: false, message: "Request not found or already processed" });
      }

      req.db.run(`
        UPDATE pending_requests 
        SET status = 'rejected', admin_id = ?, admin_notes = ?, decision_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [adminId, reason || admin_notes || 'Request rejected by administrator', id], function(updateErr) {
        if (updateErr) {
          console.error(" Request rejection error:", updateErr);
          return res.status(500).json({ success: false, message: "Failed to reject request" });
        }

        console.log(` Manual ${request.punch_type} request rejected by ${adminId} for user ${request.digital_id}`);

        res.json({
          success: true,
          message: `${request.punch_type.toUpperCase().replace('_', ' ')} request rejected`,
          reason: reason || admin_notes || 'Request rejected by administrator',
          rejected_by: adminId,
          rejected_at: new Date().toISOString()
        });
      });
    }
  );
});

// Enhanced attendance punch with comprehensive tracking and state validation
router.post('/punch', authenticateToken, async (req, res) => {
  const { punch_type, attendance_method = 'manual', notes, location_data } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'Unknown';

  if (!punch_type) {
    return res.status(400).json({ success: false, message: "Punch type is required" });
  }

  // Validate punch type
  const validPunchTypes = ['in', 'out', 'break_start', 'break_end'];
  if (!validPunchTypes.includes(punch_type)) {
    return res.status(400).json({ success: false, message: "Invalid punch type" });
  }

  // Rate limiting for punch requests
  if (!(await checkRateLimit(`punch_${req.user.digital_id}`, 20, 3600000))) { // 20 punches per hour
    return res.status(429).json({ success: false, message: "Too many attendance entries. Please wait." });
  }

  // Server-side geofence enforcement (in the async route context, BEFORE the
  // state callback, so no await is needed inside the synchronous SQLite flow).
  const geo = await validateGeofence(req.db, req.user.organization_id, location_data);
  if (!geo.ok) {
    console.log(` Geofence rejected punch for ${req.user.digital_id}: ${geo.message}`);
    return res.status(geo.status).json({ success: false, message: geo.message });
  }

  // Get user's current attendance state and validate the punch
  getUserAttendanceState(req.db, req.user.digital_id, (err, stateInfo) => {
    if (err) {
      console.error(" State check error:", err);
      return res.status(500).json({ success: false, message: "Failed to validate attendance state" });
    }

    // Validate the punch transition
    const validation = validatePunchTransition(stateInfo.state, punch_type);

    if (!validation.valid) {
      console.log(`Invalid punch attempt: ${req.user.digital_id} tried ${punch_type} from ${stateInfo.state} state`);
      return res.status(400).json({
        success: false,
        message: validation.error,
        current_state: validation.current_state,
        requested_punch: validation.requested_punch,
        allowed_punches: validation.allowed_punches,
        last_punch: stateInfo.last_punch
      });
    }

    // If validation passes, proceed with the punch (geofence already validated above)
    req.db.run(`
      INSERT INTO attendance (digital_id, organization_id, attendance_method, location_data, punch_type, notes, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.user.digital_id,
      req.user.organization_id || 1,
      attendance_method,
      JSON.stringify(Object.assign({}, location_data || {}, geo.fence ? { geofence: geo.fence, distance_m: geo.distance } : {})),
      punch_type,
      notes || '',
      clientIp,
      userAgent
    ], function(err) {
      if (err) {
        console.error(" Attendance punch error:", err);
        return res.status(500).json({ success: false, message: "Failed to log attendance" });
      }

      console.log(` ${punch_type.toUpperCase()} logged for ${req.user.digital_id} via ${attendance_method} from ${clientIp} (State: ${stateInfo.state})`);

      res.json({
        success: true,
        message: `${punch_type.toUpperCase().replace('_', ' ')} logged successfully`,
        timestamp: new Date().toISOString(),
        method: attendance_method,
        id: this.lastID,
        previous_state: stateInfo.state,
        new_state: getNewStateAfterPunch(stateInfo.state, punch_type)
      });
    });
  });
});

// Helper function to determine new state after a punch
function getNewStateAfterPunch(currentState, punchType) {
  switch (punchType) {
    case 'in':
      return 'checked_in';
    case 'out':
      return 'checked_out';
    case 'break_start':
      return 'on_break';
    case 'break_end':
      return 'checked_in';
    default:
      return currentState;
  }
}

// Get user's current attendance state (new endpoint)
router.get('/state', authenticateToken, (req, res) => {
  getUserAttendanceState(req.db, req.user.digital_id, (err, stateInfo) => {
    if (err) {
      console.error(" State fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch attendance state" });
    }

    console.log(` Fetched attendance state for ${req.user.digital_id}: ${stateInfo.state}`);

    res.json({
      success: true,
      state: stateInfo.state,
      last_punch: stateInfo.last_punch,
      last_punch_type: stateInfo.last_punch_type,
      last_punch_time: stateInfo.last_punch_time,
      allowed_actions: getAllowedActions(stateInfo.state)
    });
  });
});

// Helper function to get allowed actions for current state
function getAllowedActions(currentState) {
  const actionMap = {
    'ready': [
      { action: 'in', label: 'Punch In', description: 'Start your workday' }
    ],
    'checked_in': [
      { action: 'out', label: 'Punch Out', description: 'End your workday' },
      { action: 'break_start', label: 'Start Break', description: 'Take a break' }
    ],
    'on_break': [
      { action: 'break_end', label: 'End Break', description: 'Resume work' }
    ],
    'checked_out': [
      { action: 'in', label: 'Punch In', description: 'Start your workday' }
    ]
  };

  return actionMap[currentState] || [];
}

// Haversine distance in meters
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * SERVER-SIDE geofence enforcement (previously only checked in client JS,
 * which was trivially bypassable). If the organization has active geofences:
 *  - punches MUST include GPS coordinates in location_data
 *  - the coordinates MUST fall inside at least one fence radius
 * If the organization has no geofences, punches are allowed from anywhere.
 */
function validateGeofence(db, organizationId, locationData) {
  return new Promise((resolve) => {
    db.all(
      `SELECT name, latitude, longitude, radius FROM geofences WHERE organization_id = ? AND is_active = 1`,
      [organizationId],
      (err, fences) => {
        if (err) {
          console.error(' Geofence lookup error:', err);
          return resolve({ ok: true }); // fail-open on DB error, never block attendance on infra failure
        }
        if (!fences || fences.length === 0) return resolve({ ok: true });

        let lat = locationData ? locationData.latitude : undefined;
        let lng = locationData ? locationData.longitude : undefined;
        if (typeof lat === 'string') lat = parseFloat(lat);
        if (typeof lng === 'string') lng = parseFloat(lng);

        if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
          return resolve({
            ok: false,
            status: 400,
            message: 'GPS location is required for attendance. Please allow location access and try again.'
          });
        }

        for (const f of fences) {
          const distance = haversineMeters(lat, lng, f.latitude, f.longitude);
          if (distance <= (f.radius || 0)) {
            return resolve({ ok: true, fence: f.name, distance: Math.round(distance) });
          }
        }
        resolve({
          ok: false,
          status: 403,
          message: 'You are outside all geofenced attendance areas. Please move within the allowed location boundary.'
        });
      }
    );
  });
}

// Generate single-use QR code for specific user
router.post('/generate-user-qr', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { user_id, location_name, valid_hours = 24 } = req.body;

    // Debug logging
    console.log('🔍 QR Generation Debug:', {
      user_id: req.user.digital_id,
      user_role: req.user.role,
      user_org_id: req.user.organization_id,
      target_user_id: user_id,
      location_name,
      valid_hours
    });

    if (!user_id || !location_name) {
      return res.status(400).json({ success: false, message: "User ID and location name are required" });
    }

    // Check if organization_id is available
    if (!req.user.organization_id) {
      console.error(' Organization ID is undefined in user session:', req.user);
      return res.status(400).json({
        success: false,
        message: "Organization ID not found. Please logout and login again.",
        debug: {
          user: req.user.digital_id,
          role: req.user.role,
          has_org_id: !!req.user.organization_id
        }
      });
    }

    // Verify user exists and belongs to same organization
    req.db.get(
      "SELECT digital_id, name FROM users WHERE digital_id = ? AND organization_id = ? AND is_active = 1",
      [user_id, req.user.organization_id],
      async (err, user) => {
        if (err) {
          console.error(' Database error during user lookup:', err);
          return res.status(500).json({ success: false, message: "Database error during user verification" });
        }

        if (!user) {
          console.log(' User not found or not in same organization:', {
            target_user_id: user_id,
            admin_org_id: req.user.organization_id,
            user_exists: !!user
          });
          return res.status(404).json({
            success: false,
            message: "User not found in your organization or not active",
            debug: {
              target_user_id: user_id,
              admin_org_id: req.user.organization_id
            }
          });
        }

        const qrId = `QR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const qrData = {
          id: qrId,
          user_id: user_id,
          org_id: req.user.organization_id || 1,
          location: location_name,
          timestamp: Date.now(),
          created_by: req.user.digital_id
        };

        const qrCode = await QRCode.toDataURL(JSON.stringify(qrData), {
          errorCorrectionLevel: 'M',
          type: 'image/png',
          quality: 0.92,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });

        const validUntil = new Date(Date.now() + (valid_hours * 60 * 60 * 1000));

        // Store single-use QR code in database
        req.db.run(`
          INSERT INTO qr_codes (
            organization_id, assigned_user, code, location_name,
            valid_from, valid_until, is_active, is_used,
            max_usage, created_by, created_at
          ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 1, 0, 1, ?, CURRENT_TIMESTAMP)
        `, [
          req.user.organization_id || 1,
          user_id,
          JSON.stringify(qrData),
          location_name,
          validUntil.toISOString(),
          req.user.digital_id
        ], function(err) {
          if (err) {
            console.error(" Single-use QR code storage error:", err);
            return res.status(500).json({ success: false, message: "Failed to generate QR code" });
          }

          console.log(` Single-use QR code generated for user: ${user_id} (${user.name}) at ${location_name} by ${req.user.digital_id}`);

          res.json({
            success: true,
            qr_code: qrCode,
            qr_data: JSON.stringify(qrData), // This is the manual code too
            qr_id: qrId,
            user_name: user.name,
            location_name,
            valid_until: validUntil,
            message: "Single-use QR code generated successfully"
          });
        });
      }
    );

  } catch (error) {
    console.error(" QR generation error:", error);
    res.status(500).json({ success: false, message: "Failed to generate QR code" });
  }
});

// Single-use QR code attendance punch (scan OR manual entry) with state validation
router.post('/punch-qr', authenticateToken, (req, res) => {
  try {
    const { qr_data, punch_type, location_data, method = 'scan' } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    if (!qr_data || !punch_type) {
      return res.status(400).json({ success: false, message: "QR data and punch type are required" });
    }

    // Validate punch type
    const validPunchTypes = ['in', 'out', 'break_start', 'break_end'];
    if (!validPunchTypes.includes(punch_type)) {
      return res.status(400).json({ success: false, message: "Invalid punch type" });
    }

    // Get user's current attendance state and validate the punch
    getUserAttendanceState(req.db, req.user.digital_id, async (err, stateInfo) => {
      if (err) {
        console.error(" QR State check error:", err);
        return res.status(500).json({ success: false, message: "Failed to validate attendance state" });
      }

      // Validate the punch transition
      const validation = validatePunchTransition(stateInfo.state, punch_type);

      if (!validation.valid) {
        console.log(`Invalid QR punch attempt: ${req.user.digital_id} tried ${punch_type} from ${stateInfo.state} state`);
        return res.status(400).json({
          success: false,
          message: validation.error,
          current_state: validation.current_state,
          requested_punch: validation.requested_punch,
          allowed_punches: validation.allowed_punches,
          last_punch: stateInfo.last_punch
        });
      }

      // If validation passes, proceed with QR validation and punch
      // Parse QR code data
      let qrInfo;
      try {
        qrInfo = JSON.parse(qr_data);
      } catch (parseErr) {
        return res.status(400).json({ success: false, message: "Invalid QR code format" });
      }

      // Validate QR code in database. Match either the stored JSON payload
      // (user/location QRs) or, for admin-generated STAFF QRs whose QR image
      // encodes compact JSON, fall back to the assigned user's latest active code.
      const lookupQR = () => new Promise((resolve) => {
        req.db.get(
          `SELECT * FROM qr_codes WHERE code = ? AND is_active = 1`,
          [qr_data],
          (err, row) => {
            if (row) return resolve(row);
            if (qrInfo && qrInfo.t === 's' && qrInfo.s) {
              return req.db.get(
                `SELECT * FROM qr_codes
                 WHERE assigned_user = ? AND organization_id = ? AND is_active = 1
                 ORDER BY created_at DESC LIMIT 1`,
                [qrInfo.s, req.user.organization_id],
                (err2, row2) => resolve(row2 || null)
              );
            }
            resolve(null);
          }
        );
      });

      const qrCode = await lookupQR();
      if (!qrCode) {
        console.log('QR Code lookup failed:', {
          error: undefined,
          qr_data: qr_data,
          qr_data_length: qr_data ? qr_data.length : 0,
          user_id: req.user.digital_id,
          org_id: req.user.organization_id
        });
        return res.status(400).json({ success: false, message: "Invalid, expired, or already used QR code" });
      }

      // Check expiration
      if (new Date() > new Date(qrCode.valid_until)) {
        return res.status(400).json({ success: false, message: "QR code has expired" });
      }

      // Verify organization match
      if ((qrInfo.org_id ?? qrInfo.organization_id ?? qrInfo.o) !== req.user.organization_id) {
        return res.status(403).json({ success: false, message: "QR code not valid for your organization" });
      }

      // Enforce user binding: single-use QRs issued to a specific user may only
      // be used by that user (previously any org member could use them).
      if (qrCode.assigned_user && qrCode.assigned_user !== req.user.digital_id) {
        console.log(` QR user-binding rejected: code assigned to ${qrCode.assigned_user}, presented by ${req.user.digital_id}`);
        return res.status(403).json({ success: false, message: "This QR code was issued to another user" });
      }

      // Enforce usage limit (max_usage = null means unlimited; previously all
      // QRs were killed after a single use regardless of max_usage).
      if (qrCode.max_usage && (qrCode.usage_count || 0) >= qrCode.max_usage) {
        return res.status(400).json({ success: false, message: "QR code usage limit has been reached" });
      }

      console.log('QR Code validation passed:', {
        qr_assigned_user: qrCode.assigned_user,
        current_user: req.user.digital_id,
        organization_match: (qrInfo.org_id ?? qrInfo.organization_id ?? qrInfo.o) === req.user.organization_id
      });

      // Server-side geofence check when GPS coordinates are provided. For QR
      // punches without coordinates, possession of the valid org QR code is
      // accepted as the presence proof.
      const geo = await validateGeofence(req.db, req.user.organization_id, location_data && (location_data.latitude != null || location_data.longitude != null) ? location_data : null);
      if (!geo.ok) {
        console.log(` Geofence rejected QR punch for ${req.user.digital_id}: ${geo.message}`);
        return res.status(geo.status).json({ success: false, message: geo.message });
      }

        // Begin transaction for atomic operation
        req.db.serialize(() => {
          req.db.run("BEGIN TRANSACTION");

          // Log attendance
          req.db.run(`
            INSERT INTO attendance (
              digital_id, organization_id, attendance_method,
              location_data, punch_type, notes, ip_address, user_agent
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            req.user.digital_id,
            qrInfo.org_id ?? qrInfo.organization_id ?? qrInfo.o,
            method === 'manual' ? 'qr_manual' : 'qr_scan',
            JSON.stringify({...location_data, qr_location: qrCode.location_name}),
            punch_type,
            `${method === 'manual' ? 'Manual entry' : 'QR scanned'} at ${qrCode.location_name}`,
            clientIp,
            userAgent
          ], function(attendanceErr) {
            if (attendanceErr) {
              req.db.run("ROLLBACK");
              console.error(" QR attendance logging error:", attendanceErr);
              return res.status(500).json({ success: false, message: "Failed to log attendance" });
            }

            // Record QR usage: increment count, mark exhausted only when the
            // usage limit is reached (shared location QRs honor max_usage).
            const newUsage = (qrCode.usage_count || 0) + 1;
            const exhausted = qrCode.max_usage && newUsage >= qrCode.max_usage;
            req.db.run(`
              UPDATE qr_codes
              SET is_used = ?, used_by = ?, used_method = ?, used_at = CURRENT_TIMESTAMP,
                  usage_count = usage_count + 1
              WHERE id = ?
            `, [exhausted ? 1 : 0, req.user.digital_id, method, qrCode.id], function(updateErr) {
              if (updateErr) {
                req.db.run("ROLLBACK");
                console.error(" QR code invalidation error:", updateErr);
                return res.status(500).json({ success: false, message: "Failed to invalidate QR code" });
              }

              req.db.run("COMMIT", (commitErr) => {
                if (commitErr) {
                  console.error(" Transaction commit error:", commitErr);
                  return res.status(500).json({ success: false, message: "Failed to complete attendance" });
                }

                console.log(` Single-use QR ${method} by ${req.user.digital_id} at ${qrCode.location_name} - QR invalidated`);

                res.json({
                  success: true,
                  message: `${punch_type.toUpperCase().replace('_', ' ')} logged successfully via ${method} at ${qrCode.location_name}`,
                  location: qrCode.location_name,
                  method: method,
                  qr_invalidated: true,
                  timestamp: new Date().toISOString()
                });
              });
            });
          });
        });
    });

  } catch (error) {
    console.error(" QR punch error:", error);
    res.status(400).json({ success: false, message: "QR code processing failed" });
  }
});

// Enhanced attendance History with filtering and pagination
router.get('/history', authenticateToken, (req, res) => {
  const { limit = 50, offset = 0, start_date, end_date, punch_type } = req.query;

  let query = `
    SELECT punch_type, timestamp, attendance_method, notes, location_data, ip_address
    FROM attendance 
    WHERE digital_id = ? 
  `;
  let params = [req.user.digital_id];

  // Add filters
  if (start_date) {
    query += ` AND DATE(timestamp) >= ? `;
    params.push(start_date);
  }
  
  if (end_date) {
    query += ` AND DATE(timestamp) <= ? `;
    params.push(end_date);
  }
  
  if (punch_type && ['in', 'out', 'break_start', 'break_end'].includes(punch_type)) {
    query += ` AND punch_type = ? `;
    params.push(punch_type);
  }

  query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ? `;
  params.push(parseInt(limit), parseInt(offset));

  req.db.all(query, params, (err, rows) => {
    if (err) {
      console.error(" History fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch attendance history" });
    }

    // Parse location data and sanitize IP addresses for privacy
    const history = rows.map(row => ({
      ...row,
      location_data: row.location_data ? JSON.parse(row.location_data) : null,
      ip_address: undefined // Remove IP from response for privacy
    }));

    // Get total count for pagination
    req.db.get(
      "SELECT COUNT(*) as total FROM attendance WHERE digital_id = ?", 
      [req.user.digital_id], 
      (err, countResult) => {
        const total = countResult ? countResult.total : 0;
        
        console.log(` Fetched ${history.length} attendance records for: ${req.user.digital_id}`);
        res.json({ 
          success: true, 
          history,
          pagination: {
            total,
            limit: parseInt(limit),
            offset: parseInt(offset),
            has_more: (parseInt(offset) + history.length) < total
          }
        });
      }
    );
  });
});

// Get user's own pending requests
router.get('/my-requests', authenticateToken, (req, res) => {
  const { status, limit = 20, offset = 0 } = req.query;
  const userId = req.user.digital_id;

  let query = `
    SELECT pr.*, u.name as admin_name
    FROM pending_requests pr
    LEFT JOIN users u ON pr.admin_id = u.digital_id
    WHERE pr.digital_id = ?
  `;
  let params = [userId];

  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    query += ` AND pr.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  req.db.all(query, params, (err, requests) => {
    if (err) {
      console.error(" User requests fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch your requests" });
    }

    // Parse location data and remove sensitive info
    const processedRequests = requests.map(req => ({
      ...req,
      location_data: req.location_data ? JSON.parse(req.location_data) : null,
      admin_id: undefined // Remove admin ID from user view
    }));

    console.log(` User ${userId} fetched ${requests.length} requests`);
    res.json({ 
      success: true, 
      requests: processedRequests,
      total_pending: requests.filter(r => r.status === 'pending').length
    });
  });
});

module.exports = router;
