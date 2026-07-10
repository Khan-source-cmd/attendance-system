/**
 * Universal Attendance System - Authentication Controller
 * Handles user registration, login, logout, password management
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const { generateDigitalId, sendEmail } = require('../utils/helpers');
const { validateRegistration, validateLogin } = require('../utils/validators');

class AuthController {
    constructor() {
        this.otpStore = new Map(); // In production, use Redis
        this.refreshTokens = new Map(); // In production, use Redis
        this.loginAttempts = new Map(); // In production, use Redis
        this.maxLoginAttempts = 5;
        this.lockoutDuration = 15 * 60 * 1000; // 15 minutes
        
        // Industry-specific role mappings
        this.industryRoles = {
            education: ['teacher', 'professor', 'faculty', 'student', 'admin', 'principal', 'dean'],
            healthcare: ['doctor', 'nurse', 'staff', 'admin', 'patient', 'receptionist'],
            corporate: ['employee', 'manager', 'executive', 'admin', 'hr', 'intern'],
            manufacturing: ['worker', 'supervisor', 'manager', 'admin', 'quality', 'maintenance']
        };
    }

    // User Registration
    async register(req, res) {
        try {
            // Validate input
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }

            const {
                name,
                email,
                phone,
                password,
                role,
                industry_type,
                profile_data = {}
            } = req.body;

            // Check if user already exists
            const existingUser = await User.findByEmail(email);
            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: 'Email already registered'
                });
            }

            // Generate unique digital ID
            const digital_id = await generateDigitalId(role, industry_type);

            // Hash password
            const saltRounds = 12;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Determine organization based on industry type or email domain
            let organization_id = 1; // Default organization
            
            // Check if email domain matches any organization
            const emailDomain = email.split('@')[1];
            if (emailDomain) {
                try {
                    const domainOrg = await new Promise((resolve, reject) => {
                        db.get(
                            "SELECT id FROM organizations WHERE settings LIKE ? LIMIT 1", 
                            [`%${emailDomain}%`], 
                            (err, row) => {
                                if (err) reject(err);
                                else resolve(row);
                            }
                        );
                    });
                    
                    if (domainOrg && domainOrg.id) {
                        organization_id = domainOrg.id;
                    }
                } catch (err) {
                    console.error('Error finding organization by email domain:', err);
                }
            }
            
            // If no organization found by email domain, try by industry type
            if (organization_id === 1) {
                try {
                    const industryOrg = await new Promise((resolve, reject) => {
                        db.get(
                            "SELECT id FROM organizations WHERE type = ? LIMIT 1", 
                            [industry_type], 
                            (err, row) => {
                                if (err) reject(err);
                                else resolve(row);
                            }
                        );
                    });
                    
                    if (industryOrg && industryOrg.id) {
                        organization_id = industryOrg.id;
                    }
                } catch (err) {
                    console.error('Error finding organization by industry type:', err);
                }
            }
            
            // Create user with industry-specific settings
            const industrySettings = {};
            
            // Add industry-specific default settings
            if (industry_type === 'education') {
                industrySettings.default_view = 'classes';
                industrySettings.can_create_classes = role.toLowerCase().includes('teacher') || 
                                                    role.toLowerCase().includes('admin');
            } else if (industry_type === 'healthcare') {
                industrySettings.default_view = 'patients';
                industrySettings.can_access_records = role.toLowerCase().includes('doctor') || 
                                                    role.toLowerCase().includes('nurse');
            }
            
            // Update profile data with industry settings
            const updatedProfileData = {
                ...profile_data,
                industry_settings: industrySettings
            };
            
            const userData = {
                digital_id,
                name: name.trim(),
                email: email.toLowerCase().trim(),
                phone: phone.trim(),
                password: hashedPassword,
                role,
                industry_type,
                profile_data: JSON.stringify(updatedProfileData),
                organization_id,
                is_verified: false,
                is_approved: true, // Auto-approve for demo
                is_active: true
            };

            const user = await User.create(userData);

            // Generate OTP
            const otp = this.generateOTP();
            const otpExpiry = Date.now() + (10 * 60 * 1000); // 10 minutes

            // Store OTP
            this.otpStore.set(digital_id, {
                otp,
                expires: otpExpiry,
                email,
                name
            });

            // Send verification email
            await this.sendVerificationEmail(email, name, otp, digital_id);

            // Associate user with organization if needed
            try {
                const Organization = require('../models/Organization');
                await Organization.associateUser(organization_id, digital_id, role);
            } catch (err) {
                console.error('Error associating user with organization:', err);
                // Continue with registration even if association fails
            }
            
            // Get organization name
            let organizationName = 'Universal Attendance';
            try {
                const org = await new Promise((resolve, reject) => {
                    db.get(
                        "SELECT name FROM organizations WHERE id = ?", 
                        [organization_id], 
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        }
                    );
                });
                
                if (org && org.name) {
                    organizationName = org.name;
                }
            } catch (err) {
                console.error('Error getting organization name:', err);
            }
            
            // Log registration event
            console.log(`User registered: ${digital_id} (${email}) at ${organizationName}`);

            res.status(201).json({
                success: true,
                message: 'Registration successful. Please check your email for verification code.',
                digital_id,
                user: {
                    digital_id,
                    name,
                    email,
                    role,
                    industry_type,
                    organization: organizationName
                }
            });

        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({
                success: false,
                message: 'Registration failed. Please try again.',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // Email/OTP Verification
    async verifyOTP(req, res) {
        try {
            const { digital_id, otp } = req.body;

            if (!digital_id || !otp) {
                return res.status(400).json({
                    success: false,
                    message: 'Digital ID and OTP are required'
                });
            }

            // Get stored OTP
            const storedOTP = this.otpStore.get(digital_id);
            if (!storedOTP) {
                return res.status(404).json({
                    success: false,
                    message: 'OTP not found or expired'
                });
            }

            // Check expiration
            if (Date.now() > storedOTP.expires) {
                this.otpStore.delete(digital_id);
                return res.status(400).json({
                    success: false,
                    message: 'OTP has expired. Please request a new one.'
                });
            }

            // Verify OTP
            if (storedOTP.otp !== otp.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid OTP'
                });
            }

            // Update user verification status
            await User.updateVerificationStatus(digital_id, true);

            // Remove OTP from store
            this.otpStore.delete(digital_id);

            // Log verification event
            console.log(`User verified: ${digital_id}`);

            res.json({
                success: true,
                message: 'Account verified successfully! You can now login.'
            });

        } catch (error) {
            console.error('OTP verification error:', error);
            res.status(500).json({
                success: false,
                message: 'Verification failed. Please try again.'
            });
        }
    }

    // Resend OTP
    async resendOTP(req, res) {
        try {
            const { digital_id } = req.body;

            if (!digital_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Digital ID is required'
                });
            }

            // Get user
            const user = await User.findByDigitalId(digital_id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            if (user.is_verified) {
                return res.status(400).json({
                    success: false,
                    message: 'Account is already verified'
                });
            }

            // Generate new OTP
            const otp = this.generateOTP();
            const otpExpiry = Date.now() + (10 * 60 * 1000);

            // Store new OTP
            this.otpStore.set(digital_id, {
                otp,
                expires: otpExpiry,
                email: user.email,
                name: user.name
            });

            // Send verification email
            await this.sendVerificationEmail(user.email, user.name, otp, digital_id);

            res.json({
                success: true,
                message: 'New verification code sent to your email'
            });

        } catch (error) {
            console.error('Resend OTP error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to resend verification code'
            });
        }
    }

    // User Login
    async login(req, res) {
        try {
            const { digital_id, password, remember_me = false } = req.body;

            if (!digital_id || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Digital ID and password are required'
                });
            }

            // Check login attempts
            const attemptKey = req.ip + ':' + digital_id;
            if (this.isLockedOut(attemptKey)) {
                return res.status(429).json({
                    success: false,
                    message: 'Too many failed login attempts. Please try again later.'
                });
            }

            // Find user
            const user = await User.findByDigitalId(digital_id);
            if (!user) {
                this.recordFailedAttempt(attemptKey);
                return res.status(404).json({
                    success: false,
                    message: 'Invalid credentials'
                });
            }

            // Check if user is verified
            if (!user.is_verified) {
                return res.status(403).json({
                    success: false,
                    message: 'Please verify your email before logging in'
                });
            }

            // Check if user is active
            if (!user.is_active) {
                return res.status(403).json({
                    success: false,
                    message: 'Account is deactivated. Please contact administrator.'
                });
            }

            // Verify password
            const passwordMatch = await bcrypt.compare(password, user.password);
            if (!passwordMatch) {
                this.recordFailedAttempt(attemptKey);
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials'
                });
            }

            // Clear login attempts
            this.loginAttempts.delete(attemptKey);

            // Generate tokens
            const tokenPayload = {
                digital_id: user.digital_id,
                role: user.role,
                industry_type: user.industry_type,
                organization_id: user.organization_id
            };

            const accessToken = jwt.sign(
                tokenPayload,
                process.env.JWT_SECRET,
                { expiresIn: remember_me ? '30d' : '8h' }
            );

            const refreshToken = jwt.sign(
                tokenPayload,
                process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
                { expiresIn: '30d' }
            );

            // Store refresh token
            this.refreshTokens.set(refreshToken, {
                digital_id: user.digital_id,
                expires: Date.now() + (30 * 24 * 60 * 60 * 1000)
            });

            // Update last login
            await User.updateLastLogin(user.digital_id);

            // Log login event
            console.log(`User logged in: ${user.digital_id} from ${req.ip}`);

            res.json({
                success: true,
                message: 'Login successful',
                token: accessToken,
                refresh_token: refreshToken,
                digital_id: user.digital_id,
                name: user.name,
                role: user.role,
                industry_type: user.industry_type,
                user: {
                    digital_id: user.digital_id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    industry_type: user.industry_type,
                    organization_id: user.organization_id
                }
            });

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                success: false,
                message: 'Login failed. Please try again.'
            });
        }
    }

    // Refresh Token
    async refreshToken(req, res) {
        try {
            const { refresh_token } = req.body;

            if (!refresh_token) {
                return res.status(400).json({
                    success: false,
                    message: 'Refresh token is required'
                });
            }

            // Verify refresh token
            const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
            
            // Check if refresh token exists in store
            const storedToken = this.refreshTokens.get(refresh_token);
            if (!storedToken || storedToken.digital_id !== decoded.digital_id) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid refresh token'
                });
            }

            // Check expiration
            if (Date.now() > storedToken.expires) {
                this.refreshTokens.delete(refresh_token);
                return res.status(401).json({
                    success: false,
                    message: 'Refresh token expired'
                });
            }

            // Get updated user data
            const user = await User.findByDigitalId(decoded.digital_id);
            if (!user || !user.is_active) {
                this.refreshTokens.delete(refresh_token);
                return res.status(401).json({
                    success: false,
                    message: 'User not found or inactive'
                });
            }

            // Generate new access token
            const newAccessToken = jwt.sign(
                {
                    digital_id: user.digital_id,
                    role: user.role,
                    industry_type: user.industry_type,
                    organization_id: user.organization_id
                },
                process.env.JWT_SECRET,
                { expiresIn: '8h' }
            );

            res.json({
                success: true,
                token: newAccessToken,
                user: {
                    digital_id: user.digital_id,
                    name: user.name,
                    role: user.role,
                    industry_type: user.industry_type
                }
            });

        } catch (error) {
            console.error('Token refresh error:', error);
            res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }
    }

    // Logout
    async logout(req, res) {
        try {
            const { refresh_token } = req.body;

            // Remove refresh token if provided
            if (refresh_token) {
                this.refreshTokens.delete(refresh_token);
            }

            // Log logout event
            console.log(`User logged out: ${req.user?.digital_id} from ${req.ip}`);

            res.json({
                success: true,
                message: 'Logged out successfully'
            });

        } catch (error) {
            console.error('Logout error:', error);
            res.status(500).json({
                success: false,
                message: 'Logout failed'
            });
        }
    }

    // Forgot Password
    async forgotPassword(req, res) {
        try {
            const { digital_id, email } = req.body;

            if (!digital_id || !email) {
                return res.status(400).json({
                    success: false,
                    message: 'Digital ID and email are required'
                });
            }

            // Find user
            const user = await User.findByDigitalIdAndEmail(digital_id, email);
            if (!user) {
                // Don't reveal if user exists
                return res.json({
                    success: true,
                    message: 'If the provided information is correct, a password reset link has been sent to your email.'
                });
            }

            if (!user.is_verified) {
                return res.status(403).json({
                    success: false,
                    message: 'Please verify your email first'
                });
            }

            // Generate reset token
            const resetToken = jwt.sign(
                { digital_id: user.digital_id, purpose: 'password_reset' },
                process.env.JWT_RESET_SECRET || process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            // Send reset email
            await this.sendPasswordResetEmail(user.email, user.name, resetToken);

            // Log reset request
            console.log(`Password reset requested: ${user.digital_id}`);

            res.json({
                success: true,
                message: 'If the provided information is correct, a password reset link has been sent to your email.'
            });

        } catch (error) {
            console.error('Forgot password error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to process password reset request'
            });
        }
    }

    // Reset Password
    async resetPassword(req, res) {
        try {
            const { token, new_password } = req.body;

            if (!token || !new_password) {
                return res.status(400).json({
                    success: false,
                    message: 'Token and new password are required'
                });
            }

            // Verify reset token
            const decoded = jwt.verify(token, process.env.JWT_RESET_SECRET || process.env.JWT_SECRET);
            
            if (decoded.purpose !== 'password_reset') {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid reset token'
                });
            }

            // Hash new password
            const hashedPassword = await bcrypt.hash(new_password, 12);

            // Update password
            await User.updatePassword(decoded.digital_id, hashedPassword);

            // Invalidate all refresh tokens for this user
            for (const [token, data] of this.refreshTokens.entries()) {
                if (data.digital_id === decoded.digital_id) {
                    this.refreshTokens.delete(token);
                }
            }

            // Log password reset
            console.log(`Password reset completed: ${decoded.digital_id}`);

            res.json({
                success: true,
                message: 'Password reset successfully'
            });

        } catch (error) {
            console.error('Reset password error:', error);
            
            if (error.name === 'JsonWebTokenError') {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid or expired reset token'
                });
            }

            res.status(500).json({
                success: false,
                message: 'Failed to reset password'
            });
        }
    }

    // Change Password (for authenticated users)
    async changePassword(req, res) {
        try {
            const { current_password, new_password } = req.body;
            const digital_id = req.user.digital_id;

            if (!current_password || !new_password) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password and new password are required'
                });
            }

            // Get user
            const user = await User.findByDigitalId(digital_id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Verify current password
            const passwordMatch = await bcrypt.compare(current_password, user.password);
            if (!passwordMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'Current password is incorrect'
                });
            }

            // Hash new password
            const hashedPassword = await bcrypt.hash(new_password, 12);

            // Update password
            await User.updatePassword(digital_id, hashedPassword);

            // Log password change
            console.log(`Password changed: ${digital_id}`);

            res.json({
                success: true,
                message: 'Password changed successfully'
            });

        } catch (error) {
            console.error('Change password error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to change password'
            });
        }
    }

    // Helper Methods
    generateOTP() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    async sendVerificationEmail(email, name, otp, digitalId) {
        const subject = 'Verify Your Universal Attendance Account';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #667eea;">Welcome to Universal Attendance System!</h2>
                <p>Hello ${name},</p>
                <p>Thank you for registering with our Universal Attendance System. To complete your registration, please verify your email address.</p>
                
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                    <h3 style="color: #2c3e50;">Your Verification Code</h3>
                    <h1 style="color: #667eea; font-size: 32px; letter-spacing: 3px; margin: 10px 0;">${otp}</h1>
                    <p style="color: #7f8c8d;">This code expires in 10 minutes</p>
                </div>
                
                <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <h4 style="color: #27ae60; margin-top: 0;">Your Login Credentials</h4>
                    <p><strong>Digital ID:</strong> ${digitalId}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p style="color: #7f8c8d; font-size: 12px;">Please keep these credentials safe for future logins.</p>
                </div>
                
                <p>If you didn't create this account, please ignore this email.</p>
                <p>Best regards,<br>Universal Attendance System Team</p>
            </div>
        `;

        await sendEmail(email, subject, html);
    }

    async sendPasswordResetEmail(email, name, token) {
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
        const subject = 'Reset Your Password - Universal Attendance';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #667eea;">Password Reset Request</h2>
                <p>Hello ${name},</p>
                <p>You requested to reset your password for Universal Attendance System.</p>
                
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                    <p>Click the button below to reset your password:</p>
                    <a href="${resetUrl}" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
                    <p style="color: #7f8c8d; font-size: 12px; margin-top: 15px;">This link expires in 1 hour</p>
                </div>
                
                <p>If you didn't request this password reset, please ignore this email.</p>
                <p>Best regards,<br>Universal Attendance System Team</p>
            </div>
        `;

        await sendEmail(email, subject, html);
    }

    recordFailedAttempt(key) {
        const attempts = this.loginAttempts.get(key) || { count: 0, firstAttempt: Date.now() };
        attempts.count++;
        attempts.lastAttempt = Date.now();
        
        if (attempts.count >= this.maxLoginAttempts) {
            attempts.lockedUntil = Date.now() + this.lockoutDuration;
        }
        
        this.loginAttempts.set(key, attempts);
    }

    isLockedOut(key) {
        const attempts = this.loginAttempts.get(key);
        if (!attempts) return false;
        
        if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
            return true;
        }
        
        // Reset if lockout period has passed
        if (attempts.lockedUntil && Date.now() >= attempts.lockedUntil) {
            this.loginAttempts.delete(key);
        }
        
        return false;
    }
}

module.exports = new AuthController();
