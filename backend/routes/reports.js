/**
 * Universal Attendance System - Reports Routes
 * Handles reporting, analytics, and dashboard data for different industries
 */

const express = require('express');
const router = express.Router();

// Import middleware
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Enhanced industry-specific dashboard data
router.get('/dashboard/:industry', authenticateToken, (req, res) => {
  const { industry } = req.params;
  const organizationId = req.user.organization_id;
  
  // Get organization-specific data
  req.db.get(
    "SELECT * FROM organizations WHERE id = ?", 
    [organizationId], 
    (err, org) => {
      if (err || !org) {
        return res.status(404).json({ success: false, message: "Organization not found" });
      }

      const industryData = {
        healthcare: {
          metrics: ['patient_ratio', 'shift_compliance', 'overtime_hours', 'emergency_response_time'],
          alerts: ['Staff shortage in ICU', 'Mandatory training due', 'Equipment maintenance required'],
          quick_actions: ['View Shift Schedule', 'Emergency Protocols', 'Patient Assignments']
        },
        education: {
          metrics: ['class_attendance_rate', 'teacher_availability', 'student_engagement', 'academic_performance'],
          alerts: ['Parent-teacher meeting scheduled', 'Exam schedule updated', 'Library resources due'],
          quick_actions: ['Class Schedule', 'Grade Reports', 'Student Portal']
        },
        corporate: {
          metrics: ['productivity_score', 'project_completion', 'team_collaboration', 'deadline_adherence'],
          alerts: ['Quarterly review pending', 'New project assigned', 'Performance evaluation due'],
          quick_actions: ['Project Dashboard', 'Team Calendar', 'Performance Metrics']
        },
        manufacturing: {
          metrics: ['production_efficiency', 'safety_compliance', 'equipment_status', 'quality_control'],
          alerts: ['Safety inspection due', 'Equipment maintenance scheduled', 'Production target review'],
          quick_actions: ['Production Line Status', 'Safety Protocols', 'Quality Reports']
        },
        government: {
          metrics: ['case_processing_time', 'citizen_satisfaction', 'compliance_rate', 'budget_utilization'],
          alerts: ['Policy update required', 'Citizen complaint pending', 'Audit scheduled'],
          quick_actions: ['Case Management', 'Public Services', 'Compliance Reports']
        },
        retail: {
          metrics: ['sales_performance', 'customer_satisfaction', 'inventory_turnover', 'staff_productivity'],
          alerts: ['Inventory restock needed', 'Customer feedback review', 'Seasonal promotion'],
          quick_actions: ['Sales Dashboard', 'Inventory Management', 'Customer Reports']
        }
      };

      res.json({
        success: true,
        organization: {
          name: org.name,
          type: org.type,
          industry: industry
        },
        industry_data: industryData[industry] || { 
          metrics: ['efficiency', 'compliance', 'performance'], 
          alerts: ['System update available'],
          quick_actions: ['Dashboard', 'Reports', 'Settings']
        },
        message: `${industry} dashboard data retrieved for ${org.name}`
      });
    }
  );
});

