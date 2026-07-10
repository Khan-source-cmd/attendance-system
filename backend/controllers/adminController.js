/**
 * Admin Controller: Manage all system admin functions - user and attendance management
 */
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const QRCode = require('../models/QRCode');

class AdminController {
    // List all users with optional filters
    async listUsers(req, res) {
        try {
            const { role, industry, status, search } = req.query;

            const filters = {};
            if (role) filters.role = role;
            if (industry) filters.industry = industry;
            if (status) filters.status = status;
            if (search) filters.search = search;

            const users = await User.findAll(filters);

            res.json({
                success: true,
                users
            });
        } catch (error) {
            console.error('List users error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve users'
            });
        }
    }

    // Update user status (approve, disapprove, activate, deactivate)
    async updateUserStatus(req, res) {
        try {
            const { digital_id, is_active, is_approved } = req.body;

            if (!digital_id) {
                return res.status(400).json({
                    success: false,
                    message: 'User identifier is required'
                });
            }

            await User.updateStatus(digital_id, { is_active, is_approved });

            res.json({
                success: true,
                message: 'User status updated'
            });
        } catch (error) {
            console.error('Update user status error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update user status'
            });
        }
    }

    // List all attendance logs with filters and pagination
    async listAttendanceLogs(req, res) {
        try {
            const { filter_user, filter_role, filter_industry, from_date, to_date, page = 1, limit = 50 } = req.query;

            const filters = {
                user: filter_user,
                role: filter_role,
                industry: filter_industry,
                from_date,
                to_date
            };

            const offset = (page - 1) * limit;

            const logs = await Attendance.findAll(filters, { offset, limit });
            const total = await Attendance.count(filters);

            res.json({
                success: true,
                logs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            console.error('List attendance logs error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve attendance logs'
            });
        }
    }

    // Generate reports (placeholder for analytics and reports)
    async generateReport(req, res) {
        try {
            // Placeholder: Implement report generation logic based on filters and report type
            res.json({
                success: true,
                report_url: '/reports/sample-report.pdf'
            });
        } catch (error) {
            console.error('Generate report error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate report'
            });
        }
    }
}

module.exports = new AdminController();
