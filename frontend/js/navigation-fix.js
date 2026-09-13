// Dashboard Navigation Handler - Fixes navigation issues across all dashboard pages
// This script should be included in all dashboard HTML files

// Global navigation management
class DashboardNavigation {
    constructor() {
        this.currentUser = this.getUserData();
        this.init();
    }

    getUserData() {
        return {
            token: localStorage.getItem('token') || sessionStorage.getItem('token'),
            digitalid: localStorage.getItem('digitalid') || sessionStorage.getItem('digitalid'),
            role: localStorage.getItem('role') || sessionStorage.getItem('role'),
            name: localStorage.getItem('name') || sessionStorage.getItem('name'),
            industrytype: localStorage.getItem('industrytype') || sessionStorage.getItem('industrytype')
        };
    }

    init() {
        // Check authentication
        if (!this.currentUser.token || !this.currentUser.digitalid) {
            console.log('No authentication found, redirecting to register');
            window.location.href = this.getCorrectPath('/pages/register.html');
            return;
        }

        // Ensure clean session data when initializing navigation
        this.clearConflictingDashboardData();

        this.setupNavigation();
        this.fixDashboardLinks();
        this.updateUserInfo();
        this.handleRoleBasedNavigation();
    }

    // Clear any conflicting dashboard URLs to prevent navigation issues
    clearConflictingDashboardData() {
        // Check if the stored dashboard URL matches the current page's industry
        const currentPath = window.location.pathname;
        const storedUrl = this.getStoredDashboardUrl();

        if (storedUrl && !currentPath.includes(storedUrl)) {
            // If we're on a different industry dashboard than what's stored, clear the stored URL
            // This prevents wrong navigation when users switch between different industry accounts
            console.log('Navigation: Clearing stored dashboard URL due to industry mismatch');
            this.clearStoredDashboardUrl();
        }
    }

    getCorrectPath(filename) {
        // Determine correct path based on current location
        const currentPath = window.location.pathname;
        const isInPagesFolder = currentPath.includes('/pages/');
        const isInRoot = !isInPagesFolder;

        if (filename.startsWith('../')) {
            return filename; // Already has relative path
        }

        // If we're in pages folder and the filename is already a pages path, don't modify it
        if (isInPagesFolder && filename.startsWith('/pages/')) {
            return filename; // Already correct
        }

        // If we're in root and the filename is already a root path, don't modify it
        if (isInRoot && !filename.startsWith('/pages/')) {
            return filename; // Already correct
        }

        // If we're in pages folder and need to go to root
        if (isInPagesFolder && (filename === '/pages/register.html' || filename === '/pages/user-dashboard.html' || filename === '/pages/admin-dashboard.html')) {
            return '../' + filename;
        }

        // If we're in root and need to go to pages
        if (isInRoot && (filename === '/pages/history.html' || filename === '/pages/profile.html' || filename === '/pages/settings.html')) {
            return 'pages/' + filename;
        }

        return filename;
    }

    // Resolve the correct dashboard page for the current user's role + industry.
    // Used to fix the "Dashboard" link on all shared pages (history, profile,
    // settings, reports, integrations, admin-attendance) so every sector and
    // role lands where it belongs.
    getDashboardUrl() {
        const role = String(this.currentUser.role || '').toLowerCase();
        const industry = String(this.currentUser.industrytype || '').toLowerCase();

        const isAdmin = role.includes('admin');

        const adminDashboards = {
            education: '/pages/admin-dashboard.html',
            healthcare: '/pages/healthcare-admin-dashboard.html',
            corporate: '/pages/corporate-admin-dashboard.html',
            manufacturing: '/pages/manufacturing-admin-dashboard.html',
            government: '/pages/government-admin-dashboard.html',
            retail: '/pages/retail-admin-dashboard.html'
        };

        const userDashboards = {
            education: '/pages/user-dashboard.html',
            healthcare: '/pages/healthcare-user-dashboard.html',
            corporate: '/pages/corporate-user-dashboard.html',
            manufacturing: '/pages/manufacturing-user-dashboard.html',
            government: '/pages/government-user-dashboard.html',
            retail: '/pages/retail-user-dashboard.html'
        };

        if (isAdmin) {
            return adminDashboards[industry] || '/pages/admin-dashboard.html';
        }
        // Education staff roles keep their dedicated dashboards
        if (industry === 'education' && (role.includes('teacher') || role.includes('professor') || role.includes('faculty'))) {
            return '/pages/teacher-dashboard.html';
        }
        return userDashboards[industry] || '/pages/user-dashboard.html';
    }

    // Rewrite every sidebar/dashboard link that points to the generic
    // (education) dashboards so it targets the user's own industry dashboard.
    fixDashboardLinks() {
        const correct = this.getDashboardUrl();
        const generics = ['/pages/admin-dashboard.html', '/pages/user-dashboard.html', 'admin-dashboard.html', 'user-dashboard.html'];
        document.querySelectorAll('a[href]').forEach(link => {
            const href = link.getAttribute('href');
            if (!href) return;
            if (generics.some(g => href.includes(g)) && href !== correct) {
                console.log('Navigation: Rewriting dashboard link', href, '->', correct);
                link.setAttribute('href', correct);
            }
        });
    }

