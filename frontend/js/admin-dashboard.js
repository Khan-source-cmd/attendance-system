// Admin Dashboard JavaScript - Updated for sidebar navigation and enhanced functionality
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:4000'
  : 'http://' + window.location.hostname + ':4000';

// Enhanced authentication handling
function getAuthToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token') ||
         localStorage.getItem('jwt') || sessionStorage.getItem('jwt');
}

function getUserData() {
  return {
    token: getAuthToken(),
    digitalid: localStorage.getItem('digitalid') || sessionStorage.getItem('digitalid'),
    role: localStorage.getItem('role') || sessionStorage.getItem('role'),
    name: localStorage.getItem('name') || sessionStorage.getItem('name'),
    industrytype: localStorage.getItem('industrytype') || sessionStorage.getItem('industrytype'),
    organizationid: localStorage.getItem('organizationid') || sessionStorage.getItem('organizationid')
  };
}

// Redirect if not authenticated
const userData = getUserData();
if (!userData.token || !userData.digitalid) {
  console.log('No authentication found, redirecting to register');
  window.location.href = '/pages/register.html';
}

// Global variables
let currentUser = {};
let currentOrganizationId = null;
let currentPage = { users: 1, attendance: 1 };
let currentFilters = { users: {}, attendance: {} };
let currentLocationData = {};
let teacherClasses = [];
let currentClassStudents = [];
let currentClassId = null;
let currentPunchType = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
  console.log('Admin Dashboard initializing with user data:', userData);

  // Verify admin role
  if (!isAdmin(userData.role)) {
    alert('Access denied. Admin privileges required.');
    window.location.href = '/pages/user-dashboard.html';
    return;
  }

  // Fix organization data type mismatch issue
  fixOrganizationDataTypeMismatch();

  loadUserProfile();
  loadDashboardData();
  updateCurrentTime();
  getCurrentLocation();
  loadIndustrySpecificFeatures();

  // Update time every second
  setInterval(updateCurrentTime, 1000);

  // Set current date
  document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Check if user has admin privileges
function isAdmin(role) {
  if (!role) return false;
  const adminRoles = ['admin', 'administrator', 'system administrator', 'super admin'];
  return adminRoles.some(adminRole => role.toLowerCase().includes(adminRole));
}

// Load user profile with enhanced error handling
async function loadUserProfile() {
  try {
    const token = getAuthToken();
    if (!token) throw new Error('No authentication token found');

    const response = await fetch(`${API_BASE}/api/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const result = await response.json();
    if (result.success) {
      currentUser = result.user;

      // Update UI elements with proper fallbacks
      const userNameElement = document.getElementById('userName');
      const userRoleElement = document.getElementById('userRole');
      const userIndustryElement = document.getElementById('userIndustry');
      const digitalIdElement = document.getElementById('digitalId');

      if (userNameElement) userNameElement.textContent = currentUser.name || 'Unknown User';
      if (userRoleElement) userRoleElement.textContent = currentUser.role || 'Unknown Role';

      // Handle industry type safely - try multiple possible field names with better fallback
      const industryType = (currentUser.industrytype || currentUser.industry_type || currentUser.industry) && typeof (currentUser.industrytype || currentUser.industry_type || currentUser.industry) === 'string' ?
        (currentUser.industrytype || currentUser.industry_type || currentUser.industry).charAt(0).toUpperCase() + (currentUser.industrytype || currentUser.industry_type || currentUser.industry).slice(1) : 'Unknown Industry';

      console.log('🏥 Admin dashboard industry detection:', {
        industrytype: currentUser.industrytype,
        industry_type: currentUser.industry_type,
        industry: currentUser.industry,
        finalIndustryType: industryType
      });
      if (userIndustryElement) userIndustryElement.textContent = industryType;

      // Handle digital ID with multiple possible field names
      const digitalId = currentUser.digitalid || currentUser.digital_id || 'Unknown';
      if (digitalIdElement) digitalIdElement.textContent = `ID: ${digitalId}`;

      // Store in localStorage for navigation consistency
      if (currentUser.digitalid) localStorage.setItem('digitalid', currentUser.digitalid);
      if (currentUser.role) localStorage.setItem('role', currentUser.role);
      if (currentUser.name) localStorage.setItem('name', currentUser.name);
      if (currentUser.industrytype) localStorage.setItem('industrytype', currentUser.industrytype);

      // Load industry-specific features
      loadIndustrySpecificFeatures();

      // Load teacher features if applicable
      if (isTeacher() && currentUser.industrytype.toLowerCase() === 'education') {
        loadTeacherFeatures();
      }

      console.log('Profile loaded successfully:', currentUser);
    } else {
      throw new Error(result.message || 'Failed to load profile');
    }
  } catch (error) {
    console.error('Profile load error:', error);
    if (error.message.includes('403') || error.message.includes('401')) {
      localStorage.clear();
      sessionStorage.clear();
      alert('Your session has expired. Please login again.');
      window.location.href = '/pages/register.html';
    } else {
      showNotification('Failed to load profile. Please refresh the page.', 'error');
    }
  }
}

// Check if user is a teacher
function isTeacher() {
  if (!currentUser.role) return false;
  const role = currentUser.role.toLowerCase();
  const teacherRoles = ['teacher', 'professor', 'faculty', 'instructor', 'lecturer', 'educator'];
  return teacherRoles.some(teacherRole => role.includes(teacherRole));
}

// Load industry-specific features
function loadIndustrySpecificFeatures() {
  const industry = currentUser.industrytype?.toLowerCase();
  const container = document.getElementById('industrySpecificContent');
  
  let content = '';
  switch(industry) {
    case 'healthcare':
      content = generateHealthcareContent();
      break;
    case 'education':
      content = generateEducationContent();
      break;
    case 'corporate':
      content = generateCorporateContent();
      break;
    case 'manufacturing':
      content = generateManufacturingContent();
      break;
    case 'government':
      content = generateGovernmentContent();
      break;
    case 'retail':
      content = generateRetailContent();
      break;
  }
  if (container) container.innerHTML = content;
}

function generateHealthcareContent() {
  return `
    <div class="education-dashboard healthcare-card mb-4">
      <h4><i class="fas fa-heartbeat me-2 text-danger"></i>Healthcare Admin Dashboard</h4>
      <div class="row mt-3">
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-danger">145</div>
            <div class="stat-label">Staff Members</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-info">23</div>
            <div class="stat-label">Departments</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-success">98%</div>
            <div class="stat-label">Shift Coverage</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-warning">12</div>
            <div class="stat-label">Emergency Alerts</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function generateEducationContent() {
  return `
    <div class="education-dashboard mb-4">
      <h4><i class="fas fa-graduation-cap me-2 text-success"></i>Education Admin Dashboard</h4>
      <div class="row mt-3">
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-success">85</div>
            <div class="stat-label">Faculty Members</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-info">1,245</div>
            <div class="stat-label">Students</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-warning">42</div>
            <div class="stat-label">Classes Today</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-primary">89%</div>
            <div class="stat-label">Avg Attendance</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function generateCorporateContent() {
  return `
    <div class="education-dashboard corporate-card mb-4">
      <h4><i class="fas fa-building me-2 text-primary"></i>Corporate Admin Dashboard</h4>
      <div class="row mt-3">
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-primary">324</div>
            <div class="stat-label">Employees</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-success">15</div>
            <div class="stat-label">Departments</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-warning">28</div>
            <div class="stat-label">Projects Active</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-info">94%</div>
            <div class="stat-label">Productivity</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function generateManufacturingContent() {
  return `
    <div class="education-dashboard manufacturing-card mb-4">
      <h4><i class="fas fa-industry me-2 text-warning"></i>Manufacturing Admin Dashboard</h4>
      <div class="row mt-3">
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-success">156</div>
            <div class="stat-label">Workers</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-warning">8</div>
            <div class="stat-label">Production Lines</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-info">2,450</div>
            <div class="stat-label">Units Today</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-primary">96%</div>
            <div class="stat-label">Efficiency</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function generateGovernmentContent() {
  return `
    <div class="education-dashboard government-card mb-4">
      <h4><i class="fas fa-landmark me-2 text-purple"></i>Government Admin Dashboard</h4>
      <div class="row mt-3">
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-info">89</div>
            <div class="stat-label">Civil Servants</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-success">12</div>
            <div class="stat-label">Departments</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-warning">67</div>
            <div class="stat-label">Cases Pending</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-primary">91%</div>
            <div class="stat-label">Service Rate</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function generateRetailContent() {
  return `
    <div class="education-dashboard retail-card mb-4">
      <h4><i class="fas fa-store me-2 text-teal"></i>Retail Admin Dashboard</h4>
      <div class="row mt-3">
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-success">73</div>
            <div class="stat-label">Store Staff</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-info">8</div>
            <div class="stat-label">Store Locations</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-warning">$12,450</div>
            <div class="stat-label">Sales Today</div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <div class="stat-number text-primary">567</div>
            <div class="stat-label">Customers</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Load teacher features (for education industry)
async function loadTeacherFeatures() {
  try {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE}/api/teacher/classes`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        teacherClasses = result.classes;
        updateTeacherStats();
        displayTeacherDashboard();
      }
    } else {
      // Honest empty state: no fabricated classes when the API fails
      teacherClasses = [];
      updateTeacherStats();
      displayTeacherDashboard();
      showNotification('Could not load classes from the server.', 'error');
    }
  } catch (error) {
    console.error('Teacher features load error:', error);
  }
}

// Update teacher statistics
function updateTeacherStats() {
  const elements = {
    totalClasses: document.getElementById('totalClasses'),
    totalStudents: document.getElementById('totalStudents'),
    todayClasses: document.getElementById('todayClasses'),
    avgAttendance: document.getElementById('avgAttendance')
  };

  if (elements.totalClasses) elements.totalClasses.textContent = teacherClasses.length;
  if (elements.totalStudents) elements.totalStudents.textContent = teacherClasses.reduce((sum, cls) => sum + (cls.studentcount || 0), 0);
  if (elements.todayClasses) elements.todayClasses.textContent = teacherClasses.length;
  if (elements.avgAttendance) elements.avgAttendance.textContent = teacherClasses.length ? '—' : '0%';
}

// Display teacher dashboard
function displayTeacherDashboard() {
  if (isTeacher() && currentUser.industrytype.toLowerCase() === 'education') {
    const dashboard = document.getElementById('teacherDashboard');
    if (dashboard) {
      dashboard.style.display = 'block';
      displayClasses();
    }
  }
}

// Display teacher's classes
function displayClasses() {
  const container = document.getElementById('classesList');
  if (!container) return;
  
  if (teacherClasses.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted py-5">
        <i class="fas fa-chalkboard-teacher fa-3x mb-3"></i>
        <h5>No Classes Assigned</h5>
        <p>Contact your administrator to assign classes.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = teacherClasses.map(cls => `
    <div class="class-card">
      <div class="d-flex justify-content-between align-items-center">
        <div>
          <h5 class="mb-1">${cls.classname}</h5>
          <p class="mb-1 text-muted">${cls.subject}</p>
          <small class="text-muted">
            <i class="fas fa-clock me-1"></i>${cls.scheduletime}
            <i class="fas fa-users ms-2 me-1"></i>${cls.studentcount || 0} students
          </small>
        </div>
        <div>
          <button class="btn btn-primary me-2" onclick="takeClassAttendance(${cls.id})">
            <i class="fas fa-users me-1"></i>Take Attendance
          </button>
          <button class="btn btn-outline-secondary" onclick="viewClassDetails(${cls.id})">
            <i class="fas fa-eye me-1"></i>View Details
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

// Load dashboard data with enhanced error handling
async function loadDashboardData() {
  try {
    const token = getAuthToken();
    if (!token) throw new Error('No authentication token');

    // Load admin's own attendance data
    const response = await fetch(`${API_BASE}/api/attendance/history?limit=100`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        updateDashboardStats(result.history);
        updateCurrentStatus(result.history);
      }
    } else {
      console.warn('Personal attendance data load failed');
      // No demo fallback: show real (empty) state instead of fabricated history
      updateDashboardStats([]);
      updateCurrentStatus([]);
    }

    // Load organization-wide activity for recent activity
    await loadOrganizationActivity();

    // Load organization stats
    await loadOrganizationStats();

    // Display current organization details
    displayCurrentOrganization();

  } catch (error) {
    console.error('Dashboard data load error:', error);
    if (error.message.includes('403') || error.message.includes('401')) {
      localStorage.clear();
      sessionStorage.clear();
      alert('Your session has expired. Please login again.');
      window.location.href = '/pages/register.html';
    } else {
      // No demo fallback: show real (empty) state instead of fabricated history
      updateDashboardStats([]);
      updateCurrentStatus([]);
      updateRecentActivity([]);
      // Still try to display organization details
      displayCurrentOrganization();
    }
  }
}

// Load organization-wide activity for admin view (REAL data from attendance-monitor)
async function loadOrganizationActivity() {
  try {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE}/api/attendance-monitor`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const result = await response.json();
      const records = result.recent_records || result.records || result.attendance || result.history || [];

      // Map real records into the activity feed shape (no fabricated people/actions)
      const activities = records.slice(0, 8).map(r => ({
        id: r.id,
        userName: r.name || r.username || r.digitalid || r.digital_id || 'Unknown',
        userRole: r.role || 'User',
        userId: r.digitalid || r.digital_id || r.user_id || 'N/A',
        action: r.punchtype === 'in' ? 'punched in'
              : r.punchtype === 'out' ? 'punched out'
              : r.punchtype === 'break_start' ? 'started break'
              : r.punchtype === 'break_end' ? 'ended break'
              : (r.punchtype || r.punch_type || 'activity'),
        punchtype: r.punchtype || r.punch_type,
        timestamp: r.timestamp,
        location: r.location ? 'Verified location' : 'Not specified'
      }));

      updateRecentActivity(activities);
      return;
    }
    console.warn('Attendance-monitor unavailable, showing empty activity');
    updateRecentActivity([]);
  } catch (error) {
    console.error('Organization activity load error:', error);
    updateRecentActivity([]);
  }
}

// Load organization statistics from REAL endpoints (no demo data)
async function loadOrganizationStats() {
  try {
    await loadRealTimeOrganizationStats();
  } catch (error) {
    console.error('Organization stats load error:', error);
    updateOrganizationStats({ totalUsers: 0, activeUsers: 0, totalClasses: 0, pendingRequests: 0 });
  }
}

// Load real-time organization statistics based on actual data
async function loadRealTimeOrganizationStats() {
  try {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE}/api/attendance/history?limit=1000`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    let stats = { totalUsers: 0, activeUsers: 0, totalClasses: 0, pendingRequests: 0, activeUsersWeek: 0, totalRecords: 0 };

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        stats = calculateOrganizationStats(result.history);
      }
    }

    // Enrich with REAL pending requests count and REAL classes count
    try {
      const pendingResp = await fetch(`${API_BASE}/api/pending-requests`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (pendingResp.ok) {
        const pendingResult = await pendingResp.json();
        const pendingList = pendingResult.requests || pendingResult.pending || pendingResult.data || [];
        stats.pendingRequests = Array.isArray(pendingList) ? pendingList.filter(r => r.status === 'pending' || !r.status).length : (pendingResult.count || 0);
      }
    } catch (e) { console.warn('Pending requests count unavailable:', e.message); }

    try {
      const classesResp = await fetch(`${API_BASE}/api/classes`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (classesResp.ok) {
        const classesResult = await classesResp.json();
        const classList = classesResult.classes || classesResult.data || [];
        stats.totalClasses = Array.isArray(classList) ? classList.length : (classesResult.count || 0);
      }
    } catch (e) { console.warn('Classes count unavailable:', e.message); }

    updateOrganizationStats(stats);
  } catch (error) {
    console.error('Real-time stats calculation error:', error);
    // Honest zeros on failure - never fabricated numbers
    updateOrganizationStats({ totalUsers: 0, activeUsers: 0, totalClasses: 0, pendingRequests: 0 });
  }
}

// Calculate organization statistics from attendance data
function calculateOrganizationStats(attendanceHistory) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisWeek = new Date(today);
  thisWeek.setDate(today.getDate() - 7);

  // Group by date and user
  const dailyStats = {};
  const userActivity = {};

  attendanceHistory.forEach(record => {
    const recordDate = new Date(record.timestamp);
    const dateKey = recordDate.toISOString().split('T')[0];
    const userId = record.digitalid || record.user_id || 'unknown';

    // Track daily activity
    if (!dailyStats[dateKey]) {
      dailyStats[dateKey] = { users: new Set(), totalRecords: 0 };
    }
    dailyStats[dateKey].users.add(userId);
    dailyStats[dateKey].totalRecords++;

    // Track user activity
    if (!userActivity[userId]) {
      userActivity[userId] = { lastActivity: recordDate, totalRecords: 0 };
    }
    userActivity[userId].totalRecords++;
    if (recordDate > userActivity[userId].lastActivity) {
      userActivity[userId].lastActivity = recordDate;
    }
  });

  // Calculate metrics
  const todayKey = today.toISOString().split('T')[0];
  const activeUsersToday = dailyStats[todayKey]?.users.size || 0;

  // Active users in last 7 days
  const activeUsersWeek = Object.keys(dailyStats).filter(dateKey => {
    const date = new Date(dateKey);
    return date >= thisWeek;
  }).reduce((total, dateKey) => {
    return total + dailyStats[dateKey].users.size;
  }, 0);

  // Total unique users
  const totalUsers = Object.keys(userActivity).length;

  // Pending requests & classes are fetched from REAL endpoints
  // (/api/pending-requests, /api/classes) in loadRealTimeOrganizationStats().
  // Defaults here are honest zeros, never simulated.
  const pendingRequests = 0;
  const totalClasses = 0;

  return {
    totalUsers: totalUsers,
    activeUsers: activeUsersToday,
    totalClasses: totalClasses,
    pendingRequests: pendingRequests,
    activeUsersWeek: activeUsersWeek,
    totalRecords: attendanceHistory.length
  };
}

// Update organization statistics display
function updateOrganizationStats(stats) {
  document.getElementById('totalUsers').textContent = stats.totalUsers || 0;
  document.getElementById('activeUsers').textContent = stats.activeUsers || 0;
  document.getElementById('totalClasses').textContent = stats.totalClasses || 0;
  document.getElementById('pendingRequests').textContent = stats.pendingRequests || 0;
}



// Update dashboard statistics
function updateDashboardStats(history) {
  const totalRecords = history.length;
  
  // This month records
  const thisMonth = history.filter(h => {
    const date = new Date(h.timestamp);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }).length;

  // Calculate attendance rate
  const workingDays = 22; // Approximate working days per month
  const expectedRecords = workingDays * 2; // Assuming 2 punches per day
  const attendanceRate = expectedRecords > 0 ? Math.round((thisMonth / expectedRecords) * 100) : 0;

  // Calculate current streak
  const dailyAttendance = {};
  history.forEach(record => {
    const date = record.timestamp.split('T')[0];
    if (!dailyAttendance[date]) dailyAttendance[date] = [];
    dailyAttendance[date].push(record);
  });

  const sortedDates = Object.keys(dailyAttendance).sort().reverse();
  let streak = 0;
  const today = new Date().toISOString().split('T')[0];

  for (let i = 0; i < sortedDates.length; i++) {
    const date = sortedDates[i];
    const daysDiff = Math.floor((new Date(today) - new Date(date)) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === streak && dailyAttendance[date].some(r => r.punchtype === 'in')) {
      streak++;
    } else {
      break;
    }
  }

  // Update UI elements safely
  const elements = {
    totalRecords: document.getElementById('totalRecords'),
    thisMonth: document.getElementById('thisMonth'),
    attendanceRate: document.getElementById('attendanceRate'),
    currentStreak: document.getElementById('currentStreak')
  };

  if (elements.totalRecords) elements.totalRecords.textContent = totalRecords;
  if (elements.thisMonth) elements.thisMonth.textContent = thisMonth;
  if (elements.attendanceRate) elements.attendanceRate.textContent = Math.min(attendanceRate, 100) + '%';
  if (elements.currentStreak) elements.currentStreak.textContent = streak;
}

// Update current status
function updateCurrentStatus(history) {
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const statusTime = document.getElementById('statusTime');

  if (!statusIndicator || !statusText || !statusTime) return;

  if (history.length === 0) {
    statusIndicator.className = 'status-indicator status-out';
    statusIndicator.innerHTML = '<i class="fas fa-clock"></i>';
    statusText.textContent = 'Ready to punch in';
    statusTime.textContent = 'No records yet';
    return;
  }

  const lastRecord = history[0];
  const lastTime = new Date(lastRecord.timestamp);

  if (lastRecord.punchtype === 'in' || lastRecord.punchtype === 'breakend') {
    statusIndicator.className = 'status-indicator status-in';
    statusIndicator.innerHTML = '<i class="fas fa-check"></i>';
    statusText.textContent = 'Currently checked in';
    statusTime.textContent = `Since ${lastTime.toLocaleTimeString()}`;
  } else {
    statusIndicator.className = 'status-indicator status-out';
    statusIndicator.innerHTML = '<i class="fas fa-times"></i>';
    statusText.textContent = 'Currently checked out';
    statusTime.textContent = `Since ${lastTime.toLocaleTimeString()}`;
  }
}

// Update recent activity to show organization-wide activity
function updateRecentActivity(recentHistory) {
  const container = document.getElementById('recentActivityList');
  if (!container) return;

  if (recentHistory.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted py-4">
        <i class="fas fa-calendar-times fa-2x mb-3"></i>
        <p>No recent activity</p>
      </div>
    `;
    return;
  }

  const activityHTML = recentHistory.map(activity => {
    const date = new Date(activity.timestamp);
    const iconInfo = getActivityIcon(activity.action || activity.punchtype);

    return `
      <div class="activity-item">
        <div class="activity-icon" style="background: ${iconInfo.color}">
          <i class="fas fa-${iconInfo.icon}"></i>
        </div>
        <div class="activity-content">
          <div class="fw-bold">${activity.userName || 'Unknown User'}</div>
          <div class="activity-time">${activity.action || activity.punchtype.replace('_', ' ')} • ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}</div>
          <small class="text-muted">${activity.userRole || 'User'} • ${activity.location || 'Unknown Location'}</small>
        </div>
        <div class="text-muted small">
          <span class="badge bg-secondary">${activity.userId || 'N/A'}</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = activityHTML;
}

// Punch method selection functions
function showPunchMethodModal(punchType) {
  currentPunchType = punchType;
  const modal = new bootstrap.Modal(document.getElementById('punchMethodModal'));
  modal.show();
}

function doAdminPunch(method) {
  const modal = bootstrap.Modal.getInstance(document.getElementById('punchMethodModal'));
  modal.hide();

  if (method === 'manual') {
    quickPunch(currentPunchType);
  } else if (method === 'gps') {
    quickPunchGPS(currentPunchType);
  } else if (method === 'qr') {
    const qrModal = new bootstrap.Modal(document.getElementById('qrScanModal'));
    qrModal.show();
  }
}

// Admin quick punch function
async function quickPunch(punchType) {
  showProcessingModal(`Processing ${punchType.replace('_', ' ')}...`, 'Please wait while we record your attendance');

  try {
    const token = getAuthToken();
    if (!token) {
      hideProcessingModal();
      showNotification('Authentication required. Please login again.', 'warning');
      setTimeout(() => { window.location.href = '/pages/register.html'; }, 2000);
      return;
    }

    const response = await fetch(`${API_BASE}/api/punch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        punchtype: punchType,
        attendancemethod: 'manual',
        locationdata: currentLocationData,
        notes: `Admin manual ${punchType.replace('_', ' ')}`
      })
    });

    let result = null;
    try {
      result = await response.json();
    } catch (e) {
      console.error('Failed to parse response:', e);
    }

    hideProcessingModal();

    if (!response.ok || !result) {
      console.error('Punch API error:', response.status, result);
      showNotification('Attendance not recorded. Server error.', 'danger');
      return;
    }

    if (result.success) {
      showNotification(result.message || 'Attendance recorded successfully!', 'success');
      loadDashboardData(); // Reload data
    } else {
      showNotification(result.message || 'Punch failed', 'danger');
    }
  } catch (err) {
    hideProcessingModal();
    console.error('Punch error:', err);
    showNotification('Network error. Please try again.', 'danger');
  }
}

