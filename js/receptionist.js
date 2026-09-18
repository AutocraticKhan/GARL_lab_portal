/* ============================================================
   receptionist.js — Receptionist dashboard logic
   (Bulk Sample Generator with read-only display table)
   ============================================================ */
'use strict';

let recSession = null;
let currentPage = 1;
const rowsPerPage = 10;

// ── In-memory sample data store (indexed by row number) ──────
let pendingSamples = [];
let nextPseudoId = 1;
let pendingPage = 1;
const PENDING_PER_PAGE = 10;
let mySubPage = 1;
const MY_SUB_PER_PAGE = 10;
let reportsPage = 1;
const REPORTS_PER_PAGE = 10;
let activeRecReport = null; // { fullSubmissionId, reportType, reportNo }

// ── Review / archive workflow state ───────────────────────────
let reviewQueuePage = 1;
const REVIEW_PER_PAGE = 10;
let archivedPage = 1;
const ARCHIVED_PER_PAGE = 10;
let mySubFilter = 'all';        // 'all' | 'review'
let mySubSearch = '';
let activeReviewSubmissionId = null;
let confirmCallback = null;

async function initReceptionist() {
  recSession = requireAuth('receptionist');
  if (!recSession) return;
  await initDB();
  renderSidebarUser();
  wireLogout();
  switchRecTab('rec-tab-new');
  wireReceptionistEvents();
}

async function switchRecTab(tabId) {
  // Sync top tab buttons
  document.querySelectorAll('.tab-btn').forEach(b => {
    if (b.dataset.tab === tabId) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  // Sync sidebar dashboard active state
  const isDashboardTab = ['rec-tab-new', 'rec-tab-submissions', 'rec-tab-review', 'rec-tab-archived', 'rec-tab-all-samples', 'rec-tab-lookup'].includes(tabId);
  const dashboardBtn = document.getElementById('nav-receptionist-dashboard');
  if (dashboardBtn) {
    if (isDashboardTab) {
      dashboardBtn.classList.add('active');
    } else {
      dashboardBtn.classList.remove('active');
    }
  }

  // Sync panels
  document.querySelectorAll('.tab-panel').forEach(p => {
    if (p.id === tabId) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });

  // Pull the newest samples so returns/resubmissions from other users show up
  if (tabId === 'rec-tab-submissions' || tabId === 'rec-tab-review' || tabId === 'rec-tab-archived' || tabId === 'rec-tab-all-samples') {
    try {
      await refreshTable('samples');
    } catch (err) {
      console.warn('[RECEPTIONIST] Could not refresh samples, using cached data:', err.message);
    }
  }

  refreshReviewCounts();

  if (tabId === 'rec-tab-submissions') renderMySubmissions();
  if (tabId === 'rec-tab-review') { reviewQueuePage = 1; renderReviewQueue(); }
  if (tabId === 'rec-tab-archived') { archivedPage = 1; renderArchivedSamples(); }
  if (tabId === 'rec-tab-all-samples') {
    currentPage = 1;
    renderSamplesTable();
  }
  if (tabId === 'rec-tab-reports') renderLabReports();
}

/** Update the tab badges that show how many samples need reception review. */
function refreshReviewCounts() {
  const count = getReturnedSampleCount();
  const tabBtn = document.querySelector('[data-tab="rec-tab-review"]');
  if (tabBtn) {
    tabBtn.textContent = count > 0 ? '↩ Review Samples (' + count + ')' : '↩ Review Samples';
  }
  const subTabBtn = document.querySelector('[data-tab="rec-tab-submissions"]');
  if (subTabBtn) {
    subTabBtn.textContent = count > 0 ? '📋 My Submissions (' + count + ')' : '📋 My Submissions';
  }
  const filterBtn = document.getElementById('mySubFilterReview');
  if (filterBtn) filterBtn.textContent = 'Needs Review (' + count + ')';
}

// ── Global Bulk Element Picker ─────────────────────────────────
const BULK_ELEMENT_GROUPS_PANEL = [
  'Precious Metals', 'Base Metals', 'Major Oxides',
  'Light Elements', 'Trace Elements', 'REE (Rare Earths)', 'All Elements'
];

function initBulkElementPicker() {
  const wrapper = document.getElementById('bulkElementPicker');
  if (!wrapper) return;
  initElementPicker(wrapper, document.getElementById('bulkSelectedElements'));
}

/**
 * Initialise an element picker inside any wrapper that follows the
 * .bulk-element-trigger / .bulk-element-dropdown / .bulk-chips-container
 * markup, keeping its selection in the supplied hidden input.
 * Safe to call once per wrapper (the review panel marks initialised wrappers).
 * @param {HTMLElement} wrapper
 * @param {HTMLInputElement} hiddenInput
 */
function initElementPicker(wrapper, hiddenInput) {
  if (!wrapper || !hiddenInput) return;

  const trigger         = wrapper.querySelector('.bulk-element-trigger');
  const dropdown        = wrapper.querySelector('.bulk-element-dropdown');
  const searchInput     = wrapper.querySelector('.bulk-element-search');
  const groupsContainer = wrapper.querySelector('.bulk-element-groups');
  const itemsContainer  = wrapper.querySelector('.bulk-element-items');
  if (!trigger || !dropdown || !searchInput || !itemsContainer) return;

  const getSelected = () => getPickerElements(hiddenInput);
  const setSelected = (symbols) => applyPickerElements(wrapper, hiddenInput, symbols);

  function toggleSymbol(symbol) {
    const current = getSelected();
    const idx = current.indexOf(symbol);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(symbol);
    setSelected(current);
  }

  // Render group buttons
  groupsContainer.innerHTML = BULK_ELEMENT_GROUPS_PANEL.map(g =>
    '<button type="button" class="bulk-group-btn" data-group="' + g + '" style="display:inline-block;margin:2px;padding:3px 8px;border:1px solid var(--clr-border);border-radius:12px;background:none;cursor:pointer;font-size:0.72rem;white-space:nowrap;">' + g + '</button>'
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
    const current = getSelected();
    const allInGroup = symbols.every(s => current.includes(s));
    let newElements;
    if (allInGroup) {
      newElements = current.filter(s => !symbols.includes(s));
    } else {
      newElements = [...current];
      symbols.forEach(s => { if (!newElements.includes(s)) newElements.push(s); });
    }
    setSelected(newElements);
    renderBulkItems(searchInput.value.trim());
  });

  function renderBulkItems(query) {
    const selected = getSelected();
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
      return '<div class="bulk-element-item ' + (isSelected ? 'selected' : '') + '" data-symbol="' + e.symbol + '" style="display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:var(--r-sm);cursor:pointer;background:' + (isSelected ? 'var(--clr-primary-g, #e0f2fe)' : 'transparent') + ';' + (isSelected ? 'font-weight:600;' : '') + '">' +
        '<span style="width:16px;text-align:center;">' + (isSelected ? '✓' : '') + '</span>' +
        '<span style="font-weight:600;width:28px;">' + e.symbol + '</span>' +
        '<span style="color:var(--txt-secondary);">' + e.name + '</span>' +
      '</div>';
    }).join('');

    itemsContainer.querySelectorAll('.bulk-element-item').forEach(el => {
      el.addEventListener('click', () => {
        toggleSymbol(el.dataset.symbol);
        renderBulkItems(searchInput.value.trim());
      });
    });
  }
}

// ── Element picker selection helpers (shared) ─────────────────

/** Read the selected symbols from a picker's hidden input. */
function getPickerElements(hiddenInput) {
  if (!hiddenInput || !hiddenInput.value) return [];
  return hiddenInput.value.split(',').filter(Boolean);
}

/**
 * Write a selection into a picker's hidden input and render its chips.
 * @param {HTMLElement} wrapper - the picker wrapper (for chip lookup)
 * @param {HTMLInputElement} hiddenInput
 * @param {string[]} symbols
 */
function applyPickerElements(wrapper, hiddenInput, symbols) {
  if (!hiddenInput) return;

  const unique = [...new Set(symbols || [])].sort();
  hiddenInput.value = unique.join(',');

  const chipsContainer = wrapper ? wrapper.querySelector('.bulk-chips-container') : null;
  if (!chipsContainer) return;

  chipsContainer.innerHTML = unique.map(s =>
    '<span class="bulk-chip" data-symbol="' + s + '" style="display:inline-flex;align-items:center;gap:2px;padding:1px 6px;background:var(--clr-primary-g, #dbeafe);border-radius:10px;font-size:0.7rem;font-weight:600;line-height:1.4;cursor:pointer;">' +
      s +
      '<span class="bulk-chip-remove">×</span>' +
    '</span>'
  ).join('');

  chipsContainer.querySelectorAll('.bulk-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const symbol = chip.dataset.symbol;
      applyPickerElements(wrapper, hiddenInput, getPickerElements(hiddenInput).filter(s => s !== symbol));
    });
  });
}

// ── Bulk (new submission) element picker accessors ────────────
function getBulkElements() {
  return getPickerElements(document.getElementById('bulkSelectedElements'));
}

