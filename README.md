# Universal Attendance Management System

A comprehensive, multi-tenant attendance tracking system built with Node.js, Express, and SQLite. Features industry-specific solutions, QR code-based attendance, GPS tracking, and detailed reporting for healthcare, education, corporate, manufacturing, government, and retail sectors.

## 🎯 Core Features

### Authentication & Security
- 🔐 **JWT Authentication** - Secure login with JSON Web Tokens and bcrypt password hashing
- 👤 **Role-Based Access Control** - Admin, Teacher, Student, and custom role permissions
- 🏢 **Multi-Tenant Architecture** - Support for multiple organizations with isolated data
- ✅ **Email Verification** - User account verification system
- 🔑 **Password Reset** - Secure password reset functionality
- 🛡️ **Organization Codes** - Registration verification with unique organization codes

### Attendance Tracking
- 📱 **QR Code Attendance** - Generate and scan QR codes for quick attendance marking
- 📍 **GPS Location Tracking** - Verify user location with GPS coordinates and geofencing
- ⏰ **Multiple Punch Types** - In, Out, Break Start, Break End tracking
- 📋 **Manual Punch Requests** - Users can request attendance with admin approval workflow
- 🔄 **Single-Use QR Codes** - Secure, time-limited QR codes with usage tracking
- 📊 **Real-time Tracking** - Live attendance monitoring and updates

### Education Industry Features
- 🏫 **Class Management** - Create and manage classes with subjects and schedules
- 👨‍🏫 **Faculty Management** - Assign teachers to classes and subjects
- 📚 **Subject-wise Attendance** - Track attendance per subject with detailed reporting
- 📅 **Class Schedules** - Weekly recurring schedules with room assignments
- 🎓 **Lecture Management** - Schedule individual lectures with status tracking
- 👥 **Student Enrollment** - Self-enrollment and admin-managed student registration
- 📈 **Attendance Percentage** - Automatic calculation per subject and overall
- 🕐 **Late Arrival & Early Departure** - Track punctuality metrics

### Industry-Specific Solutions
- 🏥 **Healthcare** - Patient-staff ratios, shift management, compliance tracking
- 🏭 **Manufacturing** - Shift scheduling, safety compliance, production tracking
- 🏛️ **Government** - Public sector compliance, security clearance tracking
- 🏢 **Corporate** - Remote work tracking, flexible scheduling, productivity analytics
- 🏪 **Retail** - Multi-location management, seasonal staffing, sales integration

### Dashboard & Reporting
- 📊 **Real-time Dashboards** - Industry-specific admin and user dashboards
- 📈 **Detailed Reports** - Generate attendance reports with advanced filtering
- 📉 **Analytics** - Visual charts and statistics for attendance patterns
- 📱 **Mobile Responsive** - Progressive Web App for native experience on all devices
- 🔍 **Search & Filter** - Advanced search capabilities across all data

### Integrations
- 🎓 **Google Classroom** - Sync courses, students, and attendance data
- 📱 **Teach Us App** - Push/pull attendance data to external systems
- 🔌 **API Access** - RESTful APIs for custom integrations
- 📧 **Email Notifications** - Automated alerts for attendance updates and approvals

### Administration
- 👥 **User Management** - Add, update, and manage user accounts
- 🏢 **Organization Management** - Configure multiple organizations with custom settings
- 📧 **Email Configuration** - Custom SMTP settings for notifications
- ⚙️ **System Settings** - Flexible configuration for different industries
- 📋 **Audit Trails** - Track all changes and actions with timestamps

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: SQLite3
- **Authentication**: JSON Web Tokens (JWT), bcryptjs
- **QR Codes**: QRCode generation and validation
- **Email**: Nodemailer for SMTP
- **Integrations**: Google APIs, Axios for external services
- **Validation**: Express Validator

### Frontend
- **HTML5**: Semantic markup
- **CSS3**: Custom styling with Bootstrap 5.3.2
- **JavaScript**: Vanilla JS with modern ES6+
- **Icons**: Font Awesome 6.5.0
- **Design**: Responsive, mobile-first approach

## 📦 Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- SQLite3 (automatically installed via npm)

### Setup Steps

```bash
# Clone the repository
git clone https://github.com/Khan-source-cmd/attendance-system.git

# Navigate to project directory
cd attendance-system

# Install backend dependencies
cd backend && npm install

# Return to root and install root dependencies
cd .. && npm install

# Copy environment configuration
cp backend/.env.example backend/.env
# Edit backend/.env with your configuration

# Initialize the database
npm run init-db

# Start the application
npm start
```

