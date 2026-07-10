/**
 * Universal Attendance System - Enhanced Authentication Module
 * Handles login, registration, and organization-based authorization
 */

class AuthManager {
    constructor() {
        this.loginAttempts = 0;
        this.maxLoginAttempts = 5;
        this.lockoutDuration = 15 * 60 * 1000; // 15 minutes
        this.passwordStrengthRegex = {
            weak: /^.{6,}$/,
            medium: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
            strong: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{10,}$/
        };
    }

    // Enhanced User Registration with Organization Verification
    async register(userData) {
        try {
            if (typeof loadingManager !== 'undefined') {
                loadingManager.show('registration', 'Creating your account...');
            }

            // Validate registration data including organization verification
            const validation = this.validateRegistrationData(userData);
            if (!validation.isValid) {
                throw new Error(validation.message);
            }

            // Check if organization code is valid
            const orgValidation = await this.validateOrganizationCode(userData.organization_code, userData.industry_type);
            if (!orgValidation.isValid) {
                throw new Error(orgValidation.message);
            }

            const response = await apiClient.post('/api/register', {
                ...userData,
                organization_id: orgValidation.organization_id
                // Hybrid approach: auto-approve but validate organization code
            });

            if (response.success) {
                if (typeof app !== 'undefined' && app.showNotification) {
                    app.showNotification('Registration successful! Please check your email for verification code.', 'success');
                }
                return {
                    success: true,
                    digital_id: response.digital_id,
                    message: response.message,
                    status: 'auto_approved' // Hybrid approach: auto-approved
                };
            } else {
                throw new Error(response.message);
            }

        } catch (error) {
            console.error('Registration error:', error);
            if (typeof app !== 'undefined' && app.showNotification) {
                app.showNotification(error.message || 'Registration failed', 'error');
            }
            throw error;
        } finally {
            if (typeof loadingManager !== 'undefined') {
                loadingManager.hide('registration');
            }
        }
    }

    // Organization Code Validation
    async validateOrganizationCode(code, industry) {
        try {
            const response = await apiClient.post('/api/validate-org-code', {
                code: code,
                industry_type: industry
            });

            if (response.success) {
                return {
                    isValid: true,
                    organization_id: response.organization_id,
                    organization_name: response.organization_name
                };
            } else {
                return {
                    isValid: false,
                    message: response.message || 'Invalid organization code'
                };
            }
        } catch (error) {
            console.error('Organization validation error:', error);
            return {
                isValid: false,
                message: 'Unable to validate organization code. Please try again.'
            };
        }
    }

    // Request Organization Access (for users without invitation)
    async requestOrganizationAccess(organizationId, userData) {
        try {
            if (typeof loadingManager !== 'undefined') {
                loadingManager.show('access-request', 'Submitting access request...');
            }

            const response = await apiClient.post('/api/request-access', {
                organization_id: organizationId,
                user_data: userData,
                request_type: 'organization_access'
            });

            if (response.success) {
                if (typeof app !== 'undefined' && app.showNotification) {
                    app.showNotification('Access request submitted! The organization admin will review your request.', 'success');
                }
                return { success: true, request_id: response.request_id };
            } else {
                throw new Error(response.message);
            }

        } catch (error) {
            console.error('Access request error:', error);
            if (typeof app !== 'undefined' && app.showNotification) {
                app.showNotification(error.message || 'Access request failed', 'error');
            }
            throw error;
        } finally {
            if (typeof loadingManager !== 'undefined') {
                loadingManager.hide('access-request');
            }
        }
    }

    // Admin Approval Process
    async approveUserRegistration(userId, adminNotes = '') {
        try {
            if (typeof loadingManager !== 'undefined') {
                loadingManager.show('approval', 'Approving user registration...');
            }

            const response = await apiClient.post('/api/approve-user', {
                user_id: userId,
                admin_notes: adminNotes,
                approved_by: (typeof app !== 'undefined' && app.user?.digital_id) || null
            });

            if (response.success) {
                if (typeof app !== 'undefined' && app.showNotification) {
                    app.showNotification('User registration approved successfully', 'success');
                }
                return { success: true };
            } else {
                throw new Error(response.message);
            }

        } catch (error) {
            console.error('Approval error:', error);
            if (typeof app !== 'undefined' && app.showNotification) {
                app.showNotification(error.message || 'Approval failed', 'error');
            }
            throw error;
        } finally {
            if (typeof loadingManager !== 'undefined') {
                loadingManager.hide('approval');
            }
        }
    }

