/**
 * Universal Attendance System - Admin Routes
 * Handles administrative functions like user management, attendance logs, and system settings
 */

const express = require('express');
const router = express.Router();

// Import middleware
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Enhanced admin routes - Get all users
router.get('/users', authenticateToken, requireAdmin, (req, res) => {
  const { limit = 100, offset = 0, industry, role, active_only } = req.query;
  const organizationId = req.user.organization_id;

  let query = `
    SELECT u.digital_id, u.name, u.phone, u.role, u.email, u.industry_type, 
           u.is_verified, u.is_approved, u.is_active, u.created_at, u.last_login,
           o.name as organization_name,
           COUNT(a.id) as attendance_count
    FROM users u
    LEFT JOIN organizations o ON u.organization_id = o.id
    LEFT JOIN attendance a ON u.digital_id = a.digital_id AND a.timestamp >= date('now', '-30 days')
    WHERE u.organization_id = ?
  `;
  let params = [organizationId];

  // Add filters
  if (industry) {
    query += ` AND u.industry_type = ? `;
    params.push(industry);
  }
  
  if (role) {
    query += ` AND u.role LIKE ? `;
    params.push(`%${role}%`);
  }
  
  if (active_only === 'true') {
    query += ` AND u.is_active = 1 AND u.is_verified = 1 `;
  }

  query += ` GROUP BY u.digital_id ORDER BY u.created_at DESC LIMIT ? OFFSET ? `;
  params.push(parseInt(limit), parseInt(offset));

  req.db.all(query, params, (err, users) => {
    if (err) {
      console.error("  Admin users fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch users" });
    }

    console.log(`  Admin fetched ${users.length} users`);
    res.json({ success: true, users });
  });
});

// Enhanced admin attendance logs
router.get('/attendance', authenticateToken, requireAdmin, (req, res) => {
  const { limit = 100, offset = 0, date, digital_id, method } = req.query;
  const organizationId = req.user.organization_id;

  let query = `
    SELECT a.*, u.name, u.role, u.industry_type
    FROM attendance a
    LEFT JOIN users u ON a.digital_id = u.digital_id
    WHERE a.organization_id = ?
  `;
  let params = [organizationId];

  // Add filters
  if (date) {
    query += ` AND DATE(a.timestamp) = ? `;
    params.push(date);
  }
  
  if (digital_id) {
    query += ` AND a.digital_id = ? `;
    params.push(digital_id);
  }
  
  if (method) {
    query += ` AND a.attendance_method = ? `;
    params.push(method);
  }

  query += ` ORDER BY a.timestamp DESC LIMIT ? OFFSET ? `;
  params.push(parseInt(limit), parseInt(offset));

  req.db.all(query, params, (err, logs) => {
    if (err) {
      console.error("  Admin attendance fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch attendance logs" });
    }

    const processedLogs = logs.map(log => ({
      ...log,
      location_data: log.location_data ? JSON.parse(log.location_data) : null,
      ip_address: log.ip_address ? log.ip_address.replace(/\.\d+$/, '.***') : null // Partial IP masking
    }));

    console.log(`  Admin fetched ${logs.length} attendance logs`);
    res.json({ success: true, logs: processedLogs });
  });
});

// Enhanced user status update
router.post('/user-status', authenticateToken, requireAdmin, (req, res) => {
  const { digital_id, is_active, is_approved } = req.body;
  const organizationId = req.user.organization_id;

  if (!digital_id) {
    return res.status(400).json({ success: false, message: "Digital ID is required" });
  }

  const updates = [];
  const params = [];

  if (typeof is_active !== 'undefined') {
    updates.push('is_active = ?');
    params.push(is_active ? 1 : 0);
  }

  if (typeof is_approved !== 'undefined') {
    updates.push('is_approved = ?');
    params.push(is_approved ? 1 : 0);
  }

  if (updates.length === 0) {
    return res.status(400).json({ success: false, message: "No updates provided" });
  }

  params.push(digital_id, organizationId);

  req.db.run(
    `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP 
     WHERE digital_id = ? AND organization_id = ?`,
    params,
    function(err) {
      if (err) {
        console.error("  User status update error:", err);
        return res.status(500).json({ success: false, message: "Failed to update user status" });
      }

      if (this.changes === 0) {
        return res.status(404).json({ success: false, message: "User not found or access denied" });
      }

      console.log(`  User status updated: ${digital_id} by admin: ${req.user.digital_id}`);
      res.json({ success: true, message: "User status updated successfully" });
    }
  );
});

// Get admin dashboard statistics
router.get('/dashboard-stats', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { period = '30' } = req.query; // days

  // Get multiple statistics in parallel
  const queries = {
    totalUsers: `SELECT COUNT(*) as count FROM users WHERE organization_id = ? AND is_active = 1`,
    totalAttendance: `SELECT COUNT(*) as count FROM attendance WHERE organization_id = ? AND timestamp >= date('now', '-${period} days')`,
    pendingRequests: `SELECT COUNT(*) as count FROM pending_requests WHERE organization_id = ? AND status = 'pending'`,
    activeQRCodes: `SELECT COUNT(*) as count FROM qr_codes WHERE organization_id = ? AND is_active = 1 AND valid_until > datetime('now')`,
    todayAttendance: `SELECT COUNT(DISTINCT digital_id) as count FROM attendance WHERE organization_id = ? AND DATE(timestamp) = DATE('now')`,
    recentLogins: `SELECT COUNT(*) as count FROM users WHERE organization_id = ? AND last_login >= datetime('now', '-24 hours')`
  };

  const stats = {};
  let completedQueries = 0;
  const totalQueries = Object.keys(queries).length;

  Object.entries(queries).forEach(([key, query]) => {
    req.db.get(query, [organizationId], (err, result) => {
      if (err) {
        console.error(`  Error fetching ${key}:`, err);
        stats[key] = 0;
      } else {
        stats[key] = result.count || 0;
      }
    
      completedQueries++;
      if (completedQueries === totalQueries) {
        // Get attendance trends for the period
        req.db.all(`
          SELECT DATE(timestamp) as date, COUNT(*) as count, COUNT(DISTINCT digital_id) as unique_users
          FROM attendance 
          WHERE organization_id = ? AND timestamp >= date('now', '-${period} days')
          GROUP BY DATE(timestamp)
          ORDER BY date DESC
        `, [organizationId], (err, trends) => {
          if (err) {
            console.error("  Error fetching attendance trends:", err);
            trends = [];
          }
        
          console.log(`  Admin dashboard stats fetched for organization ${organizationId}`);
          res.json({
            success: true,
            stats: {
              ...stats,
              period: `${period} days`,
              trends: trends || []
            }
          });
        });
      }
    });
  });
});

// Get user details for admin
router.get('/user/:digitalId', authenticateToken, requireAdmin, (req, res) => {
  const { digitalId } = req.params;
  const organizationId = req.user.organization_id;

  req.db.get(`
    SELECT u.*, o.name as organization_name, o.type as organization_type,
           COUNT(a.id) as total_attendance,
           MAX(a.timestamp) as last_attendance
    FROM users u
    LEFT JOIN organizations o ON u.organization_id = o.id
    LEFT JOIN attendance a ON u.digital_id = a.digital_id
    WHERE u.digital_id = ? AND u.organization_id = ?
    GROUP BY u.digital_id
  `, [digitalId, organizationId], (err, user) => {
    if (err) {
      console.error("  Admin user details fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch user details" });
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Parse profile data safely
    try {
      user.profile_data = user.profile_data ? JSON.parse(user.profile_data) : {};
    } catch (parseErr) {
      console.error("  Profile data parse error:", parseErr);
      user.profile_data = {};
    }

    // Remove sensitive information
    delete user.password;

    // Get recent attendance for this user
    req.db.all(`
      SELECT punch_type, timestamp, attendance_method, notes, location_data
      FROM attendance
      WHERE digital_id = ?
      ORDER BY timestamp DESC
      LIMIT 10
    `, [digitalId], (err, recentAttendance) => {
      if (err) {
        console.error("  Recent attendance fetch error:", err);
        recentAttendance = [];
      }

      // Parse location data
      const processedAttendance = recentAttendance.map(record => ({
        ...record,
        location_data: record.location_data ? JSON.parse(record.location_data) : null
      }));

      console.log(`  Admin fetched details for user: ${digitalId}`);
      res.json({
        success: true,
        user: {
          ...user,
          recent_attendance: processedAttendance
        }
      });
    });
  });
});

// Delete user (admin only)
router.delete('/user/:digitalId', authenticateToken, requireAdmin, (req, res) => {
  const { digitalId } = req.params;
  const organizationId = req.user.organization_id;
  const adminId = req.user.digital_id;

  // Prevent admin from deleting themselves
  if (digitalId === adminId) {
    return res.status(400).json({
      success: false,
      message: "You cannot delete your own account"
    });
  }

  console.log(`🗑️ Admin ${adminId} attempting to delete user ${digitalId} from organization ${organizationId}`);

  // First check if user exists and belongs to the admin's organization
  req.db.get(`
    SELECT digital_id, name, role FROM users
    WHERE digital_id = ? AND organization_id = ?
  `, [digitalId, organizationId], (err, user) => {
    if (err) {
      console.error("  User lookup error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found in your organization" });
    }

    // Prevent deletion of other administrators
    if (user.role === 'Administrator') {
      return res.status(403).json({
        success: false,
        message: "Cannot delete administrator accounts"
      });
    }

    let deletedAttendance = 0;
    let deletedRequests = 0;

    // Step 1: Delete all attendance records for this user
    req.db.run(`DELETE FROM attendance WHERE digital_id = ?`, [digitalId], function(attendanceErr) {
      if (attendanceErr) {
        console.error("  Attendance deletion error:", attendanceErr);
        return res.status(500).json({ success: false, message: "Failed to delete user attendance records" });
      }

      deletedAttendance = this.changes;
      console.log(`  Deleted ${deletedAttendance} attendance records for user ${digitalId}`);

      // Step 2: Delete all pending requests for this user
      req.db.run(`DELETE FROM pending_requests WHERE digital_id = ?`, [digitalId], function(requestsErr) {
        if (requestsErr) {
          console.error("  Pending requests deletion error:", requestsErr);
          return res.status(500).json({ success: false, message: "Failed to delete user pending requests" });
        }

        deletedRequests = this.changes;
        console.log(`  Deleted ${deletedRequests} pending requests for user ${digitalId}`);

        // Step 3: Finally, delete the user
        req.db.run(`DELETE FROM users WHERE digital_id = ? AND organization_id = ?`, [digitalId, organizationId], function(userErr) {
          if (userErr) {
            console.error("  User deletion error:", userErr);
            return res.status(500).json({ success: false, message: "Failed to delete user" });
          }

          if (this.changes === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
          }

          console.log(`  Admin ${adminId} successfully deleted user ${digitalId} (${user.name}) from organization ${organizationId}`);
          console.log(`📊 Deletion Summary: ${deletedAttendance} attendance records, ${deletedRequests} pending requests`);

          res.json({
            success: true,
            message: `User ${user.name} has been permanently deleted`,
            deletion_summary: {
              user_name: user.name,
              user_id: digitalId,
              attendance_records_deleted: deletedAttendance,
              pending_requests_deleted: deletedRequests
            }
          });
        });
      });
    });
  });
});

// Bulk user operations
router.post('/bulk-user-action', authenticateToken, requireAdmin, (req, res) => {
  const { action, user_ids, reason } = req.body;
  const organizationId = req.user.organization_id;
  const adminId = req.user.digital_id;

  if (!action || !user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ success: false, message: "Action and user IDs are required" });
  }

  const validActions = ['activate', 'deactivate', 'approve', 'reject'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ success: false, message: "Invalid action" });
  }

  // Build the update query based on action
  let updateField, updateValue;
  switch (action) {
    case 'activate':
      updateField = 'is_active';
      updateValue = 1;
      break;
    case 'deactivate':
      updateField = 'is_active';
      updateValue = 0;
      break;
    case 'approve':
      updateField = 'is_approved';
      updateValue = 1;
      break;
    case 'reject':
      updateField = 'is_approved';
      updateValue = 0;
      break;
  }

  const placeholders = user_ids.map(() => '?').join(',');
  const params = [updateValue, ...user_ids, organizationId];

  req.db.run(`
    UPDATE users 
    SET ${updateField} = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE digital_id IN (${placeholders}) AND organization_id = ?
  `, params, function(err) {
    if (err) {
      console.error("  Bulk user action error:", err);
      return res.status(500).json({ success: false, message: "Failed to perform bulk action" });
    }

    console.log(`  Bulk ${action} performed on ${this.changes} users by admin: ${adminId}`);
    res.json({ 
      success: true, 
      message: `${action} performed on ${this.changes} users`,
      affected_count: this.changes,
      action: action,
      reason: reason || `Bulk ${action} by administrator`
    });
  });
});

// Get system health and statistics
router.get('/system-health', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  const healthChecks = {
    database: false,
    users: 0,
    attendance_today: 0,
    pending_requests: 0,
    active_qr_codes: 0,
    system_errors: 0
  };

  // Database health check
  req.db.get("SELECT 1 as test", [], (err, result) => {
    healthChecks.database = !err && result && result.test === 1;

    // Get various counts
    const queries = [
      { key: 'users', query: 'SELECT COUNT(*) as count FROM users WHERE organization_id = ? AND is_active = 1' },
      { key: 'attendance_today', query: 'SELECT COUNT(*) as count FROM attendance WHERE organization_id = ? AND DATE(timestamp) = DATE("now")' },
      { key: 'pending_requests', query: 'SELECT COUNT(*) as count FROM pending_requests WHERE organization_id = ? AND status = "pending"' },
      { key: 'active_qr_codes', query: 'SELECT COUNT(*) as count FROM qr_codes WHERE organization_id = ? AND is_active = 1 AND valid_until > datetime("now")' }
    ];

    let completedQueries = 0;
    queries.forEach(({ key, query }) => {
      req.db.get(query, [organizationId], (err, result) => {
        if (!err && result) {
          healthChecks[key] = result.count || 0;
        }

        completedQueries++;
        if (completedQueries === queries.length) {
          // Calculate overall health score
          const healthScore = (
            (healthChecks.database ? 25 : 0) +
            (healthChecks.users > 0 ? 25 : 0) +
            (healthChecks.attendance_today >= 0 ? 25 : 0) +
            (healthChecks.pending_requests < 100 ? 25 : 0) // Penalty for too many pending requests
          );

          console.log(`  System health check completed for organization ${organizationId}`);
          res.json({
            success: true,
            health: {
              ...healthChecks,
              health_score: healthScore,
              status: healthScore >= 75 ? 'healthy' : healthScore >= 50 ? 'warning' : 'critical',
              timestamp: new Date().toISOString()
            }
          });
        }
      });
    });
  });
});

