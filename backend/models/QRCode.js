/**
 * QR Code Model - Database operations for QR codes used in attendance
 */

const { db } = require('../utils/helpers');

class QRCode {
    // Create a new QR code
    static create(qrData) {
        return new Promise((resolve, reject) => {
            const {
                organization_id, code, location_name, coordinates,
                valid_until, created_by, is_active = 1
            } = qrData;

            const sql = `
                INSERT INTO qr_codes (
                    organization_id, code, location_name, coordinates,
                    valid_until, created_by, is_active, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;

            const params = [
                organization_id, code, location_name, coordinates,
                valid_until, created_by, is_active
            ];

            db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ 
                        id: this.lastID, 
                        location_name, 
                        valid_until,
                        is_active
                    });
                }
            });
        });
    }

    // Find QR code by code string
    static findByCode(code) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM qr_codes WHERE code = ?';

            db.get(sql, [code], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    if (row && row.coordinates) {
                        try {
                            row.coordinates = JSON.parse(row.coordinates);
                        } catch (e) {
                            row.coordinates = null;
                        }
                    }
                    resolve(row);
                }
            });
        });
    }

    // Find QR code by ID
    static findById(id) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM qr_codes WHERE id = ?';

            db.get(sql, [id], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    if (row && row.coordinates) {
                        try {
                            row.coordinates = JSON.parse(row.coordinates);
                        } catch (e) {
                            row.coordinates = null;
                        }
                    }
                    resolve(row);
                }
            });
        });
    }

    // Find all QR codes for an organization
    static findByOrganization(organizationId, activeOnly = false) {
        return new Promise((resolve, reject) => {
            let sql = 'SELECT * FROM qr_codes WHERE organization_id = ?';
            const params = [organizationId];

            if (activeOnly) {
                sql += ' AND is_active = 1 AND datetime(valid_until) > datetime("now")';
            }

            sql += ' ORDER BY created_at DESC';

            db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    // Parse coordinates for each QR code
                    const processedRows = rows.map(row => {
                        if (row.coordinates) {
                            try {
                                row.coordinates = JSON.parse(row.coordinates);
                            } catch (e) {
                                row.coordinates = null;
                            }
                        }
                        return row;
                    });
                    resolve(processedRows);
                }
            });
        });
    }

    // Find active QR codes by location
    static findActiveByLocation(organizationId, locationName) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM qr_codes 
                WHERE organization_id = ? 
                AND location_name = ?
                AND is_active = 1 
                AND datetime(valid_until) > datetime('now')
                ORDER BY created_at DESC
            `;

            db.all(sql, [organizationId, locationName], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const processedRows = rows.map(row => {
                        if (row.coordinates) {
                            try {
                                row.coordinates = JSON.parse(row.coordinates);
                            } catch (e) {
                                row.coordinates = null;
                            }
                        }
                        return row;
                    });
                    resolve(processedRows);
                }
            });
        });
    }

    // Update QR code status
    static updateStatus(id, isActive) {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE qr_codes SET is_active = ? WHERE id = ?';

            db.run(sql, [isActive ? 1 : 0, id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    // Deactivate QR code
    static deactivate(id) {
        return this.updateStatus(id, false);
    }

    // Extend QR code validity
    static extendValidity(id, newValidUntil) {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE qr_codes SET valid_until = ? WHERE id = ?';

            db.run(sql, [newValidUntil, id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    // Increment usage count (for statistics)
    static incrementUsage(id) {
        return new Promise((resolve, reject) => {
            const sql = `
                UPDATE qr_codes 
                SET usage_count = COALESCE(usage_count, 0) + 1 
                WHERE id = ?
            `;

            db.run(sql, [id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    // Get QR code usage statistics
    static getUsageStats(id) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    qr.location_name,
                    qr.usage_count,
                    qr.created_at,
                    qr.valid_until,
                    COUNT(a.id) as actual_usage,
                    COUNT(DISTINCT a.digital_id) as unique_users
                FROM qr_codes qr
                LEFT JOIN attendance a ON a.notes LIKE '%' || qr.location_name || '%' 
                    AND a.attendance_method = 'qr'
                WHERE qr.id = ?
                GROUP BY qr.id
            `;

            db.get(sql, [id], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row || {
                        location_name: '',
                        usage_count: 0,
                        actual_usage: 0,
                        unique_users: 0
                    });
                }
            });
        });
    }

    // Get all QR codes with usage stats
    static getAllWithStats(organizationId) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    qr.*,
                    COUNT(a.id) as actual_usage,
                    COUNT(DISTINCT a.digital_id) as unique_users,
                    MAX(a.timestamp) as last_used
                FROM qr_codes qr
                LEFT JOIN attendance a ON a.notes LIKE '%' || qr.location_name || '%' 
                    AND a.attendance_method = 'qr'
                WHERE qr.organization_id = ?
                GROUP BY qr.id
                ORDER BY qr.created_at DESC
            `;

            db.all(sql, [organizationId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const processedRows = rows.map(row => {
                        if (row.coordinates) {
                            try {
                                row.coordinates = JSON.parse(row.coordinates);
                            } catch (e) {
                                row.coordinates = null;
                            }
                        }
                        return row;
                    });
                    resolve(processedRows);
                }
            });
        });
    }

    // Clean up expired QR codes (mark as inactive)
    static cleanupExpired() {
        return new Promise((resolve, reject) => {
            const sql = `
                UPDATE qr_codes 
                SET is_active = 0 
                WHERE datetime(valid_until) <= datetime('now') 
                AND is_active = 1
            `;

            db.run(sql, [], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    // Get QR codes expiring soon (within hours)
    static getExpiringSoon(hours = 24) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT qr.*, u.name as created_by_name, u.email as created_by_email
                FROM qr_codes qr
                LEFT JOIN users u ON qr.created_by = u.digital_id
                WHERE qr.is_active = 1 
                AND datetime(qr.valid_until) > datetime('now')
                AND datetime(qr.valid_until) <= datetime('now', '+${hours} hours')
                ORDER BY qr.valid_until ASC
            `;

            db.all(sql, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const processedRows = rows.map(row => {
                        if (row.coordinates) {
                            try {
                                row.coordinates = JSON.parse(row.coordinates);
                            } catch (e) {
                                row.coordinates = null;
                            }
                        }
                        return row;
                    });
                    resolve(processedRows);
                }
            });
        });
    }

    // Delete QR code
    static delete(id) {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM qr_codes WHERE id = ?';

            db.run(sql, [id], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    // Get total count of QR codes for an organization
    static getTotalCount(organizationId) {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT COUNT(*) as count FROM qr_codes WHERE organization_id = ?';

            db.get(sql, [organizationId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row.count);
                }
            });
        });
    }
}

module.exports = QRCode;