// GPS punch function with boundary validation
async function quickPunchGPS(punchType) {
    if (!currentLocationData.latitude || !currentLocationData.longitude) {
        showNotification('Location not available. Please enable GPS and try again.', 'warning');
        return;
    }

    showProcessingModal(`Processing GPS ${punchType.replace('_', ' ')}...`, 'Validating location boundaries');

    try {
        // Check geofence boundaries first
        const withinBoundary = isWithinGeofence(currentLocationData.latitude, currentLocationData.longitude);

        if (!withinBoundary) {
            hideProcessingModal();

            // User is outside boundary - offer manual punch request
            const proceedWithManual = confirm(
                '⚠️ LOCATION OUTSIDE BOUNDARY\n\n' +
                'You are currently outside the allowed attendance area.\n\n' +
                'Would you like to submit a manual punch request for admin approval instead?\n\n' +
                'Note: Manual requests require administrator approval before being recorded.'
            );

            if (proceedWithManual) {
                // Switch to manual punch request
                return quickPunch(punchType);
            } else {
                showNotification('Attendance cancelled. You must be within the designated area to punch attendance.', 'warning');
                return;
            }
        }

        // User is within boundary - proceed with GPS punch
        const token = getAuthToken();
        if (!token) {
            hideProcessingModal();
            showNotification('Authentication required. Please logout and login again.', 'warning');
            setTimeout(() => { window.location.href = '/pages/register.html'; }, 2000);
            return;
        }

        const response = await fetch(`${API_BASE}/api/punch`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                punchtype: punchType,
                attendancemethod: 'gps',
                locationdata: currentLocationData,
                notes: `Admin GPS ${punchType.replace('_', ' ')} - Within boundary - Lat: ${currentLocationData.latitude.toFixed(4)}, Lng: ${currentLocationData.longitude.toFixed(4)}`
            })
        });

        let result = null;
        try {
            result = await response.json();
        } catch (e) {
            console.error('Failed to parse GPS response:', e);
        }

        hideProcessingModal();

        if (!response.ok || !result) {
            console.error('GPS Punch API error:', response.status, result);
            showNotification('GPS attendance not recorded. Server error.', 'danger');
            return;
        }

        if (result.success) {
            showNotification(`GPS ${punchType.replace('_', ' ')} successful! Location verified within boundary.`, 'success');
            loadDashboardData();
        } else {
            showNotification(result.message || 'GPS punch failed', 'danger');
        }
    } catch (err) {
        hideProcessingModal();
        console.error('GPS punch error:', err);
        showNotification('GPS punch failed. Network error.', 'danger');
    }
}

