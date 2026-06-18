/* ============================================================
   lab-engineer.js — Lab Engineer dashboard logic
   (Grouped by submission — shows sample count & ID range)
   ============================================================ */
'use strict';

let engSession = null;
let activeSubmissionId = null;
let activeSampleId = null;

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

  // Mark in-progress button
  document.getElementById('btn-mark-progress').addEventListener('click', handleMarkInProgress);

  // Upload report button (opens modal)
  document.getElementById('btn-upload-report').addEventListener('click', () => {
    if (!activeSampleId) return;
    const sample = activeSampleId ? DB.samples.find(s => s.id === activeSampleId) : null;
    if (!sample) return;
    if (sample.status !== 'in_progress') {
      showToast('Mark sample as "In Progress" before uploading a report.', 'warning');
      return;
    }
    openModal('modal-upload-report');
  });

  // Upload report modal
  document.getElementById('close-upload-modal').addEventListener('click', () => closeModal('modal-upload-report'));
  document.getElementById('cancel-upload-modal').addEventListener('click', () => closeModal('modal-upload-report'));
  document.getElementById('upload-report-form').addEventListener('submit', handleUploadReport);

  // File picker display
  const fileInput = document.getElementById('report-file');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const chosen = document.getElementById('file-chosen');
      if (fileInput.files[0]) {
        const sizeKB = (fileInput.files[0].size / 1024).toFixed(0);
        chosen.textContent = `✓ ${fileInput.files[0].name} (${sizeKB} KB)`;
        chosen.style.display = 'block';
        if (fileInput.files[0].size > 2 * 1024 * 1024) {
          showToast('Large file detected (>2 MB). Storage may be limited in localStorage mode.', 'warning');
        }
      } else {
        chosen.style.display = 'none';
      }
    });
  }

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
      // Show only the varying part (last segment)
      const firstParts = sub.firstSampleId.split('-');
      const lastParts  = sub.lastSampleId.split('-');
      const prefix = firstParts.slice(0, -1).join('-');
      const firstSeq = firstParts[firstParts.length - 1];
      const lastSeq  = lastParts[lastParts.length - 1];
      if (firstSeq && lastSeq && firstSeq !== lastSeq) {
        sampleRange = `${escHtml(prefix)}-<strong>${firstSeq}–${lastSeq}</strong>`;
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
        sampleRange = `${escHtml(prefix)}-<strong>${firstSeq}–${lastSeq}</strong>`;
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

// ── Side Panel (Submission-level detail with individual sample listing) ──
function openSubmissionPanel(submissionId) {
  activeSubmissionId = submissionId;
  activeSampleId = null;

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
      sampleRange = `${prefix}-${firstSeq}–${lastSeq}`;
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

  // Build individual sample rows
  const sampleRows = sortedSamples.map(s => {
    const elements = s.selectedElements || [];
    const elementLabels = elements.map(el => {
      const info = getElementInfo(el);
      return info ? `${el} (${info.name})` : el;
    }).join(', ');
    const report = getReportForSample(s.id);
    const sampleIdLabel = s.sampleId || s.sampleNumber || s.sampleName || '—';

    return `<div class="submission-sample-row" data-sample-id="${s.id}" style="border:1px solid var(--clr-border);border-radius:var(--r-md);padding:var(--sp-3);margin-bottom:var(--sp-2);background:var(--clr-surface);${s.status === 'completed' ? 'opacity:0.7;' : ''}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-2);">
        <div>
          <span style="font-weight:600;font-family:monospace;font-size:0.85rem;color:var(--clr-primary);">${escHtml(sampleIdLabel)}</span>
          <span style="margin-left:var(--sp-2);font-size:0.72rem;color:var(--txt-muted);">${escHtml(s.sampleType || '—')}</span>
        </div>
        <div style="display:flex;align-items:center;gap:var(--sp-2);">
          ${statusBadge(s.status)}
          ${s.status !== 'completed' ? `
            <button class="btn btn-sm ${s.status === 'assigned' ? 'btn-accent' : 'btn-primary'}" style="height:28px;font-size:0.72rem;padding:0 10px;"
                    onclick="event.stopPropagation();actOnSample('${s.id}', '${s.status}')">
              ${s.status === 'assigned' ? '⚗️ Start' : '📄 Report'}
            </button>
          ` : ''}
          ${report && report.report_file_data ? `
            <button class="btn btn-ghost btn-sm" style="height:28px;font-size:0.72rem;padding:0 8px;" onclick="event.stopPropagation();downloadReport('${report.id}')">⬇ Download</button>
          ` : ''}
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:var(--sp-1);font-size:0.75rem;color:var(--txt-secondary);">
        <span><strong>Elements (${elements.length}):</strong> ${elements.length > 0 ? escHtml(elementLabels) : '—'}</span>
        ${report ? `<span style="margin-left:var(--sp-3);">📄 ${escHtml(report.report_number)}</span>` : ''}
      </div>
    </div>`;
  }).join('');

  document.getElementById('panel-body').innerHTML = `
    <div style="margin-bottom:var(--sp-5);">
      <div style="display:flex;align-items:center;gap:var(--sp-3);margin-bottom:var(--sp-4);flex-wrap:wrap;">
        ${statusBadge(sub.statusSummary)}
        <span style="font-size:0.78rem;color:var(--txt-muted);">${statusSummaryStr}</span>
      </div>

      <!-- Submission Summary Card -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3);margin-bottom:var(--sp-5);padding:var(--sp-4);background:var(--clr-bg-3);border-radius:var(--r-lg);border:1px solid var(--clr-border);">
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

      <!-- Individual Samples List -->
      <div>
        <div style="font-size:0.8rem;font-weight:600;color:var(--txt-secondary);margin-bottom:var(--sp-3);text-transform:uppercase;letter-spacing:0.04em;">Samples in this Submission</div>
        <div id="submission-samples-list">
          ${sampleRows}
        </div>
      </div>
    </div>
  `;

  // Hide the old action buttons (they're inline per-sample now)
  document.getElementById('btn-mark-progress').style.display = 'none';
  document.getElementById('btn-upload-report').style.display = 'none';

  openPanel('sample-panel-overlay');
}

// ── Action on individual sample (from within submission panel) ──
async function actOnSample(sampleId, currentStatus) {
  if (currentStatus === 'assigned') {
    // Mark as in progress
    activeSampleId = sampleId;
    try {
      await setSampleStatus(sampleId, 'in_progress', `Sample opened by ${engSession.full_name}`);
      showToast('Sample marked as In Progress.', 'success');
      renderAssignedSamples();
      // Re-open the panel to refresh the view
      if (activeSubmissionId) openSubmissionPanel(activeSubmissionId);
    } catch (err) {
      showToast('Error updating status: ' + err.message, 'error');
    }
  } else if (currentStatus === 'in_progress') {
    // Open upload report modal
    activeSampleId = sampleId;
    openModal('modal-upload-report');
  }
}

// ── Status transitions (from old panel buttons) ────────────────
async function handleMarkInProgress() {
  if (!activeSampleId) return;
  try {
    await setSampleStatus(activeSampleId, 'in_progress', `Sample opened by ${engSession.full_name}`);
    showToast('Sample marked as In Progress.', 'success');
    if (activeSubmissionId) openSubmissionPanel(activeSubmissionId);
    renderAssignedSamples();
  } catch (err) {
    showToast('Error updating status: ' + err.message, 'error');
  }
}

// ── Upload Report ─────────────────────────────────────────────
async function handleUploadReport(e) {
  e.preventDefault();
  if (!activeSampleId) return;

  const form    = e.target;
  const fileEl  = document.getElementById('report-file');
  const notes   = form.report_notes.value.trim();
  const file    = fileEl.files[0];

  const submitBtn = form.querySelector('[type=submit]');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Uploading…';

  try {
    const sample = getSample(activeSampleId);
    const reportData = {
      sample_id:   activeSampleId,
      lab_id:      engSession.lab_id,
      engineer_id: engSession.id,
      report_notes: notes,
      report_file_name: file ? file.name : 'manual-entry',
    };

    if (file) {
      const base64 = await fileToBase64(file);
      reportData.report_file_data = base64;
      reportData.report_file_name = file.name;
    }

    const report = await createReport(reportData);
    showToast(`Report ${report.report_number} uploaded successfully!`, 'success');
    closeModal('modal-upload-report');
    // Refresh the submission panel
    if (activeSubmissionId) openSubmissionPanel(activeSubmissionId);
    renderAssignedSamples();
    switchEngTab('eng-tab-completed');
  } catch (err) {
    showToast('Upload failed: ' + err.message, 'error');
  }
  submitBtn.disabled = false;
  submitBtn.innerHTML = 'Submit Report';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });
}

// ── Download Report ───────────────────────────────────────────
function downloadReport(reportId) {
  const report = getReport(reportId);
  if (!report) return;
  if (!report.report_file_data) { showToast('No file data stored for this report.', 'warning'); return; }
  const link = document.createElement('a');
  link.href     = report.report_file_data;
  link.download = report.report_file_name || `${report.report_number}.pdf`;
  link.click();
}

document.addEventListener('DOMContentLoaded', initLabEngineer);