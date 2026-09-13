// Industry Theme - Applies per-sector branding to the shared pages
// (admin-attendance, history, profile, settings, reports, integrations).
// Reads the logged-in user's industry from storage, then:
//   1. Overrides the hardcoded education (blue) theme with the sector's colors
//   2. Hides education-only sidebar items (Faculty Classes etc.) for other sectors
//   3. Updates the brand text/icon to the sector name
// Include AFTER navigation-fix.js on every shared page.

(function () {
    const industry = String(
        localStorage.getItem('industrytype') || sessionStorage.getItem('industrytype') ||
        localStorage.getItem('industry_type') || sessionStorage.getItem('industry_type') ||
        localStorage.getItem('industry') || sessionStorage.getItem('industry') || 'education'
    ).toLowerCase();

    // Sector palettes: [primary, primary-dark, primary-light]
    const THEMES = {
        education:    { name: 'Education',    icon: 'fa-graduation-cap', primary: '#3498db', dark: '#2c3e50', light: '#5dade2' },
        healthcare:   { name: 'Healthcare',   icon: 'fa-heartbeat',      primary: '#e74c3c', dark: '#78281f', light: '#ec7063' },
        corporate:    { name: 'Corporate',    icon: 'fa-briefcase',      primary: '#2c3e50', dark: '#1a252f', light: '#566573' },
        manufacturing:{ name: 'Manufacturing',icon: 'fa-industry',       primary: '#e67e22', dark: '#7e4300', light: '#f0a04b' },
        government:   { name: 'Government',   icon: 'fa-landmark',       primary: '#8e44ad', dark: '#4a235a', light: '#af7ac5' },
        retail:       { name: 'Retail',       icon: 'fa-shopping-cart',  primary: '#27ae60', dark: '#145a32', light: '#52be80' }
    };
    const theme = THEMES[industry] || THEMES.education;

    // ---- 1. Inject theme CSS (high specificity + !important to beat hardcoded styles) ----
    const css = `
        /* Sidebar (vertical, admin-attendance style) */
        .sidebar { background: ${theme.dark} !important; }
        .sidebar .sidebar-brand,
        .sidebar .nav-link { color: rgba(255,255,255,0.85) !important; }
        .sidebar .nav-link:hover { background: ${theme.primary} !important; color: #fff !important; }
        .sidebar .nav-link.active { background: ${theme.primary} !important; color: #fff !important; }

        /* Horizontal navbar (history/profile/settings/reports/integrations style) */
        .navbar-custom { background: ${theme.dark} !important; }
        .navbar-custom .navbar-brand,
        .navbar-custom .nav-link { color: rgba(255,255,255,0.85) !important; }
        .navbar-custom .nav-link:hover,
        .navbar-custom .nav-link.active,
        .navbar-custom .dropdown-item:hover { background: ${theme.primary} !important; color: #fff !important; }

        /* Page header + primary buttons + links */
        .page-header, .welcome-card { background: ${theme.primary} !important; }
        .btn-primary { background: ${theme.primary} !important; border-color: ${theme.primary} !important; }
        .btn-primary:hover { background: ${theme.dark} !important; border-color: ${theme.dark} !important; }
        .text-primary { color: ${theme.primary} !important; }
        a { color: ${theme.primary}; }
    `;
    const style = document.createElement('style');
    style.id = 'industry-theme-style';
    style.textContent = css;
    document.head.appendChild(style);

    // ---- 2. Hide education-only sidebar items for non-education sectors ----
    const EDUCATION_ONLY = ['faculty-classes', 'class-management', 'class-schedule', 'teacher-dashboard', 'teacher-classes'];
    if (industry !== 'education') {
        document.querySelectorAll('a[href]').forEach(link => {
            const href = (link.getAttribute('href') || '').toLowerCase();
            if (EDUCATION_ONLY.some(page => href.includes(page))) {
                const li = link.closest('li') || link.closest('.nav-item');
                if (li) { li.style.display = 'none'; } else { link.style.display = 'none'; }
            }
        });
    }

    // ---- 3. Rebrand the header/brand to the sector ----
    document.querySelectorAll('.sidebar-brand, .navbar-brand').forEach(brand => {
        const icon = brand.querySelector('i');
        if (icon) { icon.className = 'fas ' + theme.icon + (icon.className.includes('me-') ? ' me-2' : ''); }
        const label = brand.textContent.replace(/\s+/g, ' ').trim();
        if (/universal attendance/i.test(label)) {
            brand.childNodes.forEach(node => { if (node.nodeType === 3 && node.textContent.trim()) node.textContent = ''; });
            brand.insertAdjacentText('beforeend', `Universal Attendance — ${theme.name}`);
        }
    });

    console.log('Industry theme applied:', industry, theme);
})();