/* ============================================================
   receptionist.js — Receptionist dashboard logic
   (Multi-Sample Submission + Paginated Display)
   ============================================================ */
'use strict';

let recSession = null;
let currentPage = 1;
const rowsPerPage = 5;

async function initReceptionist() {
  recSession = requireAuth('receptionist');
  if (!recSession) return;
  await initDB();
  renderSidebarUser();
  wireLogout();
  switchRecTab('rec-tab-new');
  wireReceptionistEvents();
}

function switchRecTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector(`[data-tab="${tabId}"]`);
  const panel = document.getElementById(tabId);
  if (btn) btn.classList.add('active');
  if (panel) panel.classList.add('active');

  if (tabId === 'rec-tab-submissions') renderMySubmissions();
  if (tabId === 'rec-tab-all-samples') {
    currentPage = 1;
    renderSamplesTable();
  }
}

function wireReceptionistEvents() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchRecTab(btn.dataset.tab));
  });

  // Lab selection → auto-derive lab code
  const labSel = document.getElementById('submission-lab');
  if (labSel) {
    populateSubmissionLabDropdown();
    labSel.addEventListener('change', () => {
      const lab = getLab(labSel.value);
      const code = lab ? deriveLabCode(lab.lab_name) : '—';
      document.getElementById('lab-code-display').innerHTML =
        lab ? `<span class="lab-code-badge">${code}</span>` : 'Select a lab to auto-generate code';
    });
  }

  // Submission date default
  const subDate = document.getElementById('submission-date');
  if (subDate) {
    const today = new Date();
    subDate.value = today.toISOString().slice(0, 10);
  }

  // Dynamic sample rows
  const formSamplesBody = document.getElementById('formSamplesBody');
  const addSampleRowBtn = document.getElementById('addSampleRowBtn');

  function addSampleRow() {
    const rowCount = formSamplesBody.rows.length;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input type="text" class="sample-name" placeholder="e.g. DNA Extract A" required></td>
      <td>
        <select class="sample-type" required>
          <option value="">-- Select Type --</option>
          <option value="Blood">Blood</option>
          <option value="Saliva">Saliva</option>
          <option value="Tissue">Tissue</option>
          <option value="Urine">Urine</option>
          <option value="Stool">Stool</option>
          <option value="Swab">Swab</option>
        </select>
      </td>
      <td><button type="button" class="btn-remove-row" onclick="this.closest('tr').remove()">✕ Remove</button></td>
    `;
    formSamplesBody.appendChild(row);
  }

  if (addSampleRowBtn) {
    addSampleRowBtn.addEventListener('click', addSampleRow);
  }

  // Initialize form with one row and populate lab dropdown
  document.addEventListener('DOMContentLoaded', () => {
    addSampleRow();
  });

  // Submission form submit
  const submissionForm = document.getElementById('submissionForm');
  if (submissionForm) {
    submissionForm.addEventListener('submit', handleSubmissionSubmit);
  }

  // Pagination
  document.getElementById('prevPageBtn').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderSamplesTable();
    }
  });

  document.getElementById('nextPageBtn').addEventListener('click', () => {
    const totalPages = Math.ceil((DB.samples.length || 0) / rowsPerPage) || 1;
    if (currentPage < totalPages) {
      currentPage++;
      renderSamplesTable();
    }
  });

  // Sample lookup
  const lookupInput = document.getElementById('lookup-input');
  if (lookupInput) {
    lookupInput.addEventListener('input', debounce(renderLookup, 300));
    document.getElementById('lookup-clear').addEventListener('click', () => {
      lookupInput.value = '';
      document.getElementById('lookup-results').innerHTML = '';
    });
  }
}

// ── Lab Dropdown for Submission Form ──────────────────────────
function populateSubmissionLabDropdown() {
  const sel = document.getElementById('submission-lab');
  sel.innerHTML = '<option value="">Select Laboratory…</option>' +
    getActiveLabs().map(l => `<option value="${l.id}">${escHtml(l.lab_name)}</option>`).join('');
}

// ── Submission Handler (Multi-Sample) ─────────────────────────
function handleSubmissionSubmit(e) {
  e.preventDefault();

  const labId = document.getElementById('submission-lab').value;
  const dateVal = document.getElementById('submission-date').value;
  const formSamplesBody = document.getElementById('formSamplesBody');
  const sampleRows = formSamplesBody.querySelectorAll('tr');

  // Read patient details (shared across all samples)
  const customerName = document.getElementById('customer-name').value.trim();
  const customerContact = document.getElementById('customer-contact').value.trim();
  const customerAddress = document.getElementById('customer-address').value.trim();
  const cnic = document.getElementById('customer-cnic').value.trim();
  const sampleLocation = document.getElementById('sample-location').value.trim();

  // Validation
  if (!labId) { showToast('Please select a laboratory.', 'error'); return; }
  if (!dateVal) { showToast('Please select a date.', 'error'); return; }
  if (!customerName) { showToast('Please enter patient name.', 'error'); return; }
  if (sampleRows.length === 0) {
    showToast('Please add at least one sample row.', 'error');
    return;
  }

  // Check all sample rows are filled
  let valid = true;
  sampleRows.forEach(row => {
    const name = row.querySelector('.sample-name');
    const type = row.querySelector('.sample-type');
    if (!name.value.trim() || !type.value) {
      valid = false;
      if (name && !name.value.trim()) name.style.borderColor = '#ef4444';
      if (type && !type.value) type.style.borderColor = '#ef4444';
    }
  });
  if (!valid) {
    showToast('Please fill in all sample fields.', 'error');
    return;
  }

  const lab = getLab(labId);
  const labCode = deriveLabCode(lab?.lab_name || 'LAB');

  // Get next submission ID from DB
  const currentSubId = DB.systemState.nextSubmissionId;

  // Generate structured IDs for all samples
  const idMappings = generateSampleIDs(labCode, currentSubId, sampleRows.length, dateVal);

  // Create submission record
  const newSubmission = createSubmission({
    date: dateVal,
    labCode: labCode,
    sampleCount: sampleRows.length,
  });

  // Create sample records (all sharing the same patient details)
  const newSamples = [];
  sampleRows.forEach((row, index) => {
    const name = row.querySelector('.sample-name').value.trim();
    const type = row.querySelector('.sample-type').value;
    const idInfo = idMappings[index];

    const sampleData = {
      sampleId: idInfo.fullId,
      submissionId: newSubmission.submissionId,
      sampleNumber: idInfo.sampleNumber,
      sampleName: name,
      sampleType: type,
      status: 'Registered',
      customer_name: customerName,
      customer_contact: customerContact,
      customer_address: customerAddress,
      cnic: cnic,
      sample_location: sampleLocation,
      lab_id: labId,
      collection_date: dateVal,
      collected_by: recSession.id,
    };

    const created = createSampleForSubmission(sampleData);
    newSamples.push(created);
  });

  // Also persist to unified storage
  const portalData = getStoredData();
  portalData.submissions.push(newSubmission);
  newSamples.forEach(s => portalData.samples.push(s));
  portalData.systemState.nextSubmissionId = DB.systemState.nextSubmissionId;
  saveStoredData(portalData);

  // Show confirmation
  showToast(`Submission #${newSubmission.submissionId} registered with ${sampleRows.length} sample(s)!`, 'success');
  renderIntakeConfirmation(newSubmission, newSamples, lab, labCode, customerName, customerContact, cnic, sampleLocation);

  // Reset form (keep one sample row, clear all fields)
  formSamplesBody.innerHTML = '';
  formSamplesBody.querySelectorAll('tr').forEach(tr => tr.remove());
  // Re-add initial empty row
  const addBtn = document.getElementById('addSampleRowBtn');
  if (addBtn) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input type="text" class="sample-name" placeholder="e.g. DNA Extract A" required></td>
      <td>
        <select class="sample-type" required>
          <option value="">-- Select Type --</option>
          <option value="Blood">Blood</option>
          <option value="Saliva">Saliva</option>
          <option value="Tissue">Tissue</option>
          <option value="Urine">Urine</option>
          <option value="Stool">Stool</option>
          <option value="Swab">Swab</option>
        </select>
      </td>
      <td><button type="button" class="btn-remove-row" onclick="this.closest('tr').remove()">✕ Remove</button></td>
    `;
    formSamplesBody.appendChild(row);
  }

  // Reset patient details and date
  document.getElementById('customer-name').value = '';
  document.getElementById('customer-contact').value = '';
  document.getElementById('customer-address').value = '';
  document.getElementById('customer-cnic').value = '';
  document.getElementById('sample-location').value = '';
  document.getElementById('submission-date').value = new Date().toISOString().slice(0, 10);

  // Refresh paginated table
  currentPage = 1;
  renderSamplesTable();
}

// ── Confirmation Card ─────────────────────────────────────────
function renderIntakeConfirmation(submission, samples, lab, labCode, customerName, customerContact, cnic, sampleLocation) {
  const box = document.getElementById('intake-confirm');
  box.style.display = 'block';
  box.innerHTML = `
    <div style="display:flex;align-items:center;gap:var(--sp-3);margin-bottom:var(--sp-4);">
      <div style="font-size:2rem;">✅</div>
      <div>
        <div style="font-size:1rem;font-weight:700;color:var(--clr-success);">Submission Registered</div>
        <div style="font-size:0.8rem;color:var(--txt-secondary);">Successfully saved to the system</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3);margin-bottom:var(--sp-4);">
      <div class="detail-row"><span class="detail-label">Submission #</span><span class="detail-value" style="font-size:1rem;font-weight:700;color:var(--clr-primary);">${escHtml(submission.submissionId)}</span></div>
      <div class="detail-row"><span class="detail-label">Patient</span><span class="detail-value">${escHtml(customerName || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Contact</span><span class="detail-value">${escHtml(customerContact || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">CNIC</span><span class="detail-value">${escHtml(cnic || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Lab</span><span class="detail-value">${escHtml(lab?.lab_name || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Lab Code</span><span class="detail-value"><span class="lab-code-badge">${escHtml(labCode)}</span></span></div>
      <div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">${escHtml(submission.date)}</span></div>
      <div class="detail-row"><span class="detail-label">Samples</span><span class="detail-value">${samples.length}</span></div>
    </div>
    <div style="border-top:1px solid var(--clr-border);padding-top:var(--sp-3);">
      <div style="font-size:0.75rem;font-weight:600;color:var(--txt-muted);margin-bottom:var(--sp-2);text-transform:uppercase;">Generated Sample IDs</div>
      <div style="display:flex;flex-direction:column;gap:var(--sp-1);">
        ${samples.map(s => `<code style="font-size:0.82rem;color:var(--clr-primary);">${escHtml(s.sampleId)} - ${escHtml(s.sampleName)} (${escHtml(s.sampleType)})</code>`).join('')}
      </div>
    </div>`;
}

// ── My Submissions (filtered by current user) ─────────────────
function renderMySubmissions() {
  const tbody = document.getElementById('my-submissions-tbody');
  const rows = DB.samples
    .filter(s => s.collected_by === recSession.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📋</div><p>No submissions yet</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(s => {
    const lab = getLab(s.lab_id);
    return `<tr>
      <td><strong style="color:var(--clr-primary);font-size:0.82rem;">${escHtml(s.sampleId || s.id)}</strong></td>
      <td class="muted">${escHtml(s.submissionId || '—')}</td>
      <td>${escHtml(s.sampleName || s.customer_name || '—')}</td>
      <td class="muted">${lab ? escHtml(lab.lab_name) : '—'}</td>
      <td class="muted">${escHtml(s.sampleType || '—')}</td>
      <td>${statusBadge(s.status === 'Registered' ? 'received' : s.status)}</td>
      <td class="muted">${formatDateTime(s.created_at)}</td>
    </tr>`;
  }).join('');
}

// ── Paginated Samples Table ───────────────────────────────────
function renderSamplesTable() {
  const samples = DB.samples || [];
  document.getElementById('total-sample-count').textContent = `${samples.length} total`;

  // Sort newest first
  const reversedSamples = [...samples].reverse();
  const totalRows = reversedSamples.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage) || 1;

  // Boundary enforcement
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedData = reversedSamples.slice(startIndex, endIndex);

  const displayTableBody = document.getElementById('displayTableBody');
  displayTableBody.innerHTML = '';

  if (paginatedData.length === 0) {
    displayTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:var(--sp-8);color:var(--txt-muted);">No samples registered yet.</td></tr>`;
  } else {
    paginatedData.forEach(sample => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong style="color:var(--clr-primary);font-size:0.82rem;">${escHtml(sample.sampleId || sample.id)}</strong></td>
        <td class="muted">${escHtml(sample.submissionId || '—')}</td>
        <td>${escHtml(sample.sampleName || sample.customer_name || '—')}</td>
        <td class="muted">${escHtml(sample.sampleType || '—')}</td>
        <td><span class="status-badge ${(sample.status || '').toLowerCase().replace(/\s+/g, '_')}">${escHtml(sample.status || '—')}</span></td>
        <td class="muted">${formatDateTime(sample.created_at)}</td>
      `;
      displayTableBody.appendChild(row);
    });
  }

  // Update page indicator
  document.getElementById('pageIndicator').textContent = `Page ${currentPage} of ${totalPages}`;

  // Button states
  document.getElementById('prevPageBtn').disabled = (currentPage === 1);
  document.getElementById('nextPageBtn').disabled = (currentPage >= totalPages);
}

// ── Sample Lookup ─────────────────────────────────────────────
function renderLookup() {
  const q = document.getElementById('lookup-input').value.trim().toLowerCase();
  const container = document.getElementById('lookup-results');
  if (!q) { container.innerHTML = ''; return; }

  const matches = DB.samples.filter(s =>
    (s.sampleId || '').toLowerCase().includes(q) ||
    (s.submissionId || '').toLowerCase().includes(q) ||
    (s.sampleName || '').toLowerCase().includes(q) ||
    (s.customer_name || '').toLowerCase().includes(q) ||
    (s.customer_contact || '').toLowerCase().includes(q) ||
    (s.cnic || '').toLowerCase().includes(q) ||
    (s.id || '').toLowerCase().includes(q)
  );

  if (!matches.length) {
    container.innerHTML = `<div class="card card-sm" style="text-align:center;color:var(--txt-muted);padding:var(--sp-8);">No samples found matching "${escHtml(q)}"</div>`;
    return;
  }

  container.innerHTML = matches.slice(0, 10).map(s => {
    const lab = getLab(s.lab_id);
    const test = getTest(s.test_id);
    const report = getReportForSample(s.id);
    return `<div class="card card-sm card-elevated" style="margin-bottom:var(--sp-3);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-3);">
        <div>
          <div style="font-size:0.95rem;font-weight:700;color:var(--clr-primary)">${escHtml(s.sampleId || s.id)}</div>
          <div style="font-size:0.72rem;color:var(--txt-secondary)">Submission: ${escHtml(s.submissionId || '—')} · ${formatDateTime(s.created_at)}</div>
        </div>
        ${statusBadge(s.status === 'Registered' ? 'received' : s.status)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3);">
        <div class="detail-row"><span class="detail-label">Name</span><span class="detail-value">${escHtml(s.sampleName || s.customer_name || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">${escHtml(s.sampleType || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">CNIC</span><span class="detail-value">${escHtml(s.cnic || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Lab</span><span class="detail-value">${escHtml(lab?.lab_name || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Test</span><span class="detail-value">${escHtml(test?.test_name || '—')}</span></div>
      </div>
      ${report ? `<div style="margin-top:var(--sp-3);padding:var(--sp-2) var(--sp-3);background:rgba(16,185,129,0.1);border-radius:var(--r-md);font-size:0.8rem;color:#059669;">📄 Report: ${escHtml(report.report_number)}</div>` : ''}
    </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', initReceptionist);