function setBulkElements(symbols) {
  applyPickerElements(
    document.getElementById('bulkElementPicker'),
    document.getElementById('bulkSelectedElements'),
    symbols
  );
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
  return dateStr + '-' + labCode + '-' + subId + '-' + String(rowNum).padStart(3, '0');
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
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:var(--sp-6);color:var(--txt-muted);">No samples added yet. Use the generator above.</td></tr>';
  } else {
    tbody.innerHTML = pageData.map(ps => {
      const elementLabels = ps.elements.map(s => {
        const info = getElementInfo(s);
        const sym = normalizeElementSymbol(s);
        return info ? sym + ' (' + info.name + ')' : sym;
      }).join(', ');
      return '<tr data-row-num="' + ps.rowNum + '">' +
        '<td style="font-weight:600;font-size:0.78rem;color:var(--clr-primary);font-family:monospace;">' + escHtml(ps.previewId) + '</td>' +
        '<td>' + escHtml(ps.sampleType) + '</td>' +
        '<td>' + escHtml(ps.testName) + '</td>' +
        '<td style="font-size:0.78rem;">' + (ps.elements.length > 0 ? escHtml(elementLabels) : '—') + '</td>' +
        '<td style="text-align:center;font-weight:600;font-size:0.85rem;">' + ps.elements.length + '</td>' +
        '<td><button type="button" class="btn-remove-row" onclick="removeDisplayRow(' + ps.rowNum + ')">✕</button></td>' +
      '</tr>';
    }).join('');
  }

  // Update pagination controls
  const pagination = document.getElementById('pendingPagination');
  const prevBtn = document.getElementById('pendingPrevBtn');
  const nextBtn = document.getElementById('pendingNextBtn');
  const pageButtons = document.getElementById('pendingPageButtons');
  const countEl = document.getElementById('pendingSampleCount');

  if (countEl) countEl.textContent = '— ' + pendingSamples.length + ' total';

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
        return '<span style="padding:4px 6px;color:var(--txt-muted);">…</span>';
      }
      const isActive = p === pendingPage;
      return '<button type="button" class="page-num-btn ' + (isActive ? 'active' : '') + '" data-page="' + p + '" style="min-width:32px;height:32px;padding:0 6px;border:1px solid ' + (isActive ? 'var(--clr-primary)' : 'var(--clr-border)') + ';border-radius:var(--r-sm);background:' + (isActive ? 'var(--clr-primary)' : 'var(--clr-surface)') + ';color:' + (isActive ? '#fff' : 'var(--txt-primary)') + ';cursor:pointer;font-size:0.78rem;font-weight:600;">' + p + '</button>';
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
  // Check if this test requires elements
  const test = getTest(testId);
  const requiresElements = test ? test.requires_elements !== false : true;
  if (requiresElements && elements.length === 0) {
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
  showToast(count + ' "' + sampleType + ' — ' + testName + '" sample(s) added.', 'success');
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

// ── Toggle element picker visibility based on test requires_elements ──
function toggleElementPickerForTest() {
  const testId = document.getElementById('bulkTestType').value;
  const elementPicker = document.getElementById('bulkElementPicker');
  const elementLabel = document.querySelector('label[for="bulkElementPicker"]') ||
    document.querySelector('label[style*="font-size:0.78rem;font-weight:600;display:block"]');

  if (!testId) {
    if (elementPicker) elementPicker.style.opacity = '0.5';
    return;
  }

  const test = getTest(testId);
  const requiresElements = test ? test.requires_elements !== false : true;

  if (elementPicker) {
    elementPicker.style.opacity = requiresElements ? '1' : '0.4';
    elementPicker.style.pointerEvents = requiresElements ? 'auto' : 'none';
  }
}

// ── Auto-select default test when AAS lab is chosen ────────────
function autoSelectDefaultTest() {
  const labId = document.getElementById('submission-lab').value;
  if (!labId) return;
  const lab = getLab(labId);
  if (!lab || lab.lab_name !== 'AAS') return;
  const defaultTest = getTest('tst-005');
  const sel = document.getElementById('bulkTestType');
  if (defaultTest && sel) {
    const opt = sel.querySelector('option[value="tst-005"]');
    if (opt) sel.value = 'tst-005';
  }
}

// ── Lab Dropdown for Submission Form ──────────────────────────
function populateSubmissionLabDropdown() {
  const sel = document.getElementById('submission-lab');
  sel.innerHTML = '<option value="">Select Laboratory…</option>' +
    getActiveLabs().map(l => '<option value="' + l.id + '">' + escHtml(l.lab_name) + '</option>').join('');
}

// ── Submission Handler ──────────────────────────────────────────
async function handleSubmissionSubmit(e) {
  e.preventDefault();

  const labId = document.getElementById('submission-lab').value;
  const dateVal = document.getElementById('submission-date').value;

  const customerName = document.getElementById('customer-name').value.trim();
  const customerContact = document.getElementById('customer-contact').value.trim();
  const customerAddress = document.getElementById('customer-address').value.trim();
  const cnic = document.getElementById('customer-cnic').value.trim();
  const sampleLocation = document.getElementById('sample-location').value.trim();

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

  const submitBtn = e.target.querySelector('[type=submit]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<span class="spinner"></span> Submitting…'; }

  try {
    const idMappings = generateSampleIDs(labCode, currentSubId, pendingSamples.length, dateVal);

    const newSubmission = await createSubmission({
      date: dateVal,
      labCode: labCode,
      sampleCount: pendingSamples.length,
    });

    const newSamples = [];
    for (let index = 0; index < pendingSamples.length; index++) {
      const ps = pendingSamples[index];
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
        status: 'received',
        customer_name: customerName,
        customer_contact: customerContact,
        customer_address: customerAddress,
        cnic: cnic,
        sample_location: sampleLocation,
        lab_id: labId,
        collection_date: dateVal,
        collected_by: recSession.id,
      };
      const created = await createSampleForSubmission(sampleData);
      newSamples.push(created);
    }

    showToast('Submission #' + newSubmission.submissionId + ' registered with ' + pendingSamples.length + ' sample(s)!', 'success');
    renderIntakeConfirmation(newSubmission, newSamples, lab, labCode, customerName, customerContact, cnic, sampleLocation);

    resetForm();
  } catch (err) {
    console.error('[RECEPTIONIST] Submission error:', err);
    showToast('Error submitting: ' + err.message, 'error');
  }
  if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = 'Submit Samples'; }
}

function resetForm() {
  pendingSamples = [];
  nextPseudoId = 1;
  pendingPage = 1;
  renderPendingTable();

  document.getElementById('bulkSampleType').value = '';
  document.getElementById('bulkTestType').value = '';
  document.getElementById('bulkSampleCount').value = '';
  setBulkElements([]);

  document.getElementById('customer-name').value = '';
  document.getElementById('customer-contact').value = '';
  document.getElementById('customer-address').value = '';
  document.getElementById('customer-cnic').value = '';
  document.getElementById('sample-location').value = '';
  document.getElementById('submission-date').value = new Date().toISOString().slice(0, 10);

  currentPage = 1;
  renderSamplesTable();
}

