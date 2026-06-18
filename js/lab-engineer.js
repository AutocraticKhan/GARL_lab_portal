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

  const allCompleted = sortedSamples.every(s => s.status === 'completed');

  // Build individual sample rows with checkboxes
  const sampleRows = sortedSamples.map(s => {
    const elements = s.selectedElements || [];
    const elementLabels = elements.map(el => {
      const info = getElementInfo(el);
      return info ? `${el} (${info.name})` : el;
    }).join(', ');
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
            <span><strong>Elements (${elements.length}):</strong> ${elements.length > 0 ? escHtml(elementLabels) : '—'}</span>
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

      <!-- Individual Samples List with Select All -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-3);">
          <div style="font-size:0.8rem;font-weight:600;color:var(--txt-secondary);text-transform:uppercase;letter-spacing:0.04em;">Samples in this Submission</div>
          ${!allCompleted ? `
            <label style="display:flex;align-items:center;gap:var(--sp-2);font-size:0.78rem;color:var(--txt-secondary);cursor:pointer;">
              <input type="checkbox" id="select-all-samples" onchange="toggleSelectAll(this.checked)" style="width:16px;height:16px;cursor:pointer;accent-color:var(--clr-success);" />
              Select All
            </label>
          ` : ''}
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

// ── Toggle Select All checkboxes ───────────────────────────────
function toggleSelectAll(checked) {
  const checkboxes = document.querySelectorAll('.sample-complete-chk');
  checkboxes.forEach(cb => {
    if (cb.checked !== checked) {
      cb.checked = checked;
      // Trigger the change handler
      const event = new Event('change', { bubbles: true });
      cb.dispatchEvent(event);
    }
  });
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

document.addEventListener('DOMContentLoaded', initLabEngineer);