/* ============================================================
   utils.js — Shared helpers
   ============================================================ */

'use strict';

// ── Persistent Debug Logging & file:// Protocol Helper ──────────
(function() {
  try {
    const storedLogs = localStorage.getItem('garl_debug_logs');
    if (storedLogs) {
      const logs = JSON.parse(storedLogs);
      console.log('%c[PREV SESSION LOGS]', 'background: #334155; color: #cbd5e1; padding: 2px 5px; border-radius: 3px;');
      logs.forEach(log => {
        const style = log.type === 'error' ? 'color: #ef4444; font-weight: bold;' : log.type === 'warn' ? 'color: #f59e0b' : 'color: #94a3b8';
        console.log(`%c[PREV] [${log.type.toUpperCase()}] ${log.msg}`, style);
      });
      console.log('%c[END PREV SESSION LOGS]', 'background: #334155; color: #cbd5e1; padding: 2px 5px; border-radius: 3px;');
      localStorage.removeItem('garl_debug_logs');
    }
  } catch (e) {}

  window.persistLog = function(type, msg) {
    try {
      const raw = localStorage.getItem('garl_debug_logs');
      const logs = raw ? JSON.parse(raw) : [];
      logs.push({ type, msg, ts: Date.now() });
      if (logs.length > 50) logs.shift();
      localStorage.setItem('garl_debug_logs', JSON.stringify(logs));
    } catch (e) {}
  };

  // Intercept window errors and unhandled promise rejections
  window.addEventListener('error', function(e) {
    window.persistLog('error', `Uncaught: ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener('unhandledrejection', function(e) {
    window.persistLog('error', `Unhandled Rejection: ${e.reason}`);
  });

  // Intercept console functions to persist them automatically
  const _log = console.log;
  const _warn = console.warn;
  const _error = console.error;

  console.log = function(...args) {
    _log.apply(console, args);
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    window.persistLog('log', msg);
  };
  console.warn = function(...args) {
    _warn.apply(console, args);
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    window.persistLog('warn', msg);
  };
  console.error = function(...args) {
    _error.apply(console, args);
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    window.persistLog('error', msg);
  };

  // Intercept clicks on links and elements with inline onclick to append session query parameter on file:// protocol
  if (window.location.protocol === 'file:') {
    document.addEventListener('click', function(e) {
      const el = e.target.closest('[onclick], a');
      if (!el) return;

      // Check if we have an active session
      let session = null;
      try {
        const raw = localStorage.getItem('garl_session');
        session = raw ? JSON.parse(raw) : null;
      } catch (err) {}

      if (!session) {
        // Fallback: check query param of current URL
        try {
          const params = new URLSearchParams(window.location.search);
          const sessionParam = params.get('session');
          if (sessionParam) session = JSON.parse(decodeURIComponent(sessionParam));
        } catch (err) {}
      }

      if (!session) return;

      const sessionStr = `session=${encodeURIComponent(JSON.stringify(session))}`;

      // Case 1: <a> tag with relative path
      if (el.tagName === 'A' && el.href) {
        const url = new URL(el.href);
        if (url.protocol === 'file:') {
          if (!url.searchParams.has('session')) {
            e.preventDefault();
            url.searchParams.set('session', JSON.stringify(session));
            window.location.href = url.toString();
          }
        }
      }

      // Case 2: inline window.location.href redirect in onclick
      const onclickStr = el.getAttribute('onclick');
      if (onclickStr && onclickStr.includes('window.location.href')) {
        const match = onclickStr.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
        if (match) {
          e.preventDefault();
          e.stopPropagation();
          const target = match[1];
          const joinChar = target.includes('?') ? '&' : '?';
          window.location.href = `${target}${joinChar}${sessionStr}`;
        }
      }
    }, true);
  }
})();

// ── Date / Time ───────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function toISOLocal(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T`
       + `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function daysBetween(a, b) {
  const msPerDay = 86400000;
  const da = new Date(a), db = new Date(b);
  return Math.max(0, Math.round((db - da) / msPerDay));
}

// ── ID Generation ─────────────────────────────────────────────
function generateId(prefix = 'id') {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts   = Date.now().toString(36).slice(-4);
  return `${prefix}-${ts}${rand}`;
}

function generateSampleNumber() {
  const year = new Date().getFullYear();
  const existing = DB.samples ? DB.samples.length : 0;
  const seq = String(existing + 1).padStart(5, '0');
  return `LAB-${year}-${seq}`;
}

function generateReportNumber(labCode, date) {
  const d = new Date(date || Date.now());
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const existing = DB.reports ? DB.reports.length : 0;
  const seq = String(existing + 1).padStart(4, '0');
  return `RPT-${(labCode || 'LAB').toUpperCase()}-${ymd}-${seq}`;
}

// ── Toast Notifications ───────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

// ── DOM Helpers ───────────────────────────────────────────────
function qs(sel, parent = document) { return parent.querySelector(sel); }
function qsa(sel, parent = document) { return [...parent.querySelectorAll(sel)]; }

function el(tag, attrs = {}, ...children) {
  const elem = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') elem.className = v;
    else if (k === 'html') elem.innerHTML = v;
    else if (k.startsWith('on')) elem.addEventListener(k.slice(2), v);
    else elem.setAttribute(k, v);
  }
  children.forEach(c => {
    if (typeof c === 'string') elem.insertAdjacentHTML('beforeend', c);
    else if (c) elem.appendChild(c);
  });
  return elem;
}

function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.classList.remove('open');
    const form = m.querySelector('form');
    if (form) form.reset();
  }
}

function openPanel(id) {
  const p = document.getElementById(id);
  if (p) p.classList.add('open');
}

function closePanel(id) {
  const p = document.getElementById(id);
  if (p) p.classList.remove('open');
}

// ── Sample status helpers (shared across dashboards) ──────────
// The full lifecycle is:
//   received → assigned → in_progress → completed
//                            ↘ returned ↗ (lab → reception review)
//                        returned → archived (closed without analysis)
//                        archived → assigned (restored by reception)
const SAMPLE_STATUS_LABELS = {
  received:    'Received',
  assigned:    'Assigned',
  in_progress: 'In Progress',
  completed:   'Completed',
  returned:    'Returned to Reception',
  archived:    'Archived',
};

// Priority order used when a whole submission is summarised into one badge.
// Anything that needs attention wins over progress states.
const SAMPLE_STATUS_ORDER = ['returned', 'received', 'assigned', 'in_progress', 'completed'];

/** Archived or completed — the lab no longer has any work to do. */
function isSampleDone(s) {
  return !!s && (s.status === 'completed' || s.status === 'archived');
}

/** Sent back by the lab, currently sitting in the reception review queue. */
function isSampleReturned(s) {
  return !!s && s.status === 'returned';
}

/** Closed by reception without analysis (counts as completed in reports). */
function isSampleArchived(s) {
  return !!s && s.status === 'archived';
}

/** Still with the lab: received, assigned, or being analysed. */
function isSampleActionable(s) {
  return !!s && (s.status === 'received' || s.status === 'assigned' || s.status === 'in_progress');
}

/**
 * Collapse a list of samples into a single summary status.
 * Archived samples are treated as completed for display purposes.
 * @param {Array<object>} samples
 * @returns {string}
 */
function summariseSampleStatuses(samples) {
  const list = samples || [];
  const normalised = list.map(s => (isSampleArchived(s) ? 'completed' : s.status));
  for (const st of SAMPLE_STATUS_ORDER) {
    if (normalised.includes(st)) return st;
  }
  return normalised[0] || 'received';
}

function sampleStatusLabel(status) {
  return SAMPLE_STATUS_LABELS[status] || status || '—';
}

// ── Status Badge ──────────────────────────────────────────────
function statusBadge(status) {
  return `<span class="badge badge-${status}">${sampleStatusLabel(status)}</span>`;
}

/**
 * Disable a button while an async operation runs, showing a busy label.
 * Restores the original label and re-enables afterwards.
 * @param {string} id - button element id
 * @param {boolean} busy
 * @param {string} [label] - text to show while busy
 */
function setBusy(id, busy, label) {
  const btn = typeof id === 'string' ? document.getElementById(id) : id;
  if (!btn) return;
  if (busy) {
    if (!btn.dataset.origHtml) btn.dataset.origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ ' + (label || 'Working…');
  } else {
    btn.disabled = false;
    if (btn.dataset.origHtml) {
      btn.innerHTML = btn.dataset.origHtml;
      delete btn.dataset.origHtml;
    }
  }
}

function roleBadge(role) {
  return `<span class="badge badge-${role}">${role.replace('_', ' ')}</span>`;
}

// ── Debounce ──────────────────────────────────────────────────
function debounce(fn, ms = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ── CSV Export ────────────────────────────────────────────────
function downloadCSV(filename, rows) {
  if (!rows || !rows.length) { showToast('No data to export', 'warning'); return; }
  const headers = Object.keys(rows[0]);
  const csvRows = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = (row[h] ?? '').toString().replace(/"/g, '""');
        return val.includes(',') || val.includes('"') || val.includes('\n')
          ? `"${val}"` : val;
      }).join(',')
    )
  ];
  // Prepend a UTF-8 BOM so Excel/Windows detects UTF-8 instead of assuming the
  // ANSI codepage — otherwise multi-byte characters (e.g. the em dash "—" shown
  // for missing Avg Turnaround) get mis-decoded into mojibake like "â€"".
  // CRLF line endings keep Excel happy on Windows.
  const csv = '\uFEFF' + csvRows.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ── Avatar initials ───────────────────────────────────────────
function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase();
}

// ── Escape HTML ───────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"');
}

// ── Number formatting ─────────────────────────────────────────
function zeroPad(n, len = 2) { return String(n).padStart(len, '0'); }

// ── Normalise element symbol to proper capitalisation ─────────
/**
 * Given a raw element symbol string (e.g. "AU", "au", "Au"),
 * return the properly capitalised form from the elements library.
 * Falls back to capitalising first letter + lowercasing the rest.
 * @param {string} symbol
 * @returns {string}
 */
function normalizeElementSymbol(symbol) {
  if (!symbol) return '';
  const info = getElementInfo(symbol);
  if (info) return info.symbol;
  // Fallback: capitalise first letter, lowercase the rest
  return symbol.charAt(0).toUpperCase() + symbol.slice(1).toLowerCase();
}

// ── New Data Structure: Submission/Sample ID Generator ─────────
/**
 * Generate structured sample IDs in format: YY-MM-LAB-SUBID-SEQ
 * @param {string} labCode - 3-char lab code (e.g. "HEM", "MIC")
 * @param {number|string} submissionId - numeric submission ID
 * @param {number} totalSamples - how many samples to generate
 * @param {string} [dateString] - optional date string
 * @returns {Array<{fullId: string, sampleNumber: string}>}
 */
function generateSampleIDs(labCode, submissionId, totalSamples, dateString) {
  const dateObj = dateString ? new Date(dateString) : new Date();
  const yy = zeroPad(dateObj.getFullYear() % 100, 2);
  const mm = zeroPad(dateObj.getMonth() + 1, 2);
  const lab = labCode.toUpperCase().substring(0, 3);
  const sub = zeroPad(Number(submissionId), 4);

  const generatedIds = [];
  for (let i = 1; i <= totalSamples; i++) {
    const sid = zeroPad(i, 3);
    const fullId = `${yy}-${mm}-${lab}-${sub}-${sid}`;
    generatedIds.push({
      fullId: fullId,
      sampleNumber: sid
    });
  }
  return generatedIds;
}

// ── Lab code derivation from lab name or lab object ────────────
/**
 * Derive a short code from a lab, checking lab_code field first.
 * Falls back to deriving from lab name (first 3 chars of first word).
 * @param {string|Object} lab - Lab object with lab_code field, or lab name string
 * @returns {string}
 */
function deriveLabCode(lab) {
  if (!lab) return 'LAB';
  // If given a lab object with a lab_code, use it directly
  if (typeof lab === 'object' && lab.lab_code) {
    return lab.lab_code.toUpperCase().substring(0, 3);
  }
  // If given a string, derive from name
  if (typeof lab === 'string') {
    const firstWord = lab.trim().split(/\s+/)[0];
    return firstWord.toUpperCase().substring(0, 3);
  }
  // If given a lab object without lab_code, derive from lab_name
  if (typeof lab === 'object' && lab.lab_name) {
    const firstWord = lab.lab_name.trim().split(/\s+/)[0];
    return firstWord.toUpperCase().substring(0, 3);
  }
  return 'LAB';
}

// ── Template Renderer ─────────────────────────────────────────
/**
 * Clone a <template>, populate data-bind elements, and return the fragment.
 * Usage: <template id="foo"><p data-bind="name"></p></template>
 *        const frag = bindTemplate('foo', { name: 'John' });
 *        container.appendChild(frag);
 * @param {string} templateId - The ID of the <template> element
 * @param {object} data - Key/value pairs matching data-bind attributes
 * @param {object} [options] - Optional settings
 * @param {boolean} [options.sanitize=true] - Whether to escape HTML in values
 * @returns {DocumentFragment}
 */
function bindTemplate(templateId, data, options = {}) {
  const { sanitize = true } = options;
  const tmpl = document.getElementById(templateId);
  if (!tmpl) {
    console.error(`[TEMPLATE] Template #${templateId} not found`);
    return document.createDocumentFragment();
  }
  const clone = tmpl.content.cloneNode(true);

  // Fill data-bind elements
  clone.querySelectorAll('[data-bind]').forEach(el => {
    const key = el.getAttribute('data-bind');
    const fallback = el.getAttribute('data-fallback') || '—';
    let val = data[key] ?? fallback;
    if (sanitize && typeof val === 'string' && !el.hasAttribute('data-raw')) {
      val = escHtml(val);
    }
    // For INPUT/textarea, set value; otherwise set textContent
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      el.value = val;
    } else if (el.hasAttribute('data-html')) {
      el.innerHTML = val;
    } else {
      el.textContent = val;
    }
  });

  // Fill data-href attributes
  clone.querySelectorAll('[data-href]').forEach(el => {
    const key = el.getAttribute('data-href');
    const val = data[key] || '';
    el.href = val;
  });

  // Fill data-src attributes
  clone.querySelectorAll('[data-src]').forEach(el => {
    const key = el.getAttribute('data-src');
    const val = data[key] || '';
    el.src = val;
  });

  return clone;
}

/**
 * Create a single element with text content from a simplified HTML template.
 * @param {string} html - HTML string (no interpolation, just structure)
 * @returns {DocumentFragment}
 */
function htmlToFragment(html) {
  const tmpl = document.createElement('template');
  tmpl.innerHTML = html.trim();
  return tmpl.content.cloneNode(true);
}

// ── Mobile / Tablet Navigation (Hamburger Sidebar) ────────────
/**
 * Make the fixed sidebar accessible on small screens.
 * - Injects a hamburger button into the topbar (visible ≤768px via CSS)
 * - Creates a dimmed overlay behind the sidebar when open
 * - Closes on overlay tap, nav-item click, or Escape key
 * Works with dynamically rendered sidebars (e.g. progress-report.html)
 * because toggling uses classes and closing uses event delegation.
 */
function initMobileNav() {
  const sidebar = document.querySelector('.sidebar');
  const topbar = document.querySelector('.topbar');
  if (!sidebar || !topbar || document.getElementById('mobile-nav-toggle')) return;

  // Hamburger button (first item in topbar)
  const toggle = document.createElement('button');
  toggle.className = 'menu-toggle';
  toggle.id = 'mobile-nav-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Toggle navigation menu');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML = '<span></span><span></span><span></span>';
  topbar.insertBefore(toggle, topbar.firstChild);

  // Dimmed overlay behind the open sidebar
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  overlay.id = 'sidebar-overlay';
  document.body.appendChild(overlay);

  const openSidebar = () => {
    sidebar.classList.add('open');
    overlay.classList.add('open');
    toggle.classList.add('active');
    toggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  };
  const closeSidebar = () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    toggle.classList.remove('open');
    toggle.classList.remove('active');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = sidebar.classList.contains('open');
    isOpen ? closeSidebar() : openSidebar();
  });

  overlay.addEventListener('click', closeSidebar);

  // Close when a nav item is clicked (delegation covers dynamic sidebars)
  sidebar.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item, a')) closeSidebar();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
  });

  // Reset state when resizing back to desktop
  window.addEventListener('resize', debounce(() => {
    if (window.innerWidth > 768) closeSidebar();
  }, 150));
}

// Auto-initialise mobile navigation on every page that loads utils.js
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMobileNav);
} else {
  initMobileNav();
}