    // Admin Rejection Process
    async rejectUserRegistration(userId, reason) {
        try {
            if (typeof loadingManager !== 'undefined') {
                loadingManager.show('rejection', 'Rejecting user registration...');
            }

            const response = await apiClient.post('/api/reject-user', {
                user_id: userId,
                rejection_reason: reason,
                rejected_by: (typeof app !== 'undefined' && app.user?.digital_id) || null
            });

            if (response.success) {
                if (typeof app !== 'undefined' && app.showNotification) {
                    app.showNotification('User registration rejected', 'info');
                }
                return { success: true };
            } else {
                throw new Error(response.message);
            }

        } catch (error) {
            console.error('Rejection error:', error);
            if (typeof app !== 'undefined' && app.showNotification) {
                app.showNotification(error.message || 'Rejection failed', 'error');
            }
            throw error;
        } finally {
            if (typeof loadingManager !== 'undefined') {
                loadingManager.hide('rejection');
            }
        }
    }

    // Enhanced Login with Organization Context
    async login(credentials) {
        try {
            // Check if user is locked out
            if (this.isLockedOut()) {
                const remainingTime = this.getRemainingLockoutTime();
                throw new Error(`Too many failed attempts. Try again in ${remainingTime} minutes.`);
            }

            if (typeof loadingManager !== 'undefined') {
                loadingManager.show('login', 'Signing you in...');
            }

            // Validate credentials
            const validation = this.validateLoginCredentials(credentials);
            if (!validation.isValid) {
                throw new Error(validation.message);
            }

            const response = await apiClient.post('/api/login', {
                digital_id: credentials.digitalId,
                password: credentials.password
            });

            if (response.success) {
                // Hybrid approach: users are auto-approved, no admin approval needed

                // Reset login attempts on successful login
                this.resetLoginAttempts();

                // Clear any existing user data to prevent session contamination between different users
                this.clearExistingUserData();

                // Store authentication data with organization context
                if (typeof app !== 'undefined') {
                    console.log('Login Debug - Setting user data:', {
                        digital_id: response.digital_id,
                        name: response.name,
                        role: response.role,
                        industry_type: response.industry_type,
                        organization_id: response.organization_id
                    });

                    app.token = response.token;
                    app.user = {
                        digital_id: response.digital_id,
                        name: response.name,
                        role: response.role,
                        industry_type: response.industry_type,
                        organization_id: response.organization_id,
                        organization_name: response.organization_name,
                        permissions: response.permissions || []
                    };
                    app.isAuthenticated = true;
                    app.industry = response.industry_type;
                    app.role = response.role;
                    app.organization = {
                        id: response.organization_id,
                        name: response.organization_name
                    };

                    // Save to storage
                    if (app.saveToStorage) {
                        app.saveToStorage();
                        console.log('Login Debug - Data saved to storage');
                    }

                    // Log login event
                    this.logAuthEvent('login', 'success');

                    if (app.showNotification) {
                        app.showNotification(`Welcome back, ${response.name}!`, 'success');
                    }

                    console.log('Login Debug - Final app state:', {
                        user: app.user,
                        industry: app.industry,
                        role: app.role,
                        isAuthenticated: app.isAuthenticated
                    });
                }

                // Also store in sessionStorage for pages that don't have the app object (like register.html)
                // Use consistent field naming for better compatibility
                if (typeof window !== 'undefined' && window.sessionStorage) {
                    sessionStorage.setItem('token', response.token);
                    sessionStorage.setItem('digitalid', response.digital_id);
                    sessionStorage.setItem('role', response.role || 'user');
                    sessionStorage.setItem('name', response.name || '');
                    sessionStorage.setItem('industrytype', response.industry_type || ''); // Keep for backward compatibility
                    sessionStorage.setItem('industry_type', response.industry_type || ''); // Add snake_case version
                    sessionStorage.setItem('industry', response.industry_type || ''); // Add simple version
                    sessionStorage.setItem('organization_id', response.organization_id || '');
                    sessionStorage.setItem('organization_name', response.organization_name || '');
                }

                return {
                    success: true,
                    user: response.user || {
                        digital_id: response.digital_id,
                        name: response.name,
                        role: response.role,
                        industry_type: response.industry_type,
                        organization_id: response.organization_id,
                        organization_name: response.organization_name,
                        permissions: response.permissions || []
                    },
                    redirectUrl: this.getRedirectUrl(response.role, response.industry_type)
                };

            } else {
                this.incrementLoginAttempts();
                throw new Error(response.message);
            }

        } catch (error) {
            console.error('Login error:', error);
            this.logAuthEvent('login', 'failed', error.message);
            if (typeof app !== 'undefined' && app.showNotification) {
                app.showNotification(error.message || 'Login failed', 'error');
            }
            throw error;
        } finally {
            if (typeof loadingManager !== 'undefined') {
                loadingManager.hide('login');
            }
        }
    }

