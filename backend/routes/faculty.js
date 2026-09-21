/**
 * Universal Attendance System - Faculty Routes
 * Handles faculty-related API endpoints and teacher class management for educational institutions
 */

const express = require('express');
const router = express.Router();
const facultyController = require('../controllers/facultyController');
const { check } = require('express-validator');
const { authenticateToken, requireEducationOrg, requireTeacher } = require('../middleware/auth');
const ClassSchedule = require('../models/ClassSchedule');

// Enhanced teacher middleware (allows both teachers and admins)
function requireTeacherMiddleware(req, res, next) {
  if (!req.user || !req.user.role) {
    return res.status(403).json({ success: false, message: "Access required" });
  }

  const role = req.user.role.toLowerCase().trim();
  const teacherRoles = ['teacher', 'professor', 'faculty', 'instructor', 'lecturer', 'educator'];
  const adminRoles = ['admin', 'administrator', 'system administrator', 'super admin'];

  const isTeacher = teacherRoles.some(teacherRole => role.includes(teacherRole));
  const isAdmin = adminRoles.some(adminRole => role.includes(adminRole));

  if (!isTeacher && !isAdmin) {
    console.log(` Access denied for role: ${req.user.role}`);
    return res.status(403).json({ success: false, message: "Teacher or admin access required" });
  }

  // Teacher/faculty features are education-only. Records without an
  // industry_type are allowed through so legacy education accounts keep working.
  const industry = req.user.industry_type ? String(req.user.industry_type).toLowerCase().trim() : '';
  if (industry && industry !== 'education') {
    console.log(` Access denied for non-education industry: ${industry} (user: ${req.user.digital_id})`);
    return res.status(403).json({ success: false, message: "This feature is only available to education organizations" });
  }

  console.log(` Access granted for: ${req.user.digital_id} (${req.user.role})`);
  next();
}

// ========== TEACHER SUBJECT MANAGEMENT ROUTES ==========

// Enhanced teacher's subjects endpoint (replaces classes)
router.get('/teacher/subjects', authenticateToken, requireTeacherMiddleware, (req, res) => {
  const teacherId = req.user.digital_id;
  const organizationId = req.user.organization_id;

  req.db.all(`
    SELECT
      cs.id as class_subject_id,
      cs.class_id,
      cs.subject_id,
      cs.teacher_id,
      cs.schedule_time,
      cs.room_number,
      cs.max_students,
      c.class_code,
      c.class_name,
      c.semester,
      c.academic_year,
      s.subject_code,
      s.subject_name,
      s.credits,
      COUNT(DISTINCT st.id) as student_count,
      COUNT(DISTINCT CASE WHEN sa.date = DATE('now') THEN sa.student_id END) as today_marked,
      COUNT(DISTINCT CASE WHEN sa.date = DATE('now') AND sa.is_present = 1 THEN sa.student_id END) as today_present
    FROM class_subjects cs
    JOIN classes c ON cs.class_id = c.id
    JOIN subjects s ON cs.subject_id = s.id
    LEFT JOIN students st ON c.id = st.class_id AND st.is_active = 1
    LEFT JOIN subject_attendance sa ON cs.id = sa.class_subject_id AND sa.date = DATE('now')
    WHERE cs.teacher_id = ? AND cs.is_active = 1 AND c.organization_id = ?
    GROUP BY cs.id
    ORDER BY c.class_name, s.subject_name
  `, [teacherId, organizationId], (err, subjects) => {
    if (err) {
      console.error(" Subjects fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch subjects" });
    }

    // Calculate attendance percentage for each subject
    const enhancedSubjects = subjects.map(subject => ({
      ...subject,
      attendance_percentage: subject.student_count > 0 && subject.today_marked > 0
        ? Math.round((subject.today_present / subject.today_marked) * 100)
        : 0,
      attendance_status: subject.today_marked === subject.student_count ? 'complete' :
                        subject.today_marked > 0 ? 'partial' : 'pending'
    }));

    console.log(` Fetched ${subjects.length} subjects for teacher: ${teacherId}`);
    res.json({ success: true, subjects: enhancedSubjects });
  });
});

// ========== LECTURE MANAGEMENT ROUTES ==========

// Get teacher's scheduled lectures
router.get('/teacher/lectures', authenticateToken, requireTeacherMiddleware, (req, res) => {
  const teacherId = req.user.digital_id;
  const { date, upcoming_only } = req.query;

  let query = `
    SELECT
      l.*,
      cs.class_id,
      cs.subject_id,
      c.class_code,
      c.class_name,
      s.subject_code,
      s.subject_name,
      COUNT(DISTINCT sa.id) as attendance_count,
      COUNT(DISTINCT CASE WHEN sa.is_present = 1 THEN sa.student_id END) as present_count
    FROM lectures l
    JOIN class_subjects cs ON l.class_subject_id = cs.id
    JOIN classes c ON cs.class_id = c.id
    JOIN subjects s ON cs.subject_id = s.id
    LEFT JOIN subject_attendance sa ON l.id = sa.lecture_id
    WHERE l.teacher_id = ?
  `;

  const params = [teacherId];

  if (date) {
    query += " AND l.scheduled_date = ?";
    params.push(date);
  }

  if (upcoming_only === 'true') {
    query += " AND l.scheduled_date >= DATE('now') AND l.status != 'cancelled'";
  }

  query += " GROUP BY l.id ORDER BY l.scheduled_date, l.start_time";

  req.db.all(query, params, (err, lectures) => {
    if (err) {
      console.error(" Lectures fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch lectures" });
    }

    console.log(` Fetched ${lectures.length} lectures for teacher: ${teacherId}`);
    res.json({ success: true, lectures });
  });
});

