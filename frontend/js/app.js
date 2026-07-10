/**
 * Universal Attendance System - Main Application JavaScript
 * Handles core application functionality, initialization, and global utilities
 */

// Application Configuration
const AppConfig = {
    // More flexible API base that handles both localhost and 127.0.0.1
    API_BASE: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:4000' : `http://${window.location.hostname}:4000`,
    VERSION: '2.0.0',
    DEBUG: true,
    STORAGE_PREFIX: 'uas_',
    TOKEN_EXPIRY: 8 * 60 * 60 * 1000, // 8 hours in milliseconds
    REFRESH_INTERVAL: 30000, // 30 seconds
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000 // 1 second
};

// Global Application State
class AppState {
    constructor() {
        this.user = null;
        this.token = null;
        this.isAuthenticated = false;
        this.currentPage = null;
        this.notifications = [];
        this.settings = {};
        this.industry = null;
        this.role = null;
    }

    // Initialize application state
    init() {
        this.loadFromStorage();
        this.validateToken();
        this.setupEventListeners();
    }

    // Load state from localStorage
    loadFromStorage() {
        try {
            const token = localStorage.getItem(AppConfig.STORAGE_PREFIX + 'token');
            const user = localStorage.getItem(AppConfig.STORAGE_PREFIX + 'user');
            const settings = localStorage.getItem(AppConfig.STORAGE_PREFIX + 'settings');

            if (token) {
                this.token = token;
                this.isAuthenticated = true;
            }

            if (user) {
                this.user = JSON.parse(user);
                this.industry = this.user.industry_type;
                this.role = this.user.role;
            }

            if (settings) {
                this.settings = JSON.parse(settings);
            }
        } catch (error) {
            console.error('Error loading app state:', error);
            this.clearStorage();
        }
    }

    // Save state to localStorage
    saveToStorage() {
        try {
            if (this.token) {
                localStorage.setItem(AppConfig.STORAGE_PREFIX + 'token', this.token);
            }

            if (this.user) {
                localStorage.setItem(AppConfig.STORAGE_PREFIX + 'user', JSON.stringify(this.user));
            }

            if (this.settings) {
                localStorage.setItem(AppConfig.STORAGE_PREFIX + 'settings', JSON.stringify(this.settings));
            }
        } catch (error) {
            console.error('Error saving app state:', error);
        }
    }

    // Clear all stored data
    clearStorage() {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith(AppConfig.STORAGE_PREFIX)) {
                localStorage.removeItem(key);
            }
        });

        this.user = null;
        this.token = null;
        this.isAuthenticated = false;
        this.notifications = [];
        this.settings = {};
        this.industry = null;
        this.role = null;
    }

    // Validate token expiration
    validateToken() {
        if (!this.token) return;

        try {
            const tokenData = JSON.parse(atob(this.token.split('.')[1]));
            const currentTime = Date.now() / 1000;

            if (tokenData.exp < currentTime) {
                this.clearStorage();
                this.redirectToLogin();
            }
        } catch (error) {
            console.error('Invalid token:', error);
            this.clearStorage();
            this.redirectToLogin();
        }
    }

    // Setup global event listeners
    setupEventListeners() {
        // Handle logout across tabs
        window.addEventListener('storage', (e) => {
            if (e.key === AppConfig.STORAGE_PREFIX + 'token' && !e.newValue) {
                this.logout();
            }
        });

        // Handle page visibility for token refresh
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isAuthenticated) {
                this.validateToken();
            }
        });

        // Handle network status
        window.addEventListener('online', () => {
            this.showNotification('Connection restored', 'success');
        });

        window.addEventListener('offline', () => {
            this.showNotification('No internet connection', 'warning');
        });
    }

    // Redirect to login page
    redirectToLogin() {
        if (!window.location.pathname.includes('/pages/register.html')) {
            window.location.href = '/pages/register.html#login';
        }
    }

    // Logout user
    logout() {
        this.clearStorage();
        this.redirectToLogin();
    }

    // Show notification
    showNotification(message, type = 'info', duration = 5000) {
        const notification = {
            id: Date.now(),
            message,
            type,
            timestamp: new Date()
        };

        this.notifications.unshift(notification);
        this.renderNotification(notification, duration);

        // Limit notifications array
        if (this.notifications.length > 10) {
            this.notifications = this.notifications.slice(0, 10);
        }
    }

    // Render notification element
    renderNotification(notification, duration) {
        const container = this.getOrCreateNotificationContainer();
        
        const notificationElement = document.createElement('div');
        notificationElement.className = `notification notification-${notification.type} fade-in`;
        notificationElement.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${this.getNotificationIcon(notification.type)}"></i>
                <span>${notification.message}</span>
                <button class="notification-close" onclick="app.removeNotification(${notification.id})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        container.appendChild(notificationElement);

        // Auto remove notification
        if (duration > 0) {
            setTimeout(() => {
                this.removeNotification(notification.id);
            }, duration);
        }
    }

    // Get or create notification container
    getOrCreateNotificationContainer() {
        let container = document.getElementById('notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            container.className = 'notification-container';
            document.body.appendChild(container);
        }
        return container;
    }

    // Remove notification
    removeNotification(id) {
        const notification = document.querySelector(`.notification[data-id="${id}"]`);
        if (notification) {
            notification.classList.add('fade-out');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }

        this.notifications = this.notifications.filter(n => n.id !== id);
    }

    // Get notification icon
    getNotificationIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-triangle',
            warning: 'exclamation-circle',
            info: 'info-circle'
        };
        return icons[type] || 'info-circle';
    }
}

