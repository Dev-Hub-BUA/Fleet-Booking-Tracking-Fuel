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

  function init() {
    setupGlobalSearch();
    setupToastSystem();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
