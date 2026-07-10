/**
 * User Controller: Manage user profiles, updates, and info retrieval
 */
const User = require('../models/User');

class UserController {
    // Get user profile info
    async getProfile(req, res) {
        try {
            const { digital_id } = req.user;
            const user = await User.findByDigitalId(digital_id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Parse profile data JSON
            user.profile_data = user.profile_data ? JSON.parse(user.profile_data) : {};

            // Omit sensitive fields before sending
            delete user.password;
            delete user.face_descriptor;

            res.json({
                success: true,
                user
            });
        } catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve profile'
            });
        }
    }

    // Update user profile details (currently only phone)
    async updateProfile(req, res) {
        try {
            const { digital_id } = req.user;
            const { phone } = req.body;

            if (!phone) {
                return res.status(400).json({
                    success: false,
                    message: 'Phone number is required'
                });
            }

            await User.updatePhone(digital_id, phone.trim());

            res.json({
                success: true,
                message: 'Profile updated successfully'
            });
        } catch (error) {
            console.error('Update profile error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update profile'
            });
        }
    }
}

module.exports = new UserController();
