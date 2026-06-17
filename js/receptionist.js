/* ============================================================
   receptionist.js — Receptionist dashboard logic
   (Bulk Sample Generator with read-only display table)
   ============================================================ */
'use strict';

let recSession = null;
let currentPage = 1;
const rowsPerPage = 5;

// ── In-memory sample data store (indexed by row number) ──────
let pendingSamples = [];
let nextPseudoId = 1;
let pendingPage = 1;
const PENDING_PER_PAGE = 5;

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

// ── Global Bulk Element Picker ─────────────────────────────────
const BULK_ELEMENT_GROUPS_PANEL = [
  'Precious Metals', 'Base Metals', 'Major Oxides',
  'Light Elements', 'Trace Elements', 'REE (Rare Earths)', 'All Elements'
];

function initBulkElementPicker() {
  const wrapper = document.getElementById('bulkElementPicker');
  if (!wrapper) return;

  const trigger = wrapper.querySelector('.bulk-element-trigger');
  const dropdown = wrapper.querySelector('.bulk-element-dropdown');
  const searchInput = wrapper.querySelector('.bulk-element-search');
  const hiddenInput = document.getElementById('bulkSelectedElements');
  const groupsContainer = wrapper.querySelector('.bulk-element-groups');
  const itemsContainer = wrapper.querySelector('.bulk-element-items');

  // Render group buttons
  groupsContainer.innerHTML = BULK_ELEMENT_GROUPS_PANEL.map(g =>
    `<button type="button" class="bulk-group-btn" data-group="${g}" style="display:inline-block;margin:2px;padding:3px 8px;border:1px solid var(--clr-border);border-radius:12px;background:none;cursor:pointer;font-size:0.72rem;white-space:nowrap;">${g}</button>`
  ).join('');

  // Toggle dropdown
  trigger.addEventListener('click', (e) => {
    if (e.target.closest('.bulk-chip')) return;
    const isOpen = dropdown.style.display === 'block';
    document.querySelectorAll('.bulk-element-dropdown').forEach(d => d.style.display = 'none');
    dropdown.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
      searchInput.focus();
      renderBulkItems('');
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  // Search filter
  searchInput.addEventListener('input', () => {
    renderBulkItems(searchInput.value.trim());
  });

  // Enter key
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = searchInput.value.trim();
      if (!q) return;
      const visible = itemsContainer.querySelectorAll('.bulk-element-item:not([style*="display: none"])');
      if (visible.length > 0) {
        toggleBulkElement(visible[0].dataset.symbol);
        renderBulkItems(q);
      }
    }
    if (e.key === 'Escape') {
      dropdown.style.display = 'none';
    }
  });

  // Group buttons
  groupsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.bulk-group-btn');
    if (!btn) return;
    const groupName = btn.dataset.group;
    const symbols = getElementSymbols(groupName);
    if (!symbols) return;
    const current = getBulkElements();
    const allInGroup = symbols.every(s => current.includes(s));
    let newElements;
    if (allInGroup) {
      newElements = current.filter(s => !symbols.includes(s));
    } else {
      newElements = [...current];
      symbols.forEach(s => { if (!newElements.includes(s)) newElements.push(s); });
    }
    setBulkElements(newElements);
    renderBulkItems(searchInput.value.trim());
  });

  function renderBulkItems(query) {
    const selected = getBulkElements();
    const allElements = getAllElements();

    let filtered = allElements;
    if (query) {
      const q = query.toLowerCase();
      filtered = allElements.filter(e =>
        e.symbol.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)
      );
    }

    filtered.sort((a, b) => {
      const aSel = selected.includes(a.symbol) ? 0 : 1;
      const bSel = selected.includes(b.symbol) ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
      return a.symbol.localeCompare(b.symbol);
    });

    itemsContainer.innerHTML = filtered.map(e => {
      const isSelected = selected.includes(e.symbol);
      return `<div class="bulk-element-item ${isSelected ? 'selected' : ''}" data-symbol="${e.symbol}" style="display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:var(--r-sm);cursor:pointer;background:${isSelected ? 'var(--clr-primary-g, #e0f2fe)' : 'transparent'};${isSelected ? 'font-weight:600;' : ''}">
        <span style="width:16px;text-align:center;">${isSelected ? '✓' : ''}</span>
        <span style="font-weight:600;width:28px;">${e.symbol}</span>
        <span style="color:var(--txt-secondary);">${e.name}</span>
      </div>`;
    }).join('');

    itemsContainer.querySelectorAll('.bulk-element-item').forEach(el => {
      el.addEventListener('click', () => {
        toggleBulkElement(el.dataset.symbol);
        renderBulkItems(searchInput.value.trim());
      });
    });
  }
}

