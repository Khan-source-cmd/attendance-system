/**
 * Faculty Model - Database operations for faculty members in educational institutions
 */

const { db } = require('../utils/helpers');

class Faculty {
    // Create a new faculty member
    static create(facultyData) {
        return new Promise((resolve, reject) => {
            const {
                faculty_id, name, email, department_id = null, position = null,
                specialization = null, is_active = 1, organization_id = 2
            } = facultyData;

            const sql = `
                INSERT INTO faculty (
                    faculty_id, name, email, department_id, position,
                    specialization, is_active, organization_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `;

            const params = [
                faculty_id, name, email, department_id, position,
                specialization, is_active, organization_id
            ];

            db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, ...facultyData });
                }
            });
        });
    }

    // Find faculty by ID
    static findById(id) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT f.*, d.name as department_name
                FROM faculty f
                LEFT JOIN departments d ON f.department_id = d.id
                WHERE f.id = ?
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

    // Find faculty by faculty_id
    static findByFacultyId(facultyId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT f.*, d.name as department_name
                FROM faculty f
                LEFT JOIN departments d ON f.department_id = d.id
                WHERE f.faculty_id = ?
            `;

            db.get(sql, [facultyId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Find all faculty members
    static findAll(filters = {}) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT f.*, d.name as department_name
                FROM faculty f
                LEFT JOIN departments d ON f.department_id = d.id
                WHERE 1=1
            `;
            
            const params = [];
            
            if (filters.organization_id) {
                sql += ' AND f.organization_id = ?';
                params.push(filters.organization_id);
            }
            
            if (filters.department_id) {
                sql += ' AND f.department_id = ?';
                params.push(filters.department_id);
            }
            
            if (filters.is_active !== undefined) {
                sql += ' AND f.is_active = ?';
                params.push(filters.is_active ? 1 : 0);
            }
            
            sql += ' ORDER BY f.name';
            
            db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Update faculty information
    static update(facultyId, facultyData) {
        return new Promise((resolve, reject) => {
            const updates = [];
            const params = [];
            
            // Build dynamic update query based on provided fields
            Object.keys(facultyData).forEach(key => {
                if (key !== 'faculty_id' && key !== 'id') {
                    updates.push(`${key} = ?`);
                    params.push(facultyData[key]);
                }
            });
            
            if (updates.length === 0) {
                return resolve({ changes: 0 });
            }
            
            updates.push('updated_at = CURRENT_TIMESTAMP');
            params.push(facultyId); // Add faculty_id for WHERE clause
            
            const sql = `
                UPDATE faculty
                SET ${updates.join(', ')}
                WHERE faculty_id = ?
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

    // Associate faculty with a class
    static associateWithClass(facultyId, classId, role = 'instructor', isPrimary = 1) {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR REPLACE INTO faculty_classes (
                    faculty_id, class_id, role, is_primary
                ) VALUES (?, ?, ?, ?)
            `;

            const params = [facultyId, classId, role, isPrimary];

            db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ 
                        id: this.lastID,
                        faculty_id: facultyId,
                        class_id: classId,
                        role,
                        is_primary: isPrimary
                    });
                }
            });
        });
    }

    // Remove faculty from a class
    static removeFromClass(facultyId, classId) {
        return new Promise((resolve, reject) => {
            const sql = `
                DELETE FROM faculty_classes
                WHERE faculty_id = ? AND class_id = ?
            `;

            db.run(sql, [facultyId, classId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    // Get classes taught by faculty
    static getClasses(facultyId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT c.*, fc.role, fc.is_primary,
                       (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) as student_count
                FROM faculty_classes fc
                JOIN classes c ON fc.class_id = c.id
                WHERE fc.faculty_id = ?
                ORDER BY c.class_name
            `;

            db.all(sql, [facultyId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Get faculty members for a specific class
    static getClassFaculty(classId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT f.*, fc.role, fc.is_primary, d.name as department_name
                FROM faculty_classes fc
                JOIN faculty f ON fc.faculty_id = f.faculty_id
                LEFT JOIN departments d ON f.department_id = d.id
                WHERE fc.class_id = ?
                ORDER BY fc.is_primary DESC, f.name
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

    // Get faculty statistics
    static getStatistics(facultyId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    (SELECT COUNT(*) FROM faculty_classes WHERE faculty_id = ?) as total_classes,
                    (SELECT COUNT(DISTINCT s.id) 
                     FROM students s 
                     JOIN faculty_classes fc ON s.class_id = fc.class_id 
                     WHERE fc.faculty_id = ?) as total_students,
                    (SELECT COUNT(*) 
                     FROM class_attendance ca 
                     JOIN faculty_classes fc ON ca.class_id = fc.class_id 
                     WHERE fc.faculty_id = ? AND ca.marked_by = ?) as attendance_records
            `;

            db.get(sql, [facultyId, facultyId, facultyId, facultyId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }
}

module.exports = Faculty;