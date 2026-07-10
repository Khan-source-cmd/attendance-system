/**
 * Data Validation Utilities
 */

class Validators {
    // Email validation
    static validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Phone validation (international format)
    static validatePhone(phone) {
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        return phoneRegex.test(phone.replace(/\s|-|\(|\)/g, ''));
    }

    // Password strength validation
    static validatePassword(password) {
        const minLength = 6;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

        return {
            isValid: password.length >= minLength && hasLowerCase && hasNumbers,
            strength: this.getPasswordStrength(password),
            requirements: {
                minLength: password.length >= minLength,
                hasUpperCase,
                hasLowerCase,
                hasNumbers,
                hasSpecialChar
            }
        };
    }

    // Get password strength level
    static getPasswordStrength(password) {
        let score = 0;
        if (password.length >= 8) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[a-z]/.test(password)) score++;
        if (/\d/.test(password)) score++;
        if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;

        if (score < 2) return 'weak';
        if (score < 4) return 'medium';
        return 'strong';
    }

    // Digital ID format validation
    static validateDigitalId(digitalId) {
        const digitalIdRegex = /^[A-Z]{3}-[A-Z]{3}-\d{4}$/;
        return digitalIdRegex.test(digitalId);
    }

    // Industry validation
    static validateIndustry(industry) {
        const validIndustries = [
            'healthcare', 'education', 'corporate', 
            'manufacturing', 'government', 'retail'
        ];
        return validIndustries.includes(industry.toLowerCase());
    }

    // Role validation by industry
    static validateRole(role, industry) {
        const rolesByIndustry = {
            healthcare: ['Doctor', 'Nurse', 'Technician', 'Administrator', 'Receptionist', 'Pharmacist'],
            education: ['Teacher', 'Professor', 'Student', 'Administrator', 'Librarian', 'Counselor'],
            corporate: ['Manager', 'Executive', 'Developer', 'Analyst', 'HR', 'Sales Representative'],
            manufacturing: ['Operator', 'Supervisor', 'Quality Inspector', 'Maintenance', 'Safety Officer'],
            government: ['Officer', 'Clerk', 'Administrator', 'Inspector', 'Coordinator'],
            retail: ['Sales Associate', 'Cashier', 'Manager', 'Stock Clerk', 'Customer Service']
        };

        const validRoles = rolesByIndustry[industry.toLowerCase()] || [];
        return validRoles.includes(role);
    }

    // Attendance punch type validation
    static validatePunchType(punchType) {
        const validTypes = ['in', 'out', 'break_start', 'break_end'];
        return validTypes.includes(punchType);
    }

    // Location coordinates validation
    static validateCoordinates(latitude, longitude) {
        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);
        
        return !isNaN(lat) && !isNaN(lng) && 
               lat >= -90 && lat <= 90 && 
               lng >= -180 && lng <= 180;
    }

    // Name validation
    static validateName(name) {
        if (!name || typeof name !== 'string') return false;
        const trimmedName = name.trim();
        return trimmedName.length >= 2 && trimmedName.length <= 100;
    }

    // Sanitize input data
    static sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        
        return input
            .trim()
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/<[\/\!]*?[^<>]*?>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '');
    }

    // Validate registration data
    static validateRegistrationData(data) {
        const errors = [];

        if (!this.validateName(data.name)) {
            errors.push('Invalid name format');
        }

        if (!this.validateEmail(data.email)) {
            errors.push('Invalid email format');
        }

        if (!this.validatePhone(data.phone)) {
            errors.push('Invalid phone number format');
        }

        const passwordValidation = this.validatePassword(data.password);
        if (!passwordValidation.isValid) {
            errors.push('Password does not meet requirements');
        }

        if (!this.validateIndustry(data.industry_type)) {
            errors.push('Invalid industry selection');
        }

        if (!this.validateRole(data.role, data.industry_type)) {
            errors.push('Invalid role for selected industry');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // Validate login data
    static validateLoginData(data) {
        const errors = [];

        if (!data.digital_id || !this.validateDigitalId(data.digital_id)) {
            errors.push('Invalid digital ID format');
        }

        if (!data.password || data.password.length < 1) {
            errors.push('Password is required');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

module.exports = Validators;
