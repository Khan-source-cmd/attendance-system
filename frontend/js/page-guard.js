// Page-level access guard
//
// Some pages only make sense for one industry and/or one role. Hiding the link
// in the sidebar is not enough — the page itself must refuse to run for anyone
// else, otherwise the URL can simply be typed in.
//
// Usage, immediately AFTER sidebar.js on a restricted page:
//   <script>window.PAGE_GUARD_REQUIRE = 'education-admin';</script>
//   <script src="/js/page-guard.js"></script>
//
// Requirements:
//   'admin'            -> administrators of ANY industry (e.g. Attendance Monitor)
//   'education-admin'  -> education administrators only
//   'education-staff'  -> education administrators or teachers
//
// Anyone who fails the check is sent to the dashboard that matches their own
// industry and role. Users with no session go to the login page.
(function () {
    'use strict';

    function store(key) {
        return localStorage.getItem(key) || sessionStorage.getItem(key) || '';
    }

    if (!store('token')) {
        window.location.replace('/pages/register.html');
        return;
    }

    var industry = String(
        store('industrytype') || store('industry_type') || store('industry')
    ).toLowerCase().trim();
    var role = String(store('role')).toLowerCase().trim();

    // Same role detection used by sidebar.js, so the guard and the sidebar agree.
    var isAdmin = role.indexOf('admin') !== -1;
    var isTeacher = role.indexOf('teacher') !== -1 || role.indexOf('professor') !== -1 ||
                    role.indexOf('faculty') !== -1 || role.indexOf('instructor') !== -1;
    // Accounts created before industry tracking hold no value; treat as education.
    var isEducation = !industry || industry === 'education';

    var requirement = window.PAGE_GUARD_REQUIRE || 'admin';
    var allowed;

    if (requirement === 'education-admin') {
        allowed = isEducation && isAdmin;
    } else if (requirement === 'education-staff') {
        allowed = isEducation && (isAdmin || isTeacher);
    } else {
        allowed = isAdmin;
    }

    if (allowed) {
        return;
    }

    // Send the visitor to the dashboard for their own industry and role.
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

    var target;
    if (isAdmin) {
        target = adminDashboards[industry];
    } else if (isEducation && isTeacher) {
        // Matches sidebar.js / navigation-fix.js, which send teachers here.
        target = '/pages/teacher-dashboard.html';
    } else {
        target = userDashboards[industry];
    }

    if (!target) {
        target = isAdmin ? '/pages/admin-dashboard.html' : '/pages/user-dashboard.html';
    }

    window.location.replace(target);
})();
