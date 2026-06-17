/* ============================================================
   db.js — Data layer (Supabase + localStorage persistence)
   ============================================================ */

'use strict';

const DB = {
  users:   [],
  labs:    [],
  tests:   [],
  samples: [],
  reports: [],
  events:  [],   // sample audit trail
};

// ── Seed data for initial login (only users kept) ─────────────
const SEED_USERS = [
  { id: 'usr-001', username: 'admin', password: 'asdfQWER!1234', role: 'admin', lab_id: '', full_name: 'Dr. Admin User', created_by: 'system', active: true },
  { id: 'usr-002', username: 'user1', password: 'asdfQWER!1234', role: 'receptionist', lab_id: '', full_name: 'Sarah Okonkwo', created_by: 'usr-001', active: true },
  { id: 'usr-003', username: 'user2', password: 'asdfQWER!1234', role: 'lab_engineer', lab_id: 'lab-001', full_name: 'Dr. James Adebayo', created_by: 'usr-001', active: true },
  { id: 'usr-004', username: 'eng_micro', password: 'asdfQWER!1234', role: 'lab_engineer', lab_id: 'lab-002', full_name: 'Dr. Amaka Eze', created_by: 'usr-001', active: true },
  { id: 'usr-005', username: 'eng_path', password: 'asdfQWER!1234', role: 'lab_engineer', lab_id: 'lab-003', full_name: 'Dr. Chidi Nwosu', created_by: 'usr-001', active: true }
];

const SEED_LABS = [
  { id: 'lab-001', lab_name: 'Hematology', lab_code: 'HEMA', description: 'Blood cell analysis and related disorders', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'lab-002', lab_name: 'Microbiology', lab_code: 'MICRO', description: 'Bacterial and fungal culture and sensitivity testing', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'lab-003', lab_name: 'Pathology', lab_code: 'PATH', description: 'Histological and cytological examination of tissues', created_at: '2026-01-01T00:00:00Z', active: true }
];

const SEED_TESTS = [
  { id: 'tst-001', lab_id: 'lab-001', test_name: 'Complete Blood Count', test_code: 'CBC', turnaround_days: '1', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-002', lab_id: 'lab-001', test_name: 'Erythrocyte Sedimentation Rate', test_code: 'ESR', turnaround_days: '1', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-003', lab_id: 'lab-001', test_name: 'Peripheral Blood Film', test_code: 'PBF', turnaround_days: '2', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-004', lab_id: 'lab-001', test_name: 'Coagulation Profile', test_code: 'COAG', turnaround_days: '2', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-005', lab_id: 'lab-002', test_name: 'Blood Culture & Sensitivity', test_code: 'BCS', turnaround_days: '5', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-006', lab_id: 'lab-002', test_name: 'Urine Culture & Sensitivity', test_code: 'UCS', turnaround_days: '3', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-007', lab_id: 'lab-002', test_name: 'Wound Swab Culture', test_code: 'WSC', turnaround_days: '3', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-008', lab_id: 'lab-002', test_name: 'Stool Culture', test_code: 'STC', turnaround_days: '3', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-009', lab_id: 'lab-003', test_name: 'Histology - Biopsy', test_code: 'HIST', turnaround_days: '5', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-010', lab_id: 'lab-003', test_name: 'Fine Needle Aspiration Cytology', test_code: 'FNAC', turnaround_days: '3', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-011', lab_id: 'lab-003', test_name: 'Pap Smear', test_code: 'PAP', turnaround_days: '2', created_at: '2026-01-01T00:00:00Z', active: true }
];

