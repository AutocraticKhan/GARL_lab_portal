/* ============================================================
   admin.js — Admin dashboard logic
   ============================================================ */
'use strict';

let adminSession = null;

// ── Init ──────────────────────────────────────────────────────
async function initAdmin() {
  adminSession = requireAuth('admin');
  if (!adminSession) return;
  await initDB();
  renderSidebarUser();
  wireLogout();
  switchTab('tab-users');
  wireAdminEvents();
}

// ── Tab switching ─────────────────────────────────────────────
function switchTab(tabId) {
  // Update active state of top tab buttons
  document.querySelectorAll('.tab-btn').forEach(b => {
    if (b.dataset.tab === tabId) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  // Update active state of sidebar navigation items
  const isDashboardTab = ['tab-users', 'tab-labs', 'tab-tests', 'tab-samples'].includes(tabId);
  const dashboardBtn = document.getElementById('nav-admin-dashboard');
  if (dashboardBtn) {
    if (isDashboardTab) {
      dashboardBtn.classList.add('active');
    } else {
      dashboardBtn.classList.remove('active');
    }
  }

  // Update active state of tab panels
  document.querySelectorAll('.tab-panel').forEach(p => {
    if (p.id === tabId) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });

  // Update topbar title to match selected tab
  const titles = { 
    'tab-users': 'User Management', 
    'tab-labs': 'Lab Management', 
    'tab-tests': 'Test Management', 
    'tab-samples': 'All Samples' 
  };
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) {
    titleEl.textContent = titles[tabId] || 'Admin';
  }

  // Render the active tab's data
  if (tabId === 'tab-users')   renderUsers();
  if (tabId === 'tab-labs')    renderLabs();
  if (tabId === 'tab-tests')   renderTests();
  if (tabId === 'tab-samples') renderAllSamples();
}

// ── Wire events ───────────────────────────────────────────────
function wireAdminEvents() {
  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Create User
  document.getElementById('btn-create-user').addEventListener('click', () => {
    document.getElementById('create-user-form').reset();
    document.getElementById('user-modal-title').textContent = 'Create User';
    document.getElementById('create-user-id').value = '';
    toggleLabField();
    openModal('modal-user');
  });
  document.getElementById('user-role-select').addEventListener('change', toggleLabField);
  document.getElementById('create-user-form').addEventListener('submit', handleCreateUser);
  document.getElementById('close-user-modal').addEventListener('click', () => closeModal('modal-user'));
  document.getElementById('cancel-user-modal').addEventListener('click', () => closeModal('modal-user'));

  // Create Lab
  document.getElementById('btn-create-lab').addEventListener('click', () => {
    document.getElementById('create-lab-form').reset();
    document.getElementById('lab-modal-title').textContent = 'Create Lab';
    document.getElementById('create-lab-id').value = '';
    openModal('modal-lab');
  });
  document.getElementById('create-lab-form').addEventListener('submit', handleCreateLab);
  document.getElementById('close-lab-modal').addEventListener('click', () => closeModal('modal-lab'));
  document.getElementById('cancel-lab-modal').addEventListener('click', () => closeModal('modal-lab'));

  // Create Test
  document.getElementById('btn-create-test').addEventListener('click', () => {
    document.getElementById('create-test-form').reset();
    document.getElementById('test-modal-title').textContent = 'Add Lab Test';
    document.getElementById('create-test-id').value = '';
    document.querySelector('#create-test-form [type=submit]').textContent = 'Add Test';
    populateLabSelect('test-lab-select');
    populateTestTypeSelect();
    openModal('modal-test');
  });
  document.getElementById('create-test-form').addEventListener('submit', handleCreateTest);
  document.getElementById('close-test-modal').addEventListener('click', () => closeModal('modal-test'));
  document.getElementById('cancel-test-modal').addEventListener('click', () => closeModal('modal-test'));

  // Search/filter
  document.getElementById('user-search').addEventListener('input', debounce(renderUsers, 250));
  document.getElementById('sample-search').addEventListener('input', debounce(renderAllSamples, 250));
  document.getElementById('sample-status-filter').addEventListener('change', renderAllSamples);
  document.getElementById('sample-lab-filter').addEventListener('change', renderAllSamples);

  // Export buttons
  document.getElementById('btn-export-users').addEventListener('click', () => downloadCSV('users.csv', DB.users));
  document.getElementById('btn-export-samples').addEventListener('click', () => downloadCSV('samples.csv', DB.samples));
}

// ── Populate test type dropdown ────────────────────────────────
function populateTestTypeSelect() {
  const sel = document.getElementById('test-type-select');
  if (!sel) return;
  const types = getTestTypes();
  sel.innerHTML = '<option value="">Select Test Type</option>' +
    types.map(t => `<option value="${t.value}">${escHtml(t.label)}</option>`).join('');
}

// ── USER MANAGEMENT ───────────────────────────────────────────
function toggleLabField() {
  const role = document.getElementById('user-role-select').value;
  const wrap = document.getElementById('lab-field-wrap');
  wrap.style.display = role === 'lab_engineer' ? 'block' : 'none';
  if (role === 'lab_engineer') populateLabSelect('user-lab-select');
}

function renderUsers() {
  const query = (document.getElementById('user-search').value || '').toLowerCase();
  const tbody = document.getElementById('users-tbody');
  let rows = DB.users;
  if (query) rows = rows.filter(u =>
    u.full_name?.toLowerCase().includes(query) ||
    u.username?.toLowerCase().includes(query) ||
    u.role?.toLowerCase().includes(query)
  );
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">👥</div><p>No users found</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(u => {
    const lab = u.lab_id ? getLab(u.lab_id) : null;
    return `<tr>
      <td><strong>${escHtml(u.full_name)}</strong></td>
      <td class="muted">${escHtml(u.username)}</td>
      <td>${roleBadge(u.role)}</td>
      <td class="muted">${lab ? escHtml(lab.lab_name) : '—'}</td>
      <td>${u.active ? '<span class="badge badge-completed">Active</span>' : '<span class="badge badge-inactive">Inactive</span>'}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-ghost btn-sm" onclick="editUser('${u.id}')">Edit</button>
          <button class="btn btn-${u.active ? 'danger' : 'success'} btn-sm" onclick="handleToggleUser('${u.id}')">
            ${u.active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function handleCreateUser(e) {
  e.preventDefault();
  const form = e.target;
  const id   = document.getElementById('create-user-id').value;

  const username  = form.username.value.trim();
  const role      = form.role.value;
  const fullName  = form.full_name.value.trim();
  const password  = form.password.value;
  const labId     = role === 'lab_engineer' ? form.lab_id.value : '';

  if (!username || !role || !fullName) { showToast('Please fill all required fields.', 'error'); return; }

  const submitBtn = form.querySelector('[type=submit]');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Saving…';

  try {
    if (id) {
      // Edit existing
      const patch = { username, role, full_name: fullName, lab_id: labId };
      if (password) patch.password = password;
      await updateUser(id, patch);
      showToast('User updated successfully.', 'success');
    } else {
      if (!password) { showToast('Password is required for new users.', 'error'); submitBtn.disabled = false; submitBtn.innerHTML = 'Save User'; return; }
      const existing = DB.users.find(u => u.username === username);
      if (existing) { showToast('Username already exists.', 'error'); submitBtn.disabled = false; submitBtn.innerHTML = 'Save User'; return; }
      await createUser({ username, password, role, full_name: fullName, lab_id: labId });
      showToast('User created successfully.', 'success');
    }
    closeModal('modal-user');
    renderUsers();
  } catch (err) {
    console.error('[ADMIN] Error saving user:', err);
    showToast('Error saving user: ' + err.message, 'error');
  }
  submitBtn.disabled = false;
  submitBtn.innerHTML = 'Save User';
}

function editUser(id) {
  const user = getUser(id);
  if (!user) return;
  const form = document.getElementById('create-user-form');
  document.getElementById('user-modal-title').textContent = 'Edit User';
  document.getElementById('create-user-id').value = id;
  form.username.value  = user.username;
  form.role.value      = user.role;
  form.full_name.value = user.full_name;
  form.password.value  = '';
  toggleLabField();
  if (user.lab_id) form.lab_id.value = user.lab_id;
  openModal('modal-user');
}

async function handleToggleUser(id) {
  await toggleUserActive(id);
  renderUsers();
  showToast('User status updated.', 'info');
}

// ── LAB MANAGEMENT ───────────────────────────────────────────
function renderLabs() {
  const tbody = document.getElementById('labs-tbody');
  const labs  = DB.labs;
  if (!labs.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">🏥</div><p>No labs found</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = labs.map(lab => {
    const engineers = DB.users.filter(u => u.lab_id === lab.id && u.active).length;
    const pending   = DB.samples.filter(s => s.lab_id === lab.id && s.status !== 'completed').length;
    return `<tr>
      <td><strong>${escHtml(lab.lab_name)}</strong></td>
      <td class="muted">${escHtml(lab.lab_code)}</td>
      <td class="muted">${escHtml(lab.description || '—')}</td>
      <td class="muted">${engineers} engineers · ${pending} pending</td>
      <td>${lab.active ? '<span class="badge badge-completed">Active</span>' : '<span class="badge badge-inactive">Inactive</span>'}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-ghost btn-sm" onclick="editLab('${lab.id}')">Edit</button>
          <button class="btn btn-${lab.active ? 'danger' : 'success'} btn-sm" onclick="handleToggleLab('${lab.id}')">
            ${lab.active ? 'Deactivate' : 'Activate'}
          </button>
          <button class="btn btn-delete btn-sm" onclick="handleDeleteLab('${lab.id}')">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function handleCreateLab(e) {
  e.preventDefault();
  const form = e.target;
  const id   = document.getElementById('create-lab-id').value;
  const data = {
    lab_name:    form.lab_name.value.trim(),
    lab_code:    form.lab_code.value.trim().toUpperCase(),
    description: form.description.value.trim(),
  };
  if (!data.lab_name || !data.lab_code) { showToast('Lab name and code are required.', 'error'); return; }
  try {
    if (id) {
      await updateLab(id, data);
      showToast('Lab updated.', 'success');
    } else {
      await createLab(data);
      showToast('Lab created.', 'success');
    }
    closeModal('modal-lab');
    renderLabs();
  } catch (err) {
    console.error('[ADMIN] Error saving lab:', err);
    showToast('Error saving lab: ' + err.message, 'error');
  }
}

function editLab(id) {
  const lab = getLab(id);
  if (!lab) return;
  const form = document.getElementById('create-lab-form');
  document.getElementById('lab-modal-title').textContent = 'Edit Lab';
  document.getElementById('create-lab-id').value = id;
  form.lab_name.value    = lab.lab_name;
  form.lab_code.value    = lab.lab_code;
  form.description.value = lab.description || '';
  openModal('modal-lab');
}

async function handleToggleLab(id) {
  const lab = getLab(id);
  if (!lab) return;
  try {
    await updateLab(id, { active: !lab.active });
    renderLabs();
    showToast('Lab status updated.', 'info');
  } catch (err) {
    showToast('Error updating lab: ' + err.message, 'error');
  }
}

async function handleDeleteLab(id) {
  const lab = getLab(id);
  if (!lab) return;
  const labTests = DB.tests.filter(t => t.lab_id === id);
  let warningMessage = `Are you sure you want to delete lab "${lab.lab_name}"? This action cannot be undone.`;
  if (labTests.length > 0) {
    warningMessage += `\n\nWARNING: This lab has ${labTests.length} associated test(s). Deleting this lab will CASCADE and delete all of these tests too!`;
  }
  if (!confirm(warningMessage)) return;
  try {
    await deleteLab(id);
    renderLabs();
    showToast('Lab deleted successfully.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── TEST MANAGEMENT ───────────────────────────────────────────
function renderTests() {
  const tbody = document.getElementById('tests-tbody');
  if (!DB.tests.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🔬</div><p>No tests defined</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = DB.tests.map(t => {
    const lab = getLab(t.lab_id);
    const typeLabel = t.test_type ? getTestTypeLabel(t.test_type) : '—';
    return `<tr>
      <td><strong>${escHtml(t.test_name)}</strong></td>
      <td class="muted"><code>${escHtml(t.test_code)}</code></td>
      <td class="muted">${lab ? escHtml(lab.lab_name) : '—'}</td>
      <td><span class="badge badge-info" style="font-size:0.7rem;">${escHtml(typeLabel)}</span></td>
      <td class="muted">${t.turnaround_days} day${t.turnaround_days == 1 ? '' : 's'}</td>
      <td>${t.active !== false ? '<span class="badge badge-completed">Active</span>' : '<span class="badge badge-inactive">Inactive</span>'}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-ghost btn-sm" onclick="editTest('${t.id}')">Edit</button>
          <button class="btn btn-${t.active !== false ? 'danger' : 'success'} btn-sm" onclick="handleToggleTest('${t.id}')">
            ${t.active !== false ? 'Deactivate' : 'Activate'}
          </button>
          <button class="btn btn-delete btn-sm" onclick="handleDeleteTest('${t.id}')">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function handleCreateTest(e) {
  e.preventDefault();
  const form = e.target;
  const id   = document.getElementById('create-test-id').value;
  const data = {
    lab_id:          form.lab_id.value,
    test_type:       form.test_type.value,
    test_name:       form.test_name.value.trim(),
    test_code:       form.test_code.value.trim().toUpperCase(),
    turnaround_days: form.turnaround_days.value,
  };
  if (!data.lab_id || !data.test_type || !data.test_name || !data.test_code) { showToast('All fields are required.', 'error'); return; }
  try {
    if (id) {
      await updateTest(id, data);
      showToast('Test updated.', 'success');
    } else {
      await createTest(data);
      showToast('Test created.', 'success');
    }
    closeModal('modal-test');
    renderTests();
  } catch (err) {
    showToast('Error saving test: ' + err.message, 'error');
  }
}

function editTest(id) {
  const test = getTest(id);
  if (!test) return;
  const form = document.getElementById('create-test-form');
  document.getElementById('test-modal-title').textContent = 'Edit Test';
  document.getElementById('create-test-id').value = id;
  populateLabSelect('test-lab-select');
  populateTestTypeSelect();
  form.lab_id.value          = test.lab_id;
  form.test_type.value       = test.test_type;
  form.test_name.value       = test.test_name;
  form.test_code.value       = test.test_code;
  form.turnaround_days.value = test.turnaround_days;
  form.querySelector('[type=submit]').textContent = 'Save Test';
  openModal('modal-test');
}

async function handleDeleteTest(id) {
  const test = getTest(id);
  if (!test) return;
  if (!confirm(`Delete test "${test.test_name}"? This action cannot be undone.`)) return;
  try {
    await deleteTest(id);
    renderTests();
    showToast('Test deleted successfully.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleToggleTest(id) {
  const t = getTest(id);
  if (!t) return;
  try {
    await updateTest(id, { active: !(t.active !== false) });
    renderTests();
    showToast('Test status updated.', 'info');
  } catch (err) {
    showToast('Error updating test: ' + err.message, 'error');
  }
}

// ── ALL SAMPLES ───────────────────────────────────────────────
function renderAllSamples() {
  populateSampleFilters();
  const query  = (document.getElementById('sample-search').value || '').toLowerCase();
  const status = document.getElementById('sample-status-filter').value;
  const labId  = document.getElementById('sample-lab-filter').value;
  const tbody  = document.getElementById('samples-tbody');

  let rows = [...DB.samples].sort((a,b) => new Date(b.created_at)-new Date(a.created_at));
  if (query)  rows = rows.filter(s => s.sample_number?.toLowerCase().includes(query) || s.customer_name?.toLowerCase().includes(query) || s.cnic?.toLowerCase().includes(query));
  if (status) rows = rows.filter(s => s.status === status);
  if (labId)  rows = rows.filter(s => s.lab_id === labId);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🧫</div><p>No samples found</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(s => {
    const lab  = getLab(s.lab_id);
    const test = getTest(s.test_id);
    return `<tr>
      <td><strong>${escHtml(s.sample_number)}</strong></td>
      <td>${escHtml(s.customer_name)}</td>
      <td class="muted">${escHtml(s.cnic || '—')}</td>
      <td class="muted">${lab ? escHtml(lab.lab_name) : '—'}</td>
      <td class="muted">${test ? escHtml(test.test_name) : '—'}</td>
      <td>${statusBadge(s.status)}</td>
      <td class="muted">${formatDate(s.created_at)}</td>
      <td>
        <select class="filter-control" style="font-size:0.75rem;" onchange="adminOverrideStatus('${s.id}', this.value)">
          ${['received','assigned','in_progress','completed'].map(st =>
            `<option value="${st}" ${s.status === st ? 'selected' : ''}>${st.replace('_',' ')}</option>`
          ).join('')}
        </select>
      </td>
    </tr>`;
  }).join('');
}

function populateSampleFilters() {
  const sel = document.getElementById('sample-lab-filter');
  const current = sel.value;
  sel.innerHTML = '<option value="">All Labs</option>' +
    DB.labs.map(l => `<option value="${l.id}" ${current===l.id?'selected':''}>${escHtml(l.lab_name)}</option>`).join('');
}

async function adminOverrideStatus(sampleId, newStatus) {
  try {
    await setSampleStatus(sampleId, newStatus, `Status overridden by admin (${adminSession.full_name})`);
    showToast(`Sample status updated to "${newStatus.replace('_',' ')}".`, 'success');
    renderAllSamples();
  } catch (err) {
    showToast('Error updating status: ' + err.message, 'error');
  }
}

// ── Shared: populate lab select dropdowns ─────────────────────
function populateLabSelect(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">Select Lab</option>' +
    DB.labs.filter(l => l.active !== false).map(l =>
      `<option value="${l.id}">${escHtml(l.lab_name)}</option>`
    ).join('');
}

// ── Bootstrap ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initAdmin);