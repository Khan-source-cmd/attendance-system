/**
 * Universal Attendance System - Utility Functions
 * Common utilities, helpers, and shared functionality
 */

// Enhanced Utils class (extending the one from app.js)
class UtilsExtended extends Utils {
    
    // Date and Time Utilities
    static formatDateRange(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (start.getFullYear() === end.getFullYear()) {
            if (start.getMonth() === end.getMonth()) {
                return `${start.getDate()}-${end.getDate()} ${start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
            } else {
                return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
            }
        } else {
            return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        }
    }

    static getTimeOfDay() {
        const hour = new Date().getHours();
        if (hour < 12) return 'morning';
        if (hour < 17) return 'afternoon';
        if (hour < 21) return 'evening';
        return 'night';
    }

    static getWorkdaysBetween(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        let workdays = 0;
        
        for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
            const dayOfWeek = date.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday or Saturday
                workdays++;
            }
        }
        
        return workdays;
    }

    static isWorkingHour(time = new Date(), workStart = 9, workEnd = 17) {
        const hour = typeof time === 'string' ? new Date(time).getHours() : time.getHours();
        return hour >= workStart && hour < workEnd;
    }

    // Data Processing Utilities
    static groupBy(array, key) {
        return array.reduce((groups, item) => {
            const group = typeof key === 'function' ? key(item) : item[key];
            groups[group] = groups[group] || [];
            groups[group].push(item);
            return groups;
        }, {});
    }

    static sortBy(array, key, direction = 'asc') {
        return [...array].sort((a, b) => {
            const aVal = typeof key === 'function' ? key(a) : a[key];
            const bVal = typeof key === 'function' ? key(b) : b[key];
            
            if (aVal < bVal) return direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    static filterBy(array, filters) {
        return array.filter(item => {
            return Object.keys(filters).every(key => {
                const filterValue = filters[key];
                const itemValue = item[key];
                
                if (filterValue === null || filterValue === undefined || filterValue === '') {
                    return true;
                }
                
                if (typeof filterValue === 'string') {
                    return itemValue?.toString().toLowerCase().includes(filterValue.toLowerCase());
                }
                
                return itemValue === filterValue;
            });
        });
    }

    static paginate(array, page = 1, limit = 10) {
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        
        return {
            data: array.slice(startIndex, endIndex),
            pagination: {
                current_page: page,
                per_page: limit,
                total: array.length,
                total_pages: Math.ceil(array.length / limit),
                has_next: endIndex < array.length,
                has_prev: page > 1
            }
        };
    }

    // String Utilities
    static truncate(str, length = 50, suffix = '...') {
        if (str.length <= length) return str;
        return str.substring(0, length) + suffix;
    }

    static capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    static camelToSnake(str) {
        return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    }

    static snakeToCamel(str) {
        return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
    }

    static slugify(str) {
        return str
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_-]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    // Number Utilities
    static formatNumber(num, decimals = 0) {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(num);
    }

    static formatCurrency(amount, currency = 'USD') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(amount);
    }

    static formatPercentage(value, decimals = 1) {
        return new Intl.NumberFormat('en-US', {
            style: 'percent',
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(value / 100);
    }

    static roundTo(num, decimals = 2) {
        return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
    }

    // File Utilities
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    static getFileExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    }

    static isImageFile(filename) {
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
        return imageExtensions.includes(this.getFileExtension(filename));
    }

    static async readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // DOM Utilities
    static createElement(tag, attributes = {}, content = '') {
        const element = document.createElement(tag);
        
        Object.keys(attributes).forEach(key => {
            if (key === 'className') {
                element.className = attributes[key];
            } else if (key === 'innerHTML') {
                element.innerHTML = attributes[key];
            } else if (key.startsWith('data-')) {
                element.setAttribute(key, attributes[key]);
            } else {
                element[key] = attributes[key];
            }
        });
        
        if (content) {
            element.textContent = content;
        }
        
        return element;
    }

    static removeElement(element) {
        if (element && element.parentNode) {
            element.parentNode.removeChild(element);
        }
    }

    static addClass(element, className) {
        if (element && className) {
            element.classList.add(className);
        }
    }

    static removeClass(element, className) {
        if (element && className) {
            element.classList.remove(className);
        }
    }

    static toggleClass(element, className) {
        if (element && className) {
            element.classList.toggle(className);
        }
    }

    static hasClass(element, className) {
        return element && element.classList.contains(className);
    }

    // Animation Utilities
    static fadeIn(element, duration = 300) {
        element.style.opacity = '0';
        element.style.display = 'block';
        
        const start = performance.now();
        
        function animate(currentTime) {
            const elapsed = currentTime - start;
            const progress = Math.min(elapsed / duration, 1);
            
            element.style.opacity = progress;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        }
        
        requestAnimationFrame(animate);
    }

    static fadeOut(element, duration = 300) {
        const start = performance.now();
        const startOpacity = parseFloat(getComputedStyle(element).opacity);
        
        function animate(currentTime) {
            const elapsed = currentTime - start;
            const progress = Math.min(elapsed / duration, 1);
            
            element.style.opacity = startOpacity * (1 - progress);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                element.style.display = 'none';
            }
        }
        
        requestAnimationFrame(animate);
    }

    static slideDown(element, duration = 300) {
        element.style.height = '0px';
        element.style.overflow = 'hidden';
        element.style.display = 'block';
        
        const targetHeight = element.scrollHeight;
        const start = performance.now();
        
        function animate(currentTime) {
            const elapsed = currentTime - start;
            const progress = Math.min(elapsed / duration, 1);
            
            element.style.height = (targetHeight * progress) + 'px';
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                element.style.height = '';
                element.style.overflow = '';
            }
        }
        
        requestAnimationFrame(animate);
    }

    // Storage Utilities
    static setStorageItem(key, value, expiration = null) {
        const item = {
            value: value,
            timestamp: Date.now(),
            expiration: expiration
        };
        
        try {
            localStorage.setItem(key, JSON.stringify(item));
            return true;
        } catch (error) {
            console.error('Storage error:', error);
            return false;
        }
    }

    static getStorageItem(key) {
        try {
            const item = localStorage.getItem(key);
            if (!item) return null;
            
            const parsed = JSON.parse(item);
            const now = Date.now();
            
            // Check expiration
            if (parsed.expiration && now > parsed.expiration) {
                localStorage.removeItem(key);
                return null;
            }
            
            return parsed.value;
        } catch (error) {
            console.error('Storage retrieval error:', error);
            return null;
        }
    }

    static removeStorageItem(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Storage removal error:', error);
            return false;
        }
    }

    static clearExpiredStorage() {
        const keys = Object.keys(localStorage);
        const now = Date.now();
        
        keys.forEach(key => {
            try {
                const item = localStorage.getItem(key);
                const parsed = JSON.parse(item);
                
                if (parsed.expiration && now > parsed.expiration) {
                    localStorage.removeItem(key);
                }
            } catch (error) {
                // Item is not in our format, skip
            }
        });
    }

    // URL Utilities
    static getUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const result = {};
        
        for (const [key, value] of params) {
            result[key] = value;
        }
        
        return result;
    }

    static updateUrlParam(key, value) {
        const url = new URL(window.location);
        url.searchParams.set(key, value);
        window.history.replaceState({}, '', url);
    }

    static removeUrlParam(key) {
        const url = new URL(window.location);
        url.searchParams.delete(key);
        window.history.replaceState({}, '', url);
    }

    // Color Utilities
    static hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    static rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    static lightenColor(color, percent) {
        const rgb = this.hexToRgb(color);
        if (!rgb) return color;
        
        const { r, g, b } = rgb;
        const amount = Math.round(2.55 * percent);
        
        return this.rgbToHex(
            Math.min(255, r + amount),
            Math.min(255, g + amount),
            Math.min(255, b + amount)
        );
    }

    static darkenColor(color, percent) {
        const rgb = this.hexToRgb(color);
        if (!rgb) return color;
        
        const { r, g, b } = rgb;
        const amount = Math.round(2.55 * percent);
        
        return this.rgbToHex(
            Math.max(0, r - amount),
            Math.max(0, g - amount),
            Math.max(0, b - amount)
        );
    }

    // Industry-specific utilities
    static getIndustryColor(industry) {
        const colors = {
            healthcare: '#e74c3c',
            education: '#3498db',
            corporate: '#2ecc71',
            manufacturing: '#f39c12',
            government: '#9b59b6',
            retail: '#1abc9c'
        };
        return colors[industry] || '#95a5a6';
    }

    static getIndustryIcon(industry) {
        const icons = {
            healthcare: 'fa-heartbeat',
            education: 'fa-graduation-cap',
            corporate: 'fa-building',
            manufacturing: 'fa-industry',
            government: 'fa-landmark',
            retail: 'fa-store'
        };
        return icons[industry] || 'fa-briefcase';
    }

    static getRoleIcon(role) {
        const icons = {
            Admin: 'fa-user-shield',
            Manager: 'fa-user-tie',
            Employee: 'fa-user',
            Teacher: 'fa-chalkboard-teacher',
            Student: 'fa-user-graduate',
            Doctor: 'fa-user-md',
            Nurse: 'fa-user-nurse',
            Engineer: 'fa-hard-hat',
            'Sales Associate': 'fa-handshake'
        };
        return icons[role] || 'fa-user';
    }

    // Error Handling Utilities
    static createErrorHandler(context) {
        return (error) => {
            console.error(`Error in ${context}:`, error);
            
            // Log error details
            const errorInfo = {
                context: context,
                message: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString(),
                url: window.location.href,
                userAgent: navigator.userAgent
            };
            
            // Store error log
            this.logError(errorInfo);
            
            // Show user-friendly message
            app.showNotification('An error occurred. Please try again.', 'error');
            
            return errorInfo;
        };
    }

    static logError(errorInfo) {
        try {
            let errorLogs = JSON.parse(localStorage.getItem('error_logs') || '[]');
            errorLogs.unshift(errorInfo);
            errorLogs = errorLogs.slice(0, 50); // Keep last 50 errors
            localStorage.setItem('error_logs', JSON.stringify(errorLogs));
        } catch (error) {
            console.error('Failed to log error:', error);
        }
    }

    // Performance Utilities
    static measurePerformance(name, fn) {
        return async function(...args) {
            const start = performance.now();
            try {
                const result = await fn.apply(this, args);
                const end = performance.now();
                console.log(`${name} took ${end - start} milliseconds`);
                return result;
            } catch (error) {
                const end = performance.now();
                console.log(`${name} failed after ${end - start} milliseconds`);
                throw error;
            }
        };
    }

    static createPerformanceMonitor() {
        const metrics = {
            pageLoad: 0,
            apiCalls: [],
            userInteractions: []
        };

        // Monitor page load
        window.addEventListener('load', () => {
            metrics.pageLoad = performance.now();
        });

        return metrics;
    }
}

// Export enhanced utils
window.Utils = UtilsExtended;

// Initialize utility functions on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    // Clean up expired storage items
    UtilsExtended.clearExpiredStorage();
    
    // Setup global error handler
    window.addEventListener('error', (event) => {
        UtilsExtended.createErrorHandler('Global')(event.error);
    });
});