function getBulkElements() {
  const hidden = document.getElementById('bulkSelectedElements');
  if (!hidden) return [];
  return hidden.value ? hidden.value.split(',') : [];
}

function setBulkElements(symbols) {
  const hidden = document.getElementById('bulkSelectedElements');
  const chipsContainer = document.querySelector('.bulk-chips-container');
  if (!hidden || !chipsContainer) return;

  const unique = [...new Set(symbols)].sort();
  hidden.value = unique.join(',');

  const chips = unique.map(s => {
    const info = getElementInfo(s);
    return `<span class="bulk-chip" data-symbol="${s}" style="display:inline-flex;align-items:center;gap:2px;padding:1px 6px;background:var(--clr-primary-g, #dbeafe);border-radius:10px;font-size:0.7rem;font-weight:500;line-height:1.4;">
      ${s}
      <span class="bulk-chip-remove" style="cursor:pointer;margin-left:2px;font-size:0.7rem;color:#666;">×</span>
    </span>`;
  }).join('');
  chipsContainer.innerHTML = chips;

  chipsContainer.querySelectorAll('.bulk-chip-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const chip = btn.closest('.bulk-chip');
      const symbol = chip.dataset.symbol;
      setBulkElements(getBulkElements().filter(s => s !== symbol));
    });
  });
}

function toggleBulkElement(symbol) {
  const current = getBulkElements();
  const idx = current.indexOf(symbol);
  if (idx >= 0) {
    current.splice(idx, 1);
  } else {
    current.push(symbol);
  }
  setBulkElements(current);
}

// ── Paginated Pending Samples Table ────────────────────────────
function buildPreviewId(rowNum) {
  const labId = document.getElementById('submission-lab').value;
  const lab = getLab(labId);
  const labCode = lab ? deriveLabCode(lab) : 'XXX';
  const subId = DB.systemState.nextSubmissionId;
  const dateStr = (document.getElementById('submission-date').value || new Date().toISOString().slice(0, 10)).slice(2, 4).replace('-', '');
  return `${dateStr}-${labCode}-${subId}-${String(rowNum).padStart(3, '0')}`;
}