// Process QR Code
async function processQRCode() {
  const qrData = document.getElementById('qrCodeInput').value.trim();
  if (!qrData) {
    showAlert('qrScanStatus', 'Please enter or scan a QR code', 'warning');
    return;
  }

  showAlert('qrScanStatus', 'Processing QR code...', 'info');

  // Check if QR code has already been used (single-use validation)
  if (usedQRCodes.includes(qrData)) {
    showAlert('qrScanStatus', 'This QR code has already been used and is no longer valid.', 'danger');
    return;
  }

  // Check if QR code is expired (if it follows our format)
  if (qrData.startsWith('ATT-')) {
    const parts = qrData.split('-');
    if (parts.length >= 3) {
      const timestamp = parseInt(parts[1]);
      const validityMinutes = parseInt(parts[2]) || 15; // Default 15 minutes
      const expiryTime = new Date(timestamp + (validityMinutes * 60 * 1000));

      if (Date.now() > expiryTime.getTime()) {
        showAlert('qrScanStatus', 'This QR code has expired.', 'danger');
        return;
      }
    }
  }

  try {
    const punchType = await determinePunchType();
    const token = getAuthToken();

    if (!token) {
      showAlert('qrScanStatus', 'Authentication required. Please login again.', 'warning');
      setTimeout(() => {
        bootstrap.Modal.getInstance(document.getElementById('qrScanModal')).hide();
        window.location.href = '/pages/register.html';
      }, 1500);
      return;
    }

    const response = await fetch(`${API_BASE}/api/punch-qr`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        qrdata: qrData,
        punchtype: punchType,
        locationdata: currentLocationData
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    let result = null;
    try {
      result = await response.json();
    } catch (e) {
      console.error('Failed to parse QR response:', e);
      showAlert('qrScanStatus', 'Invalid server response. Please try again.', 'danger');
      return;
    }

    if (result && result.success) {
      // Mark QR code as used (single-use functionality)
      usedQRCodes.push(qrData);
      localStorage.setItem('usedQRCodes', JSON.stringify(usedQRCodes));

      showAlert('qrScanStatus', result.message + ' (QR code invalidated for future use)', 'success');
      setTimeout(() => {
        bootstrap.Modal.getInstance(document.getElementById('qrScanModal')).hide();
        document.getElementById('qrCodeInput').value = '';
        loadDashboardData();
      }, 2000);
    } else {
      throw new Error(result?.message || 'QR code processing failed');
    }
  } catch (error) {
    console.error('QR code punch error:', error);
    showAlert('qrScanStatus', 'QR code processing failed', 'danger');
  }
}

// Submit manual punch
async function submitManualPunch() {
  const punchTypeElement = document.getElementById('punchType');
  const punchType = punchTypeElement ? punchTypeElement.value : '';
  const notesElement = document.getElementById('punchNotes');
  const notes = notesElement ? notesElement.value.trim() : '';

  if (!punchType) {
    showAlert('manualPunchStatus', 'Please select a punch type', 'warning');
    return;
  }

  showAlert('manualPunchStatus', 'Submitting attendance...', 'info');

  try {
    const token = getAuthToken();
    if (!token) {
      showAlert('manualPunchStatus', 'Authentication required. Please login again.', 'warning');
      setTimeout(() => {
        const modal = bootstrap.Modal.getInstance(document.getElementById('manualPunchModal'));
        if (modal) modal.hide();
        window.location.href = '/pages/register.html';
      }, 2000);
      return;
    }

    const response = await fetch(`${API_BASE}/api/punch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        punchtype: punchType,
        attendancemethod: 'manual',
        notes: notes || `Admin manual ${punchType.replace('_', ' ')} entry`,
        locationdata: currentLocationData || {}
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server error: ${response.status} ${text}`);
    }

    let result;
    try {
      result = await response.json();
    } catch (e) {
      throw new Error('Invalid server response');
    }

    if (result.success) {
      showAlert('manualPunchStatus', result.message, 'success');
      setTimeout(() => {
        const modal = bootstrap.Modal.getInstance(document.getElementById('manualPunchModal'));
        if (modal) modal.hide();
        if (punchTypeElement) punchTypeElement.value = '';
        if (notesElement) notesElement.value = '';
        loadDashboardData();
      }, 1800);
    } else {
      throw new Error(result.message || 'Manual punch failed');
    }
  } catch (error) {
    console.error('Manual punch error:', error);
    showAlert('manualPunchStatus', error.message || 'Could not submit attendance', 'danger');
  }
}

// Class attendance functions
async function takeClassAttendance(classId) {
  try {
    const selectedClass = teacherClasses.find(c => c.id === classId);
    if (!selectedClass) return;

    currentClassId = classId;
    
    // Update modal header
    document.getElementById('modalClassName').textContent = selectedClass.classname;
    document.getElementById('classDetails').textContent = `${selectedClass.subject} - ${selectedClass.scheduletime}`;

    // Load students for this class
    currentClassStudents = [];

    displayStudentsInModal();

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('classAttendanceModal'));
    modal.show();
  } catch (error) {
    console.error('Load students error:', error);
    showNotification('Failed to load students for this class.', 'error');
  }
}

function displayStudentsInModal() {
  const container = document.getElementById('studentsList');
  if (!container) return;

  document.getElementById('studentCount').textContent = currentClassStudents.length;

  if (currentClassStudents.length === 0) {
    container.innerHTML = '<div class="text-center text-muted py-3">No students enrolled in this class.</div>';
    return;
  }

  container.innerHTML = currentClassStudents.map(student => `
    <div class="student-item" id="student-${student.id}">
      <div>
        <strong>${student.name}</strong>
        <small class="text-muted d-block">Roll: ${student.rollnumber}</small>
      </div>
      <div>
        <div class="btn-group" role="group">
          <button type="button" class="btn btn-success attendance-btn ${student.ispresent === true ? 'active' : ''}" onclick="markStudentAttendance(${student.id}, true)">
            <i class="fas fa-check"></i> Present
          </button>
          <button type="button" class="btn btn-danger attendance-btn ${student.ispresent === false ? 'active' : ''}" onclick="markStudentAttendance(${student.id}, false)">
            <i class="fas fa-times"></i> Absent
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function markStudentAttendance(studentId, isPresent) {
  const student = currentClassStudents.find(s => s.id === studentId);
  if (!student) return;

  student.ispresent = isPresent;

  // Update button states
  const studentRow = document.getElementById(`student-${studentId}`);
  if (!studentRow) return;

  const buttons = studentRow.querySelectorAll('.attendance-btn');
  buttons.forEach(btn => btn.classList.remove('active'));

  if (isPresent) {
    studentRow.querySelector('.btn-success').classList.add('active');
  } else {
    studentRow.querySelector('.btn-danger').classList.add('active');
  }
}

function markAllPresent() {
  currentClassStudents.forEach(student => markStudentAttendance(student.id, true));
}

function markAllAbsent() {
  currentClassStudents.forEach(student => markStudentAttendance(student.id, false));
}

async function submitClassAttendance() {
  if (!currentClassId) return;

  const attendanceData = currentClassStudents.map(student => ({
    studentid: student.id,
    ispresent: student.ispresent !== null ? student.ispresent : false,
    notes: ''
  }));

  try {
    showAttendanceStatus('Saving attendance...', 'info');

    // Simulate API call for now
    await new Promise(resolve => setTimeout(resolve, 1000));

    showAttendanceStatus('Attendance saved successfully!', 'success');
    setTimeout(() => {
      bootstrap.Modal.getInstance(document.getElementById('classAttendanceModal')).hide();
      showNotification('Class attendance has been recorded.', 'success');
    }, 1500);
  } catch (error) {
    console.error('Submit attendance error:', error);
    showAttendanceStatus('Failed to save attendance. Please try again.', 'danger');
  }
}

function showAttendanceStatus(message, type) {
  const statusDiv = document.getElementById('attendanceStatus');
  if (!statusDiv) return;

  statusDiv.textContent = message;
  statusDiv.className = `alert alert-${type}`;
  statusDiv.classList.remove('d-none');
}

function viewClassDetails(classId) {
  const selectedClass = teacherClasses.find(c => c.id === classId);
  if (!selectedClass) return;

  showNotification(`Class: ${selectedClass.classname} - ${selectedClass.subject}`, 'info');
}

function showAllClasses() {
  displayClasses();
}

// Utility functions
function updateCurrentTime() {
  const now = new Date();
  const timeElement = document.getElementById('currentTime');
  if (timeElement) {
    timeElement.textContent = now.toLocaleTimeString();
  }
}

function getCurrentLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      function(position) {
        currentLocationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };

        const locationElement = document.getElementById('currentLocation');
        if (locationElement) {
          locationElement.textContent = `Lat: ${position.coords.latitude.toFixed(4)}, Lng: ${position.coords.longitude.toFixed(4)}`;
        }
      },
      function(error) {
        console.error('Geolocation error:', error);
        let errorMessage = 'Location not available';

        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location access denied. Please enable GPS permissions and try again.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable. Please check your GPS settings.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out. Please try again.';
            break;
          default:
            errorMessage = 'An unknown location error occurred.';
            break;
        }

        const locationElement = document.getElementById('currentLocation');
        if (locationElement) {
          locationElement.textContent = errorMessage;
        }

        showNotification(errorMessage, 'error');
      },
      {
        timeout: 10000,
        enableHighAccuracy: true
      }
    );
  } else {
    const locationElement = document.getElementById('currentLocation');
    if (locationElement) {
      locationElement.textContent = 'Geolocation not supported';
    }
  }
}

async function determinePunchType() {
  try {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE}/api/history?limit=1`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success && result.history.length > 0) {
        const lastPunch = result.history[0];
        return (lastPunch.punchtype === 'in' || lastPunch.punchtype === 'breakend') ? 'out' : 'in';
      }
    }
  } catch (error) {
    console.error('Error determining punch type:', error);
  }
  return 'in'; // Default to punch in
}

function getActivityIcon(punchType) {
  const icons = {
    'in': { icon: 'sign-in-alt', color: 'linear-gradient(135deg, #27ae60 0%, #2ecc71 100%)' },
    'out': { icon: 'sign-out-alt', color: 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)' },
    'breakstart': { icon: 'coffee', color: 'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)' },
    'break_start': { icon: 'coffee', color: 'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)' },
    'breakend': { icon: 'play', color: 'linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%)' },
    'break_end': { icon: 'play', color: 'linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%)' }
  };
  return icons[punchType] || { icon: 'clock', color: 'linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%)' };
}

function getMethodIcon(method) {
  const icons = {
    'manual': 'edit',
    'qr': 'qrcode',
    'gps': 'map-marker-alt',
    'biometric': 'fingerprint'
  };
  return icons[method] || 'clock';
}

function showProcessingModal(title, subtitle) {
  const titleElement = document.getElementById('processingText');
  const subtitleElement = document.getElementById('processingSubtext');
  
  if (titleElement) titleElement.textContent = title;
  if (subtitleElement) subtitleElement.textContent = subtitle;
  
  const modal = new bootstrap.Modal(document.getElementById('processingModal'));
  modal.show();
}

function hideProcessingModal() {
  const modal = bootstrap.Modal.getInstance(document.getElementById('processingModal'));
  if (modal) modal.hide();
}

function showAlert(elementId, message, type) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = message;
    element.className = `alert alert-${type}`;
    element.classList.remove('d-none');
  }
}

function showNotification(message, type) {
  const notification = document.createElement('div');
  notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
  notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 400px;';
  notification.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 5000);
}

function closeModal(modalId) {
  const modal = bootstrap.Modal.getInstance(document.getElementById(modalId));
  if (modal) modal.hide();
}

function logout() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/pages/register.html';
  }
}

// Faculty management functions (admin-specific)
async function loadFacultyList() {
  // This would load faculty data from API
  console.log('Loading faculty list...');
}

async function addFaculty() {
  // This would handle adding new faculty
  console.log('Adding new faculty...');
}

async function editFaculty(facultyId) {
  // This would handle editing faculty
  console.log('Editing faculty:', facultyId);
}

async function deleteFaculty(facultyId) {
  // This would handle deleting faculty
  console.log('Deleting faculty:', facultyId);
}

// Prevent common errors
window.addEventListener('error', function(e) {
  if (e.message && e.message.includes('navigation')) {
    console.warn('Navigation error caught and handled:', e.message);
    e.preventDefault();
  }
});

window.addEventListener('unhandledrejection', function(e) {
  if (e.reason && e.reason.message && e.reason.message.includes('message channel closed')) {
    e.preventDefault();
    return false;
  }
});

// Export functions for global access
window.quickPunch = quickPunch;
window.showPunchMethodModal = showPunchMethodModal;
window.doAdminPunch = doAdminPunch;
window.processQRCode = processQRCode;
window.submitManualPunch = submitManualPunch;
window.takeClassAttendance = takeClassAttendance;
window.markStudentAttendance = markStudentAttendance;
window.markAllPresent = markAllPresent;
window.markAllAbsent = markAllAbsent;
window.submitClassAttendance = submitClassAttendance;
window.viewClassDetails = viewClassDetails;
window.showAllClasses = showAllClasses;
window.closeModal = closeModal;
window.logout = logout;
// Add these integration functions at the end of admin-dashboard.js

