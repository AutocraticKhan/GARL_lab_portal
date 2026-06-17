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

// ── Status Badge ──────────────────────────────────────────────
function statusBadge(status) {
  const labels = {
    received:    'Received',
    assigned:    'Assigned',
    in_progress: 'In Progress',
    completed:   'Completed',
  };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
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
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Number formatting ─────────────────────────────────────────
function zeroPad(n, len = 2) { return String(n).padStart(len, '0'); }

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

// ── Lab code derivation from lab name ──────────────────────────
/**
 * Derive a short code from a lab name by taking the first word.
 * Examples: "Hematology" → "HEM", "Blood Culture & Sensitivity" → "BLO"
 * @param {string} labName
 * @returns {string}
 */
function deriveLabCode(labName) {
  if (!labName) return 'LAB';
  const firstWord = labName.trim().split(/\s+/)[0];
  return firstWord.toUpperCase().substring(0, 3);
}

// ── LocalStorage controllers for unified labPortalData ─────────
function getStoredData() {
  const defaultData = {
    systemState: { nextSubmissionId: 1001 },
    submissions: [],
    samples: []
  };
  try {
    const data = localStorage.getItem('labPortalData');
    return data ? JSON.parse(data) : defaultData;
  } catch (e) {
    return defaultData;
  }
}

function saveStoredData(data) {
  try {
    localStorage.setItem('labPortalData', JSON.stringify(data));
  } catch (e) {
    console.error('Storage quota exceeded for labPortalData', e);
  }
}