// Schedule a new lecture
router.post('/teacher/lectures', authenticateToken, requireTeacherMiddleware, (req, res) => {
  const teacherId = req.user.digital_id;
  const { class_subject_id, title, description, scheduled_date, start_time, end_time, room_number, notes } = req.body;

  // Validate required fields
  if (!class_subject_id || !title || !scheduled_date || !start_time || !end_time) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  // Verify teacher owns this subject
  req.db.get(
    "SELECT cs.id FROM class_subjects cs WHERE cs.id = ? AND cs.teacher_id = ? AND cs.is_active = 1",
    [class_subject_id, teacherId],
    (err, subjectExists) => {
      if (err || !subjectExists) {
        return res.status(403).json({ success: false, message: "Subject not found or access denied" });
      }

      // Insert new lecture
      req.db.run(`
        INSERT INTO lectures (class_subject_id, teacher_id, title, description, scheduled_date, start_time, end_time, room_number, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [class_subject_id, teacherId, title, description || null, scheduled_date, start_time, end_time, room_number || null, notes || null],
      function(err) {
        if (err) {
          console.error(" Lecture creation error:", err);
          return res.status(500).json({ success: false, message: "Failed to schedule lecture" });
        }

        console.log(` Lecture scheduled with ID: ${this.lastID}`);
        res.json({
          success: true,
          message: "Lecture scheduled successfully",
          lecture_id: this.lastID
        });
      });
    }
  );
});

// Update lecture
router.put('/teacher/lectures/:lectureId', authenticateToken, requireTeacherMiddleware, (req, res) => {
  const { lectureId } = req.params;
  const teacherId = req.user.digital_id;
  const { title, description, scheduled_date, start_time, end_time, room_number, notes, status } = req.body;

  // Verify teacher owns this lecture
  req.db.get(
    "SELECT id FROM lectures WHERE id = ? AND teacher_id = ?",
    [lectureId, teacherId],
    (err, lectureExists) => {
      if (err || !lectureExists) {
        return res.status(403).json({ success: false, message: "Lecture not found or access denied" });
      }

      // Update lecture
      req.db.run(`
        UPDATE lectures
        SET title = ?, description = ?, scheduled_date = ?, start_time = ?, end_time = ?,
            room_number = ?, notes = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [title, description || null, scheduled_date, start_time, end_time, room_number || null, notes || null, status || 'scheduled', lectureId],
      function(err) {
        if (err) {
          console.error(" Lecture update error:", err);
          return res.status(500).json({ success: false, message: "Failed to update lecture" });
        }

        console.log(` Lecture ${lectureId} updated`);
        res.json({ success: true, message: "Lecture updated successfully" });
      });
    }
  );
});

// Delete lecture
router.delete('/teacher/lectures/:lectureId', authenticateToken, requireTeacherMiddleware, (req, res) => {
  const { lectureId } = req.params;
  const teacherId = req.user.digital_id;

  // Verify teacher owns this lecture
  req.db.get(
    "SELECT id FROM lectures WHERE id = ? AND teacher_id = ?",
    [lectureId, teacherId],
    (err, lectureExists) => {
      if (err || !lectureExists) {
        return res.status(403).json({ success: false, message: "Lecture not found or access denied" });
      }

      // Delete lecture (consider soft delete by setting status to 'cancelled')
      req.db.run(
        "UPDATE lectures SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [lectureId],
        function(err) {
          if (err) {
            console.error(" Lecture deletion error:", err);
            return res.status(500).json({ success: false, message: "Failed to delete lecture" });
          }

          console.log(` Lecture ${lectureId} cancelled`);
          res.json({ success: true, message: "Lecture cancelled successfully" });
        }
      );
    }
  );
});

// Get students for a lecture (for attendance)
router.get('/teacher/lectures/:lectureId/students', authenticateToken, requireTeacherMiddleware, (req, res) => {
  const { lectureId } = req.params;
  const teacherId = req.user.digital_id;

  // Verify teacher owns this lecture
  req.db.get(`
    SELECT l.id, cs.class_id
    FROM lectures l
    JOIN class_subjects cs ON l.class_subject_id = cs.id
    WHERE l.id = ? AND l.teacher_id = ?
  `, [lectureId, teacherId], (err, lectureInfo) => {
    if (err || !lectureInfo) {
      return res.status(403).json({ success: false, message: "Lecture not found or access denied" });
    }

    // Get students with attendance status for this lecture
    req.db.all(`
      SELECT s.*,
             sa.is_present,
             sa.marked_at,
             sa.notes as attendance_notes,
             sa.late_arrival,
             sa.early_departure
      FROM students s
      LEFT JOIN subject_attendance sa ON s.id = sa.student_id
        AND sa.lecture_id = ?
        AND sa.class_subject_id = (
          SELECT class_subject_id FROM lectures WHERE id = ?
        )
      WHERE s.class_id = ? AND s.is_active = 1
      ORDER BY s.roll_number, s.name
    `, [lectureId, lectureId, lectureInfo.class_id], (err, students) => {
      if (err) {
        console.error(" Lecture students fetch error:", err);
        return res.status(500).json({ success: false, message: "Failed to fetch students" });
      }

      console.log(` Fetched ${students.length} students for lecture ${lectureId}`);
      res.json({
        success: true,
        students,
        total_students: students.length,
        marked_today: students.filter(s => s.is_present !== null).length,
        present_today: students.filter(s => s.is_present === 1).length
      });
    });
  });
});

// Get students for a subject (for attendance)
router.get('/teacher/subjects/:subjectId/students', authenticateToken, requireTeacherMiddleware, (req, res) => {
  const { subjectId } = req.params;
  const teacherId = req.user.digital_id;

  // For now, temporarily allow access to any subject (remove teacher ownership check)
  // TODO: Re-enable teacher ownership check once teachers are properly assigned
  req.db.get(`
    SELECT cs.id, cs.class_id, c.class_name, s.subject_name
    FROM class_subjects cs
    JOIN classes c ON cs.class_id = c.id
    JOIN subjects s ON cs.subject_id = s.id
    WHERE cs.id = ?
  `, [subjectId], (err, subjectInfo) => {
    if (err || !subjectInfo) {
      return res.status(403).json({ success: false, message: "Subject not found" });
    }

    // Get students with today's attendance status for this subject
    req.db.all(`
      SELECT s.*,
             sa.is_present,
             sa.marked_at,
             sa.notes as attendance_notes,
             sa.late_arrival,
             sa.early_departure
      FROM students s
      LEFT JOIN subject_attendance sa ON s.id = sa.student_id
        AND sa.class_subject_id = ?
        AND sa.date = DATE('now')
      WHERE s.class_id = ? AND s.is_active = 1
      ORDER BY s.roll_number, s.name
    `, [subjectId, subjectInfo.class_id], (err, students) => {
      if (err) {
        console.error(" Subject students fetch error:", err);
        return res.status(500).json({ success: false, message: "Failed to fetch students" });
      }

      console.log(` Fetched ${students.length} students for subject ${subjectId}`);
      res.json({
        success: true,
        students,
        subject_info: subjectInfo,
        total_students: students.length,
        marked_today: students.filter(s => s.is_present !== null).length,
        present_today: students.filter(s => s.is_present === 1).length
      });
    });
  });
});