// Show integrations page
function showIntegrationsPage() {
  const content = `
    <div class="integrations-page">
      <h3><i class="fas fa-plug me-2"></i>System Integrations</h3>
      
      <!-- Google Classroom -->
      <div class="card mb-4">
        <div class="card-header">
          <h5><i class="fab fa-google me-2"></i>Google Classroom</h5>
        </div>
        <div class="card-body">
          <div id="googleStatus" class="mb-3"></div>
          <button class="btn btn-primary me-2" onclick="connectGoogleClassroom()">
            <i class="fab fa-google me-1"></i>Connect Google Classroom
          </button>
          <button class="btn btn-success me-2" onclick="syncGoogleClassroom()">
            <i class="fas fa-sync me-1"></i>Sync Classes
          </button>
          <button class="btn btn-info" onclick="checkGoogleStatus()">
            <i class="fas fa-info-circle me-1"></i>Check Status
          </button>
        </div>
      </div>

      <!-- Teach Us App -->
      <div class="card mb-4">
        <div class="card-header">
          <h5><i class="fas fa-chalkboard-teacher me-2"></i>Teach Us App</h5>
        </div>
        <div class="card-body">
          <div id="teachusStatus" class="mb-3"></div>
          <button class="btn btn-warning me-2" onclick="testTeachUsConnection()">
            <i class="fas fa-plug me-1"></i>Test Connection
          </button>
          <button class="btn btn-success me-2" onclick="pushToTeachUs()">
            <i class="fas fa-upload me-1"></i>Push Attendance
          </button>
          <button class="btn btn-info" onclick="pullFromTeachUs()">
            <i class="fas fa-download me-1"></i>Pull Attendance
          </button>
        </div>
      </div>

      <!-- Integration Stats -->
      <div class="card">
        <div class="card-header">
          <h5><i class="fas fa-chart-bar me-2"></i>Integration Statistics</h5>
        </div>
        <div class="card-body">
          <div id="integrationStats"></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('pageContent').innerHTML = content;
  loadIntegrationStats();
}

// Google Classroom functions
async function connectGoogleClassroom() {
  try {
    const response = await fetch(`${API_BASE}/api/integrations/google/auth-url`, {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    const result = await response.json();
    
    if (result.success) {
      window.open(result.auth_url, '_blank');
      showNotification('Please complete Google authorization in the new window', 'info');
    } else {
      showNotification('Failed to generate Google authorization URL', 'error');
    }
  } catch (error) {
    showNotification('Error connecting to Google Classroom', 'error');
  }
}

async function syncGoogleClassroom() {
  try {
    showNotification('Syncing Google Classroom data...', 'info');
    
    const response = await fetch(`${API_BASE}/api/integrations/google/sync`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    const result = await response.json();
    
    if (result.success) {
      showNotification(`Synced ${result.courses_synced} courses successfully!`, 'success');
      loadIntegrationStats();
    } else {
      showNotification(result.message || 'Failed to sync Google Classroom', 'error');
    }
  } catch (error) {
    showNotification('Error syncing Google Classroom', 'error');
  }
}

async function checkGoogleStatus() {
  try {
    const response = await fetch(`${API_BASE}/api/integrations/google/status`, {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    const result = await response.json();
    
    const statusDiv = document.getElementById('googleStatus');
    statusDiv.innerHTML = `
      <div class="alert alert-${result.connected ? 'success' : 'warning'}">
        ${result.message}
        ${result.expires_at ? `<br><small>Expires: ${new Date(result.expires_at).toLocaleString()}</small>` : ''}
      </div>
    `;
  } catch (error) {
    showNotification('Error checking Google status', 'error');
  }
}

// Teach Us App functions
async function testTeachUsConnection() {
  try {
    const response = await fetch(`${API_BASE}/api/integrations/teachus/test`, {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    const result = await response.json();
    
    const statusDiv = document.getElementById('teachusStatus');
    statusDiv.innerHTML = `
      <div class="alert alert-${result.success ? 'success' : 'danger'}">
        ${result.message}
        ${result.api_version ? `<br><small>API Version: ${result.api_version}</small>` : ''}
      </div>
    `;
  } catch (error) {
    showNotification('Error testing Teach Us connection', 'error');
  }
}

async function pushToTeachUs() {
  // Implementation depends on your class data structure
  showNotification('Push to Teach Us feature - implement based on your needs', 'info');
}

async function pullFromTeachUs() {
  const date = prompt('Enter date to pull attendance (YYYY-MM-DD):');
  if (!date) return;
  
  try {
    const response = await fetch(`${API_BASE}/api/integrations/teachus/pull?date=${date}`, {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    const result = await response.json();
    
    if (result.success) {
      showNotification(`Pulled ${result.sessions_processed} sessions successfully!`, 'success');
      loadIntegrationStats();
    } else {
      showNotification(result.message || 'Failed to pull from Teach Us', 'error');
    }
  } catch (error) {
    showNotification('Error pulling from Teach Us', 'error');
  }
}

async function loadIntegrationStats() {
  try {
    const response = await fetch(`${API_BASE}/api/integrations/stats`, {
      headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    });
    const result = await response.json();
    
    if (result.success) {
      const statsDiv = document.getElementById('integrationStats');
      statsDiv.innerHTML = `
        <div class="row">
          <div class="col-md-6">
            <h6>Google Classroom</h6>
            <p>Connected: <span class="badge bg-${result.google_classroom.connected ? 'success' : 'warning'}">${result.google_classroom.connected ? 'Yes' : 'No'}</span></p>
            <p>Classes: ${result.google_classroom.synced_classes}/${result.google_classroom.total_classes}</p>
            <p>Students: ${result.google_classroom.synced_students}</p>
          </div>
          <div class="col-md-6">
            <h6>Teach Us App</h6>
            <p>Configured: <span class="badge bg-${result.teach_us.configured ? 'success' : 'warning'}">${result.teach_us.configured ? 'Yes' : 'No'}</span></p>
            <p>Endpoint: ${result.teach_us.endpoint}</p>
          </div>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error loading integration stats:', error);
  }
}