function renderPendingTable() {
  const tbody = document.getElementById('formSamplesBody');
  const totalPages = Math.ceil(pendingSamples.length / PENDING_PER_PAGE) || 1;

  if (pendingPage < 1) pendingPage = 1;
  if (pendingPage > totalPages) pendingPage = totalPages;

  const startIndex = (pendingPage - 1) * PENDING_PER_PAGE;
  const endIndex = startIndex + PENDING_PER_PAGE;
  const pageData = pendingSamples.slice(startIndex, endIndex);

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:var(--sp-6);color:var(--txt-muted);">No samples added yet. Use the generator above.</td></tr>`;
  } else {
    tbody.innerHTML = pageData.map(ps => {
      const elementLabels = ps.elements.map(s => {
        const info = getElementInfo(s);
        return info ? `${s} (${info.name})` : s;
      }).join(', ');
      return `<tr data-row-num="${ps.rowNum}">
        <td style="font-weight:600;font-size:0.78rem;color:var(--clr-primary);font-family:monospace;">${escHtml(ps.previewId)}</td>
        <td>${escHtml(ps.sampleType)}</td>
        <td>${escHtml(ps.testName)}</td>
        <td style="font-size:0.78rem;">${ps.elements.length > 0 ? escHtml(elementLabels) : '—'}</td>
        <td style="text-align:center;font-weight:600;font-size:0.85rem;">${ps.elements.length}</td>
        <td><button type="button" class="btn-remove-row" onclick="removeDisplayRow(${ps.rowNum})">✕</button></td>
      </tr>`;
    }).join('');
  }

  // Update pagination controls
  const pagination = document.getElementById('pendingPagination');
  const prevBtn = document.getElementById('pendingPrevBtn');
  const nextBtn = document.getElementById('pendingNextBtn');
  const pageButtons = document.getElementById('pendingPageButtons');
  const countEl = document.getElementById('pendingSampleCount');

  if (countEl) countEl.textContent = `— ${pendingSamples.length} total`;

  if (totalPages <= 1) {
    pagination.style.display = 'none';
  } else {
    pagination.style.display = '';
    prevBtn.disabled = pendingPage <= 1;
    nextBtn.disabled = pendingPage >= totalPages;

    // Build numbered page buttons
    let pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages = [1];
      if (pendingPage > 3) pages.push('…');
      for (let i = Math.max(2, pendingPage - 1); i <= Math.min(totalPages - 1, pendingPage + 1); i++) {
        pages.push(i);
      }
      if (pendingPage < totalPages - 2) pages.push('…');
      pages.push(totalPages);
    }

    pageButtons.innerHTML = pages.map(p => {
      if (p === '…') {
        return `<span style="padding:4px 6px;color:var(--txt-muted);">…</span>`;
      }
      const isActive = p === pendingPage;
      return `<button type="button" class="page-num-btn ${isActive ? 'active' : ''}" data-page="${p}" style="min-width:32px;height:32px;padding:0 6px;border:1px solid ${isActive ? 'var(--clr-primary)' : 'var(--clr-border)'};border-radius:var(--r-sm);background:${isActive ? 'var(--clr-primary)' : 'var(--clr-surface)'};color:${isActive ? '#fff' : 'var(--txt-primary)'};cursor:pointer;font-size:0.78rem;font-weight:600;">${p}</button>`;
    }).join('');

    // Wire page button clicks
    pageButtons.querySelectorAll('.page-num-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingPage = parseInt(btn.dataset.page, 10);
        renderPendingTable();
      });
    });
  }
}

function removeDisplayRow(rowNum) {
  pendingSamples = pendingSamples.filter(s => s.rowNum !== rowNum);
  const totalPages = Math.ceil(pendingSamples.length / PENDING_PER_PAGE) || 1;
  if (pendingPage > totalPages) pendingPage = totalPages;
  renderPendingTable();
}

// ── Bulk Add Handler ────────────────────────────────────────────
function handleBulkAdd() {
  const labId = document.getElementById('submission-lab').value;
  if (!labId) {
    showToast('Please select a laboratory first.', 'warning');
    return;
  }

  const sampleType = document.getElementById('bulkSampleType').value;
  const testSelect = document.getElementById('bulkTestType');
  const countInput = document.getElementById('bulkSampleCount');
  const elements = getBulkElements();

  const testId = testSelect.value;
  const testName = testSelect.options[testSelect.selectedIndex]?.text || '';
  const count = parseInt(countInput.value, 10);

  if (!sampleType) {
    showToast('Please select a sample type.', 'warning');
    return;
  }
  if (!testId) {
    showToast('Please select a test type.', 'warning');
    return;
  }
  if (elements.length === 0) {
    showToast('Please select at least one element.', 'warning');
    return;
  }
  if (!count || count < 1 || count > 500) {
    showToast('Enter a count between 1 and 500.', 'warning');
    return;
  }

  for (let i = 0; i < count; i++) {
    const rowNum = nextPseudoId++;
    pendingSamples.push({
      rowNum,
      previewId: buildPreviewId(rowNum),
      sampleType,
      testId,
      testName,
      elements: [...elements],
    });
  }

  // Navigate to last page to see new rows
  const totalPages = Math.ceil(pendingSamples.length / PENDING_PER_PAGE) || 1;
  pendingPage = totalPages;
  renderPendingTable();

  countInput.value = '';
  showToast(`${count} "${sampleType} — ${testName}" sample(s) added.`, 'success');
}