// Submit subject attendance (direct attendance without lecture)
router.post('/teacher/subjects/:subjectId/attendance', authenticateToken, requireTeacherMiddleware, (req, res) => {
  const { subjectId } = req.params;
  const { attendance, notes: classNotes } = req.body;
  const teacherId = req.user.digital_id;

  // Verify teacher owns this subject
  req.db.get(`
    SELECT cs.id, cs.class_id, c.class_name, s.subject_name
    FROM class_subjects cs
    JOIN classes c ON cs.class_id = c.id
    JOIN subjects s ON cs.subject_id = s.id
    WHERE cs.id = ? AND cs.teacher_id = ?
  `, [subjectId, teacherId], (err, subjectInfo) => {
    if (err || !subjectInfo) {
      return res.status(403).json({ success: false, message: "Subject not found or access denied" });
    }

    if (!attendance || !Array.isArray(attendance)) {
      return res.status(400).json({ success: false, message: "Invalid attendance data" });
    }

    const today = new Date().toISOString().split('T')[0];

    // Begin transaction for atomic operation
    req.db.serialize(() => {
      req.db.run("BEGIN TRANSACTION");

      // Delete existing attendance for this subject today
      req.db.run(
        "DELETE FROM subject_attendance WHERE class_subject_id = ? AND date = ?",
        [subjectId, today],
        function(err) {
          if (err) {
            req.db.run("ROLLBACK");
            return res.status(500).json({ success: false, message: "Failed to clear existing attendance" });
          }
        }
      );

      // Insert new attendance records
      const stmt = req.db.prepare(`
        INSERT INTO subject_attendance (lecture_id, class_subject_id, student_id, date, is_present, marked_by, notes, late_arrival, early_departure)
        VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let errorOccurred = false;
      let processedCount = 0;

      attendance.forEach((record) => {
        stmt.run([
          subjectId,
          record.student_id,
          today,
          record.is_present ? 1 : 0,
          teacherId,
          record.notes || classNotes || null,
          record.late_arrival || 0,
          record.early_departure || 0
        ], (err) => {
          if (err) {
            console.error(" Subject attendance insert error:", err);
            errorOccurred = true;
          }

          processedCount++;

          // Check if all records processed
          if (processedCount === attendance.length) {
            stmt.finalize((err) => {
              if (err || errorOccurred) {
                req.db.run("ROLLBACK");
                return res.status(500).json({ success: false, message: "Failed to save attendance" });
              }

              req.db.run("COMMIT", (err) => {
                if (err) {
                  return res.status(500).json({ success: false, message: "Failed to commit attendance" });
                }

                const presentCount = attendance.filter(r => r.is_present).length;
                const totalCount = attendance.length;

                console.log(`Subject attendance saved for subject ${subjectId}: ${presentCount}/${totalCount} present`);

                res.json({
                  success: true,
                  message: `Subject attendance saved successfully`,
                  stats: {
                    total_students: totalCount,
                    present: presentCount,
                    absent: totalCount - presentCount,
                    attendance_percentage: Math.round((presentCount / totalCount) * 100)
                  }
                });
              });
            });
          }
        });
      });
    });
  });
});

// Submit lecture attendance
router.post('/teacher/lectures/:lectureId/attendance', authenticateToken, requireTeacherMiddleware, (req, res) => {
  const { lectureId } = req.params;
  const { attendance, notes: classNotes } = req.body;
  const teacherId = req.user.digital_id;

  // Verify teacher owns this lecture and check time window
  req.db.get(`
    SELECT l.id, l.class_subject_id, l.scheduled_date, l.start_time, l.end_time, l.status
    FROM lectures l
    WHERE l.id = ? AND l.teacher_id = ?
  `, [lectureId, teacherId], (err, lectureInfo) => {
    if (err || !lectureInfo) {
      return res.status(403).json({ success: false, message: "Lecture not found or access denied" });
    }

    // Allow editing of attendance even if lecture is marked as completed
    // The system supports updating attendance records for corrections or audits

    // Time-based validation: 30 minutes before to 1 hour after lecture
    const now = new Date();
    const lectureDateTime = new Date(`${lectureInfo.scheduled_date}T${lectureInfo.start_time}`);
    const lectureEndTime = new Date(`${lectureInfo.scheduled_date}T${lectureInfo.end_time}`);

    const thirtyMinutesBefore = new Date(lectureDateTime.getTime() - 30 * 60 * 1000);
    const oneHourAfter = new Date(lectureEndTime.getTime() + 60 * 60 * 1000);

    if (now < thirtyMinutesBefore) {
      return res.status(400).json({
        success: false,
        message: `Attendance cannot be taken yet. Lecture starts at ${lectureInfo.start_time}. You can take attendance from 30 minutes before the lecture.`
      });
    }

    if (now > oneHourAfter) {
      return res.status(400).json({
        success: false,
        message: `Attendance time window has expired. Lecture ended at ${lectureInfo.end_time}. Attendance must be taken within 1 hour after the lecture.`
      });
    }

    if (!attendance || !Array.isArray(attendance)) {
      return res.status(400).json({ success: false, message: "Invalid attendance data" });
    }

    // Begin transaction for atomic operation
    req.db.serialize(() => {
      req.db.run("BEGIN TRANSACTION");

      // Delete existing attendance for this specific lecture only
      req.db.run(
        "DELETE FROM subject_attendance WHERE lecture_id = ?",
        [lectureId],
        function(err) {
          if (err) {
            req.db.run("ROLLBACK");
            return res.status(500).json({ success: false, message: "Failed to clear existing attendance" });
          }
        }
      );

      // Insert new attendance records
      const stmt = req.db.prepare(`
        INSERT INTO subject_attendance (lecture_id, class_subject_id, student_id, date, is_present, marked_by, notes, late_arrival, early_departure)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let errorOccurred = false;
      let processedCount = 0;

      attendance.forEach((record) => {
        // Skip records with null or invalid student_id
        if (record.student_id == null || record.student_id === undefined || record.student_id === '' || record.student_id === 'null' || record.student_id === 'undefined') {
          console.log('⚠️ Skipping record with invalid student_id:', record);
          processedCount++;
          if (processedCount === attendance.length) {
            stmt.finalize((err) => {
              if (err || errorOccurred) {
                req.db.run("ROLLBACK");
                return res.status(500).json({ success: false, message: "Failed to save attendance" });
              }

              // Update lecture status to indicate attendance has been taken
              req.db.run(
                "UPDATE lectures SET attendance_taken = 1, status = 'completed' WHERE id = ?",
                [lectureId],
                function(err) {
                  if (err) {
                    req.db.run("ROLLBACK");
                    return res.status(500).json({ success: false, message: "Failed to update lecture status" });
                  }

                  req.db.run("COMMIT", (err) => {
                    if (err) {
                      return res.status(500).json({ success: false, message: "Failed to commit attendance" });
                    }

                    const presentCount = attendance.filter(r => r.is_present).length;
                    const totalCount = attendance.length;

                    console.log(` Lecture attendance saved for lecture ${lectureId}: ${presentCount}/${totalCount} present`);

                    res.json({
                      success: true,
                      message: `Lecture attendance saved successfully`,
                      stats: {
                        total_students: totalCount,
                        present: presentCount,
                        absent: totalCount - presentCount,
                        attendance_percentage: Math.round((presentCount / totalCount) * 100)
                      }
                    });
                  });
                }
              );
            });
          }
          return;
        }

        stmt.run([
          lectureId,
          lectureInfo.class_subject_id,
          record.student_id,
          lectureInfo.scheduled_date,
          record.is_present ? 1 : 0,
          teacherId,
          record.notes || classNotes || null,
          record.late_arrival || 0,
          record.early_departure || 0
        ], (err) => {
          if (err) {
            console.error(" Lecture attendance insert error:", err);
            errorOccurred = true;
          }

          processedCount++;

          // Check if all records processed
          if (processedCount === attendance.length) {
            stmt.finalize((err) => {
              if (err || errorOccurred) {
                req.db.run("ROLLBACK");
                return res.status(500).json({ success: false, message: "Failed to save attendance" });
              }

              // Update lecture status to indicate attendance has been taken
              req.db.run(
                "UPDATE lectures SET attendance_taken = 1, status = 'completed' WHERE id = ?",
                [lectureId],
                function(err) {
                  if (err) {
                    req.db.run("ROLLBACK");
                    return res.status(500).json({ success: false, message: "Failed to update lecture status" });
                  }

                  req.db.run("COMMIT", (err) => {
                    if (err) {
                      return res.status(500).json({ success: false, message: "Failed to commit attendance" });
                    }

                    const presentCount = attendance.filter(r => r.is_present).length;
                    const totalCount = attendance.length;

                    console.log(` Lecture attendance saved for lecture ${lectureId}: ${presentCount}/${totalCount} present`);

                    res.json({
                      success: true,
                      message: `Lecture attendance saved successfully`,
                      stats: {
                        total_students: totalCount,
                        present: presentCount,
                        absent: totalCount - presentCount,
                        attendance_percentage: Math.round((presentCount / totalCount) * 100)
                      }
                    });
                  });
                }
              );
            });
          }
        });
      });
    });
  });
});

// ========== REAL-TIME TEACHER DASHBOARD APIs ==========

// Get teacher's schedule for today (alias for /schedule)
router.get('/today-schedule', authenticateToken, requireTeacherMiddleware, (req, res) => {
  const teacherId = req.user.digital_id;
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];

  // Get actual scheduled lectures for today, not just class subjects
  req.db.all(`
    SELECT
      l.id,
      l.title,
      l.scheduled_date,
      l.start_time,
      l.end_time,
      l.room_number,
      l.status,
      c.class_code,
      c.class_name,
      s.subject_code,
      s.subject_name,
      COUNT(DISTINCT st.id) as enrolled_students,
      COUNT(DISTINCT CASE WHEN sa.date = ? THEN sa.student_id END) as today_marked,
      COUNT(DISTINCT CASE WHEN sa.date = ? AND sa.is_present = 1 THEN sa.student_id END) as today_present
    FROM lectures l
    JOIN class_subjects cs ON l.class_subject_id = cs.id
    JOIN classes c ON cs.class_id = c.id
    JOIN subjects s ON cs.subject_id = s.id
    LEFT JOIN students st ON c.id = st.class_id AND st.is_active = 1
    LEFT JOIN subject_attendance sa ON l.id = sa.lecture_id AND sa.date = ?
    WHERE l.teacher_id = ? AND l.scheduled_date = ? AND l.status != 'cancelled'
    GROUP BY l.id
    ORDER BY l.start_time
  `, [targetDate, targetDate, targetDate, teacherId, targetDate], (err, lectures) => {
    if (err) {
      console.error(" Today schedule fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch today's schedule" });
    }

    // Format lectures for dashboard
    const formattedLectures = lectures.map(lecture => ({
      id: lecture.id,
      title: lecture.title || `${lecture.subject_code} - ${lecture.subject_name}`,
      subject_name: lecture.subject_name,
      subject_code: lecture.subject_code,
      class_name: lecture.class_name,
      start_time: lecture.start_time,
      end_time: lecture.end_time,
      room_number: lecture.room_number || 'TBA',
      status: lecture.status || 'scheduled',
      student_count: lecture.enrolled_students || 0,
      class_id: lecture.class_code // for attendance taking
    }));

    console.log(` Fetched ${lectures.length} actual scheduled lectures for today for teacher: ${teacherId}`);
    res.json({ success: true, lectures: formattedLectures });
  });
});

