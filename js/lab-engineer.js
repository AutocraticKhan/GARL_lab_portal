/* ============================================================
   lab-engineer.js — Lab Engineer dashboard logic
   (Grouped by submission — checkbox completion, no file upload)
   ============================================================ */
'use strict';

let engSession = null;
let activeSubmissionId = null;

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
function switchEngTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const btn   = document.querySelector(`[data-tab="${tabId}"]`);
  const panel = document.getElementById(tabId);
  if (btn) btn.classList.add('active');
  if (panel) panel.classList.add('active');

  if (tabId === 'eng-tab-assigned')  renderAssignedSamples();
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

  // Spectroscopy modal close
  document.getElementById('close-spectroscopy-panel').addEventListener('click', () => closePanel('spectroscopy-overlay'));
  document.getElementById('spectroscopy-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('spectroscopy-overlay')) closePanel('spectroscopy-overlay');
  });

  // Assigned samples search
  document.getElementById('assigned-search').addEventListener('input', debounce(renderAssignedSamples, 250));
}

// ── Assigned Samples (Grouped by Submission) ─────────────────
function renderAssignedSamples() {
  const query = (document.getElementById('assigned-search').value || '').toLowerCase();
  const tbody = document.getElementById('assigned-tbody');
  const lab   = getLab(engSession.lab_id);

  // Stats (individual samples)
  const allSamples = getSamplesForLab(engSession.lab_id);
  document.getElementById('stat-total').textContent   = allSamples.length;
  document.getElementById('stat-assigned').textContent = allSamples.filter(s => s.status === 'assigned').length;
  document.getElementById('stat-progress').textContent  = allSamples.filter(s => s.status === 'in_progress').length;
  document.getElementById('stat-done').textContent      = allSamples.filter(s => s.status === 'completed').length;

  // Get submissions (only ones with at least one non-completed sample)
  let submissions = getSubmissionsForLab(engSession.lab_id)
    .filter(sub => sub.samples.some(s => s.status !== 'completed'))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

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
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🎉</div><p>No pending submissions${query ? ' matching your search' : ''}</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = submissions.map(sub => {
    // Find a test for turnaround days (use first sample's test)
    const firstSample = sub.samples[0];
    const test = firstSample ? getTest(firstSample.test_id) : null;
    const overdue = test && daysBetween(sub.created_at, new Date()) > Number(test.turnaround_days);

    // Build sample range display
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
        sampleRange = `${escHtml(prefix)}-<strong>${firstSeq} to ${lastSeq}</strong>`;
      } else {
        sampleRange = escHtml(sub.firstSampleId);
      }
    }

    return `<tr class="clickable" onclick="openSubmissionPanel('${sub.submissionId}')">
      <td><strong style="color:var(--clr-primary)">#${escHtml(sub.submissionId)}</strong></td>
      <td>${escHtml(sub.customer_name || '—')}</td>
      <td class="muted">${escHtml(sub.test_name || '—')}</td>
      <td style="text-align:center;font-weight:600;">${sub.sampleCount}</td>
      <td style="font-size:0.75rem;font-family:monospace;color:var(--txt-secondary);">${sampleRange}</td>
      <td>${statusBadge(sub.statusSummary)}</td>
      <td>${overdue ? '<span class="badge badge-danger" style="background:rgba(239,68,68,0.1);color:#dc2626;border:1px solid rgba(239,68,68,0.2);">⚠ Overdue</span>' : '<span style="color:var(--txt-muted);font-size:0.8rem;">On track</span>'}</td>
    </tr>`;
  }).join('');
}