// Enhanced attendance monitoring for admins - Real-time view
router.get('/attendance-monitor', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { hours = 24, limit = 100 } = req.query;

  // Get recent attendance records with user details
  req.db.all(`
    SELECT a.*, u.name, u.role, u.industry_type, u.email,
           strftime('%s', a.timestamp) as timestamp_unix
    FROM attendance a
    LEFT JOIN users u ON a.digital_id = u.digital_id
    WHERE a.organization_id = ? AND a.timestamp >= datetime('now', '-${hours} hours')
    ORDER BY a.timestamp DESC
    LIMIT ?
  `, [organizationId, parseInt(limit)], (err, records) => {
    if (err) {
      console.error("  Attendance monitor fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch attendance records" });
    }

    // Process records
    const processedRecords = records.map(record => ({
      ...record,
      location_data: record.location_data ? JSON.parse(record.location_data) : null,
      timestamp_formatted: new Date(record.timestamp).toLocaleString(),
      time_ago: getTimeAgo(new Date(record.timestamp))
    }));

    console.log(`  Admin attendance monitor: ${records.length} records in last ${hours} hours`);
    res.json({
      success: true,
      records: processedRecords,
      summary: {
        total_records: records.length,
        unique_users: [...new Set(records.map(r => r.digital_id))].length,
        time_range: `${hours} hours`,
        latest_timestamp: records.length > 0 ? records[0].timestamp : null
      }
    });
  });
});

// Monthly attendance report for users
router.get('/attendance-report', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { month, year, digital_id, industry } = req.query;

  // Default to current month if not specified
  const targetMonth = month || new Date().getMonth() + 1;
  const targetYear = year || new Date().getFullYear();

  let query = `
    SELECT a.*, u.name, u.role, u.industry_type, u.email,
           DATE(a.timestamp) as date_only,
           strftime('%w', a.timestamp) as day_of_week
    FROM attendance a
    LEFT JOIN users u ON a.digital_id = u.digital_id
    WHERE a.organization_id = ?
    AND strftime('%m', a.timestamp) = ?
    AND strftime('%Y', a.timestamp) = ?
  `;
  let params = [organizationId, String(targetMonth).padStart(2, '0'), String(targetYear)];

  if (digital_id) {
    query += ` AND a.digital_id = ?`;
    params.push(digital_id);
  }

  if (industry) {
    query += ` AND u.industry_type = ?`;
    params.push(industry);
  }

  query += ` ORDER BY a.digital_id, a.timestamp`;

  req.db.all(query, params, (err, records) => {
    if (err) {
      console.error("  Attendance report fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch attendance report" });
    }

    // Process records into user-wise summary
    const userSummary = {};
    const dailyStats = {};

    records.forEach(record => {
      const userId = record.digital_id;
      const date = record.date_only;

      // Initialize user summary
      if (!userSummary[userId]) {
        userSummary[userId] = {
          user_id: userId,
          name: record.name,
          role: record.role,
          industry: record.industry_type,
          email: record.email,
          total_records: 0,
          punch_in_count: 0,
          punch_out_count: 0,
          break_start_count: 0,
          break_end_count: 0,
          attendance_days: new Set(),
          working_hours: 0,
          last_punch: null
        };
      }

      // Count punch types
      userSummary[userId].total_records++;
      switch (record.punch_type) {
        case 'in':
          userSummary[userId].punch_in_count++;
          break;
        case 'out':
          userSummary[userId].punch_out_count++;
          break;
        case 'break_start':
          userSummary[userId].break_start_count++;
          break;
        case 'break_end':
          userSummary[userId].break_end_count++;
          break;
      }

      // Track attendance days
      userSummary[userId].attendance_days.add(date);
      userSummary[userId].last_punch = record.timestamp;

      // Daily stats
      if (!dailyStats[date]) {
        dailyStats[date] = {
          date: date,
          total_punches: 0,
          unique_users: new Set(),
          punch_types: { in: 0, out: 0, break_start: 0, break_end: 0 }
        };
      }
      dailyStats[date].total_punches++;
      dailyStats[date].unique_users.add(userId);
      dailyStats[date].punch_types[record.punch_type] = (dailyStats[date].punch_types[record.punch_type] || 0) + 1;
    });

    // Convert Sets to counts and calculate working hours
    Object.values(userSummary).forEach(user => {
      user.attendance_days = user.attendance_days.size;
      // Simple working hours calculation (can be enhanced)
      user.working_hours = Math.round(user.attendance_days * 8); // Assuming 8 hours per day
    });

    // Convert daily stats
    const dailyStatsArray = Object.values(dailyStats).map(day => ({
      ...day,
      unique_users: day.unique_users.size
    }));

    console.log(`  Admin attendance report: ${Object.keys(userSummary).length} users, ${records.length} records for ${targetMonth}/${targetYear}`);
    res.json({
      success: true,
      report: {
        month: targetMonth,
        year: targetYear,
        total_users: Object.keys(userSummary).length,
        total_records: records.length,
        user_summary: Object.values(userSummary),
        daily_stats: dailyStatsArray,
        filters: { digital_id, industry }
      }
    });
  });
});

// Multi-month attendance comparison
router.get('/attendance-comparison', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { months = 3, digital_id } = req.query;

  const monthlyData = [];
  let completedQueries = 0;

  for (let i = 0; i < parseInt(months); i++) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();

    let query = `
      SELECT COUNT(*) as total_records,
             COUNT(DISTINCT digital_id) as unique_users,
             strftime('%m', timestamp) as month,
             strftime('%Y', timestamp) as year
      FROM attendance
      WHERE organization_id = ?
      AND strftime('%m', timestamp) = ?
      AND strftime('%Y', timestamp) = ?
    `;
    let params = [organizationId, String(month).padStart(2, '0'), String(year)];

    if (digital_id) {
      query += ` AND digital_id = ?`;
      params.push(digital_id);
    }

    req.db.get(query, params, (err, result) => {
      if (err) {
        console.error("  Monthly comparison error:", err);
        result = { total_records: 0, unique_users: 0, month: String(month), year: String(year) };
      }

      monthlyData.push({
        month: String(month),
        year: String(year),
        month_name: date.toLocaleString('default', { month: 'long' }),
        total_records: result.total_records || 0,
        unique_users: result.unique_users || 0,
        average_per_user: result.unique_users > 0 ? Math.round((result.total_records || 0) / result.unique_users) : 0
      });

      completedQueries++;
      if (completedQueries === parseInt(months)) {
        // Sort by date (most recent first)
        monthlyData.sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return b.month - a.month;
        });

        console.log(`  Admin attendance comparison: ${months} months for ${digital_id || 'all users'}`);
        res.json({
          success: true,
          comparison: monthlyData,
          summary: {
            total_months: months,
            total_records: monthlyData.reduce((sum, m) => sum + m.total_records, 0),
            average_users: Math.round(monthlyData.reduce((sum, m) => sum + m.unique_users, 0) / months),
            user_filter: digital_id || null
          }
        });
      }
    });
  }
});

// User attendance details with trends
router.get('/user-attendance/:digitalId', authenticateToken, requireAdmin, (req, res) => {
  const { digitalId } = req.params;
  const organizationId = req.user.organization_id;
  const { days = 30 } = req.query;

  // Get user details
  req.db.get(`
    SELECT u.*, o.name as organization_name
    FROM users u
    LEFT JOIN organizations o ON u.organization_id = o.id
    WHERE u.digital_id = ? AND u.organization_id = ?
  `, [digitalId, organizationId], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Get attendance records
    req.db.all(`
      SELECT *, DATE(timestamp) as date_only, strftime('%w', timestamp) as day_of_week
      FROM attendance
      WHERE digital_id = ? AND timestamp >= date('now', '-${days} days')
      ORDER BY timestamp DESC
    `, [digitalId], (err, records) => {
      if (err) {
        console.error("  User attendance fetch error:", err);
        return res.status(500).json({ success: false, message: "Failed to fetch user attendance" });
      }

      // Calculate statistics
      const stats = {
        total_records: records.length,
        punch_in_count: records.filter(r => r.punch_type === 'in').length,
        punch_out_count: records.filter(r => r.punch_type === 'out').length,
        break_count: records.filter(r => r.punch_type.includes('break')).length,
        unique_days: [...new Set(records.map(r => r.date_only))].length,
        average_daily_punches: records.length > 0 ? Math.round(records.length / [...new Set(records.map(r => r.date_only))].length * 10) / 10 : 0
      };

      // Group by date for trends
      const dailyTrends = {};
      records.forEach(record => {
        const date = record.date_only;
        if (!dailyTrends[date]) {
          dailyTrends[date] = {
            date: date,
            punches: [],
            punch_types: { in: 0, out: 0, break_start: 0, break_end: 0 }
          };
        }
        dailyTrends[date].punches.push(record);
        dailyTrends[date].punch_types[record.punch_type] = (dailyTrends[date].punch_types[record.punch_type] || 0) + 1;
      });

      // Process records with location data
      const processedRecords = records.map(record => ({
        ...record,
        location_data: record.location_data ? JSON.parse(record.location_data) : null,
        timestamp_formatted: new Date(record.timestamp).toLocaleString()
      }));

      console.log(`  Admin user attendance details: ${digitalId}, ${records.length} records in ${days} days`);
      res.json({
        success: true,
        user: {
          ...user,
          profile_data: user.profile_data ? JSON.parse(user.profile_data) : {}
        },
        attendance: {
          records: processedRecords,
          stats: stats,
          daily_trends: Object.values(dailyTrends),
          period_days: days
        }
      });
    });
  });
});

// Industry-specific attendance analytics
router.get('/industry-analytics', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { industry, days = 30 } = req.query;

  let query = `
    SELECT u.industry_type, u.role,
           COUNT(a.id) as total_punches,
           COUNT(DISTINCT a.digital_id) as unique_users,
           COUNT(DISTINCT DATE(a.timestamp)) as active_days,
           AVG(CASE WHEN a.punch_type = 'in' THEN 1 ELSE 0 END) as avg_punch_ins
    FROM users u
    LEFT JOIN attendance a ON u.digital_id = a.digital_id
      AND a.timestamp >= date('now', '-${days} days')
    WHERE u.organization_id = ?
    AND u.is_active = 1
  `;

  let params = [organizationId];

  if (industry) {
    query += ` AND u.industry_type = ?`;
    params.push(industry);
  }

  query += ` GROUP BY u.industry_type, u.role ORDER BY u.industry_type, total_punches DESC`;

  req.db.all(query, params, (err, analytics) => {
    if (err) {
      console.error("  Industry analytics fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch industry analytics" });
    }

    // Group by industry
    const industryGroups = {};
    analytics.forEach(row => {
      const industry = row.industry_type;
      if (!industryGroups[industry]) {
        industryGroups[industry] = {
          industry: industry,
          total_users: 0,
          total_punches: 0,
          active_days: 0,
          roles: []
        };
      }

      industryGroups[industry].total_users += row.unique_users || 0;
      industryGroups[industry].total_punches += row.total_punches || 0;
      industryGroups[industry].active_days = Math.max(industryGroups[industry].active_days, row.active_days || 0);
      industryGroups[industry].roles.push({
        role: row.role,
        users: row.unique_users || 0,
        punches: row.total_punches || 0,
        avg_daily_punches: row.unique_users > 0 ? Math.round((row.total_punches || 0) / row.unique_users) : 0
      });
    });

    console.log(`  Admin industry analytics: ${Object.keys(industryGroups).length} industries, ${days} days`);
    res.json({
      success: true,
      analytics: Object.values(industryGroups),
      summary: {
        total_industries: Object.keys(industryGroups).length,
        total_users: Object.values(industryGroups).reduce((sum, ind) => sum + ind.total_users, 0),
        total_punches: Object.values(industryGroups).reduce((sum, ind) => sum + ind.total_punches, 0),
        period_days: days,
        industry_filter: industry || null
      }
    });
  });
});

// Real-time attendance notifications (for WebSocket or polling)
router.get('/live-attendance', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { since } = req.query; // ISO timestamp

  let query = `
    SELECT a.*, u.name, u.role, u.industry_type,
           strftime('%s', a.timestamp) as timestamp_unix
    FROM attendance a
    LEFT JOIN users u ON a.digital_id = u.digital_id
    WHERE a.organization_id = ?
  `;
  let params = [organizationId];

  if (since) {
    query += ` AND a.timestamp > ?`;
    params.push(since);
  } else {
    // Default to last 5 minutes for live updates
    query += ` AND a.timestamp > datetime('now', '-5 minutes')`;
  }

  query += ` ORDER BY a.timestamp DESC LIMIT 50`;

  req.db.all(query, params, (err, records) => {
    if (err) {
      console.error("  Live attendance fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch live attendance" });
    }

    const processedRecords = records.map(record => ({
      ...record,
      location_data: record.location_data ? JSON.parse(record.location_data) : null,
      timestamp_formatted: new Date(record.timestamp).toLocaleString(),
      time_ago: getTimeAgo(new Date(record.timestamp))
    }));

    console.log(`  Admin live attendance: ${records.length} recent records`);
    res.json({
      success: true,
      records: processedRecords,
      meta: {
        count: records.length,
        since: since || new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        organization_id: organizationId
      }
    });
  });
});