The application will be available at `http://localhost:4000`

## ⚙️ Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Server Configuration
PORT=4000
NODE_ENV=production

# Database
DB_PATH=./database.db

# JWT Secrets
JWT_SECRET=your_secure_jwt_secret_key_here
JWT_RESET_SECRET=your_password_reset_secret_key_here

# Email Configuration (Gmail example)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Google Classroom Integration (Optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:4000/api/integrations/google/callback

# Teach Us App Integration (Optional)
TEACHUS_API_KEY=your_teachus_api_key
TEACHUS_API_SECRET=your_teachus_api_secret
TEACHUS_ENDPOINT=https://api.teachus.com/v1
```

## 📁 Project Structure

```
attendance-system/
├── backend/
│   ├── config/
│   │   ├── .env                    # Environment variables
│   │   ├── database.db             # SQLite database file
│   │   └── env.js                  # Environment configuration
│   ├── controllers/
│   │   ├── adminController.js      # Admin operations
│   │   ├── attendanceController.js # Attendance management
│   │   ├── authController.js       # Authentication logic
│   │   ├── classScheduleController.js # Class scheduling
│   │   ├── facultyController.js    # Faculty management
│   │   ├── industryController.js   # Industry-specific features
│   │   ├── integrationController.js # Third-party integrations
│   │   └── userController.js       # User management
│   ├── middleware/
│   │   ├── auth.js                 # JWT authentication
│   │   ├── cors.js                 # CORS configuration
│   │   └── validation.js           # Input validation
│   ├── models/
│   │   ├── Attendance.js           # Attendance model
│   │   ├── ClassSchedule.js        # Class schedule model
│   │   ├── Faculty.js              # Faculty model
│   │   ├── Organization.js         # Organization model
│   │   ├── QRCode.js               # QR code model
│   │   └── User.js                 # User model
│   ├── routes/
│   │   ├── admin.js                # Admin routes
│   │   ├── attendance.js           # Attendance routes
│   │   ├── auth.js                 # Authentication routes
│   │   ├── faculty.js              # Faculty routes
│   │   ├── organization.js         # Organization routes
│   │   ├── reports.js              # Report generation routes
│   │   └── student.js              # Student routes
│   ├── utils/
│   │   ├── email.js                # Email utilities
│   │   ├── helpers.js              # Helper functions
│   │   └── validators.js           # Validation utilities
│   ├── index.js                    # Main server entry point
│   ├── init-db.js                  # Database initialization
│   └── package.json                # Backend dependencies
├── frontend/
│   ├── assets/
│   │   └── css/                    # Custom stylesheets
│   ├── img/                        # Images and icons
│   ├── js/
│   │   ├── admin-dashboard.js      # Admin dashboard logic
│   │   ├── app.js                  # Main application logic
│   │   ├── attendance.js           # Attendance functionality
│   │   ├── auth.js                 # Authentication logic
│   │   ├── class-schedule.js       # Class scheduling
│   │   ├── faculty-management.js   # Faculty management
│   │   ├── navigation-fix.js       # Navigation utilities
│   │   └── utils.js                # Frontend utilities
│   └── pages/
│       ├── index.html              # Landing page
│       ├── register.html           # Registration & login
│       ├── admin-dashboard.html    # Admin dashboard
│       ├── user-dashboard.html     # User dashboard
│       ├── teacher-dashboard.html  # Teacher dashboard
│       ├── admin-attendance.html   # Attendance management
│       ├── class-management.html   # Class management
│       ├── class-schedule.html     # Schedule management
│       ├── faculty-classes.html    # Faculty class view
│       ├── reports.html            # Reports page
│       ├── history.html            # Attendance history
│       ├── profile.html            # User profile
│       ├── settings.html           # User settings
│       ├── integrations.html       # Third-party integrations
│       ├── corporate-*.html        # Corporate industry pages
│       ├── education-*.html        # Education industry pages
│       ├── healthcare-*.html       # Healthcare industry pages
│       ├── manufacturing-*.html    # Manufacturing industry pages
│       ├── government-*.html       # Government industry pages
│       └── retail-*.html           # Retail industry pages
├── package.json                    # Root dependencies
├── init-db.js                      # Database initialization script
└── README.md                       # This file
```

## 🗄️ Database Schema

### Core Tables
- **organizations** - Multi-tenant organization data
- **users** - User accounts with role-based access
- **attendance** - General attendance records
- **pending_requests** - Manual punch approval workflow
- **qr_codes** - QR code generation and tracking
- **organization_codes** - Registration verification codes

### Education Industry Tables
- **subjects** - Subject definitions
- **classes** - Class groups and sections
- **class_subjects** - Class-subject-teacher associations
- **students** - Student enrollment records
- **lectures** - Individual lecture instances
- **subject_attendance** - Per-subject attendance tracking
- **class_schedules** - Weekly recurring schedules
- **faculty** - Faculty/staff records
- **faculty_classes** - Faculty-class associations

### Industry-Specific Tables
- **departments** - Departments, wards, facilities
- **Organization_setups** - Organization configurations

## 🚀 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password
- `GET /api/auth/validate-org-code` - Validate organization code

### Attendance
- `POST /api/attendance/mark` - Mark attendance (QR/GPS/Manual)
- `GET /api/attendance/history` - Get attendance history
- `GET /api/attendance/summary` - Get attendance summary
- `POST /api/attendance/request` - Submit manual punch request
- `GET /api/attendance/pending` - Get pending requests (Admin)

### Admin
- `GET /api/admin/users` - Get all users
- `POST /api/admin/users` - Create user
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user
- `GET /api/admin/organizations` - Get organizations
- `POST /api/admin/organizations` - Create organization

### Faculty/Teacher
- `GET /api/faculty/classes` - Get assigned classes
- `GET /api/faculty/students` - Get students in class
- `POST /api/faculty/attendance` - Mark student attendance
- `GET /api/faculty/schedule` - Get teaching schedule

### Student
- `GET /api/student/schedule` - Get student schedule
- `GET /api/student/enrolled-classes` - Get enrolled classes
- `POST /api/student/enroll` - Enroll in class
- `GET /api/student/attendance/summary` - Get attendance summary

### Reports
- `GET /api/reports/attendance` - Generate attendance reports
- `GET /api/reports/export` - Export reports (CSV/PDF)
- `GET /api/reports/analytics` - Get analytics data

### Integrations
- `GET /api/integrations/google/auth-url` - Google OAuth URL
- `GET /api/integrations/google/callback` - Google OAuth callback
- `POST /api/integrations/google/sync` - Sync Google Classroom
- `POST /api/integrations/teachus/push` - Push to Teach Us
- `GET /api/integrations/teachus/pull` - Pull from Teach Us

## 🎨 Industry-Specific Dashboards

The system provides customized dashboards for each industry:

- **Healthcare**: Staff scheduling, shift management, compliance tracking
- **Education**: Class management, subject attendance, student performance
- **Corporate**: Remote work tracking, project allocation, productivity metrics
- **Manufacturing**: Shift schedules, safety compliance, production tracking
- **Government**: Security clearance, compliance reporting, audit trails
- **Retail**: Multi-location management, seasonal staffing, sales correlation

## 🔧 Development

### Available Scripts

```bash
# Install all dependencies
npm install

