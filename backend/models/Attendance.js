/**
 * Attendance Model - Database operations for attendance records
 */

const { db } = require('../utils/helpers');

class Attendance {
    // Create a new attendance record
    static create(attendanceData) {
        return new Promise((resolve, reject) => {
            const {
                digital_id, organization_id, punch_type, attendance_method = 'manual',
                location_data, notes = '', timestamp = new Date()
            } = attendanceData;

            const sql = `
                INSERT INTO attendance (
                    digital_id, organization_id, punch_type, attendance_method,
                    location_data, notes, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `;

            const params = [
                digital_id, organization_id, punch_type, attendance_method,
                location_data, notes, timestamp
            ];

            db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ 
                        id: this.lastID, 
                        digital_id,
                        punch_type,
                        timestamp,
                        attendance_method
                    });
                }
            });
        });
    }

    // Find recent punch within specified minutes
    static findRecentPunch(digitalId, withinMinutes = 1) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM attendance 
                WHERE digital_id = ? 
                AND datetime(timestamp) >= datetime('now', '-${withinMinutes} minutes')
                ORDER BY timestamp DESC 
                LIMIT 1
            `;

            db.get(sql, [digitalId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Find last punch for a user
    static findLastPunch(digitalId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM attendance 
                WHERE digital_id = ? 
                ORDER BY timestamp DESC 
                LIMIT 1
            `;

            db.get(sql, [digitalId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Find last punch after specific date
    static findLastPunchAfter(digitalId, afterDate) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM attendance 
                WHERE digital_id = ? 
                AND date(timestamp) >= date(?)
                ORDER BY timestamp DESC 
                LIMIT 1
            `;

            db.get(sql, [digitalId, afterDate.toISOString()], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Find all punches for a specific day
    static findDayPunches(digitalId, date) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM attendance 
                WHERE digital_id = ? 
                AND date(timestamp) = date(?)
                ORDER BY timestamp ASC
            `;

            db.all(sql, [digitalId, date.toISOString()], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Find user's attendance history with filters
    static findUserHistory(filters, options = {}) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT * FROM attendance 
                WHERE digital_id = ?
            `;
            const params = [filters.digital_id];

            if (filters.from_date) {
                sql += ' AND date(timestamp) >= date(?)';
                params.push(filters.from_date);
            }

            if (filters.to_date) {
                sql += ' AND date(timestamp) <= date(?)';
                params.push(filters.to_date);
            }

            if (filters.punch_type) {
                sql += ' AND punch_type = ?';
                params.push(filters.punch_type);
            }

            sql += ' ORDER BY timestamp DESC';

            if (options.limit) {
                sql += ' LIMIT ?';
                params.push(options.limit);

                if (options.offset) {
                    sql += ' OFFSET ?';
                    params.push(options.offset);
                }
            }

            db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Count user's attendance history
    static countUserHistory(filters) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT COUNT(*) as count FROM attendance 
                WHERE digital_id = ?
            `;
            const params = [filters.digital_id];

            if (filters.from_date) {
                sql += ' AND date(timestamp) >= date(?)';
                params.push(filters.from_date);
            }

            if (filters.to_date) {
                sql += ' AND date(timestamp) <= date(?)';
                params.push(filters.to_date);
            }

            if (filters.punch_type) {
                sql += ' AND punch_type = ?';
                params.push(filters.punch_type);
            }

            db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row.count);
                }
            });
        });
    }

    // Get attendance statistics for a user
    static getStatistics(digitalId, startDate, endDate) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    COUNT(CASE WHEN punch_type = 'in' THEN 1 END) as total_days,
                    COUNT(*) as total_punches,
                    COUNT(CASE WHEN punch_type = 'in' AND time(timestamp) <= '09:30:00' THEN 1 END) as on_time_days,
                    attendance_method,
                    COUNT(CASE WHEN attendance_method = 'qr' THEN 1 END) as qr_punches,
                    COUNT(CASE WHEN attendance_method = 'manual' THEN 1 END) as manual_punches
                FROM attendance 
                WHERE digital_id = ? 
                AND timestamp BETWEEN ? AND ?
                GROUP BY digital_id
            `;

            db.get(sql, [digitalId, startDate.toISOString(), endDate.toISOString()], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    if (!row) {
                        resolve({
                            total_days: 0,
                            total_punches: 0,
                            on_time_days: 0,
                            punctuality_rate: 0,
                            qr_punches: 0,
                            manual_punches: 0
                        });
                    } else {
                        const punctualityRate = row.total_days > 0 
                            ? Math.round((row.on_time_days / row.total_days) * 100) 
                            : 0;

                        resolve({
                            total_days: row.total_days,
                            total_punches: row.total_punches,
                            on_time_days: row.on_time_days,
                            punctuality_rate: punctualityRate,
                            qr_punches: row.qr_punches || 0,
                            manual_punches: row.manual_punches || 0
                        });
                    }
                }
            });
        });
    }

    // Admin: Find all attendance logs with filters
    static findAllLogs(filters = {}, options = {}) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT a.*, u.name, u.role, u.industry_type
                FROM attendance a
                LEFT JOIN users u ON a.digital_id = u.digital_id
                WHERE 1=1
            `;
            const params = [];

            if (filters.digital_id) {
                sql += ' AND a.digital_id = ?';
                params.push(filters.digital_id);
            }

            if (filters.from_date) {
                sql += ' AND date(a.timestamp) >= date(?)';
                params.push(filters.from_date);
            }

            if (filters.to_date) {
                sql += ' AND date(a.timestamp) <= date(?)';
                params.push(filters.to_date);
            }

            if (filters.punch_type) {
                sql += ' AND a.punch_type = ?';
                params.push(filters.punch_type);
            }

            if (filters.method) {
                sql += ' AND a.attendance_method = ?';
                params.push(filters.method);
            }

            sql += ' ORDER BY a.timestamp DESC';

            if (options.limit) {
                sql += ' LIMIT ?';
                params.push(options.limit);

                if (options.offset) {
                    sql += ' OFFSET ?';
                    params.push(options.offset);
                }
            }

            db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Admin: Count all attendance logs
    static countAllLogs(filters = {}) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT COUNT(*) as count
                FROM attendance a
                LEFT JOIN users u ON a.digital_id = u.digital_id
                WHERE 1=1
            `;
            const params = [];

            if (filters.digital_id) {
                sql += ' AND a.digital_id = ?';
                params.push(filters.digital_id);
            }

            if (filters.from_date) {
                sql += ' AND date(a.timestamp) >= date(?)';
                params.push(filters.from_date);
            }

            if (filters.to_date) {
                sql += ' AND date(a.timestamp) <= date(?)';
                params.push(filters.to_date);
            }

            if (filters.punch_type) {
                sql += ' AND a.punch_type = ?';
                params.push(filters.punch_type);
            }

            if (filters.method) {
                sql += ' AND a.attendance_method = ?';
                params.push(filters.method);
            }

            db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row.count);
                }
            });
        });
    }

    // Admin: Get system-wide attendance summary
    static getSystemSummary(startDate, endDate, filters = {}) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT 
                    COUNT(DISTINCT a.digital_id) as active_users,
                    COUNT(CASE WHEN a.punch_type = 'in' THEN 1 END) as total_check_ins,
                    COUNT(CASE WHEN a.punch_type = 'out' THEN 1 END) as total_check_outs,
                    COUNT(CASE WHEN a.attendance_method = 'qr' THEN 1 END) as qr_attendance,
                    COUNT(CASE WHEN a.attendance_method = 'manual' THEN 1 END) as manual_attendance,
                    u.industry_type,
                    COUNT(CASE WHEN u.industry_type = 'healthcare' THEN 1 END) as healthcare_punches,
                    COUNT(CASE WHEN u.industry_type = 'education' THEN 1 END) as education_punches,
                    COUNT(CASE WHEN u.industry_type = 'corporate' THEN 1 END) as corporate_punches,
                    COUNT(CASE WHEN u.industry_type = 'manufacturing' THEN 1 END) as manufacturing_punches
                FROM attendance a
                LEFT JOIN users u ON a.digital_id = u.digital_id
                WHERE a.timestamp BETWEEN ? AND ?
            `;
            const params = [startDate.toISOString(), endDate.toISOString()];

            if (filters.industry) {
                sql += ' AND u.industry_type = ?';
                params.push(filters.industry);
            }

            if (filters.role) {
                sql += ' AND u.role = ?';
                params.push(filters.role);
            }

            db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row || {
                        active_users: 0,
                        total_check_ins: 0,
                        total_check_outs: 0,
                        qr_attendance: 0,
                        manual_attendance: 0,
                        healthcare_punches: 0,
                        education_punches: 0,
                        corporate_punches: 0,
                        manufacturing_punches: 0
                    });
                }
            });
        });
    }

    // Get attendance trends (daily, weekly, monthly)
    static getAttendanceTrends(period = 'daily', days = 30) {
        return new Promise((resolve, reject) => {
            let dateFormat;
            switch (period) {
                case 'hourly':
                    dateFormat = '%Y-%m-%d %H:00:00';
                    break;
                case 'daily':
                    dateFormat = '%Y-%m-%d';
                    break;
                case 'weekly':
                    dateFormat = '%Y-%W';
                    break;
                case 'monthly':
                    dateFormat = '%Y-%m';
                    break;
                default:
                    dateFormat = '%Y-%m-%d';
            }

            const sql = `
                SELECT 
                    strftime('${dateFormat}', timestamp) as period,
                    COUNT(CASE WHEN punch_type = 'in' THEN 1 END) as check_ins,
                    COUNT(CASE WHEN punch_type = 'out' THEN 1 END) as check_outs,
                    COUNT(DISTINCT digital_id) as unique_users
                FROM attendance 
                WHERE date(timestamp) >= date('now', '-${days} days')
                GROUP BY strftime('${dateFormat}', timestamp)
                ORDER BY period ASC
            `;

            db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Delete attendance record (for corrections)
    static delete(attendanceId, digitalId) {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM attendance WHERE id = ? AND digital_id = ?';

            db.run(sql, [attendanceId, digitalId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }
}

module.exports = Attendance;