// API Client Class
class ApiClient {
    constructor() {
        this.baseURL = AppConfig.API_BASE;
        this.retryAttempts = AppConfig.MAX_RETRY_ATTEMPTS;
        this.retryDelay = AppConfig.RETRY_DELAY;
    }

    // Make API request with retry logic
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...this.getAuthHeaders()
            }
        };

        const finalOptions = { ...defaultOptions, ...options };

        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const response = await fetch(url, finalOptions);
                
                if (response.status === 401) {
                    app.logout();
                    throw new Error('Authentication required');
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return await response.json();
            } catch (error) {
                console.error(`API request failed (attempt ${attempt}):`, error);

                if (attempt === this.retryAttempts) {
                    throw error;
                }

                await this.delay(this.retryDelay * attempt);
            }
        }
    }

    // Get authentication headers
    getAuthHeaders() {
        if (app.token) {
            return { Authorization: `Bearer ${app.token}` };
        }
        return {};
    }

    // Utility delay function
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // GET request
    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    // POST request
    async post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    // PUT request
    async put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    // DELETE request
    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }
}

// Utility Functions
class Utils {
    // Format date for display
    static formatDate(date, options = {}) {
        const defaultOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };

        const finalOptions = { ...defaultOptions, ...options };
        return new Date(date).toLocaleDateString('en-US', finalOptions);
    }

    // Format relative time (e.g., "2 hours ago")
    static formatRelativeTime(date) {
        const now = new Date();
        const diffInSeconds = Math.floor((now - new Date(date)) / 1000);

        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
        return `${Math.floor(diffInSeconds / 86400)} days ago`;
    }

    // Debounce function
    static debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    // Throttle function
    static throttle(func, delay) {
        let lastCall = 0;
        return function (...args) {
            const now = Date.now();
            if (now - lastCall >= delay) {
                lastCall = now;
                func.apply(this, args);
            }
        };
    }

    // Validate email
    static validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Validate phone
    static validatePhone(phone) {
        const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
        return phoneRegex.test(phone);
    }

    // Generate random ID
    static generateId() {
        return Math.random().toString(36).substr(2, 9);
    }

    // Copy to clipboard
    static async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            app.showNotification('Copied to clipboard', 'success');
        } catch (error) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            app.showNotification('Copied to clipboard', 'success');
        }
    }

    // Get device info
    static getDeviceInfo() {
        const userAgent = navigator.userAgent;
        return {
            browser: this.getBrowserName(userAgent),
            os: this.getOSName(userAgent),
            isMobile: /Mobile|Android|iPhone|iPad/.test(userAgent),
            isTablet: /iPad|Tablet/.test(userAgent)
        };
    }

    static getBrowserName(userAgent) {
        if (userAgent.includes('Chrome')) return 'Chrome';
        if (userAgent.includes('Firefox')) return 'Firefox';
        if (userAgent.includes('Safari')) return 'Safari';
        if (userAgent.includes('Edge')) return 'Edge';
        return 'Unknown';
    }

    static getOSName(userAgent) {
        if (userAgent.includes('Windows')) return 'Windows';
        if (userAgent.includes('Mac')) return 'macOS';
        if (userAgent.includes('Linux')) return 'Linux';
        if (userAgent.includes('Android')) return 'Android';
        if (userAgent.includes('iOS')) return 'iOS';
        return 'Unknown';
    }
}

// Loading Manager
class LoadingManager {
    constructor() {
        this.activeLoaders = new Set();
    }

