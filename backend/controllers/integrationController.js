// integrationController.js - Google Classroom and Teach Us App Integration
const { google } = require('googleapis');
const axios = require('axios');

// Add this import at the top:
const config = require('../config/env.js'); // Adjust path as needed

// Update Google OAuth2 Configuration:
const googleOAuth2Client = new google.auth.OAuth2(
  config.GOOGLE_CLIENT_ID,
  config.GOOGLE_CLIENT_SECRET,
  config.GOOGLE_REDIRECT_URI
);

// Update Teach Us App Configuration:
const TEACHUS_CONFIG = {
  apiKey: config.TEACHUS_API_KEY,
  apiSecret: config.TEACHUS_API_SECRET,
  endpoint: config.TEACHUS_ENDPOINT
};


// In-memory token storage (In production, use database)
const tokenStore = {};

// ========== GOOGLE CLASSROOM INTEGRATION ==========

// Generate Google OAuth URL
const generateGoogleAuthUrl = (req, res) => {
  try {
    const scopes = [
      'https://www.googleapis.com/auth/classroom.courses.readonly',
      'https://www.googleapis.com/auth/classroom.rosters.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ];

    const authUrl = googleOAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: req.user.digital_id, // Pass user ID for later identification
      prompt: 'consent'
    });

    console.log(` Generated Google OAuth URL for user: ${req.user.digital_id}`);
    res.json({
      success: true,
      auth_url: authUrl,
      message: "Click the URL to authorize Google Classroom access"
    });

  } catch (error) {
    console.error('❌ Google Auth URL generation error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to generate Google authorization URL"
    });
  }
};

// Handle Google OAuth Callback
const handleGoogleCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    const userId = state; // User ID from state parameter

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Authorization code not received"
      });
    }

    // Exchange code for tokens
    const { tokens } = await googleOAuth2Client.getToken(code);
    googleOAuth2Client.setCredentials(tokens);

    // Store tokens (in production, store in database)
    tokenStore[userId] = {
      tokens,
      timestamp: Date.now(),
      expires_at: tokens.expiry_date
    };

    // Get user profile
    const oauth2 = google.oauth2({ version: 'v2', auth: googleOAuth2Client });
    const profile = await oauth2.userinfo.get();

    console.log(` Google OAuth successful for user: ${userId}`);

    // Redirect to frontend success page
    res.redirect(`/pages/integrations.html?google_auth=success&user=${profile.data.name}`);

  } catch (error) {
    console.error('❌ Google OAuth callback error:', error);
    res.redirect('/pages/integrations.html?google_auth=error');
  }
};