# Initialize database
npm run init-db

# Start development server
npm start

# Backend only
cd backend && npm start
```

### Database Initialization

The database is automatically initialized when the server starts. The schema includes:
- 15+ tables for comprehensive data management
- Foreign key constraints for data integrity
- Indexes for optimized queries
- Support for multi-tenant data isolation

## 🔐 Security Features

- JWT-based authentication with secure secrets
- Password hashing with bcrypt
- CORS configuration for cross-origin requests
- Input validation and sanitization
- SQL injection prevention with parameterized queries
- Role-based access control
- Organization-level data isolation
- Audit logging for all critical operations

## 📱 Mobile Support

- Responsive design for all screen sizes
- Progressive Web App (PWA) capabilities
- Touch-friendly interface
- Mobile-optimized QR code scanning
- Offline capability for essential functions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the ISC License.

## 👨‍💻 Author

**Abdul Rehman Khan**

## 📞 Support

For support and inquiries:
- Create an issue in the GitHub repository
- Email: kabdulrehman8169@gmail.com

## 🗺️ Roadmap

- [ ] Biometric authentication integration
- [ ] Face recognition attendance
- [ ] Mobile app (React Native/Flutter)
- [ ] Advanced analytics with ML predictions
- [ ] Multi-language support
- [ ] SMS notifications
- [ ] WhatsApp integration
- [ ] Payroll system integration
- [ ] Advanced scheduling with AI optimization

## 🙏 Acknowledgments

- Express.js community
- SQLite team
- Bootstrap team
- Font Awesome for icons
- All contributors and users

---

**Built with ❤️ for better workforce and student management**