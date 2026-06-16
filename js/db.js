/* ============================================================
   db.js — Data layer (JSON → localStorage persistence)
   ============================================================ */

'use strict';

const DB = {
  users:   [],
  labs:    [],
  tests:   [],
  samples: [],
  reports: [],
  events:  [],   // sample audit trail (localStorage only)
};

// ── Embedded default data (used when fetch fails, e.g. file://) ──
const DEFAULT_DATA = {
  users: [
    { id: 'usr-001', username: 'admin', password: 'asdfQWER!1234', role: 'admin', lab_id: '', full_name: 'Dr. Admin User', created_by: 'system', active: 'true' },
    { id: 'usr-002', username: 'user1', password: 'asdfQWER!1234', role: 'receptionist', lab_id: '', full_name: 'Sarah Okonkwo', created_by: 'usr-001', active: 'true' },
    { id: 'usr-003', username: 'user2', password: 'asdfQWER!1234', role: 'lab_engineer', lab_id: 'lab-001', full_name: 'Dr. James Adebayo', created_by: 'usr-001', active: 'true' },
    { id: 'usr-004', username: 'eng_micro', password: 'asdfQWER!1234', role: 'lab_engineer', lab_id: 'lab-002', full_name: 'Dr. Amaka Eze', created_by: 'usr-001', active: 'true' },
    { id: 'usr-005', username: 'eng_path', password: 'asdfQWER!1234', role: 'lab_engineer', lab_id: 'lab-003', full_name: 'Dr. Chidi Nwosu', created_by: 'usr-001', active: 'true' }
  ],
  labs: [
    { id: 'lab-001', lab_name: 'Hematology', lab_code: 'HEMA', description: 'Blood cell analysis and related disorders', created_at: '2026-01-01T00:00:00Z', active: 'true' },
    { id: 'lab-002', lab_name: 'Microbiology', lab_code: 'MICRO', description: 'Bacterial and fungal culture and sensitivity testing', created_at: '2026-01-01T00:00:00Z', active: 'true' },
    { id: 'lab-003', lab_name: 'Pathology', lab_code: 'PATH', description: 'Histological and cytological examination of tissues', created_at: '2026-01-01T00:00:00Z', active: 'true' }
  ],
  tests: [
    { id: 'tst-001', lab_id: 'lab-001', test_name: 'Complete Blood Count', test_code: 'CBC', turnaround_days: '1', created_at: '2026-01-01T00:00:00Z', active: 'true' },
    { id: 'tst-002', lab_id: 'lab-001', test_name: 'Erythrocyte Sedimentation Rate', test_code: 'ESR', turnaround_days: '1', created_at: '2026-01-01T00:00:00Z', active: 'true' },
    { id: 'tst-003', lab_id: 'lab-001', test_name: 'Peripheral Blood Film', test_code: 'PBF', turnaround_days: '2', created_at: '2026-01-01T00:00:00Z', active: 'true' },
    { id: 'tst-004', lab_id: 'lab-001', test_name: 'Coagulation Profile', test_code: 'COAG', turnaround_days: '2', created_at: '2026-01-01T00:00:00Z', active: 'true' },
    { id: 'tst-005', lab_id: 'lab-002', test_name: 'Blood Culture & Sensitivity', test_code: 'BCS', turnaround_days: '5', created_at: '2026-01-01T00:00:00Z', active: 'true' },
    { id: 'tst-006', lab_id: 'lab-002', test_name: 'Urine Culture & Sensitivity', test_code: 'UCS', turnaround_days: '3', created_at: '2026-01-01T00:00:00Z', active: 'true' },
    { id: 'tst-007', lab_id: 'lab-002', test_name: 'Wound Swab Culture', test_code: 'WSC', turnaround_days: '3', created_at: '2026-01-01T00:00:00Z', active: 'true' },
    { id: 'tst-008', lab_id: 'lab-002', test_name: 'Stool Culture', test_code: 'STC', turnaround_days: '3', created_at: '2026-01-01T00:00:00Z', active: 'true' },
    { id: 'tst-009', lab_id: 'lab-003', test_name: 'Histology - Biopsy', test_code: 'HIST', turnaround_days: '5', created_at: '2026-01-01T00:00:00Z', active: 'true' },
    { id: 'tst-010', lab_id: 'lab-003', test_name: 'Fine Needle Aspiration Cytology', test_code: 'FNAC', turnaround_days: '3', created_at: '2026-01-01T00:00:00Z', active: 'true' },
    { id: 'tst-011', lab_id: 'lab-003', test_name: 'Pap Smear', test_code: 'PAP', turnaround_days: '2', created_at: '2026-01-01T00:00:00Z', active: 'true' }
  ],
  samples: [],
  reports: []
};

