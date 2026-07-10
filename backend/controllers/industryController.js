/**
 * Universal Attendance System - Industry Controller
 * Handles industry-specific user management and associations
 */

const User = require('../models/User');
const Organization = require('../models/Organization');

class IndustryController {
    constructor() {
        // Industry-specific role mappings
        this.industryRoles = {
            education: ['teacher', 'professor', 'faculty', 'student', 'admin', 'principal', 'dean'],
            healthcare: ['doctor', 'nurse', 'staff', 'admin', 'patient', 'receptionist'],
            corporate: ['employee', 'manager', 'executive', 'admin', 'hr', 'intern'],
            manufacturing: ['worker', 'supervisor', 'manager', 'admin', 'quality', 'maintenance']
        };
    }

    // Associate user with industry and organization
    async associateUser(req, res) {
        try {
            const { digital_id } = req.params;
            const { industry_type, organization_id, role } = req.body;

            // Validate input
            if (!digital_id || !industry_type || !organization_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Digital ID, industry type, and organization ID are required'
                });
            }

            // Check if user exists
            const user = await User.findByDigitalId(digital_id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Check if organization exists
            const organization = await Organization.findById(organization_id);
            if (!organization) {
                return res.status(404).json({
                    success: false,
                    message: 'Organization not found'
                });
            }

            // Update user's industry and organization
            await User.associateWithIndustry(digital_id, industry_type, organization_id);

            // If role is provided, update it
            if (role) {
                // Validate role for industry
                if (this.industryRoles[industry_type] && 
                    !this.industryRoles[industry_type].includes(role.toLowerCase())) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid role for ${industry_type} industry`,
                        validRoles: this.industryRoles[industry_type]
                    });
                }

                // Update user role
                await new Promise((resolve, reject) => {
                    const sql = 'UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE digital_id = ?';
                    db.run(sql, [role, digital_id], function(err) {
                        if (err) reject(err);
                        else resolve({ changes: this.changes });
                    });
                });
            }

            // Associate user with organization
            await Organization.associateUser(organization_id, digital_id, role || user.role);

            res.json({
                success: true,
                message: 'User successfully associated with industry and organization',
                data: {
                    digital_id,
                    industry_type,
                    organization_id,
                    organization_name: organization.name
                }
            });

        } catch (error) {
            console.error('Error associating user with industry:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to associate user with industry'
            });
        }
    }

    // Get industry-specific settings for a user
    async getUserIndustrySettings(req, res) {
        try {
            const { digital_id } = req.params;

            // Check if user exists
            const user = await User.findByDigitalId(digital_id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Parse profile data to get industry settings
            let industrySettings = {};
            try {
                const profileData = JSON.parse(user.profile_data || '{}');
                industrySettings = profileData.industry_settings || {};
            } catch (e) {
                console.error('Error parsing profile data:', e);
            }

            // Get organization settings
            const orgSettings = await Organization.getIndustrySettings(user.organization_id, user.industry_type);

            res.json({
                success: true,
                data: {
                    user_industry_settings: industrySettings,
                    organization_industry_settings: orgSettings,
                    industry_type: user.industry_type,
                    role: user.role
                }
            });

        } catch (error) {
            console.error('Error getting user industry settings:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get user industry settings'
            });
        }
    }

    // Update industry-specific settings for a user
    async updateUserIndustrySettings(req, res) {
        try {
            const { digital_id } = req.params;
            const { industry_settings } = req.body;

            if (!industry_settings || typeof industry_settings !== 'object') {
                return res.status(400).json({
                    success: false,
                    message: 'Industry settings object is required'
                });
            }

            // Update user's industry settings
            const result = await User.updateIndustrySettings(digital_id, industry_settings);

            res.json({
                success: true,
                message: 'Industry settings updated successfully',
                data: {
                    industry_settings: result.industry_settings
                }
            });

        } catch (error) {
            console.error('Error updating user industry settings:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update user industry settings'
            });
        }
    }

    // Get valid roles for an industry
    async getIndustryRoles(req, res) {
        try {
            const { industry } = req.params;

            if (!industry || !this.industryRoles[industry]) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid industry type',
                    validIndustries: Object.keys(this.industryRoles)
                });
            }

            res.json({
                success: true,
                data: {
                    industry,
                    roles: this.industryRoles[industry]
                }
            });

        } catch (error) {
            console.error('Error getting industry roles:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get industry roles'
            });
        }
    }
}

module.exports = new IndustryController();