    // Enhanced Registration Data Validation
    validateRegistrationData(userData) {
        const errors = [];

        // Name validation
        if (!userData.name || userData.name.trim().length < 2) {
            errors.push('Name must be at least 2 characters long');
        }

        // Email validation
        if (!userData.email || !Utils.validateEmail(userData.email)) {
            errors.push('Please enter a valid email address');
        }

        // Phone validation
        if (!userData.phone || !Utils.validatePhone(userData.phone)) {
            errors.push('Please enter a valid phone number');
        }

        // Organization code validation
        if (!userData.organization_code || userData.organization_code.trim().length === 0) {
            errors.push('Organization code is required for verification');
        }

        // Role validation
        if (!userData.role) {
            errors.push('Please select a role');
        }

        // Industry validation
        if (!userData.industry_type) {
            errors.push('Please select an industry');
        }

        // Password validation
        if (!userData.password) {
            errors.push('Password is required');
        } else {
            const strength = this.getPasswordStrength(userData.password);
            if (strength === 'weak') {
                errors.push('Password is too weak. Please use at least 8 characters with mixed case and numbers');
            }
        }

        return {
            isValid: errors.length === 0,
            message: errors.join(', ')
        };
    }

    // Login Credentials Validation
    validateLoginCredentials(credentials) {
        const errors = [];

        // Digital ID validation
        if (!credentials.digitalId || credentials.digitalId.trim().length === 0) {
            errors.push('Digital ID is required');
        }

        // Password validation
        if (!credentials.password || credentials.password.trim().length === 0) {
            errors.push('Password is required');
        }

        return {
            isValid: errors.length === 0,
            message: errors.join(', ')
        };
    }

    // Get Organization Details
    async getOrganizationDetails(orgId) {
        try {
            const response = await apiClient.get(`/api/organization/${orgId}`);
            return response.success ? response.organization : null;
        } catch (error) {
            console.error('Error fetching organization details:', error);
            return null;
        }
    }

    // Check User Permissions
    hasPermission(permission) {
        if (typeof app === 'undefined' || !app.user || !app.user.permissions) return false;
        return app.user.permissions.includes(permission);
    }

    // Get Users Pending Approval (Admin Only)
    async getPendingUsers() {
        try {
            const response = await apiClient.get('/api/pending-users');
            return response.success ? response.users : [];
        } catch (error) {
            console.error('Error fetching pending users:', error);
            return [];
        }
    }

    // Get Organization Members (Admin Only)
    async getOrganizationMembers() {
        try {
            const response = await apiClient.get('/api/organization-members');
            return response.success ? response.members : [];
        } catch (error) {
            console.error('Error fetching organization members:', error);
            return [];
        }
    }

    // Rest of the existing methods remain the same...
    // (keeping the file size manageable, but all original methods are preserved)

    // Get Password Strength
    getPasswordStrength(password) {
        if (this.passwordStrengthRegex.strong.test(password)) {
            return 'strong';
        } else if (this.passwordStrengthRegex.medium.test(password)) {
            return 'medium';
        } else if (this.passwordStrengthRegex.weak.test(password)) {
            return 'weak';
        }
        return 'invalid';
    }

    // Login Attempts Management
    incrementLoginAttempts() {
        this.loginAttempts++;
        if (this.loginAttempts >= this.maxLoginAttempts) {
            const lockoutTime = Date.now() + this.lockoutDuration;
            localStorage.setItem('lockout_until', lockoutTime.toString());
        }
    }