    setupNavigation() {
        // Fix all navigation links
        const navLinks = document.querySelectorAll('a[href]');
        navLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('javascript:')) {
                const correctedHref = this.getCorrectPath(href);
                if (correctedHref !== href) {
                    link.setAttribute('href', correctedHref);
                }
            }
        });

        // Handle dynamic navigation clicks
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.hasAttribute('data-nav')) {
                e.preventDefault();
                const target = link.getAttribute('data-nav');
                this.navigateTo(target);
            }
        });
    }

    navigateTo(target) {
        if (target === 'dashboard') {
            // The role + industry resolved dashboard is authoritative; a stale
            // stored URL from another account/sector must never win.
            const finalUrl = this.getDashboardUrl();
            console.log('Navigation: dashboard ->', finalUrl);
            window.location.href = this.getCorrectPath(finalUrl);
            return;
        }

        const routes = {
            'dashboard': this.isAdmin() ?
                '/pages/admin-dashboard.html' : '/pages/user-dashboard.html',
            'history': '/pages/history.html',
            'profile': '/pages/profile.html',
            'settings': '/pages/settings.html',
            'reports': '/pages/reports.html',
            'faculty': '/pages/faculty-classes.html',
            'register': '/pages/register.html'
        };

        const path = routes[target] || target;
        window.location.href = this.getCorrectPath(path);
    }

    // Store the current industry-specific dashboard URL
    storeCurrentDashboardUrl() {
        const currentPath = window.location.pathname;
        const industryDashboards = [
            '/pages/healthcare-user-dashboard.html',
            '/pages/corporate-user-dashboard.html',
            '/pages/manufacturing-user-dashboard.html',
            '/pages/government-user-dashboard.html',
            '/pages/retail-user-dashboard.html',
            '/pages/healthcare-admin-dashboard.html',
            '/pages/corporate-admin-dashboard.html',
            '/pages/manufacturing-admin-dashboard.html',
            '/pages/government-admin-dashboard.html',
            '/pages/retail-admin-dashboard.html'
        ];

        if (industryDashboards.some(dashboard => currentPath.includes(dashboard))) {
            console.log('Navigation: Storing industry-specific dashboard URL:', currentPath);
            localStorage.setItem('currentDashboardUrl', currentPath);
        }
    }

    // Get the stored industry-specific dashboard URL
    getStoredDashboardUrl() {
        return localStorage.getItem('currentDashboardUrl');
    }

    // Clear stored dashboard URL (useful for logout)
    clearStoredDashboardUrl() {
        localStorage.removeItem('currentDashboardUrl');
    }

    isAdmin() {
        const role = this.currentUser.role?.toLowerCase() || '';
        // Check for various admin role formats
        return role.includes('admin') ||
               role === 'administrator' ||
               role === 'system administrator' ||
               role === 'super admin' ||
               role === 'superadmin';
    }

    updateUserInfo() {
        // Update user name in navigation
        const navUserElements = document.querySelectorAll('#navUserName, [data-user-name]');
        navUserElements.forEach(element => {
            if (this.currentUser.name) {
                element.textContent = this.currentUser.name.split(' ')[0];
            }
        });

        // Update other user info elements
        const userIdElements = document.querySelectorAll('[data-user-id]');
        userIdElements.forEach(element => {
            element.textContent = this.currentUser.digitalid || 'Loading...';
        });

        const userRoleElements = document.querySelectorAll('[data-user-role]');
        userRoleElements.forEach(element => {
            element.textContent = this.currentUser.role || 'Loading...';
        });
    }

    handleRoleBasedNavigation() {
        const userRole = this.currentUser.role?.toLowerCase() || '';
        const industryType = this.currentUser.industrytype?.toLowerCase() || '';

        // Show/hide admin-specific navigation
        const adminNavItems = document.querySelectorAll('.admin-only');
        // Education-only pages must never appear for other sectors
        const EDUCATION_ONLY_LINKS = ['faculty-classes', 'class-management', 'class-schedule', 'teacher-dashboard'];
        adminNavItems.forEach(item => {
            const isAdmin = userRole.includes('admin') ||
                           userRole === 'administrator' ||
                           userRole === 'system administrator' ||
                           userRole === 'super admin' ||
                           userRole === 'superadmin';
            const link = item.querySelector('a[href]');
            const href = (link ? link.getAttribute('href') : '').toLowerCase();
            const isEducationOnly = EDUCATION_ONLY_LINKS.some(page => href.includes(page));
            if (isEducationOnly && industryType !== 'education') {
                item.style.display = 'none';
                return;
            }
            item.style.display = isAdmin ? 'block' : 'none';
        });

        // Show/hide teacher-specific navigation
        const teacherNavItems = document.querySelectorAll('.teacher-only, #teacherNavItem, #myClassesNav');
        teacherNavItems.forEach(item => {
            const isTeacher = ['teacher', 'professor', 'faculty', 'instructor', 'lecturer', 'educator']
                .some(role => userRole.includes(role));
            const isEducation = industryType === 'education';
            item.style.display = (isTeacher && isEducation) ? 'block' : 'none';
        });

        // Show/hide education-specific navigation
        const educationNavItems = document.querySelectorAll('.education-only');
        educationNavItems.forEach(item => {
            item.style.display = (industryType === 'education') ? 'block' : 'none';
        });
    }

    // Global logout function
    logout() {
        if (confirm('Are you sure you want to logout?')) {
            // Clear stored dashboard URL
            this.clearStoredDashboardUrl();
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = this.getCorrectPath('/pages/register.html');
        }
    }
}