// ── JSON loader ─────────────────────────────────────────────
async function loadJSON(filename) {
  const prefix = window.location.pathname.includes('/pages/') ? '../' : '';
  const res = await fetch(`${prefix}json/${filename}`);
  if (!res.ok) throw new Error(`Failed to load ${filename}: ${res.status}`);
  return await res.json();
}

// ── DB initialisation ─────────────────────────────────────────
function mergeData(key, jsonData, idField = 'id') {
  const stored = loadFromStorage(key);
  if (!Array.isArray(stored)) return jsonData;

  const merged = [...stored];
  for (const item of jsonData) {
    const idx = merged.findIndex(m => m[idField] === item[idField]);
    if (idx === -1) {
      merged.push(item);
    } else {
      // For user credentials/critical fields, ensure JSON updates override localStorage
      if (key === 'users') {
        if (item.password) merged[idx].password = item.password;
        if (item.role !== merged[idx].role) merged[idx].role = item.role;
        if (item.username !== merged[idx].username) merged[idx].username = item.username;
        if (item.full_name !== merged[idx].full_name) merged[idx].full_name = item.full_name;
        if (item.lab_id !== merged[idx].lab_id) merged[idx].lab_id = item.lab_id;
        // Sync active field so JSON data always overrides stale localStorage
        merged[idx].active = item.active;
      } else if (key === 'labs') {
        if (item.lab_name !== merged[idx].lab_name) merged[idx].lab_name = item.lab_name;
        if (item.lab_code !== merged[idx].lab_code) merged[idx].lab_code = item.lab_code;
        merged[idx].active = item.active;
      } else if (key === 'tests') {
        if (item.test_name !== merged[idx].test_name) merged[idx].test_name = item.test_name;
        if (item.test_code !== merged[idx].test_code) merged[idx].test_code = item.test_code;
        if (item.turnaround_days !== merged[idx].turnaround_days) merged[idx].turnaround_days = item.turnaround_days;
        merged[idx].active = item.active;
      }
    }
  }
  return merged;
}

async function initDB() {
  // When opened via file:// protocol, fetch() is blocked by CORS.
  // Use embedded default data directly and merge with any existing localStorage data.
  const isFileProtocol = window.location.protocol === 'file:';

  if (isFileProtocol) {
    // Merge stored data with defaults, so user-created data persists across page loads
    DB.users   = mergeData('users', DEFAULT_DATA.users, 'id');
    DB.labs    = mergeData('labs', DEFAULT_DATA.labs, 'id');
    DB.tests   = mergeData('tests', DEFAULT_DATA.tests, 'id');
    DB.samples = loadFromStorage('samples') || [];
    DB.reports = loadFromStorage('reports') || [];
    DB.events  = loadFromStorage('events') || [];
  } else {
    let jsonUsers = [], jsonLabs = [], jsonTests = [], jsonSamples = [], jsonReports = [];
    try { jsonUsers  = await loadJSON('users.json'); }      catch (e) { jsonUsers  = DEFAULT_DATA.users; }
    try { jsonLabs   = await loadJSON('labs.json'); }       catch (e) { jsonLabs   = DEFAULT_DATA.labs; }
    try { jsonTests  = await loadJSON('lab_tests.json'); }  catch (e) { jsonTests  = DEFAULT_DATA.tests; }
    try { jsonSamples = await loadJSON('samples.json'); }   catch (e) { jsonSamples = DEFAULT_DATA.samples; }
    try { jsonReports = await loadJSON('reports.json'); }   catch (e) { jsonReports = DEFAULT_DATA.reports; }

    DB.users   = mergeData('users', jsonUsers, 'id');
    DB.labs    = mergeData('labs', jsonLabs, 'id');
    DB.tests   = mergeData('tests', jsonTests, 'id');
    DB.samples = mergeData('samples', jsonSamples, 'id');
    DB.reports = mergeData('reports', jsonReports, 'id');
    DB.events  = loadFromStorage('events') || [];
  }

  // Normalise boolean strings
  DB.users  = DB.users.map(u => ({ ...u, active: u.active === 'true' || u.active === true }));
  DB.labs   = DB.labs.map(l  => ({ ...l, active: l.active === 'true' || l.active === true }));
  DB.tests  = DB.tests.map(t  => ({ ...t, active: t.active === 'true' || t.active === true }));

  saveAll();
}

