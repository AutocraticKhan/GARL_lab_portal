/* ============================================================
   lab-engineer.js — Lab Engineer dashboard logic
   ============================================================ */
'use strict';

let engSession = null;
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

// ── Assigned Samples ──────────────────────────────────────────
function renderAssignedSamples() {
  const query = (document.getElementById('assigned-search').value || '').toLowerCase();
  const tbody = document.getElementById('assigned-tbody');
  const lab   = getLab(engSession.lab_id);

  // Stats
  const allSamples = getSamplesForLab(engSession.lab_id);
  document.getElementById('stat-total').textContent   = allSamples.length;
  document.getElementById('stat-assigned').textContent = allSamples.filter(s => s.status === 'assigned').length;
  document.getElementById('stat-progress').textContent  = allSamples.filter(s => s.status === 'in_progress').length;
  document.getElementById('stat-done').textContent      = allSamples.filter(s => s.status === 'completed').length;

  let rows = allSamples.filter(s => s.status !== 'completed')
    .sort((a,b) => new Date(b.created_at)-new Date(a.created_at));

  if (query) rows = rows.filter(s =>
    s.sample_number?.toLowerCase().includes(query) ||
    s.customer_name?.toLowerCase().includes(query)
  );

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">🎉</div><p>No pending samples${query ? ' matching your search' : ''}</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(s => {
    const test    = getTest(s.test_id);
    const overdue = test && daysBetween(s.created_at, new Date()) > Number(test.turnaround_days);
    return `<tr class="clickable" onclick="openSamplePanel('${s.id}')">
      <td><strong style="color:var(--clr-primary)">${escHtml(s.sample_number)}</strong></td>
      <td>${escHtml(s.customer_name)}</td>
      <td class="muted">${test ? escHtml(test.test_name) : '—'}</td>
      <td class="muted">${formatDate(s.collection_date)}</td>
      <td>${statusBadge(s.status)}</td>
      <td>${overdue ? '<span class="badge badge-danger" style="background:rgba(239,68,68,0.1);color:#dc2626;border:1px solid rgba(239,68,68,0.2);">⚠ Overdue</span>' : '<span style="color:var(--txt-muted);font-size:0.8rem;">On track</span>'}</td>
    </tr>`;
  }).join('');
}

// ── Completed Reports ─────────────────────────────────────────
function renderCompletedReports() {
  const tbody = document.getElementById('completed-tbody');
  const rows  = getSamplesForLab(engSession.lab_id)
    .filter(s => s.status === 'completed')
    .sort((a,b) => new Date(b.completed_at || b.created_at)-new Date(a.completed_at || a.created_at));

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📄</div><p>No completed reports yet</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(s => {
    const test   = getTest(s.test_id);
    const report = getReportForSample(s.id);
    return `<tr>
      <td><strong style="color:var(--clr-primary)">${escHtml(s.sample_number)}</strong></td>
      <td>${escHtml(s.customer_name)}</td>
      <td class="muted">${test ? escHtml(test.test_name) : '—'}</td>
      <td>${report ? `<code style="font-size:0.75rem;color:var(--clr-accent)">${escHtml(report.report_number)}</code>` : '—'}</td>
      <td class="muted">${report ? formatDate(report.uploaded_at) : '—'}</td>
      <td>
        ${report && report.report_file_data
          ? `<button class="btn btn-ghost btn-sm" onclick="downloadReport('${report.id}')">⬇ Download</button>`
          : report ? `<span class="muted">Ref only</span>` : '—'}
      </td>
    </tr>`;
  }).join('');
}