// Get attendance analytics report
router.get('/attendance-analytics', authenticateToken, (req, res) => {
  const { start_date, end_date, group_by = 'day', user_id } = req.query;
  const organizationId = req.user.organization_id;

  let dateFilter = '';
  let params = [organizationId];

  if (start_date) {
    dateFilter += ' AND DATE(a.timestamp) >= ?';
    params.push(start_date);
  }

  if (end_date) {
    dateFilter += ' AND DATE(a.timestamp) <= ?';
    params.push(end_date);
  }

  if (user_id) {
    dateFilter += ' AND a.digital_id = ?';
    params.push(user_id);
  }

  let groupByClause;
  switch (group_by) {
    case 'hour':
      groupByClause = "strftime('%Y-%m-%d %H:00', a.timestamp)";
      break;
    case 'week':
      groupByClause = "strftime('%Y-W%W', a.timestamp)";
      break;
    case 'month':
      groupByClause = "strftime('%Y-%m', a.timestamp)";
      break;
    default:
      groupByClause = "DATE(a.timestamp)";
  }

  const query = `
    SELECT 
      ${groupByClause} as period,
      COUNT(*) as total_punches,
      COUNT(DISTINCT a.digital_id) as unique_users,
      COUNT(CASE WHEN a.punch_type = 'in' THEN 1 END) as check_ins,
      COUNT(CASE WHEN a.punch_type = 'out' THEN 1 END) as check_outs,
      COUNT(CASE WHEN a.attendance_method = 'qr' THEN 1 END) as qr_punches,
      COUNT(CASE WHEN a.attendance_method = 'manual' THEN 1 END) as manual_punches,
      AVG(CASE WHEN a.punch_type = 'in' THEN strftime('%H', a.timestamp) END) as avg_checkin_hour
    FROM attendance a
    WHERE a.organization_id = ? ${dateFilter}
    GROUP BY ${groupByClause}
    ORDER BY period DESC
    LIMIT 100
  `;

  req.db.all(query, params, (err, analytics) => {
    if (err) {
      console.error("❌ Attendance analytics error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch attendance analytics" });
    }

    // Get summary statistics
    req.db.get(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT digital_id) as total_users,
        MIN(timestamp) as earliest_record,
        MAX(timestamp) as latest_record
      FROM attendance 
      WHERE organization_id = ? ${dateFilter}
    `, params, (err, summary) => {
      if (err) {
        console.error("❌ Summary statistics error:", err);
        summary = {};
      }

      console.log(` Attendance analytics fetched for organization ${organizationId}`);
      res.json({
        success: true,
        analytics,
        summary: summary || {},
        filters: {
          start_date,
          end_date,
          group_by,
          user_id
        }
      });
    });
  });
});

// Get user performance report
router.get('/user-performance', authenticateToken, (req, res) => {
  const { period = '30', limit = 50 } = req.query;
  const organizationId = req.user.organization_id;
  const isAdmin = req.user.role && req.user.role.toLowerCase().includes('admin');

  // If not admin, only show own performance
  const userFilter = isAdmin ? '' : ' AND u.digital_id = ?';
  const params = isAdmin ? [organizationId, period] : [organizationId, req.user.digital_id, period];

  const query = `
    SELECT 
      u.digital_id,
      u.name,
      u.role,
      u.industry_type,
      COUNT(a.id) as total_attendance,
      COUNT(CASE WHEN a.punch_type = 'in' THEN 1 END) as total_checkins,
      COUNT(CASE WHEN a.punch_type = 'out' THEN 1 END) as total_checkouts,
      COUNT(CASE WHEN DATE(a.timestamp) = DATE('now') THEN 1 END) as today_attendance,
      AVG(CASE WHEN a.punch_type = 'in' THEN strftime('%H', a.timestamp) END) as avg_checkin_time,
      AVG(CASE WHEN a.punch_type = 'out' THEN strftime('%H', a.timestamp) END) as avg_checkout_time,
      MAX(a.timestamp) as last_activity,
      COUNT(DISTINCT DATE(a.timestamp)) as active_days
    FROM users u
    LEFT JOIN attendance a ON u.digital_id = a.digital_id 
      AND a.timestamp >= date('now', '-${period} days')
    WHERE u.organization_id = ? AND u.is_active = 1 ${userFilter}
    GROUP BY u.digital_id
    ORDER BY total_attendance DESC
    LIMIT ?
  `;

  params.push(parseInt(limit));

  req.db.all(query, params, (err, performance) => {
    if (err) {
      console.error("❌ User performance error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch user performance" });
    }

    // Calculate performance scores
    const enhancedPerformance = performance.map(user => {
      const expectedDays = Math.min(parseInt(period), 30); // Cap at 30 for scoring
      const attendanceRate = user.active_days / expectedDays;
      const punchBalance = Math.abs(user.total_checkins - user.total_checkouts) / Math.max(user.total_checkins, 1);
      
      const performanceScore = Math.round(
        (attendanceRate * 60) + // 60% for attendance rate
        ((1 - punchBalance) * 30) + // 30% for punch balance
        (user.today_attendance > 0 ? 10 : 0) // 10% bonus for today's activity
      );

      return {
        ...user,
        attendance_rate: Math.round(attendanceRate * 100),
        performance_score: Math.min(performanceScore, 100),
        punch_balance: Math.round((1 - punchBalance) * 100),
        avg_checkin_time: user.avg_checkin_time ? `${Math.floor(user.avg_checkin_time)}:${String(Math.round((user.avg_checkin_time % 1) * 60)).padStart(2, '0')}` : null,
        avg_checkout_time: user.avg_checkout_time ? `${Math.floor(user.avg_checkout_time)}:${String(Math.round((user.avg_checkout_time % 1) * 60)).padStart(2, '0')}` : null
      };
    });

    console.log(` User performance report fetched for organization ${organizationId}`);
    res.json({
      success: true,
      performance: enhancedPerformance,
      period: `${period} days`,
      total_users: performance.length
    });
  });
});

// Get attendance trends report
router.get('/attendance-trends', authenticateToken, (req, res) => {
  const { period = '30' } = req.query;
  const organizationId = req.user.organization_id;

  const query = `
    SELECT 
      DATE(timestamp) as date,
      COUNT(*) as total_punches,
      COUNT(DISTINCT digital_id) as unique_users,
      COUNT(CASE WHEN punch_type = 'in' THEN 1 END) as checkins,
      COUNT(CASE WHEN punch_type = 'out' THEN 1 END) as checkouts,
      COUNT(CASE WHEN attendance_method = 'qr' THEN 1 END) as qr_usage,
      COUNT(CASE WHEN attendance_method = 'manual' THEN 1 END) as manual_usage,
      strftime('%w', timestamp) as day_of_week
    FROM attendance
    WHERE organization_id = ? 
      AND timestamp >= date('now', '-${period} days')
    GROUP BY DATE(timestamp)
    ORDER BY date DESC
  `;

  req.db.all(query, [organizationId], (err, trends) => {
    if (err) {
      console.error("❌ Attendance trends error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch attendance trends" });
    }

    // Calculate day-of-week patterns
    const dayPatterns = {};
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    trends.forEach(trend => {
      const dayName = dayNames[parseInt(trend.day_of_week)];
      if (!dayPatterns[dayName]) {
        dayPatterns[dayName] = { total_punches: 0, unique_users: 0, days: 0 };
      }
      dayPatterns[dayName].total_punches += trend.total_punches;
      dayPatterns[dayName].unique_users += trend.unique_users;
      dayPatterns[dayName].days += 1;
    });

    // Calculate averages
    Object.keys(dayPatterns).forEach(day => {
      dayPatterns[day].avg_punches = Math.round(dayPatterns[day].total_punches / dayPatterns[day].days);
      dayPatterns[day].avg_users = Math.round(dayPatterns[day].unique_users / dayPatterns[day].days);
    });

    console.log(` Attendance trends fetched for organization ${organizationId}`);
    res.json({
      success: true,
      trends,
      day_patterns: dayPatterns,
      period: `${period} days`,
      total_days: trends.length
    });
  });
});

// Get class attendance report (education industry)
router.get('/class-attendance', authenticateToken, (req, res) => {
  const { class_id, start_date, end_date } = req.query;
  const organizationId = req.user.organization_id;

  let classFilter = '';
  let params = [organizationId];

  if (class_id) {
    classFilter = ' AND c.id = ?';
    params.push(class_id);
  }

  let dateFilter = '';
  if (start_date) {
    dateFilter += ' AND ca.date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    dateFilter += ' AND ca.date <= ?';
    params.push(end_date);
  }

  const query = `
    SELECT 
      c.id as class_id,
      c.class_name,
      c.subject,
      c.teacher_id,
      u.name as teacher_name,
      COUNT(DISTINCT s.id) as total_students,
      COUNT(DISTINCT ca.date) as total_sessions,
      COUNT(ca.id) as total_attendance_records,
      COUNT(CASE WHEN ca.is_present = 1 THEN 1 END) as total_present,
      ROUND(AVG(CASE WHEN ca.is_present = 1 THEN 100.0 ELSE 0.0 END), 2) as attendance_percentage
    FROM classes c
    LEFT JOIN users u ON c.teacher_id = u.digital_id
    LEFT JOIN students s ON c.id = s.class_id AND s.is_active = 1
    LEFT JOIN class_attendance ca ON c.id = ca.class_id ${dateFilter}
    WHERE c.organization_id = ? AND c.is_active = 1 ${classFilter}
    GROUP BY c.id
    ORDER BY c.class_name
  `;

  req.db.all(query, params, (err, classReports) => {
    if (err) {
      console.error("❌ Class attendance report error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch class attendance report" });
    }

    // Get detailed student attendance if specific class requested
    if (class_id && classReports.length > 0) {
      const studentQuery = `
        SELECT 
          s.student_id,
          s.name,
          s.roll_number,
          COUNT(ca.id) as sessions_marked,
          COUNT(CASE WHEN ca.is_present = 1 THEN 1 END) as sessions_present,
          ROUND(AVG(CASE WHEN ca.is_present = 1 THEN 100.0 ELSE 0.0 END), 2) as attendance_percentage,
          COUNT(CASE WHEN ca.late_arrival = 1 THEN 1 END) as late_arrivals,
          COUNT(CASE WHEN ca.early_departure = 1 THEN 1 END) as early_departures
        FROM students s
        LEFT JOIN class_attendance ca ON s.id = ca.student_id ${dateFilter}
        WHERE s.class_id = ? AND s.is_active = 1
        GROUP BY s.id
        ORDER BY s.roll_number
      `;

      req.db.all(studentQuery, [class_id, ...params.slice(1)], (err, studentDetails) => {
        if (err) {
          console.error("❌ Student details error:", err);
          studentDetails = [];
        }

        console.log(` Class attendance report fetched for organization ${organizationId}`);
        res.json({
          success: true,
          class_reports: classReports,
          student_details: studentDetails,
          filters: { class_id, start_date, end_date }
        });
      });
    } else {
      console.log(` Class attendance report fetched for organization ${organizationId}`);
      res.json({
        success: true,
        class_reports: classReports,
        filters: { class_id, start_date, end_date }
      });
    }
  });
});

// Export attendance data (CSV format)
router.get('/export/attendance', authenticateToken, requireAdmin, (req, res) => {
  const { start_date, end_date, format = 'json' } = req.query;
  const organizationId = req.user.organization_id;

  let dateFilter = '';
  let params = [organizationId];

  if (start_date) {
    dateFilter += ' AND DATE(a.timestamp) >= ?';
    params.push(start_date);
  }
  if (end_date) {
    dateFilter += ' AND DATE(a.timestamp) <= ?';
    params.push(end_date);
  }

  const query = `
    SELECT 
      a.digital_id,
      u.name,
      u.role,
      u.industry_type,
      a.punch_type,
      a.timestamp,
      a.attendance_method,
      a.notes,
      a.verified_by
    FROM attendance a
    LEFT JOIN users u ON a.digital_id = u.digital_id
    WHERE a.organization_id = ? ${dateFilter}
    ORDER BY a.timestamp DESC
  `;

  req.db.all(query, params, (err, records) => {
    if (err) {
      console.error("❌ Export attendance error:", err);
      return res.status(500).json({ success: false, message: "Failed to export attendance data" });
    }

    if (format === 'csv') {
      // Generate CSV format
      const csvHeader = 'Digital ID,Name,Role,Industry,Punch Type,Timestamp,Method,Notes,Verified By\n';
      const csvData = records.map(record => 
        `"${record.digital_id}","${record.name}","${record.role}","${record.industry_type}","${record.punch_type}","${record.timestamp}","${record.attendance_method}","${record.notes || ''}","${record.verified_by || ''}"`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="attendance_export_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvHeader + csvData);
    } else {
      // JSON format
      console.log(` Attendance data exported for organization ${organizationId}`);
      res.json({
        success: true,
        records,
        total_records: records.length,
        export_date: new Date().toISOString(),
        filters: { start_date, end_date }
      });
    }
  });
});

module.exports = router;