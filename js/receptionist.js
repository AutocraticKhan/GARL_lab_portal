/* ============================================================
   receptionist.js — Receptionist dashboard logic
   ============================================================ */
'use strict';

let recSession = null;

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
}

function wireReceptionistEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchRecTab(btn.dataset.tab));
  });

  // Auto-fill collection datetime
  const colDate = document.getElementById('collection-date');
  if (colDate) colDate.value = toISOLocal();

  // Lab → Test cascade
  const labSel  = document.getElementById('sample-lab');
  const testSel = document.getElementById('sample-test');
  if (labSel) {
    populateLabDropdown();
    labSel.addEventListener('change', () => populateTestDropdown(labSel.value));
  }

  // Sample intake form
  const intakeForm = document.getElementById('intake-form');
  if (intakeForm) intakeForm.addEventListener('submit', handleIntakeSubmit);

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

// ── Lab / Test dropdowns ──────────────────────────────────────
function populateLabDropdown() {
  const sel = document.getElementById('sample-lab');
  sel.innerHTML = '<option value="">Select Laboratory…</option>' +
    getActiveLabs().map(l => `<option value="${l.id}">${escHtml(l.lab_name)}</option>`).join('');
}

function populateTestDropdown(labId) {
  const sel = document.getElementById('sample-test');
  if (!labId) { sel.innerHTML = '<option value="">Select Lab first…</option>'; return; }
  const tests = getTestsForLab(labId);
  sel.innerHTML = '<option value="">Select Test…</option>' +
    tests.map(t => `<option value="${t.id}">${escHtml(t.test_name)} (${escHtml(t.test_code)})</option>`).join('');
}

// ── Intake form ───────────────────────────────────────────────
function handleIntakeSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const labId  = form.lab_id.value;
  const testId = form.test_id.value;

  if (!labId || !testId) { showToast('Please select a lab and test.', 'error'); return; }

  const data = {
    customer_name:      form.customer_name.value.trim(),
    customer_contact:   form.customer_contact.value.trim(),
    customer_address:   form.customer_address.value.trim(),
    external_sample_id: form.external_sample_id.value.trim(),
    cnic:               form.cnic.value.trim(),
    sample_location:    form.sample_location.value.trim(),
    collection_date:    form.collection_date.value,
    collected_by:       recSession.id,
    lab_id:             labId,
    test_id:            testId,
    notes:              form.notes.value.trim(),
  };

  if (!data.customer_name) { showToast('Customer name is required.', 'error'); return; }

  const sample = createSample(data);
  showToast(`Sample ${sample.sample_number} registered successfully!`, 'success');

  // Show confirmation card
  renderIntakeConfirmation(sample);
  form.reset();
  document.getElementById('collection-date').value = toISOLocal();
  populateLabDropdown();
  document.getElementById('sample-test').innerHTML = '<option value="">Select Lab first…</option>';
}

function renderIntakeConfirmation(sample) {
  const lab  = getLab(sample.lab_id);
  const test = getTest(sample.test_id);
  const box  = document.getElementById('intake-confirm');
  box.style.display = 'block';
  box.innerHTML = `
    <div style="display:flex;align-items:center;gap:var(--sp-3);margin-bottom:var(--sp-4);">
      <div style="font-size:2rem;">✅</div>
      <div>
        <div style="font-size:1rem;font-weight:700;color:var(--clr-success);">Sample Registered</div>
        <div style="font-size:0.8rem;color:var(--txt-secondary);">Successfully saved to the system</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4);">
      <div class="detail-row"><span class="detail-label">Sample Number</span><span class="detail-value" style="font-size:1.1rem;font-weight:700;color:var(--clr-primary);">${escHtml(sample.sample_number)}</span></div>
      <div class="detail-row"><span class="detail-label">Customer</span><span class="detail-value">${escHtml(sample.customer_name)}</span></div>
      <div class="detail-row"><span class="detail-label">Contact</span><span class="detail-value">${escHtml(sample.customer_contact || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">CNIC</span><span class="detail-value">${escHtml(sample.cnic || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Sample ID</span><span class="detail-value">${escHtml(sample.external_sample_id || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Sample Location</span><span class="detail-value">${escHtml(sample.sample_location || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Lab Assigned</span><span class="detail-value">${escHtml(lab?.lab_name || '—')}</span></div>
      <div class="detail-row"><span class="detail-label">Test</span><span class="detail-value">${escHtml(test?.test_name || '—')}</span></div>
    </div>`;
}

