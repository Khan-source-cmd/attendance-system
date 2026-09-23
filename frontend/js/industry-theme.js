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

    // Sector palettes: [primary, primary-dark, primary-light, soft tint]
    const THEMES = {
        education:    { name: 'Education',    icon: 'fa-graduation-cap', primary: '#3498db', dark: '#2c3e50', light: '#5dade2', soft: 'rgba(52, 152, 219, 0.15)' },
        healthcare:   { name: 'Healthcare',   icon: 'fa-heartbeat',      primary: '#e74c3c', dark: '#78281f', light: '#ec7063', soft: 'rgba(231, 76, 60, 0.15)' },
        corporate:    { name: 'Corporate',    icon: 'fa-briefcase',      primary: '#2c3e50', dark: '#1a252f', light: '#566573', soft: 'rgba(44, 62, 80, 0.15)' },
        manufacturing:{ name: 'Manufacturing',icon: 'fa-industry',       primary: '#e67e22', dark: '#7e4300', light: '#f0a04b', soft: 'rgba(230, 126, 34, 0.15)' },
        government:   { name: 'Government',   icon: 'fa-landmark',       primary: '#8e44ad', dark: '#4a235a', light: '#af7ac5', soft: 'rgba(142, 68, 173, 0.15)' },
        retail:       { name: 'Retail',       icon: 'fa-shopping-cart',  primary: '#27ae60', dark: '#145a32', light: '#52be80', soft: 'rgba(39, 174, 96, 0.15)' }
    };
    const theme = THEMES[industry] || THEMES.education;

    // ---- 1. Inject theme CSS (high specificity + !important to beat hardcoded styles) ----
    const css = `
        /* Body background - override hardcoded gradients */
        body { background: linear-gradient(135deg, ${theme.primary} 0%, ${theme.dark} 100%) !important; }

        /* Sidebar - matches the look the dashboards already use: white surface,
           dark text, sector colour for the brand icon and the active accent.
           Forcing white text here was what made the brand invisible against the
           page's own white .sidebar-header strip. */
        .sidebar { background: rgba(255, 255, 255, 0.98) !important; }

        .sidebar .sidebar-header,
        .sidebar-header {
            background: rgba(255, 255, 255, 0.95) !important;
            border-bottom: 1px solid rgba(0, 0, 0, 0.1) !important;
        }

        .sidebar .sidebar-brand { color: #2c3e50 !important; }
        .sidebar .sidebar-brand i { color: ${theme.primary} !important; }

        .sidebar .nav-link { color: #2c3e50 !important; }
        .sidebar .nav-link i { color: inherit !important; }
        .sidebar .nav-link:hover {
            color: ${theme.primary} !important;
            background: ${theme.soft} !important;
        }
        .sidebar .nav-link.active {
            color: ${theme.primary} !important;
            background: ${theme.soft} !important;
            border-right: 4px solid ${theme.primary} !important;
        }

        /* Shared app sidebar (sidebar.js component) - white surface, dark text,
           sector colour for the brand icon and hover/active accents */
        .app-sidebar { background: rgba(255, 255, 255, 0.97) !important; }
        .app-sidebar .sidebar-brand { color: #2c3e50 !important; }
        .app-sidebar .sidebar-brand i { color: ${theme.primary} !important; }
        .app-sidebar .nav-link { color: #2c3e50 !important; }
        .app-sidebar .nav-link:hover {
            color: ${theme.primary} !important;
            background: ${theme.soft} !important;
        }
        .app-sidebar .nav-link.active {
            color: ${theme.primary} !important;
            background: ${theme.soft} !important;
            border-right: 4px solid ${theme.primary} !important;
        }
        .app-sidebar-toggle {
            border-color: ${theme.primary} !important;
            color: ${theme.primary} !important;
        }

        /* Horizontal navbar (history/profile/settings/reports/integrations style).
           These pages ship a WHITE navbar, so its text must stay DARK. Forcing
           white text here produced white-on-white navigation. */
        .navbar-custom { background: rgba(255, 255, 255, 0.95) !important; }
        .navbar-custom .navbar-brand { color: ${theme.primary} !important; }
        .navbar-custom .navbar-brand i { color: ${theme.primary} !important; }
        .navbar-custom .nav-link { color: ${theme.dark} !important; }
        .navbar-custom .nav-link i { color: inherit !important; }
        .navbar-custom .nav-link:hover,
        .navbar-custom .nav-link.active { background: ${theme.primary} !important; color: #fff !important; }
        .navbar-custom .dropdown-item { color: ${theme.dark} !important; }
        .navbar-custom .dropdown-item:hover { background: ${theme.primary} !important; color: #fff !important; }
        .navbar-custom .navbar-toggler {
            border-color: ${theme.primary} !important;
            color: ${theme.primary} !important;
        }

        /* Page header + welcome card - override hardcoded blue gradients */
        .page-header,
        .welcome-card,
        .profile-header,
        .card-header.bg-primary,
        .modal-header {
            background: linear-gradient(135deg, ${theme.primary} 0%, ${theme.dark} 100%) !important;
            color: white !important;
            border-left: 4px solid ${theme.primary} !important;
        }

        /* Primary buttons + links */
        .btn-primary { background: ${theme.primary} !important; border-color: ${theme.primary} !important; color: white !important; }
        .btn-primary:hover { background: ${theme.dark} !important; border-color: ${theme.dark} !important; }
        .text-primary { color: ${theme.primary} !important; }
        a { color: ${theme.primary} !important; }

        /* Cards with sector-specific borders */
        .history-card,
        .settings-card,
        .profile-card,
        .org-card,
        .member-card,
        .metric-card,
        .card {
            border-left: 4px solid ${theme.primary} !important;
        }

        /* Badge colors */
        .badge-primary { background: ${theme.primary} !important; }
        .badge-success { background: ${theme.light} !important; color: #fff !important; }
        .badge-danger { background: ${theme.dark} !important; }

        /* Admin attendance modal */
        .modal-content { border: 1px solid ${theme.primary} !important; }

        /* Mobile menu toggle */
        .mobile-menu-toggle {
            background: rgba(255, 255, 255, 0.9) !important;
            border: 2px solid ${theme.primary} !important;
            color: ${theme.primary} !important;
        }
    `;
    const style = document.createElement('style');
    style.id = 'industry-theme-style';
    style.textContent = css;
    document.head.appendChild(style);

    // ---- 1b. Expose the sector gradient as a CSS variable ----
    // Shared pages that still carry hardcoded blue/purple gradients (the
    // organization page) read var(--brand-gradient), so the sector palette
    // applies there too. Semantic colours are deliberately NOT touched:
    // connected=green / pending=orange buttons, role badges and hierarchy
    // level colours keep their meaning.
    document.documentElement.style.setProperty(
        '--brand-gradient',
        `linear-gradient(135deg, ${theme.primary} 0%, ${theme.dark} 100%)`
    );

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