// Get organization details for admin
router.get('/organization', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  console.log(` Admin organization fetch - User: ${req.user.digital_id}, Organization ID: ${organizationId}`);

  // First check if organization exists and is not deleted
  req.db.get(`SELECT COUNT(*) as count FROM organizations WHERE id = ? AND deleted = 0`, [organizationId], (err, result) => {
    if (err) {
      console.error("  Admin organization count error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (!result || result.count === 0) {
      console.log(`⚠️ Organization ${organizationId} not found - returning setup required response`);
      // Return a specific response indicating organization setup is required
      return res.json({
        success: false,
        message: "Organization not found",
        setup_required: true,
        error_type: "organization_not_found"
      });
    }

    // Organization exists and is not deleted, now get full details
    req.db.get(`
      SELECT o.*, COUNT(u.digital_id) as user_count
      FROM organizations o
      LEFT JOIN users u ON o.id = u.organization_id AND u.is_active = 1
      WHERE o.id = ? AND o.deleted = 0
      GROUP BY o.id
    `, [organizationId], (err, org) => {
      if (err) {
        console.error("  Admin organization fetch error:", err);
        return res.status(500).json({ success: false, message: "Failed to fetch organization" });
      }

      if (!org) {
        console.log(`  Organization ${organizationId} not found in detailed query or deleted`);
        return res.json({
          success: false,
          message: "Organization not found",
          setup_required: true,
          error_type: "organization_not_found"
        });
      }

      // Parse organization data
      try {
        org.settings = org.settings ? JSON.parse(org.settings) : {};
        org.metadata = org.metadata ? JSON.parse(org.metadata) : {};
      } catch (parseErr) {
        console.error("  Organization data parse error:", parseErr);
        org.settings = {};
        org.metadata = {};
      }

      console.log(`  Admin fetched organization: ${org.name} (ID: ${org.id})`);
      res.json({ success: true, organization: org });
    });
  });
});

// Update organization details for admin
router.post('/organization', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { name, type, address, phone, email, settings } = req.body;

  if (!name || !type) {
    return res.status(400).json({ success: false, message: "Organization name and type are required" });
  }

  // Build update data only for columns that exist in the table
  const updateData = {
    name: name.trim(),
    type: type.trim(),
    address: address ? address.trim() : null,
    contact_email: email ? email.trim() : null, // Use contact_email instead of email
    contact_phone: phone ? phone.trim() : null, // Add phone field
    settings: settings ? JSON.stringify(settings) : null,
    updated_at: new Date().toISOString()
  };

  // Remove null values
  const fields = Object.keys(updateData).filter(key => updateData[key] !== null);
  const values = fields.map(key => updateData[key]);
  const placeholders = fields.map(() => '?').join(', ');
  const setClause = fields.map(field => `${field} = ?`).join(', ');

  values.push(organizationId);

  console.log(`🔄 Updating organization ${organizationId} with fields:`, fields);

  req.db.run(`
    UPDATE organizations SET ${setClause}
    WHERE id = ?
  `, values, function(err) {
    if (err) {
      console.error("  Admin organization update error:", err);
      return res.status(500).json({ success: false, message: "Failed to update organization" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }

    console.log(`  Admin updated organization: ${name}`);
    res.json({
      success: true,
      message: "Organization updated successfully",
      organization: updateData
    });
  });
});

// Reset organization data to default/demo values
router.post('/organization/reset', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  // Get current organization name to generate appropriate default values
  req.db.get(`SELECT name FROM organizations WHERE id = ?`, [organizationId], (err, org) => {
    if (err) {
      console.error("  Error fetching organization for reset:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch organization" });
    }

    if (!org) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }

    // Generate default values based on organization name
    const orgName = org.name || 'Demo Organization';
    const defaultData = {
      name: orgName,
      type: 'education', // Default to education
      address: `${orgName} Campus, Demo City`,
      contact_email: `admin@${orgName.toLowerCase().replace(/\s+/g, '')}.com`,
      contact_phone: '+1-555-0123',
      settings: JSON.stringify({ theme: 'default', features: ['attendance', 'reports'] }),
      updated_at: new Date().toISOString()
    };

    const fields = Object.keys(defaultData);
    const values = fields.map(key => defaultData[key]);
    const setClause = fields.map(field => `${field} = ?`).join(', ');

    values.push(organizationId);

    console.log(`🔄 Resetting organization ${organizationId} to default values`);

    req.db.run(`
      UPDATE organizations SET ${setClause}
      WHERE id = ?
    `, values, function(err) {
      if (err) {
        console.error("  Admin organization reset error:", err);
        return res.status(500).json({ success: false, message: "Failed to reset organization" });
      }

      if (this.changes === 0) {
        return res.status(404).json({ success: false, message: "Organization not found" });
      }

      console.log(`  Admin reset organization: ${orgName}`);
      res.json({
        success: true,
        message: "Organization reset to default values successfully",
        organization: defaultData
      });
    });
  });
});

// Get all organization setups
router.get('/organization-setups', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  // Check if organization_setups table exists, if not return empty array
  req.db.all(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='organization_setups'
  `, [], (err, tables) => {
    if (err) {
      console.error("  Error checking table existence:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (!tables || tables.length === 0) {
      console.log("  Organization setups table doesn't exist, returning empty array");
      return res.json({ success: true, setups: [] });
    }

    req.db.all(`
      SELECT * FROM organization_setups
      WHERE organization_id = ?
      ORDER BY created_at DESC
    `, [organizationId], (err, setups) => {
      if (err) {
        console.error("  Error fetching organization setups:", err);
        return res.status(500).json({ success: false, message: "Failed to fetch organization setups" });
      }

      // Parse settings for each setup
      const processedSetups = setups.map(setup => ({
        ...setup,
        settings: setup.settings ? JSON.parse(setup.settings) : {},
        codes: setup.codes ? JSON.parse(setup.codes) : []
      }));

      console.log(`  Admin fetched ${setups.length} organization setups`);
      res.json({ success: true, setups: processedSetups });
    });
  });
});

// Create new organization setup
router.post('/organization-setups', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { name, type, address, contact_email, contact_phone, settings } = req.body;

  if (!name || !type) {
    return res.status(400).json({ success: false, message: "Organization name and type are required" });
  }

  const setupData = {
    id: `setup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    organization_id: organizationId,
    name: name.trim(),
    type: type.trim(),
    address: address ? address.trim() : null,
    contact_email: contact_email ? contact_email.trim() : null,
    contact_phone: contact_phone ? contact_phone.trim() : null,
    settings: settings ? JSON.stringify(settings) : JSON.stringify({}),
    codes: JSON.stringify([]),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const fields = Object.keys(setupData);
  const values = fields.map(key => setupData[key]);
  const placeholders = fields.map(() => '?').join(', ');

  req.db.run(`
    INSERT INTO organization_setups (${fields.join(', ')})
    VALUES (${placeholders})
  `, values, function(err) {
    if (err) {
      console.error("  Admin organization setup create error:", err);
      return res.status(500).json({ success: false, message: "Failed to create organization setup" });
    }

    console.log(`  Admin created organization setup: ${name}`);
    res.json({
      success: true,
      message: "Organization setup created successfully",
      setup: setupData
    });
  });
});

// Delete specific organization setup
router.delete('/organization-setup/:setupId', authenticateToken, requireAdmin, (req, res) => {
  const { setupId } = req.params;
  const organizationId = req.user.organization_id;

  req.db.run(`
    DELETE FROM organization_setups
    WHERE id = ? AND organization_id = ?
  `, [setupId, organizationId], function(err) {
    if (err) {
      console.error("  Admin organization setup delete error:", err);
      return res.status(500).json({ success: false, message: "Failed to delete organization setup" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: "Organization setup not found" });
    }

    console.log(`  Admin deleted organization setup: ${setupId}`);
    res.json({
      success: true,
      message: "Organization setup deleted successfully"
    });
  });
});

// Update organization setup
router.put('/organization-setup/:setupId', authenticateToken, requireAdmin, (req, res) => {
  const { setupId } = req.params;
  const organizationId = req.user.organization_id;
  const { name, type, address, contact_email, contact_phone, settings, codes } = req.body;

  const updateData = {
    name: name ? name.trim() : undefined,
    type: type ? type.trim() : undefined,
    address: address !== undefined ? (address ? address.trim() : null) : undefined,
    contact_email: contact_email !== undefined ? (contact_email ? contact_email.trim() : null) : undefined,
    contact_phone: contact_phone !== undefined ? (contact_phone ? contact_phone.trim() : null) : undefined,
    settings: settings ? JSON.stringify(settings) : undefined,
    codes: codes ? JSON.stringify(codes) : undefined,
    updated_at: new Date().toISOString()
  };

  // Remove undefined values
  const fields = Object.keys(updateData).filter(key => updateData[key] !== undefined);
  const values = fields.map(key => updateData[key]);
  const setClause = fields.map(field => `${field} = ?`).join(', ');

  values.push(setupId, organizationId);

  req.db.run(`
    UPDATE organization_setups SET ${setClause}
    WHERE id = ? AND organization_id = ?
  `, values, function(err) {
    if (err) {
      console.error("  Admin organization setup update error:", err);
      return res.status(500).json({ success: false, message: "Failed to update organization setup" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: "Organization setup not found" });
    }

    console.log(`  Admin updated organization setup: ${setupId}`);
    res.json({
      success: true,
      message: "Organization setup updated successfully"
    });
  });
});

// Clear all users for current organization (for starting fresh)
router.delete('/organization/clear-users', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  console.log(`🧹 Starting user cleanup for organization ${organizationId}`);

  // First check if organization exists
  req.db.get(`SELECT id, name FROM organizations WHERE id = ?`, [organizationId], (err, org) => {
    if (err) {
      console.error("  Error fetching organization for user cleanup:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch organization" });
    }

    if (!org) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }

    let deletedUsers = 0;
    let deletedAttendance = 0;
    let deletedRequests = 0;

    // Step 1: Delete all users associated with this organization (except the admin)
    req.db.run(`DELETE FROM users WHERE organization_id = ? AND role != 'Administrator'`, [organizationId], function(userErr) {
      if (userErr) {
        console.error("  Error deleting users:", userErr);
        return res.status(500).json({ success: false, message: "Failed to delete organization users" });
      }

      deletedUsers = this.changes;
      console.log(`  Deleted ${deletedUsers} users from organization ${organizationId} (kept admin)`);

      // Step 2: Delete all attendance records for this organization
      req.db.run(`DELETE FROM attendance WHERE organization_id = ?`, [organizationId], function(attendanceErr) {
        if (attendanceErr) {
          console.error("  Error deleting attendance records:", attendanceErr);
          return res.status(500).json({ success: false, message: "Failed to delete attendance records" });
        }

        deletedAttendance = this.changes;
        console.log(`  Deleted ${deletedAttendance} attendance records from organization ${organizationId}`);

        // Step 3: Delete all pending requests for this organization
        req.db.run(`DELETE FROM pending_requests WHERE organization_id = ?`, [organizationId], function(requestsErr) {
          if (requestsErr) {
            console.error("  Error deleting pending requests:", requestsErr);
            return res.status(500).json({ success: false, message: "Failed to delete pending requests" });
          }

          deletedRequests = this.changes;
          console.log(`  Deleted ${deletedRequests} pending requests from organization ${organizationId}`);

          console.log(`📊 User cleanup Summary: ${deletedUsers} users, ${deletedAttendance} attendance records, ${deletedRequests} pending requests`);

          res.json({
            success: true,
            message: `Successfully cleared all users and associated data from organization "${org.name}"`,
            cleanup_summary: {
              organization_name: org.name,
              users_deleted: deletedUsers,
              attendance_records_deleted: deletedAttendance,
              pending_requests_deleted: deletedRequests
            }
          });
        });
      });
    });
  });
});

// Delete organization data (clear all fields and remove associated users)
router.delete('/organization', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  // Check if organization exists first
  req.db.get(`SELECT id, name FROM organizations WHERE id = ?`, [organizationId], (err, org) => {
    if (err) {
      console.error("  Error fetching organization for deletion:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch organization" });
    }

    if (!org) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }

    console.log(`🗑️ Starting complete organization deletion for ${org.name} (ID: ${organizationId})`);

    let deletedUsers = 0;
    let deletedAttendance = 0;
    let deletedRequests = 0;
    let deletedCodes = 0;

    // Step 1: Delete all users associated with this organization
    req.db.run(`DELETE FROM users WHERE organization_id = ?`, [organizationId], function(userErr) {
      if (userErr) {
        console.error("  Error deleting users:", userErr);
        return res.status(500).json({ success: false, message: "Failed to delete organization users" });
      }

      deletedUsers = this.changes;
      console.log(`  Deleted ${deletedUsers} users from organization ${organizationId}`);

      // Step 2: Delete all attendance records for this organization
      req.db.run(`DELETE FROM attendance WHERE organization_id = ?`, [organizationId], function(attendanceErr) {
        if (attendanceErr) {
          console.error("  Error deleting attendance records:", attendanceErr);
          return res.status(500).json({ success: false, message: "Failed to delete attendance records" });
        }

        deletedAttendance = this.changes;
        console.log(`  Deleted ${deletedAttendance} attendance records from organization ${organizationId}`);

        // Step 3: Delete all pending requests for this organization
        req.db.run(`DELETE FROM pending_requests WHERE organization_id = ?`, [organizationId], function(requestsErr) {
          if (requestsErr) {
            console.error("  Error deleting pending requests:", requestsErr);
            return res.status(500).json({ success: false, message: "Failed to delete pending requests" });
          }

          deletedRequests = this.changes;
          console.log(`  Deleted ${deletedRequests} pending requests from organization ${organizationId}`);

          // Step 4: Delete all QR codes for this organization
          req.db.run(`DELETE FROM qr_codes WHERE organization_id = ?`, [organizationId], function(codesErr) {
            if (codesErr) {
              console.error("  Error deleting QR codes:", codesErr);
              return res.status(500).json({ success: false, message: "Failed to delete QR codes" });
            }

            deletedCodes = this.changes;
            console.log(`  Deleted ${deletedCodes} QR codes from organization ${organizationId}`);

            // Step 5: Delete all geofences for this organization
            req.db.run(`DELETE FROM geofences WHERE organization_id = ?`, [organizationId], function(geofenceErr) {
              if (geofenceErr) {
                console.error("  Error deleting geofences:", geofenceErr);
                // Don't fail here as geofences table might not exist
                console.log("⚠️ Geofence deletion failed (table might not exist)");
              }

              // Step 6: Finally, clear organization data (set to NULL or empty values)
              const clearData = {
                name: null,
                type: null,
                address: null,
                contact_email: null,
                contact_phone: null,
                settings: null,
                updated_at: new Date().toISOString()
              };

              const fields = Object.keys(clearData);
              const values = fields.map(key => clearData[key]);
              const setClause = fields.map(field => `${field} = ?`).join(', ');

              values.push(organizationId);

              req.db.run(`
                UPDATE organizations SET ${setClause}
                WHERE id = ?
              `, values, function(orgErr) {
                if (orgErr) {
                  console.error("  Admin organization delete error:", orgErr);
                  return res.status(500).json({ success: false, message: "Failed to delete organization data" });
                }

                if (this.changes === 0) {
                  return res.status(404).json({ success: false, message: "Organization not found" });
                }

                console.log(`  Admin completely deleted organization: ${org.name}`);
                console.log(`📊 Deletion Summary: ${deletedUsers} users, ${deletedAttendance} attendance records, ${deletedRequests} pending requests, ${deletedCodes} QR codes`);

                res.json({
                  success: true,
                  message: `Organization "${org.name}" and all associated data completely deleted`,
                  deletion_summary: {
                    organization_name: org.name,
                    users_deleted: deletedUsers,
                    attendance_records_deleted: deletedAttendance,
                    pending_requests_deleted: deletedRequests,
                    qr_codes_deleted: deletedCodes
                  }
                });
              });
            });
          });
        });
      });
    });
  });
});