// Get attendance overview (alias for /attendance/overview)
router.get('/attendance-overview', authenticateToken, requireTeacherMiddleware, (req, res) => {
  const teacherId = req.user.digital_id;
  const organizationId = req.user.organization_id;

  req.db.all(`
    SELECT
      c.class_name,
      c.class_code,
      s.subject_name,
      s.subject_code,
      COUNT(DISTINCT st.id) as total_students,
      COUNT(DISTINCT CASE WHEN sa.date = DATE('now') THEN sa.student_id END) as present_today,
      COUNT(DISTINCT CASE WHEN sa.date = DATE('now') AND sa.is_present = 1 THEN sa.student_id END) as marked_today,
      ROUND(
        CASE
          WHEN COUNT(DISTINCT CASE WHEN sa.date >= DATE('now', '-7 days') THEN sa.student_id END) > 0
          THEN (
            COUNT(DISTINCT CASE WHEN sa.date >= DATE('now', '-7 days') AND sa.is_present = 1 THEN sa.student_id END) * 100.0 /
            COUNT(DISTINCT CASE WHEN sa.date >= DATE('now', '-7 days') THEN sa.student_id END)
          )
          ELSE 0
        END
      ) as attendance_rate,
      COUNT(DISTINCT CASE WHEN sa.date >= DATE('now', '-7 days') THEN sa.student_id END) as total_sessions,
      MAX(sa.date) as last_updated
    FROM class_subjects cs
    JOIN classes c ON cs.class_id = c.id
    JOIN subjects s ON cs.subject_id = s.id
    LEFT JOIN students st ON c.id = st.class_id AND st.is_active = 1
    LEFT JOIN subject_attendance sa ON cs.id = sa.class_subject_id AND sa.date >= DATE('now', '-7 days')
    WHERE cs.teacher_id = ? AND cs.is_active = 1 AND c.organization_id = ?
    GROUP BY cs.id, c.class_name, c.class_code, s.subject_name, s.subject_code
    ORDER BY c.class_name, s.subject_name
  `, [teacherId, organizationId], (err, overview) => {
    if (err) {
      console.error(" Attendance overview error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch attendance overview" });
    }

    console.log(` Fetched attendance overview for teacher: ${teacherId} - ${overview.length} subjects`);
    res.json({ success: true, overview });
  });
});