// ── Completed Reports (Grouped by Submission) ─────────────────
function renderCompletedReports() {
  const tbody = document.getElementById('completed-tbody');
  const submissions = getSubmissionsForLab(engSession.lab_id)
    .filter(sub => sub.samples.every(s => s.status === 'completed'))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (!submissions.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📄</div><p>No completed submissions yet</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = submissions.map(sub => {
    // Get all reports for this submission
    const subReports = getReportsForSubmission(sub.submissionId);
    const reportNumbers = subReports.map(r => r.report_number).filter(Boolean).join(', ');

    // Use latest completed date
    const completedDates = sub.samples.map(s => s.completed_at).filter(Boolean).sort().reverse();
    const completedDate = completedDates[0] || sub.created_at;

    // Build sample range display
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
        sampleRange = `${escHtml(prefix)}-<strong>${firstSeq} to ${lastSeq}</strong>`;
      } else {
        sampleRange = escHtml(sub.firstSampleId);
      }
    }

    return `<tr class="clickable" onclick="openSubmissionPanel('${sub.submissionId}')">
      <td><strong style="color:var(--clr-primary)">#${escHtml(sub.submissionId)}</strong></td>
      <td>${escHtml(sub.customer_name || '—')}</td>
      <td class="muted">${escHtml(sub.test_name || '—')}</td>
      <td style="text-align:center;font-weight:600;">${sub.sampleCount}</td>
      <td style="font-size:0.75rem;font-family:monospace;color:var(--txt-secondary);">${sampleRange}</td>
      <td><code style="font-size:0.75rem;color:var(--clr-accent)">${escHtml(reportNumbers || '—')}</code></td>
      <td class="muted">${formatDate(completedDate)}</td>
    </tr>`;
  }).join('');
}