// ── localStorage helpers ──────────────────────────────────────
function loadFromStorage(key) {
  try {
    const raw = localStorage.getItem(`garl_${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function saveDB(key) {
  try {
    localStorage.setItem(`garl_${key}`, JSON.stringify(DB[key]));
  } catch (e) {
    console.error('Storage quota exceeded for key:', key, e);
  }
}

function saveAll() {
  ['users','labs','tests','samples','reports','events'].forEach(saveDB);
}

// ── CRUD helpers ──────────────────────────────────────────────

/* Users */
function createUser(data) {
  const user = { id: generateId('usr'), created_by: currentUser()?.id || 'system', active: true, ...data };
  DB.users.push(user);
  saveDB('users');
  return user;
}

function updateUser(id, patch) {
  const idx = DB.users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  DB.users[idx] = { ...DB.users[idx], ...patch };
  saveDB('users');
  return DB.users[idx];
}

function toggleUserActive(id) {
  const user = DB.users.find(u => u.id === id);
  if (!user) return;
  return updateUser(id, { active: !user.active });
}

/* Labs */
function createLab(data) {
  const lab = { id: generateId('lab'), created_at: new Date().toISOString(), active: true, ...data };
  DB.labs.push(lab);
  saveDB('labs');
  return lab;
}

function updateLab(id, patch) {
  const idx = DB.labs.findIndex(l => l.id === id);
  if (idx === -1) return null;
  DB.labs[idx] = { ...DB.labs[idx], ...patch };
  saveDB('labs');
  return DB.labs[idx];
}

/* Tests */
function createTest(data) {
  const test = { id: generateId('tst'), created_at: new Date().toISOString(), active: true, ...data };
  DB.tests.push(test);
  saveDB('tests');
  return test;
}

function updateTest(id, patch) {
  const idx = DB.tests.findIndex(t => t.id === id);
  if (idx === -1) return null;
  DB.tests[idx] = { ...DB.tests[idx], ...patch };
  saveDB('tests');
  return DB.tests[idx];
}

/* Samples */
function createSample(data) {
  const sample = {
    id: generateId('smp'),
    sample_number: generateSampleNumber(),
    status: 'assigned',
    created_at: new Date().toISOString(),
    ...data,
  };
  DB.samples.push(sample);
  saveDB('samples');
  logEvent(sample.id, 'created', `Sample received and assigned to lab`);
  return sample;
}

function updateSample(id, patch) {
  const idx = DB.samples.findIndex(s => s.id === id);
  if (idx === -1) return null;
  DB.samples[idx] = { ...DB.samples[idx], ...patch };
  saveDB('samples');
  return DB.samples[idx];
}

function setSampleStatus(id, status, note = '') {
  const sample = updateSample(id, { status, [`${status}_at`]: new Date().toISOString() });
  if (sample) logEvent(id, status, note);
  return sample;
}

/* Reports */
function createReport(data) {
  const lab = DB.labs.find(l => l.id === data.lab_id);
  const labCode = lab?.lab_code || 'LAB';
  const report = {
    id: generateId('rpt'),
    uploaded_at: new Date().toISOString(),
    report_number: generateReportNumber(labCode),
    ...data,
  };
  DB.reports.push(report);
  saveDB('reports');
  setSampleStatus(data.sample_id, 'completed', `Report ${report.report_number} uploaded`);
  return report;
}

/* Events / Audit */
function logEvent(sample_id, type, note = '') {
  const evt = {
    id: generateId('evt'),
    sample_id,
    type,
    note,
    actor_id: currentUser()?.id || 'system',
    actor_name: currentUser()?.full_name || 'System',
    timestamp: new Date().toISOString(),
  };
  DB.events.push(evt);
  saveDB('events');
  return evt;
}

function getEventsForSample(sample_id) {
  return DB.events.filter(e => e.sample_id === sample_id).sort((a,b) => new Date(a.timestamp)-new Date(b.timestamp));
}

// ── Lookup helpers ────────────────────────────────────────────
function getLab(id)    { return DB.labs.find(l => l.id === id); }
function getTest(id)   { return DB.tests.find(t => t.id === id); }
function getUser(id)   { return DB.users.find(u => u.id === id); }
function getSample(id) { return DB.samples.find(s => s.id === id); }
function getReport(id) { return DB.reports.find(r => r.id === id); }

function getTestsForLab(lab_id) {
  return DB.tests.filter(t => t.lab_id === lab_id && t.active !== false);
}

function getSamplesForLab(lab_id) {
  return DB.samples.filter(s => s.lab_id === lab_id);
}

function getReportForSample(sample_id) {
  return DB.reports.find(r => r.sample_id === sample_id);
}

function getActiveLabs() {
  return DB.labs.filter(l => l.active !== false);
}

// ── Session helpers ───────────────────────────────────────────
// currentUser() is defined in auth.js

// ── Reset (for development) ───────────────────────────────────
function resetToCSV() {
  ['garl_users','garl_labs','garl_tests','garl_samples','garl_reports','garl_events'].forEach(k => localStorage.removeItem(k));
  showToast('Database reset to defaults. Reloading…', 'info');
  setTimeout(() => location.reload(), 1500);
}