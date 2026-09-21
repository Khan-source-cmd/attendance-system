/**
 * Universal Attendance System - Student Routes
 * Handles student-related API endpoints for educational institutions
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// Enhanced student middleware
function requireStudentMiddleware(req, res, next) {
  if (!req.user || !req.user.role) {
    return res.status(403).json({ success: false, message: "Student access required" });
  }

  const role = req.user.role.toLowerCase().trim();
  const industry = req.user.industry_type ? req.user.industry_type.toLowerCase().trim() : '';
  const studentRoles = ['student', 'learner', 'trainee', 'intern'];

  // Allow access if user has student role OR is in education industry (not teacher/admin)
  const isStudentRole = studentRoles.some(studentRole => role.includes(studentRole));
  const isEducationStudent = industry === 'education' && !role.includes('teacher') && !role.includes('admin') && !role.includes('faculty');

  // Student features are education-only. Records without an industry_type are
  // allowed through so legacy education accounts keep working.
  if (industry && industry !== 'education') {
    console.log(` Student access denied for non-education industry: ${industry} (user: ${req.user.digital_id})`);
    return res.status(403).json({ success: false, message: "This feature is only available to education organizations" });
  }

  if (!isStudentRole && !isEducationStudent) {
    console.log(` Student access denied for role: ${req.user.role}, industry: ${req.user.industry_type}`);
    return res.status(403).json({ success: false, message: "Student access required" });
  }

  console.log(` Student access granted for: ${req.user.digital_id} (role: ${req.user.role}, industry: ${req.user.industry_type})`);
  next();
}

// ========== STUDENT DASHBOARD ROUTES ==========

// Get student statistics for dashboard
router.get('/stats', authenticateToken, requireStudentMiddleware, (req, res) => {
  const studentId = req.user.digital_id;
  const organizationId = req.user.organization_id;

  // Get comprehensive student statistics
  req.db.get(`
    SELECT
      COUNT(DISTINCT cs.id) as enrolled_classes,
      COUNT(DISTINCT CASE WHEN sa.date = DATE('now') THEN sa.lecture_id END) as today_lectures,
      ROUND(
        CASE
          WHEN COUNT(DISTINCT sa.lecture_id) > 0
          THEN (
            COUNT(DISTINCT CASE WHEN sa.is_present = 1 THEN sa.lecture_id END) * 100.0 /
            COUNT(DISTINCT sa.lecture_id)
          )
          ELSE 0
        END
      ) as overall_attendance
    FROM students s
    JOIN class_subjects cs ON s.class_id = cs.class_id
    LEFT JOIN subject_attendance sa ON cs.id = sa.class_subject_id AND sa.student_id = s.id
    WHERE s.student_id = ? AND s.is_active = 1 AND cs.is_active = 1
  `, [studentId], (err, stats) => {
    if (err) {
      console.error(" Student stats error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch student statistics" });
    }

    console.log(` Student stats for: ${studentId}`);
    res.json({
      success: true,
      stats: {
        enrolled_classes: stats.enrolled_classes || 0,
        overall_attendance: stats.overall_attendance || 0,
        today_lectures: stats.today_lectures || 0
      }
    });
  });
});

// Get student's schedule for a specific date
router.get('/schedule', authenticateToken, requireStudentMiddleware, (req, res) => {
  const studentId = req.user.digital_id;
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];

  req.db.all(`
    SELECT
      l.id,
      l.title,
      l.description,
      l.start_time,
      l.end_time,
      l.room_number,
      l.status,
      cs.class_id,
      cs.subject_id,
      c.class_code,
      c.class_name,
      s.subject_code,
      s.subject_name,
      t.name as teacher_name,
      COUNT(DISTINCT CASE WHEN sa.is_present = 1 THEN sa.student_id END) as enrolled_students,
      sa.is_present as student_attendance
    FROM lectures l
    JOIN class_subjects cs ON l.class_subject_id = cs.id
    JOIN classes c ON cs.class_id = c.id
    JOIN subjects s ON cs.subject_id = s.id
    JOIN students st ON c.id = st.class_id
    LEFT JOIN users t ON cs.teacher_id = t.digital_id
    LEFT JOIN subject_attendance sa ON l.id = sa.lecture_id AND sa.student_id = st.id
    WHERE st.student_id = ? AND st.is_active = 1
      AND l.scheduled_date = ? AND l.status != 'cancelled'
    GROUP BY l.id
    ORDER BY l.start_time
  `, [studentId, targetDate], (err, lectures) => {
    if (err) {
      console.error(" Student schedule error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch schedule" });
    }

    // Format lectures for dashboard
    const formattedLectures = lectures.map(lecture => ({
      id: lecture.id,
      title: lecture.title,
      subject_name: lecture.subject_name,
      subject_code: lecture.subject_code,
      class_name: lecture.class_name,
      start_time: lecture.start_time,
      end_time: lecture.end_time,
      room_number: lecture.room_number || 'TBA',
      status: lecture.student_attendance !== null ?
        (lecture.student_attendance ? 'present' : 'absent') : 'scheduled',
      teacher_name: lecture.teacher_name || 'TBA',
      enrolled_students: lecture.enrolled_students || 0
    }));

    console.log(` Fetched ${lectures.length} schedule items for student: ${studentId}`);
    res.json({ success: true, lectures: formattedLectures });
  });
});

// Get student's upcoming lectures
router.get('/upcoming-lectures', authenticateToken, requireStudentMiddleware, (req, res) => {
  const studentId = req.user.digital_id;
  const { date } = req.query;
  const today = date || new Date().toISOString().split('T')[0];

  req.db.all(`
    SELECT
      l.id,
      l.title,
      l.description,
      l.start_time,
      l.end_time,
      l.room_number,
      l.status,
      l.scheduled_date,
      cs.class_id,
      cs.subject_id,
      c.class_code,
      c.class_name,
      s.subject_code,
      s.subject_name,
      t.name as teacher_name,
      COUNT(DISTINCT CASE WHEN sa.is_present = 1 THEN sa.student_id END) as enrolled_students
    FROM lectures l
    JOIN class_subjects cs ON l.class_subject_id = cs.id
    JOIN classes c ON cs.class_id = c.id
    JOIN subjects s ON cs.subject_id = s.id
    JOIN students st ON c.id = st.class_id
    LEFT JOIN users t ON cs.teacher_id = t.digital_id
    LEFT JOIN subject_attendance sa ON l.id = sa.lecture_id AND sa.student_id = st.id
    WHERE st.student_id = ? AND st.is_active = 1
      AND l.scheduled_date > ? AND l.status != 'cancelled'
    GROUP BY l.id
    ORDER BY l.scheduled_date ASC, l.start_time ASC
    LIMIT 20
  `, [studentId, today], (err, lectures) => {
    if (err) {
      console.error(" Student upcoming lectures error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch upcoming lectures" });
    }

    // Format lectures for dashboard
    const formattedLectures = lectures.map(lecture => ({
      id: lecture.id,
      title: lecture.title,
      subject_name: lecture.subject_name,
      subject_code: lecture.subject_code,
      class_name: lecture.class_name,
      start_time: lecture.start_time,
      end_time: lecture.end_time,
      room_number: lecture.room_number || 'TBA',
      status: 'scheduled', // Future lectures are always scheduled
      teacher_name: lecture.teacher_name || 'TBA',
      enrolled_students: lecture.enrolled_students || 0,
      lecture_date: lecture.scheduled_date
    }));

    console.log(` Fetched ${lectures.length} upcoming lectures for student: ${studentId}`);
    res.json({ success: true, lectures: formattedLectures });
  });
});

// Get student's enrolled subjects
router.get('/subjects', authenticateToken, requireStudentMiddleware, (req, res) => {
  const studentId = req.user.digital_id;

  req.db.all(`
    SELECT
      s.subject_code,
      s.subject_name,
      s.credits,
      s.description,
      cs.schedule_time,
      cs.room_number,
      c.class_code,
      c.class_name,
      c.semester,
      u.name as teacher_name,
      COUNT(DISTINCT l.id) as total_lectures,
      COUNT(DISTINCT CASE WHEN sa.is_present = 1 THEN sa.lecture_id END) as attended_lectures,
      ROUND(
        CASE
          WHEN COUNT(DISTINCT sa.lecture_id) > 0
          THEN (COUNT(DISTINCT CASE WHEN sa.is_present = 1 THEN sa.lecture_id END) * 100.0 / COUNT(DISTINCT sa.lecture_id))
          ELSE 0
        END
      ) as attendance_percentage
    FROM students st
    JOIN class_subjects cs ON st.class_id = cs.class_id
    JOIN subjects s ON cs.subject_id = s.id
    JOIN classes c ON cs.class_id = c.id
    LEFT JOIN users u ON cs.teacher_id = u.digital_id
    LEFT JOIN lectures l ON cs.id = l.class_subject_id AND l.status = 'completed'
    LEFT JOIN subject_attendance sa ON l.id = sa.lecture_id AND sa.student_id = st.id
    WHERE st.student_id = ? AND st.is_active = 1 AND cs.is_active = 1
    GROUP BY cs.id, s.id, c.id
    ORDER BY c.class_name, s.subject_name
  `, [studentId], (err, subjects) => {
    if (err) {
      console.error(" Student subjects error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch subjects" });
    }

    console.log(` Fetched ${subjects.length} subjects for student: ${studentId}`);
    res.json({ success: true, subjects });
  });
});

// Get student's attendance data by subject
router.get('/attendance-by-subject', authenticateToken, requireStudentMiddleware, (req, res) => {
  const studentId = req.user.digital_id;

  req.db.all(`
    SELECT
      s.subject_code,
      s.subject_name,
      s.credits,
      c.class_name,
      COUNT(DISTINCT l.id) as total_lectures,
      COUNT(DISTINCT CASE WHEN sa.is_present = 1 THEN sa.lecture_id END) as present_lectures,
      COUNT(DISTINCT CASE WHEN sa.is_present = 0 THEN sa.lecture_id END) as absent_lectures,
      ROUND(
        CASE
          WHEN COUNT(DISTINCT sa.lecture_id) > 0
          THEN (COUNT(DISTINCT CASE WHEN sa.is_present = 1 THEN sa.lecture_id END) * 100.0 / COUNT(DISTINCT sa.lecture_id))
          ELSE 0
        END
      ) as attendance_percentage,
      MAX(sa.date) as last_attendance_date
    FROM students st
    JOIN class_subjects cs ON st.class_id = cs.class_id
    JOIN subjects s ON cs.subject_id = s.id
    JOIN classes c ON cs.class_id = c.id
    LEFT JOIN lectures l ON cs.id = l.class_subject_id AND l.status = 'completed'
    LEFT JOIN subject_attendance sa ON l.id = sa.lecture_id AND sa.student_id = st.id
    WHERE st.student_id = ? AND st.is_active = 1 AND cs.is_active = 1
    GROUP BY cs.id, s.id, c.id
    ORDER BY s.subject_name
  `, [studentId], (err, attendance) => {
    if (err) {
      console.error(" Student attendance error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch attendance data" });
    }

    console.log(` Fetched attendance data for ${attendance.length} subjects for student: ${studentId}`);
    res.json({ success: true, attendance });
  });
});

// Join a class by class code
router.post('/join-class', authenticateToken, requireStudentMiddleware, (req, res) => {
  const { class_code } = req.body;
  const studentId = req.user.digital_id;
  const organizationId = req.user.organization_id;

  if (!class_code) {
    return res.status(400).json({ success: false, message: "Class code is required" });
  }

  // Find the class by code and get current student count
  req.db.get(`
    SELECT c.*,
           COUNT(s.id) as current_student_count,
           c.max_students as max_students
    FROM classes c
    LEFT JOIN students s ON c.id = s.class_id AND s.is_active = 1
    WHERE c.class_code = ? AND c.organization_id = ? AND c.is_active = 1
    GROUP BY c.id
  `, [class_code.toUpperCase(), organizationId], (err, classInfo) => {
    if (err) {
      console.error(" Class lookup error:", err);
      return res.status(500).json({ success: false, message: "Failed to find class" });
    }

    if (!classInfo) {
      return res.status(404).json({ success: false, message: "Class not found. Please check the class code." });
    }

    // Check if the class is already full
    const currentCount = classInfo.current_student_count || 0;
    const maxStudents = classInfo.max_students || 50;

    if (currentCount >= maxStudents) {
      return res.status(409).json({
        success: false,
        message: `Class "${classInfo.class_name}" is already full (${currentCount}/${maxStudents} students). Cannot join at this time.`
      });
    }

    // Check if student is already enrolled in this specific class
    req.db.get(
      "SELECT id FROM students WHERE student_id = ? AND class_id = ? AND is_active = 1",
      [studentId, classInfo.id],
      (err, existingStudent) => {
        if (err) {
          console.error(" Student check error:", err);
          return res.status(500).json({ success: false, message: "Failed to check enrollment status" });
        }

        if (existingStudent) {
          return res.status(409).json({ success: false, message: "You are already enrolled in this class." });
        }

        // Generate a unique roll number for this class enrollment
        const rollNumber = `${studentId}-${classInfo.id}-${Date.now()}`;

        // Create student record - students can now enroll in multiple classes
        req.db.run(`
          INSERT INTO students (student_id, class_id, name, email, roll_number, organization_id, is_active)
          VALUES (?, ?, ?, ?, ?, ?, 1)
        `, [studentId, classInfo.id, req.user.name, req.user.email || '', rollNumber, organizationId], function(err) {
          if (err) {
            console.error(" Student enrollment error:", err);
            return res.status(500).json({ success: false, message: "Failed to enroll in class" });
          }

          console.log(` Student ${studentId} enrolled in class ${classInfo.class_name} (Roll: ${rollNumber})`);

          // Get subjects for this class
          req.db.all(`
            SELECT s.subject_code, s.subject_name, s.credits
            FROM class_subjects cs
            JOIN subjects s ON cs.subject_id = s.id
            WHERE cs.class_id = ? AND cs.is_active = 1
            ORDER BY s.subject_name
          `, [classInfo.id], (err, subjects) => {
            if (err) {
              console.error(" Subjects fetch error:", err);
              // Don't fail the enrollment if subjects fetch fails
              subjects = [];
            }

            // Get updated student count after enrollment
            req.db.get(`
              SELECT COUNT(*) as updated_count FROM students
              WHERE class_id = ? AND is_active = 1
            `, [classInfo.id], (err, countResult) => {
              const updatedCount = countResult ? countResult.updated_count : (currentCount + 1);

              console.log(` Student ${studentId} successfully enrolled in class ${classInfo.class_name}. Class now has ${updatedCount} students.`);
              res.json({
                success: true,
                message: "Successfully enrolled in class!",
                class_details: {
                  class_id: classInfo.id,
                  class_name: classInfo.class_name,
                  class_code: classInfo.class_code,
                  teacher_name: classInfo.teacher_name || 'TBA',
                  student_count: updatedCount,
                  max_students: maxStudents,
                  subjects: subjects || []
                }
              });
            });
          });
        });
      }
    );
  });
});

// Get student's attendance history
router.get('/attendance-history', authenticateToken, requireStudentMiddleware, (req, res) => {
  const studentId = req.user.digital_id;
  const { limit = 50, subject_id } = req.query;

  let query = `
    SELECT
      sa.date,
      sa.is_present,
      sa.notes,
      sa.late_arrival,
      sa.early_departure,
      l.title as lecture_title,
      s.subject_code,
      s.subject_name,
      c.class_name,
      u.name as teacher_name
    FROM subject_attendance sa
    JOIN lectures l ON sa.lecture_id = l.id
    JOIN class_subjects cs ON sa.class_subject_id = cs.id
    JOIN subjects s ON cs.subject_id = s.id
    JOIN classes c ON cs.class_id = c.id
    JOIN students st ON sa.student_id = st.id
    LEFT JOIN users u ON cs.teacher_id = u.digital_id
    WHERE st.student_id = ?
  `;

  const params = [studentId];

  if (subject_id) {
    query += " AND s.id = ?";
    params.push(subject_id);
  }

  query += " ORDER BY sa.date DESC, l.start_time DESC LIMIT ?";
  params.push(parseInt(limit));

  req.db.all(query, params, (err, history) => {
    if (err) {
      console.error(" Attendance history error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch attendance history" });
    }

    console.log(` Fetched ${history.length} attendance records for student: ${studentId}`);
    res.json({ success: true, history });
  });
});

// Get student's performance summary
router.get('/performance', authenticateToken, requireStudentMiddleware, (req, res) => {
  const studentId = req.user.digital_id;

  req.db.get(`
    SELECT
      COUNT(DISTINCT sa.lecture_id) as total_lectures_attended,
      COUNT(DISTINCT CASE WHEN sa.is_present = 1 THEN sa.lecture_id END) as present_lectures,
      COUNT(DISTINCT CASE WHEN sa.is_present = 0 THEN sa.lecture_id END) as absent_lectures,
      ROUND(
        CASE
          WHEN COUNT(DISTINCT sa.lecture_id) > 0
          THEN (COUNT(DISTINCT CASE WHEN sa.is_present = 1 THEN sa.lecture_id END) * 100.0 / COUNT(DISTINCT sa.lecture_id))
          ELSE 0
        END
      ) as overall_attendance_percentage,
      COUNT(DISTINCT CASE WHEN sa.late_arrival = 1 THEN sa.lecture_id END) as late_arrivals,
      COUNT(DISTINCT CASE WHEN sa.early_departure = 1 THEN sa.lecture_id END) as early_departures
    FROM students st
    LEFT JOIN subject_attendance sa ON st.id = sa.student_id
    WHERE st.student_id = ? AND st.is_active = 1
  `, [studentId], (err, performance) => {
    if (err) {
      console.error(" Performance fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch performance data" });
    }

    console.log(` Performance data for student: ${studentId}`);
    res.json({ success: true, performance });
  });
});

module.exports = router;