// Get teacher's attendance summary (for dashboard stats) - returns per-subject attendance data
router.get('/attendance/summary', authenticateToken, requireTeacherMiddleware, (req, res) => {
  const teacherId = req.user.digital_id;
  const organizationId = req.user.organization_id;

  // Get attendance statistics for each of teacher's subjects
  req.db.all(`
    SELECT
      cs.id as class_subject_id,
      c.class_name,
      c.class_code,
      s.subject_name,
      s.subject_code,
      COUNT(DISTINCT st.id) as total_students,
      COUNT(DISTINCT CASE WHEN sa.date >= DATE('now', '-30 days') THEN sa.student_id END) as total_sessions,
      ROUND(
        CASE
          WHEN COUNT(DISTINCT CASE WHEN sa.date >= DATE('now', '-30 days') THEN sa.student_id END) > 0
          THEN (
            COUNT(DISTINCT CASE WHEN sa.date >= DATE('now', '-30 days') AND sa.is_present = 1 THEN sa.student_id END) * 100.0 /
            COUNT(DISTINCT CASE WHEN sa.date >= DATE('now', '-30 days') THEN sa.student_id END)
          )
          ELSE 0
        END
      ) as avg_attendance,
      MAX(sa.date) as last_session_date
    FROM class_subjects cs
    JOIN classes c ON cs.class_id = c.id
    JOIN subjects s ON cs.subject_id = s.id
    LEFT JOIN students st ON c.id = st.class_id AND st.is_active = 1
    LEFT JOIN subject_attendance sa ON cs.id = sa.class_subject_id AND sa.date >= DATE('now', '-30 days')
    WHERE cs.teacher_id = ? AND cs.is_active = 1 AND c.organization_id = ?
    GROUP BY cs.id, c.class_name, c.class_code, s.subject_name, s.subject_code
    ORDER BY c.class_name, s.subject_name
  `, [teacherId, organizationId], (err, attendance) => {
    if (err) {
      console.error(" Attendance summary error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch attendance summary" });
    }

    console.log(` Attendance summary for teacher: ${teacherId} - ${attendance.length} subjects`);
    res.json({ success: true, attendance });
  });
});

// Get teacher's schedule for a specific date
router.get('/schedule', authenticateToken, requireTeacherMiddleware, (req, res) => {
  const teacherId = req.user.digital_id;
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];

  req.db.all(`
    SELECT
      c.class_code,
      c.class_name,
      c.semester,
      s.subject_code,
      s.subject_name,
      cs.schedule_time,
      cs.room_number,
      COUNT(DISTINCT st.id) as student_count,
      COUNT(DISTINCT CASE WHEN sa.date = ? THEN sa.student_id END) as today_marked,
      COUNT(DISTINCT CASE WHEN sa.date = ? AND sa.is_present = 1 THEN sa.student_id END) as today_present
    FROM class_subjects cs
    JOIN classes c ON cs.class_id = c.id
    JOIN subjects s ON cs.subject_id = s.id
    LEFT JOIN students st ON c.id = st.class_id AND st.is_active = 1
    LEFT JOIN subject_attendance sa ON cs.id = sa.class_subject_id AND sa.date = ?
    WHERE cs.teacher_id = ? AND cs.is_active = 1 AND c.is_active = 1
    GROUP BY cs.id
    ORDER BY cs.schedule_time
  `, [targetDate, targetDate, targetDate, teacherId], (err, lectures) => {
    if (err) {
      console.error(" Schedule fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch schedule" });
    }

    // Format lectures for dashboard
    const formattedLectures = lectures.map(lecture => ({
      id: `${lecture.class_code}-${lecture.subject_code}`,
      title: `${lecture.subject_code} - ${lecture.subject_name}`,
      subject_name: lecture.subject_name,
      subject_code: lecture.subject_code,
      class_name: lecture.class_name,
      start_time: lecture.schedule_time ? lecture.schedule_time.split('-')[0].trim() : '09:00',
      end_time: lecture.schedule_time ? lecture.schedule_time.split('-')[1].trim() : '10:30',
      room_number: lecture.room_number || 'TBA',
      status: lecture.today_marked > 0 ? 'completed' : 'scheduled',
      student_count: lecture.student_count || 0
    }));

    console.log(` Fetched ${lectures.length} schedule items for teacher: ${teacherId}`);
    res.json({ success: true, lectures: formattedLectures });
  });
});

// Get attendance overview for all teacher's classes (alias for backward compatibility)
router.get('/attendance-overview', authenticateToken, requireTeacherMiddleware, (req, res) => {
  const teacherId = req.user.digital_id;
  const organizationId = req.user.organization_id;

  req.db.all(`
    SELECT
      c.class_name,
      c.class_code,
      s.subject_name,
      s.subject_code,
      COUNT(DISTINCT st.id) as total_students,
      COUNT(DISTINCT CASE WHEN sa.date = DATE('now') THEN sa.student_id END) as present_today,
      COUNT(DISTINCT CASE WHEN sa.date = DATE('now') AND sa.is_present = 1 THEN sa.student_id END) as marked_today,
      ROUND(
        CASE
          WHEN COUNT(DISTINCT CASE WHEN sa.date >= DATE('now', '-7 days') THEN sa.student_id END) > 0
          THEN (
            COUNT(DISTINCT CASE WHEN sa.date >= DATE('now', '-7 days') AND sa.is_present = 1 THEN sa.student_id END) * 100.0 /
            COUNT(DISTINCT CASE WHEN sa.date >= DATE('now', '-7 days') THEN sa.student_id END)
          )
          ELSE 0
        END
      ) as attendance_rate,
      COUNT(DISTINCT CASE WHEN sa.date >= DATE('now', '-7 days') THEN sa.student_id END) as total_sessions,
      MAX(sa.date) as last_updated
    FROM class_subjects cs
    JOIN classes c ON cs.class_id = c.id
    JOIN subjects s ON cs.subject_id = s.id
    LEFT JOIN students st ON c.id = st.class_id AND st.is_active = 1
    LEFT JOIN subject_attendance sa ON cs.id = sa.class_subject_id AND sa.date >= DATE('now', '-7 days')
    WHERE cs.teacher_id = ? AND cs.is_active = 1 AND c.organization_id = ?
    GROUP BY cs.id, c.class_name, c.class_code, s.subject_name, s.subject_code
    ORDER BY c.class_name, s.subject_name
  `, [teacherId, organizationId], (err, overview) => {
    if (err) {
      console.error(" Attendance overview error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch attendance overview" });
    }

    console.log(` Fetched attendance overview for teacher: ${teacherId} - ${overview.length} subjects`);
    res.json({ success: true, overview });
  });
});

