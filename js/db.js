/* ============================================================
   db.js — Data layer (Supabase only — no localStorage, no seeds)
   ============================================================ */

'use strict';

const DB = {
  users:   [],
  labs:    [],
  tests:   [],
  samples: [],
  reports: [],
  events:  [],
  submissions: [],
  savedReports: [],
  systemState: { nextSubmissionId: 1001, submissionYear: null },
  elements: [],
};

// ── Test Types (analytical categories) ──────────────────────────
const TEST_TYPES = [
  { value: 'precious_metals', label: 'Precious Metals (Au, Ag, Pt, Pd)' },
  { value: 'base_metals',     label: 'Base Metals (Cu, Pb, Zn, Ni, Co)' },
  { value: 'major_oxides',    label: 'Major Oxides (Si, Al, Fe, Ca, Mg, etc.)' },
  { value: 'trace_elements',  label: 'Trace Elements (As, Ba, Cr, V, Zr, etc.)' },
  { value: 'ree',             label: 'REE / Rare Earth Elements' },
  { value: 'light_elements',  label: 'Light Elements (Li, Be, B)' },
  { value: 'mineralogy',      label: 'Mineralogy / XRD Phase Analysis' },
  { value: 'petrology',       label: 'Petrology & Thin Section' },
  { value: 'imaging',         label: 'SEM Imaging & Elemental Mapping' },
  { value: 'thermal',         label: 'Thermal Analysis (TGA, DSC, DTA)' },
  { value: 'sample_prep',     label: 'Sample Preparation (Crushing, Sieving)' },
  { value: 'environmental',   label: 'Environmental / Water Testing' },
];

function getTestTypeLabel(value) {
  const tt = TEST_TYPES.find(t => t.value === value);
  return tt ? tt.label : value;
}

function getTestTypes() {
  return TEST_TYPES;
}

// ── Elements (geochemical element library) ──────────────────────
const ELEMENTS_DATA = [
  { symbol: "Au", name: "Gold", category: "precious_metals" },
  { symbol: "Ag", name: "Silver", category: "precious_metals" },
  { symbol: "Pt", name: "Platinum", category: "precious_metals" },
  { symbol: "Pd", name: "Palladium", category: "precious_metals" },
  { symbol: "Cu", name: "Copper", category: "base_metals" },
  { symbol: "Pb", name: "Lead", category: "base_metals" },
  { symbol: "Zn", name: "Zinc", category: "base_metals" },
  { symbol: "Ni", name: "Nickel", category: "base_metals" },
  { symbol: "Co", name: "Cobalt", category: "base_metals" },
  { symbol: "Mo", name: "Molybdenum", category: "trace_elements" },
  { symbol: "Cd", name: "Cadmium", category: "trace_elements" },
  { symbol: "Cr", name: "Chromium", category: "trace_elements" },
  { symbol: "As", name: "Arsenic", category: "trace_elements" },
  { symbol: "Sb", name: "Antimony", category: "trace_elements" },
  { symbol: "Bi", name: "Bismuth", category: "trace_elements" },
  { symbol: "Hg", name: "Mercury", category: "trace_elements" },
  { symbol: "Sn", name: "Tin", category: "trace_elements" },
  { symbol: "W", name: "Tungsten", category: "trace_elements" },
  { symbol: "Se", name: "Selenium", category: "trace_elements" },
  { symbol: "Te", name: "Tellurium", category: "trace_elements" },
  { symbol: "Ba", name: "Barium", category: "trace_elements" },
  { symbol: "Sr", name: "Strontium", category: "trace_elements" },
  { symbol: "V", name: "Vanadium", category: "trace_elements" },
  { symbol: "Zr", name: "Zirconium", category: "trace_elements" },
  { symbol: "Nb", name: "Niobium", category: "trace_elements" },
  { symbol: "Ta", name: "Tantalum", category: "trace_elements" },
  { symbol: "Th", name: "Thorium", category: "trace_elements" },
  { symbol: "U", name: "Uranium", category: "trace_elements" },
  { symbol: "La", name: "Lanthanum", category: "ree" },
  { symbol: "Ce", name: "Cerium", category: "ree" },
  { symbol: "Pr", name: "Praseodymium", category: "ree" },
  { symbol: "Nd", name: "Neodymium", category: "ree" },
  { symbol: "Sm", name: "Samarium", category: "ree" },
  { symbol: "Eu", name: "Europium", category: "ree" },
  { symbol: "Gd", name: "Gadolinium", category: "ree" },
  { symbol: "Tb", name: "Terbium", category: "ree" },
  { symbol: "Dy", name: "Dysprosium", category: "ree" },
  { symbol: "Ho", name: "Holmium", category: "ree" },
  { symbol: "Er", name: "Erbium", category: "ree" },
  { symbol: "Tm", name: "Thulium", category: "ree" },
  { symbol: "Yb", name: "Ytterbium", category: "ree" },
  { symbol: "Lu", name: "Lutetium", category: "ree" },
  { symbol: "Y", name: "Yttrium", category: "ree" },
  { symbol: "Sc", name: "Scandium", category: "trace_elements" },
  { symbol: "Li", name: "Lithium", category: "light_elements" },
  { symbol: "Be", name: "Beryllium", category: "light_elements" },
  { symbol: "B", name: "Boron", category: "light_elements" },
  { symbol: "Na", name: "Sodium", category: "major_oxides" },
  { symbol: "Mg", name: "Magnesium", category: "major_oxides" },
  { symbol: "Al", name: "Aluminium", category: "major_oxides" },
  { symbol: "Si", name: "Silicon", category: "major_oxides" },
  { symbol: "P", name: "Phosphorus", category: "major_oxides" },
  { symbol: "S", name: "Sulphur", category: "light_elements" },
  { symbol: "Cl", name: "Chlorine", category: "light_elements" },
  { symbol: "K", name: "Potassium", category: "major_oxides" },
  { symbol: "Ca", name: "Calcium", category: "major_oxides" },
  { symbol: "Ti", name: "Titanium", category: "major_oxides" },
  { symbol: "Mn", name: "Manganese", category: "major_oxides" },
  { symbol: "Fe", name: "Iron", category: "major_oxides" },
  { symbol: "Rb", name: "Rubidium", category: "trace_elements" },
  { symbol: "Cs", name: "Caesium", category: "trace_elements" },
  { symbol: "Hf", name: "Hafnium", category: "trace_elements" },
  { symbol: "Ga", name: "Gallium", category: "trace_elements" },
  { symbol: "Ge", name: "Germanium", category: "trace_elements" },
  { symbol: "In", name: "Indium", category: "trace_elements" },
  { symbol: "Re", name: "Rhenium", category: "trace_elements" },
  { symbol: "Tl", name: "Thallium", category: "trace_elements" },
  { symbol: "F", name: "Fluorine", category: "light_elements" },
];
DB.elements = ELEMENTS_DATA;

