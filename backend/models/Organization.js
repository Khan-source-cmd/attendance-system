/**
 * Organization Model - Database operations for organizations
 * Enhanced with industry-specific user associations
 */

const { db } = require('../utils/helpers');

class Organization {
    // Create a new organization
    static create(orgData) {
        return new Promise((resolve, reject) => {
            const {
                name, type, address, contact_email, contact_phone, settings = '{}'
            } = orgData;

            const sql = `
                INSERT INTO organizations (
                    name, type, address, contact_email, contact_phone, settings, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;

            const params = [name, type, address, contact_email, contact_phone, settings];

            db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, name, type });
                }
            });
        });
    }

    // Find organization by ID
    static findById(id) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM organizations WHERE id = ?';

            db.get(sql, [id], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    if (row && row.settings) {
                        try {
                            row.settings = JSON.parse(row.settings);
                        } catch (e) {
                            row.settings = {};
                        }
                    }
                    resolve(row);
                }
            });
        });
    }

    // Find organization by name
    static findByName(name) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM organizations WHERE name = ?';

            db.get(sql, [name], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    if (row && row.settings) {
                        try {
                            row.settings = JSON.parse(row.settings);
                        } catch (e) {
                            row.settings = {};
                        }
                    }
                    resolve(row);
                }
            });
        });
    }

    // Find all organizations with optional filters
    static findAll(filters = {}) {
        return new Promise((resolve, reject) => {
            let sql = 'SELECT * FROM organizations WHERE 1=1';
            const params = [];

            if (filters.type) {
                sql += ' AND type = ?';
                params.push(filters.type);
            }

            if (filters.search) {
                sql += ' AND (name LIKE ? OR contact_email LIKE ?)';
                const searchTerm = `%${filters.search}%`;
                params.push(searchTerm, searchTerm);
            }

            sql += ' ORDER BY created_at DESC';

            db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    // Parse settings for each organization
                    const processedRows = rows.map(row => {
                        if (row.settings) {
                            try {
                                row.settings = JSON.parse(row.settings);
                            } catch (e) {
                                row.settings = {};
                            }
                        }
                        return row;
                    });
                    resolve(processedRows);
                }
            });
        });
    }

    // Update organization information
    static update(id, updateData) {
        return new Promise((resolve, reject) => {
            const updates = [];
            const params = [];

            if (updateData.name) {
                updates.push('name = ?');
                params.push(updateData.name);
            }

            if (updateData.type) {
                updates.push('type = ?');
                params.push(updateData.type);
            }

            if (updateData.address) {
                updates.push('address = ?');
                params.push(updateData.address);
            }

            if (updateData.contact_email) {
                updates.push('contact_email = ?');
                params.push(updateData.contact_email);
            }

            if (updateData.contact_phone) {
                updates.push('contact_phone = ?');
                params.push(updateData.contact_phone);
            }

            if (updateData.settings) {
                updates.push('settings = ?');
                params.push(typeof updateData.settings === 'string' 
                    ? updateData.settings 
                    : JSON.stringify(updateData.settings));
            }

            if (updates.length === 0) {
                resolve({ changes: 0 });
                return;
            }

            params.push(id);
            const sql = `UPDATE organizations SET ${updates.join(', ')} WHERE id = ?`;

            db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    // Update organization settings
    static updateSettings(id, settings) {
        return new Promise((resolve, reject) => {
            const settingsJson = typeof settings === 'string' 
                ? settings 
                : JSON.stringify(settings);

            const sql = 'UPDATE organizations SET settings = ? WHERE id = ?';

            db.run(sql, [settingsJson, id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    // Get organization statistics
    static getStatistics(id) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    COUNT(DISTINCT u.digital_id) as total_users,
                    COUNT(DISTINCT CASE WHEN u.is_active = 1 THEN u.digital_id END) as active_users,
                    COUNT(DISTINCT u.industry_type) as industries_served,
                    COUNT(DISTINCT a.digital_id) as users_with_attendance,
                    COUNT(a.id) as total_attendance_records,
                    COUNT(CASE WHEN a.attendance_method = 'qr' THEN 1 END) as qr_attendance,
                    COUNT(CASE WHEN a.attendance_method = 'manual' THEN 1 END) as manual_attendance
                FROM organizations o
                LEFT JOIN users u ON o.id = u.organization_id
                LEFT JOIN attendance a ON u.digital_id = a.digital_id
                WHERE o.id = ?
                GROUP BY o.id
            `;

            db.get(sql, [id], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row || {
                        total_users: 0,
                        active_users: 0,
                        industries_served: 0,
                        users_with_attendance: 0,
                        total_attendance_records: 0,
                        qr_attendance: 0,
                        manual_attendance: 0
                    });
                }
            });
        });
    }

    // Get user count by industry for an organization
    static getUserCountByIndustry(id) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT u.industry_type, COUNT(*) as count
                FROM users u
                WHERE u.organization_id = ? AND u.is_active = 1
                GROUP BY u.industry_type
                ORDER BY count DESC
            `;

            db.all(sql, [id], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
    
    // Associate user with organization
    static associateUser(userId, organizationId, role = 'member') {
        return new Promise((resolve, reject) => {
            const sql = `
                UPDATE users
                SET organization_id = ?, role = ?
                WHERE digital_id = ?
            `;

            db.run(sql, [organizationId, role, userId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ success: true, changes: this.changes });
                }
            });
        });
    }
    
    // Get organization industry-specific settings
    static getIndustrySettings(id, industryType) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT settings
                FROM organizations
                WHERE id = ?
            `;

            db.get(sql, [id], (err, row) => {
                if (err) {
                    reject(err);
                } else if (!row) {
                    resolve({});
                } else {
                    try {
                        const settings = JSON.parse(row.settings || '{}');
                        const industrySettings = settings[industryType] || {};
                        resolve(industrySettings);
                    } catch (e) {
                        resolve({});
                    }
                }
            });
        });
    }
    
    // Update organization industry-specific settings
    static updateIndustrySettings(id, industryType, industrySettings) {
        return new Promise((resolve, reject) => {
            // First get current settings
            this.findById(id).then(org => {
                if (!org) {
                    return reject(new Error('Organization not found'));
                }
                
                let settings = {};
                try {
                    settings = JSON.parse(org.settings || '{}');
                } catch (e) {
                    settings = {};
                }
                
                // Update industry-specific settings
                settings[industryType] = { ...settings[industryType], ...industrySettings };
                
                // Save updated settings
                const sql = `
                    UPDATE organizations
                    SET settings = ?
                    WHERE id = ?
                `;
                
                db.run(sql, [JSON.stringify(settings), id], function(err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ success: true, changes: this.changes });
                    }
                });
            }).catch(reject);
        });
    }

    // Get faculty members for an educational organization
    static getEducationFaculty(organizationId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT u.digital_id, u.name, u.email, u.phone, u.role, 
                       u.profile_data, COUNT(c.id) as class_count
                FROM users u
                LEFT JOIN classes c ON u.digital_id = c.teacher_id
                WHERE u.organization_id = ? 
                  AND u.industry_type = 'education'
                  AND u.role IN ('teacher', 'professor', 'instructor', 'faculty')
                  AND u.is_active = 1
                GROUP BY u.digital_id
                ORDER BY u.name
            `;

            db.all(sql, [organizationId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    // Parse profile data for each faculty member
                    const faculty = rows.map(row => {
                        try {
                            row.profile_data = JSON.parse(row.profile_data || '{}');
                        } catch (e) {
                            row.profile_data = {};
                        }
                        return row;
                    });
                    resolve(faculty);
                }
            });
        });
    }
    
    // Get classes for an educational organization
    static getEducationClasses(organizationId, filters = {}) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT c.*, u.name as teacher_name,
                       (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.is_active = 1) as student_count
                FROM classes c
                LEFT JOIN users u ON c.teacher_id = u.digital_id
                WHERE c.organization_id = ?
            `;
            
            const params = [organizationId];
            
            if (filters.teacherId) {
                sql += ' AND c.teacher_id = ?';
                params.push(filters.teacherId);
            }
            
            if (filters.active !== undefined) {
                sql += ' AND c.is_active = ?';
                params.push(filters.active ? 1 : 0);
            }
            
            if (filters.search) {
                sql += ' AND (c.class_name LIKE ? OR c.subject LIKE ? OR c.class_code LIKE ?)';
                const searchTerm = `%${filters.search}%`;
                params.push(searchTerm, searchTerm, searchTerm);
            }
            
            sql += ' ORDER BY c.class_name';
            
            db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
    
    // Get organization's active QR codes
    static getActiveQRCodes(id) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM qr_codes
                WHERE organization_id = ? 
                AND is_active = 1 
                AND datetime(valid_until) > datetime('now')
                ORDER BY created_at DESC
            `;

            db.all(sql, [id], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Get organization's recent activity
    static getRecentActivity(id, limit = 10) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    a.punch_type, 
                    a.timestamp, 
                    a.attendance_method,
                    u.name, 
                    u.role, 
                    u.industry_type,
                    'attendance' as activity_type
                FROM attendance a
                JOIN users u ON a.digital_id = u.digital_id
                WHERE u.organization_id = ?
                ORDER BY a.timestamp DESC
                LIMIT ?
            `;

            db.all(sql, [id, limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Delete organization (soft delete)
    static delete(id) {
        return new Promise((resolve, reject) => {
            // First, deactivate all users in the organization
            const deactivateUsersSql = `
                UPDATE users SET is_active = 0 WHERE organization_id = ?
            `;

            db.run(deactivateUsersSql, [id], (err) => {
                if (err) {
                    reject(err);
                    return;
                }

                // Then deactivate all QR codes
                const deactivateQRSql = `
                    UPDATE qr_codes SET is_active = 0 WHERE organization_id = ?
                `;

                db.run(deactivateQRSql, [id], (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    // Finally, mark organization as deleted (or actually delete)
                    // For now, we'll keep the record but mark it somehow
                    const deleteSql = `
                        UPDATE organizations 
                        SET name = name || ' (DELETED)', 
                            contact_email = NULL,
                            contact_phone = NULL
                        WHERE id = ?
                    `;

                    db.run(deleteSql, [id], function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({ changes: this.changes });
                        }
                    });
                });
            });
        });
    }

    // Get total count of organizations
    static getTotalCount() {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT COUNT(*) as count FROM organizations';

            db.get(sql, [], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row.count);
                }
            });
        });
    }
}

module.exports = Organization;