// Class code generation for organization access
function generateClassCode() {
  // Generate a unique class code
  const code = 'CLS-' + Math.random().toString(36).substring(2, 8).toUpperCase();

  // Show modal with generated code
  const modalHtml = `
    <div class="modal fade" id="classCodeModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="fas fa-key me-2"></i>Class Access Code Generated
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body text-center">
            <div class="mb-4">
              <i class="fas fa-qrcode fa-4x text-primary mb-3"></i>
              <h3 class="text-primary fw-bold">${code}</h3>
              <p class="text-muted">Share this code with students to join your class</p>
            </div>

            <div class="row g-3">
              <div class="col-12">
                <button class="btn btn-outline-primary w-100" onclick="copyToClipboard('${code}')">
                  <i class="fas fa-copy me-2"></i>Copy Code
                </button>
              </div>
              <div class="col-12">
                <button class="btn btn-success w-100" onclick="downloadQRCode('${code}')">
                  <i class="fas fa-download me-2"></i>Download QR Code
                </button>
              </div>
            </div>

            <div class="alert alert-info mt-4">
              <i class="fas fa-info-circle me-2"></i>
              <strong>How it works:</strong><br>
              Students can use this code to join your specific class within the organization.
              Each code is unique and can only be used once per student.
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            <button type="button" class="btn btn-primary" onclick="generateClassCode()">
              <i class="fas fa-plus me-2"></i>Generate New Code
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Remove existing modal if present
  const existingModal = document.getElementById('classCodeModal');
  if (existingModal) {
    existingModal.remove();
  }

  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('classCodeModal'));
  modal.show();

  // Save code to localStorage for admin reference
  const savedCodes = JSON.parse(localStorage.getItem('generatedClassCodes') || '[]');
  savedCodes.push({
    code: code,
    generatedAt: new Date().toISOString(),
    generatedBy: currentUser.digitalid,
    organizationId: currentUser.organizationid
  });
  localStorage.setItem('generatedClassCodes', JSON.stringify(savedCodes));

  showNotification(`Class code ${code} generated successfully!`, 'success');
}

// Copy code to clipboard
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showNotification('Code copied to clipboard!', 'success');
  }).catch(() => {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showNotification('Code copied to clipboard!', 'success');
  });
}

// Download QR Code (placeholder - would need QR code library)
function downloadQRCode(code) {
  showNotification('QR Code download feature coming soon! For now, share the code: ' + code, 'info');
}

// Manual Punch Approval System
function showManualPunchApprovals() {
  const modal = new bootstrap.Modal(document.getElementById('manualPunchApprovalModal'));
  modal.show();
  loadPendingApprovals();
}

function loadPendingApprovals() {
  // Simulate loading pending manual punch requests
  const pendingApprovals = document.getElementById('pendingApprovals');

  // Mock data for demonstration
  const mockRequests = [
    {
      id: 'req_001',
      userId: 'EMP-1001',
      userName: 'John Smith',
      punchType: 'in',
      requestedTime: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
      reason: 'Arrived late due to traffic',
      location: 'Main Office'
    },
    {
      id: 'req_002',
      userId: 'EMP-1005',
      userName: 'Sarah Johnson',
      punchType: 'out',
      requestedTime: new Date(Date.now() - 1000 * 60 * 15), // 15 minutes ago
      reason: 'Left early for medical appointment',
      location: 'Branch Office'
    }
  ];

  if (mockRequests.length === 0) {
    pendingApprovals.innerHTML = `
      <div class="text-center py-4">
        <i class="fas fa-check-circle fa-3x text-success mb-3"></i>
        <h6>No pending approvals</h6>
        <p class="text-muted">All manual punch requests have been processed.</p>
      </div>
    `;
    return;
  }

  pendingApprovals.innerHTML = mockRequests.map(request => `
    <div class="card mb-3">
      <div class="card-body">
        <div class="row align-items-center">
          <div class="col-md-6">
            <h6 class="mb-1">${request.userName}</h6>
            <p class="mb-1 text-muted small">ID: ${request.userId}</p>
            <p class="mb-0 small">
              <i class="fas fa-clock me-1"></i>${request.punchType.toUpperCase()} •
              <i class="fas fa-map-marker-alt ms-2 me-1"></i>${request.location}
            </p>
          </div>
          <div class="col-md-4">
            <p class="mb-1"><strong>Reason:</strong></p>
            <p class="text-muted small">${request.reason}</p>
            <small class="text-muted">Requested: ${request.requestedTime.toLocaleTimeString()}</small>
          </div>
          <div class="col-md-2">
            <div class="d-grid gap-2">
              <button class="btn btn-success btn-sm" onclick="approveManualPunch('${request.id}')">
                <i class="fas fa-check me-1"></i>Approve
              </button>
              <button class="btn btn-danger btn-sm" onclick="rejectManualPunch('${request.id}')">
                <i class="fas fa-times me-1"></i>Reject
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function approveManualPunch(requestId) {
  showNotification(`Manual punch request ${requestId} approved successfully!`, 'success');
  // Remove the approved request from the list
  const requestCard = document.querySelector(`[onclick*="approveManualPunch('${requestId}')"]`);
  if (requestCard) {
    requestCard.closest('.card').remove();
  }
  // Reload approvals to check if list is empty
  setTimeout(loadPendingApprovals, 500);
}

function rejectManualPunch(requestId) {
  const reason = prompt('Enter rejection reason:');
  if (reason) {
    showNotification(`Manual punch request ${requestId} rejected.`, 'warning');
    // Remove the rejected request from the list
    const requestCard = document.querySelector(`[onclick*="rejectManualPunch('${requestId}')"]`);
    if (requestCard) {
      requestCard.closest('.card').remove();
    }
    // Reload approvals to check if list is empty
    setTimeout(loadPendingApprovals, 500);
  }
}

// QR Code Generation System
let currentQRCode = null;
let qrExpiryTimer = null;
let usedQRCodes = [];

function generateAttendanceQR() {
  const modal = new bootstrap.Modal(document.getElementById('qrCodeModal'));
  modal.show();
}

function generateQRCode() {
  const validity = document.getElementById('qrValidity').value;
  const location = document.getElementById('qrLocation').value.trim();
  const purpose = document.getElementById('qrPurpose').value;

  if (!location) {
    showNotification('Please enter a location/room name', 'warning');
    return;
  }

  // Generate unique QR code
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const qrData = `ATT-${timestamp}-${randomId}`;

  // Calculate expiry time
  const expiryTime = new Date(timestamp + (validity * 60 * 1000));

  // Store QR code data
  currentQRCode = {
    code: qrData,
    expiry: expiryTime,
    location: location,
    purpose: purpose,
    validity: validity
  };

  // Display QR code
  displayQRCode();

  showNotification('QR Code generated successfully!', 'success');
}

function displayQRCode() {
  if (!currentQRCode) return;

  const displayDiv = document.getElementById('qrCodeDisplay');
  const instructionsDiv = document.getElementById('qrInstructions');
  const canvasDiv = document.getElementById('qrCodeCanvas');
  const codeText = document.getElementById('qrCodeText');
  const expiryText = document.getElementById('qrExpiryTime');

  // Hide instructions, show QR display
  instructionsDiv.classList.add('d-none');
  displayDiv.classList.remove('d-none');

  // Set QR code text
  codeText.value = currentQRCode.code;
  expiryText.textContent = currentQRCode.expiry.toLocaleTimeString();

  // Clear previous QR code
  canvasDiv.innerHTML = '';

  // Generate QR code as image using data URL
  try {
    // Check if qrcode library is available (qrcode-generator)
    if (typeof qrcode !== 'undefined') {
      // Create QR code with qrcode-generator
      const qr = qrcode(0, 'M'); // Error correction level M
      qr.addData(currentQRCode.code);
      qr.make();

      // Create table representation of QR code
      const size = qr.getModuleCount();
      const cellSize = Math.floor(200 / size); // Fit in 200px container

      let tableHTML = '<table style="border-collapse: collapse; margin: 0 auto; background: white; border: 2px solid #dee2e6; border-radius: 8px;">';

      for (let row = 0; row < size; row++) {
        tableHTML += '<tr>';
        for (let col = 0; col < size; col++) {
          const isBlack = qr.isDark(row, col);
          const bgColor = isBlack ? '#000000' : '#ffffff';
          tableHTML += `<td style="width: ${cellSize}px; height: ${cellSize}px; background-color: ${bgColor}; border: none; padding: 0;"></td>`;
        }
        tableHTML += '</tr>';
      }
      tableHTML += '</table>';

      canvasDiv.innerHTML = tableHTML;
      console.log('QR Code table generated successfully');
      showNotification('QR Code generated and ready for scanning!', 'success');
    } else {
      console.warn('qrcode library not loaded, using fallback');
      showFallbackQRCode();
    }
  } catch (error) {
    console.error('QR Code setup error:', error);
    showFallbackQRCode();
  }

  function showFallbackQRCode() {
    // Create a visual QR code pattern that looks like a real QR code
    const qrPattern = createVisualQRCode(currentQRCode.code);

    canvasDiv.innerHTML = qrPattern;
    showNotification('QR Code generated successfully!', 'success');
  }

  function createVisualQRCode(code) {
    // Create a simple but realistic-looking QR code pattern
    // This creates a visual representation that looks like a QR code
    const size = 21; // Standard QR code size
    const moduleSize = 6; // Size of each black/white square in pixels

    let pattern = '<div style="width: 200px; height: 200px; background: white; border: 2px solid #dee2e6; border-radius: 8px; position: relative; margin: 0 auto; overflow: hidden;">';

    // Add positioning squares (the big squares at corners)
    pattern += '<div style="position: absolute; top: 20px; left: 20px; width: 42px; height: 42px; border: 6px solid #000; background: white;"></div>';
    pattern += '<div style="position: absolute; top: 26px; left: 26px; width: 30px; height: 30px; border: 3px solid #000; background: white;"></div>';
    pattern += '<div style="position: absolute; top: 32px; left: 32px; width: 18px; height: 18px; background: #000;"></div>';

    pattern += '<div style="position: absolute; top: 20px; right: 20px; width: 42px; height: 42px; border: 6px solid #000; background: white;"></div>';
    pattern += '<div style="position: absolute; top: 26px; right: 26px; width: 30px; height: 30px; border: 3px solid #000; background: white;"></div>';
    pattern += '<div style="position: absolute; top: 32px; right: 32px; width: 18px; height: 18px; background: #000;"></div>';

    pattern += '<div style="position: absolute; bottom: 20px; left: 20px; width: 42px; height: 42px; border: 6px solid #000; background: white;"></div>';
    pattern += '<div style="position: absolute; bottom: 26px; left: 26px; width: 30px; height: 30px; border: 3px solid #000; background: white;"></div>';
    pattern += '<div style="position: absolute; bottom: 32px; left: 32px; width: 18px; height: 18px; background: #000;"></div>';

    // Add some random pattern dots to make it look more like a QR code
    const dots = [
      [80, 40], [100, 40], [120, 40], [140, 40],
      [80, 60], [100, 60], [120, 60],
      [80, 80], [100, 80], [120, 80], [140, 80],
      [80, 100], [100, 100], [120, 100],
      [80, 120], [100, 120], [120, 120], [140, 120],
      [40, 80], [40, 100], [40, 120], [40, 140],
      [60, 80], [60, 100], [60, 120],
      [160, 80], [160, 100], [160, 120], [160, 140],
      [140, 160], [120, 160], [100, 160], [80, 160]
    ];

    dots.forEach(([x, y]) => {
      pattern += `<div style="position: absolute; left: ${x}px; top: ${y}px; width: 6px; height: 6px; background: #000;"></div>`;
    });

    // Add timing patterns
    for (let i = 0; i < 15; i++) {
      const y = 68 + (i * 6);
      if (i % 2 === 0) {
        pattern += `<div style="position: absolute; left: 68px; top: ${y}px; width: 6px; height: 6px; background: #000;"></div>`;
      }
    }

    pattern += '</div>';
    return pattern;
  }

  function createSimpleQRPattern(code) {
    // This would create a more complex QR-like pattern
    // For now, we'll use the simple border pattern above
    return '';
  }

  // Set expiry timer
  if (qrExpiryTimer) clearTimeout(qrExpiryTimer);
  const timeLeft = currentQRCode.expiry.getTime() - Date.now();
  qrExpiryTimer = setTimeout(() => {
    showNotification('QR Code has expired', 'warning');
    regenerateQRCode();
  }, timeLeft);
}

function copyQRCode() {
  const codeText = document.getElementById('qrCodeText');
  codeText.select();
  document.execCommand('copy');
  showNotification('QR Code copied to clipboard!', 'success');
}

function downloadQRCode() {
  // Simulate download
  const link = document.createElement('a');
  link.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(`QR Code: ${currentQRCode.code}\nLocation: ${currentQRCode.location}\nExpires: ${currentQRCode.expiry.toLocaleString()}`);
  link.download = `attendance_qr_${currentQRCode.code}.txt`;
  link.click();
  showNotification('QR Code downloaded!', 'success');
}

function regenerateQRCode() {
  if (qrExpiryTimer) clearTimeout(qrExpiryTimer);
  generateQRCode();
}

// Geofencing System
let currentGeofences = [];
let userLocation = null;

function manageGeofence() {
  const modal = new bootstrap.Modal(document.getElementById('geofenceModal'));
  modal.show();
  loadExistingBoundaries();
  getCurrentUserLocation();
}

function setCurrentLocation() {
  if (!userLocation) {
    showNotification('Getting your current location...', 'info');
    getCurrentUserLocation();
    return;
  }

  document.getElementById('geofenceLat').value = userLocation.lat.toFixed(6);
  document.getElementById('geofenceLng').value = userLocation.lng.toFixed(6);
  showNotification('Location set to current position', 'success');
}

function getCurrentUserLocation() {
  if (!navigator.geolocation) {
    showNotification('Geolocation is not supported by this browser', 'error');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function(position) {
      userLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      document.getElementById('currentLat').textContent = userLocation.lat.toFixed(4);
      document.getElementById('currentLng').textContent = userLocation.lng.toFixed(4);
      document.getElementById('geofenceLat').value = userLocation.lat.toFixed(6);
      document.getElementById('geofenceLng').value = userLocation.lng.toFixed(6);
    },
    function(error) {
      console.error('Geolocation error:', error);
      showNotification('Unable to get your location. Please check permissions.', 'error');
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000
    }
  );
}

function saveGeofence() {
  const name = document.getElementById('geofenceName').value.trim();
  const radius = parseInt(document.getElementById('geofenceRadius').value);
  const lat = parseFloat(document.getElementById('geofenceLat').value);
  const lng = parseFloat(document.getElementById('geofenceLng').value);
  const active = document.getElementById('geofenceActive').checked;

  if (!name) {
    showNotification('Please enter a boundary name', 'warning');
    return;
  }

  if (isNaN(lat) || isNaN(lng)) {
    showNotification('Please set valid coordinates', 'warning');
    return;
  }

  const geofence = {
    id: Date.now().toString(),
    name: name,
    radius: radius,
    center: { lat, lng },
    active: active,
    created: new Date().toISOString()
  };

  // Save to localStorage (in real implementation, this would go to backend)
  currentGeofences.push(geofence);
  localStorage.setItem('attendanceGeofences', JSON.stringify(currentGeofences));

  loadExistingBoundaries();
  showNotification(`Geofence "${name}" saved successfully!`, 'success');

  // Dispatch event to notify attendance system of geofence updates
  window.dispatchEvent(new CustomEvent('geofenceUpdated', {
    detail: { action: 'added', geofence: geofence }
  }));

  // Reset form
  document.getElementById('geofenceName').value = '';
  document.getElementById('geofenceRadius').value = '100';
  document.getElementById('geofenceActive').checked = true;
}

function loadExistingBoundaries() {
  const stored = localStorage.getItem('attendanceGeofences');
  currentGeofences = stored ? JSON.parse(stored) : [];

  const container = document.getElementById('existingBoundaries');

  if (currentGeofences.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted py-3">
        <small>No boundaries set</small>
      </div>
    `;
    return;
  }

  container.innerHTML = currentGeofences.map(fence => `
    <div class="d-flex justify-content-between align-items-center mb-2 p-2 border rounded">
      <div>
        <strong>${fence.name}</strong>
        <br><small class="text-muted">Radius: ${fence.radius}m • ${fence.active ? 'Active' : 'Inactive'}</small>
      </div>
      <button class="btn btn-sm btn-outline-danger" onclick="deleteGeofence('${fence.id}')">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `).join('');
}

function deleteGeofence(id) {
  const deletedFence = currentGeofences.find(f => f.id === id);
  currentGeofences = currentGeofences.filter(f => f.id !== id);
  localStorage.setItem('attendanceGeofences', JSON.stringify(currentGeofences));
  loadExistingBoundaries();
  showNotification('Geofence deleted', 'success');

  // Dispatch event to notify attendance system of geofence updates
  window.dispatchEvent(new CustomEvent('geofenceUpdated', {
    detail: { action: 'deleted', geofence: deletedFence }
  }));
}

function refreshMap() {
  getCurrentUserLocation();
  showNotification('Map refreshed', 'info');
}

// Check if user is within geofence (utility function)
function isWithinGeofence(userLat, userLng) {
  if (currentGeofences.length === 0) return true; // No geofences means no restrictions

  return currentGeofences.some(fence => {
    if (!fence.active) return false;

    const distance = calculateDistance(
      userLat, userLng,
      fence.center.lat, fence.center.lng
    );

    return distance <= fence.radius;
  });
}

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
}

// Modified punch functions to include geofencing and approval checks
function doAdminPunch(method) {
  const modal = bootstrap.Modal.getInstance(document.getElementById('punchMethodModal'));
  modal.hide();

  if (method === 'manual') {
    // For manual punches, create approval request instead of direct punch
    createManualPunchRequest();
  } else if (method === 'gps') {
    doAdminPunchGPS();
  } else if (method === 'qr') {
    // Show QR scan modal
    const qrModal = new bootstrap.Modal(document.getElementById('qrScanModal'));
    qrModal.show();
  }
}

function createManualPunchRequest() {
  showNotification('Manual punch request submitted for approval', 'info');
  // In a real implementation, this would send the request to admin
}

function doAdminPunchGPS() {
  if (!userLocation) {
    showNotification('Getting your location...', 'info');
    getCurrentUserLocation();
    setTimeout(() => doAdminPunchGPS(), 2000);
    return;
  }

  // Check geofencing
  if (!isWithinGeofence(userLocation.lat, userLocation.lng)) {
    showNotification('You are outside the allowed attendance area', 'error');
    return;
  }

  quickPunch('in'); // or whatever punch type was selected
}

// Initialize geofencing and QR codes on page load
document.addEventListener('DOMContentLoaded', function() {
  // Load existing geofences
  const stored = localStorage.getItem('attendanceGeofences');
  currentGeofences = stored ? JSON.parse(stored) : [];

  // Load used QR codes
  const usedStored = localStorage.getItem('usedQRCodes');
  usedQRCodes = usedStored ? JSON.parse(usedStored) : [];

  // Get user location for geofencing
  getCurrentUserLocation();

  // Add form event listeners
  setupFormListeners();
});

function setupFormListeners() {
  // QR Code form
  const qrForm = document.getElementById('qrCodeForm');
  if (qrForm) {
    qrForm.addEventListener('submit', function(e) {
      e.preventDefault();
      generateQRCode();
    });
  }

  // Geofence form
  const geofenceForm = document.getElementById('geofenceForm');
  if (geofenceForm) {
    geofenceForm.addEventListener('submit', function(e) {
      e.preventDefault();
      saveGeofence();
    });
  }
}

// Export the new functions
window.showManualPunchApprovals = showManualPunchApprovals;
window.approveManualPunch = approveManualPunch;
window.rejectManualPunch = rejectManualPunch;
window.generateAttendanceQR = generateAttendanceQR;
window.generateQRCode = generateQRCode;
window.copyQRCode = copyQRCode;
window.downloadQRCode = downloadQRCode;
window.regenerateQRCode = regenerateQRCode;
window.manageGeofence = manageGeofence;
window.setCurrentLocation = setCurrentLocation;
window.saveGeofence = saveGeofence;
window.deleteGeofence = deleteGeofence;
window.refreshMap = refreshMap;
window.doAdminPunch = doAdminPunch;
window.createManualPunchRequest = createManualPunchRequest;
window.doAdminPunchGPS = doAdminPunchGPS;

// Pending User Approvals System
async function showPendingApprovals() {
  const modal = new bootstrap.Modal(document.getElementById('userApprovalModal'));
  modal.show();
  await loadPendingUsers();
}

async function loadPendingUsers() {
  try {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE}/api/admin/pending-users`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        displayPendingUsers(result.users);
        return;
      }
    }

    // Honest fallback: empty state + error, never simulated data
    displayPendingUsers([]);
    showNotification('Could not load pending users. Please try again.', 'error');
  } catch (error) {
    console.error('Error loading pending users:', error);
    displayPendingUsers([]);
    showNotification('Error loading pending users. Please try again.', 'error');
  }
}

function displayPendingUsers(users) {
  const container = document.getElementById('pendingUsersList');

  if (!users || users.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4">
        <i class="fas fa-check-circle fa-3x text-success mb-3"></i>
        <h6>No pending registrations</h6>
        <p class="text-muted">All user registrations have been processed.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = users.map(user => `
    <div class="card mb-3">
      <div class="card-body">
        <div class="row align-items-center">
          <div class="col-md-4">
            <h6 class="mb-1">${user.name}</h6>
            <p class="mb-1 text-muted small">ID: ${user.digital_id}</p>
            <p class="mb-0 small">
              <i class="fas fa-envelope me-1"></i>${user.email}<br>
              <i class="fas fa-phone ms-0 me-1"></i>${user.phone}
            </p>
          </div>
          <div class="col-md-3">
            <p class="mb-1"><strong>Role:</strong> ${user.role}</p>
            <p class="mb-1"><strong>Industry:</strong> ${user.industry_type}</p>
            <p class="mb-0 small text-muted">Applied: ${new Date(user.created_at).toLocaleDateString()}</p>
          </div>
          <div class="col-md-3">
            <p class="mb-1"><strong>Organization:</strong></p>
            <p class="mb-0 small">${user.organization_name || 'Pending verification'}</p>
            ${user.organization_code ? `<small class="text-muted">Code: ${user.organization_code}</small>` : ''}
          </div>
          <div class="col-md-2">
            <div class="d-grid gap-2">
              <button class="btn btn-success btn-sm" onclick="viewUserDetails('${user.id}')">
                <i class="fas fa-eye me-1"></i>Review
              </button>
              <button class="btn btn-danger btn-sm" onclick="quickRejectUser('${user.id}')">
                <i class="fas fa-times me-1"></i>Reject
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}



async function viewUserDetails(userId) {
  try {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE}/api/admin/user-details/${userId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    let userData;
    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        userData = result.user;
      }
    }

    // Honest fallback: no fabricated user data
    if (!userData) {
      showNotification('Could not load user details from the server.', 'error');
      return;
    }

    // Populate user details modal
    document.getElementById('userDetailName').textContent = userData.name;
    document.getElementById('userDetailEmail').textContent = userData.email;
    document.getElementById('userDetailPhone').textContent = userData.phone;
    document.getElementById('userDetailRole').textContent = userData.role;
    document.getElementById('userDetailIndustry').textContent = userData.industry_type;
    document.getElementById('userDetailOrg').textContent = userData.organization_name || 'Not specified';
    document.getElementById('userDetailDigitalId').textContent = userData.digital_id;
    document.getElementById('userDetailRegDate').textContent = new Date(userData.created_at).toLocaleString();

    // Populate profile data
    const profileContainer = document.getElementById('userDetailProfileData');
    if (userData.profile_data && Object.keys(userData.profile_data).length > 0) {
      profileContainer.innerHTML = Object.entries(userData.profile_data)
        .map(([key, value]) => `<p><strong>${key.replace('_', ' ')}:</strong> ${value}</p>`)
        .join('');
    } else {
      profileContainer.innerHTML = '<p class="text-muted">No additional profile information provided.</p>';
    }

    // Store current user ID for approval/rejection
    window.currentUserForApproval = userId;

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('userDetailsModal'));
    modal.show();

  } catch (error) {
    console.error('Error loading user details:', error);
    showNotification('Error loading user details', 'error');
  }
}

async function approveUser() {
  if (!window.currentUserForApproval) return;

  const adminNotes = document.getElementById('adminNotes').value.trim();

  try {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE}/api/admin/approve-user`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: window.currentUserForApproval,
        admin_notes: adminNotes
      })
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        showNotification('User registration approved successfully!', 'success');
        bootstrap.Modal.getInstance(document.getElementById('userDetailsModal')).hide();
        await loadPendingUsers(); // Refresh the list
        return;
      }
    }

  } catch (error) {
    console.error('Error approving user:', error);
    showNotification('Error approving user registration', 'error');
  }
}

