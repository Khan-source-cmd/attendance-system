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

    // ---- Role x Industry link matrix -----------------------------------------
    // Mirrors exactly what each dashboard's own sidebar shows for that role, so
    // the SAME links appear on EVERY page. Sector tab entries (e.g. "Patient
    // Management") are modals inside the sector dashboard, not standalone pages,
    // so they link to the dashboard with #tabfn=<functionName>, which the
    // dashboard uses to auto-open that tab on arrival.

    function getLinks(user) {
        var admin = isAdmin(user);
        var dash = getDashboardUrl(user);
        var ind = user.industry;
        var MONITOR = '/pages/admin-attendance.html';
        var HISTORY = '/pages/history.html';

        function L(href, icon, label, page) { return { href: href, icon: icon, label: label, page: page }; }
        function T(fn, icon, label) { return { href: dash + '#tabfn=' + fn, icon: icon, label: label, page: null }; }

        var links = [L(dash, 'fa-tachometer-alt', 'Dashboard', 'dashboard')];

        if (admin) {
            links.push(L(MONITOR, 'fa-eye', 'Attendance Monitor', 'admin-attendance.html'));
        }

        switch (ind + (admin ? '-admin' : '-user')) {
            case 'education-admin':
                links.push(L(HISTORY, 'fa-history', 'History', 'history.html'));
                break;
            case 'healthcare-admin':
                links.push(L(HISTORY, 'fa-history', 'Shift History', 'history.html'));
                links.push(T('manageShifts', 'fa-calendar-alt', 'Shift Scheduling'));
                links.push(T('manageCompliance', 'fa-shield-alt', 'Compliance'));
                links.push(T('managePatients', 'fa-user-injured', 'Patient Management'));
                break;
            case 'healthcare-user':
                links.push(L(HISTORY, 'fa-history', 'Shift History', 'history.html'));
                break;
            case 'corporate-admin':
                links.push(L(HISTORY, 'fa-history', 'Work History', 'history.html'));
                links.push(T('manageProjects', 'fa-project-diagram', 'Project Management'));
                links.push(T('manageProductivity', 'fa-chart-line', 'Productivity Analytics'));
                links.push(T('manageMeetingRooms', 'fa-building', 'Meeting Rooms'));
                break;
            case 'corporate-user':
                links.push(L(HISTORY, 'fa-history', 'Work History', 'history.html'));
                links.push(T('showProjects', 'fa-project-diagram', 'My Projects'));
                links.push(T('showMeetings', 'fa-calendar-check', 'Meetings'));
                break;
            case 'government-admin':
                links.push(L(HISTORY, 'fa-history', 'Service History', 'history.html'));
                links.push(T('managePublicService', 'fa-users', 'Public Service'));
                links.push(T('manageCompliance', 'fa-clipboard-check', 'Compliance'));
                links.push(T('manageDepartments', 'fa-building', 'Departments'));
                break;
            case 'government-user':
                links.push(L(HISTORY, 'fa-history', 'Service History', 'history.html'));
                links.push(T('showServiceDepartments', 'fa-building', 'Departments'));
                links.push(T('showComplianceStatus', 'fa-clipboard-check', 'Compliance'));
                break;
            case 'manufacturing-admin':
                links.push(L(HISTORY, 'fa-history', 'Work History', 'history.html'));
                links.push(T('manageProduction', 'fa-industry', 'Production Monitoring'));
                links.push(T('manageEquipment', 'fa-tools', 'Equipment Management'));
                links.push(T('manageSafety', 'fa-shield-alt', 'Safety Compliance'));
                break;
            case 'manufacturing-user':
                links.push(L(HISTORY, 'fa-history', 'Work History', 'history.html'));
                links.push(T('showProductionLines', 'fa-industry', 'Production Lines'));
                links.push(T('showShiftSchedule', 'fa-calendar-alt', 'Shift Schedule'));
                break;
            case 'retail-admin':
                links.push(L(HISTORY, 'fa-history', 'Store History', 'history.html'));
                links.push(T('manageStorePerformance', 'fa-chart-line', 'Store Performance'));
                links.push(T('manageSalesAnalytics', 'fa-chart-bar', 'Sales Analytics'));
                links.push(T('manageInventory', 'fa-boxes', 'Inventory'));
                links.push(T('manageStaffScheduling', 'fa-calendar-alt', 'Staff Scheduling'));
                break;
            case 'retail-user':
                links.push(L(HISTORY, 'fa-history', 'Work History', 'history.html'));
                links.push(T('showStoreSections', 'fa-store', 'Store Sections'));
                links.push(T('showSalesTargets', 'fa-bullseye', 'Sales Targets'));
                break;
            default: // education teacher/user handled below + generic History
                links.push(L(HISTORY, 'fa-history', 'History', 'history.html'));
                break;
        }

        links.push(L('/pages/profile.html', 'fa-user', 'Profile', 'profile.html'));
        links.push(L('/pages/settings.html', 'fa-cog', 'Settings', 'settings.html'));

        // Education-specific pages (role restricted)
        var isTeacher = user.role.includes('teacher') || user.role.includes('professor') || user.role.includes('faculty');
        if (ind === 'education' || isTeacher) {
            if (admin) {
                links.push(L('/pages/class-management.html', 'fa-chalkboard', 'Class Management', 'class-management.html'));
                links.push(L('/pages/faculty-classes.html', 'fa-chalkboard-teacher', 'Faculty Classes', 'faculty-classes.html'));
            } else if (isTeacher) {
                links.push(L('/pages/teacher-dashboard.html', 'fa-graduation-cap', 'Teacher Portal', 'teacher-dashboard.html'));
            }
        }

        if (admin) {
            links.push(L('/pages/reports.html', 'fa-chart-bar', 'Reports', 'reports.html'));
        }

        links.push(L('/pages/integrations.html', 'fa-plug', 'Integrations', 'integrations.html'));
        return links;
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
        var links = getLinks(user);
        var sidebar = document.createElement('nav');
        sidebar.className = 'app-sidebar';

        var html = '<a href="' + getDashboardUrl(user) + '" class="sidebar-brand">' +
            '<i class="fas fa-calendar-check me-2"></i>Universal Attendance</a>' +
            '<ul class="nav flex-column">';
        links.forEach(function (l) {
            var isActive = '';
            if (l.page === 'dashboard' && DASHBOARD_PAGES.indexOf(page) !== -1) isActive = ' active';
            else if (l.page && l.page === page) isActive = ' active';
            html += '<li class="nav-item"><a class="nav-link' + isActive + '" href="' + l.href + '">' +
                '<i class="fas ' + l.icon + ' me-2"></i>' + l.label + '</a></li>';
        });
        html += '<li class="nav-item"><a class="nav-link" href="#" id="appSidebarLogout">' +
            '<i class="fas fa-sign-out-alt me-2"></i>Logout</a></li></ul>';
        sidebar.innerHTML = html;

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