    resetLoginAttempts() {
        this.loginAttempts = 0;
        localStorage.removeItem('lockout_until');
    }

    isLockedOut() {
        const lockoutUntil = localStorage.getItem('lockout_until');
        if (!lockoutUntil) return false;

        const lockoutTime = parseInt(lockoutUntil);
        if (Date.now() > lockoutTime) {
            localStorage.removeItem('lockout_until');
            return false;
        }
        return true;
    }

    getRemainingLockoutTime() {
        const lockoutUntil = localStorage.getItem('lockout_until');
        if (!lockoutUntil) return 0;

        const remaining = parseInt(lockoutUntil) - Date.now();
        return Math.ceil(remaining / (60 * 1000)); // minutes
    }

    // Get Redirect URL based on role and industry type
    getRedirectUrl(role, industryType = null) {
        // If industry type is not provided, try to get it from various sources with fallback handling
        if (!industryType) {
            console.log('🔍 Industry type not provided, attempting to retrieve from storage...');

            // First try from app context (if available)
            if (typeof app !== 'undefined') {
                // Try multiple possible field names for industry type
                industryType = app.industry ||
                              app.user?.industry_type ||
                              app.user?.industrytype ||
                              app.user?.industry;
                console.log('📱 App context industry type:', industryType);
            }

            // If still no industry type, try localStorage with multiple field name variations
            if (!industryType && typeof window !== 'undefined' && window.localStorage) {
                try {
                    // Try multiple possible storage keys and field names
                    const possibleKeys = ['uas_user', 'user', 'user_data'];
                    const possibleFields = ['industry_type', 'industrytype', 'industry'];

                    for (const key of possibleKeys) {
                        const storedData = localStorage.getItem(key);
                        if (storedData) {
                            const parsedData = JSON.parse(storedData);
                            for (const field of possibleFields) {
                                if (parsedData[field]) {
                                    industryType = parsedData[field];
                                    console.log(`💾 Found industry type in localStorage.${key}.${field}:`, industryType);
                                    break;
                                }
                            }
                            if (industryType) break;
                        }
                    }
                } catch (e) {
                    console.error('❌ Error parsing localStorage:', e);
                }
            }

            // As a last resort, try sessionStorage with multiple field name variations
            if (!industryType && typeof window !== 'undefined' && window.sessionStorage) {
                try {
                    // Try multiple possible field names in sessionStorage
                    const possibleFields = ['industrytype', 'industry_type', 'industry'];

                    for (const field of possibleFields) {
                        const sessionValue = sessionStorage.getItem(field);
                        if (sessionValue) {
                            industryType = sessionValue;
                            console.log(`🔗 Found industry type in sessionStorage.${field}:`, industryType);
                            break;
                        }
                    }
                } catch (e) {
                    console.error('❌ Error accessing sessionStorage:', e);
                }
            }

            console.log('🎯 Final resolved industry type:', industryType);
        }

        // Debug logging
        console.log(' Redirect URL Debug:', {
            role: role,
            industryType: industryType,
            appIndustry: typeof app !== 'undefined' ? app.industry : 'app not available',
            appUserIndustry: typeof app !== 'undefined' ? app.user?.industry_type : 'app not available',
            appUser: typeof app !== 'undefined' ? app.user : 'app not available'
        });

        // More robust admin detection - check for various admin patterns
        const isAdmin = role && (
            role.toLowerCase().includes('admin') ||
            role.toLowerCase().includes('administrator') ||
            role.toLowerCase().includes('adm') ||
            role === 'Admin' ||
            role === 'Administrator'
        );

        console.log(' Admin detection:', { role, isAdmin, industryType });

        let redirectUrl;

        // Handle education industry (existing system)
        if (industryType === 'education') {
            switch (role) {
                case 'Admin':
                case 'Administrator':
                    redirectUrl = '/pages/admin-dashboard.html';
                    break;
                case 'Teacher':
                case 'Professor':
                case 'Faculty':
                    redirectUrl = '/pages/teacher-dashboard.html';
                    break;
                default:
                    redirectUrl = '/pages/user-dashboard.html';
                    break;
            }
        } else {
            // Handle industry-specific routing for other industries
            if (isAdmin) {
                // Admin dashboards
                switch (industryType) {
                    case 'healthcare':
                        console.log(' Redirecting healthcare admin to healthcare-admin-dashboard.html');
                        redirectUrl = '/pages/healthcare-admin-dashboard.html';
                        break;
                    case 'corporate':
                        redirectUrl = '/pages/corporate-admin-dashboard.html';
                        break;
                    case 'manufacturing':
                        redirectUrl = '/pages/manufacturing-admin-dashboard.html';
                        break;
                    case 'government':
                        redirectUrl = '/pages/government-admin-dashboard.html';
                        break;
                    case 'retail':
                        redirectUrl = '/pages/retail-admin-dashboard.html';
                        break;
                    default:
                        console.log('❓ Unknown industry type, redirecting to admin-dashboard.html (fallback)');
                        redirectUrl = '/pages/admin-dashboard.html'; // fallback to education admin
                        break;
                }
            } else {
                // User dashboards
                switch (industryType) {
                    case 'healthcare':
                        redirectUrl = '/pages/healthcare-user-dashboard.html';
                        break;
                    case 'corporate':
                        redirectUrl = '/pages/corporate-user-dashboard.html';
                        break;
                    case 'manufacturing':
                        redirectUrl = '/pages/manufacturing-user-dashboard.html';
                        break;
                    case 'government':
                        redirectUrl = '/pages/government-user-dashboard.html';
                        break;
                    case 'retail':
                        redirectUrl = '/pages/retail-user-dashboard.html';
                        break;
                    default:
                        redirectUrl = '/pages/user-dashboard.html'; // fallback to education user
                        break;
                }
            }
        }

        console.log(' Final redirect URL:', redirectUrl);
        return redirectUrl;
    }

