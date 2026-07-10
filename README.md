# Attendance Management System

A comprehensive attendance tracking system built with Node.js, Express, and SQLite. Features QR code-based attendance marking, real-time tracking, and detailed reporting.

## Features

- 🔐 **User Authentication** - Secure login with JWT tokens and bcrypt password hashing
- 📱 **QR Code Attendance** - Generate and scan QR codes for quick attendance marking
- 📊 **Dashboard** - Real-time attendance statistics and visual reports
- 👥 **Student Management** - Add, update, and manage student records
- 🏫 **Class Management** - Organize students into classes and sections
- 📈 **Reports** - Generate detailed attendance reports with filtering options
- 📧 **Email Notifications** - Automated email alerts for attendance updates
- 🔍 **Search & Filter** - Easy search and filter capabilities

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite3
- **Authentication**: JSON Web Tokens (JWT), bcryptjs
- **Frontend**: HTML, CSS, JavaScript
- **Other**: QRCode, Nodemailer, Express Validator

## Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/attendance-system.git

# Navigate to project
cd attendance-system

# Install backend dependencies
cd backend && npm install

# Install root dependencies
cd .. && npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Initialize the database
npm run init-db

# Start the server
npm start
```

## Environment Variables

Create a `.env` file in the `backend/` directory:

```
PORT=4000
DB_PATH=./database.db
JWT_SECRET=your_secret_key
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

## Project Structure

```
attendance-system/
├── backend/
│   ├── config/         # Configuration files
│   ├── controllers/    # Route controllers
│   ├── middleware/      # Express middleware
│   ├── models/         # Database models
│   ├── routes/         # API routes
│   ├── utils/          # Utility functions
│   └── index.js        # Main server file
├── frontend/
│   ├── assets/         # CSS and static assets
│   ├── img/            # Images
│   ├── js/             # Frontend JavaScript
│   └── pages/          # HTML pages
└── package.json