// ── Confirmation Modal ─────────────────────────────────────────
function renderIntakeConfirmation(submission, samples, lab, labCode, customerName, customerContact, cnic, sampleLocation) {
  const body = document.getElementById('intake-confirm-body');
  body.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3);">' +
      '<div class="detail-row"><span class="detail-label">Submission #</span><span class="detail-value" style="font-size:1rem;font-weight:700;color:var(--clr-primary);">' + escHtml(submission.submissionId) + '</span></div>' +
      '<div class="detail-row"><span class="detail-label">Patient</span><span class="detail-value">' + escHtml(customerName || '—') + '</span></div>' +
      '<div class="detail-row"><span class="detail-label">Contact</span><span class="detail-value">' + escHtml(customerContact || '—') + '</span></div>' +
      '<div class="detail-row"><span class="detail-label">CNIC</span><span class="detail-value">' + escHtml(cnic || '—') + '</span></div>' +
      '<div class="detail-row"><span class="detail-label">Lab</span><span class="detail-value">' + escHtml(lab?.lab_name || '—') + '</span></div>' +
      '<div class="detail-row"><span class="detail-label">Lab Code</span><span class="detail-value"><span class="lab-code-badge">' + escHtml(labCode) + '</span></span></div>' +
      '<div class="detail-row"><span class="detail-label">Date</span><span class="detail-value">' + escHtml(submission.date) + '</span></div>' +
      '<div class="detail-row"><span class="detail-label">Samples</span><span class="detail-value">' + samples.length + '</span></div>' +
    '</div>';
  openModal('modal-intake-confirm');
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
        lab ? '<span class="lab-code-badge">' + code + '</span>' : 'Select a lab to auto-generate code';
      populateBulkTestDropdown();
      toggleElementPickerForTest();
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

  // Wire test change to toggle element picker
  const bulkTestSel = document.getElementById('bulkTestType');
  if (bulkTestSel) {
    bulkTestSel.addEventListener('change', toggleElementPickerForTest);
  }
  // Initial toggle state
  setTimeout(toggleElementPickerForTest, 100);

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

  // My Submissions pagination
  const mySubPrev = document.getElementById('mySubPrevBtn');
  const mySubNext = document.getElementById('mySubNextBtn');
  if (mySubPrev) {
    mySubPrev.addEventListener('click', () => {
      if (mySubPage > 1) { mySubPage--; renderMySubmissions(); }
    });
  }
  if (mySubNext) {
    mySubNext.addEventListener('click', () => {
      const submissions = getMySubmissionGroups();
      const totalPages = Math.ceil(submissions.length / MY_SUB_PER_PAGE) || 1;
      if (mySubPage < totalPages) { mySubPage++; renderMySubmissions(); }
    });
  }

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

  // Side panel close
  document.getElementById('close-rec-sample-panel').addEventListener('click', () => closePanel('rec-sample-panel-overlay'));
  document.getElementById('rec-sample-panel-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('rec-sample-panel-overlay')) closePanel('rec-sample-panel-overlay');
  });

  // ── Lab Reports tab events ──
  const reportsSearch = document.getElementById('reports-search');
  if (reportsSearch) {
    reportsSearch.addEventListener('input', debounce(renderLabReports, 250));
  }
  const reportsPrev = document.getElementById('reportsPrevBtn');
  const reportsNext = document.getElementById('reportsNextBtn');
  if (reportsPrev) {
    reportsPrev.addEventListener('click', () => {
      if (reportsPage > 1) { reportsPage--; renderLabReports(); }
    });
  }
  if (reportsNext) {
    reportsNext.addEventListener('click', () => {
      const total = (DB.savedReports || []).length;
      const totalPages = Math.ceil(total / REPORTS_PER_PAGE) || 1;
      if (reportsPage < totalPages) { reportsPage++; renderLabReports(); }
    });
  }

  // Report viewer panel close
  const closeRecReportBtn = document.getElementById('close-rec-report-panel');
  if (closeRecReportBtn) {
    closeRecReportBtn.addEventListener('click', () => closePanel('rec-report-overlay'));
  }
  const recReportOverlay = document.getElementById('rec-report-overlay');
  if (recReportOverlay) {
    recReportOverlay.addEventListener('click', (e) => {
      if (e.target === recReportOverlay) closePanel('rec-report-overlay');
    });
  }

  // Intake confirmation modal close wiring
  const closeIntakeBtns = [
    document.getElementById('close-intake-modal'),
    document.getElementById('close-intake-modal-btn')
  ];
  closeIntakeBtns.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', () => closeModal('modal-intake-confirm'));
    }
  });
  const modalOverlay = document.getElementById('modal-intake-confirm');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal('modal-intake-confirm');
    });
  }

  // ── My Submissions filter & search ──
  const mySubAllBtn = document.getElementById('mySubFilterAll');
  const mySubReviewBtn = document.getElementById('mySubFilterReview');
  if (mySubAllBtn) {
    mySubAllBtn.addEventListener('click', () => {
      mySubFilter = 'all';
      mySubPage = 1;
      mySubAllBtn.classList.add('active');
      if (mySubReviewBtn) mySubReviewBtn.classList.remove('active');
      renderMySubmissions();
    });
  }
  if (mySubReviewBtn) {
    mySubReviewBtn.addEventListener('click', () => {
      mySubFilter = 'review';
      mySubPage = 1;
      mySubReviewBtn.classList.add('active');
      if (mySubAllBtn) mySubAllBtn.classList.remove('active');
      renderMySubmissions();
    });
  }
  const mySubSearchInput = document.getElementById('mySubSearch');
  if (mySubSearchInput) {
    mySubSearchInput.addEventListener('input', debounce(() => {
      mySubSearch = mySubSearchInput.value.trim();
      mySubPage = 1;
      renderMySubmissions();
    }, 250));
  }

  // ── Review queue pagination ──
  const reviewPrev = document.getElementById('reviewPrevBtn');
  const reviewNext = document.getElementById('reviewNextBtn');
  if (reviewPrev) {
    reviewPrev.addEventListener('click', () => {
      if (reviewQueuePage > 1) { reviewQueuePage--; renderReviewQueue(); }
    });
  }
  if (reviewNext) {
    reviewNext.addEventListener('click', () => {
      const totalPages = Math.ceil(getReturnedSubmissions().length / REVIEW_PER_PAGE) || 1;
      if (reviewQueuePage < totalPages) { reviewQueuePage++; renderReviewQueue(); }
    });
  }

  // ── Archived tab search & pagination ──
  const archivedSearchInput = document.getElementById('archived-search');
  if (archivedSearchInput) {
    archivedSearchInput.addEventListener('input', debounce(() => {
      archivedPage = 1;
      renderArchivedSamples();
    }, 250));
  }
  const archivedPrev = document.getElementById('archivedPrevBtn');
  const archivedNext = document.getElementById('archivedNextBtn');
  if (archivedPrev) {
    archivedPrev.addEventListener('click', () => {
      if (archivedPage > 1) { archivedPage--; renderArchivedSamples(); }
    });
  }
  if (archivedNext) {
    archivedNext.addEventListener('click', () => {
      archivedPage++;
      renderArchivedSamples(); // render clamps the page into range
    });
  }

  // ── All Samples status filter ──
  const allSamplesFilter = document.getElementById('all-samples-status-filter');
  if (allSamplesFilter) {
    allSamplesFilter.addEventListener('change', () => {
      currentPage = 1;
      renderSamplesTable();
    });
  }

  // ── Review panel close ──
  const closeReviewBtn = document.getElementById('close-rec-review-panel');
  if (closeReviewBtn) {
    closeReviewBtn.addEventListener('click', () => {
      activeReviewSubmissionId = null;
      closePanel('rec-review-overlay');
    });
  }
  const reviewOverlay = document.getElementById('rec-review-overlay');
  if (reviewOverlay) {
    reviewOverlay.addEventListener('click', (e) => {
      if (e.target === reviewOverlay) {
        activeReviewSubmissionId = null;
        closePanel('rec-review-overlay');
      }
    });
  }

  // ── Generic confirm modal ──
  const confirmOk = document.getElementById('rec-confirm-ok');
  const confirmCancel = document.getElementById('rec-confirm-cancel');
  const confirmX = document.getElementById('rec-confirm-x');
  const confirmModal = document.getElementById('modal-rec-confirm');
  const closeRecConfirmModal = () => {
    closeModal('modal-rec-confirm');
    confirmCallback = null;
  };
  if (confirmOk) {
    confirmOk.addEventListener('click', () => {
      const action = confirmCallback;
      closeRecConfirmModal();
      if (action) action();
    });
  }
  if (confirmCancel) confirmCancel.addEventListener('click', closeRecConfirmModal);
  if (confirmX) confirmX.addEventListener('click', closeRecConfirmModal);
  if (confirmModal) {
    confirmModal.addEventListener('click', (e) => {
      if (e.target === confirmModal) closeRecConfirmModal();
    });
  }

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