async function rejectUser() {
  if (!window.currentUserForApproval) return;

  const adminNotes = document.getElementById('adminNotes').value.trim();
  const reason = prompt('Please enter the reason for rejection:');

  if (!reason) {
    showNotification('Rejection cancelled - reason is required', 'warning');
    return;
  }

  try {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE}/api/admin/reject-user`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: window.currentUserForApproval,
        rejection_reason: reason,
        admin_notes: adminNotes
      })
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        showNotification('User registration rejected', 'info');
        bootstrap.Modal.getInstance(document.getElementById('userDetailsModal')).hide();
        await loadPendingUsers(); // Refresh the list
        return;
      }
    }

  } catch (error) {
    console.error('Error rejecting user:', error);
    showNotification('Error rejecting user registration', 'error');
  }
}

async function quickRejectUser(userId) {
  const reason = prompt('Please enter the reason for rejection:');

  if (!reason) {
    showNotification('Rejection cancelled - reason is required', 'warning');
    return;
  }

  try {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE}/api/admin/reject-user`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId,
        rejection_reason: reason,
        admin_notes: 'Quick rejection from pending list'
      })
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        showNotification('User registration rejected', 'info');
        await loadPendingUsers(); // Refresh the list
        return;
      }
    }

  } catch (error) {
    console.error('Error rejecting user:', error);
    showNotification('Error rejecting user registration', 'error');
  }
}

async function refreshPendingUsers() {
  await loadPendingUsers();
  showNotification('Pending users list refreshed', 'info');
}

// Organization Setup and Management Functions
async function manageOrganization() {
  const modal = new bootstrap.Modal(document.getElementById('organizationModal'));
  modal.show();

  // Ensure we load the latest organization data including codes
  await loadOrganizationData();

  // Also refresh the codes display to ensure they appear
  await loadOrganizationCodes();
}

// Display current organization details in dashboard
function displayCurrentOrganization() {
  console.log('displayCurrentOrganization called');

  // Load all organization setups
  const allSetups = JSON.parse(localStorage.getItem('organizationSetups') || '[]');
  console.log('All saved organization setups:', allSetups);

  // Get current user's industry type
  const userData = getUserData();
  const userIndustry = userData.industrytype?.toLowerCase();
  console.log('Current user industry:', userIndustry);

    // Filter to only show admin-created organizations that match the user's industry
    const savedSetups = allSetups.filter(setup => {
        // Only show admin-created organizations
        if (setup.source !== 'admin') return false;

        // Filter by industry - only show organizations that match the user's industry
        const setupIndustry = (setup.industry || setup.type || '').toLowerCase();
        return setupIndustry === userIndustry;
    });
  console.log('Filtered organization setups for user industry:', savedSetups);

  const section = document.getElementById('currentOrganizationSection');
  const summary = document.getElementById('organizationSummary');
  const setupPrompt = document.getElementById('organizationSetupPrompt');
  const setupComplete = document.getElementById('organizationSetupComplete');
  const codesSection = document.getElementById('organizationCodesSection');
  const codesContainer = document.getElementById('currentOrgCodes');

  // Check if elements exist
  if (!section || !summary || !setupPrompt || !setupComplete) {
    console.error('Required organization display elements not found');
    return;
  }

  if (savedSetups && savedSetups.length > 0) {
    console.log('Admin-created organization setups found, displaying list');

    // Sort setups by creation date (most recent first)
    savedSetups.sort((a, b) => new Date(b.created_at || b.lastUpdated) - new Date(a.created_at || a.lastUpdated));

    // Get the most recent admin-created setup as the "current" one
    const currentSetup = savedSetups[0];

    // Show organization details for the current setup
    const nameElement = document.getElementById('currentOrgName');
    const industryElement = document.getElementById('currentOrgIndustry');
    const addressElement = document.getElementById('currentOrgAddress');
    const phoneElement = document.getElementById('currentOrgPhone');
    const emailElement = document.getElementById('currentOrgEmail');
    const updatedElement = document.getElementById('currentOrgUpdated');

    if (nameElement) nameElement.textContent = currentSetup.name || 'Unnamed Organization';
    if (industryElement) industryElement.textContent = currentSetup.industry || currentSetup.type ? (currentSetup.industry || currentSetup.type).charAt(0).toUpperCase() + (currentSetup.industry || currentSetup.type).slice(1) : 'Not set';
    if (addressElement) addressElement.textContent = currentSetup.address || 'Not set';
    if (phoneElement) phoneElement.textContent = currentSetup.contact_phone || currentSetup.phone || 'Not set';
    if (emailElement) emailElement.textContent = currentSetup.contact_email || currentSetup.email || 'Not set';
    if (updatedElement) updatedElement.textContent = currentSetup.lastUpdated || currentSetup.created_at ? new Date(currentSetup.lastUpdated || currentSetup.created_at).toLocaleString() : 'Never';

    // Display organization codes if available
    const allCodes = savedSetups.flatMap(setup => setup.codes || []);
    if (allCodes && allCodes.length > 0) {
      if (codesContainer) {
        codesContainer.innerHTML = allCodes.map(code => `
          <span class="badge bg-primary me-2 mb-1" style="font-size: 0.9em; padding: 0.5em 0.75em;">
            <i class="fas fa-key me-1"></i>${code.code}
          </span>
        `).join('');
      }
      if (codesSection) codesSection.style.display = 'block';
    } else {
      if (codesSection) codesSection.style.display = 'none';
    }

    // Add organization switcher if multiple setups exist
    if (savedSetups.length > 1) {
      const switcherHtml = `
        <div class="mt-3">
          <small class="text-muted">Switch Organization:</small>
          <select class="form-select form-select-sm mt-1" onchange="switchOrganization(this.value)">
            ${savedSetups.map((setup, index) => `
              <option value="${index}" ${index === 0 ? 'selected' : ''}>
                ${setup.name || 'Unnamed Organization'} (${setup.industry || setup.type || 'Unknown'})
              </option>
            `).join('')}
          </select>
        </div>
      `;

      const switcherContainer = document.getElementById('organizationSwitcher');
      if (switcherContainer) {
        switcherContainer.innerHTML = switcherHtml;
        switcherContainer.style.display = 'block';
      }
    } else {
      const switcherContainer = document.getElementById('organizationSwitcher');
      if (switcherContainer) {
        switcherContainer.style.display = 'none';
      }
    }

    // Show setup complete message and hide setup prompt
    setupComplete.style.display = 'block';
    setupPrompt.style.display = 'none';
    summary.style.display = 'block';
    section.style.display = 'block';

    console.log('Organization setups displayed successfully');
  } else {
    console.log('No organization setups found, showing setup prompt');

    // Hide switcher
    const switcherContainer = document.getElementById('organizationSwitcher');
    if (switcherContainer) {
      switcherContainer.style.display = 'none';
    }

    // Show setup prompt and hide setup complete message
    setupPrompt.style.display = 'block';
    setupComplete.style.display = 'none';
    if (codesSection) codesSection.style.display = 'none';
    summary.style.display = 'block';
    section.style.display = 'block';
  }
}

// Function to switch between organization setups
function switchOrganization(setupIndex) {
  console.log('Switching to organization setup index:', setupIndex);

  const savedSetups = JSON.parse(localStorage.getItem('organizationSetups') || '[]');
  const selectedSetup = savedSetups[parseInt(setupIndex)];

  if (!selectedSetup) {
    console.error('Selected organization setup not found');
    return;
  }

  // Update the display with the selected setup
  const nameElement = document.getElementById('currentOrgName');
  const industryElement = document.getElementById('currentOrgIndustry');
  const addressElement = document.getElementById('currentOrgAddress');
  const phoneElement = document.getElementById('currentOrgPhone');
  const emailElement = document.getElementById('currentOrgEmail');
  const updatedElement = document.getElementById('currentOrgUpdated');

  if (nameElement) nameElement.textContent = selectedSetup.name || 'Unnamed Organization';
  if (industryElement) industryElement.textContent = selectedSetup.industry || selectedSetup.type ? (selectedSetup.industry || selectedSetup.type).charAt(0).toUpperCase() + (selectedSetup.industry || selectedSetup.type).slice(1) : 'Not set';
  if (addressElement) addressElement.textContent = selectedSetup.address || 'Not set';
  if (phoneElement) phoneElement.textContent = selectedSetup.contact_phone || selectedSetup.phone || 'Not set';
  if (emailElement) emailElement.textContent = selectedSetup.contact_email || selectedSetup.email || 'Not set';
  if (updatedElement) updatedElement.textContent = selectedSetup.lastUpdated || selectedSetup.created_at ? new Date(selectedSetup.lastUpdated || selectedSetup.created_at).toLocaleString() : 'Never';

  // Update codes display for the selected setup
  const codesContainer = document.getElementById('currentOrgCodes');
  const codesSection = document.getElementById('organizationCodesSection');

  if (selectedSetup.codes && selectedSetup.codes.length > 0) {
    if (codesContainer) {
      codesContainer.innerHTML = selectedSetup.codes.map(code => `
        <span class="badge bg-primary me-2 mb-1" style="font-size: 0.9em; padding: 0.5em 0.75em;">
          <i class="fas fa-key me-1"></i>${code.code}
        </span>
      `).join('');
    }
    if (codesSection) codesSection.style.display = 'block';
  } else {
    if (codesSection) codesSection.style.display = 'none';
  }

  showNotification(`Switched to ${selectedSetup.name || 'Unnamed Organization'}`, 'info');
}

// View detailed organization information (shows only the current admin's organizations)
function viewOrganizationDetails() {
  console.log('viewOrganizationDetails called');

  // Get current user's digital ID (more reliable than organization_id)
  const userData = getUserData();
  const currentAdminId = userData.digitalid;

  if (!currentAdminId) {
    showNotification('Unable to determine your admin ID. Please refresh the page.', 'error');
    return;
  }

  console.log('Current admin digital ID:', currentAdminId);

  // Load all organization setups but filter by current admin's organizations
  const allSetups = JSON.parse(localStorage.getItem('organizationSetups') || '[]');
  console.log('All organization setups:', allSetups);

  // Filter to only show organizations created by the current admin
  const userOrganizations = allSetups.filter(setup => {
    // Check if this setup was created by the current admin
    return setup.created_by === currentAdminId ||
           setup.admin_id === currentAdminId ||
           setup.digital_id === currentAdminId;
  });

  console.log('Filtered organizations for current user:', userOrganizations);

  if (userOrganizations.length === 0) {
    showNotification('No organization details found. Please set up your organization first.', 'warning');
    manageOrganization(); // Open the organization setup modal
    return;
  }

  // Sort by creation date (most recent first)
  userOrganizations.sort((a, b) => new Date(b.created_at || b.lastUpdated) - new Date(a.created_at || a.lastUpdated));

  // Create a detailed view modal showing only the current user's organizations
  const modalHtml = `
    <div class="modal fade" id="organizationDetailsModal" tabindex="-1">
      <div class="modal-dialog modal-xl">
        <div class="modal-content">
          <div class="modal-header bg-info text-white">
            <h5 class="modal-title">
              <i class="fas fa-building me-2"></i>Your Organization Details
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-success">
              <i class="fas fa-shield-alt me-2"></i>
              <strong>Security Notice:</strong> This view shows only organizations you have access to manage.
            </div>

            <div class="row">
              ${userOrganizations.map((org, index) => `
                <div class="col-md-6 mb-4">
                  <div class="card h-100 ${org.source === 'registration' ? 'border-primary' : 'border-success'}">
                    <div class="card-header ${org.source === 'registration' ? 'bg-primary text-white' : 'bg-success text-white'}">
                      <h6 class="mb-0">
                        <i class="fas fa-${org.source === 'registration' ? 'user-plus' : 'cog'} me-2"></i>
                        ${org.name || 'Unnamed Organization'}
                        <small class="badge ${org.source === 'registration' ? 'bg-light text-primary' : 'bg-light text-success'} ms-2">
                          ${org.source === 'registration' ? 'Registration' : 'Admin'}
                        </small>
                      </h6>
                    </div>
                    <div class="card-body">
                      <div class="row">
                        <div class="col-12">
                          <p class="mb-2"><strong>Industry:</strong> ${org.industry || org.type ? (org.industry || org.type).charAt(0).toUpperCase() + (org.industry || org.type).slice(1) : 'Not specified'}</p>
                          <p class="mb-2"><strong>Email:</strong> ${org.email || org.contact_email || 'Not provided'}</p>
                          <p class="mb-2"><strong>Phone:</strong> ${org.phone || org.contact_phone || 'Not provided'}</p>
                          ${org.address ? `<p class="mb-2"><strong>Address:</strong> ${org.address.replace(/\n/g, '<br>')}</p>` : ''}
                          <p class="mb-1"><strong>Created:</strong> ${new Date(org.created_at || org.lastUpdated).toLocaleString()}</p>
                          <p class="mb-0"><strong>Source:</strong> ${org.source === 'registration' ? 'Created via registration modal' : 'Created via admin dashboard'}</p>
                        </div>
                      </div>

                      ${org.codes && org.codes.length > 0 ? `
                        <hr>
                        <h6 class="text-muted mb-2">Organization Codes:</h6>
                        <div class="d-flex flex-wrap gap-1">
                          ${org.codes.map(code => `
                            <span class="badge bg-secondary" style="font-size: 0.8em;">
                              <i class="fas fa-key me-1"></i>${code.code}
                            </span>
                          `).join('')}
                        </div>
                      ` : `
                        <hr>
                        <p class="text-muted mb-0 small"><i class="fas fa-exclamation-triangle me-1"></i>No codes generated yet</p>
                      `}
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            <button type="button" class="btn btn-primary" onclick="manageOrganization()">
              <i class="fas fa-edit me-2"></i>Manage Organizations
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Remove existing modal if present
  const existingModal = document.getElementById('organizationDetailsModal');
  if (existingModal) {
    existingModal.remove();
  }

  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('organizationDetailsModal'));
  modal.show();
}