// ── My Submissions ────────────────────────────────────────────
function renderMySubmissions() {
  const tbody = document.getElementById('my-submissions-tbody');
  const rows  = DB.samples
    .filter(s => s.collected_by === recSession.id)
    .sort((a,b) => new Date(b.created_at)-new Date(a.created_at));

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📋</div><p>No submissions yet</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(s => {
    const lab  = getLab(s.lab_id);
    const test = getTest(s.test_id);
    return `<tr>
      <td><strong style="color:var(--clr-primary)">${escHtml(s.sample_number)}</strong></td>
      <td>${escHtml(s.customer_name)}</td>
      <td class="muted">${escHtml(s.cnic || '—')}</td>
      <td class="muted">${lab ? escHtml(lab.lab_name) : '—'}</td>
      <td class="muted">${test ? escHtml(test.test_name) : '—'}</td>
      <td>${statusBadge(s.status)}</td>
      <td class="muted">${formatDateTime(s.created_at)}</td>
    </tr>`;
  }).join('');
}

// ── Sample Lookup ─────────────────────────────────────────────
function renderLookup() {
  const q = document.getElementById('lookup-input').value.trim().toLowerCase();
  const container = document.getElementById('lookup-results');
  if (!q) { container.innerHTML = ''; return; }

  const matches = DB.samples.filter(s =>
    s.sample_number?.toLowerCase().includes(q) ||
    s.customer_name?.toLowerCase().includes(q) ||
    s.customer_contact?.toLowerCase().includes(q) ||
    s.cnic?.toLowerCase().includes(q)
  );

  if (!matches.length) {
    container.innerHTML = `<div class="card card-sm" style="text-align:center;color:var(--txt-muted);padding:var(--sp-8);">No samples found matching "${escHtml(q)}"</div>`;
    return;
  }

  container.innerHTML = matches.slice(0, 10).map(s => {
    const lab    = getLab(s.lab_id);
    const test   = getTest(s.test_id);
    const report = getReportForSample(s.id);
    return `<div class="card card-sm card-elevated" style="margin-bottom:var(--sp-3);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-3);">
        <div>
          <div style="font-size:1rem;font-weight:700;color:var(--clr-primary)">${escHtml(s.sample_number)}</div>
          <div style="font-size:0.8rem;color:var(--txt-secondary)">${formatDateTime(s.created_at)}</div>
        </div>
        ${statusBadge(s.status)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3);">
        <div class="detail-row"><span class="detail-label">Customer</span><span class="detail-value">${escHtml(s.customer_name)}</span></div>
        <div class="detail-row"><span class="detail-label">Contact</span><span class="detail-value">${escHtml(s.customer_contact || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">CNIC</span><span class="detail-value">${escHtml(s.cnic || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Sample ID</span><span class="detail-value">${escHtml(s.external_sample_id || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Sample Location</span><span class="detail-value">${escHtml(s.sample_location || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Lab</span><span class="detail-value">${escHtml(lab?.lab_name || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Test</span><span class="detail-value">${escHtml(test?.test_name || '—')}</span></div>
      </div>
      ${report ? `<div style="margin-top:var(--sp-3);padding:var(--sp-2) var(--sp-3);background:rgba(16,185,129,0.1);border-radius:var(--r-md);font-size:0.8rem;color:#059669;">📄 Report available: ${escHtml(report.report_number)}</div>` : ''}
    </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', initReceptionist);