// ── Populate bulk test dropdown (filtered by lab) ──────────────
function populateBulkTestDropdown() {
  const sel = document.getElementById('bulkTestType');
  if (!sel) return;
  sel.innerHTML = '<option value="">Test…</option>';
  const labId = document.getElementById('submission-lab').value;
  if (!labId) return;
  const tests = getTestsForLab(labId);
  tests.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.test_name;
    sel.appendChild(opt);
  });
}

// ── Auto-select default test when AAS lab is chosen ────────────
function autoSelectDefaultTest() {
  const labId = document.getElementById('submission-lab').value;
  if (!labId) return;
  const lab = getLab(labId);
  if (!lab || lab.lab_name !== 'AAS') return;
  // "Trace Elements by AAS" has test_code 'AAS-TE' and id 'tst-005'
  const defaultTest = getTest('tst-005');
  const sel = document.getElementById('bulkTestType');
  if (defaultTest && sel) {
    const opt = sel.querySelector(`option[value="tst-005"]`);
    if (opt) sel.value = 'tst-005';
  }
}

// ── Lab Dropdown for Submission Form ──────────────────────────
function populateSubmissionLabDropdown() {
  const sel = document.getElementById('submission-lab');
  sel.innerHTML = '<option value="">Select Laboratory…</option>' +
    getActiveLabs().map(l => `<option value="${l.id}">${escHtml(l.lab_name)}</option>`).join('');
}

