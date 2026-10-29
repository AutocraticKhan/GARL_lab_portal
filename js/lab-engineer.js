
/* ============================================================
   lab-engineer.js — Lab Engineer dashboard logic
   (Grouped by submission — checkbox completion, no file upload)
   ============================================================ */
'use strict';

let engSession = null;
let activeSubmissionId = null;
let activeReportNo = null; // current report number (used for PDF filename)
let activeReportType = null; // current report type: 'pnac' or 'qscert'
let activeFullSubmissionId = null; // full submission ID e.g. "26-07-AAS-1041"
let activeReopenSampleId = null; // sample loaded in the reopen/reanalyse modal

// UI-only preference: samples excluded from the printed spectroscopy datasheet.
// Shape: { "<fullSubmissionId>": ["smp-abc123", ...] } — scoped per submission
// so hiding samples in one datasheet never affects another submission.
const HIDDEN_SAMPLES_STORAGE_KEY = 'garl_hidden_spectro_samples';
let activeSpectroFullId = null; // full submission ID of the open datasheet
let activeSpectroPages  = null; // live (non-print) pages container
let activeSpectroFooter = null; // live footer element holding the hidden count

// Same feature for the PNAC/QSCert report form. Reports are scoped per
// submission AND report type, so hiding in PNAC never affects QSCert.
let activeReportHiddenKey = null; // "<fullSubmissionId>::<reportType>"
let activeReportPages     = null; // live (non-print) report container
let activeReportFooter    = null; // live footer element holding the hidden count

function loadHiddenSampleMap() {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_SAMPLES_STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function getHiddenSamplesFor(fullSubmissionId) {
  if (!fullSubmissionId) return [];
  const map = loadHiddenSampleMap();
  return Array.isArray(map[fullSubmissionId]) ? map[fullSubmissionId] : [];
}

function setHiddenSamplesFor(fullSubmissionId, ids) {
  if (!fullSubmissionId) return;
  const map = loadHiddenSampleMap();
  const clean = [...new Set(ids || [])];
  if (clean.length > 0) {
    map[fullSubmissionId] = clean;
  } else {
    delete map[fullSubmissionId];
  }
  try {
    localStorage.setItem(HIDDEN_SAMPLES_STORAGE_KEY, JSON.stringify(map));
  } catch (e) { /* storage unavailable — hide state just won't persist */ }
}

/**
 * Escape a value for use inside a quoted HTML attribute.
 * NB: escHtml() in utils.js is a no-op in this repo (its entities were decoded),
 * so attribute values must be escaped here rather than relying on it.
 */
function escAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Max element columns per printed report page (A4 portrait width limit).
// Reports with more elements are split across multiple .report-page divs;
// the print CSS already applies page-break-after: always to each .report-page.
const REPORT_ELEMENTS_PER_PAGE = 7;

// ── Init ──────────────────────────────────────────────────────
async function initLabEngineer() {
  engSession = requireAuth('lab_engineer');
  if (!engSession) return;
  await initDB();
  renderSidebarUser();
  wireLabEngineerLabName();
  wireLogout();
  switchEngTab('eng-tab-assigned');
  wireEngEvents();
}

function wireLabEngineerLabName() {
  const lab = getLab(engSession.lab_id);
  const el  = document.getElementById('eng-lab-name');
  if (el && lab) el.textContent = lab.lab_name;
}

// ── Tab switching ─────────────────────────────────────────────
async function switchEngTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const btn   = document.querySelector(`[data-tab="${tabId}"]`);
  const panel = document.getElementById(tabId);
  if (btn) btn.classList.add('active');
  if (panel) panel.classList.add('active');

  // Pull the latest samples so a resubmission made by reception shows up
  // immediately without a page reload. Falls back to the cache when offline.
  if (tabId === 'eng-tab-assigned' || tabId === 'eng-tab-returned' || tabId === 'eng-tab-completed') {
    try {
      await refreshTable('samples');
    } catch (err) {
      console.warn('[LAB] Could not refresh samples, using cached data:', err.message);
    }
  }

  renderLabStats();
  if (tabId === 'eng-tab-assigned')  renderAssignedSamples();
  if (tabId === 'eng-tab-returned')  renderReturnedSubmissions();
  if (tabId === 'eng-tab-completed') renderCompletedReports();
}

// ── Wire events ───────────────────────────────────────────────
function wireEngEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchEngTab(btn.dataset.tab));
  });

  // Side panel close
  document.getElementById('close-sample-panel').addEventListener('click', () => closePanel('sample-panel-overlay'));
  document.getElementById('sample-panel-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('sample-panel-overlay')) closePanel('sample-panel-overlay');
  });

  // Mark all complete button (in panel footer)
  document.getElementById('btn-mark-all-complete').addEventListener('click', handleMarkAllComplete);

  // ── Return-to-reception wiring ──
  const returnBtn = document.getElementById('btn-return-to-reception');
  if (returnBtn) returnBtn.addEventListener('click', () => openReturnModal(activeSubmissionId));

  const closeReturnBtn = document.getElementById('close-return-modal');
  if (closeReturnBtn) closeReturnBtn.addEventListener('click', () => closeModal('modal-return-sample'));
  const cancelReturnBtn = document.getElementById('cancel-return-modal');
  if (cancelReturnBtn) cancelReturnBtn.addEventListener('click', () => closeModal('modal-return-sample'));

  const returnOverlay = document.getElementById('modal-return-sample');
  if (returnOverlay) {
    returnOverlay.addEventListener('click', (e) => {
      if (e.target === returnOverlay) closeModal('modal-return-sample');
    });
  }

  const returnReasonSel = document.getElementById('return-reason-select');
  if (returnReasonSel) returnReasonSel.addEventListener('change', toggleReturnOtherField);

  const confirmReturnBtn = document.getElementById('btn-confirm-return');
  if (confirmReturnBtn) confirmReturnBtn.addEventListener('click', handleReturnSubmit);

  const returnSelectAll = document.getElementById('return-select-all');
  if (returnSelectAll) {
    returnSelectAll.addEventListener('change', () => {
      document.querySelectorAll('#return-samples-list input[type="checkbox"]').forEach(chk => {
        if (!chk.disabled) chk.checked = returnSelectAll.checked;
      });
    });
  }

  // ── Reopen / reanalyse wiring (completed → pending) ──
  const closeReanalyseBtn = document.getElementById('close-reanalyse-modal');
  if (closeReanalyseBtn) closeReanalyseBtn.addEventListener('click', () => closeModal('modal-reanalyse-sample'));
  const cancelReanalyseBtn = document.getElementById('cancel-reanalyse-modal');
  if (cancelReanalyseBtn) cancelReanalyseBtn.addEventListener('click', () => closeModal('modal-reanalyse-sample'));

  const reanalyseOverlay = document.getElementById('modal-reanalyse-sample');
  if (reanalyseOverlay) {
    reanalyseOverlay.addEventListener('click', (e) => {
      if (e.target === reanalyseOverlay) closeModal('modal-reanalyse-sample');
    });
  }

  const reanalyseReasonSel = document.getElementById('reanalyse-reason-select');
  if (reanalyseReasonSel) reanalyseReasonSel.addEventListener('change', toggleReanalyseOtherField);

  const confirmReanalyseBtn = document.getElementById('btn-confirm-reanalyse');
  if (confirmReanalyseBtn) confirmReanalyseBtn.addEventListener('click', handleReopenSubmit);

  // Report modal close
  document.getElementById('close-report-panel').addEventListener('click', () => closePanel('report-overlay'));
  document.getElementById('report-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('report-overlay')) closePanel('report-overlay');
  });

  // MU report modal close
  document.getElementById('close-mu-report-panel').addEventListener('click', () => closePanel('mu-report-overlay'));
  document.getElementById('mu-report-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('mu-report-overlay')) closePanel('mu-report-overlay');
  });

  // ── Uncertainty parameters popup (⚙) ──
  const closeMuParamsBtn = document.getElementById('close-mu-params-modal');
  if (closeMuParamsBtn) closeMuParamsBtn.addEventListener('click', () => closeModal('modal-mu-params'));
  const cancelMuParamsBtn = document.getElementById('cancel-mu-params-modal');
  if (cancelMuParamsBtn) cancelMuParamsBtn.addEventListener('click', () => closeModal('modal-mu-params'));
  const resetMuParamsBtn = document.getElementById('reset-mu-params-modal');
  if (resetMuParamsBtn) resetMuParamsBtn.addEventListener('click', resetMUParamsToDefaults);
  const applyMuParamsBtn = document.getElementById('apply-mu-params-modal');
  if (applyMuParamsBtn) applyMuParamsBtn.addEventListener('click', applyMUParams);

  const muParamsOverlay = document.getElementById('modal-mu-params');
  if (muParamsOverlay) {
    muParamsOverlay.addEventListener('click', (e) => {
      if (e.target === muParamsOverlay) closeModal('modal-mu-params');
    });
  }

  ['mup-rbar', 'mup-sr', 'mup-n', 'mup-ucert', 'mup-k'].forEach(function(id) {
    const inp = document.getElementById(id);
    if (inp) inp.addEventListener('input', updateMUParamsPreview);
  });

  // Spectroscopy modal close
  document.getElementById('close-spectroscopy-panel').addEventListener('click', () => closePanel('spectroscopy-overlay'));
  document.getElementById('spectroscopy-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('spectroscopy-overlay')) closePanel('spectroscopy-overlay');
  });

  // Instrument toggle labels (use event delegation since labels are dynamically created)
  document.getElementById('spectroscopy-overlay').addEventListener('click', function(e) {
    const label = e.target.closest('.inst-label');
    if (label) {
      const inst = label.getAttribute('data-inst');
      toggleInstrument(inst);
    }
  });

  // Assigned samples search
  document.getElementById('assigned-search').addEventListener('input', debounce(renderAssignedSamples, 250));
}

// ── Lab stats row ─────────────────────────────────────────────
function renderLabStats() {
  const allSamples = getSamplesForLab(engSession.lab_id);

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setText('stat-total', allSamples.length);
  setText('stat-assigned', allSamples.filter(isSampleActionable).length);
  setText('stat-progress', allSamples.filter(s => s.status === 'in_progress').length);
  setText('stat-done', allSamples.filter(isSampleDone).length);
  setText('stat-returned', allSamples.filter(isSampleReturned).length);
}