// ========== PENDING APPROVALS MANAGEMENT ==========

// Get pending requests for admin approval
router.get('/pending-requests', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { limit = 50, offset = 0, status = 'pending' } = req.query;

  req.db.all(`
    SELECT pr.*,
           u.name as user_name, u.role as user_role,
           u.email as user_email, u.phone as user_phone,
           u.industry_type
    FROM pending_requests pr
    LEFT JOIN users u ON pr.digital_id = u.digital_id
    WHERE pr.organization_id = ? AND pr.status = ?
    ORDER BY pr.created_at DESC
    LIMIT ? OFFSET ?
  `, [organizationId, status, parseInt(limit), parseInt(offset)], (err, requests) => {
    if (err) {
      console.error("  Pending requests fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch pending requests" });
    }

    // Process requests with location data
    const processedRequests = requests.map(request => ({
      ...request,
      location_data: request.location_data ? JSON.parse(request.location_data) : null,
      created_at_formatted: new Date(request.created_at).toLocaleString(),
      requested_timestamp_formatted: new Date(request.requested_timestamp).toLocaleString()
    }));

    console.log(`  Admin fetched ${requests.length} pending requests`);
    res.json({
      success: true,
      requests: processedRequests,
      meta: {
        total: requests.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        status: status
      }
    });
  });
});

// Approve pending request
router.post('/pending-requests/:id/approve', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const organizationId = req.user.organization_id;
  const adminId = req.user.digital_id;
  const { admin_notes } = req.body;

  // First get the pending request
  req.db.get(`
    SELECT * FROM pending_requests
    WHERE id = ? AND organization_id = ? AND status = 'pending'
  `, [id, organizationId], (err, request) => {
    if (err) {
      console.error("  Pending request fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch request" });
    }

    if (!request) {
      return res.status(404).json({ success: false, message: "Pending request not found" });
    }

    // Insert the approved attendance record
    req.db.run(`
      INSERT INTO attendance (
        digital_id, organization_id, attendance_method, location_data,
        punch_type, timestamp, notes, verified_by, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      request.digital_id,
      request.organization_id,
      request.attendance_method,
      request.location_data,
      request.punch_type,
      request.requested_timestamp,
      `Manual entry approved by admin: ${request.notes || ''}`,
      adminId,
      null, // ip_address
      'Admin Manual Approval' // user_agent
    ], function(attendanceErr) {
      if (attendanceErr) {
        console.error("  Attendance insert error:", attendanceErr);
        return res.status(500).json({ success: false, message: "Failed to record attendance" });
      }

      // Update the pending request status
      req.db.run(`
        UPDATE pending_requests
        SET status = 'approved', admin_id = ?, admin_notes = ?, decision_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [adminId, admin_notes || 'Approved', id], function(updateErr) {
        if (updateErr) {
          console.error("  Request update error:", updateErr);
          return res.status(500).json({ success: false, message: "Failed to update request status" });
        }

        console.log(`  Admin ${adminId} approved pending request ${id} for user ${request.digital_id}`);
        res.json({
          success: true,
          message: "Request approved successfully",
          request_id: id,
          attendance_id: this.lastID
        });
      });
    });
  });
});

// Reject pending request
router.post('/pending-requests/:id/reject', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const organizationId = req.user.organization_id;
  const adminId = req.user.digital_id;
  const { admin_notes } = req.body;

  req.db.run(`
    UPDATE pending_requests
    SET status = 'rejected', admin_id = ?, admin_notes = ?, decision_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organization_id = ? AND status = 'pending'
  `, [adminId, admin_notes || 'Rejected', id, organizationId], function(err) {
    if (err) {
      console.error("  Request rejection error:", err);
      return res.status(500).json({ success: false, message: "Failed to reject request" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: "Pending request not found" });
    }

    console.log(`  Admin ${adminId} rejected pending request ${id}`);
    res.json({
      success: true,
      message: "Request rejected successfully",
      request_id: id
    });
  });
});

// ========== QR CODE MANAGEMENT ==========

// Helper function for location QR generation
function generateLocationQR(req, res, organizationId, location_name, class_id, valid_hours, max_uses) {
  if (!location_name) {
    return res.status(400).json({ success: false, message: "Location name is required" });
  }

  // Generate unique QR code data
  const qrData = {
    type: 'attendance',
    organization_id: organizationId,
    location_name: location_name,
    class_id: class_id || null,
    timestamp: new Date().toISOString(),
    generated_by: req.user.digital_id,
    qr_type: 'location'
  };

  // Create QR code string
  const qrString = JSON.stringify(qrData);
  const code = `QR-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

  // Calculate expiration
  const validUntil = new Date();
  validUntil.setHours(validUntil.getHours() + parseInt(valid_hours || 24));

  console.log('🔄 Creating location QR code record in database...');

  // Insert QR code record
  req.db.run(`
    INSERT INTO qr_codes (
      organization_id, code, location_name, valid_until,
      max_usage, created_by
    ) VALUES (?, ?, ?, ?, ?, ?)
  `, [
    organizationId,
    qrString, // Store the QR data string in the code column
    location_name,
    validUntil.toISOString(),
    max_uses || 1, // Default to 1 for location QR codes
    req.user.digital_id
  ], function(err) {
    if (err) {
      console.error("  Location QR code generation error:", err);
      return res.status(500).json({ success: false, message: "Failed to generate location QR code" });
    }

    console.log(`  Admin ${req.user.digital_id} generated location QR code: ${code} for ${location_name}`);

    res.json({
      success: true,
      qr_code: {
        id: this.lastID,
        code: code,
        location_name: location_name,
        class_id: class_id,
        qr_string: qrString,
        qr_data: qrData,
        valid_until: validUntil.toISOString(),
        max_uses: max_uses || 1,
        generated_by: req.user.digital_id
      }
    });
  });
}

// Generate QR code for attendance (supports both location and staff QR codes)
router.post('/generate-qr', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { location_name, class_id, valid_hours = 24, max_uses, staffId, user_id, userId } = req.body;

  console.log(' QR Generation Request:', {
    organizationId,
    location_name,
    class_id,
    valid_hours,
    max_uses,
    staffId,
    user_id,
    userId,
    admin_id: req.user.digital_id
  });

  // Handle staff QR generation - support multiple parameter names
  const staffIdentifier = staffId || user_id || userId;

  if (staffIdentifier) {
    console.log(' Processing staff QR generation for:', staffIdentifier);

    // Verify staff member exists and belongs to the same organization
    req.db.get(`
      SELECT u.digital_id, u.name, u.role, u.industry_type, u.is_active, u.organization_id
      FROM users u
      WHERE u.digital_id = ? AND u.organization_id = ? AND u.is_active = 1
    `, [staffIdentifier, organizationId], (err, staff) => {
      if (err) {
        console.error("  Staff lookup error:", err);
        // Instead of returning 500 error, fall back to location QR generation
        console.log("⚠️ Staff lookup failed, falling back to location QR generation");
        return generateLocationQR(req, res, organizationId, location_name, class_id, valid_hours, max_uses);
      }

      if (!staff) {
        console.error("  Staff member not found:", staffIdentifier);
        console.log("⚠️ Staff member not found, falling back to location QR generation");
        return generateLocationQR(req, res, organizationId, location_name, class_id, valid_hours, max_uses);
      }

      console.log('  Staff verified:', staff.name, staff.role);

      // Generate ultra-compact QR code data for staff (minimal for QR compatibility)
      const qrData = {
        t: 's', // type: staff (single char)
        o: organizationId, // organization_id
        s: staffIdentifier, // staff_id
        n: staff.name, // staff_name
        r: staff.role, // staff_role
        l: location_name || 'Staff', // location_name (shortened)
        ts: Math.floor(Date.now() / 1000) // timestamp (unix seconds)
      };

      // Create QR code string - use compact JSON
      const qrString = JSON.stringify(qrData);
      const code = `STAFF-${staffIdentifier}-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      // Calculate expiration
      const validUntil = new Date();
      validUntil.setHours(validUntil.getHours() + parseInt(valid_hours || 24));

      console.log('🔄 Creating QR code record in database...');

      // Insert QR code record
      req.db.run(`
        INSERT INTO qr_codes (
          organization_id, assigned_user, code, location_name, valid_until,
          max_usage, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        organizationId,
        staffIdentifier,
        code,
        location_name || `Staff: ${staff.name} (${staff.role})`,
        validUntil.toISOString(),
        max_uses || 1, // Default to 1 for staff QR codes
        req.user.digital_id
      ], function(err) {
        if (err) {
          console.error("  Staff QR code generation error:", err);
          return res.status(500).json({ success: false, message: "Failed to generate staff QR code" });
        }

        console.log(`  Admin ${req.user.digital_id} generated staff QR code: ${code} for ${staff.name}`);

        // Return the QR code data
        res.json({
          success: true,
          qr_code: {
            id: this.lastID,
            code: code,
            staff_id: staffIdentifier,
            staff_name: staff.name,
            staff_role: staff.role,
            qr_string: qrString,
            qr_data: qrData,
            valid_until: validUntil.toISOString(),
            max_uses: max_uses || 1,
            generated_by: req.user.digital_id
          }
        });
      });
    });
  } else {
    // Handle location-based QR generation (original functionality)
    console.log(' Processing location QR generation for:', location_name);

    if (!location_name) {
      return res.status(400).json({ success: false, message: "Location name is required" });
    }

    // Generate unique QR code data
    const qrData = {
      type: 'attendance',
      organization_id: organizationId,
      location_name: location_name,
      class_id: class_id || null,
      timestamp: new Date().toISOString(),
      generated_by: req.user.digital_id,
      qr_type: 'location'
    };

    // Create QR code string
    const qrString = JSON.stringify(qrData);
    const code = `QR-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Calculate expiration
    const validUntil = new Date();
    validUntil.setHours(validUntil.getHours() + parseInt(valid_hours || 24));

    console.log('🔄 Creating location QR code record in database...');

    // Insert QR code record
    req.db.run(`
      INSERT INTO qr_codes (
        organization_id, code, location_name, valid_until,
        max_usage, created_by
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      organizationId,
      qrString, // Store the QR data string in the code column
      location_name,
      validUntil.toISOString(),
      max_uses || 1, // Default to 1 for location QR codes
      req.user.digital_id
    ], function(err) {
      if (err) {
        console.error("  QR code generation error:", err);
        return res.status(500).json({ success: false, message: "Failed to generate QR code" });
      }

      console.log(`  Admin ${req.user.digital_id} generated QR code: ${code} for ${location_name}`);

      res.json({
        success: true,
        qr_code: {
          id: this.lastID,
          code: code,
          location_name: location_name,
          class_id: class_id,
          qr_string: qrString,
          qr_data: qrData,
          valid_until: validUntil.toISOString(),
          max_uses: max_uses || 1,
          generated_by: req.user.digital_id
        }
      });
    });
  }
});

// Get all QR codes for organization
router.get('/qr-codes', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { active_only = false } = req.query;

  let query = `
    SELECT qc.*, u.name as generated_by_name
    FROM qr_codes qc
    LEFT JOIN users u ON qc.created_by = u.digital_id
    WHERE qc.organization_id = ?
  `;

  let params = [organizationId];

  if (active_only === 'true') {
    query += ` AND qc.is_active = 1 AND qc.valid_until > datetime('now')`;
  }

  query += ` ORDER BY qc.created_at DESC`;

  req.db.all(query, params, (err, codes) => {
    if (err) {
      console.error("  QR codes fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch QR codes" });
    }

    // Process codes with status
    const processedCodes = codes.map(code => ({
      ...code,
      is_expired: new Date(code.valid_until) < new Date(),
      can_use: code.is_active && new Date(code.valid_until) > new Date() &&
               (!code.max_usage || code.usage_count < code.max_usage),
      valid_until_formatted: new Date(code.valid_until).toLocaleString()
    }));

    console.log(`  Admin fetched ${codes.length} QR codes`);
    res.json({
      success: true,
      codes: processedCodes
    });
  });
});

// Delete QR code
router.delete('/qr-codes/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const organizationId = req.user.organization_id;

  req.db.run(`
    DELETE FROM qr_codes
    WHERE id = ? AND organization_id = ?
  `, [id, organizationId], function(err) {
    if (err) {
      console.error("  QR code deletion error:", err);
      return res.status(500).json({ success: false, message: "Failed to delete QR code" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: "QR code not found" });
    }

    console.log(`  Admin ${req.user.digital_id} deleted QR code ${id}`);
    res.json({
      success: true,
      message: "QR code deleted successfully"
    });
  });
});

// ========== GEOFENCE MANAGEMENT ==========

// Set geofence boundaries
router.post('/geofence', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { name, latitude, longitude, radius, address } = req.body;

  if (!name || !latitude || !longitude || !radius) {
    return res.status(400).json({ success: false, message: "Name, coordinates, and radius are required" });
  }

  const geofenceData = {
    organization_id: organizationId,
    name: name,
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    radius: parseInt(radius),
    address: address || null,
    is_active: 1,
    created_by: req.user.digital_id,
    created_at: new Date().toISOString()
  };

  // Check if geofence table exists, create if not
  req.db.run(`
    CREATE TABLE IF NOT EXISTS geofences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      radius INTEGER NOT NULL,
      address TEXT,
      is_active INTEGER DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id),
      FOREIGN KEY (created_by) REFERENCES users (digital_id)
    );
  `, [], (err) => {
    if (err) {
      console.error("  Geofence table creation error:", err);
      return res.status(500).json({ success: false, message: "Failed to create geofence table" });
    }

    // Insert geofence
    req.db.run(`
      INSERT INTO geofences (
        organization_id, name, latitude, longitude, radius, address, is_active, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      geofenceData.organization_id,
      geofenceData.name,
      geofenceData.latitude,
      geofenceData.longitude,
      geofenceData.radius,
      geofenceData.address,
      geofenceData.is_active,
      geofenceData.created_by
    ], function(insertErr) {
      if (insertErr) {
        console.error("  Geofence creation error:", insertErr);
        return res.status(500).json({ success: false, message: "Failed to create geofence" });
      }

      console.log(`  Admin ${req.user.digital_id} created geofence: ${name}`);
      res.json({
        success: true,
        message: "Geofence created successfully",
        geofence: {
          id: this.lastID,
          ...geofenceData
        }
      });
    });
  });
});

