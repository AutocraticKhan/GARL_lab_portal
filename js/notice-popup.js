/* ============================================================
   notice-popup.js — Periodic dismissible notice popup
   ------------------------------------------------------------
   Controlled by the admin dashboard (Settings tab). The toggle
   and the popup content (title / message / button labels) are
   persisted in the `system_state` table under the `notice_*`
   keys and are re-fetched right before every scheduled show, so
   the admin's on/off switch applies to sessions that are
   already open — no refresh needed.

   Behaviour:
     • When enabled, the popup appears ONCE shortly after the
       dashboard loads (i.e. right after login), then again at
       a RANDOM interval of 10–15 minutes — re-armed with a
       fresh random delay after every dismissal, so the cadence
       is never predictable and users never get spammed.
     • It never blocks work: no full-screen overlay, and it can
       be dismissed with the ✕ button, any action button, or Esc.
     • It never interrupts: shows only when the tab is visible
       and no modal / side panel is open (retries quietly, then
       re-arms if the user stays away for long).

   Debug helpers (append ?noticeDebug=1 to the URL):
     • interval scales down to 10–15 seconds
     • window.__showNoticeNow() — refresh settings + show now
   ============================================================ */
'use strict';

const NOTICE_INTERVAL = { min: 10 * 60 * 1000, max: 15 * 60 * 1000 };
const NOTICE_DEBUG_INTERVAL = { min: 10 * 1000, max: 15 * 1000 };
const NOTICE_RETRY_HIDDEN_MS = 10 * 1000;    // re-check while the tab is hidden
const NOTICE_RETRY_BLOCKED_MS = 15 * 1000;   // re-check while a modal/panel is open
const NOTICE_MAX_HIDDEN_RETRIES = 180;       // ~30 min hidden → give up & re-arm
const NOTICE_MAX_BLOCKED_RETRIES = 20;       // ~5 min blocked → give up & re-arm
const NOTICE_INITIAL_DELAY_MS = 1500;        // grace period so the page finishes rendering first

let noticeTimer = null;
let noticeRetryTimer = null;
let noticeShowing = false;
let noticeEscHandler = null;

// ── Settings helpers ───────────────────────────────────────
function noticeDefaults() {
  return {
    enabled: false,
    title: 'Reminder',
    message: 'This is a reminder from the GARL laboratory portal.',
    btnPrimary: 'Got it',
    btnSecondary: '',
  };
}

function noticeSettings() {
  if (typeof DB !== 'undefined' && DB.systemState && DB.systemState.notice) {
    return DB.systemState.notice;
  }
  return noticeDefaults();
}

function noticeDebugMode() {
  try {
    return new URLSearchParams(window.location.search).has('noticeDebug');
  } catch (e) {
    return false;
  }
}

// Re-read the notice_* keys so the admin's latest toggle /
// content edits are picked up without a page refresh.
async function refreshNoticeSettings() {
  if (typeof supabaseFetch !== 'function' || typeof DB === 'undefined') return;
  try {
    const rows = await supabaseFetch('system_state');
    if (!Array.isArray(rows)) return;
    const stateMap = {};
    rows.forEach(r => { stateMap[r.key] = r.value; });
    if (typeof parseNoticeState === 'function') {
      DB.systemState.notice = parseNoticeState(stateMap);
    }
  } catch (err) {
    // Offline / transient error → keep whatever we already cached.
    console.warn('[NOTICE] Could not refresh notice settings, using cached values:', err.message);
  }
}

// ── Scheduling (random 10–15 min cycle) ────────────────────
function noticeRandomDelay() {
  const range = noticeDebugMode() ? NOTICE_DEBUG_INTERVAL : NOTICE_INTERVAL;
  return range.min + Math.floor(Math.random() * (range.max - range.min + 1));
}

function armNoticePopup() {
  clearTimeout(noticeTimer);
  clearTimeout(noticeRetryTimer);
  noticeTimer = setTimeout(noticeTick, noticeRandomDelay());
}

