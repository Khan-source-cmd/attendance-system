/**
 * ClassSchedule Model - Database operations for class schedules in educational institutions
 */

const { db } = require('../utils/helpers');

class ClassSchedule {
    // Create a new class schedule
    static create(scheduleData) {
        return new Promise((resolve, reject) => {
            const {
                class_id, teacher_id, day_of_week, start_time, end_time,
                room_number, recurring = 1, start_date, end_date = null,
                is_active = 1, notes = null
            } = scheduleData;

            const sql = `
                INSERT INTO class_schedules (
                    class_id, teacher_id, day_of_week, start_time, end_time,
                    room_number, recurring, start_date, end_date, is_active, notes,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;

            const params = [
                class_id, teacher_id, day_of_week, start_time, end_time,
                room_number, recurring, start_date, end_date, is_active, notes
            ];

            db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, ...scheduleData });
                }
            });
        });
    }

    // Find schedule by ID
    static findById(id) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT cs.*, c.class_name, c.subject, u.name as teacher_name
                FROM class_schedules cs
                LEFT JOIN classes c ON cs.class_id = c.id
                LEFT JOIN users u ON cs.teacher_id = u.digital_id
                WHERE cs.id = ?
            `;

            db.get(sql, [id], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Find schedules by class ID
    static findByClassId(classId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT cs.*, c.class_name, c.subject, u.name as teacher_name
                FROM class_schedules cs
                LEFT JOIN classes c ON cs.class_id = c.id
                LEFT JOIN users u ON cs.teacher_id = u.digital_id
                WHERE cs.class_id = ?
                ORDER BY cs.day_of_week, cs.start_time
            `;

            db.all(sql, [classId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Find schedules by teacher ID
    static findByTeacherId(teacherId, filters = {}) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT cs.*, c.class_name, c.subject, c.class_code
                FROM class_schedules cs
                LEFT JOIN classes c ON cs.class_id = c.id
                WHERE cs.teacher_id = ?
            `;
            
            const params = [teacherId];
            
            if (filters.active !== undefined) {
                sql += ' AND cs.is_active = ?';
                params.push(filters.active ? 1 : 0);
            }
            
            if (filters.dayOfWeek) {
                sql += ' AND cs.day_of_week = ?';
                params.push(filters.dayOfWeek);
            }
            
            if (filters.date) {
                // For a specific date, check if it falls within the schedule's date range
                sql += ` AND (cs.start_date <= ? AND (cs.end_date IS NULL OR cs.end_date >= ?))`;
                params.push(filters.date, filters.date);
            }
            
            sql += ' ORDER BY cs.day_of_week, cs.start_time';
            
            db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Get teacher's schedule for a specific day
    static getTeacherDailySchedule(teacherId, dayOfWeek) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT cs.*, c.class_name, c.subject, c.class_code
                FROM class_schedules cs
                LEFT JOIN classes c ON cs.class_id = c.id
                WHERE cs.teacher_id = ? AND cs.day_of_week = ? AND cs.is_active = 1
                ORDER BY cs.start_time
            `;

            db.all(sql, [teacherId, dayOfWeek], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Update a class schedule
    static update(id, scheduleData) {
        return new Promise((resolve, reject) => {
            const updates = [];
            const params = [];
            
            // Build dynamic update query based on provided fields
            Object.keys(scheduleData).forEach(key => {
                if (key !== 'id') {
                    updates.push(`${key} = ?`);
                    params.push(scheduleData[key]);
                }
            });
            
            if (updates.length === 0) {
                return resolve({ changes: 0 });
            }
            
            params.push(id); // Add ID for WHERE clause
            
            const sql = `
                UPDATE class_schedules
                SET ${updates.join(', ')}
                WHERE id = ?
            `;
            
            db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    // Delete a class schedule
    static delete(id) {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM class_schedules WHERE id = ?';
            
            db.run(sql, [id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    // Check for schedule conflicts
    static checkConflicts(teacherId, startTime, endTime, dayOfWeek, excludeId = null) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT cs.*, c.class_name
                FROM class_schedules cs
                LEFT JOIN classes c ON cs.class_id = c.id
                WHERE cs.teacher_id = ? 
                  AND cs.day_of_week = ?
                  AND cs.is_active = 1
                  AND (
                    (cs.start_time <= ? AND cs.end_time > ?) OR
                    (cs.start_time < ? AND cs.end_time >= ?) OR
                    (cs.start_time >= ? AND cs.end_time <= ?)
                  )
            `;
            
            const params = [teacherId, dayOfWeek, startTime, startTime, endTime, endTime, startTime, endTime];
            
            if (excludeId) {
                sql += ' AND cs.id != ?';
                params.push(excludeId);
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
}

module.exports = ClassSchedule;