// ─ Helper: get submissions collected by this receptionist ─────
function getMySubmissionGroups() {
  const mySamples = DB.samples.filter(s => s.collected_by === recSession.id);

  return groupSamplesBySubmission(mySamples)
    .map(g => ({
      ...g,
      // Legacy flags kept for existing rendering code
      allCompleted: g.allDone,
      hasReports: g.samples.every(s => !!getReportForSample(s.id)),
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// ── My Submissions (Grouped, with Generate Report button) ─────
function renderMySubmissions() {
  const tbody = document.getElementById('my-submissions-tbody');
  let submissions = getMySubmissionGroups();

  // Apply the All / Needs Review filter
  if (mySubFilter === 'review') {
    submissions = submissions.filter(sub => sub.hasReturned);
  }
  // Apply the toolbar search
  if (mySubSearch) {
    const q = mySubSearch.toLowerCase();
    submissions = submissions.filter(sub =>
      (sub.submissionId || '').toLowerCase().includes(q) ||
      (sub.customer_name || '').toLowerCase().includes(q) ||
      (sub.test_name || '').toLowerCase().includes(q) ||
      (sub.samples || []).some(s => (s.sampleId || '').toLowerCase().includes(q))
    );
  }

    if (!submissions.length) {
      const emptyMsg = mySubFilter === 'review' ? 'No samples currently need review' : 'No submissions yet';
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📋</div><p>' + emptyMsg + '</p></div></td></tr>';
    document.getElementById('my-sub-pagination').style.display = 'none';
    return;
  }

  const totalPages = Math.ceil(submissions.length / MY_SUB_PER_PAGE) || 1;
  if (mySubPage < 1) mySubPage = 1;
  if (mySubPage > totalPages) mySubPage = totalPages;

  const startIndex = (mySubPage - 1) * MY_SUB_PER_PAGE;
  const endIndex = startIndex + MY_SUB_PER_PAGE;
  const pageData = submissions.slice(startIndex, endIndex);

  tbody.innerHTML = pageData.map(sub => {
    const lab = getLab(sub.lab_id);
    const reports = getReportsForSubmission(sub.submissionId);
    const reportNumbers = reports.map(r => r.report_number).filter(Boolean).join(', ');

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

    // A sample counts as finished once completed OR archived
    const completedDates = sub.samples
      .map(s => s.completed_at || s.archived_at)
      .filter(Boolean).sort().reverse();
    const completedDate = completedDates[0] || null;

    const returnReasons = [...new Set(sub.returnedSamples.map(s => s.return_reason).filter(Boolean))].join(' · ');

    return '<tr class="clickable' + (sub.hasReturned ? ' needs-review-row' : '') + '" onclick="openRecSubmissionPanel(\'' + sub.submissionId + '\')">' +
      '<td><strong style="color:var(--clr-primary);font-size:0.82rem;">#' + escHtml(sub.submissionId) + '</strong></td>' +
      '<td>' + escHtml(sub.customer_name || '—') + '</td>' +
      '<td class="muted">' + (lab ? escHtml(lab.lab_name) : '—') + '</td>' +
      '<td class="muted">' + escHtml(sub.test_name || '—') + '</td>' +
      '<td class="muted" style="font-family:monospace;font-size:0.75rem;">' + sampleRange + '</td>' +
      '<td style="text-align:center;font-weight:600;">' + sub.sampleCount + '</td>' +
      '<td>' + statusBadge(sub.statusSummary) +
        (sub.hasReturned ? ' <span class="badge badge-returned" title="' + escHtml(returnReasons) + '">↩ ' + sub.returnedCount + '</span>' : '') +
      '</td>' +
      '<td class="muted" style="font-size:0.75rem;">' + (completedDate ? formatDate(completedDate) : '—') + '</td>' +
    '</tr>';
  }).join('');

  // Update pagination controls
  const pagination = document.getElementById('my-sub-pagination');
  const prevBtn = document.getElementById('mySubPrevBtn');
  const nextBtn = document.getElementById('mySubNextBtn');
  const pageIndicator = document.getElementById('mySubPageIndicator');

  if (totalPages <= 1) {
    pagination.style.display = 'none';
  } else {
    pagination.style.display = '';
    prevBtn.disabled = mySubPage <= 1;
    nextBtn.disabled = mySubPage >= totalPages;
    if (pageIndicator) pageIndicator.textContent = 'Page ' + mySubPage + ' of ' + totalPages;
  }
}

// ── Review Queue (samples returned by the lab) ────────────────
function getUserName(userId) {
  if (!userId) return '—';
  const u = (DB.users || []).find(x => x.id === userId);
  return u ? (u.full_name || u.username || '—') : '—';
}

function renderReviewQueue() {
  const tbody = document.getElementById('review-tbody');
  if (!tbody) return;

  const submissions = getReturnedSubmissions();
  const countEl = document.getElementById('review-queue-count');
  if (countEl) {
    countEl.textContent = submissions.length
      ? getReturnedSampleCount() + ' sample(s) waiting for review'
      : '';
  }

  if (!submissions.length) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">✅</div><p>No samples are waiting for review</p></div></td></tr>';
    const p = document.getElementById('review-pagination');
    if (p) p.style.display = 'none';
    return;
  }

  const totalPages = Math.ceil(submissions.length / REVIEW_PER_PAGE) || 1;
  if (reviewQueuePage < 1) reviewQueuePage = 1;
  if (reviewQueuePage > totalPages) reviewQueuePage = totalPages;
  const pageData = submissions.slice((reviewQueuePage - 1) * REVIEW_PER_PAGE, reviewQueuePage * REVIEW_PER_PAGE);

  tbody.innerHTML = pageData.map(sub => {
    const lab = getLab(sub.lab_id);
    // Latest reason across the returned samples of this submission
    const latestReturn = sub.returnedSamples.reduce((acc, s) =>
      (!acc || new Date(s.returned_at || 0) > new Date(acc.returned_at || 0)) ? s : acc, null);
    return '<tr class="clickable needs-review-row" onclick="openReviewPanel(\'' + sub.submissionId + '\')">' +
      '<td><strong style="color:var(--clr-primary);font-size:0.82rem;">#' + escHtml(sub.submissionId) + '</strong></td>' +
      '<td>' + escHtml(sub.customer_name || '—') + '</td>' +
      '<td class="muted">' + (lab ? escHtml(lab.lab_name) : '—') + '</td>' +
      '<td class="muted">' + escHtml(sub.test_name || '—') + '</td>' +
      '<td style="text-align:center;font-weight:700;color:#dc2626;">' + sub.returnedCount + ' / ' + sub.sampleCount + '</td>' +
      '<td class="muted" style="font-size:0.78rem;max-width:220px;">' + escHtml(latestReturn ? (latestReturn.return_reason || '—') : '—') + '</td>' +
      '<td class="muted" style="font-size:0.75rem;">' + (sub.latestReturnedAt ? formatDateTime(sub.latestReturnedAt) : '—') + '</td>' +
      '<td class="muted" style="font-size:0.78rem;">' + escHtml(getUserName(sub.collected_by)) + '</td>' +
      '<td><button type="button" class="btn btn-primary btn-sm">Review →</button></td>' +
    '</tr>';
  }).join('');

  const pagination = document.getElementById('review-pagination');
  const prevBtn = document.getElementById('reviewPrevBtn');
  const nextBtn = document.getElementById('reviewNextBtn');
  const pageIndicator = document.getElementById('reviewPageIndicator');
  if (pagination) {
    if (totalPages <= 1) {
      pagination.style.display = 'none';
    } else {
      pagination.style.display = '';
      if (prevBtn) prevBtn.disabled = reviewQueuePage <= 1;
      if (nextBtn) nextBtn.disabled = reviewQueuePage >= totalPages;
      if (pageIndicator) pageIndicator.textContent = 'Page ' + reviewQueuePage + ' of ' + totalPages;
    }
  }
}

// ── Archived Samples (closed without analysis) ────────────────
function renderArchivedSamples() {
  const tbody = document.getElementById('archived-tbody');
  if (!tbody) return;

  const searchEl = document.getElementById('archived-search');
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  let samples = getArchivedSamples();
  if (q) {
    samples = samples.filter(s =>
      (s.sampleId || '').toLowerCase().includes(q) ||
      (s.submissionId || '').toLowerCase().includes(q) ||
      (s.customer_name || '').toLowerCase().includes(q) ||
      (s.archive_reason || '').toLowerCase().includes(q) ||
      (s.archived_by || '').toLowerCase().includes(q)
    );
  }
  const countEl = document.getElementById('archived-count');
  if (countEl) countEl.textContent = samples.length + ' archived';

  if (!samples.length) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">🗄️</div><p>' +
      (q ? 'No archived samples match your search' : 'No archived samples yet') + '</p></div></td></tr>';
    const p = document.getElementById('archived-pagination');
    if (p) p.style.display = 'none';
    return;
  }

  const totalPages = Math.ceil(samples.length / ARCHIVED_PER_PAGE) || 1;
  if (archivedPage < 1) archivedPage = 1;
  if (archivedPage > totalPages) archivedPage = totalPages;
  const pageData = samples.slice((archivedPage - 1) * ARCHIVED_PER_PAGE, archivedPage * ARCHIVED_PER_PAGE);

  tbody.innerHTML = pageData.map(s => {
    const lab = getLab(s.lab_id);
    return '<tr>' +
      '<td><strong style="color:var(--clr-primary);font-size:0.82rem;">' + escHtml(s.sampleId || s.id) + '</strong></td>' +
      '<td class="muted">' + escHtml(s.submissionId || '—') + '</td>' +
      '<td>' + escHtml(s.customer_name || '—') + '</td>' +
      '<td class="muted">' + (lab ? escHtml(lab.lab_name) : '—') + '</td>' +
      '<td class="muted">' + escHtml(s.test_name || '—') + '</td>' +
      '<td class="muted" style="font-size:0.78rem;max-width:200px;">' + escHtml(s.archive_reason || '—') + '</td>' +
      '<td class="muted" style="font-size:0.78rem;">' + escHtml(s.archived_by || '—') + '</td>' +
      '<td class="muted" style="font-size:0.75rem;">' + (s.archived_at ? formatDateTime(s.archived_at) : '—') + '</td>' +
      '<td><button type="button" class="btn btn-secondary btn-sm" onclick="handleRestoreArchived(\'' + escHtml(s.id) + '\')">↻ Restore</button></td>' +
    '</tr>';
  }).join('');

  const pagination = document.getElementById('archived-pagination');
  const prevBtn = document.getElementById('archivedPrevBtn');
  const nextBtn = document.getElementById('archivedNextBtn');
  const pageIndicator = document.getElementById('archivedPageIndicator');
  if (pagination) {
    if (totalPages <= 1) {
      pagination.style.display = 'none';
    } else {
      pagination.style.display = '';
      if (prevBtn) prevBtn.disabled = archivedPage <= 1;
      if (nextBtn) nextBtn.disabled = archivedPage >= totalPages;
      if (pageIndicator) pageIndicator.textContent = 'Page ' + archivedPage + ' of ' + totalPages;
    }
  }
}

// ── Review Panel: edit & resubmit or archive ──────────────────
function openReviewPanel(submissionId) {
  const body = document.getElementById('rec-review-body');
  const footer = document.getElementById('rec-review-footer');
  if (!body) return;

  const samples = DB.samples.filter(s => s.submissionId === submissionId);
  const returned = samples.filter(isSampleReturned);
  if (!returned.length) {
    showToast('No samples in this submission are awaiting review.', 'info');
    return;
  }

  activeReviewSubmissionId = submissionId;
  const title = document.getElementById('rec-review-title');
  if (title) title.textContent = 'Review — ' + submissionId;

  // Banner: who returned what and why
  const reasons = [...new Set(returned.map(s => s.return_reason).filter(Boolean))];
  const returnedBy = [...new Set(returned.map(s => s.returned_by).filter(Boolean))];
  const banner = '<div class="review-alert review-alert-warning">' +
    '<span style="font-size:1.1rem;">↩</span>' +
    '<div><strong>' + returned.length + ' of ' + samples.length + ' sample(s) returned' +
    (returnedBy.length ? ' by ' + escHtml(returnedBy.join(', ')) : '') + '</strong>' +
    (reasons.length ? '<div style="margin-top:2px;">Reason: ' + escHtml(reasons.join(' · ')) + '</div>' : '') +
    '<div style="margin-top:2px;">Edit the details below, then resubmit to the lab — or archive to close without analysis.</div></div></div>';

  // Warn when saved reports already exist for this submission
  const existingReports = (DB.savedReports || []).filter(r => r.submission_id === submissionId);
  const staleWarning = existingReports.length
    ? '<div class="review-alert review-alert-info"><span style="font-size:1.1rem;">⚠️</span><div>This submission already has ' + existingReports.length +
      ' saved report(s). After resubmitting they are marked out of date and must be regenerated before issuing.</div></div>'
    : '';

  // Editable card per returned sample
  const typeOptions = ['Rock', 'Ore', 'Core', 'Soil', 'Sediment', 'Water', 'Concentrate', 'Tailings', 'Dust', 'Sludge'];

  const cards = returned.map((s, idx) => {
    const labOpts = (DB.labs || [])
      .filter(l => l.active !== false)
      .map(l => '<option value="' + escHtml(l.id) + '">' + escHtml(l.lab_name) + '</option>')
      .join('');
    const testOpts = (DB.tests || [])
      .map(t => '<option value="' + escHtml(t.id) + '">' + escHtml(t.test_name || t.name || t.id) + '</option>')
      .join('');
    const typeOpts = typeOptions.map(t =>
      '<option value="' + t + '"' + (s.sampleType === t ? ' selected' : '') + '>' + t + '</option>').join('');
    return '<div class="review-sample-card" data-id="' + escHtml(s.id) + '">' +
      '<div style="display:flex;align-items:center;gap:var(--sp-2);margin-bottom:var(--sp-3);flex-wrap:wrap;">' +
        '<input type="checkbox" class="review-sample-check" checked />' +
        '<strong style="color:var(--clr-primary);font-size:0.85rem;">' + escHtml(s.sampleId || s.id) + '</strong>' +
        (s.return_reason ? '<span class="badge badge-returned" style="font-size:0.68rem;">' + escHtml(s.return_reason) + '</span>' : '') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3);margin-bottom:var(--sp-3);">' +
        '<div class="form-group" style="margin:0;"><label class="form-label">Laboratory</label>' +
          '<select class="form-control review-lab-select">' + labOpts + '</select></div>' +
        '<div class="form-group" style="margin:0;"><label class="form-label">Test</label>' +
          '<select class="form-control review-test-select">' + testOpts + '</select></div>' +
        '<div class="form-group" style="margin:0;"><label class="form-label">Sample Type</label>' +
          '<select class="form-control review-type-input"><option value="">Type…</option>' + typeOpts + '</select></div>' +
        '<div class="form-group" style="margin:0;"><label class="form-label">Elements</label>' + reviewPickerTpl(idx) + '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  body.innerHTML = banner + staleWarning + cards;

  // Initialise each per-sample element picker with the sample's current values
  returned.forEach((s, idx) => {
    const card = document.querySelector('#rec-review-body .review-sample-card[data-id="' + s.id + '"]');
    if (!card) return;
    const wrapper = card.querySelector('.review-picker');
    const hidden = card.querySelector('input[type="hidden"]');
    initElementPicker(wrapper, hidden);
    applyPickerElements(wrapper, hidden, s.selectedElements || []);
    const labSel = card.querySelector('.review-lab-select');
    const testSel = card.querySelector('.review-test-select');
    if (labSel) labSel.value = s.lab_id || '';
    if (testSel) testSel.value = s.test_id || '';
  });

  // Footer with the archive reason + actions
  if (footer) {
    footer.innerHTML =
      '<div style="width:100%;display:flex;flex-direction:column;gap:var(--sp-2);">' +
        '<select id="rec-archive-reason" class="form-control">' +
          '<option value="">Archive reason (only needed for archiving)…</option>' +
          ARCHIVE_REASONS.map(r => '<option value="' + escHtml(r) + '">' + escHtml(r) + '</option>').join('') +
        '</select>' +
        '<input type="text" id="rec-review-note" class="form-control" placeholder="Optional note for the lab…" />' +
        '<div style="display:flex;gap:var(--sp-2);flex-wrap:wrap;">' +
          '<button type="button" class="btn btn-primary" id="rec-resubmit-btn" onclick="handleReviewResubmit()">↩ Resubmit Selected</button>' +
          '<button type="button" class="btn btn-secondary" id="rec-archive-btn" style="border-color:#fca5a5;color:#dc2626;" onclick="handleReviewArchive()">🗄️ Archive Selected</button>' +
        '</div>' +
      '</div>';
    footer.style.display = '';
  }

  openPanel('rec-review-overlay');
}

/** Markup template for a per-sample element picker inside the review panel. */
function reviewPickerTpl(idx) {
  return '<div class="review-picker" style="position:relative;">' +
    '<div class="bulk-element-trigger" style="display:flex;flex-wrap:wrap;gap:2px;min-height:32px;padding:3px 6px;border:1px solid var(--clr-border);border-radius:var(--r-sm);cursor:pointer;background:var(--clr-surface);align-items:center;">' +
      '<div class="bulk-chips-container" style="display:inline-flex;flex-wrap:wrap;gap:2px;align-items:center;"></div>' +
      '<input type="text" class="bulk-element-search" placeholder="Search elements…" style="border:none;outline:none;background:none;flex:1;min-width:60px;font-size:0.8rem;padding:2px;" />' +
    '</div>' +
    '<div class="bulk-element-dropdown" style="display:none;position:absolute;z-index:1050;top:100%;left:0;right:0;background:#fff;border:1px solid var(--clr-border);border-radius:var(--r-md);box-shadow:0 8px 24px rgba(0,0,0,0.15);max-height:280px;overflow-y:auto;font-size:0.8rem;">' +
      '<div class="bulk-element-groups" style="padding:4px;border-bottom:1px solid var(--clr-border);"></div>' +
      '<div class="bulk-element-items" style="padding:4px;display:grid;grid-template-columns:1fr 1fr;gap:2px;"></div>' +
    '</div>' +
    '<input type="hidden" id="reviewElements_' + idx + '" class="review-elements-input" value="" />' +
  '</div>';
}

/** Generic reception confirm dialog (pass a callback to run on OK). */
function showRecConfirm(title, message, onOk) {
  const titleEl = document.getElementById('rec-confirm-title');
  const msgEl = document.getElementById('rec-confirm-message');
  if (!titleEl || !msgEl) {
    // Fallback: run immediately rather than blocking the workflow
    if (onOk) onOk();
    return;
  }
  titleEl.textContent = title;
  msgEl.innerHTML = message;
  confirmCallback = onOk || null;
  openModal('modal-rec-confirm');
}

/** Read the edited values of every checked returned sample in the review panel. */
function collectReviewSelections() {
  const cards = document.querySelectorAll('#rec-review-body .review-sample-card');
  const items = [];
  cards.forEach(card => {
    const check = card.querySelector('.review-sample-check');
    if (!check || !check.checked) return;
    const labSel = card.querySelector('.review-lab-select');
    const testSel = card.querySelector('.review-test-select');
    const typeInput = card.querySelector('.review-type-input');
    const hidden = card.querySelector('.review-elements-input');
    const test = getTest(testSel ? testSel.value : '');
    items.push({
      id: card.dataset.id,
      lab_id: labSel ? labSel.value : '',
      test_id: testSel ? testSel.value : '',
      test_name: test ? (test.test_name || test.name || '') : '',
      sampleType: typeInput ? typeInput.value : '',
      selectedElements: hidden ? getPickerElements(hidden) : [],
    });
  });
  return items;
}

/** Resubmit the checked returned samples to their (possibly re-selected) lab. */
async function handleReviewResubmit() {
  if (!activeReviewSubmissionId) return;
  const items = collectReviewSelections();
  if (!items.length) {
    showToast('Tick at least one sample to resubmit.', 'warning');
    return;
  }
  const noteInput = document.getElementById('rec-review-note');
  const note = noteInput ? noteInput.value : '';
  const reasonSel = document.getElementById('rec-archive-reason');
  const archiveReason = reasonSel ? reasonSel.value : '';

  showRecConfirm(
    'Resubmit to Lab',
    'Resubmit <strong>' + items.length + '</strong> sample(s) of <strong>' +
      escHtml(activeReviewSubmissionId) + '</strong> to the lab?' +
      (archiveReason ? '<div class="muted" style="margin-top:6px;font-size:0.8rem;">Note: an archive reason is selected but will be ignored because you are resubmitting.</div>' : ''),
    async () => {
      try {
        setBusy('rec-resubmit-btn', true, 'Resubmitting…');
        await resubmitSamples(items, note);
        const fullId = activeReviewSubmissionId;
        activeReviewSubmissionId = null;
        closePanel('rec-review-overlay');
        await markSavedReportsStale(fullId);
        showToast(items.length + ' sample(s) resubmitted to the lab.', 'success');
        await refreshTable('samples');
        refreshReviewCounts();
        renderMySubmissions();
        renderReviewQueue();
        renderSamplesTable();
      } catch (err) {
        console.error('[RECEPTIONIST] Resubmit failed:', err);
        showToast(err.message || 'Could not resubmit samples.', 'error');
      } finally {
        setBusy('rec-resubmit-btn', false);
      }
    }
  );
}

/** Archive the checked returned samples (closed without analysis). */
async function handleReviewArchive() {
  if (!activeReviewSubmissionId) return;
  const cards = document.querySelectorAll('#rec-review-body .review-sample-card');
  const ids = [];
  cards.forEach(card => {
    const check = card.querySelector('.review-sample-check');
    if (check && check.checked) ids.push(card.dataset.id);
  });
  if (!ids.length) {
    showToast('Tick at least one sample to archive.', 'warning');
    return;
  }
  const reasonSel = document.getElementById('rec-archive-reason');
  const reason = reasonSel ? reasonSel.value : '';
  if (!reason) {
    showToast('Select an archive reason first (required).', 'warning');
    if (reasonSel) reasonSel.focus();
    return;
  }
  const noteInput = document.getElementById('rec-review-note');
  const note = noteInput ? noteInput.value : '';

  showRecConfirm(
    'Archive Samples',
    'Archive <strong>' + ids.length + '</strong> sample(s) of <strong>' +
      escHtml(activeReviewSubmissionId) + '</strong> without analysis?<br/>' +
      '<span class="muted" style="font-size:0.8rem;">They will count as completed in progress reports, get no analysis report, and can be restored from the Archived tab later.</span>',
    async () => {
      try {
        setBusy('rec-archive-btn', true, 'Archiving…');
        await archiveReturnedSamples(ids, reason, note);
        activeReviewSubmissionId = null;
        closePanel('rec-review-overlay');
        showToast(ids.length + ' sample(s) archived.', 'success');
        await refreshTable('samples');
        refreshReviewCounts();
        renderMySubmissions();
        renderReviewQueue();
        renderArchivedSamples();
        renderSamplesTable();
      } catch (err) {
        console.error('[RECEPTIONIST] Archive failed:', err);
        showToast(err.message || 'Could not archive samples.', 'error');
      } finally {
        setBusy('rec-archive-btn', false);
      }
    }
  );
}

/** Restore a single archived sample back into the lab queue. */
async function handleRestoreArchived(sampleId) {
  const sample = getSample(sampleId);
  if (!sample) {
    showToast('Sample not found. Refresh and try again.', 'error');
    return;
  }
  showRecConfirm(
    'Restore Archived Sample',
    'Restore <strong>' + escHtml(sample.sampleId || sample.id) + '</strong> from archive and send it back to the lab queue for analysis?',
    async () => {
      try {
        await restoreArchivedSamples([sampleId]);
        showToast('Sample restored to the lab queue.', 'success');
        await refreshTable('samples');
        refreshReviewCounts();
        renderArchivedSamples();
        renderMySubmissions();
        renderSamplesTable();
      } catch (err) {
        console.error('[RECEPTIONIST] Restore failed:', err);
        showToast(err.message || 'Could not restore sample.', 'error');
      }
    }
  );
}

// ── Generate Report for Submission ─────────────────────────────
async function generateReportForSubmission(submissionId) {
  const btn = document.querySelector('button[onclick*="' + submissionId + '"]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating…';

  try {
    const samples = DB.samples.filter(s => s.submissionId === submissionId);
    if (!samples.length) {
      showToast('No samples found in this submission.', 'error');
      btn.disabled = false;
      btn.innerHTML = '📄 Generate Report';
      return;
    }

    const labId = samples[0].lab_id;
    const reports = await generateSubmissionReports(submissionId, labId, recSession.id, recSession.full_name);

    if (reports.length > 0) {
      const lab = getLab(labId);
      const reportNums = reports.map(r => r.report_number).join(', ');
      showToast('Generated ' + reports.length + ' report(s): ' + reportNums, 'success');
    } else {
      showToast('No new reports generated (may already exist).', 'info');
    }

    renderMySubmissions();
  } catch (err) {
    console.error('[RECEPTIONIST] Report generation error:', err);
    showToast('Error generating reports: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '📄 Generate Report';
  }
}

// ── Paginated Samples Table ───────────────────────────────────
function renderSamplesTable() {
  const allSamples = DB.samples || [];
  const statusFilterEl = document.getElementById('all-samples-status-filter');
  const statusFilter = statusFilterEl ? statusFilterEl.value : '';
  const samples = statusFilter
    ? allSamples.filter(s => s.status === statusFilter)
    : allSamples;
  document.getElementById('total-sample-count').textContent =
    allSamples.length + ' total' + (statusFilter ? ' · ' + samples.length + ' shown' : '');

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
    displayTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:var(--sp-8);color:var(--txt-muted);">No samples registered yet.</td></tr>';
  } else {
    paginatedData.forEach(sample => {
      const elements = sample.selectedElements || [];
      const row = document.createElement('tr');
      row.innerHTML =
        '<td><strong style="color:var(--clr-primary);font-size:0.82rem;">' + escHtml(sample.sampleId || sample.id) + '</strong></td>' +
        '<td class="muted">' + escHtml(sample.submissionId || '—') + '</td>' +
        '<td>' + escHtml(sample.sampleName || sample.customer_name || '—') + '</td>' +
        '<td class="muted">' + escHtml(sample.sampleType || '—') + '</td>' +
        '<td style="font-size:0.78rem;">' + (elements.length > 0 ? escHtml(elements.map(normalizeElementSymbol).join(', ')) : '—') + '</td>' +
        '<td>' + statusBadge(sample.status || 'received') + '</td>' +
        '<td class="muted">' + formatDateTime(sample.created_at) + '</td>';
      displayTableBody.appendChild(row);
    });
  }

  document.getElementById('pageIndicator').textContent = 'Page ' + currentPage + ' of ' + totalPages;
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
    container.innerHTML = '<div class="card card-sm" style="text-align:center;color:var(--txt-muted);padding:var(--sp-8);">No samples found matching "' + escHtml(q) + '"</div>';
    return;
  }

  container.innerHTML = matches.slice(0, 10).map(s => {
    const lab = getLab(s.lab_id);
    const test = getTest(s.test_id);
    const report = getReportForSample(s.id);
    const elements = s.selectedElements || [];
    return '<div class="card card-sm card-elevated" style="margin-bottom:var(--sp-3);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-3);">' +
        '<div>' +
          '<div style="font-size:0.95rem;font-weight:700;color:var(--clr-primary)">' + escHtml(s.sampleId || s.id) + '</div>' +
          '<div style="font-size:0.72rem;color:var(--txt-secondary)">Submission: ' + escHtml(s.submissionId || '—') + ' · ' + formatDateTime(s.created_at) + '</div>' +
        '</div>' +
        statusBadge(s.status === 'Registered' ? 'received' : s.status) +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3);">' +
        '<div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">' + escHtml(s.sampleType || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">CNIC</span><span class="detail-value">' + escHtml(s.cnic || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Lab</span><span class="detail-value">' + escHtml(lab?.lab_name || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Test</span><span class="detail-value">' + escHtml(s.test_name || '—') + '</span></div>' +
        '<div class="detail-row" style="grid-column:1/-1;"><span class="detail-label">Elements (' + elements.length + ')</span><span class="detail-value">' + (elements.length > 0 ? escHtml(elements.map(normalizeElementSymbol).join(', ')) : '—') + '</span></div>' +
      '</div>' +
      (report ? '<div style="margin-top:var(--sp-3);padding:var(--sp-2) var(--sp-3);background:rgba(16,185,129,0.1);border-radius:var(--r-md);font-size:0.8rem;color:#059669;">📄 Report: ' + escHtml(report.report_number) + '</div>' : '') +
    '</div>';
  }).join('');
}

// ── SIDE PANEL: Open Submission Details (read-only) ──────────
function openRecSubmissionPanel(submissionId) {
  const samples = DB.samples.filter(s => s.submissionId === submissionId);
  if (!samples.length) {
    showToast('Submission not found.', 'error');
    return;
  }

  const sortedSamples = [...samples].sort((a, b) => {
    const aSeq = (a.sampleId || '').split('-').pop() || '';
    const bSeq = (b.sampleId || '').split('-').pop() || '';
    return aSeq.localeCompare(bSeq, undefined, { numeric: true });
  });

  const lab = getLab(samples[0].lab_id);
  const firstSample = sortedSamples[0];
  const test = firstSample ? getTest(firstSample.test_id) : null;

  const sampleCount = samples.length;
  const firstSampleId = sortedSamples.length > 0 ? (sortedSamples[0].sampleId || '') : '';
  const lastSampleId  = sortedSamples.length > 0 ? (sortedSamples[sortedSamples.length - 1].sampleId || '') : '';

  let sampleRange = '—';
  if (sampleCount === 1) {
    sampleRange = firstSampleId;
  } else if (firstSampleId && lastSampleId) {
    const firstParts = firstSampleId.split('-');
    const lastParts  = lastSampleId.split('-');
    const prefix = firstParts.slice(0, -1).join('-');
    const firstSeq = firstParts[firstParts.length - 1];
    const lastSeq  = lastParts[lastParts.length - 1];
    if (firstSeq && lastSeq && firstSeq !== lastSeq) {
      sampleRange = prefix + '-' + firstSeq + ' to ' + lastSeq;
    } else {
      sampleRange = firstSampleId;
    }
  }

  // Count by status
  const statusCounts = {};
  sortedSamples.forEach(s => {
    statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
  });
  const statusSummaryStr = Object.entries(statusCounts)
    .map(([st, cnt]) => st.replace('_', ' ') + ': ' + cnt)
    .join(' · ');

  const statuses = sortedSamples.map(s => s.status);
  const statusOrder = ['completed', 'in_progress', 'assigned', 'received'];
  let statusSummary = 'received';
  for (const st of statusOrder) {
    if (statuses.includes(st)) {
      statusSummary = st;
      break;
    }
  }

  const allCompleted = sortedSamples.every(s => s.status === 'completed');

  // Panel title
  document.getElementById('rec-panel-sample-number').textContent = 'Submission #' + submissionId + ' (' + sampleCount + ' samples)';

  // Build individual sample rows (read-only — no checkboxes)
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
    const sampleIdLabel = s.sampleId || s.sampleNumber || s.sampleName || '—';

    return '<div class="submission-sample-row" style="border:1px solid var(--clr-border);border-radius:var(--r-md);padding:var(--sp-3);margin-bottom:var(--sp-2);background:' + (isCompleted ? 'rgba(16,185,129,0.05)' : 'var(--clr-surface)') + ';">' +
      '<div style="display:flex;align-items:flex-start;gap:var(--sp-3);">' +
        '<div style="flex:1;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--sp-1);">' +
            '<div>' +
              '<span style="font-weight:600;font-family:monospace;font-size:0.85rem;color:' + (isCompleted ? 'var(--clr-success)' : 'var(--clr-primary)') + ';">' + escHtml(sampleIdLabel) + '</span>' +
              '<span style="margin-left:var(--sp-2);font-size:0.72rem;color:var(--txt-muted);">' + escHtml(s.sampleType || '—') + '</span>' +
            '</div>' +
            (isCompleted ? '<span style="font-size:0.72rem;color:var(--clr-success);font-weight:600;">✓ Complete</span>' : statusBadge(s.status)) +
          '</div>' +
          '<div style="font-size:0.75rem;color:var(--txt-secondary);">' +
            '<span><strong>Elements (' + elements.length + '):</strong> ' + escHtml(elementLabels) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  document.getElementById('rec-panel-body').innerHTML =
    '<div style="margin-bottom:var(--sp-5);">' +
      '<div style="display:flex;align-items:center;gap:var(--sp-3);margin-bottom:var(--sp-4);flex-wrap:wrap;">' +
        statusBadge(statusSummary) +
        '<span style="font-size:0.78rem;color:var(--txt-muted);">' + statusSummaryStr + '</span>' +
        (allCompleted ? '<span style="font-size:0.72rem;background:rgba(16,185,129,0.1);color:#059669;padding:2px 10px;border-radius:12px;font-weight:600;">All Complete ✓</span>' : '') +
      '</div>' +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3);margin-bottom:var(--sp-3);padding:var(--sp-4);background:var(--clr-bg-3);border-radius:var(--r-lg);border:1px solid var(--clr-border);">' +
        '<div class="detail-row"><span class="detail-label">Submission ID</span><span class="detail-value" style="font-size:1.05rem;font-weight:700;color:var(--clr-primary);">#' + escHtml(submissionId) + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Number of Samples</span><span class="detail-value" style="font-size:1.05rem;font-weight:700;">' + sampleCount + '</span></div>' +
        '<div class="detail-row" style="grid-column:1/-1;"><span class="detail-label">Sample ID Range</span><span class="detail-value" style="font-family:monospace;font-size:0.9rem;font-weight:600;">' + escHtml(sampleRange) + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Client Name</span><span class="detail-value">' + escHtml(firstSample?.customer_name || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Client Contact</span><span class="detail-value">' + escHtml(firstSample?.customer_contact || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">CNIC</span><span class="detail-value">' + escHtml(firstSample?.cnic || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Sample Location</span><span class="detail-value">' + escHtml(firstSample?.sample_location || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Lab</span><span class="detail-value">' + escHtml(lab?.lab_name || '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Test</span><span class="detail-value">' + escHtml(test?.test_name || samples[0]?.test_name || '—') + (test ? ' <code style="font-size:0.75rem;color:var(--clr-accent)">' + test.test_code + '</code>' : '') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">Collected</span><span class="detail-value">' + formatDate(sortedSamples[0]?.created_at) + '</span></div>' +
        (allCompleted ? '<div class="detail-row"><span class="detail-label">Analysis Completed</span><span class="detail-value" style="font-weight:600;color:var(--clr-success);">' + formatDate(sortedSamples.map(s => s.completed_at).filter(Boolean).sort().reverse()[0]) + '</span></div>' : '') +
      '</div>' +

      '<div>' +
        '<div style="font-size:0.8rem;font-weight:600;color:var(--txt-secondary);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:var(--sp-3);">Samples in this Submission</div>' +
        '<div id="rec-submission-samples-list">' +
          sampleRows +
        '</div>' +
      '</div>' +
    '</div>';

  openPanel('rec-sample-panel-overlay');
}

// ============================================================
// LAB REPORTS — Read-only viewer for receptionist
// (View reports saved by lab engineers, print or save as PDF)
// ============================================================

// ── Render Lab Reports Table (paginated, searchable) ──────────
function renderLabReports() {
  const tbody = document.getElementById('lab-reports-tbody');
  if (!tbody) return;

  const query = (document.getElementById('reports-search')?.value || '').toLowerCase().trim();
  let reports = (DB.savedReports || []).slice();

  // Sort by updated_at descending (most recent first)
  reports.sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));

  // Filter by search query
  if (query) {
    reports = reports.filter(r =>
      (r.report_number || '').toLowerCase().includes(query) ||
      (r.customer_name || '').toLowerCase().includes(query) ||
      (r.lab_name || '').toLowerCase().includes(query) ||
      (r.test_name || '').toLowerCase().includes(query) ||
      (r.submission_id || '').toLowerCase().includes(query) ||
      (r.engineer_name || '').toLowerCase().includes(query) ||
      (r.report_type || '').toLowerCase().includes(query)
    );
  }

  if (!reports.length) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📄</div><p>No lab reports saved yet' + (query ? ' matching your search' : '') + '</p></div></td></tr>';
    const pagination = document.getElementById('reports-pagination');
    if (pagination) pagination.style.display = 'none';
    return;
  }

  const totalPages = Math.ceil(reports.length / REPORTS_PER_PAGE) || 1;
  if (reportsPage < 1) reportsPage = 1;
  if (reportsPage > totalPages) reportsPage = totalPages;

  const startIndex = (reportsPage - 1) * REPORTS_PER_PAGE;
  const endIndex = startIndex + REPORTS_PER_PAGE;
  const pageData = reports.slice(startIndex, endIndex);

  tbody.innerHTML = pageData.map(r => {
    const typeLabel = r.report_type === 'pnac' ? '🛡️ PNAC' : (r.report_type === 'qscert' ? '✅ QSCert' : escHtml(r.report_type || '—'));
    const typeBadge = '<span style="font-size:0.72rem;font-weight:600;padding:2px 8px;border-radius:10px;background:' +
      (r.report_type === 'pnac' ? 'rgba(99,102,241,0.1);color:#4f46e5' :
       r.report_type === 'qscert' ? 'rgba(16,185,129,0.1);color:#059669' :
       'rgba(148,163,184,0.1);color:#64748b') +
      ';">' + typeLabel + '</span>';

    return '<tr class="clickable" onclick="openRecReportViewer(\'' + escHtml(r.submission_id) + '\',\'' + escHtml(r.report_type) + '\')">' +
      '<td><strong style="color:var(--clr-primary);font-size:0.82rem;font-family:monospace;">' + escHtml(r.report_number || '—') + '</strong></td>' +
      '<td>' + typeBadge + '</td>' +
      '<td>' + escHtml(r.customer_name || '—') + '</td>' +
      '<td class="muted">' + escHtml(r.lab_name || '—') + '</td>' +
      '<td class="muted">' + escHtml(r.test_name || '—') + '</td>' +
      '<td style="text-align:center;font-weight:600;">' + (r.sample_count || 0) + '</td>' +
      '<td class="muted" style="font-size:0.75rem;">' + escHtml(r.report_issue_date || '—') + '</td>' +
      '<td class="muted" style="font-size:0.75rem;">' + escHtml(r.engineer_name || '—') + '</td>' +
    '</tr>';
  }).join('');

  // Update pagination controls
  const pagination = document.getElementById('reports-pagination');
  const prevBtn = document.getElementById('reportsPrevBtn');
  const nextBtn = document.getElementById('reportsNextBtn');
  const pageIndicator = document.getElementById('reportsPageIndicator');

  if (totalPages <= 1) {
    pagination.style.display = 'none';
  } else {
    pagination.style.display = '';
    prevBtn.disabled = reportsPage <= 1;
    nextBtn.disabled = reportsPage >= totalPages;
    if (pageIndicator) pageIndicator.textContent = 'Page ' + reportsPage + ' of ' + totalPages;
  }
}