// Sync Google Classroom courses
const syncGoogleClassrooms = async (req, res) => {
  try {
    const userId = req.user.digital_id;
    const organizationId = req.user.organization_id;

    // Check if user has valid tokens
    const userTokens = tokenStore[userId];
    if (!userTokens || userTokens.expires_at < Date.now()) {
      return res.status(401).json({
        success: false,
        message: "Google Classroom authorization expired. Please re-authorize.",
        requires_auth: true
      });
    }

    // Set credentials
    googleOAuth2Client.setCredentials(userTokens.tokens);
    const classroom = google.classroom({ version: 'v1', auth: googleOAuth2Client });

    // Fetch courses
    const coursesResponse = await classroom.courses.list({
      teacherId: 'me',
      courseStates: ['ACTIVE']
    });

    const courses = coursesResponse.data.courses || [];
    const syncResults = [];

    // Process each course
    for (const course of courses) {
      try {
        // Check if course already exists in our system
        const existingClass = await new Promise((resolve, reject) => {
          req.db.get(
            "SELECT id FROM classes WHERE organization_id = ? AND class_code = ?",
            [organizationId, `GC_${course.id}`],
            (err, row) => {
              if (err) reject(err);
              resolve(row);
            }
          );
        });

        let classId;

        if (!existingClass) {
          // Create new class
          classId = await new Promise((resolve, reject) => {
            req.db.run(`
              INSERT INTO classes (organization_id, class_code, class_name, subject, teacher_id, 
                                   room_number, semester, academic_year, is_active)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              organizationId,
              `GC_${course.id}`,
              course.name,
              course.section || 'Google Classroom',
              userId,
              course.room || 'Online',
              course.descriptionHeading || 'Current',
              new Date().getFullYear().toString(),
              1
            ], function(err) {
              if (err) reject(err);
              resolve(this.lastID);
            });
          });
        } else {
          classId = existingClass.id;
        }

        // Fetch and sync students
        const studentsResponse = await classroom.courses.students.list({
          courseId: course.id
        });

        const students = studentsResponse.data.students || [];
        let studentsAdded = 0;

        for (const student of students) {
          const studentProfile = student.profile;
          
          // Check if student exists
          const existingStudent = await new Promise((resolve, reject) => {
            req.db.get(
              "SELECT id FROM students WHERE email = ? AND organization_id = ?",
              [studentProfile.emailAddress, organizationId],
              (err, row) => {
                if (err) reject(err);
                resolve(row);
              }
            );
          });

          if (!existingStudent) {
            // Add new student
            await new Promise((resolve, reject) => {
              req.db.run(`
                INSERT INTO students (student_id, name, email, class_id, organization_id, roll_number, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `, [
                `GC_${studentProfile.id}`,
                studentProfile.name.fullName,
                studentProfile.emailAddress,
                classId,
                organizationId,
                studentProfile.id.substr(-6), // Last 6 digits as roll number
                1
              ], function(err) {
                if (err) reject(err);
                resolve();
              });
            });
            studentsAdded++;
          }
        }

        syncResults.push({
          course_id: course.id,
          course_name: course.name,
          students_count: students.length,
          students_added: studentsAdded,
          class_id: classId,
          status: 'synced'
        });

      } catch (courseError) {
        console.error(`❌ Error syncing course ${course.name}:`, courseError);
        syncResults.push({
          course_id: course.id,
          course_name: course.name,
          status: 'error',
          error: courseError.message
        });
      }
    }

    console.log(` Google Classroom sync completed for user: ${userId}`);
    res.json({
      success: true,
      message: `Synced ${courses.length} courses from Google Classroom`,
      courses_synced: courses.length,
      sync_results: syncResults
    });

  } catch (error) {
    console.error('❌ Google Classroom sync error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to sync Google Classroom data",
      error: error.message
    });
  }
};

// Get Google Classroom connection status
const getGoogleConnectionStatus = (req, res) => {
  const userId = req.user.digital_id;
  const userTokens = tokenStore[userId];

  if (!userTokens) {
    return res.json({
      success: true,
      connected: false,
      message: "Not connected to Google Classroom"
    });
  }

  const isExpired = userTokens.expires_at < Date.now();

  res.json({
    success: true,
    connected: !isExpired,
    expires_at: new Date(userTokens.expires_at).toISOString(),
    message: isExpired ? "Google Classroom authorization expired" : "Connected to Google Classroom"
  });
};

// ========== TEACH US APP INTEGRATION ==========

// Test Teach Us API connection
const testTeachUsConnection = async (req, res) => {
  try {
    if (!TEACHUS_CONFIG.apiKey || !TEACHUS_CONFIG.apiSecret) {
      return res.status(400).json({
        success: false,
        message: "Teach Us API credentials not configured"
      });
    }

    // Test API call
    const response = await axios.get(`${TEACHUS_CONFIG.endpoint}/status`, {
      headers: {
        'Authorization': `Bearer ${TEACHUS_CONFIG.apiKey}`,
        'X-API-Secret': TEACHUS_CONFIG.apiSecret,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    console.log(` Teach Us API connection test successful`);
    res.json({
      success: true,
      message: "Teach Us API connection successful",
      api_version: response.data.version || 'unknown',
      status: response.data.status || 'active'
    });

  } catch (error) {
    console.error('❌ Teach Us API connection test failed:', error);
    
    let errorMessage = "Failed to connect to Teach Us API";
    if (error.code === 'ENOTFOUND') {
      errorMessage = "Teach Us API endpoint not reachable";
    } else if (error.response?.status === 401) {
      errorMessage = "Invalid Teach Us API credentials";
    } else if (error.response?.status === 403) {
      errorMessage = "Access denied to Teach Us API";
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error_code: error.code || 'API_ERROR'
    });
  }
};

// Push attendance to Teach Us
const pushAttendanceToTeachUs = async (req, res) => {
  try {
    const { class_id, date, attendance_data } = req.body;
    const userId = req.user.digital_id;

    if (!class_id || !date || !attendance_data) {
      return res.status(400).json({
        success: false,
        message: "Class ID, date, and attendance data are required"
      });
    }

    // Get class information
    const classInfo = await new Promise((resolve, reject) => {
      req.db.get(
        "SELECT * FROM classes WHERE id = ? AND organization_id = ?",
        [class_id, req.user.organization_id],
        (err, row) => {
          if (err) reject(err);
          resolve(row);
        }
      );
    });

    if (!classInfo) {
      return res.status(404).json({
        success: false,
        message: "Class not found"
      });
    }

    // Format attendance data for Teach Us API
    const teachUsPayload = {
      session: {
        class_id: classInfo.class_code,
        class_name: classInfo.class_name,
        date: date,
        teacher_id: userId,
        organization_id: req.user.organization_id
      },
      attendance: attendance_data.map(record => ({
        student_id: record.student_id,
        student_name: record.student_name,
        is_present: record.is_present,
        timestamp: record.timestamp || new Date().toISOString(),
        notes: record.notes || ''
      }))
    };

    // Push to Teach Us API
    const response = await axios.post(`${TEACHUS_CONFIG.endpoint}/attendance/sessions`, teachUsPayload, {
      headers: {
        'Authorization': `Bearer ${TEACHUS_CONFIG.apiKey}`,
        'X-API-Secret': TEACHUS_CONFIG.apiSecret,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    console.log(` Attendance pushed to Teach Us for class: ${classInfo.class_name}`);
    res.json({
      success: true,
      message: "Attendance successfully pushed to Teach Us",
      teachus_session_id: response.data.session_id,
      students_processed: attendance_data.length
    });

  } catch (error) {
    console.error('❌ Teach Us push attendance error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to push attendance to Teach Us",
      error: error.response?.data?.message || error.message
    });
  }
};

// Pull attendance from Teach Us
const pullAttendanceFromTeachUs = async (req, res) => {
  try {
    const { date, class_code } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date parameter is required"
      });
    }

    let url = `${TEACHUS_CONFIG.endpoint}/attendance/sessions?date=${date}`;
    if (class_code) {
      url += `&class_code=${class_code}`;
    }

    // Pull from Teach Us API
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${TEACHUS_CONFIG.apiKey}`,
        'X-API-Secret': TEACHUS_CONFIG.apiSecret,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const sessions = response.data.sessions || [];
    const syncResults = [];

    // Process each session
    for (const session of sessions) {
      try {
        // Find corresponding class in our system
        const localClass = await new Promise((resolve, reject) => {
          req.db.get(
            "SELECT id FROM classes WHERE class_code = ? AND organization_id = ?",
            [session.class_code, req.user.organization_id],
            (err, row) => {
              if (err) reject(err);
              resolve(row);
            }
          );
        });

        if (!localClass) {
          syncResults.push({
            class_code: session.class_code,
            status: 'skipped',
            reason: 'Class not found in local system'
          });
          continue;
        }

        // Sync attendance records
        let recordsProcessed = 0;
        for (const attendance of session.attendance) {
          // Find student
          const student = await new Promise((resolve, reject) => {
            req.db.get(
              "SELECT id FROM students WHERE student_id = ? AND class_id = ?",
              [attendance.student_id, localClass.id],
              (err, row) => {
                if (err) reject(err);
                resolve(row);
              }
            );
          });

          if (student) {
            // Insert or update attendance
            await new Promise((resolve, reject) => {
              req.db.run(`
                INSERT OR REPLACE INTO class_attendance 
                (class_id, student_id, date, is_present, marked_by, notes, marked_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `, [
                localClass.id,
                student.id,
                date,
                attendance.is_present ? 1 : 0,
                req.user.digital_id,
                `Synced from Teach Us: ${attendance.notes || ''}`,
                attendance.timestamp || new Date().toISOString()
              ], function(err) {
                if (err) reject(err);
                resolve();
              });
            });
            recordsProcessed++;
          }
        }

        syncResults.push({
          class_code: session.class_code,
          status: 'synced',
          records_processed: recordsProcessed,
          total_records: session.attendance.length
        });

      } catch (sessionError) {
        console.error(`❌ Error syncing session ${session.class_code}:`, sessionError);
        syncResults.push({
          class_code: session.class_code,
          status: 'error',
          error: sessionError.message
        });
      }
    }

    console.log(` Attendance pulled from Teach Us for date: ${date}`);
    res.json({
      success: true,
      message: `Pulled ${sessions.length} attendance sessions from Teach Us`,
      sessions_processed: sessions.length,
      sync_results: syncResults
    });

  } catch (error) {
    console.error('❌ Teach Us pull attendance error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to pull attendance from Teach Us",
      error: error.response?.data?.message || error.message
    });
  }
};

// Get integration statistics
const getIntegrationStats = async (req, res) => {
  try {
    const organizationId = req.user.organization_id;

    // Get Google Classroom sync stats
    const googleStats = await new Promise((resolve, reject) => {
      req.db.get(`
        SELECT 
          COUNT(*) as total_classes,
          COUNT(CASE WHEN class_code LIKE 'GC_%' THEN 1 END) as google_classes,
          (SELECT COUNT(*) FROM students WHERE organization_id = ? AND student_id LIKE 'GC_%') as google_students
        FROM classes WHERE organization_id = ?
      `, [organizationId, organizationId], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });

    // Get recent sync activity
    const recentActivity = await new Promise((resolve, reject) => {
      req.db.all(`
        SELECT 
          class_name,
          created_at,
          (SELECT COUNT(*) FROM students WHERE class_id = classes.id) as student_count
        FROM classes 
        WHERE organization_id = ? AND class_code LIKE 'GC_%'
        ORDER BY created_at DESC LIMIT 5
      `, [organizationId], (err, rows) => {
        if (err) reject(err);
        resolve(rows);
      });
    });

    const userId = req.user.digital_id;
    const googleConnected = tokenStore[userId] && tokenStore[userId].expires_at > Date.now();

    res.json({
      success: true,
      google_classroom: {
        connected: googleConnected,
        total_classes: googleStats.total_classes,
        synced_classes: googleStats.google_classes,
        synced_students: googleStats.google_students,
        last_sync: googleConnected ? 'Connected' : 'Not connected'
      },
      teach_us: {
        configured: !!(TEACHUS_CONFIG.apiKey && TEACHUS_CONFIG.apiSecret),
        endpoint: TEACHUS_CONFIG.endpoint
      },
      recent_activity: recentActivity
    });

  } catch (error) {
    console.error('❌ Integration stats error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch integration statistics",
      error: error.message
    });
  }
};

module.exports = {
  // Google Classroom
  generateGoogleAuthUrl,
  handleGoogleCallback,
  syncGoogleClassrooms,
  getGoogleConnectionStatus,
  
  // Teach Us App
  testTeachUsConnection,
  pushAttendanceToTeachUs,
  pullAttendanceFromTeachUs,
  
  // General
  getIntegrationStats
};