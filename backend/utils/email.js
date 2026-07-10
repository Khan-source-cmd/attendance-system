/**
 * Email Service Utilities
 */

const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransporter({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER || 'kabdulrehman8169@gmail.com',
                pass: process.env.EMAIL_PASS || 'wtpgxovmxlqcbgmx'
            }
        });
    }

    // Send verification email with OTP
    async sendVerificationEmail(email, name, otp, digitalId) {
        const subject = 'Verify Your Universal Attendance Account';
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                    .otp-box { background: white; border: 2px dashed #667eea; padding: 20px; text-align: center; margin: 20px 0; border-radius: 10px; }
                    .otp-code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; }
                    .credentials { background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0; }
                    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Welcome to Universal Attendance!</h1>
                        <p>Your account verification is required</p>
                    </div>
                    <div class="content">
                        <p>Hello <strong>${name}</strong>,</p>
                        <p>Thank you for registering with Universal Attendance System. Please use the verification code below to activate your account:</p>
                        
                        <div class="otp-box">
                            <p>Your Verification Code</p>
                            <div class="otp-code">${otp}</div>
                            <p style="color: #888; font-size: 14px;">This code expires in 10 minutes</p>
                        </div>
                        
                        <div class="credentials">
                            <h4 style="color: #27ae60; margin-top: 0;">Your Login Details</h4>
                            <p><strong>Digital ID:</strong> ${digitalId}</p>
                            <p><strong>Email:</strong> ${email}</p>
                            <p style="font-size: 12px; color: #666;">Please save these details for future logins</p>
                        </div>
                        
                        <p>If you didn't create this account, please ignore this email.</p>
                    </div>
                    <div class="footer">
                        <p>© 2025 Universal Attendance System. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        return this.sendEmail(email, subject, html);
    }

    // Send password reset email
    async sendPasswordResetEmail(email, name, resetToken) {
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:4000'}/reset-password?token=${resetToken}`;
        const subject = 'Reset Your Password - Universal Attendance';
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                    .reset-box { background: white; padding: 20px; text-align: center; margin: 20px 0; border-radius: 10px; border: 1px solid #ddd; }
                    .reset-button { display: inline-block; background: #e74c3c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; }
                    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Password Reset Request</h1>
                        <p>Secure your account access</p>
                    </div>
                    <div class="content">
                        <p>Hello <strong>${name}</strong>,</p>
                        <p>We received a request to reset your password for Universal Attendance System.</p>
                        
                        <div class="reset-box">
                            <p>Click the button below to reset your password:</p>
                            <a href="${resetUrl}" class="reset-button">Reset Password</a>
                            <p style="color: #888; font-size: 14px; margin-top: 15px;">This link expires in 1 hour</p>
                        </div>
                        
                        <p>If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
                        <p>For security reasons, please don't share this email with anyone.</p>
                    </div>
                    <div class="footer">
                        <p>© 2025 Universal Attendance System. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        return this.sendEmail(email, subject, html);
    }

    // Send welcome email after verification
    async sendWelcomeEmail(email, name, digitalId, industry) {
        const subject = 'Welcome to Universal Attendance System!';
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #27ae60, #2ecc71); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                    .features { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
                    .feature-item { display: flex; align-items: center; margin: 10px 0; }
                    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎉 Welcome Aboard!</h1>
                        <p>Your account is now active</p>
                    </div>
                    <div class="content">
                        <p>Hello <strong>${name}</strong>,</p>
                        <p>Congratulations! Your Universal Attendance System account has been successfully verified and activated.</p>
                        
                        <div class="features">
                            <h3>What you can do now:</h3>
                            <div class="feature-item">✅ Track your attendance with QR codes</div>
                            <div class="feature-item">✅ View your attendance history</div>
                            <div class="feature-item">✅ Generate detailed reports</div>
                            <div class="feature-item">✅ Access ${industry} industry specific features</div>
                        </div>
                        
                        <p><strong>Your Digital ID:</strong> ${digitalId}</p>
                        <p>You can now login to the system using your Digital ID and password.</p>
                        
                        <p>If you need any assistance, feel free to contact our support team.</p>
                    </div>
                    <div class="footer">
                        <p>© 2025 Universal Attendance System. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        return this.sendEmail(email, subject, html);
    }

    // Send notification email (for admins or urgent notifications)
    async sendNotificationEmail(email, subject, message, priority = 'normal') {
        const priorityColors = {
            high: '#e74c3c',
            medium: '#f39c12',
            normal: '#3498db'
        };

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: ${priorityColors[priority]}; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>${subject}</h1>
                        <p>Universal Attendance System Notification</p>
                    </div>
                    <div class="content">
                        <p>${message}</p>
                        <p style="color: #888; font-size: 14px;">Time: ${new Date().toLocaleString()}</p>
                    </div>
                    <div class="footer">
                        <p>© 2025 Universal Attendance System. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        return this.sendEmail(email, subject, html);
    }

    // Core send email method
    async sendEmail(to, subject, html) {
        try {
            const mailOptions = {
                from: `"Universal Attendance System" <${process.env.EMAIL_USER || 'kabdulrehman8169@gmail.com'}>`,
                to,
                subject,
                html
            };

            const result = await this.transporter.sendMail(mailOptions);
            console.log(` Email sent to ${to}: ${subject}`);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error(`❌ Email send failed to ${to}:`, error);
            throw new Error(`Failed to send email: ${error.message}`);
        }
    }

    // Verify email configuration
    async verifyConnection() {
        try {
            await this.transporter.verify();
            console.log(' Email service is ready');
            return true;
        } catch (error) {
            console.error('❌ Email service error:', error);
            return false;
        }
    }
}

module.exports = new EmailService();
