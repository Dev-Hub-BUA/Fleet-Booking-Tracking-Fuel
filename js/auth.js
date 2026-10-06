(function () {
  'use strict';

  const USERS = {
    'Requester': {
      id: 'USR-REQ-101',
      name: 'Dr. Sarah Mansour',
      titleAr: 'د. سارة منصور',
      role: 'Requester',
      roleAr: 'طالب مركبة (أعضاء هيئة التدريس)',
      dept: 'Faculty of Pharmacy',
      deptAr: 'كلية الصيدلة — جامعة بدر',
      email: 'sarah.mansour@buc.edu.eg',
      password: 'Cira@2026',
      initials: 'SM'
    },
    'Dispatcher': {
      id: 'USR-DSP-204',
      name: 'Khaled Ibrahim',
      titleAr: 'أ. خالد إبراهيم',
      role: 'Dispatcher',
      roleAr: 'مسؤول الترحيل والعمليات',
      dept: 'Logistics Command Desk',
      deptAr: 'غرفة العمليات المركزية والترحيل',
      email: 'khaled.ibrahim@cira.com.eg',
      password: 'Cira@2026',
      initials: 'KI'
    },
    'Driver': {
      id: 'USR-DRV-309',
      name: 'Ahmed Hassan',
      titleAr: 'كابتن أحمد حسن',
      role: 'Driver',
      roleAr: 'سائق الأسطول الميداني',
      dept: 'Central Transport Pool',
      deptAr: 'قسم الحركة والنقل الميداني',
      email: 'ahmed.hassan@cira.com.eg',
      password: 'Cira@2026',
      initials: 'AH'
    },
    'Fleet admin': {
      id: 'USR-ADM-401',
      name: 'Eng. Tarek Fathy',
      titleAr: 'م. طارق فتحي',
      role: 'Fleet admin',
      roleAr: 'مدير عام الأسطول واللوجستيات',
      dept: 'Fleet Operations Directorate',
      deptAr: 'الإدارة العامة للأسطول والمعدات',
      email: 'tarek.fathy@cira.com.eg',
      password: 'Cira@2026',
      initials: 'TF'
    },
    'Auditor': {
      id: 'USR-AUD-505',
      name: 'Mona Adel',
      titleAr: 'أ. منى عادل',
      role: 'Auditor',
      roleAr: 'المراجع المالي والرقابي',
      dept: 'Financial Compliance Bureau',
      deptAr: 'إدارة المراجعة والرقابة المالية',
      email: 'mona.adel@cira.com.eg',
      password: 'Cira@2026',
      initials: 'MA'
    }
  };

  const NAV_LINKS = {
    'Requester': [
      { href: 'home.html', label: 'Home Dashboard', icon: 'home' },
      { href: 'vehicles.html', label: 'Vehicle Catalog', icon: 'catalog' },
      { href: 'booking-new.html', label: 'New Booking', icon: 'booking-new' },
      { href: 'bookings.html', label: 'My Bookings', icon: 'bookings' },
      { href: 'booking-track.html', label: 'Track Active Trip', icon: 'track' },
      { href: 'notifications.html', label: 'Notifications', icon: 'notifications', badge: '3' }
    ],
    'Dispatcher': [
      { href: 'home.html', label: 'Operations Desk', icon: 'home' },
      { href: 'dispatch-queue.html', label: 'Approval Queue', icon: 'dispatch', badge: '4' },
      { href: 'dispatch-timeline.html', label: 'Vehicle Timeline', icon: 'timeline' },
      { href: 'dispatch-map.html', label: 'Telemetry Map Hub', icon: 'map' },
      { href: 'incident.html', label: 'Incident Triage', icon: 'incident', badge: '1' },
      { href: 'notifications.html', label: 'Notifications', icon: 'notifications', badge: '6' }
    ],
    'Driver': [
      { href: 'home.html', label: 'Driver Dashboard', icon: 'home' },
      { href: 'driver-shift.html', label: 'Shift & Safety Check', icon: 'shift' },
      { href: 'driver-trip.html', label: 'Active Trip Manifest', icon: 'trip' },
      { href: 'driver-run.html', label: 'Live Run & SOS', icon: 'run' },
      { href: 'driver-close.html', label: 'Trip Closeout & Fuel', icon: 'close' },
      { href: 'notifications.html', label: 'Notifications', icon: 'notifications', badge: '2' }
    ],
    'Fleet admin': [
      { href: 'home.html', label: 'Fleet Overview', icon: 'home' },
      { href: 'admin-fleet.html', label: 'Vehicles & Price Book', icon: 'fleet' },
      { href: 'admin-drivers.html', label: 'Drivers & Licenses', icon: 'drivers' },
      { href: 'admin-kpi.html', label: 'KPI Analytics', icon: 'kpi' },
      { href: 'notifications.html', label: 'Notifications', icon: 'notifications', badge: '4' }
    ],
    'Auditor': [
      { href: 'home.html', label: 'Audit Bureau', icon: 'home' },
      { href: 'audit.html', label: 'Audit Log & Reconcile', icon: 'audit' },
      { href: 'admin-kpi.html', label: 'KPI Analytics', icon: 'kpi' },
      { href: 'notifications.html', label: 'Notifications', icon: 'notifications', badge: '3' }
    ]
  };

  const ICONS = {
    'home': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    'catalog': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    'booking-new': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
    'bookings': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>',
    'track': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    'notifications': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    'dispatch': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    'timeline': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    'map': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
    'incident': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    'shift': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    'trip': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    'run': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
    'close': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>',
    'fleet': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    'drivers': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    'kpi': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    'audit': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    'policies': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    'help': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };

  const SESSION_KEY = 'cira_auth_user';

  const Auth = {
    getUser: function () {
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    },

    getUsersList: function () {
      return Object.values(USERS);
    },

    authenticate: function (email, password) {
      if (!email || !password) {
        return { success: false, error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور للمتابعة.' };
      }

      const cleanEmail = String(email).trim().toLowerCase();
      const cleanPwd = String(password).trim();

      const matchedUser = Object.values(USERS).find(u => u.email.toLowerCase() === cleanEmail);
      if (!matchedUser) {
        return {
          success: false,
          error: 'البريد الإلكتروني غير مسجل بالمنظومة. استخدم أحد حسابات الاختبار المعتمدة أدناه.'
        };
      }

      if (cleanPwd !== matchedUser.password && cleanPwd !== '123456') {
        return {
          success: false,
          error: 'كلمة المرور غير صحيحة. كلمة المرور المعتمدة لجميع حسابات الاختبار هي Cira@2026'
        };
      }

      return { success: true, user: matchedUser };
    },

    login: function (roleOrEmail, password, options) {
      let targetUser = null;

      if (USERS[roleOrEmail]) {
        targetUser = USERS[roleOrEmail];
      } else if (typeof roleOrEmail === 'object' && roleOrEmail.role) {
        targetUser = roleOrEmail;
      } else if (typeof roleOrEmail === 'string' && roleOrEmail.includes('@')) {
        const authResult = this.authenticate(roleOrEmail, password);
        if (!authResult.success) {
          return authResult;
        }
        targetUser = authResult.user;
      } else {
        targetUser = USERS['Requester'];
      }

      const sessionData = {
        ...targetUser,
        token: 'cira_jwt_' + Math.random().toString(36).substring(2) + '_' + Date.now(),
        authenticatedAt: new Date().toISOString()
      };

      sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));

      const redirect = sessionStorage.getItem('cira_post_login_redirect') || 'home.html';
      sessionStorage.removeItem('cira_post_login_redirect');

      if (options && options.delay) {
        setTimeout(() => window.location.replace(redirect), options.delay);
      } else {
        window.location.replace(redirect);
      }

      return { success: true, user: targetUser, redirect: redirect };
    },

    logout: function () {
      sessionStorage.removeItem(SESSION_KEY);
      window.location.replace('login.html');
    },

    requireAuth: function (allowedRoles) {
      const user = this.getUser();
      if (!user) {
        const currentTarget = window.location.pathname.split('/').pop() || 'home.html';
        sessionStorage.setItem('cira_post_login_redirect', currentTarget);
        window.location.replace('login.html');
        return false;
      }

      if (allowedRoles && !allowedRoles.includes('all') && !allowedRoles.includes(user.role)) {
        const currentFile = window.location.pathname.split('/').pop();
        window.location.replace(`403.html?attempted=${encodeURIComponent(currentFile)}&role=${encodeURIComponent(user.role)}`);
        return false;
      }

      return true;
    },

    getSettings: function (callback) {
      if (window.FLEET_SETTINGS) {
        if (callback) callback(window.FLEET_SETTINGS);
        return window.FLEET_SETTINGS;
      }
      fetch('data/settings.json')
        .then(r => r.json())
        .then(data => {
          window.FLEET_SETTINGS = data;
          if (callback) callback(data);
        })
        .catch(() => {
          if (callback) callback(null);
        });
    },

    initIdleTimeout: function (timeoutMinutes = 20) {
      let timeoutHandle;
      const reset = () => {
        clearTimeout(timeoutHandle);
        timeoutHandle = setTimeout(() => {
          alert('انتهت جلسة العمل لدواعي الأمان المؤسسي بسبب عدم النشاط. يرجى إعادة تسجيل الدخول.\nYour session has expired due to inactivity.');
          Auth.logout();
        }, timeoutMinutes * 60 * 1000);
      };
      ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
        window.addEventListener(evt, reset, { passive: true });
      });
      reset();
    },

    renderAppShell: function (activeNavKey) {
      const user = this.getUser();
      if (!user) return;

      const userNameEl = document.querySelector('.user-name');
      if (userNameEl) userNameEl.textContent = user.name;

      const userRoleBadge = document.querySelector('.user-role-badge');
      if (userRoleBadge) userRoleBadge.textContent = `${user.role} · ${user.dept}`;

      const userAvatar = document.querySelector('.user-avatar');
      if (userAvatar) userAvatar.textContent = user.initials || 'CR';

      const sidebarNavLinks = document.querySelector('.sidebar-nav .nav-links');
      const navSectionTitle = document.querySelector('.sidebar-nav .nav-section-title');
      if (navSectionTitle) {
        navSectionTitle.textContent = `${user.role} Navigation`;
      }

      const roleLinks = NAV_LINKS[user.role] || NAV_LINKS['Requester'];
      if (sidebarNavLinks) {
        const currentFile = window.location.pathname.split('/').pop();
        const linksHtml = roleLinks.map(link => {
          const isActive = (link.href === currentFile) || (link.icon === activeNavKey);
          return `
            <a href="${link.href}" class="nav-link ${isActive ? 'active' : ''}">
              <span style="display:flex;align-items:center;gap:10px;">
                <span class="nav-icon" style="display:flex;align-items:center;justify-content:center;opacity:0.9;">${ICONS[link.icon] || ''}</span>
                <span>${link.label}</span>
              </span>
              ${link.badge ? `<span class="nav-badge">${link.badge}</span>` : ''}
            </a>
          `;
        }).join('');

        sidebarNavLinks.innerHTML = linksHtml;
      }

      const presenterControls = document.querySelector('.sidebar-role-switch');
      if (presenterControls) {
        presenterControls.remove();
      }

      const userDropdownMenu = document.getElementById('user-dropdown-menu');
      if (userDropdownMenu) {
        userDropdownMenu.innerHTML = `
          <div style="padding: 12px 14px; border-bottom: 1px solid var(--border); background: var(--navy-50);">
            <strong style="color: var(--cira-burgundy); display: block; font-size: 14px;">${user.name}</strong>
            <span style="font-size: 12px; color: var(--text-muted); display: block;">${user.email}</span>
            <span style="display: inline-block; margin-top: 4px; font-size: 11px; font-weight: 700; color: var(--cira-gold-dark); background: var(--cira-gold-soft); padding: 2px 6px; border-radius: 4px;">${user.role} · ${user.dept}</span>
          </div>
          <a href="policies.html" class="menu-item" style="display: flex; align-items: center; gap: 8px;">
            ${ICONS['policies']} <span>Policies & Operating Rules</span>
          </a>
          <a href="help.html" class="menu-item" style="display: flex; align-items: center; gap: 8px;">
            ${ICONS['help']} <span>Fleet Help Desk & Emergency</span>
          </a>
          <div class="menu-divider"></div>
          <button type="button" class="menu-item signout" style="width: 100%; border: none; background: none; text-align: inherit; cursor: pointer; display: flex; align-items: center; gap: 8px; color: var(--danger);" onclick="Auth.logout();">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span>Sign Out</span>
          </button>
        `;
      }

      this.initIdleTimeout();
    }
  };

  window.Auth = Auth;
  window.USERS = USERS;

  document.addEventListener('DOMContentLoaded', function () {
    const userBtn = document.querySelector('.user-btn');
    const dropdown = document.getElementById('user-dropdown-menu');
    if (userBtn && dropdown) {
      userBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        dropdown.classList.toggle('open');
      });
      document.addEventListener('click', function () {
        dropdown.classList.remove('open');
      });
    }

    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        const q = searchInput.value.trim().toLowerCase();
        const rows = document.querySelectorAll('.data-table tbody tr');
        rows.forEach(r => {
          r.style.display = (!q || r.textContent.toLowerCase().includes(q)) ? '' : 'none';
        });
        const cards = document.querySelectorAll('.catalog-grid .card, .dispatch-queue-card');
        cards.forEach(c => {
          c.style.display = (!q || c.textContent.toLowerCase().includes(q)) ? '' : 'none';
        });
      });
    }
  });
})();