// Get attendance overview for all teacher's classes
router.get('/attendance/overview', authenticateToken, requireTeacherMiddleware, (req, res) => {
  const teacherId = req.user.digital_id;
  const organizationId = req.user.organization_id;

  req.db.all(`
    SELECT
      c.class_name,
      c.class_code,
      s.subject_name,
      s.subject_code,
      COUNT(DISTINCT st.id) as total_students,
      COUNT(DISTINCT CASE WHEN sa.date = DATE('now') THEN sa.student_id END) as present_today,
      COUNT(DISTINCT CASE WHEN sa.date = DATE('now') AND sa.is_present = 1 THEN sa.student_id END) as marked_today,
      ROUND(
        CASE
          WHEN COUNT(DISTINCT CASE WHEN sa.date >= DATE('now', '-7 days') THEN sa.student_id END) > 0
          THEN (
            COUNT(DISTINCT CASE WHEN sa.date >= DATE('now', '-7 days') AND sa.is_present = 1 THEN sa.student_id END) * 100.0 /
            COUNT(DISTINCT CASE WHEN sa.date >= DATE('now', '-7 days') THEN sa.student_id END)
          )
          ELSE 0
        END
      ) as attendance_rate,
      COUNT(DISTINCT CASE WHEN sa.date >= DATE('now', '-7 days') THEN sa.student_id END) as total_sessions,
      MAX(sa.date) as last_updated
    FROM class_subjects cs
    JOIN classes c ON cs.class_id = c.id
    JOIN subjects s ON cs.subject_id = s.id
    LEFT JOIN students st ON c.id = st.class_id AND st.is_active = 1
    LEFT JOIN subject_attendance sa ON cs.id = sa.class_subject_id AND sa.date >= DATE('now', '-7 days')
    WHERE cs.teacher_id = ? AND cs.is_active = 1 AND c.organization_id = ?
    GROUP BY cs.id, c.class_name, c.class_code, s.subject_name, s.subject_code
    ORDER BY c.class_name, s.subject_name
  `, [teacherId, organizationId], (err, overview) => {
    if (err) {
      console.error(" Attendance overview error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch attendance overview" });
    }

    console.log(` Fetched attendance overview for teacher: ${teacherId} - ${overview.length} subjects`);
    res.json({ success: true, overview });
  });
});

// ========== LEGACY CLASS MANAGEMENT ROUTES (for backward compatibility) ==========

// Enhanced teacher's classes endpoint (legacy - kept for compatibility)
router.get('/teacher/classes', authenticateToken, requireTeacherMiddleware, (req, res) => {
  const teacherId = req.user.digital_id;
  const organizationId = req.user.organization_id;

  // Get classes that the teacher teaches (via class_subjects)
  req.db.all(`
    SELECT c.*,
           COUNT(DISTINCT s.id) as student_count,
           COUNT(DISTINCT CASE WHEN sa.date = DATE('now') THEN sa.student_id END) as today_marked,
           COUNT(DISTINCT CASE WHEN sa.date = DATE('now') AND sa.is_present = 1 THEN sa.student_id END) as today_present
    FROM classes c
    JOIN class_subjects cs ON c.id = cs.class_id AND cs.teacher_id = ? AND cs.is_active = 1
    LEFT JOIN students s ON c.id = s.class_id AND s.is_active = 1
    LEFT JOIN subject_attendance sa ON cs.id = sa.class_subject_id AND sa.date = DATE('now')
    WHERE c.organization_id = ? AND c.is_active = 1
    GROUP BY c.id
    ORDER BY c.class_name
  `, [teacherId, organizationId], (err, classes) => {
    if (err) {
      console.error(" Classes fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch classes" });
    }

    // Calculate attendance percentage for each class
    const enhancedClasses = classes.map(cls => ({
      ...cls,
      attendance_percentage: cls.student_count > 0 && cls.today_marked > 0
        ? Math.round((cls.today_present / cls.today_marked) * 100)
        : 0,
      attendance_status: cls.today_marked === cls.student_count ? 'complete' :
                        cls.today_marked > 0 ? 'partial' : 'pending'
    }));

    console.log(` Fetched ${classes.length} classes for teacher: ${teacherId}`);
    res.json({ success: true, classes: enhancedClasses });
  });
});

// Enhanced get students in a class
router.get('/teacher/class/:classId/students', authenticateToken, requireTeacherMiddleware, (req, res) => {
  const { classId } = req.params;
  const teacherId = req.user.digital_id;
  const organizationId = req.user.organization_id;

  // First verify the teacher owns this class and it belongs to their organization
  req.db.get(
    "SELECT id, class_name FROM classes WHERE id = ? AND teacher_id = ? AND organization_id = ?",
    [classId, teacherId, organizationId],
    (err, classExists) => {
      if (err || !classExists) {
        return res.status(403).json({ success: false, message: "Class not found or access denied" });
      }

      // Get students with today's attendance status
      req.db.all(`
        SELECT s.*,
               ca.is_present,
               ca.marked_at,
               ca.notes as attendance_notes,
               ca.late_arrival,
               ca.early_departure
        FROM students s
        LEFT JOIN class_attendance ca ON s.id = ca.student_id
          AND ca.class_id = ?
          AND DATE(ca.date) = DATE('now')
        WHERE s.class_id = ? AND s.is_active = 1
        ORDER BY s.roll_number, s.name
      `, [classId, classId], (err, students) => {
        if (err) {
          console.error(" Students fetch error:", err);
          return res.status(500).json({ success: false, message: "Failed to fetch students" });
        }

        console.log(` Fetched ${students.length} students for class ${classId}`);
        res.json({
          success: true,
          students,
          class_info: classExists,
          total_students: students.length,
          marked_today: students.filter(s => s.is_present !== null).length,
          present_today: students.filter(s => s.is_present === 1).length
        });
      });
    }
  );
});