// Get geofences for organization
router.get('/geofence', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  // Ensure geofence table exists
  req.db.run(`
    CREATE TABLE IF NOT EXISTS geofences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      radius INTEGER NOT NULL,
      address TEXT,
      is_active INTEGER DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organization_id) REFERENCES organizations (id),
      FOREIGN KEY (created_by) REFERENCES users (digital_id)
    );
  `, [], (err) => {
    if (err) {
      console.error("  Geofence table creation error:", err);
      return res.status(500).json({ success: false, message: "Failed to create geofence table" });
    }

    // Now fetch geofences
    req.db.all(`
      SELECT gf.*, u.name as created_by_name
      FROM geofences gf
      LEFT JOIN users u ON gf.created_by = u.digital_id
      WHERE gf.organization_id = ?
      ORDER BY gf.created_at DESC
    `, [organizationId], (err, geofences) => {
      if (err) {
        console.error("  Geofences fetch error:", err);
        return res.status(500).json({ success: false, message: "Failed to fetch geofences" });
      }

      console.log(`  Admin fetched ${geofences.length} geofences`);
      res.json({
        success: true,
        geofences: geofences
      });
    });
  });
});

// Update geofence
router.put('/geofence/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const organizationId = req.user.organization_id;
  const { name, latitude, longitude, radius, address, is_active } = req.body;

  const updates = [];
  const params = [];

  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name);
  }
  if (latitude !== undefined) {
    updates.push('latitude = ?');
    params.push(parseFloat(latitude));
  }
  if (longitude !== undefined) {
    updates.push('longitude = ?');
    params.push(parseFloat(longitude));
  }
  if (radius !== undefined) {
    updates.push('radius = ?');
    params.push(parseInt(radius));
  }
  if (address !== undefined) {
    updates.push('address = ?');
    params.push(address);
  }
  if (is_active !== undefined) {
    updates.push('is_active = ?');
    params.push(is_active ? 1 : 0);
  }

  if (updates.length === 0) {
    return res.status(400).json({ success: false, message: "No updates provided" });
  }

  params.push(id, organizationId);

  req.db.run(`
    UPDATE geofences SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organization_id = ?
  `, params, function(err) {
    if (err) {
      console.error("  Geofence update error:", err);
      return res.status(500).json({ success: false, message: "Failed to update geofence" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: "Geofence not found" });
    }

    console.log(`  Admin ${req.user.digital_id} updated geofence ${id}`);
    res.json({
      success: true,
      message: "Geofence updated successfully"
    });
  });
});

// Delete geofence
router.delete('/geofence/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const organizationId = req.user.organization_id;

  req.db.run(`
    DELETE FROM geofences
    WHERE id = ? AND organization_id = ?
  `, [id, organizationId], function(err) {
    if (err) {
      console.error("  Geofence deletion error:", err);
      return res.status(500).json({ success: false, message: "Failed to delete geofence" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: "Geofence not found" });
    }

    console.log(`  Admin ${req.user.digital_id} deleted geofence ${id}`);
    res.json({
      success: true,
      message: "Geofence deleted successfully"
    });
  });
});

// ========== SUBJECT MANAGEMENT ENDPOINTS ==========

// Get all subjects for admin management
router.get('/subjects', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { active_only = false } = req.query;

  let query = `SELECT * FROM subjects WHERE organization_id = ?`;
  let params = [organizationId];

  if (active_only === 'true') {
    query += ` AND is_active = 1`;
  }

  query += ` ORDER BY subject_code ASC`;

  req.db.all(query, params, (err, subjects) => {
    if (err) {
      console.error("  Admin subjects fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch subjects" });
    }

    console.log(`  Admin fetched ${subjects.length} subjects`);
    res.json({
      success: true,
      subjects: subjects
    });
  });
});

// Create new subject
router.post('/subjects', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { subject_code, subject_name, description, credits } = req.body;

  if (!subject_code || !subject_name) {
    return res.status(400).json({ success: false, message: "Subject code and name are required" });
  }

  // Check if subject code already exists
  req.db.get(`SELECT id FROM subjects WHERE subject_code = ? AND organization_id = ?`, [subject_code, organizationId], (err, existing) => {
    if (err) {
      console.error("  Subject code check error:", err);
      return res.status(500).json({ success: false, message: "Failed to check subject code" });
    }

    if (existing) {
      return res.status(400).json({ success: false, message: "Subject code already exists" });
    }

    // Insert new subject
    req.db.run(`
      INSERT INTO subjects (organization_id, subject_code, subject_name, description, credits)
      VALUES (?, ?, ?, ?, ?)
    `, [
      organizationId, subject_code, subject_name, description || null, credits || 1
    ], function(err) {
      if (err) {
        console.error("  Subject creation error:", err);
        return res.status(500).json({ success: false, message: "Failed to create subject" });
      }

      console.log(`  Admin created subject: ${subject_name} (${subject_code})`);
      res.json({
        success: true,
        message: "Subject created successfully",
        subject: {
          id: this.lastID,
          subject_code,
          subject_name,
          description,
          credits: credits || 1
        }
      });
    });
  });
});

// Update subject
router.put('/subjects/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const organizationId = req.user.organization_id;
  const { subject_code, subject_name, description, credits, is_active } = req.body;

  const updates = [];
  const params = [];

  if (subject_code !== undefined) updates.push('subject_code = ?'), params.push(subject_code);
  if (subject_name !== undefined) updates.push('subject_name = ?'), params.push(subject_name);
  if (description !== undefined) updates.push('description = ?'), params.push(description);
  if (credits !== undefined) updates.push('credits = ?'), params.push(credits);
  if (is_active !== undefined) updates.push('is_active = ?'), params.push(is_active ? 1 : 0);

  if (updates.length === 0) {
    return res.status(400).json({ success: false, message: "No updates provided" });
  }

  params.push(id, organizationId);

  req.db.run(`
    UPDATE subjects SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organization_id = ?
  `, params, function(err) {
    if (err) {
      console.error("  Subject update error:", err);
      return res.status(500).json({ success: false, message: "Failed to update subject" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: "Subject not found" });
    }

    console.log(`  Admin updated subject ${id}`);
    res.json({
      success: true,
      message: "Subject updated successfully"
    });
  });
});

// Delete subject
router.delete('/subjects/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const organizationId = req.user.organization_id;

  req.db.run(`
    DELETE FROM subjects WHERE id = ? AND organization_id = ?
  `, [id, organizationId], function(err) {
    if (err) {
      console.error("  Subject deletion error:", err);
      return res.status(500).json({ success: false, message: "Failed to delete subject" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: "Subject not found" });
    }

    console.log(`  Admin deleted subject ${id}`);
    res.json({
      success: true,
      message: "Subject deleted successfully"
    });
  });
});

// ========== CLASS MANAGEMENT ENDPOINTS (UPDATED FOR NEW SCHEMA) ==========

// Get classes for admin management (with subjects)
router.get('/classes', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { active_only = false, include_subjects = false } = req.query;

  let query = `
    SELECT c.*,
           COUNT(DISTINCT cs.id) as subject_count,
           COUNT(DISTINCT s.id) as enrolled_students
    FROM classes c
    LEFT JOIN class_subjects cs ON c.id = cs.class_id AND cs.is_active = 1
    LEFT JOIN students s ON c.id = s.class_id AND s.is_active = 1
    WHERE c.organization_id = ?
  `;

  let params = [organizationId];

  if (active_only === 'true') {
    query += ` AND c.is_active = 1`;
  }

  query += ` GROUP BY c.id ORDER BY c.created_at DESC`;

  req.db.all(query, params, (err, classes) => {
    if (err) {
      console.error("  Admin classes fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch classes" });
    }

    if (include_subjects === 'true') {
      // Get subjects for each class
      const classPromises = classes.map(cls => {
        return new Promise((resolve) => {
          req.db.all(`
            SELECT cs.*, s.subject_code, s.subject_name, s.description, s.credits,
                   u.name as teacher_name, u.email as teacher_email
            FROM class_subjects cs
            JOIN subjects s ON cs.subject_id = s.id
            LEFT JOIN users u ON cs.teacher_id = u.digital_id
            WHERE cs.class_id = ? AND cs.is_active = 1
            ORDER BY cs.schedule_time
          `, [cls.id], (err, subjects) => {
            if (err) {
              console.error("  Error fetching subjects for class:", cls.id, err);
              resolve({ ...cls, subjects: [] });
            } else {
              resolve({ ...cls, subjects: subjects || [] });
            }
          });
        });
      });

      Promise.all(classPromises).then(classesWithSubjects => {
        console.log(`  Admin fetched ${classesWithSubjects.length} classes with subjects`);
        res.json({
          success: true,
          classes: classesWithSubjects
        });
      });
    } else {
      console.log(`  Admin fetched ${classes.length} classes`);
      res.json({
        success: true,
        classes: classes
      });
    }
  });
});

// Get detailed class information including subjects
router.get('/classes/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const organizationId = req.user.organization_id;

  console.log(` Admin fetching class details for ID: ${id}, Organization: ${organizationId}`);

  // Get class details with subjects in a single query
  req.db.get(`
    SELECT c.*,
           COUNT(DISTINCT s.id) as enrolled_students
    FROM classes c
    LEFT JOIN students s ON c.id = s.class_id AND s.is_active = 1
    WHERE c.id = ? AND c.organization_id = ?
    GROUP BY c.id
  `, [id, organizationId], (err, classData) => {
    if (err) {
      console.error("  Admin class details fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch class details" });
    }

    if (!classData) {
      console.log(`  Class not found - ID: ${id}, Organization: ${organizationId}`);
      return res.status(404).json({ success: false, message: "Class not found" });
    }

    console.log(`  Found class: ${classData.class_name} (${classData.class_code})`);

    // Get subjects for this class with full subject details
    req.db.all(`
      SELECT cs.id, cs.teacher_id, cs.schedule_time, cs.room_number, cs.max_students,
             cs.created_at, cs.updated_at,
             s.id as subject_id, s.subject_code, s.subject_name, s.description, s.credits,
             u.name as teacher_name, u.email as teacher_email, u.role as teacher_role
      FROM class_subjects cs
      JOIN subjects s ON cs.subject_id = s.id
      LEFT JOIN users u ON cs.teacher_id = u.digital_id
      WHERE cs.class_id = ? AND cs.is_active = 1
      ORDER BY cs.schedule_time
    `, [id], (err, subjects) => {
      if (err) {
        console.error("  Admin class subjects fetch error:", err);
        return res.status(500).json({ success: false, message: "Failed to fetch class subjects" });
      }

      console.log(`  Admin fetched class ${id} with ${subjects.length} subjects`);
      console.log('📋 Subject details:', subjects);

      // Ensure subjects is always an array and handle missing subject names
      const subjectsArray = subjects || [];

      // If subject_name is null, try to get it from the class_subjects or provide a fallback
      const processedSubjects = subjectsArray.map(subject => ({
        ...subject,
        subject_name: subject.subject_name || subject.subject_name || 'Unnamed Subject',
        subject_code: subject.subject_code || subject.subject_code || 'N/A'
      }));

      res.json({
        success: true,
        class: {
          ...classData,
          subjects: processedSubjects
        }
      });
    });
  });
});