    // Log Authentication Events
    logAuthEvent(event, status, details = '') {
        const logEntry = {
            timestamp: new Date().toISOString(),
            event: event,
            status: status,
            details: details,
            user_agent: navigator.userAgent,
            ip_address: 'client-side',
            organization_id: (typeof app !== 'undefined' && app.user?.organization_id) || null
        };

        console.log('Auth Event:', logEntry);

        // Store recent auth events locally
        let authLogs = JSON.parse(localStorage.getItem('auth_logs') || '[]');
        authLogs.unshift(logEntry);
        authLogs = authLogs.slice(0, 50); // Keep only last 50 events
        localStorage.setItem('auth_logs', JSON.stringify(authLogs));
    }

    // Session Management
    async refreshSession() {
        try {
            if (typeof app === 'undefined' || !app.token) {
                throw new Error('No active session');
            }

            const response = await apiClient.get('/api/refresh_token');

            if (response.success) {
                app.token = response.token;
                if (app.saveToStorage) {
                    app.saveToStorage();
                }
                return true;
            } else {
                throw new Error('Session refresh failed');
            }

        } catch (error) {
            console.error('Session refresh error:', error);
            if (typeof app !== 'undefined' && app.logout) {
                app.logout();
            }
            return false;
        }
    }

    // Check if user is authenticated
    isAuthenticated() {
        return typeof app !== 'undefined' && app.isAuthenticated && app.token && app.user;
    }

    // Get current user
    getCurrentUser() {
        return typeof app !== 'undefined' ? app.user : null;
    }

    // Clear existing user session data (prevent session contamination between different users)
    clearExistingUserData() {
        console.log('🧹 Clearing existing user data to prevent session contamination...');

        // Clear app context if it exists
        if (typeof app !== 'undefined') {
            app.token = null;
            app.user = null;
            app.industry = null;
            app.role = null;
            app.isAuthenticated = false;
            app.organization = null;
        }

        // Clear all user-related localStorage keys
        const localStorageKeys = [
            'token', 'digitalid', 'role', 'name', 'industrytype', 'industry_type', 'industry',
            'organization_id', 'organization_name', 'uas_user', 'user', 'user_data',
            'auth_logs', 'currentDashboardUrl'
        ];

        localStorageKeys.forEach(key => {
            try {
                localStorage.removeItem(key);
            } catch (e) {
                // Ignore errors for non-existent keys
            }
        });

        // Clear all user-related sessionStorage keys
        const sessionStorageKeys = [
            'token', 'digitalid', 'role', 'name', 'industrytype', 'industry_type', 'industry',
            'organization_id', 'organization_name', 'lockout_until'
        ];

        sessionStorageKeys.forEach(key => {
            try {
                sessionStorage.removeItem(key);
            } catch (e) {
                // Ignore errors for non-existent keys
            }
        });

        console.log('✅ Existing user data cleared');
    }