// ── Side Panel (Submission-level detail with checkboxes) ──
function openSubmissionPanel(submissionId) {
  activeSubmissionId = submissionId;

  const submissions = getSubmissionsForLab(engSession.lab_id);
  const sub = submissions.find(s => s.submissionId === submissionId);
  if (!sub) return;

  // Sort samples by sequence number
  const sortedSamples = [...sub.samples].sort((a, b) => {
    const aSeq = (a.sampleId || '').split('-').pop() || '';
    const bSeq = (b.sampleId || '').split('-').pop() || '';
    return aSeq.localeCompare(bSeq, undefined, { numeric: true });
  });

  const lab = getLab(sub.lab_id);
  const firstSample = sortedSamples[0];
  const test = firstSample ? getTest(firstSample.test_id) : null;

  // Build sample range display
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
      sampleRange = `${prefix}-${firstSeq} to ${lastSeq}`;
    } else {
      sampleRange = sub.firstSampleId;
    }
  }

  // Panel title
  document.getElementById('panel-sample-number').textContent = `Submission #${sub.submissionId} (${sub.sampleCount} samples)`;

  // Count by status
  const statusCounts = {};
  sortedSamples.forEach(s => {
    statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
  });
  const statusSummaryStr = Object.entries(statusCounts)
    .map(([st, cnt]) => `${st.replace('_', ' ')}: ${cnt}`)
    .join(' · ');

  const allCompleted = sortedSamples.every(s => s.status === 'completed');

  // Build individual sample rows with checkboxes
  const sampleRows = sortedSamples.map(s => {
    const elements = s.selectedElements || [];
    const testForSample = s.test_id ? getTest(s.test_id) : null;
    const requiresElems = testForSample ? testForSample.requires_elements !== false : true;
    const elementLabels = elements.length > 0
      ? elements.map(el => {
          const info = getElementInfo(el);
          const sym = normalizeElementSymbol(el);
          return info ? `${sym} (${info.name})` : sym;
        }).join(', ')
      : (requiresElems ? '—' : 'No elements required');
    const isCompleted = s.status === 'completed';
    const sampleIdLabel = s.sampleId || s.sampleNumber || s.sampleName || '—';

    return `<div class="submission-sample-row" data-sample-id="${s.id}" style="border:1px solid var(--clr-border);border-radius:var(--r-md);padding:var(--sp-3);margin-bottom:var(--sp-2);background:${isCompleted ? 'rgba(16,185,129,0.05)' : 'var(--clr-surface)'};">
      <div style="display:flex;align-items:flex-start;gap:var(--sp-3);">
        <!-- Checkbox -->
        <div style="padding-top:2px;">
          <input type="checkbox" class="sample-complete-chk" data-sample-id="${s.id}"
                 ${isCompleted ? 'checked' : ''}
                 onchange="toggleSampleComplete('${s.id}', this.checked)"
                 style="width:18px;height:18px;cursor:pointer;accent-color:var(--clr-success);" />
        </div>
        <!-- Details -->
        <div style="flex:1;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-1);">
            <div>
              <span style="font-weight:600;font-family:monospace;font-size:0.85rem;color:${isCompleted ? 'var(--clr-success)' : 'var(--clr-primary)'};">${escHtml(sampleIdLabel)}</span>
              <span style="margin-left:var(--sp-2);font-size:0.72rem;color:var(--txt-muted);">${escHtml(s.sampleType || '—')}</span>
            </div>
            ${isCompleted ? '<span style="font-size:0.72rem;color:var(--clr-success);font-weight:600;">✓ Complete</span>' : statusBadge(s.status)}
          </div>
          <div style="font-size:0.75rem;color:var(--txt-secondary);">
            <span><strong>Elements (${elements.length}):</strong> ${escHtml(elementLabels)}</span>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('panel-body').innerHTML = `
    <div style="margin-bottom:var(--sp-5);">
      <div style="display:flex;align-items:center;gap:var(--sp-3);margin-bottom:var(--sp-4);flex-wrap:wrap;">
        ${statusBadge(sub.statusSummary)}
        <span style="font-size:0.78rem;color:var(--txt-muted);">${statusSummaryStr}</span>
        ${allCompleted ? '<span style="font-size:0.72rem;background:rgba(16,185,129,0.1);color:#059669;padding:2px 10px;border-radius:12px;font-weight:600;">All Complete ✓</span>' : ''}
      </div>

      <!-- Submission Summary Card -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3);margin-bottom:var(--sp-3);padding:var(--sp-4);background:var(--clr-bg-3);border-radius:var(--r-lg);border:1px solid var(--clr-border);">
        <div class="detail-row"><span class="detail-label">Submission ID</span><span class="detail-value" style="font-size:1.05rem;font-weight:700;color:var(--clr-primary);">#${escHtml(sub.submissionId)}</span></div>
        <div class="detail-row"><span class="detail-label">Number of Samples</span><span class="detail-value" style="font-size:1.05rem;font-weight:700;">${sub.sampleCount}</span></div>
        <div class="detail-row" style="grid-column:1/-1;"><span class="detail-label">Sample ID Range</span><span class="detail-value" style="font-family:monospace;font-size:0.9rem;font-weight:600;">${escHtml(sampleRange)}</span></div>
        <div class="detail-row"><span class="detail-label">Client Name</span><span class="detail-value">${escHtml(sub.customer_name || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Client Contact</span><span class="detail-value">${escHtml(firstSample?.customer_contact || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">CNIC</span><span class="detail-value">${escHtml(firstSample?.cnic || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Sample Location</span><span class="detail-value">${escHtml(firstSample?.sample_location || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Lab</span><span class="detail-value">${escHtml(lab?.lab_name || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Test</span><span class="detail-value">${escHtml(test?.test_name || sub.test_name || '—')} ${test ? `<code style="font-size:0.75rem;color:var(--clr-accent)">${test.test_code}</code>` : ''}</span></div>
        <div class="detail-row"><span class="detail-label">Collected</span><span class="detail-value">${formatDate(sub.created_at)}</span></div>
      </div>

      ${test && test.requires_elements !== false ? `
      <!-- Spectroscopy Datasheet Button -->
      <div style="margin-bottom:var(--sp-4);">
        <button onclick="openSpectroscopyForm('${sub.submissionId}')" class="btn btn-primary" style="display:flex;align-items:center;gap:8px;width:100%;justify-content:center;padding:10px;background:linear-gradient(135deg,#6366f1,#4f46e5);border:none;color:#fff;font-weight:600;border-radius:var(--r-md);cursor:pointer;font-size:0.85rem;">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:18px;height:18px;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
          📋 Spectroscopy Analysis Datasheet
        </button>
      </div>
      ` : ''}

      <!-- Individual Samples List -->
      <div>
        <div style="display:flex;align-items:center;margin-bottom:var(--sp-3);">
          <div style="font-size:0.8rem;font-weight:600;color:var(--txt-secondary);text-transform:uppercase;letter-spacing:0.04em;">Samples in this Submission</div>
        </div>
        <div id="submission-samples-list">
          ${sampleRows}
        </div>
      </div>
    </div>
  `;

  // Show/hide the Mark All Complete button
  const markAllBtn = document.getElementById('btn-mark-all-complete');
  if (markAllBtn) {
    if (!allCompleted && sortedSamples.length > 0) {
      markAllBtn.style.display = 'flex';
      markAllBtn.textContent = `✓ Mark All Complete (${sortedSamples.length})`;
    } else {
      markAllBtn.style.display = 'none';
    }
  }

  openPanel('sample-panel-overlay');
}

// ── Toggle a single sample's completion ────────────────────────
async function toggleSampleComplete(sampleId, checked) {
  try {
    if (checked) {
      await setSampleStatus(sampleId, 'completed', `Sample completed by ${engSession.full_name}`);
    } else {
      // Revert back to assigned
      await setSampleStatus(sampleId, 'assigned', `Sample reopened by ${engSession.full_name}`);
    }
    showToast(checked ? 'Sample marked as complete.' : 'Sample reopened.', 'success');
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

  const incomplete = sub.samples.filter(s => s.status !== 'completed');
  if (!incomplete.length) {
    showToast('All samples are already complete.', 'info');
    return;
  }

  const btn = document.getElementById('btn-mark-all-complete');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

  let successCount = 0;
  let errorCount = 0;
  for (const sample of incomplete) {
    try {
      await setSampleStatus(sample.id, 'completed', `Sample completed by ${engSession.full_name} (bulk)`);
      successCount++;
    } catch (err) {
      errorCount++;
    }
  }

  if (btn) { btn.disabled = false; btn.style.display = 'none'; }

  if (errorCount === 0) {
    showToast(`All ${successCount} samples marked complete!`, 'success');
  } else {
    showToast(`${successCount} completed, ${errorCount} failed.`, 'warning');
  }

  renderAssignedSamples();
  if (activeSubmissionId) openSubmissionPanel(activeSubmissionId);
}

// ── SPECTROSCOPY DATASHEET ─────────────────────────────────────

const SPECTROSCOPY_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
  
  body {
    font-family: 'Inter', sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page { size: A4 portrait; margin: 12mm 15mm 12mm 15mm; }
  @media print {
    body { background: #fff !important; color: #000 !important; }
    .no-print { display: none !important; }
    .print-container { box-shadow: none !important; border: none !important; margin: 0 auto !important; padding: 0 !important; width: 210mm !important; background: transparent !important; }
    .spectro-page { box-shadow: none !important; border: none !important; margin: 0 auto !important; page-break-after: always; }
    tr { page-break-inside: avoid; }
  }
  .writing-row { height: 10.5mm; }
`;

function openSpectroscopyForm(submissionId) {
  const submissions = getSubmissionsForLab(engSession.lab_id);
  const sub = submissions.find(s => s.submissionId === submissionId);
  if (!sub) { showToast('Submission not found', 'error'); return; }

  // Sort samples by sequence
  const sortedSamples = [...sub.samples].sort((a, b) => {
    const aSeq = (a.sampleId || '').split('-').pop() || '';
    const bSeq = (b.sampleId || '').split('-').pop() || '';
    return aSeq.localeCompare(bSeq, undefined, { numeric: true });
  });

  const lab = getLab(sub.lab_id);

  // Collect all unique element symbols across all samples (normalized casing)
  const uniqueElements = [...new Set(
    sortedSamples.flatMap(s => (s.selectedElements || []).map(el => normalizeElementSymbol(el)))
  )].sort();

  const sampleRange = sub.sampleCount === 1
    ? (sub.firstSampleId || '—')
    : `${sub.firstSampleId || '—'} to ${sub.lastSampleId || '—'}`;

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // Determine page splitting for elements (max 6 per page)
  const maxColsPerPage = 6;
  const elementPages = [];
  if (uniqueElements.length === 0) {
    elementPages.push([]);
  } else {
    let remaining = [...uniqueElements];
    while (remaining.length > 0) {
      const colsThisPage = Math.min(remaining.length, maxColsPerPage);
      // Try to balance across pages
      const pagesNeeded = Math.ceil(uniqueElements.length / maxColsPerPage);
      const perPage = Math.ceil(uniqueElements.length / pagesNeeded);
      const chunk = remaining.splice(0, perPage);
      elementPages.push(chunk);
    }
  }

  // Build the HTML for all pages
  let pagesHtml = '';
  elementPages.forEach((elementsChunk, pageIdx) => {
    const isMultiPage = elementPages.length > 1;

    pagesHtml += `
    <div class="spectro-page print-container" style="width:auto;min-height:280mm;background:#fff;padding:30px 35px;margin-bottom:20px;border-radius:16px;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(0,0,0,0.08);${isMultiPage ? '' : ''}">
      ${isMultiPage ? `<div style="text-align:right;font-size:9px;color:#94a3b8;font-weight:600;margin-bottom:4px;">Page ${pageIdx + 1} of ${elementPages.length}</div>` : ''}

      <!-- Document Header -->
      <div style="display:flex;justify-content:space-between;align-items:start;border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:20px;">
        <div>
          <h1 style="font-size:18px;font-weight:800;letter-spacing:-0.02em;color:#0f172a;margin:0;text-transform:uppercase;">Spectroscopy Analysis Datasheet</h1>
          <p style="font-size:10px;color:#64748b;font-family:monospace;margin:2px 0 0 0;">AAS / MP-AES RAW METRIC REPORT</p>
        </div>
        <div style="text-align:right;">
          <span style="display:inline-block;border:1px solid #94a3b8;font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:0.04em;color:#475569;text-transform:uppercase;">LAB USE ONLY</span>
        </div>
      </div>

      <!-- Pre-filled Metadata -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px 28px;font-size:13px;margin-bottom:24px;">
        <div style="display:flex;align-items:flex-end;gap:8px;">
          <span style="font-weight:700;color:#334155;white-space:nowrap;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;">Department:</span>
          <div style="flex:1;border-bottom:1px dashed #94a3b8;height:22px;font-family:monospace;color:#0f172a;font-size:12px;font-weight:500;padding-left:4px;display:flex;align-items:center;">${escHtml(lab?.lab_name || '—')}</div>
        </div>
        <div style="display:flex;align-items:flex-end;gap:8px;">
          <span style="font-weight:700;color:#334155;white-space:nowrap;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;">Date of Analysis:</span>
          <div style="flex:1;border-bottom:1px dashed #94a3b8;height:22px;font-family:monospace;color:#0f172a;font-size:12px;font-weight:500;padding-left:4px;display:flex;align-items:center;">${today}</div>
        </div>
        <div style="display:flex;align-items:flex-end;gap:8px;grid-column:1/-1;">
          <span style="font-weight:700;color:#334155;white-space:nowrap;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;">Customer Name:</span>
          <div style="flex:1;border-bottom:1px dashed #94a3b8;height:22px;font-family:monospace;color:#0f172a;font-size:12px;font-weight:500;padding-left:4px;display:flex;align-items:center;">${escHtml(sub.customer_name || '—')}</div>
        </div>
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;grid-column:1/-1;">
          <div style="display:flex;align-items:flex-end;gap:8px;">
            <span style="font-weight:700;color:#334155;white-space:nowrap;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;">Instrument Model:</span>
            <div style="flex:1;border-bottom:1px dashed #94a3b8;height:22px;"></div>
          </div>
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:16px;padding-top:4px;">
            <label style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#334155;">
              <span style="width:16px;height:16px;border:2px solid #1e293b;border-radius:2px;display:inline-block;"></span> AAS
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#334155;">
              <span style="width:16px;height:16px;border:2px solid #1e293b;border-radius:2px;display:inline-block;"></span> MP-AES
            </label>
          </div>
        </div>
      </div>

      <!-- Data Table -->
      <table style="width:100%;border-collapse:collapse;border:2px solid #1e293b;font-size:11px;margin-bottom:24px;">
        <thead>
          <tr style="background:#f1f5f9;border-bottom:2px solid #1e293b;font-weight:700;color:#0f172a;font-size:9px;text-transform:uppercase;letter-spacing:0.04em;">
            <th style="border-right:1px solid #94a3b8;padding:8px 4px;text-align:center;white-space:nowrap;width:1%;">No.</th>
            <th style="border-right:1px solid #94a3b8;padding:8px 6px;text-align:left;white-space:nowrap;width:1%;">Sample ID</th>
            ${elementsChunk.map(el => {
              const info = getElementInfo(el);
              const sym = normalizeElementSymbol(el);
              return `<th style="border-right:1px solid #94a3b8;padding:6px 2px;text-align:center;width:38px;font-size:9px;line-height:1.2;text-transform:none;">${escHtml(sym)}${info ? `<br><span style="font-weight:400;font-size:7px;color:#64748b;">${escHtml(info.name)}</span>` : ''}</th>`;
            }).join('')}
            ${elementsChunk.length > 0 ? `<th style="padding:6px 2px;text-align:center;width:30px;font-size:8px;">SD (±)</th>` : ''}
          </tr>
        </thead>
        <tbody>
          ${sortedSamples.map((sample, idx) => {
            const sampleIdLabel = sample.sampleId || sample.sampleNumber || sample.sampleName || '—';
            const sampleElements = (sample.selectedElements || []).map(el => normalizeElementSymbol(el));
            return `<tr style="border-bottom:1px solid #cbd5e1;height:10.5mm;">
              <td style="border-right:1px solid #94a3b8;text-align:center;font-weight:700;color:#94a3b8;font-family:monospace;font-size:11px;white-space:nowrap;">${idx + 1}</td>
              <td style="border-right:1px solid #94a3b8;padding:2px 6px;font-family:monospace;font-size:11px;font-weight:500;color:#0f172a;white-space:nowrap;">${escHtml(sampleIdLabel)}</td>
              ${elementsChunk.map(el => {
                const hasEl = sampleElements.includes(el);
                return `<td style="border-right:1px solid #94a3b8;text-align:center;${hasEl ? '' : 'background:#f8fafc;'};padding:2px;">${hasEl ? '&nbsp;' : '<span style="color:#cbd5e1;font-size:8px;">—</span>'}</td>`;
              }).join('')}
              ${elementsChunk.length > 0 ? `<td style="text-align:center;padding:2px;">&nbsp;</td>` : ''}
            </tr>`;
          }).join('')}
        </tbody>
      </table>

      <!-- Remarks + Signature -->
      <div>
        <div style="margin-bottom:20px;">
          <span style="font-size:9px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:4px;">Analytical Notes / Remarks</span>
          <div style="border-bottom:1px dashed #94a3b8;height:18px;margin-bottom:8px;"></div>
          <div style="border-bottom:1px dashed #94a3b8;height:18px;"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;padding-top:12px;border-top:1px solid #cbd5e1;font-size:11px;">
          <div>
            <span style="display:block;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:24px;">Analyst Signature</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:9px;font-weight:600;color:#64748b;text-transform:uppercase;">Sign:</span>
              <div style="flex:1;border-bottom:1px solid #94a3b8;height:18px;font-family:monospace;font-size:11px;font-weight:600;color:#0f172a;padding-left:4px;display:flex;align-items:center;">${escHtml(engSession?.full_name || '')}</div>
            </div>
          </div>
          <div>
            <span style="display:block;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:24px;">Verified / Reviewed By</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:9px;font-weight:600;color:#64748b;text-transform:uppercase;">Sign:</span>
              <div style="flex:1;border-bottom:1px solid #94a3b8;height:18px;"></div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  });

  // Inject into the spectroscopy modal
  const body = document.getElementById('spectroscopy-body');
  body.innerHTML = `
    <style>${SPECTROSCOPY_STYLES}</style>
    <div style="padding:16px 0;">
      ${pagesHtml}
    </div>
    <!-- hidden container with raw HTML for printing -->
    <div id="spectro-print-source" style="display:none;">${pagesHtml}</div>
  `;

  openPanel('spectroscopy-overlay');
}

// ── Print the spectroscopy datasheet in a clean new window ──
function printSpectroscopy() {
  const source = document.getElementById('spectro-print-source');
  if (!source) { showToast('No datasheet to print. Please open the form first.', 'warning'); return; }

  const pagesHtml = source.innerHTML;

  const fullDoc = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spectroscopy Analysis Datasheet - Print</title>
  <style>
    ${SPECTROSCOPY_STYLES}
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #fff; display: block; padding: 0; }
    .spectro-page { width: 210mm; min-height: 297mm; padding: 12mm 15mm; margin: 0 auto; background: #fff; border: none; box-shadow: none; page-break-after: always; }
    .spectro-page:last-child { page-break-after: auto; }
    .print-container { box-shadow: none !important; border: none !important; }
  </style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`;

  const printWin = window.open('', '_blank', 'width=800,height=600,scrollbars=yes');
  if (!printWin) {
    showToast('Popup blocked! Please allow popups for this site to print.', 'error');
    return;
  }
  printWin.document.write(fullDoc);
  printWin.document.close();
  printWin.focus();

  // Wait for fonts/resources to load, then print
  setTimeout(() => {
    printWin.print();
    printWin.onafterprint = () => printWin.close();
  }, 500);
}

document.addEventListener('DOMContentLoaded', initLabEngineer);
