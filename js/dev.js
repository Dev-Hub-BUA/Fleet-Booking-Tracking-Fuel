(function () {
  'use strict';

  if (!window.location.search.includes('dev=1')) {
    return;
  }

  function initDevToolbar() {
    if (document.getElementById('dev-floating-panel')) return;

    const el = document.createElement('div');
    el.id = 'dev-floating-panel';
    el.innerHTML = `
      <div style="position:fixed;bottom:20px;right:20px;z-index:99999;font-family:system-ui,-apple-system,sans-serif;">
        <div id="dev-menu-box" style="background:#1E293B;color:#F8FAFC;border:1px solid #334155;box-shadow:0 10px 25px -5px rgba(0,0,0,0.5);border-radius:8px;padding:12px 14px;min-width:220px;display:none;margin-bottom:8px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;border-bottom:1px solid #334155;padding-bottom:6px;">
            <strong style="font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#CE9F51;display:flex;align-items:center;gap:6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              Developer Menu
            </strong>
            <span style="font-size:10px;background:#334155;color:#94A3B8;padding:2px 6px;border-radius:4px;font-family:monospace;">dev=1</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <button id="dev-btn-reset-demo" type="button" style="width:100%;text-align:left;background:#0F172A;border:1px solid #475569;color:#F1F5F9;padding:6px 10px;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              Reset Demo Data
            </button>
            <button id="dev-btn-clear-all" type="button" style="width:100%;text-align:left;background:#0F172A;border:1px solid #7F1D1D;color:#FCA5A5;padding:6px 10px;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Clear All Data
            </button>
          </div>
        </div>
        <button id="dev-menu-toggle" type="button" style="float:right;background:#1E293B;color:#CE9F51;border:1px solid #334155;border-radius:24px;padding:6px 12px;font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Dev Tools
        </button>
      </div>
    `;
    document.body.appendChild(el);

    const toggle = document.getElementById('dev-menu-toggle');
    const box = document.getElementById('dev-menu-box');
    toggle.addEventListener('click', () => {
      box.style.display = (box.style.display === 'none' || !box.style.display) ? 'block' : 'none';
    });

    document.getElementById('dev-btn-reset-demo').addEventListener('click', () => {
      if (confirm('Restore default demo data? This resets bookings, vehicles, and settings.')) {
        if (window.FleetStore && typeof window.FleetStore.resetDemo === 'function') {
          window.FleetStore.resetDemo();
        }
        window.location.reload();
      }
    });

    document.getElementById('dev-btn-clear-all').addEventListener('click', () => {
      if (confirm('Clear all bookings and data? This leaves an empty database.')) {
        if (window.FleetStore && typeof window.FleetStore.clearAll === 'function') {
          window.FleetStore.clearAll();
        }
        window.location.reload();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDevToolbar);
  } else {
    initDevToolbar();
  }
})();