// Predefined element groups (for quick-selection)
const ELEMENT_GROUPS = {
  'Precious Metals':     ['Au', 'Ag', 'Pt', 'Pd'],
  'Base Metals':         ['Cu', 'Pb', 'Zn', 'Ni', 'Co', 'Mo', 'Cd'],
  'Major Oxides':        ['Si', 'Al', 'Fe', 'Ca', 'Mg', 'Na', 'K', 'Ti', 'P', 'Mn'],
  'Light Elements':      ['Li', 'Be', 'B', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'K', 'Ca'],
  'Trace Elements':      ['As', 'Ba', 'Bi', 'Cd', 'Cr', 'Cs', 'Ga', 'Ge', 'Hf', 'Hg', 'In', 'Nb', 'Rb', 'Sb', 'Sc', 'Sn', 'Sr', 'Ta', 'Te', 'Tl', 'Th', 'U', 'V', 'W', 'Zr'],
  'REE (Rare Earths)':   ['La', 'Ce', 'Pr', 'Nd', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Y', 'Sc'],
  'All Elements':        null  // special: selects everything
};

function loadElements() {
  DB.elements = ELEMENTS_DATA;
  return DB.elements;
}

function getAllElements() {
  return DB.elements || [];
}

function getElementsByCategory(category) {
  return (DB.elements || []).filter(e => e.category === category);
}

function getElementSymbols(groupName) {
  if (!ELEMENT_GROUPS[groupName]) return [];
  if (groupName === 'All Elements') return (DB.elements || []).map(e => e.symbol);
  return ELEMENT_GROUPS[groupName];
}

function getElementInfo(symbol) {
  return (DB.elements || []).find(e => e.symbol === symbol) || null;
}

// ── DB initialisation ─────────────────────────────────────────
async function initDB() {
  // Initialize Supabase
  const clientReady = initSupabase();
  if (!clientReady || !supabaseClient) {
    throw new Error('Supabase client could not be initialized. Check your connection settings.');
  }

  // Check connection
  const health = await checkSupabaseConnection();
  if (!health.connected) {
    throw new Error('Cannot connect to database: ' + (health.error?.message || health.message || 'Unknown error'));
  }

  console.log('[DB] Supabase connected. Loading data from cloud...');

  // Load elements
  loadElements();

  // Load all data from Supabase in parallel
  const [users, labs, tests, samples, reports, events, submissions, savedReports, stateData] = await Promise.all([
    supabaseFetch('users'),
    supabaseFetch('labs'),
    supabaseFetch('tests'),
    supabaseFetch('samples'),
    supabaseFetch('reports'),
    supabaseFetch('events'),
    supabaseFetch('submissions'),
    supabaseFetch('saved_reports'),
    supabaseFetch('system_state'),
  ]);

  DB.users   = users   || [];
  DB.labs    = labs    || [];
  DB.tests   = tests   || [];
  DB.samples = samples || [];
  DB.reports = reports || [];
  DB.events  = events  || [];
  DB.submissions = submissions || [];
  DB.savedReports = savedReports || [];

  // Load system state
  if (stateData && stateData.length > 0) {
    const stateMap = {};
    stateData.forEach(s => { stateMap[s.key] = s.value; });
    DB.systemState.nextSubmissionId = parseInt(stateMap.nextSubmissionId, 10) || 1001;
    DB.systemState.submissionYear = stateMap.submissionYear ? parseInt(stateMap.submissionYear, 10) : null;
  }

  // Normalise boolean fields
  DB.users  = DB.users.map(u => ({ ...u, active: u.active === true || u.active === 'true' }));
  DB.labs   = DB.labs.map(l  => ({ ...l, active: l.active === true || l.active === 'true' }));
  DB.tests  = DB.tests.map(t  => ({ ...t, active: t.active === true || t.active === 'true' }));

  console.log('[DB] Load complete. Users:', DB.users.length, 'Labs:', DB.labs.length, 'Samples:', DB.samples.length);
}

// ── Supabase CRUD helpers (using functions from supabase.js) ──

/* Users */
async function createUser(data) {
  const user = { id: generateId('usr'), created_by: currentUser()?.id || 'system', active: true, ...data, created_at: new Date().toISOString() };
  const ok = await supabaseUpsert('users', user);
  if (!ok) throw new Error('Failed to create user in database');
  DB.users.push(user);
  return user;
}

async function updateUser(id, patch) {
  const idx = DB.users.findIndex(u => u.id === id);
  if (idx === -1) return null;
  // Update in Supabase first
  const ok = await supabaseUpdate('users', id, patch);
  if (!ok) throw new Error('Failed to update user in database');
  DB.users[idx] = { ...DB.users[idx], ...patch };
  return DB.users[idx];
}

async function toggleUserActive(id) {
  const user = DB.users.find(u => u.id === id);
  if (!user) return;
  return updateUser(id, { active: !user.active });
}

/* Labs */
async function createLab(data) {
  const lab = { id: generateId('lab'), created_at: new Date().toISOString(), active: true, ...data };
  const ok = await supabaseUpsert('labs', lab);
  if (!ok) throw new Error('Failed to create lab in database');
  DB.labs.push(lab);
  return lab;
}

async function updateLab(id, patch) {
  const idx = DB.labs.findIndex(l => l.id === id);
  if (idx === -1) return null;
  const ok = await supabaseUpdate('labs', id, patch);
  if (!ok) throw new Error('Failed to update lab in database');
  DB.labs[idx] = { ...DB.labs[idx], ...patch };
  return DB.labs[idx];
}

async function deleteLab(id) {
  const engineers = DB.users.filter(u => u.lab_id === id && u.active);
  if (engineers.length) throw new Error(`Cannot delete: ${engineers.length} active engineer(s) assigned.`);
  const pending = DB.samples.filter(s => s.lab_id === id && !isSampleDone(s));
  if (pending.length) throw new Error(`Cannot delete: ${pending.length} pending sample(s) in this lab.`);
  // Cascade-delete all tests belonging to this lab
  const labTests = DB.tests.filter(t => t.lab_id === id);
  for (const t of labTests) {
    await supabaseDelete('tests', t.id);
  }
  DB.tests = DB.tests.filter(t => t.lab_id !== id);
  const ok = await supabaseDelete('labs', id);
  if (!ok) throw new Error('Failed to delete lab from database');
  DB.labs = DB.labs.filter(l => l.id !== id);
}

/* Tests */
async function createTest(data) {
  const test = { id: generateId('tst'), created_at: new Date().toISOString(), active: true, ...data };
  const ok = await supabaseUpsert('tests', test);
  if (!ok) throw new Error('Failed to create test in database');
  DB.tests.push(test);
  return test;
}

async function updateTest(id, patch) {
  const idx = DB.tests.findIndex(t => t.id === id);
  if (idx === -1) return null;
  const ok = await supabaseUpdate('tests', id, patch);
  if (!ok) throw new Error('Failed to update test in database');
  DB.tests[idx] = { ...DB.tests[idx], ...patch };
  return DB.tests[idx];
}

async function deleteTest(id) {
  const usedSamples = DB.samples.filter(s => s.test_id === id);
  if (usedSamples.length) throw new Error(`Cannot delete: ${usedSamples.length} sample(s) reference this test.`);
  const ok = await supabaseDelete('tests', id);
  if (!ok) throw new Error('Failed to delete test from database');
  DB.tests = DB.tests.filter(t => t.id !== id);
}

/* Submissions */
async function createSubmission(data) {
  // Year-aware reset: if the year has changed, reset submission counter
  const currentYear = new Date().getFullYear();
  if (DB.systemState.submissionYear !== currentYear) {
    DB.systemState.nextSubmissionId = 1001;
    DB.systemState.submissionYear = currentYear;
    // Persist the updated year to Supabase
    await supabaseUpsert('system_state', { key: 'submissionYear', value: String(currentYear) }, 'key');
  }
  const subId = DB.systemState.nextSubmissionId;
  const submission = {
    submissionId: String(subId),
    date: data.date,
    labCode: data.labCode,
    sampleCount: data.sampleCount || 0,
    createdAt: new Date().toISOString(),
  };
  const ok = await supabaseUpsert('submissions', submission, 'submissionId');
  if (!ok) throw new Error('Failed to create submission in database');
  DB.submissions.push(submission);
  DB.systemState.nextSubmissionId = subId + 1;
  // Update system state in Supabase
  await supabaseUpsert('system_state', { key: 'nextSubmissionId', value: String(DB.systemState.nextSubmissionId) }, 'key');
  return submission;
}

/* Samples */
async function createSample(data) {
  const sample = {
    id: generateId('smp'),
    sample_number: generateSampleNumber(),
    status: 'assigned',
    created_at: new Date().toISOString(),
    ...data,
  };
  const ok = await supabaseUpsert('samples', sample);
  if (!ok) throw new Error('Failed to create sample in database');
  DB.samples.push(sample);
  await logEvent(sample.id, 'created', `Sample received and assigned to lab`);
  return sample;
}

async function createSampleForSubmission(data) {
  const sample = {
    id: data.sampleId || generateId('smp'),
    sampleId: data.sampleId,
    submissionId: data.submissionId,
    sampleNumber: data.sampleNumber,
    sampleName: data.sampleName,
    sampleType: data.sampleType,
    test_id: data.test_id || '',
    test_name: data.test_name || '',
    selectedElements: data.selectedElements || [],
    elementCount: data.elementCount || 0,
    status: data.status || 'assigned',
    customer_name: data.customer_name || '',
    customer_contact: data.customer_contact || '',
    customer_address: data.customer_address || '',
    external_sample_id: data.external_sample_id || '',
    cnic: data.cnic || '',
    sample_location: data.sample_location || '',
    collection_date: data.collection_date || '',
    collected_by: data.collected_by || '',
    lab_id: data.lab_id || '',
    notes: data.notes || '',
    created_at: new Date().toISOString(),
  };
  const ok = await supabaseUpsert('samples', sample);
  if (!ok) throw new Error('Failed to create sample in database');
  DB.samples.push(sample);
  await logEvent(sample.id, 'created', `Sample registered: ${sample.sampleId}`);
  return sample;
}

async function updateSample(id, patch) {
  const idx = DB.samples.findIndex(s => s.id === id);
  if (idx === -1) return null;
  const ok = await supabaseUpdate('samples', id, patch);
  if (!ok) throw new Error('Failed to update sample in database');
  DB.samples[idx] = { ...DB.samples[idx], ...patch };
  return DB.samples[idx];
}

async function setSampleStatus(id, status, note = '') {
  const patch = { status };
  patch[`${status}_at`] = new Date().toISOString();
  const sample = await updateSample(id, patch);
  if (sample) await logEvent(id, status, note);
  return sample;
}

/* ============================================================
   RETURN / REVIEW / ARCHIVE WORKFLOW
   ------------------------------------------------------------
   Lab engineer : returnSamplesToReception()  → status 'returned'
   Reception    : resubmitSamples()           → status 'assigned'
   Reception    : archiveReturnedSamples()    → status 'archived'
   Reception    : restoreArchivedSamples()    → status 'assigned'
   ============================================================ */

// Common reasons offered when the lab returns a sample to reception.
const RETURN_REASONS = [
  'Insufficient sample quantity',
  'Sample unusable / damaged',
  'Wrong test requested',
  'Wrong laboratory assigned',
  'Elements not applicable to this sample type',
  'Required sample preparation unavailable',
  'Instrument unavailable / under maintenance',
  'Suspected contamination',
  'Other (specify in notes)',
];

// Common reasons offered when reception archives a returned sample.
const ARCHIVE_REASONS = [
  'Customer informed — analysis not possible',
  'Sample unusable / damaged',
  'Customer cancelled the request',
  'Test discontinued',
  'Duplicate of another submission',
  'Other (specify in notes)',
];

/**
 * Apply per-sample patches to the samples table.
 * Uses true UPDATE statements (a partial upsert is unsafe here because the
 * samples table has NOT NULL columns such as customer_name).
 * @param {Array<{id: string} & object>} patches
 * @returns {Promise<{updated: number, failed: number, errors: string[]}>}
 */
async function bulkUpdateSamples(patches) {
  let updated = 0;
  let failed = 0;
  const errors = [];

  for (const patch of patches) {
    const { id, ...fields } = patch;
    try {
      const ok = await supabaseUpdate('samples', id, fields);
      if (!ok) throw new Error('Update was rejected by the database');
      const idx = DB.samples.findIndex(s => s.id === id);
      if (idx !== -1) DB.samples[idx] = { ...DB.samples[idx], ...fields };
      updated++;
    } catch (err) {
      failed++;
      errors.push((fields.sampleId || id) + ': ' + err.message);
    }
  }

  return { updated, failed, errors };
}

/**
 * Lab engineer sends one or more samples back to reception for review.
 * @param {string[]} sampleIds
 * @param {string} reason - required
 * @param {string} [note] - optional free-text note
 * @returns {Promise<{updated:number, failed:number, errors:string[]}>}
 */
async function returnSamplesToReception(sampleIds, reason, note) {
  const ids = [...new Set(sampleIds || [])];
  if (!ids.length) throw new Error('Select at least one sample to return.');
  if (!reason) throw new Error('A return reason is required.');

  const targets = ids.map(id => getSample(id)).filter(Boolean);
  if (targets.length !== ids.length) {
    throw new Error('Some selected samples no longer exist. Refresh and try again.');
  }

  const blocked = targets.filter(s => isSampleReturned(s) || isSampleArchived(s));
  if (blocked.length) {
    throw new Error(blocked.length + ' selected sample(s) are already returned or archived.');
  }

  const now   = new Date().toISOString();
  const actor = currentUser();
  const actorName = actor ? actor.full_name : 'Lab Engineer';

  const patches = targets.map(s => ({
    id: s.id,
    sampleId: s.sampleId,
    status: 'returned',
    returned_at: now,
    return_reason: reason,
    returned_by: actorName,
    return_count: (Number(s.return_count) || 0) + 1,
    // Keep status and timestamp columns in sync — the sample is no longer complete.
    completed_at: null,
  }));

  const result = await bulkUpdateSamples(patches);
  const logNote = note ? (reason + ' — ' + note) : reason;
  for (const s of targets) {
    await logEvent(s.id, 'returned', 'Returned to reception: ' + logNote);
  }
  return result;
}

/**
 * Reception edits and resubmits returned samples to their lab.
 * @param {Array<{id:string, lab_id:string, test_id:string, test_name?:string,
 *                sampleType?:string, selectedElements?:string[]}>} items
 * @param {string} [note]
 */
async function resubmitSamples(items, note) {
  const list = items || [];
  if (!list.length) throw new Error('Select at least one sample to resubmit.');

  // Validate everything first so a partial batch is never written.
  const validated = list.map(item => {
    const s = getSample(item.id);
    if (!s) throw new Error('Sample not found. Refresh and try again.');
    if (!isSampleReturned(s)) {
      throw new Error('Sample ' + (s.sampleId || s.id) + ' is no longer awaiting review.');
    }
    if (!item.lab_id) throw new Error('Select a laboratory before resubmitting.');
    if (!item.test_id) throw new Error('Select a test for sample ' + (s.sampleId || s.id) + '.');

    const test = getTest(item.test_id);
    const elements = item.selectedElements || [];
    if (test && test.requires_elements !== false && elements.length === 0) {
      throw new Error('Select at least one element for sample ' + (s.sampleId || s.id) + '.');
    }

    return { sample: s, item, test, elements };
  });

  const now = new Date().toISOString();
  const patches = validated.map(({ sample, item, test, elements }) => ({
    id: sample.id,
    sampleId: sample.sampleId,
    lab_id: item.lab_id,
    test_id: item.test_id,
    test_name: item.test_name || (test ? test.test_name : sample.test_name || ''),
    sampleType: item.sampleType || sample.sampleType,
    selectedElements: elements,
    elementCount: elements.length,
    status: 'assigned',
    assigned_at: now,
    // Clear the return metadata (return_count is kept as an audit counter).
    return_reason: '',
    returned_by: '',
    returned_at: null,
  }));

  const result = await bulkUpdateSamples(patches);
  for (const { sample } of validated) {
    await logEvent(sample.id, 'resubmitted', note || 'Edited and resubmitted to lab by reception');
  }
  return result;
}

/**
 * Reception closes returned samples without analysis.
 * Archived samples count as "completed" in the progress report.
 * @param {string[]} sampleIds
 * @param {string} reason - required
 * @param {string} [note]
 */
async function archiveReturnedSamples(sampleIds, reason, note) {
  const ids = [...new Set(sampleIds || [])];
  if (!ids.length) throw new Error('Select at least one sample to archive.');
  if (!reason) throw new Error('An archive reason is required.');

  const targets = ids.map(id => getSample(id)).filter(Boolean);
  if (targets.length !== ids.length) {
    throw new Error('Some selected samples no longer exist. Refresh and try again.');
  }

  const notReturned = targets.filter(s => !isSampleReturned(s));
  if (notReturned.length) {
    throw new Error(notReturned.length + ' selected sample(s) are not awaiting review. Refresh the page.');
  }

  const now   = new Date().toISOString();
  const actor = currentUser();
  const actorName = actor ? actor.full_name : 'Receptionist';

  const patches = targets.map(s => ({
    id: s.id,
    sampleId: s.sampleId,
    status: 'archived',
    archived_at: now,
    archived_by: actorName,
    archive_reason: reason,
  }));

  const result = await bulkUpdateSamples(patches);
  const logNote = note ? (reason + ' — ' + note) : reason;
  for (const s of targets) {
    await logEvent(s.id, 'archived', 'Archived by reception: ' + logNote);
  }
  return result;
}

/**
 * Move archived samples back into the lab queue.
 * @param {string[]} sampleIds
 * @param {string} [note]
 */
async function restoreArchivedSamples(sampleIds, note) {
  const ids = [...new Set(sampleIds || [])];
  if (!ids.length) throw new Error('Select at least one sample to restore.');

  const targets = ids.map(id => getSample(id)).filter(Boolean);
  if (targets.length !== ids.length) {
    throw new Error('Some selected samples no longer exist. Refresh and try again.');
  }

  const notArchived = targets.filter(s => !isSampleArchived(s));
  if (notArchived.length) {
    throw new Error(notArchived.length + ' selected sample(s) are not archived. Refresh the page.');
  }

  const now = new Date().toISOString();
  const patches = targets.map(s => ({
    id: s.id,
    sampleId: s.sampleId,
    status: 'assigned',
    assigned_at: now,
    archived_at: null,
    archived_by: '',
    archive_reason: '',
  }));

  const result = await bulkUpdateSamples(patches);
  for (const s of targets) {
    await logEvent(s.id, 'restored', note || 'Restored from archive and sent back to lab');
  }
  return result;
}

/**
 * Flag any saved PNAC/QSCert report data for a submission as out of date
 * (called after reception edits and resubmits samples).
 * @param {string} fullSubmissionId - e.g. "26-07-AAS-1041"
 * @returns {Promise<number>} number of reports flagged
 */
async function markSavedReportsStale(fullSubmissionId) {
  if (!fullSubmissionId) return 0;
  const targets = DB.savedReports.filter(r => r.submission_id === fullSubmissionId && !r.is_stale);
  for (const r of targets) {
    try {
      await supabaseUpdate('saved_reports', r.id, { is_stale: true, updated_at: new Date().toISOString() });
      r.is_stale = true;
    } catch (err) {
      console.warn('[DB] Could not flag saved report as stale:', err.message);
    }
  }
  return targets.length;
}

/* ── Workflow queries ────────────────────────────────────────── */

/** All samples currently waiting for reception review, newest first. */
function getReturnedSamples() {
  return DB.samples
    .filter(isSampleReturned)
    .sort((a, b) => new Date(b.returned_at || b.created_at) - new Date(a.returned_at || a.created_at));
}

/** All archived samples, most recently archived first. */
function getArchivedSamples() {
  return DB.samples
    .filter(isSampleArchived)
    .sort((a, b) => new Date(b.archived_at || b.created_at) - new Date(a.archived_at || a.created_at));
}

/** Count of samples waiting for reception review (used for tab badges). */
function getReturnedSampleCount() {
  return DB.samples.filter(isSampleReturned).length;
}

/**
 * Group an arbitrary list of samples by submission.
 * Shared by the lab dashboard, reception dashboard and review queue so the
 * aggregate status rules can never drift apart.
 * @param {Array<object>} samples
 * @returns {Array<object>}
 */
function groupSamplesBySubmission(samples) {
  const list = samples || [];
  const grouped = {};

  list.forEach(s => {
    const subId = s.submissionId || 'standalone';
    if (!grouped[subId]) {
      grouped[subId] = {
        submissionId: subId,
        samples: [],
        customer_name: s.customer_name || '',
        lab_id: s.lab_id || '',
        test_name: s.test_name || '',
        collected_by: s.collected_by || '',
        created_at: s.created_at || '',
      };
    }
    grouped[subId].samples.push(s);
  });

  return Object.values(grouped).map(g => {
    const sorted = [...g.samples].sort((a, b) => {
      const aSeq = (a.sampleId || '').split('-').pop() || '';
      const bSeq = (b.sampleId || '').split('-').pop() || '';
      return aSeq.localeCompare(bSeq, undefined, { numeric: true });
    });

    const returned = g.samples.filter(isSampleReturned);
    const archived = g.samples.filter(isSampleArchived);
    const done     = g.samples.filter(isSampleDone);

    const firstSampleId = sorted.length ? (sorted[0].sampleId || sorted[0].sampleNumber || '') : '';
    const lastSampleId  = sorted.length ? (sorted[sorted.length - 1].sampleId || sorted[sorted.length - 1].sampleNumber || '') : '';

    const dates       = g.samples.map(s => s.created_at).filter(Boolean).sort();
    const returnDates = returned.map(s => s.returned_at).filter(Boolean).sort().reverse();

    return {
      submissionId: g.submissionId,
      samples: g.samples,
      sortedSamples: sorted,
      customer_name: g.customer_name,
      lab_id: g.lab_id,
      test_name: g.test_name,
      collected_by: g.collected_by,
      sampleCount: g.samples.length,
      statusSummary: summariseSampleStatuses(g.samples),
      firstSampleId,
      lastSampleId,
      created_at: dates[0] || g.created_at,
      // Workflow flags
      returnedSamples: returned,
      returnedCount: returned.length,
      hasReturned: returned.length > 0,
      archivedCount: archived.length,
      hasArchived: archived.length > 0,
      doneCount: done.length,
      allDone: g.samples.length > 0 && done.length === g.samples.length,
      latestReturnedAt: returnDates[0] || null,
    };
  });
}

/** Submissions (from any receptionist) containing at least one returned sample. */
function getReturnedSubmissions() {
  return groupSamplesBySubmission(getReturnedSamples())
    .sort((a, b) => new Date(b.latestReturnedAt || b.created_at) - new Date(a.latestReturnedAt || a.created_at));
}

/** Submissions containing at least one archived sample. */
function getArchivedSubmissions() {
  return groupSamplesBySubmission(getArchivedSamples())
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/* Reports */
async function createReport(data) {
  const lab = DB.labs.find(l => l.id === data.lab_id);
  const labCode = lab?.lab_code || 'LAB';
  const report = {
    id: generateId('rpt'),
    uploaded_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    report_number: generateReportNumber(labCode),
    ...data,
  };
  const ok = await supabaseUpsert('reports', report);
  if (!ok) throw new Error('Failed to create report in database');
  DB.reports.push(report);
  await setSampleStatus(data.sample_id, 'completed', `Report ${report.report_number} uploaded`);
  return report;
}

/* Events / Audit */
async function logEvent(sample_id, type, note = '') {
  const evt = {
    id: generateId('evt'),
    sample_id,
    type,
    note,
    actor_id: currentUser()?.id || 'system',
    actor_name: currentUser()?.full_name || 'System',
    timestamp: new Date().toISOString(),
  };
  const ok = await supabaseUpsert('events', evt);
  if (!ok) console.warn('[DB] Failed to log event to database');
  DB.events.push(evt);
  return evt;
}

function getEventsForSample(sample_id) {
  return DB.events.filter(e => e.sample_id === sample_id).sort((a,b) => new Date(a.timestamp)-new Date(b.timestamp));
}

// ── Re-fetch a table from Supabase (useful when another user made changes) ──
async function refreshTable(table) {
  const data = await supabaseFetch(table);
  if (data) {
    DB[table] = data;
    if (table === 'users' || table === 'labs' || table === 'tests') {
      DB[table] = DB[table].map(u => ({ ...u, active: u.active === true || u.active === 'true' }));
    }
  }
  return DB[table];
}

// ── Lookup helpers (synchronous, work on cached DB) ────────────
function getLab(id)    { return DB.labs.find(l => l.id === id); }
function getTest(id)   { return DB.tests.find(t => t.id === id); }
function getUser(id)   { return DB.users.find(u => u.id === id); }
function getSample(id) { return DB.samples.find(s => s.id === id || s.sampleId === id); }
function getReport(id) { return DB.reports.find(r => r.id === id); }

function getTestsForLab(lab_id) {
  return DB.tests.filter(t => t.lab_id === lab_id && t.active !== false);
}

function getSamplesForLab(lab_id) {
  return DB.samples.filter(s => s.lab_id === lab_id);
}

/**
 * Get samples for a lab grouped by submission.
 * Returns an array of submission-grouped objects.
 * @param {string} lab_id
 * @returns {Array<{submissionId: string, samples: Array, customer_name: string, lab_id: string, test_name: string, sampleCount: number, sampleIds: string[], statusSummary: string, firstSampleId: string, lastSampleId: string, created_at: string}>}
 */
function getSubmissionsForLab(lab_id) {
  const allSamples = getSamplesForLab(lab_id);
  const grouped = {};

  allSamples.forEach(s => {
    const subId = s.submissionId || 'standalone';
    if (!grouped[subId]) {
      grouped[subId] = {
        submissionId: subId,
        samples: [],
        customer_name: s.customer_name || '',
        lab_id: s.lab_id || '',
        test_name: s.test_name || '',
        created_at: s.created_at || '',
      };
    }
    grouped[subId].samples.push(s);
  });

  return Object.values(grouped).map(g => {
    const sampleIds = g.samples.map(s => s.sampleId || s.sampleNumber || s.id).filter(Boolean);
    // Aggregate status — anything needing attention wins, archived counts as completed
    const statusSummary   = summariseSampleStatuses(g.samples);
    const returnedSamples = g.samples.filter(isSampleReturned);
    const archivedSamples = g.samples.filter(isSampleArchived);

    // Sort samples by their sequence number within the sampleId
    const sorted = [...g.samples].sort((a, b) => {
      const aSeq = (a.sampleId || '').split('-').pop() || '';
      const bSeq = (b.sampleId || '').split('-').pop() || '';
      return aSeq.localeCompare(bSeq, undefined, { numeric: true });
    });

    const firstSampleId = sorted.length > 0 ? (sorted[0].sampleId || sorted[0].sampleNumber || '') : '';
    const lastSampleId  = sorted.length > 0 ? (sorted[sorted.length - 1].sampleId || sorted[sorted.length - 1].sampleNumber || '') : '';

    // Use earliest created_at among samples
    const dates = g.samples.map(s => s.created_at).filter(Boolean).sort();
    const created_at = dates[0] || g.created_at;

    return {
      submissionId: g.submissionId,
      samples: g.samples,
      customer_name: g.customer_name,
      lab_id: g.lab_id,
      test_name: g.test_name,
      sampleCount: g.samples.length,
      sampleIds,
      statusSummary,
      firstSampleId,
      lastSampleId,
      created_at,
      // Workflow flags
      hasReturned: returnedSamples.length > 0,
      returnedCount: returnedSamples.length,
      hasArchived: archivedSamples.length > 0,
      archivedCount: archivedSamples.length,
      allDone: g.samples.length > 0 && g.samples.every(isSampleDone),
    };
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getReportForSample(sample_id) {
  return DB.reports.find(r => r.sample_id === sample_id);
}

function getReportsForSubmission(submissionId) {
  const sampleIds = DB.samples.filter(s => s.submissionId === submissionId).map(s => s.id);
  return DB.reports.filter(r => sampleIds.includes(r.sample_id));
}

/**
 * Generate reports for all completed samples in a submission.
 * Called by receptionist when all samples in a submission are complete.
 * @param {string} submissionId
 * @param {string} lab_id
 * @param {string} [actorId] - ID of the user generating the report
 * @param {string} [actorName] - Name of the user
 * @returns {Promise<Array>} Array of created report objects
 */
async function generateSubmissionReports(submissionId, lab_id, actorId, actorName) {
  const samples = DB.samples.filter(s => s.submissionId === submissionId);
  // Only analysed samples get a report. Archived samples (closed by reception
  // without analysis) are intentionally excluded — they still count as
  // "completed" in the progress report, but they have no analytical results.
  const completedSamples = samples.filter(s => s.status === 'completed');
  const lab = DB.labs.find(l => l.id === lab_id);
  const labCode = lab?.lab_code || 'LAB';

  const createdReports = [];
  for (const sample of completedSamples) {
    const existingReport = DB.reports.find(r => r.sample_id === sample.id);
    if (existingReport) {
      // Already has a report — skip
      createdReports.push(existingReport);
      continue;
    }

    const report = {
      id: generateId('rpt'),
      sample_id: sample.id,
      lab_id: lab_id,
      engineer_id: actorId || 'system',
      report_number: generateReportNumber(labCode),
      report_notes: `Report auto-generated for completed sample`,
      report_file_name: 'system-generated',
      report_file_data: '',
      uploaded_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    const ok = await supabaseUpsert('reports', report);
    if (!ok) {
      console.warn(`[DB] Failed to create report for sample ${sample.id}`);
      continue;
    }
    DB.reports.push(report);

    // Log event
    await logEvent(sample.id, 'report_generated', `Report ${report.report_number} generated by ${actorName || 'System'}`);
    createdReports.push(report);
  }

  return createdReports;
}

function getActiveLabs() {
  return DB.labs.filter(l => l.active !== false);
}

// ── Saved Reports helpers ──────────────────────────────────────
/**
 * Derive the full submission ID (e.g. "26-07-AAS-1041") from a submission's
 * first sample ID by dropping the last sequence segment.
 * @param {object} sub - submission object from getSubmissionsForLab()
 * @returns {string}
 */
function getFullSubmissionId(sub) {
  if (!sub) return '';
  if (sub.firstSampleId) {
    const parts = sub.firstSampleId.split('-');
    if (parts.length >= 4) {
      return parts.slice(0, -1).join('-');
    }
    return sub.firstSampleId;
  }
  return sub.submissionId || '';
}

/**
 * Find a saved report by full submission ID and report type.
 * @param {string} fullSubmissionId - e.g. "26-07-AAS-1041"
 * @param {string} reportType - 'pnac' or 'qscert'
 * @returns {object|null}
 */
function getSavedReport(fullSubmissionId, reportType) {
  if (!fullSubmissionId || !reportType) return null;
  return DB.savedReports.find(
    r => r.submission_id === fullSubmissionId && r.report_type === reportType
  ) || null;
}

/**
 * Get all saved report types for a submission (for tick marks).
 * @param {string} fullSubmissionId - e.g. "26-07-AAS-1041"
 * @returns {Array<object>} array of saved report rows
 */
function getSavedReportsForSubmission(fullSubmissionId) {
  if (!fullSubmissionId) return [];
  return DB.savedReports.filter(r => r.submission_id === fullSubmissionId);
}

/**
 * Save (upsert) a report's data to the saved_reports table.
 * Uses a deterministic ID so re-saving overwrites the same row.
 * @param {object} data - full report data object
 * @returns {Promise<object>} the saved report object
 */
async function saveReportData(data) {
  const id = 'srpt-' + data.submission_id + '-' + data.report_type;
  const now = new Date().toISOString();
  const record = {
    id,
    submission_id: data.submission_id,
    report_type: data.report_type,
    report_number: data.report_number || '',
    report_issue_date: data.report_issue_date || '',
    customer_name: data.customer_name || '',
    sample_count: data.sample_count || 0,
    sample_location: data.sample_location || '',
    sample_receiving_date: data.sample_receiving_date || '',
    sample_description: data.sample_description || '',
    sample_analysis_date: data.sample_analysis_date || '',
    method_used: data.method_used || '',
    temperature_humidity: data.temperature_humidity || '',
    unit: data.unit || 'ppm',
    lab_id: data.lab_id || '',
    lab_name: data.lab_name || '',
    lab_code: data.lab_code || '',
    test_name: data.test_name || '',
    test_code: data.test_code || '',
    elements: data.elements || [],
    sample_ids: data.sample_ids || [],
    data_points: data.data_points || [],
    engineer_id: data.engineer_id || '',
    engineer_name: data.engineer_name || '',
    updated_at: now,
  };

  const ok = await supabaseUpsert('saved_reports', record, 'submission_id,report_type');
  if (!ok) throw new Error('Failed to save report data to database');

  // Update local cache
  const idx = DB.savedReports.findIndex(
    r => r.submission_id === data.submission_id && r.report_type === data.report_type
  );
  if (idx >= 0) {
    DB.savedReports[idx] = { ...DB.savedReports[idx], ...record };
  } else {
    DB.savedReports.push({ ...record, created_at: now });
  }

  return record;
}

// ── Reset function (clears database for development) ────────────
function resetToCSV() {
  // This now only clears localStorage session and reloads
  localStorage.removeItem('garl_session');
  showToast('Session cleared. Reloading...', 'info');
  setTimeout(() => location.reload(), 1500);
}