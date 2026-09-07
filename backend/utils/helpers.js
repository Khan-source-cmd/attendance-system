/**
 * Helper Utilities for Universal Attendance System
 */
const QRCode = require('qrcode');
// Single shared connection (backend/database.db) - see config/database.js
const { db } = require('../config/database');

const generateRandomCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const generateQRCode = async (data) => {
    try {
        const qrCodeDataURL = await QRCode.toDataURL(data);
        return qrCodeDataURL;
    } catch (error) {
        throw error;
    }
};

const sendEmail = async (to, subject, html) => {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const mailOptions = {
        from: `"Universal Attendance" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        throw error;
    }
};

const generateDigitalId = async (role, industry) => {
    const prefix = `${industry.substring(0,3).toUpperCase()}-${role.substring(0,3).toUpperCase()}`;
    return new Promise((resolve, reject) => {
        db.get(`SELECT digital_id FROM users WHERE digital_id LIKE ? ORDER BY digital_id DESC LIMIT 1`, [`${prefix}%`], (err, row) => {
            if (err) return reject(err);
            let num = 1;
            if (row && row.digital_id) {
                const match = row.digital_id.match(/-(\d{4})$/);
                if (match) {
                    num = parseInt(match[1]) + 1;
                }
            }
            const digitalId = `${prefix}-${String(num).padStart(4, '0')}`;
            resolve(digitalId);
        });
    });
};

module.exports = {
    generateRandomCode,
    generateQRCode,
    sendEmail,
    generateDigitalId,
    db
};