// ── Assigned Samples (Grouped by Submission) ─────────────────
function renderAssignedSamples() {
  const query = (document.getElementById('assigned-search').value || '').toLowerCase();
  const tbody = document.getElementById('assigned-tbody');
  const lab   = getLab(engSession.lab_id);

  renderLabStats();

  // Only submissions that still have at least one sample for this lab to work on
  let submissions = getSubmissionsForLab(engSession.lab_id)
    .filter(sub => sub.samples.some(isSampleActionable))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Banner: samples sent back and now waiting on reception
  const banner = document.getElementById('assigned-returned-banner');
  if (banner) {
    const returnedCount = getSamplesForLab(engSession.lab_id).filter(isSampleReturned).length;
    if (returnedCount > 0) {
      banner.style.display = 'block';
      banner.innerHTML = '↩ <strong>' + returnedCount + '</strong> sample(s) from this lab are waiting on reception review. ' +
        '<button class="btn btn-ghost btn-sm" style="margin-left:8px;" onclick="switchEngTab(\'eng-tab-returned\')">View Returned</button>';
    } else {
      banner.style.display = 'none';
    }
  }

  if (query) {
    submissions = submissions.filter(sub =>
      sub.submissionId?.toLowerCase().includes(query) ||
      sub.customer_name?.toLowerCase().includes(query) ||
      sub.test_name?.toLowerCase().includes(query) ||
      sub.firstSampleId?.toLowerCase().includes(query) ||
      sub.lastSampleId?.toLowerCase().includes(query)
    );
  }

  if (!submissions.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🎉</div><p>No pending submissions' + (query ? ' matching your search' : '') + '</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = submissions.map(sub => {
    const firstSample = sub.samples[0];
    const test = firstSample ? getTest(firstSample.test_id) : null;
    const overdue = test && daysBetween(sub.created_at, new Date()) > Number(test.turnaround_days);

    let sampleRange = '—';
    if (sub.sampleCount === 1) {
      sampleRange = escHtml(sub.firstSampleId);
    } else if (sub.firstSampleId && sub.lastSampleId) {
      const firstParts = sub.firstSampleId.split('-');
      const lastParts  = sub.lastSampleId.split('-');
      const prefix = firstParts.slice(0, -1).join('-');
      const firstSeq = firstParts[firstParts.length - 1];
      const lastSeq  = lastParts[lastParts.length - 1];
      if (firstSeq && lastSeq && firstSeq !== lastSeq) {
        sampleRange = escHtml(prefix) + '-<strong>' + firstSeq + ' to ' + lastSeq + '</strong>';
      } else {
        sampleRange = escHtml(sub.firstSampleId);
      }
    }

    return '<tr class="clickable" onclick="openSubmissionPanel(\'' + sub.submissionId + '\')">' +
      '<td><strong style="color:var(--clr-primary)">#' + escHtml(sub.submissionId) + '</strong></td>' +
      '<td>' + escHtml(sub.customer_name || '—') + '</td>' +
      '<td class="muted">' + escHtml(sub.test_name || '—') + '</td>' +
      '<td style="text-align:center;font-weight:600;">' + sub.sampleCount + '</td>' +
      '<td style="font-size:0.75rem;font-family:monospace;color:var(--txt-secondary);">' + sampleRange + '</td>' +
      '<td>' + statusBadge(sub.statusSummary) +
        (sub.hasReturned ? ' <span class="badge badge-returned" title="Samples waiting on reception review">↩ ' + sub.returnedCount + '</span>' : '') +
      '</td>' +
      '<td>' + (overdue ? '<span class="badge badge-danger" style="background:rgba(239,68,68,0.1);color:#dc2626;border:1px solid rgba(239,68,68,0.2);">⚠ Overdue</span>' : '<span style="color:var(--txt-muted);font-size:0.8rem;">On track</span>') + '</td>' +
    '</tr>';
  }).join('');
}

// ── Completed Reports (Grouped by Submission) ─────────────────
function renderCompletedReports() {
  const tbody = document.getElementById('completed-tbody');
  const submissions = getSubmissionsForLab(engSession.lab_id)
    .filter(sub => sub.samples.length > 0 && sub.samples.every(isSampleDone))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (!submissions.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📄</div><p>No completed submissions yet</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = submissions.map(sub => {
    const subReports = getReportsForSubmission(sub.submissionId);
    const reportNumbers = subReports.map(r => r.report_number).filter(Boolean).join(', ');

    // Archived samples have no completed_at — fall back to archived_at
    const completedDates = sub.samples
      .map(s => s.completed_at || s.archived_at)
      .filter(Boolean)
      .sort()
      .reverse();
    const completedDate = completedDates[0] || sub.created_at;

    let sampleRange = '—';
    if (sub.sampleCount === 1) {
      sampleRange = escHtml(sub.firstSampleId);
    } else if (sub.firstSampleId && sub.lastSampleId) {
      const firstParts = sub.firstSampleId.split('-');
      const lastParts  = sub.lastSampleId.split('-');
      const prefix = firstParts.slice(0, -1).join('-');
      const firstSeq = firstParts[firstParts.length - 1];
      const lastSeq  = lastParts[lastParts.length - 1];
      if (firstSeq && lastSeq && firstSeq !== lastSeq) {
        sampleRange = escHtml(prefix) + '-<strong>' + firstSeq + ' to ' + lastSeq + '</strong>';
      } else {
        sampleRange = escHtml(sub.firstSampleId);
      }
    }

    return '<tr class="clickable" onclick="openSubmissionPanel(\'' + sub.submissionId + '\')">' +
      '<td><strong style="color:var(--clr-primary)">#' + escHtml(sub.submissionId) + '</strong></td>' +
      '<td>' + escHtml(sub.customer_name || '—') + '</td>' +
      '<td class="muted">' + escHtml(sub.test_name || '—') + '</td>' +
      '<td style="text-align:center;font-weight:600;">' + sub.sampleCount + '</td>' +
      '<td style="font-size:0.75rem;font-family:monospace;color:var(--txt-secondary);">' + sampleRange + '</td>' +
      '<td>' + statusBadge(sub.statusSummary) +
        (sub.hasArchived ? ' <span class="badge badge-archived" title="' + sub.archivedCount + ' sample(s) archived without analysis">🗄️ ' + sub.archivedCount + '</span>' : '') +
      '</td>' +
      '<td><code style="font-size:0.75rem;color:var(--clr-accent)">' + escHtml(reportNumbers || '—') + '</code></td>' +
      '<td class="muted">' + formatDate(completedDate) + '</td>' +
    '</tr>';
  }).join('');
}

// ─ Returned to Reception (read-only, for the lab's own records) ──
function renderReturnedSubmissions() {
  const tbody = document.getElementById('returned-tbody');
  if (!tbody) return;

  const submissions = groupSamplesBySubmission(getSamplesForLab(engSession.lab_id).filter(isSampleReturned))
    .sort((a, b) => new Date(b.latestReturnedAt || b.created_at) - new Date(a.latestReturnedAt || a.created_at));

  if (!submissions.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">↩</div><p>No samples have been returned to reception from this lab</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = submissions.map(sub => {
    const reasons = [...new Set(sub.returnedSamples.map(s => s.return_reason).filter(Boolean))];
    const sampleList = sub.returnedSamples
      .map(s => s.sampleId || s.sampleNumber || s.id)
      .slice(0, 3)
      .join(', ') + (sub.returnedSamples.length > 3 ? ' +' + (sub.returnedSamples.length - 3) + ' more' : '');

    return '<tr class="clickable" onclick="openSubmissionPanel(\'' + sub.submissionId + '\')">' +
      '<td><strong style="color:var(--clr-primary)">#' + escHtml(sub.submissionId) + '</strong></td>' +
      '<td>' + escHtml(sub.customer_name || '—') + '</td>' +
      '<td style="text-align:center;font-weight:600;">' + sub.returnedCount + '</td>' +
      '<td style="font-size:0.75rem;font-family:monospace;color:var(--txt-secondary);">' + escHtml(sampleList) + '</td>' +
      '<td style="font-size:0.78rem;color:#b45309;">' + escHtml(reasons.join(' · ') || '—') + '</td>' +
      '<td class="muted" style="font-size:0.75rem;">' + escHtml([...new Set(sub.returnedSamples.map(s => s.returned_by).filter(Boolean))].join(', ') || '—') + '</td>' +
      '<td class="muted" style="font-size:0.75rem;">' + (sub.latestReturnedAt ? formatDateTime(sub.latestReturnedAt) : '—') + '</td>' +
    '</tr>';
  }).join('');
}

// ── Side Panel (Submission-level detail with checkboxes) ──
function openSubmissionPanel(submissionId) {
  activeSubmissionId = submissionId;

  const submissions = getSubmissionsForLab(engSession.lab_id);
  const sub = submissions.find(s => s.submissionId === submissionId);
  if (!sub) return;

  const sortedSamples = [...sub.samples].sort((a, b) => {
    const aSeq = (a.sampleId || '').split('-').pop() || '';
    const bSeq = (b.sampleId || '').split('-').pop() || '';
    return aSeq.localeCompare(bSeq, undefined, { numeric: true });
  });

  const lab = getLab(sub.lab_id);
  const firstSample = sortedSamples[0];
  const addrInfo = splitAddressNote(firstSample?.customer_address);
  const test = firstSample ? getTest(firstSample.test_id) : null;

  let sampleRange = '—';
  if (sub.sampleCount === 1) {
    sampleRange = sub.firstSampleId;
  } else if (sub.firstSampleId && sub.lastSampleId) {
    const firstParts = sub.firstSampleId.split('-');
    const lastParts  = sub.lastSampleId.split('-');
    const prefix = firstParts.slice(0, -1).join('-');
    const firstSeq = firstParts[firstParts.length - 1];
    const lastSeq  = lastParts[lastParts.length - 1];
    if (firstSeq && lastSeq && firstSeq !== lastSeq) {
      sampleRange = prefix + '-' + firstSeq + ' to ' + lastSeq;
    } else {
      sampleRange = sub.firstSampleId;
    }
  }

  document.getElementById('panel-sample-number').textContent = 'Submission #' + sub.submissionId + ' (' + sub.sampleCount + ' samples)';

  const statusCounts = {};
  sortedSamples.forEach(s => {
    statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
  });
  const statusSummaryStr = Object.entries(statusCounts)
    .map(([st, cnt]) => st.replace('_', ' ') + ': ' + cnt)
    .join(' · ');

  const allDone = sortedSamples.length > 0 && sortedSamples.every(isSampleDone);
  const actionableSamples = sortedSamples.filter(isSampleActionable);
  const returnableSamples = sortedSamples.filter(s => !isSampleDone(s) && !isSampleReturned(s));

  const sampleRows = sortedSamples.map(s => {
    const elements = s.selectedElements || [];
    const testForSample = s.test_id ? getTest(s.test_id) : null;
    const requiresElems = testForSample ? testForSample.requires_elements !== false : true;
    const elementLabels = elements.length > 0
      ? elements.map(el => {
          const info = getElementInfo(el);
          const sym = normalizeElementSymbol(el);
          return info ? sym + ' (' + info.name + ')' : sym;
        }).join(', ')
      : (requiresElems ? '—' : 'No elements required');
    const isCompleted = s.status === 'completed';
    const isArchived  = isSampleArchived(s);
    const isReturned  = isSampleReturned(s);
    const isDone      = isSampleDone(s);
    const canReturn   = !isDone && !isReturned;
    const sampleIdLabel = s.sampleId || s.sampleNumber || s.sampleName || '—';

    const rowBg = isArchived ? 'rgba(100,116,139,0.08)'
                : isReturned ? 'rgba(245,158,11,0.08)'
                : isCompleted ? 'rgba(16,185,129,0.05)'
                : 'var(--clr-surface)';

    const statusCell = isArchived
      ? '<span style="font-size:0.72rem;color:var(--txt-secondary);font-weight:600;">🗄️ Archived</span>'
      : isReturned
        ? '<span style="font-size:0.72rem;color:#b45309;font-weight:600;">↩ Awaiting reception</span>'
        : isCompleted
          ? '<span style="font-size:0.72rem;color:var(--clr-success);font-weight:600;">✓ Complete</span>'
          : statusBadge(s.status);

    return '<div class="submission-sample-row" data-sample-id="' + s.id + '" style="border:1px solid var(--clr-border);border-radius:var(--r-md);padding:var(--sp-3);margin-bottom:var(--sp-2);background:' + rowBg + ';">' +
      '<div style="display:flex;align-items:flex-start;gap:var(--sp-3);">' +
        '<div style="padding-top:2px;">' +
          '<input type="checkbox" class="sample-complete-chk" data-sample-id="' + s.id + '" ' +
                 (isCompleted ? 'checked' : '') + ' ' +
                 (isDone || isReturned ? 'disabled title="This sample is no longer being analysed here"' : '') + ' ' +
                 'onchange="toggleSampleComplete(\'' + s.id + '\', this.checked)" ' +
                 'style="width:18px;height:18px;cursor:pointer;accent-color:var(--clr-success);" />' +
        '</div>' +
        '<div style="flex:1;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-1);gap:8px;flex-wrap:wrap;">' +
            '<div>' +
              '<span style="font-weight:600;font-family:monospace;font-size:0.85rem;color:' + (isCompleted ? 'var(--clr-success)' : 'var(--clr-primary)') + ';">' + escHtml(sampleIdLabel) + '</span>' +
              '<span style="margin-left:var(--sp-2);font-size:0.72rem;color:var(--txt-muted);">' + escHtml(s.sampleType || '—') + '</span>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              statusCell +
              (canReturn ? '<button class="btn btn-ghost btn-sm" title="Send this sample back to reception" onclick="openReturnModal(\'' + sub.submissionId + '\', \'' + s.id + '\')" style="color:#b45309;">↩ Return</button>' : '') +
              (isCompleted ? '<button class="btn btn-ghost btn-sm" title="Reopen this sample back to pending (free within ' + REOPEN_FREE_WINDOW_DAYS + ' days of completion)" onclick="openReopenModal(\'' + s.id + '\')" style="color:var(--clr-primary);">↺ Reopen</button>' : '') +
            '</div>' +
          '</div>' +
          '<div style="font-size:0.75rem;color:var(--txt-secondary);">' +
            '<span><strong>Elements (' + elements.length + '):</strong> ' + escHtml(elementLabels) + '</span>' +
          '</div>' +
          (isCompleted ? (function() {
            const win = getReopenWindowInfo(s);
            const style = win.withinWindow
              ? 'margin-top:6px;font-size:0.75rem;color:#047857;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25);border-radius:var(--r-sm);padding:4px 8px;'
              : 'margin-top:6px;font-size:0.75rem;color:#b45309;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:var(--r-sm);padding:4px 8px;';
            const winTxt = win.withinWindow
              ? '<strong>Completed:</strong> ' + formatDateTime(s.completed_at) + ' · free reopen available until ' + formatDateTime(win.deadline.toISOString())
              : '<strong>Completed:</strong> ' + formatDateTime(s.completed_at) + ' · ' + REOPEN_FREE_WINDOW_DAYS + '-day window passed — reopening now requires a reason';
            return '<div style="' + style + '">↺ ' + winTxt + '</div>';
          })() : '') +
          (function() {
            const lastReanalyse = getEventsForSample(s.id).filter(e => e.type === 'reanalyse').pop();
            if (!lastReanalyse) return '';
            return '<div style="margin-top:6px;font-size:0.75rem;color:#4338ca;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.25);border-radius:var(--r-sm);padding:4px 8px;">' +
              '<strong>Reanalyse:</strong> ' + escHtml(lastReanalyse.note || 'No reason given') +
              (lastReanalyse.timestamp ? ' · ' + formatDateTime(lastReanalyse.timestamp) : '') +
            '</div>';
          })() +
          (isReturned ? '<div style="margin-top:6px;font-size:0.75rem;color:#b45309;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:var(--r-sm);padding:4px 8px;">' +
            '<strong>Returned:</strong> ' + escHtml(s.return_reason || 'No reason given') +
            (s.returned_by ? ' · by ' + escHtml(s.returned_by) : '') +
            (s.returned_at ? ' · ' + formatDateTime(s.returned_at) : '') +
            ((Number(s.return_count) || 0) > 1 ? ' · returned ' + s.return_count + '×' : '') +
          '</div>' : '') +
          (isArchived ? '<div style="margin-top:6px;font-size:0.75rem;color:var(--txt-secondary);background:rgba(100,116,139,0.1);border:1px solid rgba(100,116,139,0.25);border-radius:var(--r-sm);padding:4px 8px;">' +
            '<strong>Archived:</strong> ' + escHtml(s.archive_reason || 'No reason given') +
            (s.archived_by ? ' · by ' + escHtml(s.archived_by) : '') +
            (s.archived_at ? ' · ' + formatDateTime(s.archived_at) : '') +
          '</div>' : '') +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  document.getElementById('panel-body').innerHTML =
    '<div style="margin-bottom:var(--sp-5);">' +
      '<div style="display:flex;align-items:center;gap:var(--sp-3);margin-bottom:var(--sp-4);flex-wrap:wrap;">' +
        statusBadge(sub.statusSummary) +
        '<span style="font-size:0.78rem;color:var(--txt-muted);">' + statusSummaryStr + '</span>' +
        (allDone ? '<span style="font-size:0.72rem;background:rgba(16,185,129,0.1);color:#059669;padding:2px 10px;border-radius:12px;font-weight:600;">All Complete ✓</span>' : '') +
        (sub.hasReturned ? '<span style="font-size:0.72rem;background:rgba(245,158,11,0.12);color:#b45309;padding:2px 10px;border-radius:12px;font-weight:600;">↩ ' + sub.returnedCount + ' with reception</span>' : '') +
        (sub.hasArchived ? '<span style="font-size:0.72rem;background:rgba(100,116,139,0.12);color:#475569;padding:2px 10px;border-radius:12px;font-weight:600;">🗄️ ' + sub.archivedCount + ' archived</span>' : '') +
      '</div>' +

      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--sp-3);margin-bottom:var(--sp-3);padding:var(--sp-4);background:var(--clr-bg-3);border-radius:var(--r-lg);border:1px solid var(--clr-border);">' +
        '<div class="detail-row"><span class="detail-label">Submission ID</span><span class="detail-value" style="font-size:1.05rem;font-weight:700;color:var(--clr-primary);">#' + escHtml(sub.submissionId) + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Number of Samples</span><span class="detail-value" style="font-size:1.05rem;font-weight:700;">' + sub.sampleCount + '</span></div>' +
        '<div class="detail-row" style="grid-column:1/-1;"><span class="detail-label">Sample ID Range</span><span class="detail-value" style="font-family:monospace;font-size:0.9rem;font-weight:600;">' + escHtml(sampleRange) + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Client Name</span><span class="detail-value">' + escHtml(sub.customer_name || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Client Contact</span><span class="detail-value">' + escHtml(firstSample?.customer_contact || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">CNIC</span><span class="detail-value">' + escHtml(firstSample?.cnic || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Address</span><span class="detail-value">' + escHtml(addrInfo.address || '—') + '</span></div>' +
        '<div class="detail-row" style="grid-column:1/-1;"><span class="detail-label">Note</span><span class="detail-value">' + escHtml(addrInfo.note || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Sample Location</span><span class="detail-value">' + escHtml(firstSample?.sample_location || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Lab</span><span class="detail-value">' + escHtml(lab?.lab_name || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Test</span><span class="detail-value">' + escHtml(test?.test_name || sub.test_name || '—') + (test ? ' <code style="font-size:0.75rem;color:var(--clr-accent)">' + test.test_code + '</code>' : '') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Collected</span><span class="detail-value">' + formatDate(sub.created_at) + '</span></div>' +
      '</div>' +

      (test && test.requires_elements !== false ?
      (function() {
        // Check which report types are already saved for this submission
        var fullSubId = getFullSubmissionId(sub);
        var savedReports = getSavedReportsForSubmission(fullSubId);
        var pnacSaved = savedReports.some(function(r) { return r.report_type === 'pnac'; });
        var qscertSaved = savedReports.some(function(r) { return r.report_type === 'qscert'; });
        var tickStyle = 'color:#059669;font-weight:700;font-size:0.72rem;margin-left:auto;background:rgba(16,185,129,0.1);padding:2px 6px;border-radius:8px;';
        return '<div style="margin-bottom:var(--sp-4);display:flex;gap:10px;">' +
          '<button onclick="openSpectroscopyForm(\'' + sub.submissionId + '\')" class="btn btn-primary" style="display:flex;align-items:center;gap:6px;width:48%;justify-content:center;padding:10px 6px;background:linear-gradient(135deg,#6366f1,#4f46e5);border:none;color:#fff;font-weight:600;border-radius:var(--r-md);cursor:pointer;font-size:0.78rem;">' +
            '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:16px;height:16px;flex-shrink:0;">' +
              '<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />' +
            '</svg>' +
            '📋 Spectroscopy' +
          '</button>' +
          '<div style="position:relative;width:48%;">' +
            '<button onclick="toggleReportDropdown(\'' + sub.submissionId + '\')" class="btn btn-primary" style="display:flex;align-items:center;gap:6px;width:100%;justify-content:center;padding:10px 6px;background:linear-gradient(135deg,#059669,#047857);border:none;color:#fff;font-weight:600;border-radius:var(--r-md);cursor:pointer;font-size:0.78rem;">' +
              '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:16px;height:16px;flex-shrink:0;">' +
                '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />' +
              '</svg>' +
              '📄 Generate Report' +
              '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px;flex-shrink:0;">' +
                '<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />' +
              '</svg>' +
            '</button>' +
            '<div id="report-dropdown-' + sub.submissionId + '" style="display:none;position:absolute;top:100%;left:0;right:0;margin-top:4px;background:#fff;border:1px solid var(--clr-border);border-radius:var(--r-md);box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:1000;overflow:hidden;">' +
              '<button onclick="openReportForm(\'' + sub.submissionId + '\',\'pnac\')" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;border:none;background:transparent;cursor:pointer;font-size:0.78rem;color:var(--txt-primary);text-align:left;transition:background 0.15s;" onmouseover="this.style.background=\'#f0fdf4\'" onmouseout="this.style.background=\'transparent\'">' +
                '<span style="font-size:1rem;">🛡️</span> PNAC Report' +
                (pnacSaved ? '<span style="' + tickStyle + '">✓ Saved</span>' : '') +
              '</button>' +
              '<button onclick="openReportForm(\'' + sub.submissionId + '\',\'qscert\')" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 12px;border:none;background:transparent;cursor:pointer;font-size:0.78rem;color:var(--txt-primary);text-align:left;transition:background 0.15s;border-top:1px solid var(--clr-border);" onmouseover="this.style.background=\'#f0fdf4\'" onmouseout="this.style.background=\'transparent\'">' +
                '<span style="font-size:1rem;">✅</span> QSCert Report' +
                (qscertSaved ? '<span style="' + tickStyle + '">✓ Saved</span>' : '') +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      })() : '') +

      '<div>' +
        '<div style="display:flex;align-items:center;margin-bottom:var(--sp-3);">' +
          '<div style="font-size:0.8rem;font-weight:600;color:var(--txt-secondary);text-transform:uppercase;letter-spacing:0.04em;">Samples in this Submission</div>' +
        '</div>' +
        '<div id="submission-samples-list">' +
          sampleRows +
        '</div>' +
      '</div>' +
    '</div>';

  // Show/hide the panel footer actions
  const markAllBtn = document.getElementById('btn-mark-all-complete');
  if (markAllBtn) {
    if (actionableSamples.length > 0) {
      markAllBtn.style.display = 'flex';
      markAllBtn.textContent = '✓ Mark All Complete (' + actionableSamples.length + ')';
    } else {
      markAllBtn.style.display = 'none';
    }
  }

  const returnToRecBtn = document.getElementById('btn-return-to-reception');
  if (returnToRecBtn) {
    if (returnableSamples.length > 0) {
      returnToRecBtn.style.display = 'flex';
      returnToRecBtn.textContent = '↩ Return to Reception (' + returnableSamples.length + ')';
    } else {
      returnToRecBtn.style.display = 'none';
    }
  }

  openPanel('sample-panel-overlay');
}

// ── Toggle a single sample's completion ────────────────────────
async function toggleSampleComplete(sampleId, checked) {
  const target = getSample(sampleId);
  if (target && (isSampleReturned(target) || isSampleArchived(target))) {
    showToast('This sample is no longer being analysed here. Reception is reviewing it.', 'warning');
    if (activeSubmissionId) openSubmissionPanel(activeSubmissionId);
    return;
  }
  try {
    if (checked) {
      await setSampleStatus(sampleId, 'completed', 'Sample completed by ' + engSession.full_name);
    } else if (target && target.status === 'completed') {
      // Completed samples must go through the reopen/reanalyse flow so
      // the 3-day window and reason rules are always enforced.
      if (activeSubmissionId) openSubmissionPanel(activeSubmissionId);
      openReopenModal(sampleId);
      return;
    } else {
      await setSampleStatus(sampleId, 'assigned', 'Sample reopened by ' + engSession.full_name);
    }
    showToast(checked ? 'Sample marked as complete.' : 'Sample reopened.', 'success');
    renderLabStats();
    renderAssignedSamples();
    if (activeSubmissionId) openSubmissionPanel(activeSubmissionId);
  } catch (err) {
    showToast('Error updating sample: ' + err.message, 'error');
  }
}

// ── Mark All Complete (button in footer) ───────────────────────
async function handleMarkAllComplete() {
  if (!activeSubmissionId) return;

  const submissions = getSubmissionsForLab(engSession.lab_id);
  const sub = submissions.find(s => s.submissionId === activeSubmissionId);
  if (!sub) return;

  // Returned and archived samples are not part of this lab's work any more.
  const incomplete = sub.samples.filter(isSampleActionable);
  if (!incomplete.length) {
    showToast('No samples here are waiting for analysis.', 'info');
    return;
  }

  const btn = document.getElementById('btn-mark-all-complete');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

  let successCount = 0;
  let errorCount = 0;
  for (const sample of incomplete) {
    try {
      await setSampleStatus(sample.id, 'completed', 'Sample completed by ' + engSession.full_name + ' (bulk)');
      successCount++;
    } catch (err) {
      errorCount++;
    }
  }

  if (btn) { btn.disabled = false; btn.style.display = 'none'; }

  if (errorCount === 0) {
    showToast('All ' + successCount + ' samples marked complete!', 'success');
  } else {
    showToast(successCount + ' completed, ' + errorCount + ' failed.', 'warning');
  }

  renderLabStats();
  renderAssignedSamples();
  if (activeSubmissionId) openSubmissionPanel(activeSubmissionId);
}

/* ============================================================
   REOPEN / REANALYSE  (completed → pending)
   ------------------------------------------------------------
   Free (no reason) for REOPEN_FREE_WINDOW_DAYS after completion;
   after that a reason is mandatory. See reopenSampleForReanalysis().
   ============================================================ */

/**
 * Open the "reopen for reanalysis" modal for a completed sample.
 * Inside the free window the reason group is hidden (confirmation
 * only); once the window has passed the reason becomes required.
 * @param {string} sampleId
 */
function openReopenModal(sampleId) {
  const sample = getSample(sampleId);
  if (!sample) { showToast('Sample not found. Refresh and try again.', 'error'); return; }
  if (sample.status !== 'completed') {
    showToast('Only samples marked complete can be reopened.', 'warning');
    return;
  }

  activeReopenSampleId = sampleId;
  const info    = getReopenWindowInfo(sample);
  const idLabel = sample.sampleId || sample.sampleNumber || sample.sampleName || sample.id;

  const infoEl = document.getElementById('reanalyse-modal-info');
  if (infoEl) {
    infoEl.textContent = 'Sample ' + idLabel + ' was completed on ' + formatDateTime(sample.completed_at) +
      '. Reopening sends it back to the pending queue for reanalysis.';
  }

  const banner = document.getElementById('reanalyse-window-banner');
  const reasonGroup = document.getElementById('reanalyse-reason-group');
  if (info.withinWindow) {
    if (banner) {
      banner.style.display = 'block';
      banner.style.background = 'rgba(16,185,129,0.1)';
      banner.style.borderColor = 'rgba(16,185,129,0.3)';
      banner.style.color = '#047857';
      banner.innerHTML = '✓ Within the ' + REOPEN_FREE_WINDOW_DAYS + '-day correction window (until ' +
        formatDateTime(info.deadline.toISOString()) + ') — no reason is required.';
    }
    if (reasonGroup) reasonGroup.style.display = 'none';
  } else {
    if (banner) {
      banner.style.display = 'block';
      banner.style.background = 'rgba(245,158,11,0.1)';
      banner.style.borderColor = 'rgba(245,158,11,0.3)';
      banner.style.color = '#b45309';
      banner.innerHTML = '⚠ The ' + REOPEN_FREE_WINDOW_DAYS +
        '-day correction window has passed — a reason is required to reopen this sample for reanalysis.';
    }
    if (reasonGroup) reasonGroup.style.display = 'block';
  }

  // Populate the reason dropdown
  const reasonSelect = document.getElementById('reanalyse-reason-select');
  if (reasonSelect) {
    reasonSelect.innerHTML = '<option value="">Select a reason…</option>' +
      REANALYSIS_REASONS.map(r => '<option value="' + escHtml(r) + '">' + escHtml(r) + '</option>').join('');
    reasonSelect.value = '';
  }

  const noteInput = document.getElementById('reanalyse-note-input');
  if (noteInput) noteInput.value = '';

  toggleReanalyseOtherField();
  openModal('modal-reanalyse-sample');
}

/** Highlight the notes field as required when "Other" is chosen as the reason. */
function toggleReanalyseOtherField() {
  const sel      = document.getElementById('reanalyse-reason-select');
  const required = document.getElementById('reanalyse-note-required');
  if (!sel) return;
  const isOther = sel.value === 'Other (specify in notes)';
  if (required) required.style.display = isOther ? 'inline' : 'none';
}

/** Confirm the reopen and push it to the database (3-day rule enforced). */
async function handleReopenSubmit() {
  const sampleId = activeReopenSampleId;
  if (!sampleId) { showToast('No sample selected.', 'warning'); return; }

  const sample = getSample(sampleId);
  if (!sample) { showToast('Sample not found. Refresh and try again.', 'error'); return; }

  const info = getReopenWindowInfo(sample);

  const reasonSelect = document.getElementById('reanalyse-reason-select');
  const reason = info.withinWindow ? '' : (reasonSelect ? reasonSelect.value.trim() : '');
  const note   = (document.getElementById('reanalyse-note-input')?.value || '').trim();

  if (!info.withinWindow && !reason) {
    showToast('Please choose a reason for reopening this sample.', 'warning');
    return;
  }
  if (reason === 'Other (specify in notes)' && !note) {
    showToast('Please add a note explaining the reason.', 'warning');
    return;
  }

  const btn = document.getElementById('btn-confirm-reanalyse');
  if (btn) { btn.disabled = true; btn.textContent = 'Reopening…'; }

  try {
    await reopenSampleForReanalysis(sampleId, reason, note);
    showToast(
      info.withinWindow
        ? 'Sample reopened and back in the pending queue.'
        : 'Sample reopened for reanalysis.',
      'success');
    closeModal('modal-reanalyse-sample');
    activeReopenSampleId = null;
    renderLabStats();
    renderAssignedSamples();
    if (activeSubmissionId) openSubmissionPanel(activeSubmissionId);
  } catch (err) {
    showToast('Error reopening sample: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↺ Reopen to Pending'; }
  }
}

/* ============================================================
   RETURN TO RECEPTION  (lab engineer → reception review)
   ============================================================ */

/**
 * Open the "return to reception" modal for a submission.
 * @param {string} [submissionId] - defaults to the open side panel's submission
 * @param {string} [preCheckedSampleId] - a single sample to pre-tick
 */
function openReturnModal(submissionId, preCheckedSampleId) {
  const subId = submissionId || activeSubmissionId;
  if (!subId) { showToast('Open a submission first.', 'warning'); return; }

  const sub = getSubmissionsForLab(engSession.lab_id).find(s => s.submissionId === subId);
  if (!sub) { showToast('Submission not found.', 'error'); return; }

  // Only samples still being analysed here can be returned.
  const candidates = [...sub.samples]
    .sort((a, b) => {
      const aSeq = (a.sampleId || '').split('-').pop() || '';
      const bSeq = (b.sampleId || '').split('-').pop() || '';
      return aSeq.localeCompare(bSeq, undefined, { numeric: true });
    })
    .filter(s => !isSampleDone(s) && !isSampleReturned(s));

  if (!candidates.length) {
    showToast('Every sample in this submission is already complete, archived, or with reception.', 'info');
    return;
  }

  const alreadyReturned = sub.samples.filter(isSampleReturned);

  // Populate the reason dropdown
  const reasonSelect = document.getElementById('return-reason-select');
  if (reasonSelect) {
    reasonSelect.innerHTML = '<option value="">Select a reason…</option>' +
      RETURN_REASONS.map(r => '<option value="' + escHtml(r) + '">' + escHtml(r) + '</option>').join('');
    reasonSelect.value = '';
  }

  const noteInput = document.getElementById('return-note-input');
  if (noteInput) noteInput.value = '';

  // Warning about existing saved report data
  const savedWarning = document.getElementById('return-saved-report-warning');
  if (savedWarning) {
    const fullSubId = getFullSubmissionId(sub);
    const savedCount = getSavedReportsForSubmission(fullSubId).length;
    if (savedCount > 0) {
      savedWarning.style.display = 'block';
      savedWarning.innerHTML = '⚠ <strong>' + savedCount + ' saved report(s)</strong> already exist for this submission. ' +
        'Returning samples does not delete them, but reception may need to re-check the results.';
    } else {
      savedWarning.style.display = 'none';
    }
  }

  renderReturnSampleList(candidates, preCheckedSampleId);

  const selectAll = document.getElementById('return-select-all');
  if (selectAll) selectAll.checked = !preCheckedSampleId;

  const info = document.getElementById('return-modal-info');
  if (info) {
    info.textContent = 'Submission #' + sub.submissionId + ' · ' + (sub.customer_name || '—') +
      (alreadyReturned.length ? ' · ' + alreadyReturned.length + ' sample(s) already with reception' : '');
  }

  toggleReturnOtherField();
  openModal('modal-return-sample');
}

/** Render the selectable sample list inside the return modal. */
function renderReturnSampleList(candidates, preCheckedSampleId) {
  const list = document.getElementById('return-samples-list');
  if (!list) return;

  const preChecked = preCheckedSampleId ? [preCheckedSampleId] : candidates.map(s => s.id);

  list.innerHTML = candidates.map(s => {
    const idLabel = s.sampleId || s.sampleNumber || s.sampleName || '—';
    const elements = (s.selectedElements || []).map(normalizeElementSymbol).join(', ');
    const wasCompleted = s.status === 'completed';
    return '<label style="display:flex;align-items:flex-start;gap:var(--sp-3);padding:var(--sp-2);border:1px solid var(--clr-border);border-radius:var(--r-sm);margin-bottom:var(--sp-2);cursor:pointer;background:var(--clr-surface);">' +
      '<input type="checkbox" value="' + escHtml(s.id) + '" ' + (preChecked.includes(s.id) ? 'checked' : '') +
        ' style="width:16px;height:16px;margin-top:3px;cursor:pointer;accent-color:var(--clr-warning);" />' +
      '<span style="flex:1;">' +
        '<span style="display:block;font-weight:600;font-family:monospace;font-size:0.82rem;color:var(--clr-primary);">' + escHtml(idLabel) + '</span>' +
        '<span style="display:block;font-size:0.72rem;color:var(--txt-muted);">' + escHtml(s.sampleType || '—') + ' · ' + escHtml(s.test_name || '—') + '</span>' +
        '<span style="display:block;font-size:0.72rem;color:var(--txt-secondary);">Elements: ' + escHtml(elements || '—') + '</span>' +
        (wasCompleted ? '<span style="display:block;font-size:0.72rem;color:var(--clr-danger);margin-top:2px;">⚠ Currently marked complete — it will be reopened for review.</span>' : '') +
      '</span>' +
    '</label>';
  }).join('');
}

// Highlight the notes field as required when "Other" is chosen as the reason
function toggleReturnOtherField() {
  const sel      = document.getElementById('return-reason-select');
  const required = document.getElementById('return-note-required');
  if (!sel) return;
  const isOther = sel.value === 'Other (specify in notes)';
  if (required) required.style.display = isOther ? 'inline' : 'none';
}
async function handleReturnSubmit() {
  const subId = activeSubmissionId;
  if (!subId) { showToast('No submission selected.', 'warning'); return; }

  const reasonSelect = document.getElementById('return-reason-select');
  const reason = reasonSelect ? reasonSelect.value : '';
  const note = (document.getElementById('return-note-input')?.value || '').trim();

  if (!reason) { showToast('Please choose a return reason.', 'warning'); return; }
  if (reason === 'Other (specify in notes)' && !note) {
    showToast('Please add a note explaining the reason.', 'warning');
    return;
  }

  const checkedIds = [...document.querySelectorAll('#return-samples-list input[type="checkbox"]:checked')]
    .map(chk => chk.value);
  if (!checkedIds.length) { showToast('Select at least one sample to return.', 'warning'); return; }

  const btn = document.getElementById('btn-confirm-return');
  if (btn) { btn.disabled = true; btn.textContent = 'Returning…'; }

  try {
    const result = await returnSamplesToReception(checkedIds, reason, note);
    if (result.failed > 0) {
      showToast(result.updated + ' returned, ' + result.failed + ' failed: ' + result.errors[0], 'warning');
    } else {
      showToast(result.updated + ' sample(s) returned to reception for review.', 'success');
    }
    closeModal('modal-return-sample');
    renderLabStats();
    renderAssignedSamples();
    renderReturnedSubmissions();
    if (activeSubmissionId) openSubmissionPanel(activeSubmissionId);
  } catch (err) {
    showToast('Error returning sample(s): ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↩ Return to Reception'; }
  }
}

// ─ Helpers for building spectro page DOM ──────────────────────

/**
 * Create the metadata section rows for a spectro page
 */
function buildSpectroMeta(labName, today, customerName) {
  const metaEl = document.createElement('div');
  metaEl.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:16px 28px;font-size:13px;margin-bottom:24px;';

  const metaItems = [
    { label: 'Department:', value: labName, fullWidth: false },
    { label: 'Date of Analysis:', value: today, fullWidth: false },
    { label: 'Customer Name:', value: customerName, fullWidth: true },
  ];

  metaItems.forEach(item => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:flex-end;gap:8px';
    if (item.fullWidth) row.style.gridColumn = '1 / -1';
    const labelSpan = document.createElement('span');
    labelSpan.style.cssText = 'font-weight:700;color:#334155;white-space:nowrap;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;';
    labelSpan.textContent = item.label;
    const valueDiv = document.createElement('div');
    valueDiv.style.cssText = 'flex:1;border-bottom:1px dashed #94a3b8;height:22px;font-family:monospace;color:#0f172a;font-size:12px;font-weight:500;padding-left:4px;display:flex;align-items:center;';
    valueDiv.textContent = item.value;
    row.appendChild(labelSpan);
    row.appendChild(valueDiv);
    metaEl.appendChild(row);
  });

  // Instrument checkboxes row (full width)
  const instRow = document.createElement('div');
  instRow.style.cssText = 'display:grid;grid-template-columns:2fr 1fr;gap:12px;grid-column:1/-1;';

  const instLabelDiv = document.createElement('div');
  instLabelDiv.style.cssText = 'display:flex;align-items:flex-end;gap:8px;';
  const instLabelSpan = document.createElement('span');
  instLabelSpan.style.cssText = 'font-weight:700;color:#334155;white-space:nowrap;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;';
  instLabelSpan.textContent = 'Instrument Model:';
  const instValueDiv = document.createElement('div');
  instValueDiv.style.cssText = 'flex:1;border-bottom:1px dashed #94a3b8;height:22px;';
  instLabelDiv.appendChild(instLabelSpan);
  instLabelDiv.appendChild(instValueDiv);

  const instChecksDiv = document.createElement('div');
  instChecksDiv.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:16px;padding-top:4px;';

  const instruments = [
    { id: 'aas', label: 'AAS' },
    { id: 'mpaes', label: 'MP-AES' },
    { id: 'icpms', label: 'ICP-MS' }
  ];
  instruments.forEach(inst => {
    const lbl = document.createElement('label');
    lbl.className = 'inst-label';
    lbl.setAttribute('data-inst', inst.id);
    lbl.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#334155;cursor:pointer;';
    const chkSpan = document.createElement('span');
    chkSpan.className = 'inst-chk';
    chkSpan.id = 'inst-chk-' + inst.id;
    chkSpan.style.cssText = 'width:16px;height:16px;border:2px solid #1e293b;border-radius:2px;display:inline-block;';
    lbl.appendChild(chkSpan);
    lbl.appendChild(document.createTextNode(' ' + inst.label));
    instChecksDiv.appendChild(lbl);
  });

  instRow.appendChild(instLabelDiv);
  instRow.appendChild(instChecksDiv);
  metaEl.appendChild(instRow);

  return metaEl;
}

/**
 * Create the vitals section for a spectro page using templates
 */
function buildSpectroVitals() {
  const vitalsEl = document.createElement('div');
  vitalsEl.id = 'vitals-section';
  vitalsEl.style.cssText = 'margin-bottom:24px;display:none;';

  ['aas', 'mpaes', 'icpms'].forEach(inst => {
    const frag = bindTemplate('spectro-vitals-' + inst, {});
    vitalsEl.appendChild(frag);
  });

  return vitalsEl;
}

/**
 * Create a data table for spectro page (using innerHTML for clean tabular structure)
 *
 * @param {Array}  sortedSamples    samples in display order
 * @param {Array}  elementsChunk    element symbols shown on this page
 * @param {Array}  hiddenIds        sample.id values flagged "hide during print"
 * @param {string} fullSubmissionId scope for the persisted hide state
 */
function buildSpectroTable(sortedSamples, elementsChunk, hiddenIds = [], fullSubmissionId = '') {
  const tableWrap = document.createElement('div');
  const hiddenSet = new Set(hiddenIds || []);

  const table = document.createElement('table');
  table.dataset.submissionId = fullSubmissionId;
  table.style.cssText = 'width:100%;border-collapse:collapse;border:2px solid #1e293b;font-size:11px;margin-bottom:24px;';

  // Build header row HTML
  let headerHtml =
    '<tr style="background:#f1f5f9;border-bottom:2px solid #1e293b;font-weight:700;color:#0f172a;font-size:9px;text-transform:uppercase;letter-spacing:0.04em;">' +
    '<th class="no-print spectro-hide-cell" style="border-right:1px solid #94a3b8;font-size:7px;line-height:1.2;text-transform:none;" title="Hide this sample during print">Hide</th>' +
    '<th style="border-right:1px solid #94a3b8;padding:8px 4px;text-align:center;white-space:nowrap;width:1%;">No.</th>' +
    '<th style="border-right:1px solid #94a3b8;padding:8px 6px;text-align:left;white-space:nowrap;width:1%;">Sample ID</th>' +
    '<th style="border-right:1px solid #94a3b8;padding:8px 4px;text-align:center;white-space:nowrap;width:20px;font-size:7px;line-height:1.2;text-transform:none;">Wt.<br>(g)</th>';

  elementsChunk.forEach(el => {
    const info = getElementInfo(el);
    const sym = normalizeElementSymbol(el);
    headerHtml += '<th style="border-right:1px solid #94a3b8;padding:6px 2px;text-align:center;width:38px;font-size:9px;line-height:1.2;text-transform:none;">' + escHtml(sym) + (info ? '<br><span style="font-weight:400;font-size:7px;color:#64748b;">' + escHtml(info.name) + '</span>' : '') + '</th>';
  });

  if (elementsChunk.length > 0) {
    headerHtml += '<th style="padding:6px 2px;text-align:center;width:30px;font-size:8px;">SD (±)</th>';
  }
  headerHtml += '</tr>';

  // Build body rows HTML
  let bodyHtml = '';
  sortedSamples.forEach((sample, idx) => {
    const sampleIdLabel = sample.sampleId || sample.sampleNumber || sample.sampleName || '—';
    const sampleElements = (sample.selectedElements || []).map(el => normalizeElementSymbol(el));
    const sampleKey = sample.id || sample.sampleId || '';
    const isHidden = sampleKey !== '' && hiddenSet.has(sampleKey);
    bodyHtml += '<tr class="spectro-sample-row' + (isHidden ? ' is-hidden-sample' : '') + '"' +
        ' data-sample-id="' + escAttr(sampleKey) + '"' +
        ' style="border-bottom:1px solid #cbd5e1;height:10.5mm;">' +
      '<td class="no-print spectro-hide-cell" style="border-right:1px solid #94a3b8;">' +
        '<input type="checkbox" class="hide-print-toggle"' + (isHidden ? ' checked' : '') +
          ' title="Hide during print"' +
          ' aria-label="Hide sample ' + escAttr(sampleIdLabel) + ' during print"' +
          ' onchange="toggleHidePrintSample(this)" />' +
      '</td>' +
      '<td class="spectro-row-no" style="border-right:1px solid #94a3b8;text-align:center;font-weight:700;color:#94a3b8;font-family:monospace;font-size:11px;white-space:nowrap;">' + (idx + 1) + '</td>' +
      '<td class="spectro-sample-id" style="border-right:1px solid #94a3b8;padding:2px 6px;font-family:monospace;font-size:11px;font-weight:500;color:#0f172a;white-space:nowrap;">' + escAttr(sampleIdLabel) + '</td>' +
      '<td style="border-right:1px solid #94a3b8;text-align:center;padding:2px;font-size:10px;font-family:monospace;border-bottom:1px dashed #94a3b8;">&nbsp;</td>' +
      elementsChunk.map(el => {
        const hasEl = sampleElements.includes(el);
        return '<td style="border-right:1px solid #94a3b8;text-align:center;' + (hasEl ? '' : 'background:#f8fafc;') + 'padding:2px;">' + (hasEl ? '&nbsp;' : '<span style="color:#cbd5e1;font-size:8px;">—</span>') + '</td>';
      }).join('') +
      (elementsChunk.length > 0 ? '<td style="text-align:center;padding:2px;">&nbsp;</td>' : '') +
    '</tr>';
  });

  table.innerHTML = '<thead>' + headerHtml + '</thead><tbody>' + bodyHtml + '</tbody>';
  tableWrap.appendChild(table);
  return tableWrap;
}

/**
 * Footer: "N of M samples hidden from print" + a restore action.
 * Carries `no-print`, so it never reaches the printed sheet.
 *
 * @param {string}   scopeKey   storage scope (submission ID, or submission::type)
 * @param {Array}    hiddenIds  currently hidden sample ids
 * @param {number}   totalCount number of unique samples in the document
 * @param {Function} syncFn     callback used to refresh the live document
 */
function buildHiddenSamplesFooter(scopeKey, hiddenIds, totalCount, syncFn) {
  const footer = document.createElement('div');
  footer.className = 'hidden-samples-footer no-print';

  const hiddenCount = (hiddenIds || []).length;

  const countEl = document.createElement('span');
  countEl.className = 'hidden-samples-count';
  countEl.textContent = hiddenCount + ' of ' + totalCount +
    ' sample' + (totalCount !== 1 ? 's' : '') + ' hidden from print';

  const showAllBtn = document.createElement('button');
  showAllBtn.type = 'button';
  showAllBtn.textContent = 'Show all samples';
  showAllBtn.disabled = hiddenCount === 0;
  showAllBtn.addEventListener('click', function() {
    if (!scopeKey) return;
    setHiddenSamplesFor(scopeKey, []);
    (typeof syncFn === 'function' ? syncFn : syncHiddenSampleRows)();
  });

  const hint = document.createElement('span');
  hint.style.cssText = 'margin-left:auto;font-size:9px;color:#94a3b8;';
  hint.textContent = 'Tick "Hide" to exclude a sample from print only — nothing is deleted.';

  footer.appendChild(countEl);
  footer.appendChild(showAllBtn);
  footer.appendChild(hint);
  return footer;
}

/**
 * Apply the persisted hide state to every sample row inside `container`.
 * Works for both the datasheet and the report table because both row types
 * carry a `data-sample-id`.
 * @returns {{total:number, hidden:number}} counts over UNIQUE sample keys
 */
function applyHiddenRows(container, scopeKey) {
  if (!container) return { total: 0, hidden: 0 };

  const hidden = new Set(getHiddenSamplesFor(scopeKey));
  const sampleKeys = new Set();
  const hiddenKeys = new Set();

  container.querySelectorAll('tr[data-sample-id]').forEach(function(tr) {
    const key = tr.dataset.sampleId;
    if (!key) return;
    sampleKeys.add(key);
    const isHidden = hidden.has(key);
    if (isHidden) hiddenKeys.add(key);
    tr.classList.toggle('is-hidden-sample', isHidden);
    const chk = tr.querySelector('input.hide-print-toggle');
    if (chk) chk.checked = isHidden;
  });

  return { total: sampleKeys.size, hidden: hiddenKeys.size };
}

function updateHiddenFooter(footer, counts) {
  if (!footer) return;

  const countEl = footer.querySelector('.hidden-samples-count');
  if (countEl) {
    countEl.textContent = counts.hidden + ' of ' + counts.total +
      ' sample' + (counts.total !== 1 ? 's' : '') + ' hidden from print';
  }
  const showAllBtn = footer.querySelector('button');
  if (showAllBtn) showAllBtn.disabled = counts.hidden === 0;
}

/** Refresh the open spectroscopy datasheet (no re-render → typed vitals survive). */
function syncHiddenSampleRows() {
  updateHiddenFooter(activeSpectroFooter, applyHiddenRows(activeSpectroPages, activeSpectroFullId));
}

/** Refresh the open PNAC/QSCert report form (no re-render → typed results survive). */
function syncHiddenReportRows() {
  updateHiddenFooter(activeReportFooter, applyHiddenRows(activeReportPages, activeReportHiddenKey));
}

/**
 * Toggle one sample's "hide during print" flag (row checkbox `onchange`).
 * Shared by the datasheet and the PNAC/QSCert report: the owning table carries
 * `data-submission-id`, which doubles as the storage scope key.
 * @param {HTMLInputElement} chk
 */
function toggleHidePrintSample(chk) {
  const row = chk.closest('tr[data-sample-id]');
  const table = chk.closest('table');
  const scopeKey = table ? table.dataset.submissionId : '';

  if (!row || !scopeKey) {
    chk.checked = false;
    return;
  }

  const sampleKey = row.dataset.sampleId;
  if (!sampleKey) {
    chk.checked = false;
    return;
  }

  const ids = new Set(getHiddenSamplesFor(scopeKey));

  if (chk.checked) {
    if (!ids.has(sampleKey)) {
      // Never allow every sample to be excluded — the printed sheet would be empty.
      // Every page carries all samples, so count unique keys in this table.
      const sampleKeys = new Set();
      table.querySelectorAll('tr[data-sample-id]').forEach(function(tr) {
        if (tr.dataset.sampleId) sampleKeys.add(tr.dataset.sampleId);
      });
      if (ids.size + 1 >= sampleKeys.size) {
        chk.checked = false;
        showToast('At least one sample must remain in the document.', 'warning');
        return;
      }
      ids.add(sampleKey);
    }
  } else {
    ids.delete(sampleKey);
  }

  setHiddenSamplesFor(scopeKey, [...ids]);

  if (activeSpectroFullId === scopeKey) syncHiddenSampleRows();
  if (activeReportHiddenKey === scopeKey) syncHiddenReportRows();
}

/**
 * Create signature section for spectro page
 */
function buildSpectroSignatures() {
  const div = document.createElement('div');

  div.innerHTML =
    '<div style="margin-bottom:20px;">' +
      '<span style="font-size:9px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:4px;">Analytical Notes / Remarks</span>' +
      '<div style="border-bottom:1px dashed #94a3b8;height:18px;margin-bottom:8px;"></div>' +
      '<div style="border-bottom:1px dashed #94a3b8;height:18px;"></div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;padding-top:12px;border-top:1px solid #cbd5e1;font-size:11px;">' +
      '<div>' +
        '<span style="display:block;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:24px;">Analyst Signature</span>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="font-size:9px;font-weight:600;color:#64748b;text-transform:uppercase;">Sign:</span>' +
          '<div style="flex:1;border-bottom:1px solid #94a3b8;height:18px;font-family:monospace;font-size:11px;font-weight:600;color:#0f172a;padding-left:4px;display:flex;align-items:center;">' + escHtml(engSession?.full_name || '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div>' +
        '<span style="display:block;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:24px;">Verified / Reviewed By</span>' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="font-size:9px;font-weight:600;color:#64748b;text-transform:uppercase;">Sign:</span>' +
          '<div style="flex:1;border-bottom:1px solid #94a3b8;height:18px;"></div>' +
        '</div>' +
      '</div>' +
    '</div>';

  return div;
}

// ── SPECTROSCOPY DATASHEET ─────────────────────────────────────
function openSpectroscopyForm(submissionId) {
  document.getElementById('blank-sheet-inputs').style.display = 'none';
  document.getElementById('btn-blank-sheet').style.display = 'flex';

  const submissions = getSubmissionsForLab(engSession.lab_id);
  const sub = submissions.find(s => s.submissionId === submissionId);
  if (!sub) { showToast('Submission not found', 'error'); return; }

  // Datasheet scope — NOT activeFullSubmissionId, which is only set by the
  // PNAC/QSCert report form and may still point at another submission.
  const fullSubmissionId = getFullSubmissionId(sub);
  activeSpectroFullId = fullSubmissionId;

  // Samples previously excluded from print for THIS submission (stale IDs pruned)
  const savedHiddenIds = getHiddenSamplesFor(fullSubmissionId)
    .filter(id => sub.samples.some(s => s.id === id));

  const sortedSamples = [...sub.samples].sort((a, b) => {
    const aSeq = (a.sampleId || '').split('-').pop() || '';
    const bSeq = (b.sampleId || '').split('-').pop() || '';
    return aSeq.localeCompare(bSeq, undefined, { numeric: true });
  });

  const lab = getLab(sub.lab_id);

  const uniqueElements = [...new Set(
    sortedSamples.flatMap(s => (s.selectedElements || []).map(el => normalizeElementSymbol(el)))
  )].sort();

  const maxColsPerPage = 6;
  const elementPages = [];
  if (uniqueElements.length === 0) {
    elementPages.push([]);
  } else {
    let remaining = [...uniqueElements];
    while (remaining.length > 0) {
      const pagesNeeded = Math.ceil(uniqueElements.length / maxColsPerPage);
      const perPage = Math.ceil(uniqueElements.length / pagesNeeded);
      const chunk = remaining.splice(0, perPage);
      elementPages.push(chunk);
    }
  }

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // Build all pages
  const pagesContainer = document.createElement('div');
  pagesContainer.style.cssText = 'padding:16px 0;';

  elementPages.forEach((elementsChunk, pageIdx) => {
    const isMultiPage = elementPages.length > 1;

    const pageDiv = document.createElement('div');
    pageDiv.className = 'spectro-page print-container';
    pageDiv.style.cssText = 'width:auto;min-height:280mm;background:#fff;padding:30px 35px;margin-bottom:20px;border-radius:16px;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(0,0,0,0.08);';

    if (isMultiPage) {
      const pageNo = document.createElement('div');
      pageNo.style.cssText = 'text-align:right;font-size:9px;color:#94a3b8;font-weight:600;margin-bottom:4px;';
      pageNo.textContent = 'Page ' + (pageIdx + 1) + ' of ' + elementPages.length;
      pageDiv.appendChild(pageNo);
    }

    // Header
    const headerDiv = document.createElement('div');
    headerDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:start;border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:20px;';
    headerDiv.innerHTML =
      '<div>' +
        '<h1 style="font-size:18px;font-weight:800;letter-spacing:-0.02em;color:#0f172a;margin:0;text-transform:uppercase;">Spectroscopy Analysis Datasheet</h1>' +
        '<p style="font-size:10px;color:#64748b;font-family:monospace;margin:2px 0 0 0;">AAS / MP-AES / ICP-MS RAW METRIC REPORT</p>' +
      '</div>' +
      '<div style="text-align:right;">' +
        '<span style="display:inline-block;border:1px solid #94a3b8;font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:0.04em;color:#475569;text-transform:uppercase;">LAB USE ONLY</span>' +
      '</div>';
    pageDiv.appendChild(headerDiv);

    // Meta
    pageDiv.appendChild(buildSpectroMeta(lab?.lab_name || '—', today, sub.customer_name || '—'));

    // Vitals
    pageDiv.appendChild(buildSpectroVitals());

    // Data Table
    pageDiv.appendChild(buildSpectroTable(sortedSamples, elementsChunk, savedHiddenIds, fullSubmissionId));

    // Remarks + Signatures
    pageDiv.appendChild(buildSpectroSignatures());

    pagesContainer.appendChild(pageDiv);
  });

  // Hidden-from-print summary + restore action (once, outside the page loop).
  // Keep the live references so toggling never has to re-render the datasheet.
  activeSpectroPages = pagesContainer;
  activeSpectroFooter = buildHiddenSamplesFooter(fullSubmissionId, savedHiddenIds, sortedSamples.length, syncHiddenSampleRows);
  pagesContainer.appendChild(activeSpectroFooter);

  // Hidden container for printing
  const printSourceEl = document.createElement('div');
  printSourceEl.id = 'spectro-print-source';
  printSourceEl.style.display = 'none';
  printSourceEl.appendChild(pagesContainer.cloneNode(true));

  const body = document.getElementById('spectroscopy-body');
  body.innerHTML = '';
  body.appendChild(pagesContainer);
  body.appendChild(printSourceEl);

  openPanel('spectroscopy-overlay');
}

// ── BLANK SPECTROSCOPY DATASHEET ───────────────────────────────
function openBlankSpectroscopyForm() {
  // Blank sheet is not tied to a submission: drop the hide-from-print scope.
  activeSpectroFullId = null;
  activeSpectroPages = null;
  activeSpectroFooter = null;

  document.getElementById('blank-sheet-inputs').style.display = 'flex';
  document.getElementById('btn-blank-sheet').style.display = 'none';
  document.getElementById('spectroscopy-body').innerHTML = '';
  document.getElementById('blank-samples-count').value = 5;
  document.getElementById('blank-elements-count').value = 4;
}

/**
 * Parse a CSV text into a 2D array of cells (trimmed).
 * Handles: BOM, quoted fields, mixed line endings, empty trailing rows.
 */
function parseCsvText(text) {
  // Remove UTF-8 BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  // Normalize line endings and split
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const rows = [];
  for (let line of lines) {
    line = line.trim();
    if (line === '') continue; // skip empty lines
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          fields.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
    }
    fields.push(current.trim());
    rows.push(fields);
  }
  return rows;
}

/**
 * Read the uploaded CSV file (if any) and return parsed data.
 * Returns { headers: string[], rows: string[][] } or null if no file selected.
 */
function readCsvFile() {
  const fileInput = document.getElementById('blank-csv-file');
  if (!fileInput || !fileInput.files || !fileInput.files[0]) return null;
  return fileInput.files[0];
}

/**
 * Download a CSV template for the user to fill in.
 */
function downloadCsvTemplate() {
  const sampleCount = parseInt(document.getElementById('blank-samples-count').value, 10) || 5;
  const elemCount = parseInt(document.getElementById('blank-elements-count').value, 10) || 4;
  const idPrefix = document.getElementById('blank-id-prefix').value.trim() || 'PREFIX';

  // Build header row: first col "Sample ID", then Elem 1, Elem 2, ...
  const headers = ['Sample ID'];
  for (let i = 1; i <= elemCount; i++) {
    headers.push('Elem_' + i);
  }

  // Build data rows
  const rows = [headers];
  for (let i = 1; i <= sampleCount; i++) {
    const sampleId = idPrefix + '-' + String(i).padStart(2, '0');
    const row = [sampleId];
    for (let e = 0; e < elemCount; e++) {
      row.push('');
    }
    rows.push(row);
  }

  // Convert to CSV string
  const csvContent = rows.map(r => r.map(c => {
    if (c.includes(',') || c.includes('"') || c.includes('\n')) {
      return '"' + c.replace(/"/g, '""') + '"';
    }
    return c;
  }).join(',')).join('\r\n');

  // Create download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'spectroscopy_template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('CSV template downloaded!', 'success');
}

function generateBlankSpectroscopy() {
  const sampleCount = parseInt(document.getElementById('blank-samples-count').value, 10);
  const elemCount = parseInt(document.getElementById('blank-elements-count').value, 10);
  const idPrefix = document.getElementById('blank-id-prefix').value.trim();

  if (isNaN(sampleCount) || sampleCount < 1) { showToast('Please enter a valid number of samples.', 'warning'); return; }
  if (isNaN(elemCount) || elemCount < 1) { showToast('Please enter a valid number of elements.', 'warning'); return; }

  // Read CSV file if provided
  const csvFile = readCsvFile();
  let csvData = null; // { elementHeaders: string[], values: string[][] }
  if (csvFile) {
    // We need to read synchronously for simplicity; use FileReader with a synchronous pattern
    const reader = new FileReader();
    // Since FileReader is async, we'll restructure to use a callback approach
    const filePromise = new Promise((resolve, reject) => {
      reader.onload = function(e) {
        try {
          const parsed = parseCsvText(e.target.result);
          if (parsed.length < 2) {
            reject(new Error('CSV must have at least a header row and one data row.'));
            return;
          }
          const headers = parsed[0];
          const dataRows = parsed.slice(1);
          // First column is Sample ID (optional), remaining are element values
          const elementHeaders = headers.slice(1); // skip "Sample ID" column
          const values = dataRows.map(r => r.slice(1)); // skip Sample ID column
          resolve({ elementHeaders, values, csvSampleIds: dataRows.map(r => r[0] || '') });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = function() { reject(new Error('Failed to read CSV file.')); };
      reader.readAsText(csvFile);
    });

    // Use the promise synchronously in an async IIFE
    (async () => {
      try {
        csvData = await filePromise;
        generateTable(sampleCount, elemCount, idPrefix, csvData);
      } catch (err) {
        showToast('CSV error: ' + err.message, 'error');
        // Fall back to normal blank generation
        generateTable(sampleCount, elemCount, idPrefix, null);
      }
    })();
    return; // early return; async path handles generation
  }

  // No CSV: generate directly
  generateTable(sampleCount, elemCount, idPrefix, null);
}

/**
 * Core table generation function, shared by CSV and non-CSV paths.
 * @param {number} sampleCount
 * @param {number} elemCount
 * @param {string} idPrefix
 * @param {object|null} csvData - { elementHeaders: string[], values: string[][] }
 */
function generateTable(sampleCount, elemCount, idPrefix, csvData) {
  // Blank sheet is not tied to a submission: drop the hide-from-print scope.
  activeSpectroFullId = null;
  activeSpectroPages = null;
  activeSpectroFooter = null;

  // Validate CSV data if present
  if (csvData) {
    const csvElemCount = csvData.elementHeaders.length;
    const csvRowCount = csvData.values.length;

    // Warn on mismatches but still proceed
    if (csvRowCount !== sampleCount) {
      showToast('Warning: CSV has ' + csvRowCount + ' data rows but Sample count is ' + sampleCount + '. Using CSV row count.', 'warning');
      sampleCount = csvRowCount;
    }
    if (csvElemCount !== elemCount) {
      showToast('Warning: CSV has ' + csvElemCount + ' element columns but Elements count is ' + elemCount + '. Using CSV column count.', 'warning');
      elemCount = csvElemCount;
    }
  }

  document.getElementById('blank-sheet-inputs').style.display = 'none';
  document.getElementById('btn-blank-sheet').style.display = 'flex';

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const pagesContainer = document.createElement('div');
  pagesContainer.style.cssText = 'padding:16px 0;';

  const pageDiv = document.createElement('div');
  pageDiv.className = 'spectro-page print-container';
  pageDiv.style.cssText = 'width:auto;min-height:280mm;background:#fff;padding:30px 35px;margin-bottom:20px;border-radius:16px;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(0,0,0,0.08);';

  pageDiv.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:start;border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:20px;">' +
      '<div>' +
        '<h1 style="font-size:18px;font-weight:800;letter-spacing:-0.02em;color:#0f172a;margin:0;text-transform:uppercase;">Spectroscopy Analysis Datasheet</h1>' +
        '<p style="font-size:10px;color:#64748b;font-family:monospace;margin:2px 0 0 0;">AAS / MP-AES / ICP-MS RAW METRIC REPORT</p>' +
      '</div>' +
      '<div style="text-align:right;">' +
        '<span style="display:inline-block;border:1px solid #94a3b8;font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:0.04em;color:#475569;text-transform:uppercase;">LAB USE ONLY</span>' +
      '</div>' +
    '</div>';

  pageDiv.appendChild(buildSpectroMeta('', today, ''));
  pageDiv.appendChild(buildSpectroVitals());

  // Build table headers
  let headerHtml =
    '<thead><tr style="background:#f1f5f9;border-bottom:2px solid #1e293b;font-weight:700;color:#0f172a;font-size:9px;text-transform:uppercase;letter-spacing:0.04em;">' +
    '<th style="border-right:1px solid #94a3b8;padding:8px 4px;text-align:center;white-space:nowrap;width:1%;">No.</th>' +
    '<th style="border-right:1px solid #94a3b8;padding:8px 6px;text-align:left;white-space:nowrap;width:1%;">Sample ID</th>' +
    '<th style="border-right:1px solid #94a3b8;padding:8px 4px;text-align:center;white-space:nowrap;width:20px;font-size:7px;line-height:1.2;text-transform:none;">Wt.<br>(g)</th>';

  if (csvData) {
    // Use CSV element names as column headers
    for (let i = 0; i < elemCount; i++) {
      const elName = escHtml(csvData.elementHeaders[i] || ('Elem ' + (i + 1)));
      headerHtml += '<th style="border-right:1px solid #94a3b8;padding:6px 2px;text-align:center;width:38px;font-size:9px;line-height:1.2;text-transform:none;">' + elName + '<br><span style="font-weight:400;font-size:7px;color:#64748b;">&nbsp;</span></th>';
    }
  } else {
    for (let i = 0; i < elemCount; i++) {
      headerHtml += '<th style="border-right:1px solid #94a3b8;padding:6px 2px;text-align:center;width:38px;font-size:9px;line-height:1.2;text-transform:none;">Elem.<br><span style="font-weight:400;font-size:7px;color:#64748b;">' + (i + 1) + '</span></th>';
    }
  }
  headerHtml += '<th style="padding:6px 2px;text-align:center;width:30px;font-size:8px;">SD (±)</th></tr></thead>';

  // Build table body
  let bodyHtml = '<tbody>';
  for (let idx = 0; idx < sampleCount; idx++) {
    let sampleId;
    let values;

    if (csvData) {
      // Use CSV sample ID if available and no prefix set, otherwise use prefix
      const csvSampleId = csvData.csvSampleIds && csvData.csvSampleIds[idx] ? csvData.csvSampleIds[idx] : '';
      sampleId = idPrefix ? idPrefix + '-' + String(idx + 1).padStart(2, '0') : csvSampleId;
      values = csvData.values[idx] || [];
    } else {
      sampleId = idPrefix ? idPrefix + '-' + String(idx + 1).padStart(2, '0') : '';
      values = [];
    }

    bodyHtml += '<tr style="border-bottom:1px solid #cbd5e1;height:10.5mm;">' +
      '<td style="border-right:1px solid #94a3b8;text-align:center;font-weight:700;color:#94a3b8;font-family:monospace;font-size:11px;white-space:nowrap;">' + (idx + 1) + '</td>' +
      '<td class="writing-row" style="border-right:1px solid #94a3b8;padding:2px 6px;font-family:monospace;font-size:11px;font-weight:500;color:#0f172a;white-space:nowrap;border-bottom:1px dashed #94a3b8;">' + escHtml(sampleId) + '&nbsp;</td>' +
      '<td class="writing-row" style="border-right:1px solid #94a3b8;text-align:center;padding:2px;font-size:10px;font-family:monospace;border-bottom:1px dashed #94a3b8;">&nbsp;</td>';

    // Element value cells
    for (let e = 0; e < elemCount; e++) {
      const val = values[e] !== undefined ? values[e] : '';
      bodyHtml += '<td class="writing-row" style="border-right:1px solid #94a3b8;text-align:center;padding:2px;font-size:10px;font-family:monospace;border-bottom:1px dashed #94a3b8;">' + escHtml(val) + '&nbsp;</td>';
    }

    bodyHtml += '<td class="writing-row" style="text-align:center;padding:2px;font-size:10px;font-family:monospace;border-bottom:1px dashed #94a3b8;">&nbsp;</td>' +
    '</tr>';
  }
  bodyHtml += '</tbody>';

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;border:2px solid #1e293b;font-size:11px;margin-bottom:24px;';
  table.innerHTML = headerHtml + bodyHtml;
  pageDiv.appendChild(table);
  pageDiv.appendChild(buildSpectroSignatures());

  pagesContainer.appendChild(pageDiv);

  const printSourceEl = document.createElement('div');
  printSourceEl.id = 'spectro-print-source';
  printSourceEl.style.display = 'none';
  printSourceEl.appendChild(pagesContainer.cloneNode(true));

  const body = document.getElementById('spectroscopy-body');
  body.innerHTML = '';
  body.appendChild(pagesContainer);
  body.appendChild(printSourceEl);
}

// ── Print ───────────────────────────────────────────────────────
function printSpectroscopy() {
  const source = document.getElementById('spectro-print-source');
  if (!source) { showToast('No datasheet to print. Please open the form first.', 'warning'); return; }

  const pagesContainer = source.firstElementChild;
  if (!pagesContainer) { showToast('No datasheet content found.', 'warning'); return; }

  const clone = pagesContainer.cloneNode(true);

  // ── Apply "hide during print" flags ──────────────────────────
  // Read from storage (not from the form-open snapshot) so the printout always
  // matches the last checkbox change. Renumber "No." so the sheet has no gaps.
  const hiddenForPrint = new Set(getHiddenSamplesFor(activeSpectroFullId));
  if (hiddenForPrint.size > 0) {
    clone.querySelectorAll('tr.spectro-sample-row').forEach(tr => {
      if (hiddenForPrint.has(tr.dataset.sampleId)) tr.remove();
    });
    // Renumber per TABLE: a multi-page datasheet has one table per page and
    // every page must restart at 1.
    clone.querySelectorAll('table').forEach(function(tbl) {
      const bodyRows = tbl.querySelectorAll('tr.spectro-sample-row');
      bodyRows.forEach(function(tr, idx) {
        const noCell = tr.querySelector('.spectro-row-no');
        if (noCell) noCell.textContent = String(idx + 1);
      });
    });
  }

  // The Hide column and the footer are screen-only controls — never printed.
  clone.querySelectorAll('.no-print').forEach(el => el.remove());

  // Find which instrument is selected from the live DOM
  const selectedInst = ['aas', 'mpaes', 'icpms'].find(inst => {
    const chk = document.getElementById('inst-chk-' + inst);
    return chk && chk.textContent === '✓';
  });

  // In the clone:
  clone.querySelectorAll('.inst-label').forEach(el => el.remove());

  // Keep only the selected instrument's vitals, hide/remove the rest
  const allVitalsBlocks = clone.querySelectorAll('.vitals-block');
  allVitalsBlocks.forEach(el => {
    if (selectedInst && el.getAttribute('data-vitals-for') === selectedInst) {
      // Keep this one visible - populate inputs with live values
      el.style.display = 'block';
      el.querySelectorAll('input').forEach(input => {
        const vitalKey = input.getAttribute('data-vital');
        if (vitalKey) {
          const liveInput = document.querySelector('input[data-vital="' + vitalKey + '"]');
          if (liveInput && liveInput.value) {
            input.value = liveInput.value;
          }
        }
      });
    } else {
      // Hide non-selected vitals
      el.remove();
    }
  });

  // Show the vitals section wrapper
  const vitalsSection = clone.querySelector('#vitals-section');
  if (vitalsSection) {
    vitalsSection.style.display = selectedInst ? 'block' : 'none';
  }

  // Make all input fields read-only in the print version
  clone.querySelectorAll('input').forEach(input => {
    input.readOnly = true;
  });

  const serialized = clone.innerHTML;

  const fullHtml =
    '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>Spectroscopy Analysis Datasheet - Print</title>' +
    '<style>' +
      '@import url(\'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap\');' +
      'body { font-family: \'Inter\', sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
      '@page { size: A4 portrait; margin: 12mm 15mm 12mm 15mm; }' +
      '@media print { body { background: #fff !important; color: #000 !important; } .no-print { display: none !important; } .print-container { box-shadow: none !important; border: none !important; margin: 0 auto !important; padding: 0 !important; width: 210mm !important; background: transparent !important; } .spectro-page { box-shadow: none !important; border: none !important; margin: 0 auto !important; page-break-after: always; } tr { page-break-inside: avoid; } }' +
      '.writing-row { height: 10.5mm; }' +
      '* { margin: 0; padding: 0; box-sizing: border-box; }' +
      'body { background: #fff; display: block; padding: 0; }' +
      '.spectro-page { width: 210mm; min-height: 297mm; padding: 12mm 15mm; margin: 0 auto; background: #fff; border: none; box-shadow: none; page-break-after: always; }' +
      '.spectro-page:last-child { page-break-after: auto; }' +
      '.print-container { box-shadow: none !important; border: none !important; }' +
    '</style></head><body>' + serialized + '</body></html>';

  const printWin = window.open('', '_blank', 'width=800,height=600,scrollbars=yes');
  if (!printWin) { showToast('Popup blocked! Please allow popups for this site to print.', 'error'); return; }
  printWin.document.write(fullHtml);
  printWin.document.close();
  printWin.focus();

  setTimeout(() => {
    printWin.print();
    printWin.onafterprint = () => printWin.close();
  }, 500);
}

// ── Report dropdown toggle ─────────────────────────────────────
function toggleReportDropdown(submissionId) {
  const dropdown = document.getElementById('report-dropdown-' + submissionId);
  if (!dropdown) return;
  const isOpen = dropdown.style.display === 'block';
  // Close all dropdowns first
  document.querySelectorAll('[id^="report-dropdown-"]').forEach(d => d.style.display = 'none');
  // Toggle current
  dropdown.style.display = isOpen ? 'none' : 'block';
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('[id^="report-dropdown-"]') && !e.target.closest('button[onclick^="toggleReportDropdown"]')) {
    document.querySelectorAll('[id^="report-dropdown-"]').forEach(d => d.style.display = 'none');
  }
});

// ── REPORT GENERATION ──────────────────────────────────────────
function openReportForm(submissionId, reportType) {
  // Default to pnac if not specified
  reportType = reportType || 'pnac';
  const submissions = getSubmissionsForLab(engSession.lab_id);
  const sub = submissions.find(s => s.submissionId === submissionId);
  if (!sub) { showToast('Submission not found', 'error'); return; }

  const sortedSamples = [...sub.samples].sort((a, b) => {
    const aSeq = (a.sampleId || '').split('-').pop() || '';
    const bSeq = (b.sampleId || '').split('-').pop() || '';
    return aSeq.localeCompare(bSeq, undefined, { numeric: true });
  });

  const lab = getLab(sub.lab_id);
  const firstSample = sortedSamples[0];
  const test = firstSample ? getTest(firstSample.test_id) : null;

  // Get unique elements from all samples
  const uniqueElements = [...new Set(
    sortedSamples.flatMap(s => (s.selectedElements || []).map(el => normalizeElementSymbol(el)))
  )].sort();

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // Derive report number from the first sample ID prefix (e.g., "26-07-AAS-1021" from "26-07-AAS-1021-001")
  let reportNo = sub.submissionId;
  if (sub.firstSampleId) {
    const parts = sub.firstSampleId.split('-');
    if (parts.length >= 4) {
      // Take all parts except the last sequence number
      reportNo = parts.slice(0, -1).join('-');
    }
  }

  // Append "-P" suffix for PNAC reports; QSCert reports keep the base number
  if (reportType === 'pnac') {
    reportNo = reportNo + '-P';
  }

  // Store the report number so printReport() can use it as the PDF filename
  activeReportNo = reportNo;
  // Store the report type and full submission ID for saving
  activeReportType = reportType;
  activeFullSubmissionId = getFullSubmissionId(sub);

  // Hide-during-print scope for THIS report type (PNAC and QSCert are separate
  // documents, so hiding a sample in one must not affect the other).
  activeReportHiddenKey = activeFullSubmissionId + '::' + reportType;
  const savedHiddenIds = getHiddenSamplesFor(activeReportHiddenKey)
    .filter(id => sortedSamples.some(s => (s.id || s.sampleId) === id));

  // Build the report HTML
  const reportDiv = document.createElement('div');
  reportDiv.style.cssText = 'padding:16px 0;';

  // Split the element columns into fixed-size chunks so the results table
  // never overflows the printable A4 width. Each chunk becomes its own
  // .report-page div — the print CSS already breaks the page after every
  // .report-page (last page: auto), so multi-page reports print cleanly.
  const elementChunks = [];
  if (uniqueElements.length > 0) {
    for (let i = 0; i < uniqueElements.length; i += REPORT_ELEMENTS_PER_PAGE) {
      elementChunks.push(uniqueElements.slice(i, i + REPORT_ELEMENTS_PER_PAGE));
    }
  } else {
    elementChunks.push([]); // single page with the fallback "Result" column
  }
  const totalPages = elementChunks.length;

  elementChunks.forEach((chunkElements, pageIdx) => {
    const pageNum = pageIdx + 1;
    const isLastPage = pageIdx === totalPages - 1;

    const pageDiv = document.createElement('div');
    pageDiv.className = 'report-page print-container';
    pageDiv.style.cssText = 'width:auto;min-height:297mm;background:#fff;padding:30px 35px;margin-bottom:20px;border-radius:16px;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(0,0,0,0.08);font-family:Times New Roman,Times,serif;color:#000;';

    // Top Right Serial Number
    const serialDiv = document.createElement('div');
    serialDiv.style.cssText = 'text-align:right;font-size:12px;font-weight:700;color:#065f46;margin-bottom:8px;';
    serialDiv.textContent = 'Test Report Sr. No ' + reportNo;
    pageDiv.appendChild(serialDiv);

    // Header Section with Logos
    const headerDiv = document.createElement('div');
    headerDiv.style.cssText = 'display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:12px;';

    // Left Logo (actual GARL logo)
    const leftLogo = document.createElement('div');
    leftLogo.style.cssText = 'width:96px;height:96px;display:flex;align-items:center;justify-content:center;overflow:hidden;';
    const logoImg = document.createElement('img');
    // Use relative path from pages/ directory to logo/ directory
    logoImg.src = '../logo/logo.png';
    logoImg.style.cssText = 'max-width:80px;max-height:80px;object-fit:contain;border-radius:4px;';
    logoImg.alt = 'GARL Logo';
    leftLogo.appendChild(logoImg);
    headerDiv.appendChild(leftLogo);

    // Center Text
    const centerText = document.createElement('div');
    centerText.style.cssText = 'text-align:center;flex:1;padding:0 8px;';
    centerText.innerHTML =
      '<h1 style="font-size:14px;font-weight:700;letter-spacing:0.04em;color:#065f46;text-transform:uppercase;margin:0;">GOVERNMENT OF PAKISTAN</h1>' +
      '<h2 style="font-size:13px;font-weight:700;letter-spacing:0.04em;color:#065f46;text-transform:uppercase;margin:2px 0;">MINISTRY OF ENERGY (PETROLEUM DIVISION)</h2>' +
      '<h3 style="font-size:13px;font-weight:700;letter-spacing:0.04em;color:#065f46;text-transform:uppercase;margin:2px 0;">GEOLOGICAL SURVEY OF PAKISTAN</h3>' +
      '<h4 style="font-size:14px;font-weight:700;letter-spacing:0.04em;color:#065f46;text-transform:uppercase;margin:2px 0;">GEOSCIENCE ADVANCED RESEARCH LABORATORIES</h4>' +
      '<p style="font-size:13px;font-weight:700;letter-spacing:0.04em;color:#065f46;text-transform:uppercase;margin:2px 0;">ISLAMABAD</p>';
    headerDiv.appendChild(centerText);

    // Right Logo (based on report type: PNAC or QSCert)
    const rightLogo = document.createElement('div');
    rightLogo.style.cssText = 'width:112px;display:flex;flex-direction:column;align-items:center;justify-content:center;';
    const certImg = document.createElement('img');
    certImg.src = reportType === 'qscert' ? '../logo/qscert.png' : '../logo/PNAC.png';
    certImg.style.cssText = 'max-width:100px;max-height:80px;object-fit:contain;';
    certImg.alt = reportType === 'qscert' ? 'QSCert Logo' : 'PNAC Logo';
    rightLogo.appendChild(certImg);
    headerDiv.appendChild(rightLogo);

    pageDiv.appendChild(headerDiv);

    // Customer & Sample Details Metadata Table
    const metaTable = document.createElement('table');
    metaTable.style.cssText = 'width:100%;border-collapse:collapse;border:1px solid #000;margin-bottom:24px;';
    metaTable.innerHTML =
      '<tbody>' +
        '<tr><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;width:28%;">Report No:</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;font-weight:700;color:#065f46;width:24%;">' + escHtml(reportNo) + '</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;width:24%;">Report issue Date:</td><td class="report-issue-date" style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;width:24%;">' + escHtml(today) + '</td></tr>' +
        '<tr><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Name & Address of Customer:</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;">' + escHtml(sub.customer_name || '—') + '</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">No. of Sample(s):</td><td class="report-sample-count" style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;">' + sub.sampleCount + '</td></tr>' +
        '<tr><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Location of Sample (Given by customer)</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;">' + escHtml(firstSample?.sample_location || 'NA') + '</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Sample receiving Date</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;">' + formatDate(sub.created_at) + '</td></tr>' +
        '<tr><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Description of Sample:</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;">' + escHtml(firstSample?.sampleType || 'Powder') + '</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Sample analysis Date</td><td class="report-analysis-date" style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;">' + escHtml(today) + '</td></tr>' +
        '<tr><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Method used /Specs:</td><td style="border:1px solid #000;padding:2px 4px;font-size:13.5px;text-align:center;"><input type="text" class="report-method-input" value="EPA 3052" style="width:100%;border:none;outline:none;text-align:center;font-size:13.5px;font-family:Times New Roman,Times,serif;background:transparent;padding:2px 0;" /></td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Temperature & Humidity</td><td style="border:1px solid #000;padding:2px 4px;font-size:13.5px;text-align:center;"><input type="text" class="report-temp-input" value="25.2 °C & 52 %" style="width:100%;border:none;outline:none;text-align:center;font-size:13.5px;font-family:Times New Roman,Times,serif;background:transparent;padding:2px 0;" /></td></tr>' +
      '</tbody>';
    pageDiv.appendChild(metaTable);

    // Test Report Heading (continuation pages are labelled and numbered)
    const testReportHeading = document.createElement('div');
    testReportHeading.style.cssText = 'font-weight:700;font-size:15px;margin-bottom:8px;padding-left:16px;';
    testReportHeading.textContent = pageNum === 1 ? 'Test Report:' : 'Test Report (Continued):';
    pageDiv.appendChild(testReportHeading);

    if (totalPages > 1) {
      const rangeDiv = document.createElement('div');
      rangeDiv.style.cssText = 'font-size:12px;color:#374151;margin:-4px 0 8px 16px;';
      const rangeStart = pageIdx * REPORT_ELEMENTS_PER_PAGE + 1;
      const rangeEnd = rangeStart + chunkElements.length - 1;
      rangeDiv.textContent = 'Elements ' + rangeStart + '\u2013' + rangeEnd + ' of ' + uniqueElements.length + ' \u00b7 Page ' + pageNum + ' of ' + totalPages;
      pageDiv.appendChild(rangeDiv);
    }

    // Test Results Table with editable input fields
    const resultTable = document.createElement('table');
    resultTable.style.cssText = 'width:100%;border-collapse:collapse;border:1px solid #000;margin-bottom:32px;';
    // Scope key read by toggleHidePrintSample() when a row checkbox changes
    resultTable.dataset.submissionId = activeReportHiddenKey;

    const elemColWidth = chunkElements.length > 0 ? Math.floor(92 / chunkElements.length) + '%' : '50%';

    // Read the selected unit from the report panel dropdown (default: ppm)
    const unitSelect = document.getElementById('report-unit-select');
    const reportUnit = unitSelect ? unitSelect.value : 'ppm';

    // Build header row
    let resultHeaderHtml =
      '<thead><tr style="background:#f9fafb;">' +
      '<th class="no-print report-hide-cell" style="border:1px solid #000;padding:2px;text-align:center;font-weight:700;font-size:7px;line-height:1.2;" title="Hide this sample during print">Hide</th>' +
      '<th style="border:1px solid #000;padding:4px 8px;text-align:center;font-weight:700;font-size:13.5px;width:6%;">S. No.</th>' +
      '<th style="border:1px solid #000;padding:4px 8px;text-align:center;font-weight:700;font-size:13.5px;white-space:nowrap;min-width:160px;">Sample ID</th>';

    // Add element columns (equal width for each) - use selected unit and proper capitalization
    if (chunkElements.length > 0) {
      chunkElements.forEach(el => {
        // Capitalize first letter, lowercase rest (e.g., "AU" -> "Au", "CU" -> "Cu")
        const displayEl = el.charAt(0).toUpperCase() + el.slice(1).toLowerCase();
        resultHeaderHtml += '<th data-element="' + escHtml(el) + '" style="border:1px solid #000;padding:4px 8px;text-align:center;font-weight:700;font-size:13.5px;width:' + elemColWidth + ';">' + escHtml(displayEl) + ' (' + escHtml(reportUnit) + ')</th>';
      });
    } else {
      resultHeaderHtml += '<th data-element="result" style="border:1px solid #000;padding:4px 8px;text-align:center;font-weight:700;font-size:13.5px;width:50%;">Result (' + escHtml(reportUnit) + ')</th>';
    }

    resultHeaderHtml += '</tr></thead>';
    resultTable.innerHTML = resultHeaderHtml;

    // Build body rows with editable input fields
    const tbody = document.createElement('tbody');
    sortedSamples.forEach((sample, idx) => {
      const sampleIdLabel = sample.sampleId || sample.sampleNumber || sample.sampleName || '—';
      const sampleElements = (sample.selectedElements || []).map(el => normalizeElementSymbol(el));
      const sampleKey = sample.id || sample.sampleId || '';
      const isHidden = sampleKey !== '' && savedHiddenIds.includes(sampleKey);

      const tr = document.createElement('tr');
      tr.className = 'report-sample-row' + (isHidden ? ' is-hidden-sample' : '');
      tr.dataset.sampleId = sampleKey;

      // Hide-during-print toggle (screen only)
      const tdHide = document.createElement('td');
      tdHide.className = 'no-print report-hide-cell';
      tdHide.style.cssText = 'border:1px solid #000;padding:2px;text-align:center;';
      const hideChk = document.createElement('input');
      hideChk.type = 'checkbox';
      hideChk.className = 'hide-print-toggle';
      hideChk.checked = isHidden;
      hideChk.title = 'Hide during print';
      hideChk.setAttribute('aria-label', 'Hide sample ' + sampleIdLabel + ' during print');
      hideChk.addEventListener('change', function() { toggleHidePrintSample(this); });
      tdHide.appendChild(hideChk);
      tr.appendChild(tdHide);

      // S.No
      const tdNo = document.createElement('td');
      tdNo.className = 'report-row-no';
      tdNo.style.cssText = 'border:1px solid #000;padding:4px 8px;text-align:center;font-size:13.5px;';
      tdNo.textContent = (idx + 1) + '.';
      tr.appendChild(tdNo);

      // Sample ID
      const tdId = document.createElement('td');
      tdId.className = 'report-sample-id';
      tdId.style.cssText = 'border:1px solid #000;padding:4px 8px;text-align:center;font-size:13.5px;white-space:nowrap;';
      tdId.textContent = sampleIdLabel;
      tr.appendChild(tdId);

      // Element result input fields
      if (chunkElements.length > 0) {
        chunkElements.forEach(el => {
          const td = document.createElement('td');
          td.style.cssText = 'border:1px solid #000;padding:2px 4px;text-align:center;';
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'report-result-input';
          input.setAttribute('data-sample-id', sample.id);
          input.setAttribute('data-sample-label', sampleIdLabel);
          input.setAttribute('data-element', el);
          input.style.cssText = 'width:100%;border:none;outline:none;text-align:center;font-size:13.5px;font-family:Times New Roman,Times,serif;background:transparent;padding:2px 0;';
          input.placeholder = '—';
          tr.appendChild(td);
          td.appendChild(input);
        });
      } else {
        const td = document.createElement('td');
        td.style.cssText = 'border:1px solid #000;padding:2px 4px;text-align:center;';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'report-result-input';
        input.setAttribute('data-sample-id', sample.id);
        input.setAttribute('data-sample-label', sampleIdLabel);
        input.style.cssText = 'width:100%;border:none;outline:none;text-align:center;font-size:13.5px;font-family:Times New Roman,Times,serif;background:transparent;padding:2px 0;';
        input.placeholder = '—';
        td.appendChild(input);
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    });
    resultTable.appendChild(tbody);
    pageDiv.appendChild(resultTable);

    // Disclaimer / Terms, "End of Report" and the signature block appear on
    // the LAST page only.
    if (isLastPage) {

      // Disclaimer / Terms Section
      const disclaimerDiv = document.createElement('div');
      disclaimerDiv.style.cssText = 'margin-bottom:32px;';
      disclaimerDiv.innerHTML =
        '<h5 style="font-weight:700;font-size:13.5px;margin-bottom:12px;padding-left:16px;">Disclaimer / Terms of Test Report</h5>' +
        '<ul style="list-style:none;padding:0 16px;margin:0;">' +
          '<li style="position:relative;padding-left:18px;margin-bottom:4px;font-size:12.5px;line-height:1.35;">• This report is based solely on the specific sample(s) submitted by the customer. It must not be reproduced in part without prior written consent.</li>' +
          '<li style="position:relative;padding-left:18px;margin-bottom:4px;font-size:12.5px;line-height:1.35;">• Sampling was not carried out by GARL. Therefore, the laboratory does not accept responsibility for whether the submitted sample(s) accurately represent any larger batch, stock, or full production lot.</li>' +
          '<li style="position:relative;padding-left:18px;margin-bottom:4px;font-size:12.5px;line-height:1.35;">• The customer is fully responsible for the ethical and appropriate use of the test results. The laboratory shall not be held liable for any claims or consequences arising from the use or interpretation of the data by the customer or third parties.</li>' +
          '<li style="position:relative;padding-left:18px;margin-bottom:4px;font-size:12.5px;line-height:1.35;">• The information in this report may not be used for product promotion, commercial advertising, or publicity purposes.</li>' +
          '<li style="position:relative;padding-left:18px;margin-bottom:4px;font-size:12.5px;line-height:1.35;">• After the report is issued, the sample(s) will be retained for a period of 1 month, unless an alternative arrangement has been agreed upon.</li>' +
          '<li style="position:relative;padding-left:18px;margin-bottom:4px;font-size:12.5px;line-height:1.35;">• Statement of conformity /compliance (where applicable): NA</li>' +
          '<li style="position:relative;padding-left:18px;margin-bottom:4px;font-size:12.5px;line-height:1.35;">• Remarks/Comments (where requested) = NA</li>' +
          '<li style="position:relative;padding-left:18px;margin-bottom:4px;font-size:12.5px;line-height:1.35;">• Analysis Not required = NR</li>' +
          '<li style="position:relative;padding-left:18px;margin-bottom:4px;font-size:12.5px;line-height:1.35;">• BDL = Below Detection Limit</li>' +
        '</ul>';
      pageDiv.appendChild(disclaimerDiv);

      // End of Report
      const endDiv = document.createElement('div');
      endDiv.style.cssText = 'text-align:center;font-weight:700;font-size:14px;margin:32px 0;';
      endDiv.textContent = 'End of Report';
      pageDiv.appendChild(endDiv);

      // Signature Footer
      const sigDiv = document.createElement('div');
      sigDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-end;margin-top:64px;padding:16px 16px 0;';
      sigDiv.innerHTML =
        '<div style="text-align:left;">' +
          '<div style="font-weight:700;font-size:13.5px;">Quality Manager</div>' +
          '<div style="font-size:12px;margin-top:2px;">(Verified <span style="text-decoration:underline;color:#1d4ed8;font-family:sans-serif;">by</span>)</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
          '<div style="font-weight:700;font-size:13.5px;">Technical Manager</div>' +
          '<div style="font-size:12px;margin-top:2px;">(Issued by)</div>' +
        '</div>';
      pageDiv.appendChild(sigDiv);
    }

    reportDiv.appendChild(pageDiv);
  });

  // Hide-during-print summary (screen only — stripped before printing)
  activeReportPages = reportDiv;
  activeReportFooter = buildHiddenSamplesFooter(activeReportHiddenKey, savedHiddenIds, sortedSamples.length, syncHiddenReportRows);
  reportDiv.appendChild(activeReportFooter);

  // Hidden container for printing
  const printSourceEl = document.createElement('div');
  printSourceEl.id = 'report-print-source';
  printSourceEl.style.display = 'none';
  printSourceEl.appendChild(reportDiv.cloneNode(true));

  const body = document.getElementById('report-body');
  body.innerHTML = '';
  body.appendChild(reportDiv);
  body.appendChild(printSourceEl);

  // The meta-table inputs (method, temperature & humidity) are repeated on
  // every page — mirror edits across all pages so they stay consistent.
  ['.report-method-input', '.report-temp-input'].forEach(function(selector) {
    const inputs = Array.from(reportDiv.querySelectorAll(selector));
    inputs.forEach(function(inp) {
      inp.addEventListener('input', function() {
        inputs.forEach(function(other) {
          if (other !== inp) other.value = inp.value;
        });
      });
    });
  });

  openPanel('report-overlay');

  // ── Load saved report data if it exists ──
  loadSavedReportIntoForm(activeFullSubmissionId, reportType);
}

// ── Load saved report data into the currently open report form ──
function loadSavedReportIntoForm(fullSubmissionId, reportType) {
  if (!fullSubmissionId || !reportType) return;
  const saved = getSavedReport(fullSubmissionId, reportType);
  if (!saved) return;

  // Restore unit dropdown
  const unitSelect = document.getElementById('report-unit-select');
  if (unitSelect && saved.unit) {
    unitSelect.value = saved.unit;
    updateReportUnit(saved.unit);
  }

  // Restore method input (the meta table is repeated on every report page)
  if (saved.method_used) {
    document.querySelectorAll('#report-body .report-method-input').forEach(function(inp) {
      inp.value = saved.method_used;
    });
  }

  // Restore temp/humidity input (the meta table is repeated on every report page)
  if (saved.temperature_humidity) {
    document.querySelectorAll('#report-body .report-temp-input').forEach(function(inp) {
      inp.value = saved.temperature_humidity;
    });
  }

  // Restore the original generation date from the saved report (Report issue
  // Date / Sample analysis Date). The meta-table repeats on every page and is
  // mirrored in the hidden print-source clone, so update every copy — we want
  // the date the report was generated/saved on, not today's date.
  if (saved.report_issue_date) {
    document.querySelectorAll('#report-body .report-issue-date, #report-print-source .report-issue-date').forEach(function(td) {
      td.textContent = saved.report_issue_date;
    });
  }
  if (saved.sample_analysis_date) {
    document.querySelectorAll('#report-body .report-analysis-date, #report-print-source .report-analysis-date').forEach(function(td) {
      td.textContent = saved.sample_analysis_date;
    });
  }

  // Restore result input values from saved data_points
  if (saved.data_points && Array.isArray(saved.data_points)) {
    saved.data_points.forEach(function(dp) {
      // Find the matching input by sample_id and element
      // Using quoted attribute selectors — no CSS.escape needed for quoted values
      const input = document.querySelector(
        '#report-body .report-result-input[data-sample-id="' + dp.sample_id + '"][data-element="' + dp.element + '"]'
      );
      if (input) {
        input.value = dp.value || '';
      }
    });
  }

  showToast('Loaded saved report data for ' + (reportType === 'pnac' ? 'PNAC' : 'QSCert') + ' report.', 'info');
}

// ── Save report data to Supabase ──────────────────────────────
async function saveReportDataToSupabase() {
  if (!activeFullSubmissionId || !activeReportType) {
    showToast('No active report to save.', 'warning');
    return;
  }

  // Get the current unit
  const unitSelect = document.getElementById('report-unit-select');
  const currentUnit = unitSelect ? unitSelect.value : 'ppm';

  // Get method and temp inputs
  const methodInput = document.querySelector('#report-body .report-method-input');
  const tempInput = document.querySelector('#report-body .report-temp-input');

  // Collect all result input values into data_points array
  // IMPORTANT: Filter out inputs from the hidden #report-print-source clone
  // (it contains empty copies that would create duplicate/empty data points)
  const allInputs = document.querySelectorAll('#report-body .report-result-input');
  const resultInputs = [...allInputs].filter(function(input) {
    return !input.closest('#report-print-source');
  });
  const dataPoints = [];
  const sampleIds = [];
  const elementsSet = new Set();

  resultInputs.forEach(function(input) {
    const sampleId = input.getAttribute('data-sample-id') || '';
    const sampleLabel = input.getAttribute('data-sample-label') || '';
    const element = input.getAttribute('data-element') || 'result';
    const value = input.value || '';

    dataPoints.push({
      sample_id: sampleId,
      sample_label: sampleLabel,
      element: element,
      value: value,
    });

    if (sampleLabel && !sampleIds.includes(sampleLabel)) {
      sampleIds.push(sampleLabel);
    }
    if (element && element !== 'result') {
      elementsSet.add(element);
    }
  });

  // Get submission info for metadata
  const submissions = getSubmissionsForLab(engSession.lab_id);
  const sub = submissions.find(function(s) { return s.submissionId === activeSubmissionId; });
  const lab = sub ? getLab(sub.lab_id) : null;
  const firstSample = sub ? sub.samples[0] : null;
  const test = firstSample ? getTest(firstSample.test_id) : null;
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // Keep the original generation date of an already-saved report — re-saving
  // (e.g. after editing results) must not change the Report issue Date /
  // Sample analysis Date captured when the report was first issued.
  const existingSaved = getSavedReport(activeFullSubmissionId, activeReportType);
  const issueDate = (existingSaved && existingSaved.report_issue_date) || today;
  const analysisDate = (existingSaved && existingSaved.sample_analysis_date) || today;

  // Build the full report data object
  const reportData = {
    submission_id: activeFullSubmissionId,
    report_type: activeReportType,
    report_number: activeReportNo || '',
    report_issue_date: issueDate,
    customer_name: sub ? (sub.customer_name || '') : '',
    sample_count: sub ? sub.sampleCount : 0,
    sample_location: firstSample ? (firstSample.sample_location || '') : '',
    sample_receiving_date: sub ? formatDate(sub.created_at) : '',
    sample_description: firstSample ? (firstSample.sampleType || 'Powder') : '',
    sample_analysis_date: analysisDate,
    method_used: methodInput ? methodInput.value : '',
    temperature_humidity: tempInput ? tempInput.value : '',
    unit: currentUnit,
    lab_id: sub ? (sub.lab_id || '') : '',
    lab_name: lab ? (lab.lab_name || '') : '',
    lab_code: lab ? (lab.lab_code || '') : '',
    test_name: test ? (test.test_name || '') : (sub ? sub.test_name : ''),
    test_code: test ? (test.test_code || '') : '',
    elements: Array.from(elementsSet),
    sample_ids: sampleIds,
    data_points: dataPoints,
    engineer_id: engSession ? engSession.id : '',
    engineer_name: engSession ? engSession.full_name : '',
  };

  // Show saving state
  const saveBtn = document.getElementById('btn-save-report');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"/></svg> Saving…';
  }

  try {
    await saveReportData(reportData);
    showToast('Report data saved successfully!', 'success');

    // Refresh the submission panel to show tick marks
    if (activeSubmissionId) {
      // Re-render the submission panel in the background (without closing report)
      // The tick marks will appear next time the dropdown is opened
    }
  } catch (err) {
    showToast('Error saving report: ' + err.message, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:16px;height:16px;"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 3.75V6a2.25 2.25 0 002.25 2.25h2.25M3.75 20.25h18M5.25 3.75h9.75a2.25 2.25 0 012.25 2.25v13.5a2.25 2.25 0 01-2.25 2.25H5.25a2.25 2.25 0 01-2.25-2.25V6a2.25 2.25 0 012.25-2.25z"/></svg> Save';
    }
  }
}

// ── Update report unit (ppm/ppb/%) without rebuilding the report ──
function updateReportUnit(unit) {
  unit = unit || 'ppm';
  // Find all element header cells in the live report table
  const reportBody = document.getElementById('report-body');
  if (!reportBody) return;
  const headerCells = reportBody.querySelectorAll('th[data-element]');
  if (!headerCells.length) return;

  headerCells.forEach(th => {
    const el = th.getAttribute('data-element');
    if (el === 'result') {
      // Fallback single-result column
      th.textContent = 'Result (' + unit + ')';
    } else {
      // Capitalize first letter, lowercase rest (e.g., "AU" -> "Au", "CU" -> "Cu")
      const displayEl = el.charAt(0).toUpperCase() + el.slice(1).toLowerCase();
      th.textContent = displayEl + ' (' + unit + ')';
    }
  });
}

function printReport() {
  const source = document.getElementById('report-print-source');
  if (!source) { showToast('No report to print. Please open the report form first.', 'warning'); return; }

  const reportContainer = source.firstElementChild;
  if (!reportContainer) { showToast('No report content found.', 'warning'); return; }

  const clone = reportContainer.cloneNode(true);

  // Copy input values from the live (visible) report into the clone, matched
  // by data attributes (NOT by index) so chunked multi-page reports can never
  // mismatch. Exclude the hidden #report-print-source clone from the source.
  const valueByKey = new Map();
  document.querySelectorAll('#report-body .report-result-input').forEach(input => {
    if (input.closest('#report-print-source')) return;
    const key = (input.getAttribute('data-sample-id') || '') + '\u0001' + (input.getAttribute('data-element') || '');
    valueByKey.set(key, input.value);
  });
  clone.querySelectorAll('.report-result-input').forEach(input => {
    const key = (input.getAttribute('data-sample-id') || '') + '\u0001' + (input.getAttribute('data-element') || '');
    if (valueByKey.has(key)) {
      // setAttribute so the value survives innerHTML serialization
      // (DOM .value property is NOT reflected by innerHTML).
      input.setAttribute('value', valueByKey.get(key));
    }
    input.readOnly = true;
  });

  // Capture method input
  const liveMethod = document.querySelector('#report-body .report-method-input');
  const cloneMethod = clone.querySelector('.report-method-input');
  if (liveMethod && cloneMethod) {
    cloneMethod.setAttribute('value', liveMethod.value);
    cloneMethod.readOnly = true;
  }

  // Capture temp/humidity input
  const liveTemp = document.querySelector('#report-body .report-temp-input');
  const cloneTemp = clone.querySelector('.report-temp-input');
  if (liveTemp && cloneTemp) {
    cloneTemp.setAttribute('value', liveTemp.value);
    cloneTemp.readOnly = true;
  }

  // ── Apply "hide during print" flags ──────────────────────────
  // Read from storage (not from the form-open snapshot) so the printout always
  // matches the last checkbox change.
  const hiddenForPrint = new Set(getHiddenSamplesFor(activeReportHiddenKey));
  if (hiddenForPrint.size > 0) {
    clone.querySelectorAll('tr.report-sample-row').forEach(function(tr) {
      if (hiddenForPrint.has(tr.dataset.sampleId)) tr.remove();
    });
  }

  // Renumber "S. No." per TABLE (every page carries all samples, so each page
  // must restart at 1) and keep the printed "No. of Sample(s)" consistent with
  // the rows that are actually shown.
  let printedSampleCount = 0;
  clone.querySelectorAll('table').forEach(function(tbl) {
    const bodyRows = tbl.querySelectorAll('tr.report-sample-row');
    if (bodyRows.length === 0) return;
    bodyRows.forEach(function(tr, idx) {
      const noCell = tr.querySelector('.report-row-no');
      if (noCell) noCell.textContent = (idx + 1) + '.';
    });
    printedSampleCount = Math.max(printedSampleCount, bodyRows.length);
  });
  if (hiddenForPrint.size > 0 && printedSampleCount > 0) {
    clone.querySelectorAll('.report-sample-count').forEach(function(td) {
      td.textContent = String(printedSampleCount);
    });
  }

  // The Hide column and the footer are screen-only controls — never printed.
  clone.querySelectorAll('.no-print').forEach(function(el) { el.remove(); });

  // Sync element header text (unit may have changed via the Unit dropdown after
  // the report was built) — matched by data-element so chunked pages stay in sync
  const headerByElement = new Map();
  document.querySelectorAll('#report-body th[data-element]').forEach(th => {
    if (th.closest('#report-print-source')) return;
    headerByElement.set(th.getAttribute('data-element'), th.textContent);
  });
  clone.querySelectorAll('th[data-element]').forEach(th => {
    const el = th.getAttribute('data-element');
    if (headerByElement.has(el)) {
      th.textContent = headerByElement.get(el);
    }
  });

  const serialized = clone.innerHTML;

  const fullHtml =
    '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>' + escHtml(activeReportNo || 'Test Report') + '</title>' +
    '<style>' +
      '@import url(\'https://fonts.googleapis.com/css2?family=Times+New+Roman&display=swap\');' +
      'body { font-family: \'Times New Roman\', Times, serif; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
      '@page { size: A4 portrait; margin: 0; }' +
      '@media print { body { background: #fff !important; color: #000 !important; } .no-print { display: none !important; } .print-container { box-shadow: none !important; border: none !important; margin: 0 auto !important; padding: 0 !important; width: 210mm !important; background: transparent !important; } .report-page { box-shadow: none !important; border: none !important; margin: 0 auto !important; padding: 12mm 15mm !important; page-break-after: always; page-break-inside: avoid; break-inside: avoid; } tr { page-break-inside: avoid; } }' +
      '* { margin: 0; padding: 0; box-sizing: border-box; }' +
      'body { background: #fff; display: block; padding: 0; }' +
      '.report-page { width: 210mm; min-height: 297mm; padding: 12mm 15mm !important; margin: 0 auto; background: #fff; border: none; box-shadow: none; page-break-after: always; page-break-inside: avoid; break-inside: avoid; }' +
      '.report-page:last-child { page-break-after: auto; }' +
      '.print-container { box-shadow: none !important; border: none !important; }' +
      'input { border: none !important; outline: none !important; background: transparent !important; }' +
    '</style></head><body>' + serialized + '</body></html>';

  const printWin = window.open('', '_blank', 'width=800,height=600,scrollbars=yes');
  if (!printWin) { showToast('Popup blocked! Please allow popups for this site to print.', 'error'); return; }
  printWin.document.write(fullHtml);
  printWin.document.close();
  printWin.focus();

  setTimeout(() => {
    printWin.print();
    printWin.onafterprint = () => printWin.close();
  }, 500);
}

// ══════════════════════════════════════════════════════════════════
// ── MEASUREMENT UNCERTAINTY (MU) REPORT (NEW — additive only) ────
// Slides in as a side panel (exactly like the test report) over the
// details and shows the SAME report data (serial no, logos, meta
// table, dates, results) with the ISO/IEC 17025 measurement
// uncertainty columns added. Sample RSD starts as "—" and is
// editable per row — the MU and corrected result recalculate live
// as the RSD changes. All existing report functions above are
// left untouched.
// ══════════════════════════════════════════════════════════════════
// Editable engine values — the lab engineer can change all five from the
// ⚙ Parameters popup (openMUParamsModal). MU_DEFAULTS keeps the reference
// values so 'Restore Defaults' can put them back; every open / re-render
// of the MU report reads the current muParams.
const MU_DEFAULTS = { rbar: 0.95, sR: 4.0, n: 10, uCert: 4.0, k: 2 };
let muParams = Object.assign({}, MU_DEFAULTS);
const MU_ROWS_PER_PAGE = 14;    // body rows per printed page
const MU_LAST_PAGE_ROWS = 10;   // rows allowed on the page carrying the terms

// Live handles for the open MU panel: raw concentration per row plus
// direct cell/input references, so an RSD edit recalculates only that
// row without re-rendering the panel.
let activeMURows = [];    // [{ rawValue: number|null, unit: string, sampleKey: string }]
let activeMUCells = [];   // [{ input, tdMu, tdFull }] — index-aligned with activeMURows

// Two-sided Student's t critical value at 95% confidence (alpha = 0.05)
function muReportTCrit(df) {
  const table = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
    6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
    11: 2.201, 12: 2.179, 15: 2.131, 20: 2.086, 30: 2.042
  };
  if (table[df]) return table[df];
  return df > 30 ? 2.00 : 2.262;
}

// ISO/IEC 17025 measurement uncertainty for a single concentration:
// CRM bias t-test -> bias correction -> combined relative uncertainty
// -> expanded uncertainty U = k * u_c,rel * C_corr.
function muReportCompute(rawConc, rsdPct, overrides) {
  const p = overrides || muParams;
  const Rbar = parseFloat(p.rbar);
  const sR = (parseFloat(p.sR) || 0) / 100;
  const n = Math.max(2, Math.round(parseFloat(p.n) || 2));
  const Ucert = (parseFloat(p.uCert) || 0) / 100;
  const k = parseFloat(p.k) || 1;
  const rsdFrac = (parseFloat(rsdPct) || 0) / 100;

  const seR = sR / Math.sqrt(n);
  const tStat = seR > 0 ? Math.abs(1 - Rbar) / seR : 0;
  const df = Math.max(1, n - 1);
  const tCrit = muReportTCrit(df);
  const isSignificant = tStat > tCrit;

  const uCrm = Ucert / 2; // k_cert = 2
  const uBias = isSignificant
    ? Math.sqrt(Math.pow(sR / (Rbar * Math.sqrt(n)), 2) + Math.pow(uCrm, 2))
    : Math.sqrt(Math.pow(1 - Rbar, 2) + Math.pow(sR / (Rbar * Math.sqrt(n)), 2) + Math.pow(uCrm, 2));

  const rEff = isSignificant ? Rbar : 1.0;
  const cCorr = rawConc / rEff;
  const ucRel = Math.sqrt(Math.pow(rsdFrac, 2) + Math.pow(uBias, 2));
  const U = k * ucRel * cCorr;
  const decimals = U < 0.095 ? 3 : 2;

  return {
    tStat: tStat, tCrit: tCrit, df: df, isSignificant: isSignificant,
    uBias: uBias, rEff: rEff, cCorr: cCorr, ucRel: ucRel, U: U, k: k,
    decimals: decimals,
    uDisplay: '\u00b1 ' + U.toFixed(decimals),
    cDisplay: cCorr.toFixed(decimals),
    fullDisplay: cCorr.toFixed(decimals) + ' \u00b1 ' + U.toFixed(decimals)
  };
}

// Read one label -> value pair out of the live report's meta table.
// Value cells may contain an <input> (method, temperature) — use its value.
function muReportMetaValue(metaTable, label) {
  if (!metaTable) return '';
  for (let r = 0; r < metaTable.rows.length; r++) {
    const cells = metaTable.rows[r].cells;
    for (let c = 0; c < cells.length - 1; c++) {
      if (cells[c].textContent.trim() === label) {
        const inp = cells[c + 1].querySelector('input');
        if (inp) return (inp.value || '').trim();
        return cells[c + 1].textContent.trim();
      }
    }
  }
  return '';
}

// Split MU rows into page chunks: body pages hold MU_ROWS_PER_PAGE rows
// and the final page carries the disclaimer / signatures, so it is capped
// at MU_LAST_PAGE_ROWS (an extra terms-only page is added when needed).
function muChunkRows(allRows) {
  const n = allRows.length;
  if (n <= MU_LAST_PAGE_ROWS) return [allRows.slice()];
  const chunks = [];
  let i = 0;
  while (i < n) {
    const remaining = n - i;
    if (remaining <= MU_ROWS_PER_PAGE + MU_LAST_PAGE_ROWS) {
      if (remaining <= MU_ROWS_PER_PAGE) {
        chunks.push(allRows.slice(i));
        chunks.push([]); // dedicated terms-only page
      } else {
        chunks.push(allRows.slice(i, i + MU_ROWS_PER_PAGE));
        chunks.push(allRows.slice(i + MU_ROWS_PER_PAGE));
      }
      break;
    }
    chunks.push(allRows.slice(i, i + MU_ROWS_PER_PAGE));
    i += MU_ROWS_PER_PAGE;
  }
  return chunks;
}


// ── Recalculate ONE row's MU cells from its (possibly empty) RSD input ──
function updateMUReportRow(idx) {
  const cell = activeMUCells[idx];
  const row = activeMURows[idx];
  if (!cell || !row) return;

  const rsdRaw = cell.input ? String(cell.input.value === undefined || cell.input.value === null ? '' : cell.input.value).trim() : '';
  const rsd = parseFloat(rsdRaw);
  const canCompute = row.rawValue !== null && rsdRaw !== '' && isFinite(rsd) && rsd >= 0;

  if (!canCompute) {
    cell.tdMu.textContent = '\u2014';
    cell.tdFull.textContent = '\u2014';
    return;
  }

  const res = muReportCompute(row.rawValue, rsd);
  cell.tdMu.innerHTML =
    '<span style="font-size:14px;font-weight:700;">' + res.uDisplay + ' ' + escHtml(row.unit) + '</span>' +
    '<br/><span style="font-size:10.5px;font-weight:400;color:#475569;font-style:italic;">u_c,rel = ' + (res.ucRel * 100).toFixed(2) + ' % (RSD = ' + rsd + ' %)</span>';
  cell.tdFull.textContent = res.fullDisplay + ' ' + row.unit;
}

// Batch fill: give every row a RANDOM Sample RSD (%) drawn uniformly from
// the Min–Max range in the header (a single value fills all rows alike).
function applyMUDefaultRSD() {
  const minBox = document.getElementById('mu-rsd-min');
  const maxBox = document.getElementById('mu-rsd-max');
  const minRaw = minBox ? String(minBox.value).trim() : '';
  const maxRaw = maxBox ? String(maxBox.value).trim() : '';

  if (minRaw === '' && maxRaw === '') {
    showToast('Enter a Min (and optionally Max) RSD (%) in the header box first.', 'warning');
    return;
  }
  if (!activeMUCells.length) {
    showToast('Open the MU report first.', 'warning');
    return;
  }

  let lo = parseFloat(minRaw === '' ? maxRaw : minRaw);
  let hi = parseFloat(maxRaw === '' ? minRaw : maxRaw);
  if (!isFinite(lo) || lo < 0 || !isFinite(hi) || hi < 0) {
    showToast('Please enter valid RSD (%) values (0 or more).', 'warning');
    return;
  }
  if (hi < lo) {
    const tmp = lo; lo = hi; hi = tmp;
    if (minBox) minBox.value = String(lo);
    if (maxBox) maxBox.value = String(hi);
    showToast('Max was smaller than Min — the range was swapped.', 'info');
  }

  let filled = 0;
  activeMUCells.forEach(function(cell, idx) {
    if (!cell.input) return;
    const val = lo === hi ? lo : Math.round((lo + Math.random() * (hi - lo)) * 100) / 100;
    cell.input.value = String(val);
    updateMUReportRow(idx);
    filled++;
  });
  showToast(filled + ' row(s) filled with a random RSD between ' + lo + ' % and ' + hi + ' %.', 'success');
}

// ── ⚙ Uncertainty parameters popup (editable Mean recovery, s_R, n, U_cert, k) ──
// The five engine values are read into / out of muParams; the derived
// quantities (u_bias, t, t_crit, df, C_corr) are recomputed live.
function muFillParamsInputs(p) {
  const set = function(id, v) { const el = document.getElementById(id); if (el) el.value = String(v); };
  set('mup-rbar', p.rbar);
  set('mup-sr', p.sR);
  set('mup-n', p.n);
  set('mup-ucert', p.uCert);
  set('mup-k', p.k);
}

// Read + validate the popup fields. Returns a params object or null.
// 'silent' suppresses the toasts (used by the live preview).
function muReadParamsInputs(silent) {
  const get = function(id) { const el = document.getElementById(id); return el ? String(el.value).trim() : ''; };
  const bad = function(msg) { if (!silent) showToast(msg, 'warning'); return null; };
  const rbar = parseFloat(get('mup-rbar'));
  const sR = parseFloat(get('mup-sr'));
  const n = parseFloat(get('mup-n'));
  const uCert = parseFloat(get('mup-ucert'));
  const k = parseFloat(get('mup-k'));
  if (!isFinite(rbar) || rbar <= 0) return bad('Mean recovery R\u0304 must be greater than 0.');
  if (!isFinite(sR) || sR < 0) return bad('s_R (%) must be 0 or more.');
  if (!isFinite(n) || n < 2) return bad('n must be at least 2 (df = n \u2212 1).');
  if (!isFinite(uCert) || uCert < 0) return bad('U_cert (%) must be 0 or more.');
  if (!isFinite(k) || k <= 0) return bad('k must be greater than 0.');
  return { rbar: rbar, sR: sR, n: Math.round(n), uCert: uCert, k: k };
}

// Live preview of the derived quantities while the popup is open.
function updateMUParamsPreview() {
  const box = document.getElementById('mup-preview');
  if (!box) return;
  const cand = muReadParamsInputs(true);
  if (!cand) {
    box.textContent = 'Enter all five values (n \u2265 2) to preview the derived quantities\u2026';
    return;
  }
  const res = muReportCompute(1, 0, cand);
  box.innerHTML =
    '<strong style=\'color:#065f46;\'>Derived from these values:</strong> ' +
    'u_bias = ' + (res.uBias * 100).toFixed(2) + ' % \u00b7 t = ' + res.tStat.toFixed(2) +
    ' vs t_crit = ' + res.tCrit.toFixed(2) + ' (df = ' + res.df + ') \u2192 ' +
    (res.isSignificant ? 'bias significant, C_corr = C / R\u0304' : 'bias not significant, C_corr = C');
}

function openMUParamsModal() {
  muFillParamsInputs(muParams);
  updateMUParamsPreview();
  openModal('modal-mu-params');
}

function resetMUParamsToDefaults() {
  muFillParamsInputs(MU_DEFAULTS);
  updateMUParamsPreview();
}

// Apply the popup values: validate -> store -> re-render the open report.
// Sample RSD values already entered are preserved across the re-render.
function applyMUParams() {
  const cand = muReadParamsInputs(false);
  if (!cand) return;
  muParams = cand;

  const muBtn = document.getElementById('btn-mu-report');
  if (muBtn) muBtn.title = 'Open Measurement Uncertainty (MU) report - k = ' + muParams.k;

  closeModal('modal-mu-params');

  const body = document.getElementById('mu-report-body');
  const hasOpenReport = body && body.querySelector('.report-page');
  if (hasOpenReport) {
    if (openMUReport() === false) {
      body.innerHTML = '';
      closePanel('mu-report-overlay');
      showToast('Parameters saved. Reopen the MU report from the report form to see them.', 'info');
    } else {
      showToast('Uncertainty parameters updated — report recalculated.', 'success');
    }
  } else {
    showToast('Uncertainty parameters updated.', 'success');
  }
}

// ── Open the Measurement Uncertainty report (sliding side panel) ──
function openMUReport() {
  const body = document.getElementById('mu-report-body');
  if (!body) return false;

  // ── 1. Same data as the live report ─────────────────────────────
  const livePages = Array.from(document.querySelectorAll('#report-body .report-page'))
    .filter(function(p) { return !p.closest('#report-print-source'); });
  if (!livePages.length) {
    showToast('No report to open. Please open the report form first.', 'warning');
    return false;
  }
  const metaTable = livePages[0].querySelector('table');

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const unitSelect = document.getElementById('report-unit-select');
  const reportUnit = unitSelect ? unitSelect.value : 'ppm';

  const meta = {
    reportNo: muReportMetaValue(metaTable, 'Report No:') || activeReportNo || '\u2014',
    issueDate: muReportMetaValue(metaTable, 'Report issue Date:') || today,
    customer: muReportMetaValue(metaTable, 'Name & Address of Customer:') || '\u2014',
    sampleCount: muReportMetaValue(metaTable, 'No. of Sample(s):') || '0',
    location: muReportMetaValue(metaTable, 'Location of Sample (Given by customer)') || 'NA',
    receivingDate: muReportMetaValue(metaTable, 'Sample receiving Date') || '\u2014',
    description: muReportMetaValue(metaTable, 'Description of Sample:') || 'Powder',
    analysisDate: muReportMetaValue(metaTable, 'Sample analysis Date') || today,
    method: muReportMetaValue(metaTable, 'Method used /Specs:') || '',
    temp: muReportMetaValue(metaTable, 'Temperature & Humidity') || ''
  };

  // Element order, taken from the live table headers (pages are chunked)
  const elements = [];
  document.querySelectorAll('#report-body th[data-element]').forEach(function(th) {
    if (th.closest('#report-print-source')) return;
    const el = th.getAttribute('data-element');
    if (el && elements.indexOf(el) === -1) elements.push(el);
  });

  // Sample rows + result values — every sample is listed on screen (the
  // report panel works the same way); "hide during print" is applied
  // later, when the MU report is printed.
  const samples = [];
  const indexBySample = new Map();

  document.querySelectorAll('#report-body tr.report-sample-row').forEach(function(tr) {
    if (tr.closest('#report-print-source')) return;
    const rowKey = tr.dataset.sampleId || '';
    const idCell = tr.querySelector('.report-sample-id');
    const label = idCell ? idCell.textContent.trim() : '\u2014';
    const mapKey = rowKey + '\u0001' + label;
    let entry = indexBySample.get(mapKey);
    if (!entry) {
      entry = { key: rowKey, label: label, values: {} };
      indexBySample.set(mapKey, entry);
      samples.push(entry);
    }
    tr.querySelectorAll('.report-result-input').forEach(function(input) {
      const el = input.getAttribute('data-element') || 'result';
      const val = (input.value || '').trim();
      if (entry.values[el] === undefined || (entry.values[el] === '' && val !== '')) {
        entry.values[el] = val;
      }
    });
  });

  // ── 2. Flatten into one row per result (reference layout) ────────
  const elementCols = elements.length > 0 ? elements : ['result'];
  const showElementCol = elements.length > 1;
  const muProbe = muReportCompute(1, 0); // u_bias / t do not depend on RSD

  const rows = [];
  samples.forEach(function(sample) {
    elementCols.forEach(function(el) {
      const rawStr = sample.values[el] !== undefined ? String(sample.values[el]).trim() : '';
      const rawNum = parseFloat(rawStr);
      const hasValue = rawStr !== '' && isFinite(rawNum);
      let elName = 'Result';
      if (el !== 'result') elName = el.charAt(0).toUpperCase() + el.slice(1).toLowerCase();
      rows.push({
        no: rows.length + 1,
        sampleKey: sample.key,
        label: sample.label,
        element: elName,
        rawDisplay: hasValue ? rawStr : '\u2014',
        rawValue: hasValue ? rawNum : null
      });
    });
  });

  // ── 3. Build the report pages into the sliding panel ─────────────
  // Capture any Sample RSD (%) already typed so a re-render (parameter
  // change, reopen) keeps them. Keyed by sample + element.
  const priorRSD = {};
  activeMURows.forEach(function(r, i) {
    const c = activeMUCells[i];
    if (!c || !c.input) return;
    const v = String(c.input.value === undefined || c.input.value === null ? '' : c.input.value).trim();
    if (v !== '') priorRSD[(r.sampleKey || '') + '\u0001' + (r.element || '')] = v;
  });

  activeMURows = [];
  activeMUCells = [];

  const titleEl = document.getElementById('mu-report-title');
  if (titleEl) titleEl.textContent = ' \u2014 ' + meta.reportNo;

  const reportDiv = document.createElement('div');
  reportDiv.style.cssText = 'padding:16px 0;';
  const chunks = muChunkRows(rows);
  const totalPages = chunks.length;

  chunks.forEach(function(chunkRows, pageIdx) {
    const pageNum = pageIdx + 1;
    const isLastPage = pageIdx === totalPages - 1;

    const pageDiv = document.createElement('div');
    pageDiv.className = 'report-page print-container';
    pageDiv.style.cssText = 'width:auto;min-height:297mm;background:#fff;padding:30px 35px;margin-bottom:20px;border-radius:16px;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(0,0,0,0.08);font-family:Times New Roman,Times,serif;color:#000;';

    // Top Right Serial Number (same as the test report)
    const serialDiv = document.createElement('div');
    serialDiv.style.cssText = 'text-align:right;font-size:12px;font-weight:700;color:#065f46;margin-bottom:8px;';
    serialDiv.textContent = 'Test Report Sr. No ' + meta.reportNo;
    pageDiv.appendChild(serialDiv);

    // Header Section with Logos (identical to the test report)
    const headerDiv = document.createElement('div');
    headerDiv.style.cssText = 'display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:12px;';

    const leftLogo = document.createElement('div');
    leftLogo.style.cssText = 'width:96px;height:96px;display:flex;align-items:center;justify-content:center;overflow:hidden;';
    const logoImg = document.createElement('img');
    logoImg.src = '../logo/logo.png';
    logoImg.style.cssText = 'max-width:80px;max-height:80px;object-fit:contain;border-radius:4px;';
    logoImg.alt = 'GARL Logo';
    leftLogo.appendChild(logoImg);
    headerDiv.appendChild(leftLogo);

    const centerText = document.createElement('div');
    centerText.style.cssText = 'text-align:center;flex:1;padding:0 8px;';
    centerText.innerHTML =
      '<h1 style="font-size:14px;font-weight:700;letter-spacing:0.04em;color:#065f46;text-transform:uppercase;margin:0;">GOVERNMENT OF PAKISTAN</h1>' +
      '<h2 style="font-size:13px;font-weight:700;letter-spacing:0.04em;color:#065f46;text-transform:uppercase;margin:2px 0;">MINISTRY OF ENERGY (PETROLEUM DIVISION)</h2>' +
      '<h3 style="font-size:13px;font-weight:700;letter-spacing:0.04em;color:#065f46;text-transform:uppercase;margin:2px 0;">GEOLOGICAL SURVEY OF PAKISTAN</h3>' +
      '<h4 style="font-size:14px;font-weight:700;letter-spacing:0.04em;color:#065f46;text-transform:uppercase;margin:2px 0;">GEOSCIENCE ADVANCED RESEARCH LABORATORIES</h4>' +
      '<p style="font-size:13px;font-weight:700;letter-spacing:0.04em;color:#065f46;text-transform:uppercase;margin:2px 0;">ISLAMABAD</p>';
    headerDiv.appendChild(centerText);

    const rightLogo = document.createElement('div');
    rightLogo.style.cssText = 'width:112px;display:flex;flex-direction:column;align-items:center;justify-content:center;';
    const certImg = document.createElement('img');
    certImg.src = activeReportType === 'qscert' ? '../logo/qscert.png' : '../logo/PNAC.png';
    certImg.style.cssText = 'max-width:100px;max-height:80px;object-fit:contain;';
    certImg.alt = activeReportType === 'qscert' ? 'QSCert Logo' : 'PNAC Logo';
    rightLogo.appendChild(certImg);
    headerDiv.appendChild(rightLogo);
    pageDiv.appendChild(headerDiv);

    // Customer & Sample Details Metadata Table — same rows & dates
    const metaCell = 'border:1px solid #000;padding:4px 8px;font-size:13.5px;';
    const metaLbl = metaCell + 'font-weight:700;';
    const metaVal = metaCell + 'text-align:center;';
    const metaEl = document.createElement('table');
    metaEl.style.cssText = 'width:100%;border-collapse:collapse;border:1px solid #000;margin-bottom:24px;';
    metaEl.innerHTML =
      '<tbody>' +
        '<tr><td style="' + metaLbl + 'width:28%;">Report No:</td><td style="' + metaVal + 'font-weight:700;color:#065f46;width:24%;">' + escHtml(meta.reportNo) + '</td><td style="' + metaLbl + 'width:24%;">Report issue Date:</td><td style="' + metaVal + 'width:24%;">' + escHtml(meta.issueDate) + '</td></tr>' +
        '<tr><td style="' + metaLbl + '">Name & Address of Customer:</td><td style="' + metaVal + '">' + escHtml(meta.customer) + '</td><td style="' + metaLbl + '">No. of Sample(s):</td><td class="report-sample-count" style="' + metaVal + '">' + escHtml(meta.sampleCount) + '</td></tr>' +
        '<tr><td style="' + metaLbl + '">Location of Sample (Given by customer)</td><td style="' + metaVal + '">' + escHtml(meta.location) + '</td><td style="' + metaLbl + '">Sample receiving Date</td><td style="' + metaVal + '">' + escHtml(meta.receivingDate) + '</td></tr>' +
        '<tr><td style="' + metaLbl + '">Description of Sample:</td><td style="' + metaVal + '">' + escHtml(meta.description) + '</td><td style="' + metaLbl + '">Sample analysis Date</td><td style="' + metaVal + '">' + escHtml(meta.analysisDate) + '</td></tr>' +
        '<tr><td style="' + metaLbl + '">Method used /Specs:</td><td style="' + metaVal + '">' + escHtml(meta.method || '\u2014') + '</td><td style="' + metaLbl + '">Temperature & Humidity</td><td style="' + metaVal + '">' + escHtml(meta.temp || '\u2014') + '</td></tr>' +
      '</tbody>';
    pageDiv.appendChild(metaEl);

    // Heading (continuation pages are labelled and numbered)
    const heading = document.createElement('div');
    heading.style.cssText = 'font-weight:700;font-size:15px;margin-bottom:8px;padding-left:16px;';
    heading.textContent = pageNum === 1 ? 'Measurement Uncertainty Report:' : 'Measurement Uncertainty Report (Continued):';
    pageDiv.appendChild(heading);

    // Uncertainty parameters strip (reference engine constants)
    const paramDiv = document.createElement('div');
    paramDiv.style.cssText = 'font-size:11.5px;color:#374151;margin:-4px 0 8px 16px;line-height:1.5;';
    paramDiv.innerHTML =
      '<strong style="color:#065f46;">Uncertainty parameters:</strong> ' +
      'Mean recovery R\u0304 = ' + muParams.rbar + ' \u00b7 s_R = ' + muParams.sR.toFixed(2) + ' % \u00b7 n = ' + muParams.n +
      ' \u00b7 U_cert = ' + muParams.uCert.toFixed(2) + ' % \u00b7 k = ' + muParams.k +
      ' \u00b7 u_bias = ' + (muProbe.uBias * 100).toFixed(2) + ' %' +
      ' \u00b7 t = ' + muProbe.tStat.toFixed(2) + ' vs t_crit = ' + muProbe.tCrit.toFixed(2) + ' (df = ' + muProbe.df + ') \u2192 ' +
      (muProbe.isSignificant ? 'bias significant, C_corr = C / R\u0304' : 'bias not significant, C_corr = C') +
      ' \u00b7 Sample RSD: entered per row (\u2014 until filled)' +
      ' <button type="button" class="no-print" onclick="openMUParamsModal()" title="Edit the uncertainty parameters"' +
      ' style="font-family:inherit;font-size:10.5px;font-weight:700;padding:1px 8px;margin-left:6px;vertical-align:middle;cursor:pointer;border:1px solid #065f46;border-radius:4px;background:#ecfdf5;color:#065f46;">\u2699 Edit</button>';
    pageDiv.appendChild(paramDiv);

    if (totalPages > 1) {
      const rangeDiv = document.createElement('div');
      rangeDiv.style.cssText = 'font-size:12px;color:#374151;margin:-4px 0 8px 16px;';
      const rangeStart = chunkRows.length ? chunkRows[0].no : 0;
      const rangeEnd = chunkRows.length ? chunkRows[chunkRows.length - 1].no : 0;
      rangeDiv.textContent = 'Results ' + rangeStart + '\u2013' + rangeEnd + ' of ' + rows.length + ' \u00b7 Page ' + pageNum + ' of ' + totalPages;
      pageDiv.appendChild(rangeDiv);
    }


    // Test Results table with editable Sample RSD + live MU columns
    if (chunkRows.length > 0) {
      const thStyle = 'border:1px solid #000;padding:4px 6px;text-align:center;font-weight:700;font-size:13px;';
      let headHtml = '<thead><tr style="background:#f9fafb;">' +
        '<th style="' + thStyle + 'width:6%;">S. No.</th>' +
        '<th style="' + thStyle + 'min-width:150px;">Sample ID</th>' +
        (showElementCol ? '<th style="' + thStyle + 'width:9%;">Element</th>' : '') +
        '<th style="' + thStyle + 'background:#f0f9ff;">Instrument Reading<br/>C (' + escHtml(reportUnit) + ')</th>' +
        '<th style="' + thStyle + 'background:#fefce8;">Sample RSD<br/>(%)</th>' +
        '<th style="' + thStyle + 'background:#e6f4ea;color:#065f46;">Measurement Uncertainty<br/>(MU, k = ' + muParams.k + ')</th>' +
        '<th style="' + thStyle + 'width:17%;">Corrected Result<br/>[C \u00b1 U ' + escHtml(reportUnit) + ']</th>' +
        '</tr></thead>';

      const table = document.createElement('table');
      table.style.cssText = 'width:100%;border-collapse:collapse;border:1px solid #000;margin-bottom:10px;';
      table.innerHTML = headHtml;

      const tbody = document.createElement('tbody');
      const cellBase = 'border:1px solid #000;padding:4px 6px;text-align:center;font-size:13.5px;';

      chunkRows.forEach(function(row) {
        const rowIdx = activeMURows.length;
        activeMURows.push({ rawValue: row.rawValue, unit: reportUnit, sampleKey: row.sampleKey, element: row.element });

        const tr = document.createElement('tr');
        tr.className = 'report-sample-row mu-sample-row';
        tr.dataset.sampleId = row.sampleKey;

        const tdNo = document.createElement('td');
        tdNo.className = 'mu-row-no';
        tdNo.style.cssText = cellBase;
        tdNo.textContent = row.no + '.';
        tr.appendChild(tdNo);

        const tdId = document.createElement('td');
        tdId.style.cssText = cellBase + 'white-space:nowrap;';
        tdId.textContent = row.label;
        tr.appendChild(tdId);

        if (showElementCol) {
          const tdEl = document.createElement('td');
          tdEl.style.cssText = cellBase;
          tdEl.textContent = row.element;
          tr.appendChild(tdEl);
        }

        const tdRaw = document.createElement('td');
        tdRaw.style.cssText = cellBase + 'background:#f0f9ff;font-weight:700;';
        tdRaw.textContent = row.rawDisplay;
        tr.appendChild(tdRaw);

        // Editable Sample RSD — starts empty ("—" placeholder)
        const tdRsd = document.createElement('td');
        tdRsd.style.cssText = cellBase + 'background:#fefce8;padding:2px 4px;';
        const rsdInput = document.createElement('input');
        rsdInput.type = 'number';
        rsdInput.step = 'any';
        rsdInput.min = '0';
        rsdInput.className = 'mu-rsd-input';
        rsdInput.placeholder = '\u2014';
        rsdInput.value = '';
        rsdInput.title = 'Enter Sample RSD (%) — the MU updates live';
        rsdInput.setAttribute('data-row', String(rowIdx));
        rsdInput.style.cssText = 'width:100%;border:none;outline:none;text-align:center;font-size:13.5px;font-family:Times New Roman,Times,serif;background:transparent;padding:2px 0;font-weight:700;';
        rsdInput.addEventListener('input', function() { updateMUReportRow(rowIdx); });
        const priorKey = (row.sampleKey || '') + '\u0001' + row.element;
        if (priorRSD[priorKey] !== undefined) rsdInput.value = priorRSD[priorKey];
        tdRsd.appendChild(rsdInput);
        tr.appendChild(tdRsd);

        // Measurement Uncertainty (k = 2) — "—" until an RSD is entered
        const tdMu = document.createElement('td');
        tdMu.style.cssText = cellBase + 'background:#e6f4ea;color:#065f46;';
        tdMu.textContent = '\u2014';
        tr.appendChild(tdMu);

        // Corrected Result [C \u00b1 U] — "—" until an RSD is entered
        const tdFull = document.createElement('td');
        tdFull.style.cssText = cellBase + 'font-weight:700;';
        tdFull.textContent = '\u2014';
        tr.appendChild(tdFull);

        activeMUCells.push({ input: rsdInput, tdMu: tdMu, tdFull: tdFull });
        if (rsdInput.value !== '') updateMUReportRow(rowIdx);

        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      pageDiv.appendChild(table);

      // Footnote (reference wording, adapted for editable RSD)
      const noteDiv = document.createElement('div');
      noteDiv.style.cssText = 'font-size:11.5px;color:#475569;font-style:italic;margin-bottom:24px;';
      noteDiv.innerHTML =
        '* Measurement uncertainty is calculated per result from its concentration and the sample RSD (%) combined with the CRM bias uncertainty at 95% confidence (k = ' + muParams.k + '): u<sub>c,rel</sub> = \u221a(RSD\u00b2 + u<sub>bias</sub>\u00b2) and U = k \u00b7 u<sub>c,rel</sub> \u00b7 C<sub>corr</sub>. ' +
        (muProbe.isSignificant
          ? 'Bias correction applied (t = ' + muProbe.tStat.toFixed(2) + ' > t<sub>crit</sub> = ' + muProbe.tCrit.toFixed(2) + ' \u2192 significant), so C<sub>corr</sub> = C / R\u0304. '
          : 'Bias not significant (t = ' + muProbe.tStat.toFixed(2) + ' \u2264 t<sub>crit</sub> = ' + muProbe.tCrit.toFixed(2) + '), so C<sub>corr</sub> = C. ') +
        'Enter the Sample RSD (%) in each row (shown as \u2014 until filled) \u2014 the MU and corrected result update live as it changes.';
      pageDiv.appendChild(noteDiv);
    }

    // Disclaimer / Terms, "End of Report" and signatures — LAST page only
    if (isLastPage) {
      const disclaimerDiv = document.createElement('div');
      disclaimerDiv.style.cssText = 'margin-bottom:32px;';
      disclaimerDiv.innerHTML =
        '<h5 style="font-weight:700;font-size:13.5px;margin-bottom:12px;padding-left:16px;">Disclaimer / Terms of Test Report</h5>' +
        '<ul style="list-style:none;padding:0 16px;margin:0;">' +
          '<li style="position:relative;padding-left:18px;margin-bottom:4px;font-size:12.5px;line-height:1.35;">\u2022 This report is based solely on the specific sample(s) submitted by the customer. It must not be reproduced in part without prior written consent.</li>' +
          '<li style="position:relative;padding-left:18px;margin-bottom:4px;font-size:12.5px;line-height:1.35;">\u2022 Sampling was not carried out by GARL. Therefore, the laboratory does not accept responsibility for whether the submitted sample(s) accurately represent any larger batch, stock, or full production lot.</li>' +
          '<li style="position:relative;padding-left:18px;margin-bottom:4px;font-size:12.5px;line-height:1.35;">\u2022 The customer is fully responsible for the ethical and appropriate use of the test results. The laboratory shall not be held liable for any claims or consequences arising from the use or interpretation of the data by the customer or third parties.</li>' +
          '<li style="position:relative;padding-left:18px;margin-bottom:4px;font-size:12.5px;line-height:1.35;">\u2022 The information in this report may not be used for product promotion, commercial advertising, or publicity purposes.</li>' +
          '<li style="position:relative;padding-left:18px;margin-bottom:4px;font-size:12.5px;line-height:1.35;">\u2022 After the report is issued, the sample(s) will be retained for a period of 1 month, unless an alternative arrangement has been agreed upon.</li>' +
          '<li style="position:relative;padding-left:18px;margin-bottom:4px;font-size:12.5px;line-height:1.35;">\u2022 Statement of conformity /compliance (where applicable): NA</li>' +
          '<li style="position:relative;padding-left:18px;margin-bottom:4px;font-size:12.5px;line-height:1.35;">\u2022 Remarks/Comments (where requested) = NA</li>' +
          '<li style="position:relative;padding-left:18px;margin-bottom:4px;font-size:12.5px;line-height:1.35;">\u2022 Analysis Not required = NR</li>' +
          '<li style="position:relative;padding-left:18px;margin-bottom:4px;font-size:12.5px;line-height:1.35;">\u2022 BDL = Below Detection Limit</li>' +
        '</ul>';
      pageDiv.appendChild(disclaimerDiv);

      const endDiv = document.createElement('div');
      endDiv.style.cssText = 'text-align:center;font-weight:700;font-size:14px;margin:32px 0;';
      endDiv.textContent = 'End of Report';
      pageDiv.appendChild(endDiv);

      const sigDiv = document.createElement('div');
      sigDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-end;margin-top:64px;padding:16px 16px 0;';
      sigDiv.innerHTML =
        '<div style="text-align:left;">' +
          '<div style="font-weight:700;font-size:13.5px;">Quality Manager</div>' +
          '<div style="font-size:12px;margin-top:2px;">(Verified <span style="text-decoration:underline;color:#1d4ed8;font-family:sans-serif;">by</span>)</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
          '<div style="font-weight:700;font-size:13.5px;">Technical Manager</div>' +
          '<div style="font-size:12px;margin-top:2px;">(Issued by)</div>' +
        '</div>';
      pageDiv.appendChild(sigDiv);
    }

    reportDiv.appendChild(pageDiv);
  });

  // Fill the panel and slide it in exactly like the test report
  body.innerHTML = '';
  body.appendChild(reportDiv);
  openPanel('mu-report-overlay');
  return true;
}


// ── Print / Save the MU report (same A4 format as printReport) ───
function printMUReport() {
  const body = document.getElementById('mu-report-body');
  const reportDiv = body ? body.firstElementChild : null;
  if (!reportDiv) { showToast('No MU report to print. Please open the MU report first.', 'warning'); return; }

  const clone = reportDiv.cloneNode(true);

  // Screen-only controls (the ⚙ Edit parameters button) never print
  clone.querySelectorAll('.no-print').forEach(function(el) { el.remove(); });

  // RSD inputs do not serialise their value property — bake the LIVE
  // value into the clone as plain text ("—" when still empty).
  clone.querySelectorAll('.mu-rsd-input').forEach(function(inp) {
    const idx = parseInt(inp.getAttribute('data-row'), 10);
    const cell = activeMUCells[idx];
    const v = cell && cell.input ? String(cell.input.value === undefined || cell.input.value === null ? '' : cell.input.value).trim() : '';
    const txt = document.createTextNode(v !== '' ? v : '\u2014');
    if (inp.parentNode) inp.parentNode.replaceChild(txt, inp);
  });

  // ── Apply "hide during print" flags (same as printReport) ───────
  const hiddenForPrint = new Set(getHiddenSamplesFor(activeReportHiddenKey));
  if (hiddenForPrint.size > 0) {
    clone.querySelectorAll('tr.mu-sample-row').forEach(function(tr) {
      if (hiddenForPrint.has(tr.dataset.sampleId)) tr.remove();
    });
    clone.querySelectorAll('table').forEach(function(tbl) {
      const bodyRows = tbl.querySelectorAll('tr.mu-sample-row');
      bodyRows.forEach(function(tr, i) {
        const noCell = tr.querySelector('.mu-row-no');
        if (noCell) noCell.textContent = (i + 1) + '.';
      });
    });
    // "No. of Sample(s)" counts distinct SAMPLES (rows are sample x element)
    const remainingKeys = new Set();
    let printedRowCount = 0;
    clone.querySelectorAll('tr.mu-sample-row').forEach(function(tr) {
      printedRowCount++;
      if (tr.dataset.sampleId) remainingKeys.add(tr.dataset.sampleId);
    });
    const printedSampleCount = remainingKeys.size > 0 ? remainingKeys.size : printedRowCount;
    if (printedSampleCount > 0) {
      clone.querySelectorAll('.report-sample-count').forEach(function(td) {
        td.textContent = String(printedSampleCount);
      });
    }
  }

  const serialized = clone.innerHTML;

  const fullHtml =
    '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>Measurement Uncertainty Report</title>' +
    '<style>' +
      '@import url(\'https://fonts.googleapis.com/css2?family=Times+New+Roman&display=swap\');' +
      'body { font-family: \'Times New Roman\', Times, serif; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
      '@page { size: A4 portrait; margin: 0; }' +
      '@media print { body { background: #fff !important; color: #000 !important; } .no-print { display: none !important; } .print-container { box-shadow: none !important; border: none !important; margin: 0 auto !important; padding: 0 !important; width: 210mm !important; background: transparent !important; } .report-page { box-shadow: none !important; border: none !important; margin: 0 auto !important; padding: 12mm 15mm !important; page-break-after: always; page-break-inside: avoid; break-inside: avoid; } tr { page-break-inside: avoid; } }' +
      '* { margin: 0; padding: 0; box-sizing: border-box; }' +
      'body { background: #fff; display: block; padding: 0; }' +
      '.report-page { width: 210mm; min-height: 297mm; padding: 12mm 15mm !important; margin: 0 auto; background: #fff; border: none; box-shadow: none; page-break-after: always; page-break-inside: avoid; break-inside: avoid; }' +
      '.report-page:last-child { page-break-after: auto; }' +
      '.print-container { box-shadow: none !important; border: none !important; }' +
    '</style></head><body>' + serialized + '</body></html>';

  const printWin = window.open('', '_blank', 'width=800,height=600,scrollbars=yes');
  if (!printWin) { showToast('Popup blocked! Please allow popups for this site to print.', 'error'); return; }
  printWin.document.write(fullHtml);
  printWin.document.close();
  printWin.focus();

  setTimeout(() => {
    printWin.print();
    printWin.onafterprint = () => printWin.close();
  }, 500);
}

// ── Toggle instrument selection and vitals ──────────────────────
function toggleInstrument(instrument) {
  document.querySelectorAll('.inst-chk').forEach(el => {
    el.style.background = 'transparent';
    el.textContent = '';
  });
  document.querySelectorAll('.vitals-block').forEach(el => { el.style.display = 'none'; });

  const vitalsSection = document.getElementById('vitals-section');
  if (vitalsSection) vitalsSection.style.display = 'none';

  if (!instrument) return;

  const chk = document.getElementById('inst-chk-' + instrument);
  if (chk) {
    chk.style.background = '#1e293b';
    chk.textContent = '✓';
    chk.style.color = '#fff';
    chk.style.fontSize = '11px';
    chk.style.display = 'flex';
    chk.style.alignItems = 'center';
    chk.style.justifyContent = 'center';
  }

  const vitalsDiv = document.querySelector('.vitals-block[data-vitals-for="' + instrument + '"]');
  if (vitalsDiv) {
    vitalsDiv.style.display = 'block';
    if (vitalsSection) vitalsSection.style.display = 'block';
  }
}

document.addEventListener('DOMContentLoaded', initLabEngineer);