// ── Open Read-only Report Viewer ──────────────────────────────
function openRecReportViewer(fullSubmissionId, reportType) {
  const saved = getSavedReport(fullSubmissionId, reportType);
  if (!saved) {
    showToast('Report not found.', 'error');
    return;
  }

  // Store active report info for printing
  activeRecReport = {
    fullSubmissionId: fullSubmissionId,
    reportType: reportType,
    reportNo: saved.report_number || fullSubmissionId,
  };

  const reportNo = saved.report_number || fullSubmissionId;
  const reportUnit = saved.unit || 'ppm';
  const today = saved.report_issue_date || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // Get elements and data points from saved report
  const uniqueElements = (saved.elements || []).slice().sort();
  const dataPoints = saved.data_points || [];
  const sampleIds = saved.sample_ids || [];

  // Build the report HTML (read-only version)
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

  // Left Logo
  const leftLogo = document.createElement('div');
  leftLogo.style.cssText = 'width:96px;height:96px;display:flex;align-items:center;justify-content:center;overflow:hidden;';
  const logoImg = document.createElement('img');
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

  // Right Logo
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
      '<tr><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Name & Address of Customer:</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;">' + escHtml(saved.customer_name || '—') + '</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">No. of Sample(s):</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;">' + (saved.sample_count || 0) + '</td></tr>' +
      '<tr><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Location of Sample (Given by customer)</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;">' + escHtml(saved.sample_location || 'NA') + '</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Sample receiving Date</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;">' + escHtml(saved.sample_receiving_date || '—') + '</td></tr>' +
      '<tr><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Description of Sample:</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;">' + escHtml(saved.sample_description || 'Powder') + '</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Sample analysis Date</td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;text-align:center;">' + escHtml(saved.sample_analysis_date || today) + '</td></tr>' +
      '<tr><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Method used /Specs:</td><td style="border:1px solid #000;padding:2px 4px;font-size:13.5px;text-align:center;"><input type="text" class="report-method-input" value="' + escHtml(saved.method_used || 'EPA 3052') + '" readOnly style="width:100%;border:none;outline:none;text-align:center;font-size:13.5px;font-family:Times New Roman,Times,serif;background:transparent;padding:2px 0;" /></td><td style="border:1px solid #000;padding:4px 8px;font-size:13.5px;font-weight:700;">Temperature & Humidity</td><td style="border:1px solid #000;padding:2px 4px;font-size:13.5px;text-align:center;"><input type="text" class="report-temp-input" value="' + escHtml(saved.temperature_humidity || '25.2 °C & 52 %') + '" readOnly style="width:100%;border:none;outline:none;text-align:center;font-size:13.5px;font-family:Times New Roman,Times,serif;background:transparent;padding:2px 0;" /></td></tr>' +
    '</tbody>';
  pageDiv.appendChild(metaTable);

  // Test Report Heading
  const testReportHeading = document.createElement('div');
  testReportHeading.style.cssText = 'font-weight:700;font-size:15px;margin-bottom:8px;padding-left:16px;';
  testReportHeading.textContent = 'Test Report:';
  pageDiv.appendChild(testReportHeading);

  // Test Results Table (read-only — values pre-filled from saved data)
  const resultTable = document.createElement('table');
  resultTable.style.cssText = 'width:100%;border-collapse:collapse;border:1px solid #000;margin-bottom:32px;';

  const elemColWidth = uniqueElements.length > 0 ? Math.floor(92 / uniqueElements.length) + '%' : '50%';

  // Build header row
  let resultHeaderHtml =
    '<thead><tr style="background:#f9fafb;">' +
    '<th style="border:1px solid #000;padding:4px 8px;text-align:center;font-weight:700;font-size:13.5px;width:6%;">S. No.</th>' +
    '<th style="border:1px solid #000;padding:4px 8px;text-align:center;font-weight:700;font-size:13.5px;white-space:nowrap;min-width:160px;">Sample ID</th>';

  if (uniqueElements.length > 0) {
    uniqueElements.forEach(el => {
      const displayEl = el.charAt(0).toUpperCase() + el.slice(1).toLowerCase();
      resultHeaderHtml += '<th data-element="' + escHtml(el) + '" style="border:1px solid #000;padding:4px 8px;text-align:center;font-weight:700;font-size:13.5px;width:' + elemColWidth + ';">' + escHtml(displayEl) + ' (' + escHtml(reportUnit) + ')</th>';
    });
  } else {
    resultHeaderHtml += '<th data-element="result" style="border:1px solid #000;padding:4px 8px;text-align:center;font-weight:700;font-size:13.5px;width:50%;">Result (' + escHtml(reportUnit) + ')</th>';
  }

  resultHeaderHtml += '</tr></thead>';
  resultTable.innerHTML = resultHeaderHtml;

  // Build body rows with pre-filled read-only values
  const tbody = document.createElement('tbody');
  sampleIds.forEach((sampleLabel, idx) => {
    const tr = document.createElement('tr');

    // S.No
    const tdNo = document.createElement('td');
    tdNo.style.cssText = 'border:1px solid #000;padding:4px 8px;text-align:center;font-size:13.5px;';
    tdNo.textContent = (idx + 1) + '.';
    tr.appendChild(tdNo);

    // Sample ID
    const tdId = document.createElement('td');
    tdId.style.cssText = 'border:1px solid #000;padding:4px 8px;text-align:center;font-size:13.5px;white-space:nowrap;';
    tdId.textContent = sampleLabel;
    tr.appendChild(tdId);

    // Element result values (read-only)
    if (uniqueElements.length > 0) {
      uniqueElements.forEach(el => {
        const td = document.createElement('td');
        td.style.cssText = 'border:1px solid #000;padding:2px 4px;text-align:center;';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'report-result-input';
        input.setAttribute('data-sample-label', sampleLabel);
        input.setAttribute('data-element', el);
        input.style.cssText = 'width:100%;border:none;outline:none;text-align:center;font-size:13.5px;font-family:Times New Roman,Times,serif;background:transparent;padding:2px 0;';
        input.readOnly = true;

        // Find the saved value for this sample+element
        const dp = dataPoints.find(d => d.sample_label === sampleLabel && d.element === el);
        input.value = dp ? (dp.value || '') : '';

        tr.appendChild(td);
        td.appendChild(input);
      });
    } else {
      const td = document.createElement('td');
      td.style.cssText = 'border:1px solid #000;padding:2px 4px;text-align:center;';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'report-result-input';
      input.setAttribute('data-sample-label', sampleLabel);
      input.style.cssText = 'width:100%;border:none;outline:none;text-align:center;font-size:13.5px;font-family:Times New Roman,Times,serif;background:transparent;padding:2px 0;';
      input.readOnly = true;

      const dp = dataPoints.find(d => d.sample_label === sampleLabel);
      input.value = dp ? (dp.value || '') : '';

      tr.appendChild(td);
      td.appendChild(input);
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
  printSourceEl.id = 'rec-report-print-source';
  printSourceEl.style.display = 'none';
  printSourceEl.appendChild(reportDiv.cloneNode(true));

  const body = document.getElementById('rec-report-body');
  body.innerHTML = '';
  body.appendChild(reportDiv);
  body.appendChild(printSourceEl);

  openPanel('rec-report-overlay');
}

// ── Print / Save as PDF (Receptionist read-only report) ───────
function printRecReport() {
  const source = document.getElementById('rec-report-print-source');
  if (!source) { showToast('No report to print. Please open a report first.', 'warning'); return; }

  const reportContainer = source.firstElementChild;
  if (!reportContainer) { showToast('No report content found.', 'warning'); return; }

  const clone = reportContainer.cloneNode(true);

  // All inputs are already read-only, but ensure values are set as attributes for serialization
  const liveInputs = document.querySelectorAll('#rec-report-body .report-result-input');
  const cloneInputs = clone.querySelectorAll('.report-result-input');
  liveInputs.forEach((liveInput, idx) => {
    if (cloneInputs[idx]) {
      cloneInputs[idx].setAttribute('value', liveInput.value);
      cloneInputs[idx].readOnly = true;
    }
  });

  // Capture method input
  const liveMethod = document.querySelector('#rec-report-body .report-method-input');
  const cloneMethod = clone.querySelector('.report-method-input');
  if (liveMethod && cloneMethod) {
    cloneMethod.setAttribute('value', liveMethod.value);
    cloneMethod.readOnly = true;
  }

  // Capture temp/humidity input
  const liveTemp = document.querySelector('#rec-report-body .report-temp-input');
  const cloneTemp = clone.querySelector('.report-temp-input');
  if (liveTemp && cloneTemp) {
    cloneTemp.setAttribute('value', liveTemp.value);
    cloneTemp.readOnly = true;
  }

  const serialized = clone.innerHTML;

  const reportNo = (activeRecReport && activeRecReport.reportNo) || 'Test Report';

  const fullHtml =
    '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>' + escHtml(reportNo) + '</title>' +
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

document.addEventListener('DOMContentLoaded', initReceptionist);