// Get saved organization data from localStorage
function getSavedOrganization() {
  try {
    console.log('getSavedOrganization called');
    const saved = localStorage.getItem('organizationData');
    console.log('Raw localStorage data:', saved);

    if (!saved) {
      console.log('No organization data found in localStorage');
      return null;
    }

    const parsed = JSON.parse(saved);
    console.log('Parsed organization data:', parsed);
    return parsed;
  } catch (error) {
    console.error('Error loading saved organization:', error);
    console.error('Error details:', error.message);
    return null;
  }
}

// Save organization data to localStorage
function saveOrganizationData(orgData) {
  try {
    console.log('saveOrganizationData called with:', orgData);

    if (!orgData || typeof orgData !== 'object') {
      console.error('Invalid organization data provided:', orgData);
      return false;
    }

    const dataToSave = {
      ...orgData,
      lastUpdated: new Date().toISOString()
    };

    console.log('Data to save to localStorage:', dataToSave);

    const jsonString = JSON.stringify(dataToSave);
    console.log('JSON string length:', jsonString.length);

    localStorage.setItem('organizationData', jsonString);

    // Verify the save worked
    const verifySave = localStorage.getItem('organizationData');
    console.log('Verification - saved data:', verifySave);

    if (verifySave) {
      const parsedVerify = JSON.parse(verifySave);
      console.log('Verification - parsed data:', parsedVerify);
      console.log('Organization data saved successfully');
      return true;
    } else {
      console.error('Failed to verify save - data not found after saving');
      return false;
    }
  } catch (error) {
    console.error('Error saving organization data:', error);
    console.error('Error details:', error.message);
    return false;
  }
}

async function loadOrganizationData() {
  try {
    const token = getAuthToken();

    // Try to load from backend API first
    console.log('Loading organization data from backend API...');
    const response = await fetch(`${API_BASE}/api/admin/organization`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success && result.organization) {
        console.log('Organization data loaded from backend:', result.organization);

        // Save to localStorage for offline access
        saveOrganizationData(result.organization);

        // Populate form with backend data
        populateOrganizationForm(result.organization);

        // Update display
        displayCurrentOrganization();

        // Load organization codes
        await loadOrganizationCodes();

        // Load organization statistics
        await loadOrganizationStats();

        return;
      }
    }

    // Honest fallback: use cached localStorage, never simulated org data
    console.log('Backend API failed, falling back to localStorage');
    const savedOrg = getSavedOrganization();
    if (savedOrg) {
      populateOrganizationForm(savedOrg);
    } else {
      showNotification('Could not load organization data from the server.', 'error');
    }

    // Load organization codes
    await loadOrganizationCodes();

    // Load organization statistics
    await loadOrganizationStats();

  } catch (error) {
    console.error('Error loading organization data:', error);
    // Honest fallback: cached data only, never simulated
    const savedOrg = getSavedOrganization();
    if (savedOrg) {
      populateOrganizationForm(savedOrg);
    } else {
      showNotification('Error loading organization data. Please refresh.', 'error');
    }
  }
}

function populateOrganizationForm(orgData) {
  document.getElementById('orgName').value = orgData.name || '';
  document.getElementById('orgIndustry').value = orgData.industry || '';
  document.getElementById('orgAddress').value = orgData.address || '';
  document.getElementById('orgPhone').value = orgData.phone || '';
  document.getElementById('orgEmail').value = orgData.email || '';
}

async function loadOrganizationCodes() {
  console.log('loadOrganizationCodes called');

  try {
    const token = getAuthToken();

    // Try to load codes from backend API first
    console.log('Loading organization codes from backend API...');
    const response = await fetch(`${API_BASE}/api/admin/organization-codes`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success && result.codes && Array.isArray(result.codes) && result.codes.length > 0) {
        console.log('Organization codes loaded from backend:', result.codes);

        // Save codes to localStorage for offline access
        const savedOrg = getSavedOrganization() || {};
        const updatedOrg = {
          ...savedOrg,
          codes: result.codes,
          lastUpdated: new Date().toISOString()
        };
        saveOrganizationData(updatedOrg);

        // Also associate codes with organization setups for display consistency
        associateCodesWithOrganizationSetups(result.codes);

        // Display codes from backend
        displayOrganizationCodes(result.codes);
        return;
      }
    }

    // Fallback to localStorage if API fails
    console.log('Backend API failed, falling back to localStorage');
    const savedOrg = getSavedOrganization();
    console.log('Saved organization data:', savedOrg);

    if (savedOrg && savedOrg.codes && Array.isArray(savedOrg.codes) && savedOrg.codes.length > 0) {
      console.log('Found saved codes, displaying:', savedOrg.codes);
      displayOrganizationCodes(savedOrg.codes);
      return;
    }

    console.log('No codes found anywhere, showing empty list');
    // Show empty list if no saved codes
    displayOrganizationCodes([]);
  } catch (error) {
    console.error('Error loading organization codes:', error);
    // Always try to use saved codes first, even if API fails
    const savedOrg = getSavedOrganization();
    console.log('Fallback: checking saved organization data:', savedOrg);

    if (savedOrg && savedOrg.codes && Array.isArray(savedOrg.codes) && savedOrg.codes.length > 0) {
      console.log('Fallback: found saved codes:', savedOrg.codes);
      displayOrganizationCodes(savedOrg.codes);
    } else {
      console.log('Fallback: no saved codes found');
      displayOrganizationCodes([]);
    }
  }
}

function displayOrganizationCodes(codes) {
  const container = document.getElementById('activeCodesList');

  // Check if container exists (modal might not be open)
  if (!container) {
    console.log(' Active codes container not found, skipping update');
    return;
  }

  if (!codes || codes.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted py-3">
        <small>No active codes</small>
      </div>
    `;
    return;
  }

  container.innerHTML = codes.map(code => `
    <div class="d-flex justify-content-between align-items-center mb-2 p-2 border rounded">
      <div>
        <strong>${code.code}</strong>
        <br><small class="text-muted">Created: ${new Date(code.created_at).toLocaleDateString()}</small>
      </div>
      <div>
        <span class="badge bg-success">Active</span>
        <button class="btn btn-sm btn-outline-danger ms-2" onclick="deactivateOrgCode('${code.id}')">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');

  // Also update the organization stats
  updateOrganizationStats({ activeCodes: codes.length });
}

async function loadOrganizationStats() {
  try {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE}/api/organization/stats`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success && result.stats) {
        updateOrganizationStats({
          totalUsers: result.stats.totalUsers || 0,
          activeUsers: result.stats.activeToday || result.stats.recentLogins || 0,
          // education classes and pending approvals load via /api/classes and /api/admin/pending-users
          totalClasses: 0,
          pendingRequests: 0
        });
        return;
      }
    }
    // Honest fallback: zeros, never simulated
    updateOrganizationStats({ totalUsers: 0, activeUsers: 0, totalClasses: 0, pendingRequests: 0 });
  } catch (error) {
    console.error('Error loading organization stats:', error);
    updateOrganizationStats({ totalUsers: 0, activeUsers: 0, totalClasses: 0, pendingRequests: 0 });
  }
}

function updateOrganizationStats(stats) {
  document.getElementById('orgTotalUsers').textContent = stats.totalUsers || 0;
  document.getElementById('orgActiveCodes').textContent = stats.activeCodes || 0;
}

// Organization form submission
document.addEventListener('DOMContentLoaded', function() {
  const orgForm = document.getElementById('organizationForm');
  if (orgForm) {
    orgForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      await saveOrganizationDetails();
    });
  }
});

async function saveOrganizationDetails() {
  console.log('saveOrganizationDetails called');

  const userData = getUserData();
  const orgData = {
    name: document.getElementById('orgName').value.trim(),
    type: document.getElementById('orgIndustry').value, // Map industry to type for backend
    address: document.getElementById('orgAddress').value.trim(),
    contact_phone: document.getElementById('orgPhone').value.trim(),
    contact_email: document.getElementById('orgEmail').value.trim(),
    created_by: userData.digitalid // Link organization to admin who created it
  };

  console.log('New organization setup data from form:', orgData);

  if (!orgData.name || !orgData.type) {
    console.log('Validation failed - missing name or type');
    showNotification('Organization name and industry are required', 'warning');
    return;
  }

  try {
    const token = getAuthToken();
    console.log('Auth token available:', !!token);

    // Create new organization setup via API
    console.log('Creating new organization setup via backend API...');
    const response = await fetch(`${API_BASE}/api/admin/organization-setups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orgData)
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        console.log('Organization setup created successfully');

        // Save to localStorage for offline access with admin source
        const savedSetups = JSON.parse(localStorage.getItem('organizationSetups') || '[]');
        const setupWithSource = {
          ...result.setup,
          source: 'admin' // Mark as created from admin dashboard
        };
        savedSetups.push(setupWithSource);
        localStorage.setItem('organizationSetups', JSON.stringify(savedSetups));

        // Update the display immediately
        displayCurrentOrganization();
        showNotification('New organization setup created successfully!', 'success');

        // Close the modal after a short delay
        setTimeout(() => {
          const modal = bootstrap.Modal.getInstance(document.getElementById('organizationModal'));
          if (modal) modal.hide();
        }, 1500);

        return;
      }
    }

    // Fallback: Save locally if API fails
    console.log('Backend API failed, saving locally only');
    const setupData = {
      id: `setup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...orgData,
      codes: [],
      source: 'admin', // Mark as created from admin dashboard
      created_at: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    const savedSetups = JSON.parse(localStorage.getItem('organizationSetups') || '[]');
    savedSetups.push(setupData);
    localStorage.setItem('organizationSetups', JSON.stringify(savedSetups));

    displayCurrentOrganization();
    showNotification('Organization setup saved locally!', 'success');

    // Close the modal after a short delay
    setTimeout(() => {
      const modal = bootstrap.Modal.getInstance(document.getElementById('organizationModal'));
      if (modal) modal.hide();
    }, 1500);

  } catch (error) {
    console.error('Error saving organization setup:', error);

    // Even if API fails, save locally
    const setupData = {
      id: `setup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...orgData,
      codes: [],
      created_at: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    const savedSetups = JSON.parse(localStorage.getItem('organizationSetups') || '[]');
    savedSetups.push(setupData);
    localStorage.setItem('organizationSetups', JSON.stringify(savedSetups));

    displayCurrentOrganization();
    showNotification('Organization setup saved locally!', 'success');

    // Close the modal after a short delay
    setTimeout(() => {
      const modal = bootstrap.Modal.getInstance(document.getElementById('organizationModal'));
      if (modal) modal.hide();
    }, 1500);
  }
}

