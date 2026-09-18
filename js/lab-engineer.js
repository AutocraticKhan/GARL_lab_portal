
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

  // Report modal close
  document.getElementById('close-report-panel').addEventListener('click', () => closePanel('report-overlay'));
  document.getElementById('report-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('report-overlay')) closePanel('report-overlay');
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
            '</div>' +
          '</div>' +
          '<div style="font-size:0.75rem;color:var(--txt-secondary);">' +
            '<span><strong>Elements (' + elements.length + '):</strong> ' + escHtml(elementLabels) + '</span>' +
          '</div>' +
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

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3);margin-bottom:var(--sp-3);padding:var(--sp-4);background:var(--clr-bg-3);border-radius:var(--r-lg);border:1px solid var(--clr-border);">' +
        '<div class="detail-row"><span class="detail-label">Submission ID</span><span class="detail-value" style="font-size:1.05rem;font-weight:700;color:var(--clr-primary);">#' + escHtml(sub.submissionId) + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Number of Samples</span><span class="detail-value" style="font-size:1.05rem;font-weight:700;">' + sub.sampleCount + '</span></div>' +
        '<div class="detail-row" style="grid-column:1/-1;"><span class="detail-label">Sample ID Range</span><span class="detail-value" style="font-family:monospace;font-size:0.9rem;font-weight:600;">' + escHtml(sampleRange) + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Client Name</span><span class="detail-value">' + escHtml(sub.customer_name || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Client Contact</span><span class="detail-value">' + escHtml(firstSample?.customer_contact || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">CNIC</span><span class="detail-value">' + escHtml(firstSample?.cnic || '—') + '</span></div>' +
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
 */
function buildSpectroTable(sortedSamples, elementsChunk) {
  const tableWrap = document.createElement('div');

  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;border:2px solid #1e293b;font-size:11px;margin-bottom:24px;';

  // Build header row HTML
  let headerHtml =
    '<tr style="background:#f1f5f9;border-bottom:2px solid #1e293b;font-weight:700;color:#0f172a;font-size:9px;text-transform:uppercase;letter-spacing:0.04em;">' +
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
    bodyHtml += '<tr style="border-bottom:1px solid #cbd5e1;height:10.5mm;">' +
      '<td style="border-right:1px solid #94a3b8;text-align:center;font-weight:700;color:#94a3b8;font-family:monospace;font-size:11px;white-space:nowrap;">' + (idx + 1) + '</td>' +
      '<td style="border-right:1px solid #94a3b8;padding:2px 6px;font-family:monospace;font-size:11px;font-weight:500;color:#0f172a;white-space:nowrap;">' + escHtml(sampleIdLabel) + '</td>' +
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
    pageDiv.appendChild(buildSpectroTable(sortedSamples, elementsChunk));

    // Remarks + Signatures
    pageDiv.appendChild(buildSpectroSignatures());

    pagesContainer.appendChild(pageDiv);
  });

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

  // Build the report HTML
  const reportDiv = document.createElement('div');
  reportDiv.style.cssText = 'padding:16px 0;';

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
      '<tr><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;width:28%;">Report No:</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;font-weight:700;color:#065f46;width:24%;">' + escHtml(reportNo) + '</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;width:24%;">Report issue Date:</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;width:24%;">' + escHtml(today) + '</td></tr>' +
      '<tr><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Name & Address of Customer:</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;">' + escHtml(sub.customer_name || '—') + '</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">No. of Sample(s):</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;">' + sub.sampleCount + '</td></tr>' +
      '<tr><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Location of Sample (Given by customer)</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;">' + escHtml(firstSample?.sample_location || 'NA') + '</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Sample receiving Date</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;">' + formatDate(sub.created_at) + '</td></tr>' +
      '<tr><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Description of Sample:</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;">' + escHtml(firstSample?.sampleType || 'Powder') + '</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Sample analysis Date</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;">' + escHtml(today) + '</td></tr>' +
      '<tr><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Method used /Specs:</td><td style="border:1px solid #000;padding:2px 4px;font-size:13.5px;text-align:center;"><input type="text" class="report-method-input" value="EPA 3052" style="width:100%;border:none;outline:none;text-align:center;font-size:13.5px;font-family:Times New Roman,Times,serif;background:transparent;padding:2px 0;" /></td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Temperature & Humidity</td><td style="border:1px solid #000;padding:2px 4px;font-size:13.5px;text-align:center;"><input type="text" class="report-temp-input" value="25.2 °C & 52 %" style="width:100%;border:none;outline:none;text-align:center;font-size:13.5px;font-family:Times New Roman,Times,serif;background:transparent;padding:2px 0;" /></td></tr>' +
    '</tbody>';
  pageDiv.appendChild(metaTable);

  // Test Report Heading
  const testReportHeading = document.createElement('div');
  testReportHeading.style.cssText = 'font-weight:700;font-size:15px;margin-bottom:8px;padding-left:16px;';
  testReportHeading.textContent = 'Test Report:';
  pageDiv.appendChild(testReportHeading);

  // Test Results Table with editable input fields
  const resultTable = document.createElement('table');
  resultTable.style.cssText = 'width:100%;border-collapse:collapse;border:1px solid #000;margin-bottom:32px;';

  const elemColWidth = uniqueElements.length > 0 ? Math.floor(92 / uniqueElements.length) + '%' : '50%';

  // Read the selected unit from the report panel dropdown (default: ppm)
  const unitSelect = document.getElementById('report-unit-select');
  const reportUnit = unitSelect ? unitSelect.value : 'ppm';

  // Build header row
  let resultHeaderHtml =
    '<thead><tr style="background:#f9fafb;">' +
    '<th style="border:1px solid #000;padding:4px 8px;text-align:center;font-weight:700;font-size:13.5px;width:6%;">S. No.</th>' +
    '<th style="border:1px solid #000;padding:4px 8px;text-align:center;font-weight:700;font-size:13.5px;white-space:nowrap;min-width:160px;">Sample ID</th>';

  // Add element columns (equal width for each) - use selected unit and proper capitalization
  if (uniqueElements.length > 0) {
    uniqueElements.forEach(el => {
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
    const tr = document.createElement('tr');

    // S.No
    const tdNo = document.createElement('td');
    tdNo.style.cssText = 'border:1px solid #000;padding:4px 8px;text-align:center;font-size:13.5px;';
    tdNo.textContent = (idx + 1) + '.';
    tr.appendChild(tdNo);

    // Sample ID
    const tdId = document.createElement('td');
    tdId.style.cssText = 'border:1px solid #000;padding:4px 8px;text-align:center;font-size:13.5px;white-space:nowrap;';
    tdId.textContent = sampleIdLabel;
    tr.appendChild(tdId);

    // Element result input fields
    if (uniqueElements.length > 0) {
      uniqueElements.forEach(el => {
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

  reportDiv.appendChild(pageDiv);

  // Hidden container for printing
  const printSourceEl = document.createElement('div');
  printSourceEl.id = 'report-print-source';
  printSourceEl.style.display = 'none';
  printSourceEl.appendChild(reportDiv.cloneNode(true));

  const body = document.getElementById('report-body');
  body.innerHTML = '';
  body.appendChild(reportDiv);
  body.appendChild(printSourceEl);

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

  // Restore method input
  const methodInput = document.querySelector('#report-body .report-method-input');
  if (methodInput && saved.method_used) {
    methodInput.value = saved.method_used;
  }

  // Restore temp/humidity input
  const tempInput = document.querySelector('#report-body .report-temp-input');
  if (tempInput && saved.temperature_humidity) {
    tempInput.value = saved.temperature_humidity;
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

  // Build the full report data object
  const reportData = {
    submission_id: activeFullSubmissionId,
    report_type: activeReportType,
    report_number: activeReportNo || '',
    report_issue_date: today,
    customer_name: sub ? (sub.customer_name || '') : '',
    sample_count: sub ? sub.sampleCount : 0,
    sample_location: firstSample ? (firstSample.sample_location || '') : '',
    sample_receiving_date: sub ? formatDate(sub.created_at) : '',
    sample_description: firstSample ? (firstSample.sampleType || 'Powder') : '',
    sample_analysis_date: today,
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

  // Get all input values from the live (visible) report only — exclude the
  // hidden #report-print-source clone so we don't double-count inputs.
  const liveInputs = document.querySelectorAll('#report-body .report-result-input');
  const cloneInputs = clone.querySelectorAll('.report-result-input');
  liveInputs.forEach((liveInput, idx) => {
    if (cloneInputs[idx]) {
      // Use setAttribute so the value survives innerHTML serialization
      // (DOM .value property is NOT reflected by innerHTML).
      cloneInputs[idx].setAttribute('value', liveInput.value);
      cloneInputs[idx].readOnly = true;
    }
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

  // Sync element header text (unit may have changed via the Unit dropdown after the report was built)
  const liveHeaders = document.querySelectorAll('#report-body th[data-element]');
  const cloneHeaders = clone.querySelectorAll('th[data-element]');
  liveHeaders.forEach((liveTh, idx) => {
    if (cloneHeaders[idx]) {
      cloneHeaders[idx].textContent = liveTh.textContent;
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
      '@page { size: A4 portrait; margin: 10mm 15mm 10mm 15mm; }' +
      '@media print { body { background: #fff !important; color: #000 !important; } .no-print { display: none !important; } .print-container { box-shadow: none !important; border: none !important; margin: 0 auto !important; padding: 0 !important; width: 210mm !important; background: transparent !important; } .report-page { box-shadow: none !important; border: none !important; margin: 0 auto !important; page-break-after: always; } tr { page-break-inside: avoid; } }' +
      '* { margin: 0; padding: 0; box-sizing: border-box; }' +
      'body { background: #fff; display: block; padding: 0; }' +
      '.report-page { width: 210mm; min-height: 297mm; padding: 12mm 15mm; margin: 0 auto; background: #fff; border: none; box-shadow: none; page-break-after: always; }' +
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