async function noticeTick() {
  await refreshNoticeSettings(); // honour the admin's latest toggle
  attemptNoticeShow(0);
}
function attemptNoticeShow(retry) {
  if (noticeShowing) return;               // never stack notices
  if (!noticeSettings().enabled) {         // switched off meanwhile
    armNoticePopup();
    return;
  }
  // Wait while the tab is hidden — show once the user comes back.
  if (document.hidden) {
    if (retry >= NOTICE_MAX_HIDDEN_RETRIES) { armNoticePopup(); return; }
    noticeRetryTimer = setTimeout(() => attemptNoticeShow(retry + 1), NOTICE_RETRY_HIDDEN_MS);
    return;
  }
  // Never interrupt data entry — wait while a modal / side panel is open.
  const busy = document.querySelector('.modal-backdrop.open, .side-panel-overlay.open, .side-panel-overlay.active');
  if (busy) {
    if (retry >= NOTICE_MAX_BLOCKED_RETRIES) { armNoticePopup(); return; }
    noticeRetryTimer = setTimeout(() => attemptNoticeShow(retry + 1), NOTICE_RETRY_BLOCKED_MS);
    return;
  }
  showNoticeCard();
}

// ── Rendering (inspired by the quota-warning popup mockup,
//    but non-blocking: card only, no dark backdrop) ─────────
function showNoticeCard(overrideSettings) {
  if (noticeShowing) return null;
  const s = Object.assign({}, noticeDefaults(), noticeSettings(), overrideSettings || {});
  s.title = (s.title || '').trim() || noticeDefaults().title;
  s.message = (s.message || '').trim() || noticeDefaults().message;
  s.btnPrimary = (s.btnPrimary || '').trim() || noticeDefaults().btnPrimary;
  s.btnSecondary = (s.btnSecondary || '').trim();

  const card = document.createElement('div');
  card.className = 'notice-popup';
  card.id = 'notice-popup';
  card.setAttribute('role', 'alertdialog');
  card.setAttribute('aria-live', 'polite');
  card.innerHTML =
    '<div class="notice-popup-icon" aria-hidden="true">🔔</div>' +
    '<div class="notice-popup-body">' +
      '<p class="notice-popup-title"></p>' +
      '<p class="notice-popup-message"></p>' +
      '<div class="notice-popup-actions"></div>' +
    '</div>' +
    '<button type="button" class="notice-popup-close" aria-label="Close notice">✕</button>';

  // textContent — never inject raw HTML from the settings fields.
  card.querySelector('.notice-popup-title').textContent = s.title;
  card.querySelector('.notice-popup-message').textContent = s.message;

  const actions = card.querySelector('.notice-popup-actions');
  const makeBtn = (label, primary) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-sm ' + (primary ? 'btn-primary' : 'btn-ghost');
    b.setAttribute('data-notice-dismiss', '');
    b.textContent = label;
    return b;
  };
  if (s.btnSecondary) actions.appendChild(makeBtn(s.btnSecondary, false));
  actions.appendChild(makeBtn(s.btnPrimary, true));

  noticeShowing = true;
  document.body.appendChild(card);
  requestAnimationFrame(() => card.classList.add('notice-show'));

  // Dismiss wiring: ✕, any action button, or Esc.
  const dismiss = () => dismissNoticeCard(card);
  card.querySelector('.notice-popup-close').addEventListener('click', dismiss);
  card.querySelectorAll('[data-notice-dismiss]').forEach(b => b.addEventListener('click', dismiss));
  noticeEscHandler = (e) => { if (e.key === 'Escape') dismiss(); };
  document.addEventListener('keydown', noticeEscHandler);

  return card;
}

function dismissNoticeCard(card) {
  if (!card || card.dataset.dismissed === '1') return;
  card.dataset.dismissed = '1';
  if (noticeEscHandler) {
    document.removeEventListener('keydown', noticeEscHandler);
    noticeEscHandler = null;
  }
  card.classList.remove('notice-show');
  card.classList.add('notice-hide');
  setTimeout(() => card.remove(), 250);
  noticeShowing = false;
  // Next show gets a fresh random 10–15 min delay.
  armNoticePopup();
}

// ── Bootstrap ──────────────────────────────────────────────
function initNoticePopup() {
  // db.js dispatches `garl:db-ready` once initDB() has loaded data.
  // First popup: shown shortly after login/dashboard load (if the
  // admin has it enabled). Every later popup is armed by
  // attemptNoticeShow() / dismissNoticeCard() with a random
  // 10–15 minute delay.
  const showInitialNotice = () =>
    setTimeout(() => attemptNoticeShow(0), NOTICE_INITIAL_DELAY_MS);
  if (window.__garlDbReady) {
    showInitialNotice();
  } else {
    document.addEventListener('garl:db-ready', showInitialNotice, { once: true });
  }
}

// Debug hook: refresh the settings from the DB, then show
// immediately if the admin has the popup enabled.
window.__showNoticeNow = async function () {
  await refreshNoticeSettings();
  attemptNoticeShow(0);
};

initNoticePopup();