/**
 * Universal Attendance System - Attendance Controller
 * Handles attendance tracking, QR code generation, and reporting
 */

const Attendance = require('../models/Attendance');
const User = require('../models/User');
const QRCode = require('../models/QRCode');
const { validationResult } = require('express-validator');
const { generateQRCode, validateLocation } = require('../utils/helpers');

class AttendanceController {
    constructor() {
        this.locationTolerance = 100; // meters
        this.qrCodeValidity = 24 * 60 * 60 * 1000; // 24 hours
    }

    // Manual punch in/out
    async punchAttendance(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const {
                punch_type,
                notes = '',
                location_data = null
            } = req.body;

            const digital_id = req.user.digital_id;

            // Validate punch type
            if (!['in', 'out', 'break_start', 'break_end'].includes(punch_type)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid punch type'
                });
            }

            // Check for duplicate punches within short time frame
            const recentPunch = await Attendance.findRecentPunch(digital_id, 60); // 1 minute
            if (recentPunch && recentPunch.punch_type === punch_type) {
                return res.status(400).json({
                    success: false,
                    message: `You already punched ${punch_type} recently`
                });
            }

            // Validate sequence (can't punch out without punching in)
            if (punch_type === 'out') {
                const lastPunch = await Attendance.findLastPunch(digital_id);
                if (!lastPunch || lastPunch.punch_type !== 'in') {
                    return res.status(400).json({
                        success: false,
                        message: 'You must punch in before punching out'
                    });
                }
            }

            // Create attendance record
            const attendanceData = {
                digital_id,
                organization_id: req.user.organization_id || 1,
                punch_type,
                attendance_method: 'manual',
                location_data: JSON.stringify(location_data),
                notes,
                timestamp: new Date()
            };

            const attendance = await Attendance.create(attendanceData);

            // Log attendance event
            console.log(`Attendance recorded: ${digital_id} - ${punch_type} at ${new Date()}`);

            // Send response with appropriate message
            const messages = {
                in: 'Successfully punched in',
                out: 'Successfully punched out',
                break_start: 'Break started',
                break_end: 'Break ended'
            };

            res.json({
                success: true,
                message: messages[punch_type],
                attendance: {
                    id: attendance.id,
                    punch_type: attendance.punch_type,
                    timestamp: attendance.timestamp,
                    method: attendance.attendance_method
                }
            });

        } catch (error) {
            console.error('Punch attendance error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to record attendance'
            });
        }
    }

    // QR Code attendance
    async punchWithQR(req, res) {
        try {
            const {
                qr_data,
                punch_type,
                location_data = null
            } = req.body;

            const digital_id = req.user.digital_id;

            if (!qr_data || !punch_type) {
                return res.status(400).json({
                    success: false,
                    message: 'QR data and punch type are required'
                });
            }

            // Parse and validate QR data
            let parsedQRData;
            try {
                parsedQRData = JSON.parse(qr_data);
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid QR code format'
                });
            }

            // Verify QR code in database
            const qrCode = await QRCode.findByCode(qr_data);
            if (!qrCode) {
                return res.status(404).json({
                    success: false,
                    message: 'QR code not found'
                });
            }

            if (!qrCode.is_active) {
                return res.status(400).json({
                    success: false,
                    message: 'QR code is no longer active'
                });
            }

            // Check QR code expiration
            if (new Date() > new Date(qrCode.valid_until)) {
                await QRCode.deactivate(qrCode.id);
                return res.status(400).json({
                    success: false,
                    message: 'QR code has expired'
                });
            }

            // Validate location if provided
            if (location_data && parsedQRData.coordinates) {
                const distance = this.calculateDistance(
                    location_data.latitude,
                    location_data.longitude,
                    parsedQRData.coordinates.latitude,
                    parsedQRData.coordinates.longitude
                );

                if (distance > this.locationTolerance) {
                    return res.status(400).json({
                        success: false,
                        message: 'You are not within the required location range'
                    });
                }
            }

            // Check for duplicate punches
            const recentPunch = await Attendance.findRecentPunch(digital_id, 60);
            if (recentPunch && recentPunch.punch_type === punch_type) {
                return res.status(400).json({
                    success: false,
                    message: `You already punched ${punch_type} recently`
                });
            }

            // Create attendance record
            const attendanceData = {
                digital_id,
                organization_id: req.user.organization_id || 1,
                punch_type,
                attendance_method: 'qr',
                location_data: JSON.stringify({
                    ...location_data,
                    qr_location: qrCode.location_name
                }),
                notes: `QR scan at ${qrCode.location_name}`,
                timestamp: new Date()
            };

            const attendance = await Attendance.create(attendanceData);

            // Update QR code usage stats
            await QRCode.incrementUsage(qrCode.id);

            // Log QR attendance event
            console.log(`QR Attendance: ${digital_id} - ${punch_type} at ${qrCode.location_name}`);

            res.json({
                success: true,
                message: `${punch_type.toUpperCase()} recorded successfully at ${qrCode.location_name}`,
                location: qrCode.location_name,
                attendance: {
                    id: attendance.id,
                    punch_type: attendance.punch_type,
                    timestamp: attendance.timestamp,
                    method: attendance.attendance_method,
                    location: qrCode.location_name
                }
            });

        } catch (error) {
            console.error('QR punch error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to process QR attendance'
            });
        }
    }

    // Generate QR Code for location (Admin only)
    async generateQRCode(req, res) {
        try {
            const {
                location_name,
                coordinates = null,
                valid_hours = 24
            } = req.body;

            if (!location_name) {
                return res.status(400).json({
                    success: false,
                    message: 'Location name is required'
                });
            }

            // Create QR data
            const qrData = {
                type: 'attendance_location',
                location: location_name,
                coordinates,
                org_id: req.user.organization_id || 1,
                created_at: new Date().toISOString(),
                valid_until: new Date(Date.now() + (valid_hours * 60 * 60 * 1000)).toISOString()
            };

            const qrCodeString = JSON.stringify(qrData);

            // Generate QR code image
            const qrCodeImage = await generateQRCode(qrCodeString);

            // Save QR code to database
            const qrCodeData = {
                organization_id: req.user.organization_id || 1,
                code: qrCodeString,
                location_name,
                coordinates: coordinates ? JSON.stringify(coordinates) : null,
                valid_until: new Date(Date.now() + (valid_hours * 60 * 60 * 1000)),
                created_by: req.user.digital_id,
                is_active: true
            };

            const savedQRCode = await QRCode.create(qrCodeData);

            // Log QR generation
            console.log(`QR Code generated: ${location_name} by ${req.user.digital_id}`);

            res.json({
                success: true,
                message: 'QR code generated successfully',
                qr_code: qrCodeImage,
                qr_id: savedQRCode.id,
                location_name,
                valid_until: qrCodeData.valid_until,
                valid_hours
            });

        } catch (error) {
            console.error('QR generation error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate QR code'
            });
        }
    }

    // Get user's attendance history
    async getAttendanceHistory(req, res) {
        try {
            const digital_id = req.user.digital_id;
            const {
                limit = 50,
                offset = 0,
                from_date = null,
                to_date = null,
                punch_type = null
            } = req.query;

            const filters = {
                digital_id,
                from_date,
                to_date,
                punch_type
            };

            const history = await Attendance.findUserHistory(filters, {
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            const total = await Attendance.countUserHistory(filters);

            // Process history for response
            const processedHistory = history.map(record => ({
                id: record.id,
                punch_type: record.punch_type,
                timestamp: record.timestamp,
                attendance_method: record.attendance_method,
                location_data: record.location_data ? JSON.parse(record.location_data) : null,
                notes: record.notes
            }));

            res.json({
                success: true,
                history: processedHistory,
                pagination: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    has_more: (parseInt(offset) + parseInt(limit)) < total
                }
            });

        } catch (error) {
            console.error('Get history error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve attendance history'
            });
        }
    }

    // Get attendance statistics
    async getAttendanceStats(req, res) {
        try {
            const digital_id = req.user.digital_id;
            const { period = 'month' } = req.query;

            // Calculate date range based on period
            const now = new Date();
            let startDate;

            switch (period) {
                case 'week':
                    startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
                    break;
                case 'month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
                case 'year':
                    startDate = new Date(now.getFullYear(), 0, 1);
                    break;
                default:
                    startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
            }

            const stats = await Attendance.getStatistics(digital_id, startDate, now);

            res.json({
                success: true,
                stats: {
                    period,
                    start_date: startDate,
                    end_date: now,
                    ...stats
                }
            });

        } catch (error) {
            console.error('Get stats error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve attendance statistics'
            });
        }
    }

    // Get current attendance status
    async getCurrentStatus(req, res) {
        try {
            const digital_id = req.user.digital_id;

            // Get last punch of the day
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const lastPunch = await Attendance.findLastPunchAfter(digital_id, today);

            let status = 'not_started';
            let last_action = null;
            let total_hours_today = 0;

            if (lastPunch) {
                status = lastPunch.punch_type === 'in' ? 'checked_in' : 'checked_out';
                last_action = {
                    type: lastPunch.punch_type,
                    timestamp: lastPunch.timestamp,
                    method: lastPunch.attendance_method
                };

                // Calculate total hours for today
                const todayPunches = await Attendance.findDayPunches(digital_id, today);
                total_hours_today = this.calculateDailyHours(todayPunches);
            }

            res.json({
                success: true,
                status: {
                    current_status: status,
                    last_action,
                    total_hours_today,
                    date: today.toISOString().split('T')[0]
                }
            });

        } catch (error) {
            console.error('Get status error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve attendance status'
            });
        }
    }

    // Admin: Get all attendance logs
    async getAllAttendanceLogs(req, res) {
        try {
            const {
                limit = 100,
                offset = 0,
                from_date = null,
                to_date = null,
                digital_id = null,
                punch_type = null,
                method = null
            } = req.query;

            const filters = {
                from_date,
                to_date,
                digital_id,
                punch_type,
                method
            };

            const logs = await Attendance.findAllLogs(filters, {
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            const total = await Attendance.countAllLogs(filters);

            // Process logs with user information
            const processedLogs = logs.map(log => ({
                id: log.id,
                digital_id: log.digital_id,
                name: log.name,
                role: log.role,
                industry_type: log.industry_type,
                punch_type: log.punch_type,
                timestamp: log.timestamp,
                attendance_method: log.attendance_method,
                location_data: log.location_data ? JSON.parse(log.location_data) : null,
                notes: log.notes
            }));

            res.json({
                success: true,
                logs: processedLogs,
                pagination: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset),
                    has_more: (parseInt(offset) + parseInt(limit)) < total
                }
            });

        } catch (error) {
            console.error('Get all logs error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve attendance logs'
            });
        }
    }

    // Admin: Get attendance summary
    async getAttendanceSummary(req, res) {
        try {
            const {
                period = 'month',
                industry = null,
                role = null
            } = req.query;

            const now = new Date();
            let startDate;

            switch (period) {
                case 'week':
                    startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
                    break;
                case 'month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
                case 'year':
                    startDate = new Date(now.getFullYear(), 0, 1);
                    break;
                default:
                    startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
            }

            const summary = await Attendance.getSystemSummary(startDate, now, {
                industry,
                role
            });

            res.json({
                success: true,
                summary: {
                    period,
                    start_date: startDate,
                    end_date: now,
                    ...summary
                }
            });

        } catch (error) {
            console.error('Get summary error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve attendance summary'
            });
        }
    }

    // Helper Methods
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in meters
    }

    calculateDailyHours(punches) {
        if (punches.length < 2) return 0;

        let totalMinutes = 0;
        let lastInTime = null;

        for (const punch of punches) {
            if (punch.punch_type === 'in') {
                lastInTime = new Date(punch.timestamp);
            } else if (punch.punch_type === 'out' && lastInTime) {
                const outTime = new Date(punch.timestamp);
                const diffMinutes = (outTime - lastInTime) / (1000 * 60);
                totalMinutes += diffMinutes;
                lastInTime = null;
            }
        }

        return Math.round(totalMinutes / 60 * 100) / 100; // Hours with 2 decimal places
    }
}

module.exports = new AttendanceController();