// Create new class with multiple subjects
router.post('/classes', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { class_code, class_name, semester, academic_year, max_students, subjects } = req.body;

  if (!class_code || !class_name || !semester || !academic_year) {
    return res.status(400).json({ success: false, message: "Class code, name, semester, and academic year are required" });
  }

  if (!subjects || !Array.isArray(subjects) || subjects.length === 0) {
    return res.status(400).json({ success: false, message: "At least one subject is required" });
  }

  // Check if class code already exists
  req.db.get(`SELECT id FROM classes WHERE class_code = ? AND organization_id = ?`, [class_code, organizationId], (err, existing) => {
    if (err) {
      console.error("  Class code check error:", err);
      return res.status(500).json({ success: false, message: "Failed to check class code" });
    }

    if (existing) {
      return res.status(400).json({ success: false, message: "Class code already exists" });
    }

    // Process subjects - create subjects if they don't exist, then create class-subject relationships
    const processSubjects = subjects.map(subject => {
      return new Promise((resolve, reject) => {
        if (!subject.subject_name || !subject.teacher_id) {
          reject(new Error(`Subject "${subject.subject_name || 'undefined'}" missing required fields`));
          return;
        }

        // Check if teacher exists and belongs to organization
        req.db.get(`SELECT digital_id FROM users WHERE digital_id = ? AND organization_id = ? AND is_active = 1`, [subject.teacher_id, organizationId], (err, teacherData) => {
          if (err) {
            reject(err);
            return;
          }
          if (!teacherData) {
            reject(new Error(`Teacher ${subject.teacher_id} not found`));
            return;
          }

          // Check if subject already exists, if not create it
          req.db.get(`SELECT id FROM subjects WHERE subject_name = ? AND organization_id = ?`, [subject.subject_name, organizationId], (err, existingSubject) => {
            if (err) {
              reject(err);
              return;
            }

            if (existingSubject) {
              // Subject exists, use its ID
              resolve({
                subject_id: existingSubject.id,
                subject_name: subject.subject_name,
                teacher_id: subject.teacher_id,
                schedule_time: subject.schedule_time,
                room_number: subject.room_number,
                max_students: subject.max_students
              });
            } else {
              // Create new subject
              req.db.run(`INSERT INTO subjects (organization_id, subject_code, subject_name) VALUES (?, ?, ?)`, [
                organizationId,
                subject.subject_name.replace(/\s+/g, '').toUpperCase().substring(0, 10), // Generate subject code
                subject.subject_name
              ], function(err) {
                if (err) {
                  reject(err);
                  return;
                }

                resolve({
                  subject_id: this.lastID,
                  subject_name: subject.subject_name,
                  teacher_id: subject.teacher_id,
                  schedule_time: subject.schedule_time,
                  room_number: subject.room_number,
                  max_students: subject.max_students
                });
              });
            }
          });
        });
      });
    });

    Promise.all(processSubjects).then(processedSubjects => {
      // Insert new class
      req.db.run(`
        INSERT INTO classes (
          organization_id, class_code, class_name, semester, academic_year, max_students
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        organizationId, class_code, class_name, semester, academic_year, max_students || 50
      ], function(err) {
        if (err) {
          console.error("  Class creation error:", err);
          return res.status(500).json({ success: false, message: "Failed to create class" });
        }

        const classId = this.lastID;
        console.log(`  Admin created class: ${class_name} (${class_code}) with ID ${classId}`);

        // Insert class subjects with subject_id references
        const subjectInserts = processedSubjects.map(subject => {
          return new Promise((resolve, reject) => {
            req.db.run(`
              INSERT INTO class_subjects (
                class_id, subject_id, teacher_id, schedule_time, room_number, max_students
              ) VALUES (?, ?, ?, ?, ?, ?)
            `, [
              classId,
              subject.subject_id,
              subject.teacher_id,
              subject.schedule_time || null,
              subject.room_number || null,
              subject.max_students || 50
            ], function(err) {
              if (err) reject(err);
              else resolve(this.lastID);
            });
          });
        });

        Promise.all(subjectInserts).then(subjectIds => {
          console.log(`  Admin created ${subjectIds.length} class-subject associations`);
          res.json({
            success: true,
            message: "Class created successfully",
            class: {
              id: classId,
              class_code,
              class_name,
              semester,
              academic_year,
              max_students: max_students || 50,
              subjects: processedSubjects.map((subject, index) => ({
                id: subjectIds[index],
                subject_id: subject.subject_id,
                subject_name: subject.subject_name,
                teacher_id: subject.teacher_id,
                schedule_time: subject.schedule_time,
                room_number: subject.room_number,
                max_students: subject.max_students || 50
              }))
            }
          });
        }).catch(err => {
          console.error("  Class subjects creation error:", err);
          // Rollback class creation if subjects fail
          req.db.run(`DELETE FROM classes WHERE id = ?`, [classId]);
          res.status(500).json({ success: false, message: "Failed to create class subjects" });
        });
      });
    }).catch(err => {
      console.error("  Subject processing error:", err);
      res.status(400).json({ success: false, message: err.message });
    });
  });
});

// Update class
router.put('/classes/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const organizationId = req.user.organization_id;
  const { class_code, class_name, subject, teacher_id, schedule_time, room_number, semester, academic_year, max_students, is_active } = req.body;

  const updates = [];
  const params = [];

  if (class_code !== undefined) updates.push('class_code = ?'), params.push(class_code);
  if (class_name !== undefined) updates.push('class_name = ?'), params.push(class_name);
  if (subject !== undefined) updates.push('subject = ?'), params.push(subject);
  if (teacher_id !== undefined) updates.push('teacher_id = ?'), params.push(teacher_id);
  if (schedule_time !== undefined) updates.push('schedule_time = ?'), params.push(schedule_time);
  if (room_number !== undefined) updates.push('room_number = ?'), params.push(room_number);
  if (semester !== undefined) updates.push('semester = ?'), params.push(semester);
  if (academic_year !== undefined) updates.push('academic_year = ?'), params.push(academic_year);
  if (max_students !== undefined) updates.push('max_students = ?'), params.push(max_students);
  if (is_active !== undefined) updates.push('is_active = ?'), params.push(is_active ? 1 : 0);

  if (updates.length === 0) {
    return res.status(400).json({ success: false, message: "No updates provided" });
  }

  params.push(id, organizationId);

  req.db.run(`
    UPDATE classes SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organization_id = ?
  `, params, function(err) {
    if (err) {
      console.error("  Class update error:", err);
      return res.status(500).json({ success: false, message: "Failed to update class" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: "Class not found" });
    }

    console.log(`  Admin updated class ${id}`);
    res.json({
      success: true,
      message: "Class updated successfully"
    });
  });
});

// Delete class
router.delete('/classes/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const organizationId = req.user.organization_id;

  req.db.run(`
    DELETE FROM classes WHERE id = ? AND organization_id = ?
  `, [id, organizationId], function(err) {
    if (err) {
      console.error("  Class deletion error:", err);
      return res.status(500).json({ success: false, message: "Failed to delete class" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: "Class not found" });
    }

    console.log(`  Admin deleted class ${id}`);
    res.json({
      success: true,
      message: "Class deleted successfully"
    });
  });
});

// Get students enrolled in a specific subject (admin access to teacher data)
router.get('/subjects/:subjectId/students', authenticateToken, requireAdmin, (req, res) => {
  const { subjectId } = req.params;
  const organizationId = req.user.organization_id;

  console.log(` Admin fetching students for subject ${subjectId} in organization ${organizationId}`);

  // First verify the subject belongs to the admin's organization
  req.db.get(`
    SELECT cs.*, c.class_name, c.class_code, s.subject_name, s.subject_code
    FROM class_subjects cs
    JOIN classes c ON cs.class_id = c.id
    JOIN subjects s ON cs.subject_id = s.id
    WHERE cs.id = ? AND c.organization_id = ?
  `, [subjectId, organizationId], (err, subjectInfo) => {
    if (err) {
      console.error("  Admin subject verification error:", err);
      return res.status(500).json({ success: false, message: "Failed to verify subject" });
    }

    if (!subjectInfo) {
      console.log(`  Subject ${subjectId} not found in organization ${organizationId}`);
      return res.status(404).json({ success: false, message: "Subject not found" });
    }

    console.log(`  Subject verified: ${subjectInfo.subject_name} in class ${subjectInfo.class_name}`);

    // Get enrolled students for this subject
    req.db.all(`
      SELECT s.id, s.roll_number, s.student_id, u.name, u.email, u.phone,
             s.is_active, s.created_at,
             CASE
               WHEN strftime('%Y-%m-%d', 'now') = strftime('%Y-%m-%d', (
                 SELECT MAX(a.timestamp) FROM attendance a
                 WHERE a.digital_id = u.digital_id AND a.punch_type = 'in'
               )) THEN 'present'
               WHEN strftime('%Y-%m-%d', 'now') = strftime('%Y-%m-%d', (
                 SELECT MAX(a.timestamp) FROM attendance a
                 WHERE a.digital_id = u.digital_id AND a.punch_type = 'out'
               )) THEN 'present'
               ELSE 'absent'
             END as today_attendance,
             (
               SELECT COUNT(*) FROM attendance a
               WHERE a.digital_id = u.digital_id AND a.punch_type IN ('in', 'out')
             ) as total_sessions,
             ROUND(
               (SELECT COUNT(DISTINCT DATE(a.timestamp)) FROM attendance a
                WHERE a.digital_id = u.digital_id AND a.punch_type IN ('in', 'out')) * 100.0 /
               NULLIF((SELECT COUNT(DISTINCT DATE(a.timestamp)) FROM attendance a
                      WHERE a.digital_id = u.digital_id), 0), 2
             ) as overall_percentage
      FROM students s
      JOIN users u ON s.student_id = u.digital_id
      WHERE s.class_subject_id = ? AND s.is_active = 1
      ORDER BY s.roll_number, u.name
    `, [subjectId], (err, students) => {
      if (err) {
        console.error("  Admin students fetch error:", err);
        return res.status(500).json({ success: false, message: "Failed to fetch students" });
      }

      // Process students data
      const processedStudents = students.map(student => ({
        id: student.id,
        student_id: student.student_id,
        roll_number: student.roll_number,
        name: student.name,
        email: student.email,
        phone: student.phone,
        is_present: student.today_attendance === 'present' ? 1 : 0,
        today_attendance: student.today_attendance,
        overall_percentage: student.overall_percentage || 0,
        total_sessions: student.total_sessions || 0,
        is_active: student.is_active
      }));

      console.log(`  Admin fetched ${processedStudents.length} students for subject ${subjectId}`);
      res.json({
        success: true,
        students: processedStudents,
        subject_info: {
          subject_name: subjectInfo.subject_name,
          subject_code: subjectInfo.subject_code,
          class_name: subjectInfo.class_name,
          class_code: subjectInfo.class_code
        }
      });
    });
  });
});

// Get admin dashboard data (alias for dashboard-stats)
router.get('/dashboard', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { period = '30' } = req.query; // days

  // Get multiple statistics in parallel
  const queries = {
    totalUsers: `SELECT COUNT(*) as count FROM users WHERE organization_id = ? AND is_active = 1`,
    activeUsers: `SELECT COUNT(DISTINCT digital_id) as count FROM attendance WHERE organization_id = ? AND DATE(timestamp) = DATE('now')`,
    totalClasses: `SELECT COUNT(*) as count FROM classes WHERE organization_id = ? AND is_active = 1`,
    pendingRequests: `SELECT COUNT(*) as count FROM pending_requests WHERE organization_id = ? AND status = 'pending'`,
    totalAttendance: `SELECT COUNT(*) as count FROM attendance WHERE organization_id = ? AND timestamp >= date('now', '-${period} days')`
  };

  const stats = {};
  let completedQueries = 0;
  const totalQueries = Object.keys(queries).length;

  Object.entries(queries).forEach(([key, query]) => {
    req.db.get(query, [organizationId], (err, result) => {
      if (err) {
        console.error(`  Error fetching ${key}:`, err);
        stats[key] = 0;
      } else {
        stats[key] = result.count || 0;
      }

      completedQueries++;
      if (completedQueries === totalQueries) {
        // Get recent activity
        req.db.all(`
          SELECT a.*, u.name, u.role
          FROM attendance a
          LEFT JOIN users u ON a.digital_id = u.digital_id
          WHERE a.organization_id = ?
          ORDER BY a.timestamp DESC
          LIMIT 10
        `, [organizationId], (err, recentActivity) => {
          if (err) {
            console.error("  Error fetching recent activity:", err);
            recentActivity = [];
          }

          const processedActivity = recentActivity.map(activity => ({
            ...activity,
            location_data: activity.location_data ? JSON.parse(activity.location_data) : null,
            timestamp_formatted: new Date(activity.timestamp).toLocaleString()
          }));

          console.log(`  Admin dashboard data fetched for organization ${organizationId}`);
          res.json({
            success: true,
            data: {
              ...stats,
              recentActivity: processedActivity
            }
          });
        });
      }
    });
  });
});

// ========== ORGANIZATION CODE MANAGEMENT ENDPOINTS ==========

// Get all organization codes for admin management
router.get('/organization-codes', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { active_only = false } = req.query;

  let query = `SELECT * FROM organization_codes WHERE organization_id = ?`;
  let params = [organizationId];

  if (active_only === 'true') {
    query += ` AND is_active = 1`;
  }

  query += ` ORDER BY created_at DESC`;

  req.db.all(query, params, (err, codes) => {
    if (err) {
      console.error("  Admin organization codes fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch organization codes" });
    }

    console.log(`  Admin fetched ${codes.length} organization codes`);
    res.json({
      success: true,
      codes: codes
    });
  });
});

// Create new organization code
router.post('/organization-codes', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { code, description, max_uses, expires_at } = req.body;

  if (!code) {
    return res.status(400).json({ success: false, message: "Organization code is required" });
  }

  // Check if code already exists
  req.db.get(`SELECT id FROM organization_codes WHERE code = ?`, [code], (err, existing) => {
    if (err) {
      console.error("  Code uniqueness check error:", err);
      return res.status(500).json({ success: false, message: "Failed to check code uniqueness" });
    }

    if (existing) {
      return res.status(400).json({ success: false, message: "Organization code already exists" });
    }

    // Insert new code
    req.db.run(`
      INSERT INTO organization_codes (
        organization_id, code, description, created_by, max_uses, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      organizationId,
      code,
      description || null,
      req.user.digital_id,
      max_uses || null,
      expires_at || null
    ], function(err) {
      if (err) {
        console.error("  Organization code creation error:", err);
        return res.status(500).json({ success: false, message: "Failed to create organization code" });
      }

      console.log(`  Admin created organization code: ${code}`);
      res.json({
        success: true,
        message: "Organization code created successfully",
        code: {
          id: this.lastID,
          code: code,
          description: description,
          max_uses: max_uses,
          expires_at: expires_at,
          created_by: req.user.digital_id
        }
      });
    });
  });
});

// Update organization code
router.put('/organization-codes/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const organizationId = req.user.organization_id;
  const { description, max_uses, expires_at, is_active } = req.body;

  const updates = [];
  const params = [];

  if (description !== undefined) updates.push('description = ?'), params.push(description);
  if (max_uses !== undefined) updates.push('max_uses = ?'), params.push(max_uses);
  if (expires_at !== undefined) updates.push('expires_at = ?'), params.push(expires_at);
  if (is_active !== undefined) updates.push('is_active = ?'), params.push(is_active ? 1 : 0);

  if (updates.length === 0) {
    return res.status(400).json({ success: false, message: "No updates provided" });
  }

  params.push(id, organizationId);

  req.db.run(`
    UPDATE organization_codes SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organization_id = ?
  `, params, function(err) {
    if (err) {
      console.error(" Organization code update error:", err);
      return res.status(500).json({ success: false, message: "Failed to update organization code" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: "Organization code not found" });
    }

    console.log(` Admin updated organization code ${id}`);
    res.json({
      success: true,
      message: "Organization code updated successfully"
    });
  });
});

