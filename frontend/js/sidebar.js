// Shared Sidebar Component
// Injects the same fixed sidebar used on the dashboards into every authenticated
// page (history, profile, settings, reports, integrations, class-management,
// faculty-classes), replacing the old horizontal navbars for a consistent
// navigation experience across the whole app.
//
// Usage (on authenticated pages, after navigation-fix.js):
//   <script src="/js/sidebar.js"></script>
//
// Behaviour:
//   1. Injects sidebar markup + CSS + mobile drawer (toggle button + overlay)
//   2. Resolves the "Dashboard" link to the correct role/industry dashboard
//   3. Highlights the active page automatically
//   4. Hides education-only links (Faculty Classes / Class Management) and
//      admin-only links (Reports) for other roles/sectors

(function () {
    'use strict';

    function getStored(key) {
        return localStorage.getItem(key) || sessionStorage.getItem(key) || '';
    }

    function getUser() {
        return {
            token: getStored('token'),
            role: String(getStored('role')).toLowerCase(),
            industry: String(getStored('industrytype') || getStored('industry_type') || getStored('industry')).toLowerCase()
        };
    }

    // Same role/industry -> dashboard mapping as navigation-fix.js
    function getDashboardUrl(user) {
        var adminDashboards = {
            education: '/pages/admin-dashboard.html',
            healthcare: '/pages/healthcare-admin-dashboard.html',
            corporate: '/pages/corporate-admin-dashboard.html',
            manufacturing: '/pages/manufacturing-admin-dashboard.html',
            government: '/pages/government-admin-dashboard.html',
            retail: '/pages/retail-admin-dashboard.html'
        };
        var userDashboards = {
            education: '/pages/user-dashboard.html',
            healthcare: '/pages/healthcare-user-dashboard.html',
            corporate: '/pages/corporate-user-dashboard.html',
            manufacturing: '/pages/manufacturing-user-dashboard.html',
            government: '/pages/government-user-dashboard.html',
            retail: '/pages/retail-user-dashboard.html'
        };
        if (user.role.includes('admin')) {
            return adminDashboards[user.industry] || '/pages/admin-dashboard.html';
        }
        if (user.industry === 'education' &&
            (user.role.includes('teacher') || user.role.includes('professor') || user.role.includes('faculty'))) {
            return '/pages/teacher-dashboard.html';
        }
        return userDashboards[user.industry] || '/pages/user-dashboard.html';
    }

    function isAdmin(user) {
        return user.role.includes('admin') || user.role === 'administrator' || user.role === 'superadmin';
    }

    function isEducationStaff(user) {
        return user.industry === 'education' || user.role.includes('teacher') ||
               user.role.includes('professor') || user.role.includes('faculty');
    }

    var CSS = `
        .app-sidebar {
            position: fixed;
            top: 0; left: 0;
            height: 100vh;
            width: 250px;
            background: rgba(255, 255, 255, 0.97);
            box-shadow: 4px 0 20px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            padding-top: 1rem;
            overflow-y: auto;
            transition: transform 0.3s ease;
        }
        .app-sidebar .sidebar-brand {
            display: flex;
            align-items: center;
            padding: 1rem 1.5rem;
            font-weight: 700;
            color: #2c3e50;
            text-decoration: none;
            border-bottom: 1px solid #ecf0f1;
            margin-bottom: 1rem;
        }
        .app-sidebar .sidebar-brand:hover { color: #2c3e50; text-decoration: none; }
        .app-sidebar .nav-link {
            color: #2c3e50;
            font-weight: 500;
            padding: 0.75rem 1.5rem;
            border-radius: 0;
            transition: all 0.3s ease;
        }
        .app-sidebar .nav-link:hover {
            color: #3498db;
            background: rgba(52, 152, 219, 0.1);
            transform: translateX(5px);
        }
        .app-sidebar .nav-link.active {
            color: #3498db;
            background: rgba(52, 152, 219, 0.15);
            border-right: 4px solid #3498db;
        }
        body.app-has-sidebar { padding-left: 250px; }

        .app-sidebar-overlay {
            display: none;
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 1040;
        }
        .app-sidebar-overlay.show { display: block; }
        .app-sidebar-toggle { display: none; }

        @media (max-width: 767.98px) {
            body.app-has-sidebar { padding-left: 0; }
            .app-sidebar { transform: translateX(-100%); }
            .app-sidebar.show { transform: translateX(0); }
            .app-sidebar-toggle {
                display: flex;
                position: fixed;
                top: 15px; left: 15px;
                z-index: 1041;
                width: 45px; height: 45px;
                align-items: center;
                justify-content: center;
                background: rgba(255, 255, 255, 0.9);
                border: 2px solid #3498db;
                color: #3498db;
                border-radius: 8px;
                font-size: 1.2rem;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            }
        }
    `;

    function logout(e) {
        if (e) e.preventDefault();
        if (confirm('Are you sure you want to logout?')) {
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = '/pages/register.html';
        }
    }

function buildLinks(user, currentPage) {
        function link(href, icon, label, options) {
            options = options || {};
            var isActive = currentPage === options.page ? ' active' : '';
            var hidden = options.hidden ? ' style="display:none;"' : '';
            return '<li class="nav-item"' + hidden + '>' +
                '<a class="nav-link' + isActive + '" href="' + href + '">' +
                '<i class="fas ' + icon + ' me-2"></i>' + label + '</a></li>';
        }

        var html = '<ul class="nav flex-column">';
        html += link(getDashboardUrl(user), 'fa-tachometer-alt', 'Dashboard');
        html += link('/pages/history.html', 'fa-history', 'History', { page: 'history.html' });
        html += link('/pages/profile.html', 'fa-user', 'Profile', { page: 'profile.html' });
        html += link('/pages/settings.html', 'fa-cog', 'Settings', { page: 'settings.html' });
        html += link('/pages/reports.html', 'fa-chart-bar', 'Reports',
            { page: 'reports.html', hidden: !isAdmin(user), className: 'admin-only' });
        html += link('/pages/faculty-classes.html', 'fa-chalkboard-teacher', 'Faculty Classes',
            { page: 'faculty-classes.html', hidden: !isEducationStaff(user), className: 'education-only' });
        html += link('/pages/class-management.html', 'fa-users-cog', 'Class Management',
            { page: 'class-management.html', hidden: !isEducationStaff(user) || !isAdmin(user), className: 'education-only admin-only' });
        html += link('/pages/integrations.html', 'fa-plug', 'Integrations', { page: 'integrations.html' });
        html += '<li class="nav-item"><a class="nav-link" href="#" id="appSidebarLogout">' +
                '<i class="fas fa-sign-out-alt me-2"></i>Logout</a></li>';
        html += '</ul>';
        return html;
    }

    var DASHBOARD_PAGES = ['admin-dashboard.html', 'user-dashboard.html', 'teacher-dashboard.html',
        'healthcare-admin-dashboard.html', 'healthcare-user-dashboard.html',
        'corporate-admin-dashboard.html', 'corporate-user-dashboard.html',
        'manufacturing-admin-dashboard.html', 'manufacturing-user-dashboard.html',
        'government-admin-dashboard.html', 'government-user-dashboard.html',
        'retail-admin-dashboard.html', 'retail-user-dashboard.html'];

    function init() {
        var user = getUser();
        if (!user.token) return; // unauthenticated visitors: do nothing

        var page = window.location.pathname.split('/').pop().toLowerCase();
        var sidebar = document.createElement('nav');
        sidebar.className = 'app-sidebar';
        sidebar.innerHTML =
            '<a href="' + getDashboardUrl(user) + '" class="sidebar-brand">' +
            '<i class="fas fa-calendar-check me-2"></i>Universal Attendance</a>' +
            buildLinks(user, page);

        var toggle = document.createElement('button');
        toggle.className = 'app-sidebar-toggle';
        toggle.setAttribute('aria-label', 'Toggle navigation');
        toggle.innerHTML = '<i class="fas fa-bars"></i>';

        var overlay = document.createElement('div');
        overlay.className = 'app-sidebar-overlay';

        document.body.insertBefore(sidebar, document.body.firstChild);
        document.body.insertBefore(overlay, document.body.firstChild);
        document.body.insertBefore(toggle, document.body.firstChild);
        document.body.classList.add('app-has-sidebar');

        if (DASHBOARD_PAGES.indexOf(page) !== -1) {
            var first = sidebar.querySelector('.nav-link');
            if (first) first.classList.add('active');
        }

        // Hide admin-only / education-only links per role
        if (!isAdmin(user)) {
            sidebar.querySelectorAll('.admin-only').forEach(function (el) { el.style.display = 'none'; });
        }
        if (!isEducationStaff(user)) {
            sidebar.querySelectorAll('.education-only').forEach(function (el) { el.style.display = 'none'; });
        }

        toggle.addEventListener('click', function () {
            sidebar.classList.toggle('show');
            overlay.classList.toggle('show');
            document.body.style.overflow = sidebar.classList.contains('show') ? 'hidden' : '';
        });
        overlay.addEventListener('click', function () {
            sidebar.classList.remove('show');
            overlay.classList.remove('show');
            document.body.style.overflow = '';
        });
        sidebar.querySelectorAll('.nav-link').forEach(function (l) {
            l.addEventListener('click', function () {
                if (window.innerWidth < 768) {
                    sidebar.classList.remove('show');
                    overlay.classList.remove('show');
                    document.body.style.overflow = '';
                }
            });
        });
        var logoutLink = sidebar.querySelector('#appSidebarLogout');
        if (logoutLink) logoutLink.addEventListener('click', logout);

        var style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