// ── Side Panel ────────────────────────────────────────────────
function openSamplePanel(sampleId) {
  activeSampleId = sampleId;
  const sample = getSample(sampleId);
  if (!sample) return;

  const lab    = getLab(sample.lab_id);
  const test   = getTest(sample.test_id);
  const events = getEventsForSample(sampleId);

  // Panel title
  document.getElementById('panel-sample-number').textContent = sample.sample_number;

  // Details
  document.getElementById('panel-body').innerHTML = `
    <div style="margin-bottom:var(--sp-5);">
      <div style="display:flex;align-items:center;gap:var(--sp-3);margin-bottom:var(--sp-4);">
        ${statusBadge(sample.status)}
        <span style="font-size:0.8rem;color:var(--txt-muted)">Last updated: ${formatDateTime(sample.in_progress_at || sample.created_at)}</span>
      </div>
      <div class="detail-row"><span class="detail-label">Sample Number</span><span class="detail-value" style="font-size:1.05rem;font-weight:700;color:var(--clr-primary)">${escHtml(sample.sample_number)}</span></div>
      <div class="detail-row"><span class="detail-label">Patient Name</span><span class="detail-value">${escHtml(sample.customer_name)}</span></div>
      <div class="detail-row"><span class="detail-label">Contact</span><span class="detail-value">${escHtml(sample.customer_contact || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Address</span><span class="detail-value">${escHtml(sample.customer_address || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Collection Date</span><span class="detail-value">${formatDateTime(sample.collection_date)}</span></div>
      <div class="detail-row"><span class="detail-label">Lab</span><span class="detail-value">${escHtml(lab?.lab_name || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Test</span><span class="detail-value">${escHtml(test?.test_name || '—')} ${test ? `<code style="font-size:0.75rem;color:var(--clr-accent)">${test.test_code}</code>` : ''}</span></div>
      <div class="detail-row"><span class="detail-label">Turnaround</span><span class="detail-value">${test ? test.turnaround_days + ' days' : '—'}</span></div>
      ${sample.notes ? `<div class="detail-row"><span class="detail-label">Notes</span><span class="detail-value">${escHtml(sample.notes)}</span></div>` : ''}
    </div>

    ${events.length ? `
    <div>
      <div style="font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--txt-muted);margin-bottom:var(--sp-3);">Activity Timeline</div>
      <div style="display:flex;flex-direction:column;gap:var(--sp-2);">
        ${events.map(ev => `
          <div style="display:flex;gap:var(--sp-3);align-items:flex-start;">
            <div style="width:8px;height:8px;border-radius:50%;background:var(--clr-primary);margin-top:5px;flex-shrink:0;"></div>
            <div>
              <div style="font-size:0.8rem;font-weight:600;">${escHtml(ev.note || ev.type)}</div>
              <div style="font-size:0.72rem;color:var(--txt-muted);">${escHtml(ev.actor_name)} · ${formatDateTime(ev.timestamp)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}
  `;

  // Update action buttons
  const btnProgress = document.getElementById('btn-mark-progress');
  const btnUpload   = document.getElementById('btn-upload-report');

  if (sample.status === 'assigned') {
    btnProgress.style.display = 'flex';
    btnUpload.style.display   = 'none';
  } else if (sample.status === 'in_progress') {
    btnProgress.style.display = 'none';
    btnUpload.style.display   = 'flex';
  } else {
    btnProgress.style.display = 'none';
    btnUpload.style.display   = 'none';
  }

  openPanel('sample-panel-overlay');
}

// ── Status transitions ────────────────────────────────────────
function handleMarkInProgress() {
  if (!activeSampleId) return;
  setSampleStatus(activeSampleId, 'in_progress', `Sample opened by ${engSession.full_name}`);
  showToast('Sample marked as In Progress.', 'success');
  // Refresh panel
  openSamplePanel(activeSampleId);
  renderAssignedSamples();
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
      // Read file as base64
      const base64 = await fileToBase64(file);
      reportData.report_file_data = base64;
      reportData.report_file_name = file.name;
    }

    const report = createReport(reportData);
    showToast(`Report ${report.report_number} uploaded successfully!`, 'success');
    closeModal('modal-upload-report');
    closePanel('sample-panel-overlay');
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