// ── Submission Handler ──────────────────────────────────────────
function handleSubmissionSubmit(e) {
  e.preventDefault();

  const labId = document.getElementById('submission-lab').value;
  const dateVal = document.getElementById('submission-date').value;

  const customerName = document.getElementById('customer-name').value.trim();
  const customerContact = document.getElementById('customer-contact').value.trim();
  const customerAddress = document.getElementById('customer-address').value.trim();
  const cnic = document.getElementById('customer-cnic').value.trim();
  const sampleLocation = document.getElementById('sample-location').value.trim();

  // Validation
  if (!labId) { showToast('Please select a laboratory.', 'error'); return; }
  if (!dateVal) { showToast('Please select a date.', 'error'); return; }
  if (!customerName) { showToast('Please enter patient name.', 'error'); return; }
  if (pendingSamples.length === 0) {
    showToast('Please add at least one sample using the bulk generator.', 'error');
    return;
  }

  const lab = getLab(labId);
  const labCode = deriveLabCode(lab || 'LAB');
  const currentSubId = DB.systemState.nextSubmissionId;

  // Generate structured IDs
  const idMappings = generateSampleIDs(labCode, currentSubId, pendingSamples.length, dateVal);

  // Create submission record
  const newSubmission = createSubmission({
    date: dateVal,
    labCode: labCode,
    sampleCount: pendingSamples.length,
  });

  // Create sample records from pending samples
  const newSamples = [];
  pendingSamples.forEach((ps, index) => {
    const idInfo = idMappings[index];
    const sampleData = {
      sampleId: idInfo.fullId,
      submissionId: newSubmission.submissionId,
      sampleNumber: idInfo.sampleNumber,
      sampleName: idInfo.fullId,
      sampleType: ps.sampleType,
      test_id: ps.testId,
      test_name: ps.testName,
      selectedElements: ps.elements,
      elementCount: ps.elements.length,
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

  // Persist to unified storage
  const portalData = getStoredData();
  portalData.submissions.push(newSubmission);
  newSamples.forEach(s => portalData.samples.push(s));
  portalData.systemState.nextSubmissionId = DB.systemState.nextSubmissionId;
  saveStoredData(portalData);

  // Show confirmation
  showToast(`Submission #${newSubmission.submissionId} registered with ${pendingSamples.length} sample(s)!`, 'success');
  renderIntakeConfirmation(newSubmission, newSamples, lab, labCode, customerName, customerContact, cnic, sampleLocation);

  // Reset
  resetForm();
}

function resetForm() {
  // Clear table
  pendingSamples = [];
  nextPseudoId = 1;
  pendingPage = 1;
  renderPendingTable();

  // Clear bulk selections
  document.getElementById('bulkSampleType').value = '';
  document.getElementById('bulkTestType').value = '';
  document.getElementById('bulkSampleCount').value = '';
  setBulkElements([]);

  // Clear patient details
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
      <div style="font-size:0.75rem;font-weight:600;color:var(--txt-muted);margin-bottom:var(--sp-2);text-transform:uppercase;">Generated Sample IDs & Elements</div>
      <div style="display:flex;flex-direction:column;gap:var(--sp-1);">
        ${samples.map(s => `<code style="font-size:0.82rem;color:var(--clr-primary);">${escHtml(s.sampleId)} — ${escHtml(s.sampleType)} — ${(s.selectedElements || []).join(', ')} (${s.elementCount} elements)</code>`).join('')}
      </div>
    </div>`;
}

// ── Event Wiring ───────────────────────────────────────────────
function wireReceptionistEvents() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchRecTab(btn.dataset.tab));
  });

  // Lab selection → auto-derive lab code + refresh test dropdown
  const labSel = document.getElementById('submission-lab');
  if (labSel) {
    populateSubmissionLabDropdown();
    labSel.addEventListener('change', () => {
      const lab = getLab(labSel.value);
      const code = lab ? deriveLabCode(lab) : '—';
      document.getElementById('lab-code-display').innerHTML =
        lab ? `<span class="lab-code-badge">${code}</span>` : 'Select a lab to auto-generate code';
      populateBulkTestDropdown();
    });
  }

  // Submission date default
  const subDate = document.getElementById('submission-date');
  if (subDate) {
    subDate.value = new Date().toISOString().slice(0, 10);
  }

  // Default count to 1
  const bulkCount = document.getElementById('bulkSampleCount');
  if (bulkCount) bulkCount.value = 1;

  // Populate bulk test dropdown & auto-select default test if AAS
  populateBulkTestDropdown();
  autoSelectDefaultTest();
  document.getElementById('bulkAddSamplesBtn').addEventListener('click', handleBulkAdd);

  // Initialize bulk element picker
  initBulkElementPicker();

  // Wire pending pagination
  document.getElementById('pendingPrevBtn').addEventListener('click', () => {
    if (pendingPage > 1) { pendingPage--; renderPendingTable(); }
  });
  document.getElementById('pendingNextBtn').addEventListener('click', () => {
    const totalPages = Math.ceil(pendingSamples.length / PENDING_PER_PAGE) || 1;
    if (pendingPage < totalPages) { pendingPage++; renderPendingTable(); }
  });

  // Initial pending table render
  renderPendingTable();

  // Submission form submit
  document.getElementById('submissionForm').addEventListener('submit', handleSubmissionSubmit);

  // Pagination
  document.getElementById('prevPageBtn').addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; renderSamplesTable(); }
  });
  document.getElementById('nextPageBtn').addEventListener('click', () => {
    const totalPages = Math.ceil((DB.samples.length || 0) / rowsPerPage) || 1;
    if (currentPage < totalPages) { currentPage++; renderSamplesTable(); }
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

// ── My Submissions ────────────────────────────────────────────
function renderMySubmissions() {
  const tbody = document.getElementById('my-submissions-tbody');
  const rows = DB.samples
    .filter(s => s.collected_by === recSession.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📋</div><p>No submissions yet</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(s => {
    const lab = getLab(s.lab_id);
    const elements = s.selectedElements || [];
    return `<tr>
      <td><strong style="color:var(--clr-primary);font-size:0.82rem;">${escHtml(s.sampleId || s.id)}</strong></td>
      <td class="muted">${escHtml(s.submissionId || '—')}</td>
      <td>${escHtml(s.customer_name || '—')}</td>
      <td class="muted">${lab ? escHtml(lab.lab_name) : '—'}</td>
      <td class="muted">${escHtml(s.sampleType || '—')}</td>
      <td style="font-size:0.78rem;">${elements.length > 0 ? escHtml(elements.join(', ')) : '—'}</td>
      <td>${statusBadge(s.status === 'Registered' ? 'received' : s.status)}</td>
      <td class="muted">${formatDateTime(s.created_at)}</td>
    </tr>`;
  }).join('');
}

// ── Paginated Samples Table ───────────────────────────────────
function renderSamplesTable() {
  const samples = DB.samples || [];
  document.getElementById('total-sample-count').textContent = `${samples.length} total`;

  const reversedSamples = [...samples].reverse();
  const totalRows = reversedSamples.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage) || 1;

  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedData = reversedSamples.slice(startIndex, endIndex);

  const displayTableBody = document.getElementById('displayTableBody');
  displayTableBody.innerHTML = '';

  if (paginatedData.length === 0) {
    displayTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:var(--sp-8);color:var(--txt-muted);">No samples registered yet.</td></tr>`;
  } else {
    paginatedData.forEach(sample => {
      const elements = sample.selectedElements || [];
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong style="color:var(--clr-primary);font-size:0.82rem;">${escHtml(sample.sampleId || sample.id)}</strong></td>
        <td class="muted">${escHtml(sample.submissionId || '—')}</td>
        <td>${escHtml(sample.sampleName || sample.customer_name || '—')}</td>
        <td class="muted">${escHtml(sample.sampleType || '—')}</td>
        <td style="font-size:0.78rem;">${elements.length > 0 ? escHtml(elements.join(', ')) : '—'}</td>
        <td><span class="status-badge ${(sample.status || '').toLowerCase().replace(/\s+/g, '_')}">${escHtml(sample.status || '—')}</span></td>
        <td class="muted">${formatDateTime(sample.created_at)}</td>
      `;
      displayTableBody.appendChild(row);
    });
  }

  document.getElementById('pageIndicator').textContent = `Page ${currentPage} of ${totalPages}`;
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
    (s.id || '').toLowerCase().includes(q) ||
    ((s.selectedElements || []).join(',').toLowerCase().includes(q))
  );

  if (!matches.length) {
    container.innerHTML = `<div class="card card-sm" style="text-align:center;color:var(--txt-muted);padding:var(--sp-8);">No samples found matching "${escHtml(q)}"</div>`;
    return;
  }

  container.innerHTML = matches.slice(0, 10).map(s => {
    const lab = getLab(s.lab_id);
    const test = getTest(s.test_id);
    const report = getReportForSample(s.id);
    const elements = s.selectedElements || [];
    return `<div class="card card-sm card-elevated" style="margin-bottom:var(--sp-3);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-3);">
        <div>
          <div style="font-size:0.95rem;font-weight:700;color:var(--clr-primary)">${escHtml(s.sampleId || s.id)}</div>
          <div style="font-size:0.72rem;color:var(--txt-secondary)">Submission: ${escHtml(s.submissionId || '—')} · ${formatDateTime(s.created_at)}</div>
        </div>
        ${statusBadge(s.status === 'Registered' ? 'received' : s.status)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3);">
        <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">${escHtml(s.sampleType || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">CNIC</span><span class="detail-value">${escHtml(s.cnic || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Lab</span><span class="detail-value">${escHtml(lab?.lab_name || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Test</span><span class="detail-value">${escHtml(s.test_name || '—')}</span></div>
        <div class="detail-row" style="grid-column:1/-1;"><span class="detail-label">Elements (${elements.length})</span><span class="detail-value">${elements.length > 0 ? escHtml(elements.join(', ')) : '—'}</span></div>
      </div>
      ${report ? `<div style="margin-top:var(--sp-3);padding:var(--sp-2) var(--sp-3);background:rgba(16,185,129,0.1);border-radius:var(--r-md);font-size:0.8rem;color:#059669;">📄 Report: ${escHtml(report.report_number)}</div>` : ''}
    </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', initReceptionist);