// Delete organization code
router.delete('/organization-codes/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const organizationId = req.user.organization_id;

  req.db.run(`
    DELETE FROM organization_codes WHERE id = ? AND organization_id = ?
  `, [id, organizationId], function(err) {
    if (err) {
      console.error(" Organization code deletion error:", err);
      return res.status(500).json({ success: false, message: "Failed to delete organization code" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: "Organization code not found" });
    }

    console.log(` Admin deleted organization code ${id}`);
    res.json({
      success: true,
      message: "Organization code deleted successfully"
    });
  });
});

// ========== INDUSTRY-SPECIFIC ENDPOINTS ========== */

// Manufacturing Production Monitoring
router.get('/production', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  // Mock production line data - in real implementation, this would come from a production_lines table
  const mockProductionLines = [
    {
      id: 1,
      name: 'Assembly Line A',
      status: 'Running',
      efficiency: 95,
      output: 245,
      workers: 12,
      target_output: 250
    },
    {
      id: 2,
      name: 'Quality Control',
      status: 'Running',
      efficiency: 98,
      output: 180,
      workers: 8,
      target_output: 185
    },
    {
      id: 3,
      name: 'Packaging Line',
      status: 'Maintenance',
      efficiency: 0,
      output: 0,
      workers: 6,
      target_output: 200
    },
    {
      id: 4,
      name: 'Raw Materials',
      status: 'Idle',
      efficiency: 0,
      output: 0,
      workers: 4,
      target_output: 150
    }
  ];

  console.log(` Manufacturing production data fetched for organization ${organizationId}`);
  res.json({
    success: true,
    lines: mockProductionLines
  });
});

// Manufacturing Equipment Management
router.get('/equipment', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  // Mock equipment data
  const mockEquipment = [
    {
      id: 1,
      name: 'Assembly Line A',
      status: 'Operational',
      location: 'Main Floor',
      lastMaintenance: '2024-09-15',
      nextMaintenance: '2024-12-15'
    },
    {
      id: 2,
      name: 'Quality Control Station',
      status: 'Operational',
      location: 'QC Room',
      lastMaintenance: '2024-08-20',
      nextMaintenance: '2024-11-20'
    },
    {
      id: 3,
      name: 'Packaging Machine',
      status: 'Needs Attention',
      location: 'Packaging Area',
      lastMaintenance: '2024-07-10',
      nextMaintenance: '2024-10-10'
    }
  ];

  console.log(` Manufacturing equipment data fetched for organization ${organizationId}`);
  res.json({
    success: true,
    equipment: mockEquipment
  });
});

// Manufacturing Safety Compliance
router.get('/safety', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  const safetyData = {
    overall: 95,
    current: 97,
    target: 95,
    areas: [
      { name: 'PPE Compliance', status: 'Compliant', lastInspection: '2024-09-15', nextDue: '2025-03-15' },
      { name: 'Emergency Exits', status: 'Compliant', lastInspection: '2024-08-20', nextDue: '2025-02-20' },
      { name: 'Fire Safety', status: 'Review Needed', lastInspection: '2024-07-10', nextDue: '2025-01-10' },
      { name: 'Machine Guarding', status: 'Compliant', lastInspection: '2024-10-01', nextDue: '2025-04-01' }
    ]
  };

  console.log(` Manufacturing safety data fetched for organization ${organizationId}`);
  res.json({
    success: true,
    safetyData
  });
});

// Retail Store Performance
router.get('/store-performance', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  const mockMetrics = [
    {
      id: 1,
      name: 'Daily Sales Target',
      current: '$2,450',
      target: '$3,000',
      percentage: 82,
      status: 'warning'
    },
    {
      id: 2,
      name: 'Customer Satisfaction',
      current: '4.6/5',
      target: '4.8/5',
      percentage: 96,
      status: 'success'
    },
    {
      id: 3,
      name: 'Staff Productivity',
      current: '87%',
      target: '90%',
      percentage: 97,
      status: 'success'
    },
    {
      id: 4,
      name: 'Inventory Turnover',
      current: '12 days',
      target: '10 days',
      percentage: 83,
      status: 'warning'
    }
  ];

  console.log(` Retail store performance data fetched for organization ${organizationId}`);
  res.json({
    success: true,
    metrics: mockMetrics
  });
});

// Retail Sales Analytics
router.get('/sales-analytics', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  const analyticsData = {
    todaySales: '$2,450',
    yesterdaySales: '$2,890',
    weekSales: '$18,450',
    monthSales: '$72,300',
    growth: -15.3,
    avgTransaction: '$45.67',
    topProducts: [
      { name: 'Product A', units: 45, revenue: '$1,350', percentage: 18 },
      { name: 'Product B', units: 32, revenue: '$960', percentage: 15 },
      { name: 'Product C', units: 28, revenue: '$840', percentage: 13 }
    ]
  };

  console.log(` Retail sales analytics data fetched for organization ${organizationId}`);
  res.json({
    success: true,
    analyticsData
  });
});

// Retail Inventory Management
router.get('/inventory', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  const mockItems = [
    {
      id: 1,
      name: 'Product A',
      current: 45,
      minimum: 50,
      status: 'low',
      supplier: 'Supplier X',
      lastRestocked: '2024-09-20'
    },
    {
      id: 2,
      name: 'Product B',
      current: 120,
      minimum: 100,
      status: 'good',
      supplier: 'Supplier Y',
      lastRestocked: '2024-09-18'
    },
    {
      id: 3,
      name: 'Product C',
      current: 25,
      minimum: 30,
      status: 'low',
      supplier: 'Supplier Z',
      lastRestocked: '2024-09-15'
    }
  ];

  console.log(` Retail inventory data fetched for organization ${organizationId}`);
  res.json({
    success: true,
    items: mockItems
  });
});

// Retail Staff Scheduling
router.get('/staff-scheduling', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  const mockSchedule = [
    {
      id: 1,
      employeeName: 'John Doe',
      position: 'Cashier',
      date: '2024-10-02',
      startTime: '09:00',
      endTime: '17:00',
      hours: 8,
      status: 'Scheduled'
    },
    {
      id: 2,
      employeeName: 'Jane Smith',
      position: 'Sales Associate',
      date: '2024-10-02',
      startTime: '10:00',
      endTime: '18:00',
      hours: 8,
      status: 'Scheduled'
    }
  ];

  console.log(` Retail staff scheduling data fetched for organization ${organizationId}`);
  res.json({
    success: true,
    schedule: mockSchedule
  });
});

// Corporate Project Management
router.get('/projects', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  const mockProjects = [
    {
      id: 1,
      name: 'Q4 Marketing Campaign',
      status: 'In Progress',
      progress: 75,
      deadline: 'Dec 31, 2024',
      team: 'Marketing Team',
      members: 8
    },
    {
      id: 2,
      name: 'Product Launch Strategy',
      status: 'Planning',
      progress: 30,
      deadline: 'Jan 15, 2025',
      team: 'Product Team',
      members: 12
    },
    {
      id: 3,
      name: 'HR System Upgrade',
      status: 'Review',
      progress: 90,
      deadline: 'Nov 15, 2024',
      team: 'HR & IT',
      members: 6
    }
  ];

  console.log(` Corporate projects data fetched for organization ${organizationId}`);
  res.json({
    success: true,
    projects: mockProjects
  });
});

// Corporate Productivity Analytics
router.get('/productivity', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  const productivityData = {
    overall: 85,
    today: 92,
    week: 88,
    insights: [
      { team: 'Engineering', productivity: 92, trend: 'up', topPerformer: 'Alice Johnson' },
      { team: 'Marketing', productivity: 88, trend: 'up', topPerformer: 'Bob Smith' },
      { team: 'Sales', productivity: 76, trend: 'down', topPerformer: 'Carol Davis' }
    ]
  };

  console.log(` Corporate productivity data fetched for organization ${organizationId}`);
  res.json({
    success: true,
    productivityData
  });
});

// Corporate Meeting Rooms
router.get('/meeting-rooms', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  const mockRooms = [
    {
      id: 1,
      name: 'Conference Room A',
      capacity: 12,
      status: 'Available',
      nextBooking: '2:00 PM - 3:30 PM'
    },
    {
      id: 2,
      name: 'Board Room',
      capacity: 20,
      status: 'Occupied',
      currentMeeting: 'Executive Meeting'
    },
    {
      id: 3,
      name: 'Meeting Room 1',
      capacity: 6,
      status: 'Available',
      nextBooking: '4:00 PM - 5:00 PM'
    }
  ];

  console.log(` Corporate meeting rooms data fetched for organization ${organizationId}`);
  res.json({
    success: true,
    rooms: mockRooms
  });
});

// Government Public Service
router.get('/public-service', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  const mockServices = [
    {
      id: 1,
      name: 'Citizen Services',
      todayCount: 145,
      avgWaitTime: '12 min',
      satisfaction: 94
    },
    {
      id: 2,
      name: 'Permit Applications',
      todayCount: 67,
      avgWaitTime: '25 min',
      satisfaction: 87
    },
    {
      id: 3,
      name: 'Information Desk',
      todayCount: 203,
      avgWaitTime: '8 min',
      satisfaction: 96
    }
  ];

  console.log(` Government public service data fetched for organization ${organizationId}`);
  res.json({
    success: true,
    services: mockServices
  });
});

// Government Compliance
router.get('/compliance', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  const complianceData = {
    overall: 96,
    current: 98,
    target: 95,
    areas: [
      { name: 'Data Privacy (GDPR)', status: 'Compliant', lastAudit: '2024-09-15', nextDue: '2025-09-15' },
      { name: 'Accessibility (ADA)', status: 'Compliant', lastAudit: '2024-08-20', nextDue: '2025-08-20' },
      { name: 'Security Protocols', status: 'Compliant', lastAudit: '2024-10-01', nextDue: '2025-10-01' }
    ]
  };

  console.log(` Government compliance data fetched for organization ${organizationId}`);
  res.json({
    success: true,
    complianceData
  });
});

// Government Departments
router.get('/departments', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  const mockDepartments = [
    {
      id: 1,
      name: 'Public Administration',
      employees: 45,
      status: 'Active',
      budget: '$2.3M',
      performance: 92
    },
    {
      id: 2,
      name: 'Citizen Services',
      employees: 32,
      status: 'Active',
      budget: '$1.8M',
      performance: 96
    },
    {
      id: 3,
      name: 'Regulatory Compliance',
      employees: 28,
      status: 'Active',
      budget: '$1.5M',
      performance: 89
    }
  ];

  console.log(` Government departments data fetched for organization ${organizationId}`);
  res.json({
    success: true,
    departments: mockDepartments
  });
});

// Healthcare Shift Scheduling
router.get('/shift-scheduling', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  const mockShifts = [
    {
      id: 1,
      staffName: 'Dr. Sarah Johnson',
      department: 'Emergency',
      date: '2024-10-02',
      startTime: '08:00',
      endTime: '16:00',
      hours: 8,
      status: 'Scheduled'
    },
    {
      id: 2,
      staffName: 'Nurse Mike Chen',
      department: 'ICU',
      date: '2024-10-02',
      startTime: '16:00',
      endTime: '00:00',
      hours: 8,
      status: 'Scheduled'
    }
  ];

  console.log(` Healthcare shift scheduling data fetched for organization ${organizationId}`);
  res.json({
    success: true,
    shifts: mockShifts
  });
});

// Healthcare Compliance (different from government compliance)
router.get('/healthcare-compliance', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  const complianceData = {
    overall: 97,
    current: 98,
    target: 95,
    areas: [
      { name: 'HIPAA Compliance', status: 'Compliant', lastAudit: '2024-09-15', nextDue: '2025-09-15' },
      { name: 'Patient Safety', status: 'Compliant', lastAudit: '2024-08-20', nextDue: '2025-08-20' },
      { name: 'Medical Records', status: 'Compliant', lastAudit: '2024-10-01', nextDue: '2025-10-01' }
    ]
  };

  console.log(` Healthcare compliance data fetched for organization ${organizationId}`);
  res.json({
    success: true,
    complianceData
  });
});

// Healthcare Patient Management
router.get('/patient-management', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  const mockPatients = [
    {
      id: 1,
      name: 'John Doe',
      department: 'Cardiology',
      status: 'Admitted',
      lastVisit: '2024-10-01',
      nextAppointment: '2024-10-15'
    },
    {
      id: 2,
      name: 'Jane Smith',
      department: 'Pediatrics',
      status: 'Outpatient',
      lastVisit: '2024-09-28',
      nextAppointment: '2024-10-12'
    }
  ];

  console.log(` Healthcare patient management data fetched for organization ${organizationId}`);
  res.json({
    success: true,
    patients: mockPatients
  });
});

