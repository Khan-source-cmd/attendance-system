/**
 * User Model - Database operations for users
 */

const { db } = require('../utils/helpers');

class User {
    // Create a new user
    static create(userData) {
        return new Promise((resolve, reject) => {
            const {
                digital_id, organization_id, name, email, phone, password,
                role, industry_type, profile_data, is_verified = 0, is_approved = 1, is_active = 1
            } = userData;

            const sql = `
                INSERT INTO users (
                    digital_id, organization_id, name, email, phone, password, role, 
                    industry_type, profile_data, is_verified, is_approved, is_active,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `;

            const params = [
                digital_id, organization_id, name, email, phone, password,
                role, industry_type, profile_data, is_verified, is_approved, is_active
            ];

            db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ id: this.lastID, digital_id });
                }
            });
        });
    }

    // Find user by digital ID
    static findByDigitalId(digitalId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT u.*, o.name as organization_name, o.type as organization_type
                FROM users u
                LEFT JOIN organizations o ON u.organization_id = o.id
                WHERE u.digital_id = ?
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

    // Find user by email
    static findByEmail(email) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM users WHERE email = ?';

            db.get(sql, [email], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Find user by digital ID and email (for password reset)
    static findByDigitalIdAndEmail(digitalId, email) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM users WHERE digital_id = ? AND email = ?';

            db.get(sql, [digitalId, email], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Update user verification status
    static updateVerificationStatus(digitalId, isVerified) {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE users SET is_verified = ?, updated_at = CURRENT_TIMESTAMP WHERE digital_id = ?';

            db.run(sql, [isVerified ? 1 : 0, digitalId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    // Update user status (admin function)
    static updateStatus(digitalId, statusData) {
        return new Promise((resolve, reject) => {
            const updates = [];
            const params = [];

            if (typeof statusData.is_active !== 'undefined') {
                updates.push('is_active = ?');
                params.push(statusData.is_active ? 1 : 0);
            }

            if (typeof statusData.is_approved !== 'undefined') {
                updates.push('is_approved = ?');
                params.push(statusData.is_approved ? 1 : 0);
            }

            if (updates.length === 0) {
                resolve({ changes: 0 });
                return;
            }

            updates.push('updated_at = CURRENT_TIMESTAMP');
            params.push(digitalId);

            const sql = `UPDATE users SET ${updates.join(', ')} WHERE digital_id = ?`;

            db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    // Update user password
    static updatePassword(digitalId, newPassword) {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE digital_id = ?';

            db.run(sql, [newPassword, digitalId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    // Update user phone
    static updatePhone(digitalId, phone) {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE users SET phone = ?, updated_at = CURRENT_TIMESTAMP WHERE digital_id = ?';

            db.run(sql, [phone, digitalId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    // Update last login time
    static updateLastLogin(digitalId) {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE digital_id = ?';

            db.run(sql, [digitalId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    // Find all users with optional filters
    static findAll(filters = {}) {
        return new Promise((resolve, reject) => {
            let sql = `
                SELECT u.digital_id, u.name, u.email, u.phone, u.role, u.industry_type,
                       u.is_verified, u.is_approved, u.is_active, u.created_at,
                       o.name as organization_name
                FROM users u
                LEFT JOIN organizations o ON u.organization_id = o.id
                WHERE 1=1
            `;
            const params = [];

            if (filters.role) {
                sql += ' AND u.role = ?';
                params.push(filters.role);
            }

            if (filters.industry) {
                sql += ' AND u.industry_type = ?';
                params.push(filters.industry);
            }

            if (filters.status) {
                if (filters.status === 'active') {
                    sql += ' AND u.is_active = 1';
                } else if (filters.status === 'inactive') {
                    sql += ' AND u.is_active = 0';
                }
            }

            if (filters.search) {
                sql += ' AND (u.name LIKE ? OR u.email LIKE ? OR u.digital_id LIKE ?)';
                const searchTerm = `%${filters.search}%`;
                params.push(searchTerm, searchTerm, searchTerm);
            }

            sql += ' ORDER BY u.created_at DESC';

            db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Get user count by industry
    static getCountByIndustry() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT industry_type, COUNT(*) as count
                FROM users
                WHERE is_active = 1
                GROUP BY industry_type
                ORDER BY count DESC
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
    
    // Associate user with industry and organization
    static associateWithIndustry(digitalId, industryType, organizationId) {
        return new Promise((resolve, reject) => {
            const sql = `
                UPDATE users 
                SET industry_type = ?, organization_id = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE digital_id = ?
            `;

            db.run(sql, [industryType, organizationId, digitalId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }
    
    // Get users by industry type
    static findByIndustryType(industryType, limit = 100) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT u.digital_id, u.name, u.email, u.phone, u.role, u.industry_type,
                       u.is_verified, u.is_approved, u.is_active, u.created_at,
                       o.name as organization_name
                FROM users u
                LEFT JOIN organizations o ON u.organization_id = o.id
                WHERE u.industry_type = ? AND u.is_active = 1
                ORDER BY u.created_at DESC
                LIMIT ?
            `;

            db.all(sql, [industryType, limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
    
    // Update user industry settings
    static updateIndustrySettings(digitalId, industrySettings) {
        return new Promise((resolve, reject) => {
            // First get the current profile data
            this.findByDigitalId(digitalId)
                .then(user => {
                    if (!user) {
                        return reject(new Error('User not found'));
                    }
                    
                    // Parse existing profile data or create new object
                    let profileData = {};
                    try {
                        profileData = user.profile_data ? JSON.parse(user.profile_data) : {};
                    } catch (e) {
                        console.error('Error parsing profile data:', e);
                    }
                    
                    // Update industry settings
                    profileData.industry_settings = {
                        ...profileData.industry_settings || {},
                        ...industrySettings
                    };
                    
                    // Save updated profile data
                    const sql = 'UPDATE users SET profile_data = ?, updated_at = CURRENT_TIMESTAMP WHERE digital_id = ?';
                    
                    db.run(sql, [JSON.stringify(profileData), digitalId], function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({ 
                                changes: this.changes,
                                industry_settings: profileData.industry_settings 
                            });
                        }
                    });
                })
                .catch(reject);
        });
    }

    // Get total user count
    static getTotalCount() {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT COUNT(*) as count FROM users WHERE is_active = 1';

            db.get(sql, [], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row.count);
                }
            });
        });
    }

    // Delete user (soft delete by deactivating)
    static softDelete(digitalId) {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE digital_id = ?';

            db.run(sql, [digitalId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }
}

module.exports = User;
