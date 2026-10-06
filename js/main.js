(function () {
  'use strict';

  function setupGlobalSearch() {
    const searchInput = document.querySelector('.search-input');
    if (!searchInput) return;

    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
      }
    });
  }

  function setupToastSystem() {
    if (!document.getElementById('cira-toast-container')) {
      const container = document.createElement('div');
      container.id = 'cira-toast-container';
      container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
      document.body.appendChild(container);
    }
  }

  window.showToast = function (message, type = 'info') {
    const container = document.getElementById('cira-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.style.cssText = `
      min-width: 280px;
      max-width: 420px;
      padding: 14px 18px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      box-shadow: var(--shadow-lg);
      display: flex;
      align-items: center;
      gap: 12px;
      pointer-events: auto;
      transition: all 0.3s ease;
      color: #FFFFFF;
      background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : type === 'warning' ? '#B58739' : 'var(--cira-burgundy)'};
    `;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  };

  function setupMobileNavigation() {
    const sidebar = document.querySelector('.sidebar-nav');
    if (!sidebar) return;

    let backdrop = document.querySelector('.sidebar-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'sidebar-backdrop';
      document.body.appendChild(backdrop);
    }

    if (!sidebar.querySelector('.sidebar-mobile-header')) {
      const mobileHeader = document.createElement('div');
      mobileHeader.className = 'sidebar-mobile-header';
      mobileHeader.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="logo-badge" style="width:32px;height:32px;font-size:11px;font-weight:900;">CIRA</span>
          <span style="font-family:var(--font-condensed);font-weight:800;font-size:16px;color:#FFFFFF;letter-spacing:0.04em;">CIRA FLEET</span>
        </div>
        <button type="button" class="sidebar-close-btn" aria-label="Close navigation menu">&times;</button>
      `;
      sidebar.insertBefore(mobileHeader, sidebar.firstChild);
    }

    const headerActions = document.querySelector('.header-actions') || document.querySelector('.header-inner');
    if (headerActions && !document.getElementById('mobile-nav-toggle')) {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.id = 'mobile-nav-toggle';
      toggleBtn.className = 'btn-icon btn-nav-toggle';
      toggleBtn.setAttribute('aria-label', 'Toggle navigation menu');
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      `;
      headerActions.appendChild(toggleBtn);
    }

    const toggleBtn = document.getElementById('mobile-nav-toggle');

    function openSidebar() {
      document.body.classList.add('sidebar-open');
      sidebar.classList.add('open');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    }

    function closeSidebar() {
      document.body.classList.remove('sidebar-open');
      sidebar.classList.remove('open');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (sidebar.classList.contains('open')) {
          closeSidebar();
        } else {
          openSidebar();
        }
      });
    }

    backdrop.addEventListener('click', closeSidebar);

    const closeBtn = sidebar.querySelector('.sidebar-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeSidebar);
    }

    sidebar.addEventListener('click', (e) => {
      const targetLink = e.target.closest('a');
      if (targetLink) {
        closeSidebar();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebar.classList.contains('open')) {
        closeSidebar();
      }
    });
  }

  function applyTableDataLabels(table) {
    if (!table) return;
    if (table.closest('.audit-table-wrapper') || table.closest('#audit-table-container') || table.classList.contains('table-stay-table') || table.classList.contains('table-preserve')) {
      return;
    }

    const headers = Array.from(table.querySelectorAll('thead th, tr:first-child th'));
    if (!headers.length) return;

    const columnLabels = headers.map(th => th.textContent.trim().replace(/\s+/g, ' '));
    const rows = table.querySelectorAll('tbody tr');

    rows.forEach(tr => {
      Array.from(tr.children).forEach((cell, idx) => {
        if (cell.tagName === 'TD' && columnLabels[idx] && !cell.getAttribute('data-label')) {
          cell.setAttribute('data-label', columnLabels[idx]);
        }
      });
    });
  }

  function setupResponsiveTables() {
    const tables = document.querySelectorAll('table.data-table');
    tables.forEach(applyTableDataLabels);

    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver((mutations) => {
        let shouldUpdate = false;
        for (const m of mutations) {
          if (m.type === 'childList' && m.addedNodes.length > 0) {
            shouldUpdate = true;
            break;
          }
        }
        if (shouldUpdate) {
          document.querySelectorAll('table.data-table').forEach(applyTableDataLabels);
        }
      });

      tables.forEach(table => {
        const tbody = table.querySelector('tbody') || table;
        observer.observe(tbody, { childList: true, subtree: true });
      });
    }
  }

  function setupEllipsisTooltips() {
    const candidates = document.querySelectorAll('.mono-id, [data-cell-id], td.id-cell');
    candidates.forEach(el => {
      if (!el.getAttribute('title') && el.textContent) {
        el.setAttribute('title', el.textContent.trim());
      }
    });
  }

  function init() {
    setupGlobalSearch();
    setupToastSystem();
    setupMobileNavigation();
    setupResponsiveTables();
    setupEllipsisTooltips();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