// Healthcare Staff Management (alias for users endpoint)
router.get('/staff', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { limit = 100, offset = 0, department, role, active_only } = req.query;

  let query = `
    SELECT u.digital_id, u.name, u.phone, u.role, u.email, u.industry_type,
           u.is_verified, u.is_approved, u.is_active, u.created_at, u.last_login,
           'Healthcare' as department
    FROM users u
    WHERE u.organization_id = ? AND u.industry_type = 'healthcare'
  `;
  let params = [organizationId];

  // Add filters
  if (department) {
    // Mock department filtering since we don't have departments in users table
    query += ` AND u.role LIKE ? `;
    params.push(`%${department}%`);
  }

  if (role) {
    query += ` AND u.role LIKE ? `;
    params.push(`%${role}%`);
  }

  if (active_only === 'true') {
    query += ` AND u.is_active = 1 AND u.is_verified = 1 `;
  }

  query += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ? `;
  params.push(parseInt(limit), parseInt(offset));

  req.db.all(query, params, (err, staff) => {
    if (err) {
      console.error(" Healthcare staff fetch error:", err);
      return res.status(500).json({ success: false, message: "Database error while fetching staff" });
    }

    console.log(` Healthcare staff fetched ${staff.length} members`);

    // If no staff found, provide some mock data for testing
    if (staff.length === 0) {
      console.log('⚠️ No staff found, providing mock data for testing');
      const mockStaff = [
        {
          digital_id: 'DOC001',
          name: 'Dr. Sarah Johnson',
          role: 'Physician',
          email: 'sarah.johnson@hospital.com',
          phone: '+1-555-0101',
          industry_type: 'healthcare',
          is_active: 1,
          department: 'Emergency Department'
        },
        {
          digital_id: 'NUR001',
          name: 'Nurse Michael Chen',
          role: 'Registered Nurse',
          email: 'michael.chen@hospital.com',
          phone: '+1-555-0102',
          industry_type: 'healthcare',
          is_active: 1,
          department: 'ICU'
        },
        {
          digital_id: 'DOC002',
          name: 'Dr. Emily Rodriguez',
          role: 'Pediatrician',
          email: 'emily.rodriguez@hospital.com',
          phone: '+1-555-0103',
          industry_type: 'healthcare',
          is_active: 1,
          department: 'Pediatrics'
        }
      ];

      return res.json({
        success: true,
        staff: mockStaff,
        note: 'Mock data provided - no real staff found in database'
      });
    }

    res.json({
      success: true,
      staff: staff
    });
  });
});

// Healthcare Shifts Management
router.get('/shifts', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  // Mock shift data - in real implementation, this would come from a shifts table
  const mockShifts = [
    {
      id: 1,
      staffName: 'Dr. Sarah Johnson',
      staffId: 'DOC001',
      department: 'Emergency Department',
      date: '2024-10-02',
      startTime: '08:00',
      endTime: '16:00',
      hours: 8,
      status: 'scheduled',
      role: 'Physician'
    },
    {
      id: 2,
      staffName: 'Nurse Michael Chen',
      staffId: 'NUR001',
      department: 'ICU',
      date: '2024-10-02',
      startTime: '16:00',
      endTime: '00:00',
      hours: 8,
      status: 'scheduled',
      role: 'Registered Nurse'
    },
    {
      id: 3,
      staffName: 'Dr. Emily Rodriguez',
      staffId: 'DOC002',
      department: 'Pediatrics',
      date: '2024-10-02',
      startTime: '09:00',
      endTime: '17:00',
      hours: 8,
      status: 'active',
      role: 'Pediatrician'
    }
  ];

  console.log(` Healthcare shifts data fetched for organization ${organizationId}`);
  res.json({
    success: true,
    shifts: mockShifts
  });
});

// Healthcare Compliance (alias for healthcare-compliance)
router.get('/compliance', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  const complianceData = {
    overall: 97,
    current: 98,
    target: 95,
    areas: [
      { name: 'HIPAA Compliance', status: 'Compliant', lastAudit: '2024-09-15', nextDue: '2025-09-15' },
      { name: 'Patient Safety', status: 'Compliant', lastAudit: '2024-08-20', nextDue: '2025-08-20' },
      { name: 'Medical Records', status: 'Compliant', lastAudit: '2024-10-01', nextDue: '2025-10-01' }
    ],
    checks: [
      { type: 'Hand Hygiene', result: 'pass', staff: 'Dr. Johnson', time: '2 hours ago' },
      { type: 'Equipment Sterilization', result: 'pass', staff: 'Nurse Chen', time: '4 hours ago' },
      { type: 'Patient ID Check', result: 'pass', staff: 'Dr. Rodriguez', time: '6 hours ago' }
    ]
  };

  console.log(` Healthcare compliance data fetched for organization ${organizationId}`);
  res.json({
    success: true,
    complianceData
  });
});

// Healthcare Patients Management (alias for patient-management)
router.get('/patients', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  const mockPatients = [
    {
      id: 1,
      name: 'John Doe',
      room: '301',
      doctor: 'Dr. Sarah Johnson',
      status: 'stable',
      department: 'Cardiology',
      lastVisit: '2024-10-01',
      nextAppointment: '2024-10-15'
    },
    {
      id: 2,
      name: 'Jane Smith',
      room: '205',
      doctor: 'Dr. Emily Rodriguez',
      status: 'good',
      department: 'Pediatrics',
      lastVisit: '2024-09-28',
      nextAppointment: '2024-10-12'
    },
    {
      id: 3,
      name: 'Robert Brown',
      room: 'ICU-12',
      doctor: 'Dr. Michael Chen',
      status: 'critical',
      department: 'ICU',
      lastVisit: '2024-10-01',
      nextAppointment: '2024-10-03'
    }
  ];

  console.log(` Healthcare patients data fetched for organization ${organizationId}`);
  res.json({
    success: true,
    patients: mockPatients
  });
});

// Healthcare Manual Punches (alias for pending-requests)
router.get('/manual-punches', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { limit = 50, offset = 0, status = 'pending' } = req.query;

  console.log(`[Manual Punches] Fetching for org ${organizationId}, status: ${status}`);

  req.db.all(`
    SELECT pr.*,
           u.name as staffName, u.role,
           u.email, u.phone
    FROM pending_requests pr
    LEFT JOIN users u ON pr.digital_id = u.digital_id
    WHERE pr.organization_id = ? AND pr.status = ?
    ORDER BY pr.created_at DESC
    LIMIT ? OFFSET ?
  `, [organizationId, status, parseInt(limit), parseInt(offset)], (err, punches) => {
    if (err) {
      console.error(" Healthcare manual punches fetch error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch manual punches",
        error: err.message
      });
    }

    console.log(` Healthcare manual punches fetched ${punches.length} requests for org ${organizationId}`);

    // Process punches with formatted data
    const processedPunches = punches.map(punch => ({
      id: punch.id,
      staffName: punch.staffName || 'Unknown Staff',
      type: punch.punch_type,
      requestedTime: new Date(punch.requested_timestamp).toLocaleString(),
      reason: punch.notes || 'No reason provided',
      status: punch.status,
      created_at: punch.created_at
    }));

    res.json({
      success: true,
      punches: processedPunches
    });
  });
});

// Approve manual punch (Healthcare alias for pending-requests approval)
router.post('/manual-punches/:id/approve', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const organizationId = req.user.organization_id;
  const adminId = req.user.digital_id;
  const { admin_notes = '' } = req.body;

  console.log(`[Manual Punch Approval] Starting approval for ID: ${id}, Admin: ${adminId}, Org: ${organizationId}`);

  // First check if the request exists and belongs to the admin's organization
  req.db.get(`
    SELECT pr.*, u.name as user_name
    FROM pending_requests pr
    LEFT JOIN users u ON pr.digital_id = u.digital_id
    LEFT JOIN organizations o ON pr.organization_id = o.id
    WHERE pr.id = ? AND pr.organization_id = ? AND pr.status = 'pending'
  `, [id, organizationId], (err, request) => {
    if (err) {
      console.error("  Manual punch fetch error:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch request",
        error_type: "database_error"
      });
    }

    if (!request) {
      console.log(`  Manual punch request not found - ID: ${id}, Organization: ${organizationId}`);
      return res.status(404).json({
        success: false,
        message: "Pending request not found",
        error_type: "request_not_found"
      });
    }

    // Verify foreign key constraints
    if (!request.user_name) {
      console.log(`  User not found for digital_id: ${request.digital_id}`);
      return res.status(400).json({
        success: false,
        message: "User associated with this request no longer exists",
        error_type: "user_not_found"
      });
    }

    if (!request.user_active) {
      console.log(`  User is inactive: ${request.digital_id}`);
      return res.status(400).json({
        success: false,
        message: "Cannot approve request for inactive user",
        error_type: "user_inactive"
      });
    }

    if (!request.org_name) {
      console.log(`  Organization not found: ${request.organization_id}`);
      return res.status(400).json({
        success: false,
        message: "Organization associated with this request no longer exists",
        error_type: "organization_not_found"
      });
    }

    console.log(`  Approving manual punch for user: ${request.digital_id} (${request.user_name}), Type: ${request.punch_type}`);

    // Use database transaction for atomic operation
    req.db.serialize(() => {
      req.db.run('BEGIN TRANSACTION', (beginErr) => {
        if (beginErr) {
          console.error("  Transaction begin error:", beginErr);
          return res.status(500).json({
            success: false,
            message: "Failed to start transaction",
            error_type: "transaction_error"
          });
        }

        // Insert the approved attendance record
        req.db.run(`
          INSERT INTO attendance (
            digital_id, organization_id, attendance_method, location_data,
            punch_type, timestamp, notes, verified_by, ip_address, user_agent
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          request.digital_id,
          request.organization_id,
          request.attendance_method,
          request.location_data,
          request.punch_type,
          request.requested_timestamp,
          request.notes || 'Approved manual punch',
          adminId,
          null, // ip_address
          'Admin Manual Approval' // user_agent
        ], function(attendanceErr) {
          if (attendanceErr) {
            console.error("  Manual punch attendance insert error:", attendanceErr);
            req.db.run('ROLLBACK', (rollbackErr) => {
              if (rollbackErr) {
                console.error("  Rollback error:", rollbackErr);
              }
            });
            return res.status(500).json({
              success: false,
              message: "Failed to record attendance",
              error_type: "attendance_insert_error"
            });
          }

          const attendanceId = this.lastID;
          console.log(`  Attendance record inserted with ID: ${attendanceId}`);

          // Update the pending request status
          req.db.run(`
            UPDATE pending_requests
            SET status = 'approved', admin_id = ?, admin_notes = ?, decision_at = CURRENT_TIMESTAMP
            WHERE id = ? AND organization_id = ? AND status = 'pending'
          `, [adminId, admin_notes || 'Approved', id, organizationId], function(updateErr) {
            if (updateErr) {
              console.error("  Manual punch status update error:", updateErr);
              req.db.run('ROLLBACK', (rollbackErr) => {
                if (rollbackErr) {
                  console.error("  Rollback error:", rollbackErr);
                }
              });
              return res.status(500).json({
                success: false,
                message: "Failed to update request status",
                error_type: "request_update_error"
              });
            }

            // Check if the update actually affected a row
            if (this.changes === 0) {
              console.error("  No rows updated - possible concurrent modification");
              req.db.run('ROLLBACK', (rollbackErr) => {
                if (rollbackErr) {
                  console.error("  Rollback error:", rollbackErr);
                }
              });
              return res.status(409).json({
                success: false,
                message: "Request may have been processed by another admin",
                error_type: "concurrent_modification"
              });
            }

            // Commit the transaction
            req.db.run('COMMIT', (commitErr) => {
              if (commitErr) {
                console.error("  Commit error:", commitErr);
                req.db.run('ROLLBACK', (rollbackErr) => {
                  if (rollbackErr) {
                    console.error("  Rollback error:", rollbackErr);
                  }
                });
                return res.status(500).json({
                  success: false,
                  message: "Failed to commit transaction",
                  error_type: "commit_error"
                });
              }

              console.log(`  Manual punch approved successfully for ID: ${id}, Attendance ID: ${attendanceId}`);

              res.json({
                success: true,
                message: "Manual punch approved successfully",
                data: {
                  request_id: id,
                  attendance_id: attendanceId,
                  user_id: request.digital_id,
                  user_name: request.user_name,
                  punch_type: request.punch_type,
                  approved_by: adminId,
                  approved_at: new Date().toISOString()
                }
              });
            });
          });
        });
      });
    });
  });
});

// Reject manual punch (Healthcare alias for pending-requests rejection)
router.post('/manual-punches/:id/reject', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const organizationId = req.user.organization_id;
  const adminId = req.user.digital_id;
  const { admin_notes = '' } = req.body;

  console.log(` Healthcare manual punch rejection requested for ID: ${id}, Admin: ${adminId}`);

  req.db.run(`
    UPDATE pending_requests
    SET status = 'rejected', admin_id = ?, admin_notes = ?, decision_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organization_id = ? AND status = 'pending'
  `, [adminId, admin_notes || 'Rejected', id, organizationId], function(err) {
    if (err) {
      console.error("  Manual punch rejection error:", err);
      return res.status(500).json({ success: false, message: "Failed to reject request" });
    }

    if (this.changes === 0) {
      console.log(`  Manual punch request not found - ID: ${id}, Organization: ${organizationId}`);
      return res.status(404).json({ success: false, message: "Pending request not found" });
    }

    console.log(`  Manual punch rejected for ID: ${id}`);
    res.json({
      success: true,
      message: "Manual punch rejected successfully",
      request_id: id
    });
  });
});

// Helper function for time ago calculation
function getTimeAgo(date) {
  // Ensure date is treated as UTC if it's an ISO string
  let timestamp;
  if (typeof date === 'string' && date.includes('T')) {
    // If it's an ISO string, parse it as UTC
    timestamp = new Date(date + (date.includes('Z') ? '' : 'Z'));
  } else {
    timestamp = new Date(date);
  }

  const now = new Date();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

module.exports = router;