// ── DB initialisation ─────────────────────────────────────────
async function initDB() {
  // Initialize Supabase if available
  initSupabase();
  const useSupabase = supabaseClient !== null;

  if (useSupabase) {
    console.log('[DB] Supabase connected. Loading data from cloud...');
    const [users, labs, tests, samples, reports, events] = await Promise.all([
      supabaseFetch('users'),
      supabaseFetch('labs'),
      supabaseFetch('tests'),
      supabaseFetch('samples'),
      supabaseFetch('reports'),
      supabaseFetch('events'),
    ]);

    // If Supabase has data, use it; otherwise seed initial data
    if (users && users.length > 0) {
      DB.users   = users;
      DB.labs    = labs   || [];
      DB.tests   = tests  || [];
      DB.samples = samples || [];
      DB.reports = reports || [];
      DB.events  = events  || [];
    } else {
      // First run — seed with initial data
      console.log('[DB] No data in Supabase. Seeding initial data...');
      DB.users   = SEED_USERS;
      DB.labs    = SEED_LABS;
      DB.tests   = SEED_TESTS;
      DB.samples = [];
      DB.reports = [];
      DB.events  = [];

      // Persist seed data to Supabase
      await Promise.all([
        supabaseUpsert('users', DB.users),
        supabaseUpsert('labs', DB.labs),
        supabaseUpsert('tests', DB.tests),
      ]);
    }
  } else {
    // Supabase not available — use localStorage + seed fallback
    console.log('[DB] Supabase not available. Using localStorage...');
    const storedUsers   = loadFromStorage('users');
    const storedLabs    = loadFromStorage('labs');
    const storedTests   = loadFromStorage('tests');
    DB.samples = loadFromStorage('samples') || [];
    DB.reports = loadFromStorage('reports') || [];
    DB.events  = loadFromStorage('events')  || [];

    // Merge stored data with seed data (seed acts as defaults)
    DB.users   = mergeSeedData(storedUsers, SEED_USERS);
    DB.labs    = mergeSeedData(storedLabs, SEED_LABS);
    DB.tests   = mergeSeedData(storedTests, SEED_TESTS);
  }

  // Normalise boolean fields
  DB.users  = DB.users.map(u => ({ ...u, active: u.active === true || u.active === 'true' }));
  DB.labs   = DB.labs.map(l  => ({ ...l, active: l.active === true || l.active === 'true' }));
  DB.tests  = DB.tests.map(t  => ({ ...t, active: t.active === true || t.active === 'true' }));

  // Save everything to localStorage as local cache
  saveAll();
}

// ── Merge helper: seed data provides defaults, stored overrides ──
function mergeSeedData(stored, seed) {
  if (!Array.isArray(stored) || stored.length === 0) return [...seed];
  const merged = [...stored];
  for (const item of seed) {
    const idx = merged.findIndex(m => m.id === item.id);
    if (idx === -1) {
      merged.push(item);
    }
    // If it exists in stored, keep the stored version (user edits)
  }
  return merged;
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

// ── Supabase sync (fire-and-forget) ───────────────────────────
function syncToSupabase(key) {
  if (!supabaseClient) return;
  supabaseUpsert(key, DB[key]).then(success => {
    if (success) console.log(`[DB] Synced ${key} to Supabase.`);
  });
}

// ── CRUD helpers ──────────────────────────────────────────────

/* Users */
function createUser(data) {
  const user = { id: generateId('usr'), created_by: currentUser()?.id || 'system', active: true, ...data };
  DB.users.push(user);
  saveDB('users');
  syncToSupabase('users');
  return user;
}

function updateUser(id, patch) {
  const idx = DB.users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  DB.users[idx] = { ...DB.users[idx], ...patch };
  saveDB('users');
  syncToSupabase('users');
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
  syncToSupabase('labs');
  return lab;
}

function updateLab(id, patch) {
  const idx = DB.labs.findIndex(l => l.id === id);
  if (idx === -1) return null;
  DB.labs[idx] = { ...DB.labs[idx], ...patch };
  saveDB('labs');
  syncToSupabase('labs');
  return DB.labs[idx];
}

/* Tests */
function createTest(data) {
  const test = { id: generateId('tst'), created_at: new Date().toISOString(), active: true, ...data };
  DB.tests.push(test);
  saveDB('tests');
  syncToSupabase('tests');
  return test;
}

function updateTest(id, patch) {
  const idx = DB.tests.findIndex(t => t.id === id);
  if (idx === -1) return null;
  DB.tests[idx] = { ...DB.tests[idx], ...patch };
  saveDB('tests');
  syncToSupabase('tests');
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
  syncToSupabase('samples');
  logEvent(sample.id, 'created', `Sample received and assigned to lab`);
  return sample;
}

function updateSample(id, patch) {
  const idx = DB.samples.findIndex(s => s.id === id);
  if (idx === -1) return null;
  DB.samples[idx] = { ...DB.samples[idx], ...patch };
  saveDB('samples');
  syncToSupabase('samples');
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
  syncToSupabase('reports');
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
  syncToSupabase('events');
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

// ── Reset (for development) ───────────────────────────────────
function resetToCSV() {
  ['garl_users','garl_labs','garl_tests','garl_samples','garl_reports','garl_events'].forEach(k => localStorage.removeItem(k));
  showToast('Local cache cleared. Reloading...', 'info');
  setTimeout(() => location.reload(), 1500);
}