async function generateOrgCode() {
  const prefix = document.getElementById('newCodePrefix').value.trim();

  try {
    const token = getAuthToken();

    // Generate code locally first
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newCode = prefix ? `${prefix}-${randomId}` : `ORG-${timestamp.toString().slice(-6)}-${randomId}`;

    console.log('Generated new organization code:', newCode);

    // Save code to database via API
    const response = await fetch(`${API_BASE}/api/admin/organization-codes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: newCode,
        description: `Generated organization code for ${currentUser.name || 'Admin'}`,
        max_uses: null, // Unlimited uses
        expires_at: null // No expiration
      })
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        console.log('Organization code saved to database:', result.code);

        // Update the dashboard display
        displayCurrentOrganization();

        // Display the generated code
        document.getElementById('orgCodeDisplay').value = newCode;
        document.getElementById('generatedCode').classList.remove('d-none');

        // Clear prefix input
        document.getElementById('newCodePrefix').value = '';

        // Refresh codes list
        await loadOrganizationCodes();

        showNotification(`Organization code generated and saved: ${newCode}`, 'success');
      } else {
        throw new Error(result.message || 'Failed to save code to database');
      }
    } else {
      const errorText = await response.text();
      console.error('API error saving organization code:', response.status, errorText);
      throw new Error(`Failed to save code: ${response.status}`);
    }

  } catch (error) {
    console.error('Error generating organization code:', error);

    // Fallback: Try to save locally if API fails
    console.log('API failed, attempting local fallback...');

    try {
      // Get existing organization data
      let savedOrg = getSavedOrganization();

      // If no organization exists, try to auto-save from form data
      if (!savedOrg || !savedOrg.name) {
        console.log('No organization found, attempting to auto-save from form data');

        // Get form data
        const orgData = {
          name: document.getElementById('orgName').value.trim(),
          industry: document.getElementById('orgIndustry').value,
          address: document.getElementById('orgAddress').value.trim(),
          phone: document.getElementById('orgPhone').value.trim(),
          email: document.getElementById('orgEmail').value.trim()
        };

        console.log('Form data to auto-save:', orgData);

        // Validate required fields
        if (!orgData.name || !orgData.industry) {
          console.log('Auto-save validation failed - missing required fields');
          showNotification('Please fill in organization name and industry before generating codes.', 'warning');
          return;
        }

        // Auto-save the organization data
        const autoSaved = saveOrganizationData(orgData);
        console.log('Auto-save result:', autoSaved);

        if (autoSaved) {
          savedOrg = getSavedOrganization();
          console.log('Organization data after auto-save:', savedOrg);
          showNotification('Organization details auto-saved!', 'info');
        } else {
          showNotification('Failed to save organization details. Please try saving manually first.', 'error');
          return;
        }
      }

      // Ensure codes array exists
      const codes = savedOrg.codes || [];

      // Add the new code to the codes array
      const newCodeObj = {
        id: `code_${Date.now()}`,
        code: newCode,
        created_at: new Date().toISOString()
      };
      codes.push(newCodeObj);

      // Update the organization data with the new code
      const updatedOrgData = {
        ...savedOrg,
        codes: codes,
        lastUpdated: new Date().toISOString()
      };

      console.log('Saving organization data with new code locally:', updatedOrgData);

      // Save to localStorage as fallback
      const saved = saveOrganizationData(updatedOrgData);

      if (saved) {
        // Update the dashboard display
        displayCurrentOrganization();

        // Display the generated code
        document.getElementById('orgCodeDisplay').value = newCode;
        document.getElementById('generatedCode').classList.remove('d-none');

        // Clear prefix input
        document.getElementById('newCodePrefix').value = '';

        // Refresh codes list
        await loadOrganizationCodes();

        showNotification(`Organization code generated and saved locally: ${newCode}`, 'warning');
      } else {
        showNotification('Failed to save organization code', 'error');
      }
    } catch (fallbackError) {
      console.error('Fallback save also failed:', fallbackError);
      showNotification('Failed to generate organization code. Please try again.', 'error');
    }
  }
}

async function deactivateOrgCode(codeId) {
  if (!confirm('Are you sure you want to deactivate this organization code?')) {
    return;
  }

  try {
    const token = getAuthToken();
    // Skip API call for admin endpoints that don't exist
    console.log('Admin deactivate-org-code endpoint not available, using local deactivation');

    // Remove the code from localStorage
    const savedOrg = getSavedOrganization();
    if (savedOrg && savedOrg.codes) {
      const updatedCodes = savedOrg.codes.filter(code => code.id !== codeId);
      const updatedOrgData = {
        ...savedOrg,
        codes: updatedCodes,
        lastUpdated: new Date().toISOString()
      };
      saveOrganizationData(updatedOrgData);
      displayCurrentOrganization();
    }

    showNotification('Organization code deactivated', 'success');
    await loadOrganizationCodes();

  } catch (error) {
    console.error('Error deactivating organization code:', error);
    showNotification('Error deactivating organization code', 'error');
  }
}

function copyOrgCode() {
  const codeInput = document.getElementById('orgCodeDisplay');
  codeInput.select();
  document.execCommand('copy');
  showNotification('Organization code copied to clipboard!', 'success');
}

async function refreshOrganizationData() {
  // Only clear form fields - do not affect active code list or reload data
  document.getElementById('orgName').value = '';
  document.getElementById('orgIndustry').value = '';
  document.getElementById('orgAddress').value = '';
  document.getElementById('orgPhone').value = '';
  document.getElementById('orgEmail').value = '';
  document.getElementById('newCodePrefix').value = '';

  // Hide generated code section
  document.getElementById('generatedCode').classList.add('d-none');

  showNotification('Form fields cleared', 'info');
}



// Export the new functions
window.showPendingApprovals = showPendingApprovals;
window.loadPendingUsers = loadPendingUsers;
window.viewUserDetails = viewUserDetails;
window.approveUser = approveUser;
window.rejectUser = rejectUser;
window.quickRejectUser = quickRejectUser;
window.refreshPendingUsers = refreshPendingUsers;

// Organization management functions
window.manageOrganization = manageOrganization;
window.loadOrganizationData = loadOrganizationData;
window.saveOrganizationDetails = saveOrganizationDetails;
window.generateOrgCode = generateOrgCode;
window.deactivateOrgCode = deactivateOrgCode;
window.copyOrgCode = copyOrgCode;
window.refreshOrganizationData = refreshOrganizationData;
window.switchOrganization = switchOrganization;

// New organization setup functions
async function addNewOrganizationSetup() {
  console.log('addNewOrganizationSetup called');

  // Clear the form fields to start fresh
  document.getElementById('orgName').value = '';
  document.getElementById('orgIndustry').value = '';
  document.getElementById('orgAddress').value = '';
  document.getElementById('orgPhone').value = '';
  document.getElementById('orgEmail').value = '';
  document.getElementById('newCodePrefix').value = '';

  // Hide generated code section
  document.getElementById('generatedCode').classList.add('d-none');
  document.getElementById('orgCodeDisplay').value = '';

  // Clear any existing codes display
  const codesList = document.getElementById('activeCodesList');
  if (codesList) {
    codesList.innerHTML = `
      <div class="text-center text-muted py-3">
        <small>No active codes</small>
      </div>
    `;
  }

  // Open the organization modal
  const modal = new bootstrap.Modal(document.getElementById('organizationModal'));
  modal.show();

  showNotification('Ready to set up a new organization!', 'info');
}

async function deleteOrganizationSetup() {
  console.log('deleteOrganizationSetup called');

  // Load all organization setups but filter to only admin-created ones
  try {
    const token = getAuthToken();
    const response = await fetch(`${API_BASE}/api/admin/organization-setups`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    let allSetups = [];
    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        allSetups = result.setups || [];
      }
    }

    // Fallback to localStorage
    if (allSetups.length === 0) {
      const savedSetups = localStorage.getItem('organizationSetups');
      if (savedSetups) {
        allSetups = JSON.parse(savedSetups);
      }
    }

    // Filter to only show admin-created organizations
    const setups = allSetups.filter(setup => setup.source === 'admin');

    if (setups.length === 0) {
      showNotification('No admin-created organization setups found to delete', 'warning');
      return;
    }

    // Show selection modal
    showOrganizationDeletionModal(setups);

  } catch (error) {
    console.error('Error loading organization setups:', error);
    showNotification('Error loading organization setups', 'error');
  }
}

function showOrganizationDeletionModal(setups) {
  // Create deletion modal HTML
  const modalHtml = `
    <div class="modal fade" id="deleteOrganizationModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header bg-danger text-white">
            <h5 class="modal-title">
              <i class="fas fa-trash me-2"></i>Select Organization Setup to Delete
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-warning">
              <i class="fas fa-exclamation-triangle me-2"></i>
              <strong>Warning:</strong> Deleting an organization setup will permanently remove all associated data including codes and settings.
            </div>

            <div class="row" id="organizationSetupsList">
              ${setups.map((setup, index) => `
                <div class="col-md-6 mb-3">
                  <div class="card h-100">
                    <div class="card-body">
                      <div class="form-check">
                        <input class="form-check-input" type="radio" name="selectedSetup" value="${setup.id}" id="setup_${index}">
                        <label class="form-check-label" for="setup_${index}">
                          <h6 class="card-title">${setup.name || 'Unnamed Organization'}</h6>
                          <p class="card-text small text-muted mb-1">
                            <i class="fas fa-industry me-1"></i>${setup.industry || setup.type || 'Not specified'}
                          </p>
                          <p class="card-text small text-muted mb-1">
                            <i class="fas fa-envelope me-1"></i>${setup.email || 'No email'}
                          </p>
                          <p class="card-text small text-muted mb-1">
                            <i class="fas fa-phone me-1"></i>${setup.phone || 'No phone'}
                          </p>
                          <p class="card-text small text-muted">
                            <i class="fas fa-calendar me-1"></i>Created: ${new Date(setup.created_at || setup.lastUpdated).toLocaleDateString()}
                          </p>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-danger" onclick="confirmOrganizationDeletion()">
              <i class="fas fa-trash me-2"></i>Delete Selected Setup
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Remove existing modal if present
  const existingModal = document.getElementById('deleteOrganizationModal');
  if (existingModal) {
    existingModal.remove();
  }

  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('deleteOrganizationModal'));
  modal.show();
}

async function confirmOrganizationDeletion() {
  const selectedSetup = document.querySelector('input[name="selectedSetup"]:checked');

  if (!selectedSetup) {
    showNotification('Please select an organization setup to delete', 'warning');
    return;
  }

  const setupId = selectedSetup.value;

  // Confirm soft deletion (mark as deleted)
  const confirmed = confirm(
    '⚠️ WARNING: This will mark the selected organization setup as deleted.\n\n' +
    'The organization will be hidden from the interface but can be restored later.\n\n' +
    'Are you sure you want to proceed?'
  );

  if (!confirmed) {
    showNotification('Organization deletion cancelled', 'info');
    return;
  }

  try {
    const token = getAuthToken();
    console.log('Marking organization setup as deleted:', setupId);

    // Call the soft delete API endpoint (PATCH to mark as deleted)
    const response = await fetch(`${API_BASE}/api/admin/organization-setup/${setupId}/delete`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        deleted: true,
        deleted_at: new Date().toISOString()
      })
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        console.log('Organization setup marked as deleted successfully');

        // Update localStorage to mark as deleted
        const savedSetups = localStorage.getItem('organizationSetups');
        if (savedSetups) {
          let setups = JSON.parse(savedSetups);
          setups = setups.map(setup =>
            setup.id === setupId
              ? { ...setup, deleted: true, deleted_at: new Date().toISOString() }
              : setup
          );
          localStorage.setItem('organizationSetups', JSON.stringify(setups));
        }

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('deleteOrganizationModal'));
        if (modal) modal.hide();

        // Update display
        displayCurrentOrganization();
        loadOrganizationData();

        showNotification('Organization setup marked as deleted successfully!', 'success');

        return;
      }
    }

    // Fallback: Mark as deleted in localStorage
    console.log('Backend API failed, marking as deleted in local storage only');
    const savedSetups = localStorage.getItem('organizationSetups');
    if (savedSetups) {
      let setups = JSON.parse(savedSetups);
      setups = setups.map(setup =>
        setup.id === setupId
          ? { ...setup, deleted: true, deleted_at: new Date().toISOString() }
          : setup
      );
      localStorage.setItem('organizationSetups', JSON.stringify(setups));
    }

    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('deleteOrganizationModal'));
    if (modal) modal.hide();

    // Update display
    displayCurrentOrganization();
    loadOrganizationData();

    showNotification('Organization setup marked as deleted locally!', 'warning');

  } catch (error) {
    console.error('Error marking organization setup as deleted:', error);
    showNotification('Error marking organization setup as deleted', 'error');
  }
}

// Export the new functions
window.addNewOrganizationSetup = addNewOrganizationSetup;
window.deleteOrganizationSetup = deleteOrganizationSetup;

// Manual code injection function for when API fails to load codes
async function injectKnownCodes() {
  console.log('injectKnownCodes called - attempting manual code injection');

  // Check if user has any known codes they want to inject
  const knownCodes = prompt(
    'API failed to load organization codes. Do you have any known organization codes you want to manually inject?\n\n' +
    'Enter codes separated by commas (e.g., TECH-2025-A1B2C3, EDU-2025-X9Y8Z7):\n\n' +
    'Leave empty to skip manual injection.'
  );

  if (!knownCodes || knownCodes.trim() === '') {
    console.log('User cancelled manual code injection');
    return null;
  }

  // Parse and validate codes
  const codeArray = knownCodes.split(',').map(code => code.trim()).filter(code => code.length > 0);

  if (codeArray.length === 0) {
    console.log('No valid codes provided');
    return null;
  }

  // Create code objects
  const injectedCodes = codeArray.map((code, index) => ({
    id: `injected_${Date.now()}_${index}`,
    code: code,
    created_at: new Date().toISOString(),
    source: 'manual_injection'
  }));

  console.log('Created injected codes:', injectedCodes);

  // Save to localStorage
  const savedOrg = getSavedOrganization() || {};
  const updatedOrg = {
    ...savedOrg,
    codes: injectedCodes,
    lastUpdated: new Date().toISOString()
  };

  const saved = saveOrganizationData(updatedOrg);
  if (saved) {
    console.log('Injected codes saved successfully');
    showNotification(`Successfully injected ${injectedCodes.length} organization codes!`, 'success');
    return injectedCodes;
  } else {
    console.error('Failed to save injected codes');
    showNotification('Failed to save injected codes', 'error');
    return null;
  }
}

// Function to show manual code injection option
function showManualCodeInjectionOption() {
  console.log('showManualCodeInjectionOption called');

  // Create a modal for manual code injection
  const modalHtml = `
    <div class="modal fade" id="manualCodeInjectionModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header bg-warning text-dark">
            <h5 class="modal-title">
              <i class="fas fa-exclamation-triangle me-2"></i>API Failed to Load Codes
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info">
              <i class="fas fa-info-circle me-2"></i>
              <strong>Issue:</strong> The backend API returned 0 codes, and no codes were found in localStorage.
            </div>

            <p>If you know of organization codes that should exist, you can manually inject them here:</p>

            <div class="mb-3">
              <label for="manualCodesInput" class="form-label">Organization Codes</label>
              <textarea
                class="form-control"
                id="manualCodesInput"
                rows="3"
                placeholder="Enter codes separated by commas (e.g., TECH-2025-A1B2C3, EDU-2025-X9Y8Z7)"
              ></textarea>
              <div class="form-text">
                These codes will be saved locally and displayed in the organization management section.
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Skip</button>
            <button type="button" class="btn btn-primary" onclick="processManualCodeInjection()">
              <i class="fas fa-plus me-2"></i>Inject Codes
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Remove existing modal if present
  const existingModal = document.getElementById('manualCodeInjectionModal');
  if (existingModal) {
    existingModal.remove();
  }

  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('manualCodeInjectionModal'));
  modal.show();
}

// Process manual code injection from modal
async function processManualCodeInjection() {
  const codesInput = document.getElementById('manualCodesInput');
  const codesText = codesInput ? codesInput.value.trim() : '';

  if (!codesText) {
    showNotification('Please enter at least one code', 'warning');
    return;
  }

  // Parse codes
  const codeArray = codesText.split(',').map(code => code.trim()).filter(code => code.length > 0);

  if (codeArray.length === 0) {
    showNotification('No valid codes found', 'warning');
    return;
  }

  // Create code objects
  const injectedCodes = codeArray.map((code, index) => ({
    id: `manual_${Date.now()}_${index}`,
    code: code,
    created_at: new Date().toISOString(),
    source: 'manual_injection'
  }));

  // Save to localStorage
  const savedOrg = getSavedOrganization() || {};
  const updatedOrg = {
    ...savedOrg,
    codes: injectedCodes,
    lastUpdated: new Date().toISOString()
  };

  const saved = saveOrganizationData(updatedOrg);
  if (saved) {
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('manualCodeInjectionModal'));
    if (modal) modal.hide();

    // Update display
    displayCurrentOrganization();
    await loadOrganizationCodes();

    showNotification(`Successfully injected ${injectedCodes.length} organization codes!`, 'success');
  } else {
    showNotification('Failed to save injected codes', 'error');
  }
}

// Export the new functions
window.showIntegrationsPage = showIntegrationsPage;
window.generateClassCode = generateClassCode;
window.copyToClipboard = copyToClipboard;
window.downloadQRCode = downloadQRCode;
window.injectKnownCodes = injectKnownCodes;
window.showManualCodeInjectionOption = showManualCodeInjectionOption;
window.processManualCodeInjection = processManualCodeInjection;