    show(id = 'default', message = 'Loading...') {
        this.activeLoaders.add(id);
        this.renderLoader(id, message);
    }

    hide(id = 'default') {
        this.activeLoaders.delete(id);
        this.removeLoader(id);
    }

    hideAll() {
        this.activeLoaders.clear();
        document.querySelectorAll('.app-loader').forEach(loader => {
            loader.remove();
        });
    }

    renderLoader(id, message) {
        // Remove existing loader with same ID
        this.removeLoader(id);

        const loader = document.createElement('div');
        loader.className = 'app-loader';
        loader.setAttribute('data-loader-id', id);
        loader.innerHTML = `
            <div class="loader-overlay">
                <div class="loader-content">
                    <div class="spinner"></div>
                    <div class="loader-message">${message}</div>
                </div>
            </div>
        `;

        document.body.appendChild(loader);
    }

    removeLoader(id) {
        const loader = document.querySelector(`[data-loader-id="${id}"]`);
        if (loader) {
            loader.remove();
        }
    }
}

// Form Handler
class FormHandler {
    constructor(formElement, options = {}) {
        this.form = formElement;
        this.options = {
            validateOnInput: true,
            showErrors: true,
            resetOnSubmit: false,
            ...options
        };
        this.validators = {};
        this.init();
    }

    init() {
        if (this.options.validateOnInput) {
            this.setupInputValidation();
        }
        this.setupSubmitHandler();
    }

    setupInputValidation() {
        const inputs = this.form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('blur', () => this.validateField(input));
            input.addEventListener('input', Utils.debounce(() => this.validateField(input), 500));
        });
    }

    setupSubmitHandler() {
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });
    }

    validateField(field) {
        const fieldName = field.name || field.id;
        const validator = this.validators[fieldName];
        
        if (validator) {
            const isValid = validator(field.value);
            this.showFieldError(field, isValid);
            return isValid;
        }

        return true;
    }

    validateForm() {
        const fields = this.form.querySelectorAll('input, select, textarea');
        let isValid = true;

        fields.forEach(field => {
            if (!this.validateField(field)) {
                isValid = false;
            }
        });

        return isValid;
    }

    showFieldError(field, isValid) {
        if (!this.options.showErrors) return;

        const errorElement = field.parentNode.querySelector('.field-error');
        
        if (isValid) {
            field.classList.remove('is-invalid');
            if (errorElement) {
                errorElement.remove();
            }
        } else {
            field.classList.add('is-invalid');
            if (!errorElement) {
                const error = document.createElement('div');
                error.className = 'field-error';
                error.textContent = 'Invalid input';
                field.parentNode.appendChild(error);
            }
        }
    }

    addValidator(fieldName, validator) {
        this.validators[fieldName] = validator;
    }

    getFormData() {
        const formData = new FormData(this.form);
        const data = {};
        
        for (let [key, value] of formData.entries()) {
            data[key] = value;
        }
        
        return data;
    }

    async handleSubmit() {
        if (this.validateForm()) {
            const data = this.getFormData();
            
            if (this.options.onSubmit) {
                try {
                    await this.options.onSubmit(data);
                    if (this.options.resetOnSubmit) {
                        this.form.reset();
                    }
                } catch (error) {
                    console.error('Form submission error:', error);
                    app.showNotification('Submission failed', 'error');
                }
            }
        }
    }
}

// Initialize Global Application
const app = new AppState();
const apiClient = new ApiClient();
const loadingManager = new LoadingManager();

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app.init();
    
    // Setup global error handler
    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);
        app.showNotification('An unexpected error occurred', 'error');
    });

    // Setup form handlers for common forms
    document.querySelectorAll('form[data-auto-handle]').forEach(form => {
        new FormHandler(form, {
            onSubmit: async (data) => {
                const endpoint = form.getAttribute('data-endpoint');
                const method = form.getAttribute('data-method') || 'POST';
                
                try {
                    const result = await apiClient.request(endpoint, {
                        method,
                        body: JSON.stringify(data)
                    });
                    
                    app.showNotification('Success!', 'success');
                    return result;
                } catch (error) {
                    throw error;
                }
            }
        });
    });

    if (AppConfig.DEBUG) {
        console.log('Universal Attendance System initialized', {
            version: AppConfig.VERSION,
            user: app.user,
            industry: app.industry,
            role: app.role
        });
    }
});

// Export for global access
window.app = app;
window.apiClient = apiClient;
window.Utils = Utils;
window.LoadingManager = loadingManager;
window.FormHandler = FormHandler;