// Navigation correction utilities
const NavigationUtils = {
    // Fix modal navigation issues
    fixModalNavigation() {
        document.addEventListener('shown.bs.modal', function(e) {
            // Ensure modals work properly across different pages
            const modal = e.target;
            const form = modal.querySelector('form');
            if (form) {
                form.addEventListener('submit', function(submitEvent) {
                    submitEvent.preventDefault();
                    // Handle form submission
                });
            }
        });
    },

    // Fix processing modal issues
    fixProcessingModal() {
        const processingModal = document.getElementById('processingModal');
        if (processingModal) {
            // Ensure processing modal never gets stuck
            window.addEventListener('beforeunload', function() {
                const modalInstance = bootstrap.Modal.getInstance(processingModal);
                if (modalInstance) {
                    modalInstance.hide();
                }
            });
        }
    },

    // Fix navigation breadcrumbs
    updateBreadcrumbs() {
        const breadcrumbElements = document.querySelectorAll('.breadcrumb, [data-breadcrumb]');
        const currentPage = document.title.split(' - ')[0];
        
        breadcrumbElements.forEach(element => {
            if (element.dataset.breadcrumb) {
                element.textContent = currentPage;
            }
        });
    },

    // Fix API base URL issues
    fixApiUrls() {
        window.API_BASE = window.location.hostname === 'localhost' ? 
            'http://localhost:4000' : 
            `http://${window.location.hostname}:4000`;
    },

    // Common notification function
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 400px;';
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }
};

// Global functions that should be available on all pages
window.globalLogout = function() {
    if (window.dashboardNav) {
        window.dashboardNav.logout();
    } else {
        if (confirm('Are you sure you want to logout?')) {
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = '/pages/register.html';
        }
    }
};

// Show integrations page function
window.showIntegrationsPage = function() {
    // Navigate to integrations page or show modal
    const integrationsPath = window.dashboardNav ?
        window.dashboardNav.getCorrectPath('/pages/integrations.html') :
        '/pages/integrations.html';

    // Check if integrations page exists, otherwise show a message
    fetch(integrationsPath, { method: 'HEAD' })
        .then(response => {
            if (response.ok) {
                window.location.href = integrationsPath;
            } else {
                showNotification('Integrations page coming soon!', 'info');
            }
        })
        .catch(() => {
            showNotification('Integrations page coming soon!', 'info');
        });
};

// Initialize navigation when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize navigation
    window.dashboardNav = new DashboardNavigation();
    
    // Fix various navigation issues
    NavigationUtils.fixModalNavigation();
    NavigationUtils.fixProcessingModal();
    NavigationUtils.updateBreadcrumbs();
    NavigationUtils.fixApiUrls();
    
    // Make notification function globally available
    window.showNotification = NavigationUtils.showNotification;
    
    // Handle logout clicks
    const logoutLinks = document.querySelectorAll('[onclick*="logout"], a[href*="logout"]');
    logoutLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            window.globalLogout();
        });
    });
    
    // Fix href attributes that might be broken
    const brokenHrefs = document.querySelectorAll('a[href="history.html"], a[href="profile.html"], a[href="settings.html"]');
    brokenHrefs.forEach(link => {
        const href = link.getAttribute('href');
        if (!href.startsWith('pages/') && !href.startsWith('../')) {
            const currentPath = window.location.pathname;
            const isInPagesFolder = currentPath.includes('/pages/');
            
            if (!isInPagesFolder && ['history.html', 'profile.html', 'settings.html'].includes(href)) {
                link.setAttribute('href', 'pages/' + href);
            }
        }
    });
    
    console.log('Dashboard navigation initialized successfully');
});

// Prevent common navigation errors
window.addEventListener('error', function(e) {
    if (e.message && e.message.includes('navigation')) {
        console.warn('Navigation error caught and handled:', e.message);
        e.preventDefault();
    }
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DashboardNavigation, NavigationUtils };
}