// Enhanced submit class attendance
router.post('/teacher/class/:classId/attendance', authenticateToken, requireTeacherMiddleware, (req, res) => {
  const { classId } = req.params;
  const { attendance, notes: classNotes } = req.body; // Array of {student_id, is_present, notes}
  const teacherId = req.user.digital_id;
  const organizationId = req.user.organization_id;

  // Verify teacher owns this class
  req.db.get(
    "SELECT id, class_name FROM classes WHERE id = ? AND teacher_id = ? AND organization_id = ?",
    [classId, teacherId, organizationId],
    (err, classExists) => {
      if (err || !classExists) {
        return res.status(403).json({ success: false, message: "Class not found or access denied" });
      }

      if (!attendance || !Array.isArray(attendance)) {
        return res.status(400).json({ success: false, message: "Invalid attendance data" });
      }

      const today = new Date().toISOString().split('T')[0];

      // Begin transaction for atomic operation
      req.db.serialize(() => {
        req.db.run("BEGIN TRANSACTION");

        // Delete existing attendance for today
        req.db.run(
          "DELETE FROM class_attendance WHERE class_id = ? AND date = ?",
          [classId, today],
          function(err) {
            if (err) {
              req.db.run("ROLLBACK");
              return res.status(500).json({ success: false, message: "Failed to clear existing attendance" });
            }
          }
        );

        // Insert new attendance records
        const stmt = req.db.prepare(`
          INSERT INTO class_attendance (class_id, student_id, date, is_present, marked_by, notes, late_arrival, early_departure)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        let errorOccurred = false;
        let processedCount = 0;

        attendance.forEach((record, index) => {
          stmt.run([
            classId,
            record.student_id,
            today,
            record.is_present ? 1 : 0,
            teacherId,
            record.notes || classNotes || null,
            record.late_arrival || 0,
            record.early_departure || 0
          ], (err) => {
            if (err) {
              console.error(" Attendance insert error:", err);
              errorOccurred = true;
            }
            
            processedCount++;
            
            // Check if all records processed
            if (processedCount === attendance.length) {
              stmt.finalize((err) => {
                if (err || errorOccurred) {
                  req.db.run("ROLLBACK");
                  return res.status(500).json({ success: false, message: "Failed to save attendance" });
                }

                req.db.run("COMMIT", (err) => {
                  if (err) {
                    return res.status(500).json({ success: false, message: "Failed to commit attendance" });
                  }

                  const presentCount = attendance.filter(r => r.is_present).length;
                  const totalCount = attendance.length;

                  console.log(` Attendance saved for class ${classId}: ${presentCount}/${totalCount} present`);

                  res.json({
                    success: true,
                    message: `Attendance saved successfully`,
                    stats: {
                      total_students: totalCount,
                      present: presentCount,
                      absent: totalCount - presentCount,
                      attendance_percentage: Math.round((presentCount / totalCount) * 100)
                    }
                  });
                });
              });
            }
          });
        });
      });
    }
  );
});

// ========== FACULTY MANAGEMENT ROUTES ==========

// Get all faculty members
router.get('/', authenticateToken, requireEducationOrg, facultyController.getAllFaculty);

// Get faculty by ID
router.get('/:facultyId', authenticateToken, requireEducationOrg, facultyController.getFacultyById);

// Create new faculty member
router.post('/',
  authenticateToken,
  requireEducationOrg,
  [
    check('name').notEmpty().withMessage('Name is required'),
    check('email').isEmail().withMessage('Valid email is required'),
    check('department_id').optional().isNumeric().withMessage('Department ID must be numeric'),
    check('organization_id').optional().isNumeric().withMessage('Organization ID must be numeric'),
    check('position').optional().notEmpty().withMessage('Position cannot be empty if provided'),
    check('specialization').optional().notEmpty().withMessage('Specialization cannot be empty if provided')
  ],
  facultyController.createFaculty
);

// Update faculty member
router.put('/:facultyId',
  authenticateToken,
  requireEducationOrg,
  [
    check('name').optional().notEmpty().withMessage('Name cannot be empty if provided'),
    check('email').optional().isEmail().withMessage('Valid email is required if provided'),
    check('department_id').optional().isNumeric().withMessage('Department ID must be numeric'),
    check('position').optional().notEmpty().withMessage('Position cannot be empty if provided'),
    check('specialization').optional().notEmpty().withMessage('Specialization cannot be empty if provided'),
    check('is_active').optional().isBoolean().withMessage('is_active must be a boolean value')
  ],
  facultyController.updateFaculty
);

// Associate faculty with class
router.post('/:facultyId/classes/:classId',
  authenticateToken,
  requireEducationOrg,
  [
    check('role').optional().isIn(['instructor', 'assistant', 'guest']).withMessage('Role must be instructor, assistant, or guest'),
    check('is_primary').optional().isBoolean().withMessage('is_primary must be a boolean value')
  ],
  facultyController.associateWithClass
);

// Remove faculty from class
router.delete('/:facultyId/classes/:classId',
  authenticateToken,
  requireEducationOrg,
  facultyController.removeFromClass
);

// Get classes taught by faculty
router.get('/:facultyId/classes',
  authenticateToken,
  requireEducationOrg,
  facultyController.getFacultyClasses
);

// Get faculty members for a class
router.get('/classes/:classId',
  authenticateToken,
  requireEducationOrg,
  facultyController.getClassFaculty
);

// Get faculty statistics
router.get('/:facultyId/statistics',
  authenticateToken,
  requireEducationOrg,
  facultyController.getFacultyStatistics
);

// ========== CLASS SCHEDULE ROUTES (weekly recurring schedule per teacher) ==========
// Backs frontend/pages/class-schedule.html. Uses the class_schedules table via
// the ClassSchedule model. Gated by requireTeacherMiddleware (education-only,
// teachers or admins) and ownership checks (a teacher only touches own rows).

const SCHEDULE_ADMIN_ROLES = ['admin', 'administrator', 'system administrator', 'super admin'];
const TIME_FORMAT_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function isScheduleAdmin(user) {
  return SCHEDULE_ADMIN_ROLES.some((r) => String(user.role || '').toLowerCase().includes(r));
}

// Classes the current teacher teaches -> dropdown source for the schedule form
router.get('/teacher/class-options', authenticateToken, requireTeacherMiddleware, (req, res) => {
  const teacherId = req.user.digital_id;
  const organizationId = req.user.organization_id;

  req.db.all(`
    SELECT DISTINCT c.id, c.class_name, s.subject_name AS subject
    FROM classes c
    JOIN class_subjects cs ON c.id = cs.class_id AND cs.teacher_id = ? AND cs.is_active = 1
    LEFT JOIN subjects s ON cs.subject_id = s.id
    WHERE c.organization_id = ? AND c.is_active = 1
    ORDER BY c.class_name
  `, [teacherId, organizationId], (err, classes) => {
    if (err) {
      console.error(" Class options fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch classes" });
    }
    res.json({ success: true, classes });
  });
});

// All schedules for the current teacher
router.get('/teacher/schedules', authenticateToken, requireTeacherMiddleware, async (req, res) => {
  try {
    const schedules = await ClassSchedule.findByTeacherId(req.user.digital_id, { active: true });
    res.json({ success: true, schedules });
  } catch (err) {
    console.error(" Schedules fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch schedules" });
  }
});

// Create a schedule; overlapping own schedule -> 409 { conflicts: [...] }
router.post('/teacher/schedules', authenticateToken, requireTeacherMiddleware, async (req, res) => {
  try {
    const { class_id, day_of_week, start_time, end_time,
            room_number = null, recurring = 1, start_date, end_date = null, notes = null } = req.body;

    if (class_id === undefined || class_id === '' || day_of_week === undefined ||
        !start_time || !end_time || !start_date) {
      return res.status(400).json({ success: false, message: "class_id, day_of_week, start_time, end_time and start_date are required" });
    }
    const day = parseInt(day_of_week, 10);
    if (isNaN(day) || day < 0 || day > 6) {
      return res.status(400).json({ success: false, message: "day_of_week must be between 0 (Sunday) and 6 (Saturday)" });
    }
    if (!TIME_FORMAT_RE.test(start_time) || !TIME_FORMAT_RE.test(end_time)) {
      return res.status(400).json({ success: false, message: "start_time and end_time must be valid HH:MM values" });
    }
    if (start_time >= end_time) {
      return res.status(400).json({ success: false, message: "start_time must be earlier than end_time" });
    }

    // The class must be one the teacher actually teaches, in their organization
    req.db.get(`
      SELECT c.id FROM classes c
      JOIN class_subjects cs ON c.id = cs.class_id AND cs.teacher_id = ? AND cs.is_active = 1
      WHERE c.id = ? AND c.organization_id = ? AND c.is_active = 1
    `, [req.user.digital_id, class_id, req.user.organization_id], async (err, own) => {
      if (err) {
        console.error(" Schedule class check error:", err);
        return res.status(500).json({ success: false, message: "Failed to verify class" });
      }
      if (!own) {
        return res.status(403).json({ success: false, message: "You can only schedule classes you teach" });
      }
      try {
        const conflicts = await ClassSchedule.checkConflicts(req.user.digital_id, start_time, end_time, day);
        if (conflicts && conflicts.length > 0) {
          return res.status(409).json({ success: false, message: "Schedule conflict detected", conflicts });
        }
        const created = await ClassSchedule.create({
          class_id, teacher_id: req.user.digital_id, day_of_week: day,
          start_time, end_time, room_number,
          recurring: parseInt(recurring, 10) === 0 ? 0 : 1,
          start_date, end_date, is_active: 1, notes
        });
        res.status(201).json({ success: true, message: "Schedule created successfully", schedule: created });
      } catch (createErr) {
        console.error(" Schedule create error:", createErr);
        res.status(500).json({ success: false, message: "Failed to create schedule" });
      }
    });
  } catch (err) {
    console.error(" Schedule create error:", err);
    res.status(500).json({ success: false, message: "Failed to create schedule" });
  }
});

// Update a schedule (owner teacher or education admin); conflict-aware
router.put('/teacher/schedules/:id', authenticateToken, requireTeacherMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid schedule id" });
    }
    const existing = await ClassSchedule.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Schedule not found" });
    }
    if (!isScheduleAdmin(req.user) && existing.teacher_id !== req.user.digital_id) {
      return res.status(403).json({ success: false, message: "You can only edit your own schedules" });
    }

    const { class_id, day_of_week, start_time, end_time,
            room_number, recurring, start_date, end_date, notes, is_active } = req.body;
    const updates = {};
    if (class_id !== undefined && class_id !== '') updates.class_id = class_id;
    if (start_date !== undefined && start_date !== '') updates.start_date = start_date;
    if (end_date !== undefined) updates.end_date = end_date;
    if (room_number !== undefined) updates.room_number = room_number;
    if (notes !== undefined) updates.notes = notes;
    if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;
    if (recurring !== undefined) updates.recurring = parseInt(recurring, 10) === 0 ? 0 : 1;

    const newStart = start_time !== undefined ? start_time : existing.start_time;
    const newEnd = end_time !== undefined ? end_time : existing.end_time;
    const newDay = day_of_week !== undefined ? parseInt(day_of_week, 10) : existing.day_of_week;

    if (day_of_week !== undefined) {
      if (isNaN(newDay) || newDay < 0 || newDay > 6) {
        return res.status(400).json({ success: false, message: "day_of_week must be between 0 (Sunday) and 6 (Saturday)" });
      }
      updates.day_of_week = newDay;
    }
    if (start_time !== undefined) {
      if (!TIME_FORMAT_RE.test(newStart)) {
        return res.status(400).json({ success: false, message: "start_time must be a valid HH:MM value" });
      }
      updates.start_time = newStart;
    }
    if (end_time !== undefined) {
      if (!TIME_FORMAT_RE.test(newEnd)) {
        return res.status(400).json({ success: false, message: "end_time must be a valid HH:MM value" });
      }
      updates.end_time = newEnd;
    }
    if (newStart >= newEnd) {
      return res.status(400).json({ success: false, message: "start_time must be earlier than end_time" });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: "No changes provided" });
    }

    // Re-check conflicts whenever timing moves, excluding this row itself
    if (updates.day_of_week !== undefined || updates.start_time !== undefined || updates.end_time !== undefined) {
      const conflicts = await ClassSchedule.checkConflicts(existing.teacher_id, newStart, newEnd, newDay, id);
      if (conflicts && conflicts.length > 0) {
        return res.status(409).json({ success: false, message: "Schedule conflict detected", conflicts });
      }
    }

    updates.updated_at = new Date().toISOString();
    const result = await ClassSchedule.update(id, updates);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: "Schedule not found or no changes made" });
    }
    res.json({ success: true, message: "Schedule updated successfully", changes: result.changes });
  } catch (err) {
    console.error(" Schedule update error:", err);
    res.status(500).json({ success: false, message: "Failed to update schedule" });
  }
});

// Delete a schedule (owner teacher or education admin)
router.delete('/teacher/schedules/:id', authenticateToken, requireTeacherMiddleware, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "Invalid schedule id" });
    }
    const existing = await ClassSchedule.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Schedule not found" });
    }
    if (!isScheduleAdmin(req.user) && existing.teacher_id !== req.user.digital_id) {
      return res.status(403).json({ success: false, message: "You can only delete your own schedules" });
    }

    const result = await ClassSchedule.delete(id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: "Schedule not found or already deleted" });
    }
    res.json({ success: true, message: "Schedule deleted successfully" });
  } catch (err) {
    console.error(" Schedule delete error:", err);
    res.status(500).json({ success: false, message: "Failed to delete schedule" });
  }
});

module.exports = router;