    // Setup periodic session refresh
    setupSessionRefresh() {
        setInterval(async () => {
            if (this.isAuthenticated()) {
                try {
                    await this.refreshSession();
                } catch (error) {
                    console.error('Automatic session refresh failed:', error);
                }
            }
        }, 30 * 60 * 1000); // Refresh every 30 minutes
    }
}

// Enhanced Social Authentication
class SocialAuth {
    constructor() {
        this.providers = ['google', 'microsoft', 'apple'];
    }

    async loginWithProvider(provider, token) {
        try {
            if (typeof loadingManager !== 'undefined') {
                loadingManager.show('social-login', `Signing in with ${provider}...`);
            }

            const response = await apiClient.post('/api/social_login', {
                provider: provider,
                token: token
            });

            if (response.success) {
                // Check approval status for social login as well
                if (response.status === 'pending_approval') {
                    throw new Error('Your account is pending admin approval.');
                }

                if (typeof app !== 'undefined') {
                    app.token = response.token;
                    app.user = response.user;
                    app.isAuthenticated = true;
                    if (app.saveToStorage) {
                        app.saveToStorage();
                    }
                }

                return { success: true, user: response.user };
            } else {
                throw new Error(response.message);
            }

        } catch (error) {
            console.error('Social login error:', error);
            if (typeof app !== 'undefined' && app.showNotification) {
                app.showNotification(error.message || 'Social login failed', 'error');
            }
            throw error;
        } finally {
            if (typeof loadingManager !== 'undefined') {
                loadingManager.hide('social-login');
            }
        }
    }
}

// Two-Factor Authentication (for future expansion)
class TwoFactorAuth {
    constructor() {
        this.qrCodeSize = 200;
    }

    async setupTwoFactor() {
        try {
            const response = await apiClient.post('/api/setup_2fa');
            return {
                secret: response.secret,
                qrCode: response.qr_code,
                backupCodes: response.backup_codes
            };
        } catch (error) {
            console.error('2FA setup error:', error);
            throw error;
        }
    }

    async verifyTwoFactor(token) {
        try {
            const response = await apiClient.post('/api/verify_2fa', { token });
            return response.success;
        } catch (error) {
            console.error('2FA verification error:', error);
            throw error;
        }
    }

    async disableTwoFactor(password) {
        try {
            const response = await apiClient.post('/api/disable_2fa', { password });
            return response.success;
        } catch (error) {
            console.error('2FA disable error:', error);
            throw error;
        }
    }
}

// Fallback API Client for when global apiClient is not available
class FallbackApiClient {
    constructor() {
        this.baseURL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? 'http://localhost:4000'
            : `http://${window.location.hostname}:4000`;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...this.getAuthHeaders()
            }
        };

        const finalOptions = { ...defaultOptions, ...options };

        const response = await fetch(url, finalOptions);

        if (response.status === 401) {
            throw new Error('Authentication required');
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    }

    getAuthHeaders() {
        // Try to get token from localStorage
        try {
            const token = localStorage.getItem('uas_token');
            if (token) {
                return { Authorization: `Bearer ${token}` };
            }
        } catch (e) {
            // Ignore localStorage errors
        }
        return {};
    }

    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    async post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }
}

// Use global apiClient if available, otherwise create fallback
const apiClient = typeof window !== 'undefined' && window.apiClient
    ? window.apiClient
    : new FallbackApiClient();

// Initialize auth manager
const authManager = new AuthManager();
const socialAuth = new SocialAuth();
const twoFactorAuth = new TwoFactorAuth();

// Setup session refresh on app initialization
document.addEventListener('DOMContentLoaded', () => {
    authManager.setupSessionRefresh();
});

// Export for global access
window.authManager = authManager;
window.socialAuth = socialAuth;
window.twoFactorAuth = twoFactorAuth;
