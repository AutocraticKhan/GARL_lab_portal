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
  submissions: [],
  systemState: { nextSubmissionId: 1001 },
};

// ── Seed data for initial login (only users kept) ─────────────
const SEED_USERS = [
  { id: 'usr-001', username: 'admin', password: 'asdfQWER!1234', role: 'admin', lab_id: '', full_name: 'Dr. Admin User', created_by: 'system', active: true },
  { id: 'usr-002', username: 'receptionist1', password: 'asdfQWER!1234', role: 'receptionist', lab_id: '', full_name: 'Fatima Khalid', created_by: 'usr-001', active: true },
  { id: 'usr-003', username: 'eng_aas', password: 'asdfQWER!1234', role: 'lab_engineer', lab_id: 'lab-001', full_name: 'Eng. Ahmed Hussain', created_by: 'usr-001', active: true },
  { id: 'usr-004', username: 'eng_aes', password: 'asdfQWER!1234', role: 'lab_engineer', lab_id: 'lab-002', full_name: 'Eng. Zainab Ali', created_by: 'usr-001', active: true },
  { id: 'usr-005', username: 'eng_wdxrf', password: 'asdfQWER!1234', role: 'lab_engineer', lab_id: 'lab-003', full_name: 'Eng. Usman Khan', created_by: 'usr-001', active: true },
  { id: 'usr-006', username: 'eng_edxrf', password: 'asdfQWER!1234', role: 'lab_engineer', lab_id: 'lab-004', full_name: 'Eng. Saima Bibi', created_by: 'usr-001', active: true },
  { id: 'usr-007', username: 'eng_xrd', password: 'asdfQWER!1234', role: 'lab_engineer', lab_id: 'lab-005', full_name: 'Eng. Tariq Mehmood', created_by: 'usr-001', active: true },
  { id: 'usr-008', username: 'eng_pet', password: 'asdfQWER!1234', role: 'lab_engineer', lab_id: 'lab-006', full_name: 'Eng. Rabia Sultana', created_by: 'usr-001', active: true },
  { id: 'usr-009', username: 'eng_sem', password: 'asdfQWER!1234', role: 'lab_engineer', lab_id: 'lab-007', full_name: 'Eng. Kamran Javed', created_by: 'usr-001', active: true },
  { id: 'usr-010', username: 'eng_dta', password: 'asdfQWER!1234', role: 'lab_engineer', lab_id: 'lab-008', full_name: 'Eng. Noreen Iqbal', created_by: 'usr-001', active: true },
  { id: 'usr-011', username: 'eng_crush', password: 'asdfQWER!1234', role: 'lab_engineer', lab_id: 'lab-009', full_name: 'Eng. Bilal Ahmed', created_by: 'usr-001', active: true },
  { id: 'usr-012', username: 'eng_env', password: 'asdfQWER!1234', role: 'lab_engineer', lab_id: 'lab-010', full_name: 'Eng. Maria Pervez', created_by: 'usr-001', active: true }
];

const SEED_LABS = [
  { id: 'lab-001', lab_name: 'AAS', lab_code: 'AAS', description: 'Atomic Absorption Spectrometry for trace and precious metal analysis (Au, Ag, Pt, Pd, Cu, Pb, Zn)', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'lab-002', lab_name: 'MP-AES', lab_code: 'AES', description: 'Microwave Plasma Atomic Emission Spectrometry for multi-element and major oxide analysis', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'lab-003', lab_name: 'WDXRF', lab_code: 'WDX', description: 'Wavelength Dispersive X-Ray Fluorescence for whole-rock major oxides and trace elements', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'lab-004', lab_name: 'EDXRF', lab_code: 'EDX', description: 'Energy Dispersive X-Ray Fluorescence for rapid elemental screening and alloy ID', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'lab-005', lab_name: 'XRD', lab_code: 'XRD', description: 'X-Ray Diffraction for mineral identification, quantitative phase analysis, and clay mineralogy', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'lab-006', lab_name: 'Petrology', lab_code: 'PET', description: 'Petrographic and mineralogical examination of thin sections and polished blocks', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'lab-007', lab_name: 'SEM', lab_code: 'SEM', description: 'Scanning Electron Microscopy with EDS for imaging, elemental mapping, and particle analysis', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'lab-008', lab_name: 'DTA-TG', lab_code: 'DTA', description: 'Differential Thermal Analysis and Thermogravimetry for thermal behavior and weight loss', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'lab-009', lab_name: 'Crushing', lab_code: 'CRU', description: 'Sample preparation including jaw crushing, cone crushing, pulverizing, and sieve analysis', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'lab-010', lab_name: 'Environmental', lab_code: 'ENV', description: 'Environmental and water testing for pH, TDS, EC, heavy metals, effluent, and drinking water quality', created_at: '2026-01-01T00:00:00Z', active: true }
];

const SEED_SAMPLES = [
  // ── AAS (lab-001) — 5 samples ────────────────────────────────
  { id: 'smp-001', lab_id: 'lab-001', sampleId: '26-01-AAS-1001-001', submissionId: '1001', sampleNumber: '001', sampleName: '26-01-AAS-1001-001', sampleType: 'Rock', test_id: 'tst-001', test_name: 'Fire Assay — Au (Gold)', selectedElements: ['Au'], elementCount: 1, status: 'completed', customer_name: 'Ahmed Steel Mills', customer_contact: '+92-300-1111111', collection_date: '2026-01-05', collected_by: 'usr-002', created_at: '2026-01-05T09:00:00Z', completed_at: '2026-01-10T16:00:00Z' },
  { id: 'smp-002', lab_id: 'lab-001', sampleId: '26-01-AAS-1001-002', submissionId: '1001', sampleNumber: '002', sampleName: '26-01-AAS-1001-002', sampleType: 'Rock', test_id: 'tst-001', test_name: 'Fire Assay — Au (Gold)', selectedElements: ['Au'], elementCount: 1, status: 'completed', customer_name: 'Ahmed Steel Mills', customer_contact: '+92-300-1111111', collection_date: '2026-01-05', collected_by: 'usr-002', created_at: '2026-01-05T09:00:00Z', completed_at: '2026-01-10T17:30:00Z' },
  { id: 'smp-003', lab_id: 'lab-001', sampleId: '26-01-AAS-1002-001', submissionId: '1002', sampleNumber: '001', sampleName: '26-01-AAS-1002-001', sampleType: 'Ore', test_id: 'tst-004', test_name: 'Base Metals (Cu, Pb, Zn)', selectedElements: ['Cu', 'Pb', 'Zn'], elementCount: 3, status: 'in_progress', customer_name: 'Pakistan Mining Corp', customer_contact: '+92-321-2222222', collection_date: '2026-06-01', collected_by: 'usr-002', created_at: '2026-06-01T10:00:00Z' },
  { id: 'smp-004', lab_id: 'lab-001', sampleId: '26-06-AAS-1002-002', submissionId: '1002', sampleNumber: '002', sampleName: '26-06-AAS-1002-002', sampleType: 'Ore', test_id: 'tst-005', test_name: 'Trace Elements by AAS', selectedElements: ['As', 'Sb', 'Bi', 'Hg'], elementCount: 4, status: 'assigned', customer_name: 'Pakistan Mining Corp', customer_contact: '+92-321-2222222', collection_date: '2026-06-01', collected_by: 'usr-002', created_at: '2026-06-01T10:00:00Z' },
  { id: 'smp-005', lab_id: 'lab-001', sampleId: '26-06-AAS-1003-001', submissionId: '1003', sampleNumber: '001', sampleName: '26-06-AAS-1003-001', sampleType: 'Concentrate', test_id: 'tst-002', test_name: 'Fire Assay — Ag (Silver)', selectedElements: ['Ag'], elementCount: 1, status: 'received', customer_name: 'ABC Explorations', customer_contact: '+92-333-3333333', collection_date: '2026-06-15', collected_by: 'usr-002', created_at: '2026-06-15T08:30:00Z' },
  // ── MP-AES (lab-002) — 4 samples ─────────────────────────────
  { id: 'smp-006', lab_id: 'lab-002', sampleId: '26-02-AES-1004-001', submissionId: '1004', sampleNumber: '001', sampleName: '26-02-AES-1004-001', sampleType: 'Soil', test_id: 'tst-009', test_name: 'Multi-Element Scan (30+ Elements)', selectedElements: ['Al', 'Ca', 'Fe', 'K', 'Mg', 'Na', 'Si', 'Ti', 'Ba', 'Sr', 'V', 'Zr', 'Cr', 'Ni', 'Cu', 'Zn', 'Pb', 'As', 'Co', 'Mn'], elementCount: 20, status: 'completed', customer_name: 'Soil Survey of Pakistan', customer_contact: '+92-44-5555555', collection_date: '2026-02-10', collected_by: 'usr-002', created_at: '2026-02-10T11:00:00Z', completed_at: '2026-02-17T14:00:00Z' },
  { id: 'smp-007', lab_id: 'lab-002', sampleId: '26-04-AES-1005-001', submissionId: '1005', sampleNumber: '001', sampleName: '26-04-AES-1005-001', sampleType: 'Rock', test_id: 'tst-007', test_name: 'Major Elements Suite', selectedElements: ['Si', 'Al', 'Fe', 'Ca', 'Mg', 'Na', 'K', 'Ti', 'P', 'Mn'], elementCount: 10, status: 'completed', customer_name: 'Geological Survey', customer_contact: '+92-51-6666666', collection_date: '2026-04-20', collected_by: 'usr-002', created_at: '2026-04-20T09:00:00Z', completed_at: '2026-04-28T11:00:00Z' },
  { id: 'smp-008', lab_id: 'lab-002', sampleId: '26-05-AES-1006-001', submissionId: '1006', sampleNumber: '001', sampleName: '26-05-AES-1006-001', sampleType: 'Water', test_id: 'tst-010', test_name: 'Water Dissolved Metals', selectedElements: ['Cu', 'Pb', 'Zn', 'Cd', 'Cr', 'As', 'Fe', 'Mn'], elementCount: 8, status: 'in_progress', customer_name: 'Punjab Water Authority', customer_contact: '+92-42-7777777', collection_date: '2026-05-05', collected_by: 'usr-002', created_at: '2026-05-05T10:30:00Z' },
  { id: 'smp-009', lab_id: 'lab-002', sampleId: '26-06-AES-1007-001', submissionId: '1007', sampleNumber: '001', sampleName: '26-06-AES-1007-001', sampleType: 'Sediment', test_id: 'tst-008', test_name: 'REE (Rare Earth Elements) Suite', selectedElements: ['La', 'Ce', 'Pr', 'Nd', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Y'], elementCount: 15, status: 'assigned', customer_name: 'Rare Earth Mining', customer_contact: '+92-300-8888888', collection_date: '2026-06-10', collected_by: 'usr-002', created_at: '2026-06-10T09:00:00Z' },
  // ── WDXRF (lab-003) — 3 samples ─────────────────────────────
  { id: 'smp-010', lab_id: 'lab-003', sampleId: '26-03-WDX-1008-001', submissionId: '1008', sampleNumber: '001', sampleName: '26-03-WDX-1008-001', sampleType: 'Rock', test_id: 'tst-011', test_name: 'Whole Rock Major Oxides', selectedElements: ['Si', 'Al', 'Fe', 'Ca', 'Mg', 'Na', 'K', 'Ti', 'P', 'Mn'], elementCount: 10, status: 'completed', customer_name: 'Cement Industries Ltd', customer_contact: '+92-44-9999999', collection_date: '2026-03-15', collected_by: 'usr-002', created_at: '2026-03-15T08:00:00Z', completed_at: '2026-03-22T16:00:00Z' },
  { id: 'smp-011', lab_id: 'lab-003', sampleId: '26-05-WDX-1009-001', submissionId: '1009', sampleNumber: '001', sampleName: '26-05-WDX-1009-001', sampleType: 'Core', test_id: 'tst-012', test_name: 'Trace Elements by XRF', selectedElements: ['Ba', 'Cr', 'V', 'Zr', 'Nb', 'Sr', 'Rb', 'Th', 'U'], elementCount: 9, status: 'completed', customer_name: 'DrillTech Pakistan', customer_contact: '+92-333-0000000', collection_date: '2026-05-20', collected_by: 'usr-002', created_at: '2026-05-20T10:00:00Z', completed_at: '2026-05-28T15:00:00Z' },
  { id: 'smp-012', lab_id: 'lab-003', sampleId: '26-06-WDX-1010-001', submissionId: '1010', sampleNumber: '001', sampleName: '26-06-WDX-1010-001', sampleType: 'Rock', test_id: 'tst-014', test_name: 'Cement Raw Mix Analysis', selectedElements: ['Si', 'Al', 'Fe', 'Ca', 'Mg'], elementCount: 5, status: 'assigned', customer_name: 'Bestway Cement', customer_contact: '+92-300-1112222', collection_date: '2026-06-12', collected_by: 'usr-002', created_at: '2026-06-12T11:30:00Z' },
  // ── EDXRF (lab-004) — 3 samples ─────────────────────────────
  { id: 'smp-013', lab_id: 'lab-004', sampleId: '26-04-EDX-1011-001', submissionId: '1011', sampleNumber: '001', sampleName: '26-04-EDX-1011-001', sampleType: 'Concentrate', test_id: 'tst-015', test_name: 'Portable XRF Screening', selectedElements: ['Cu', 'Pb', 'Zn', 'Fe', 'As', 'Sb'], elementCount: 6, status: 'completed', customer_name: 'Copper Mines Ltd', customer_contact: '+92-81-3334444', collection_date: '2026-04-05', collected_by: 'usr-002', created_at: '2026-04-05T09:00:00Z', completed_at: '2026-04-08T16:00:00Z' },
  { id: 'smp-014', lab_id: 'lab-004', sampleId: '26-06-EDX-1012-001', submissionId: '1012', sampleNumber: '001', sampleName: '26-06-EDX-1012-001', sampleType: 'Dust', test_id: 'tst-017', test_name: 'Alloy Identification', selectedElements: ['Fe', 'Cr', 'Ni', 'Mo', 'Mn'], elementCount: 5, status: 'in_progress', customer_name: 'Steel Re-Rolling Mills', customer_contact: '+92-42-5556666', collection_date: '2026-06-08', collected_by: 'usr-002', created_at: '2026-06-08T10:00:00Z' },
  { id: 'smp-015', lab_id: 'lab-004', sampleId: '26-06-EDX-1013-001', submissionId: '1013', sampleNumber: '001', sampleName: '26-06-EDX-1013-001', sampleType: 'Soil', test_id: 'tst-016', test_name: 'Elemental Scan (Na to U)', selectedElements: ['Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'K', 'Ca', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'As', 'Br', 'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Ba', 'W', 'Pb', 'Th', 'U'], elementCount: 31, status: 'received', customer_name: 'Environmental Agency', customer_contact: '+92-51-7778888', collection_date: '2026-06-14', collected_by: 'usr-002', created_at: '2026-06-14T12:00:00Z' },
  // ── XRD (lab-005) — 2 samples ───────────────────────────────
  { id: 'smp-016', lab_id: 'lab-005', sampleId: '26-03-XRD-1014-001', submissionId: '1014', sampleNumber: '001', sampleName: '26-03-XRD-1014-001', sampleType: 'Rock', test_id: 'tst-019', test_name: 'Bulk Mineral Identification', selectedElements: ['Si', 'Al', 'Fe', 'Ca', 'Mg', 'K'], elementCount: 6, status: 'completed', customer_name: 'Mineral Exploration Co', customer_contact: '+92-300-2223333', collection_date: '2026-03-25', collected_by: 'usr-002', created_at: '2026-03-25T09:30:00Z', completed_at: '2026-04-01T14:00:00Z' },
  { id: 'smp-017', lab_id: 'lab-005', sampleId: '26-06-XRD-1015-001', submissionId: '1015', sampleNumber: '001', sampleName: '26-06-XRD-1015-001', sampleType: 'Tailings', test_id: 'tst-020', test_name: 'Quantitative Phase Analysis (Rietveld)', selectedElements: ['Si', 'Al', 'Fe', 'Ca', 'Mg', 'K', 'Na', 'Ti'], elementCount: 8, status: 'assigned', customer_name: 'Gold Recovery Inc', customer_contact: '+92-321-4445555', collection_date: '2026-06-10', collected_by: 'usr-002', created_at: '2026-06-10T10:00:00Z' },
  // ── Petrology (lab-006) — 2 samples ─────────────────────────
  { id: 'smp-018', lab_id: 'lab-006', sampleId: '26-05-PET-1016-001', submissionId: '1016', sampleNumber: '001', sampleName: '26-05-PET-1016-001', sampleType: 'Rock', test_id: 'tst-023', test_name: 'Thin Section Petrography', selectedElements: [], elementCount: 0, status: 'completed', customer_name: 'University of Punjab', customer_contact: '+92-42-9998888', collection_date: '2026-05-10', collected_by: 'usr-002', created_at: '2026-05-10T08:00:00Z', completed_at: '2026-05-16T16:00:00Z' },
  { id: 'smp-019', lab_id: 'lab-006', sampleId: '26-06-PET-1017-001', submissionId: '1017', sampleNumber: '001', sampleName: '26-06-PET-1017-001', sampleType: 'Core', test_id: 'tst-024', test_name: 'Modal Analysis (Point Counting)', selectedElements: [], elementCount: 0, status: 'in_progress', customer_name: 'Oil & Gas Dev Corp', customer_contact: '+92-51-6667777', collection_date: '2026-06-05', collected_by: 'usr-002', created_at: '2026-06-05T11:00:00Z' },
  // ── SEM (lab-007) — 2 samples ───────────────────────────────
  { id: 'smp-020', lab_id: 'lab-007', sampleId: '26-04-SEM-1018-001', submissionId: '1018', sampleNumber: '001', sampleName: '26-04-SEM-1018-001', sampleType: 'Dust', test_id: 'tst-027', test_name: 'SEM-EDS Spot Analysis', selectedElements: ['Fe', 'O', 'Si', 'Al', 'Ca'], elementCount: 5, status: 'completed', customer_name: 'Air Quality Monitor', customer_contact: '+92-300-5556666', collection_date: '2026-04-15', collected_by: 'usr-002', created_at: '2026-04-15T09:00:00Z', completed_at: '2026-04-19T15:00:00Z' },
  { id: 'smp-021', lab_id: 'lab-007', sampleId: '26-06-SEM-1019-001', submissionId: '1019', sampleNumber: '001', sampleName: '26-06-SEM-1019-001', sampleType: 'Core', test_id: 'tst-030', test_name: 'Particle Size & Morphology', selectedElements: [], elementCount: 0, status: 'received', customer_name: 'Cement Research Inst', customer_contact: '+92-44-3332222', collection_date: '2026-06-13', collected_by: 'usr-002', created_at: '2026-06-13T10:30:00Z' },
  // ── DTA-TG (lab-008) — 2 samples ────────────────────────────
  { id: 'smp-022', lab_id: 'lab-008', sampleId: '26-05-DTA-1020-001', submissionId: '1020', sampleNumber: '001', sampleName: '26-05-DTA-1020-001', sampleType: 'Sludge', test_id: 'tst-031', test_name: 'Thermogravimetric Analysis (TGA)', selectedElements: [], elementCount: 0, status: 'completed', customer_name: 'Waste Treatment Plant', customer_contact: '+92-42-1112223', collection_date: '2026-05-25', collected_by: 'usr-002', created_at: '2026-05-25T08:30:00Z', completed_at: '2026-05-29T12:00:00Z' },
  { id: 'smp-023', lab_id: 'lab-008', sampleId: '26-06-DTA-1021-001', submissionId: '1021', sampleNumber: '001', sampleName: '26-06-DTA-1021-001', sampleType: 'Water', test_id: 'tst-033', test_name: 'Moisture & Volatile Content', selectedElements: [], elementCount: 0, status: 'assigned', customer_name: 'Food Testing Lab', customer_contact: '+92-300-4445555', collection_date: '2026-06-12', collected_by: 'usr-002', created_at: '2026-06-12T09:00:00Z' },
  // ── Crushing (lab-009) — 2 samples ──────────────────────────
  { id: 'smp-024', lab_id: 'lab-009', sampleId: '26-02-CRU-1022-001', submissionId: '1022', sampleNumber: '001', sampleName: '26-02-CRU-1022-001', sampleType: 'Rock', test_id: 'tst-035', test_name: 'Jaw Crushing (Coarse)', selectedElements: [], elementCount: 0, status: 'completed', customer_name: 'Bulk Sampling Ltd', customer_contact: '+92-300-6667777', collection_date: '2026-02-20', collected_by: 'usr-002', created_at: '2026-02-20T09:00:00Z', completed_at: '2026-02-21T16:00:00Z' },
  { id: 'smp-025', lab_id: 'lab-009', sampleId: '26-06-CRU-1023-001', submissionId: '1023', sampleNumber: '001', sampleName: '26-06-CRU-1023-001', sampleType: 'Ore', test_id: 'tst-037', test_name: 'Pulverizing to 75µm', selectedElements: [], elementCount: 0, status: 'received', customer_name: 'Metallurgy Labs', customer_contact: '+92-81-8889999', collection_date: '2026-06-16', collected_by: 'usr-002', created_at: '2026-06-16T10:00:00Z' },
  // ── Environmental (lab-010) — 2 samples ─────────────────────
  { id: 'smp-026', lab_id: 'lab-010', sampleId: '26-04-ENV-1024-001', submissionId: '1024', sampleNumber: '001', sampleName: '26-04-ENV-1024-001', sampleType: 'Water', test_id: 'tst-040', test_name: 'Water Quality (pH, TDS, EC)', selectedElements: [], elementCount: 0, status: 'completed', customer_name: 'City Water Board', customer_contact: '+92-42-4443333', collection_date: '2026-04-10', collected_by: 'usr-002', created_at: '2026-04-10T08:00:00Z', completed_at: '2026-04-14T14:00:00Z' },
  { id: 'smp-027', lab_id: 'lab-010', sampleId: '26-06-ENV-1025-001', submissionId: '1025', sampleNumber: '001', sampleName: '26-06-ENV-1025-001', sampleType: 'Water', test_id: 'tst-041', test_name: 'Heavy Metals in Water', selectedElements: ['Pb', 'Cd', 'Cr', 'As', 'Hg'], elementCount: 5, status: 'in_progress', customer_name: 'EPA Punjab', customer_contact: '+92-42-1110000', collection_date: '2026-06-07', collected_by: 'usr-002', created_at: '2026-06-07T11:00:00Z' },
];

const SEED_REPORTS = [
  { id: 'rpt-001', sample_id: 'smp-001', lab_id: 'lab-001', report_number: 'RPT-AAS-20260110-0001', uploaded_at: '2026-01-10T16:00:00Z', created_at: '2026-01-10T16:00:00Z' },
  { id: 'rpt-002', sample_id: 'smp-002', lab_id: 'lab-001', report_number: 'RPT-AAS-20260110-0002', uploaded_at: '2026-01-10T17:30:00Z', created_at: '2026-01-10T17:30:00Z' },
  { id: 'rpt-003', sample_id: 'smp-006', lab_id: 'lab-002', report_number: 'RPT-AES-20260217-0001', uploaded_at: '2026-02-17T14:00:00Z', created_at: '2026-02-17T14:00:00Z' },
  { id: 'rpt-004', sample_id: 'smp-007', lab_id: 'lab-002', report_number: 'RPT-AES-20260428-0002', uploaded_at: '2026-04-28T11:00:00Z', created_at: '2026-04-28T11:00:00Z' },
  { id: 'rpt-005', sample_id: 'smp-010', lab_id: 'lab-003', report_number: 'RPT-WDX-20260322-0001', uploaded_at: '2026-03-22T16:00:00Z', created_at: '2026-03-22T16:00:00Z' },
  { id: 'rpt-006', sample_id: 'smp-011', lab_id: 'lab-003', report_number: 'RPT-WDX-20260528-0002', uploaded_at: '2026-05-28T15:00:00Z', created_at: '2026-05-28T15:00:00Z' },
  { id: 'rpt-007', sample_id: 'smp-013', lab_id: 'lab-004', report_number: 'RPT-EDX-20260408-0001', uploaded_at: '2026-04-08T16:00:00Z', created_at: '2026-04-08T16:00:00Z' },
  { id: 'rpt-008', sample_id: 'smp-016', lab_id: 'lab-005', report_number: 'RPT-XRD-20260401-0001', uploaded_at: '2026-04-01T14:00:00Z', created_at: '2026-04-01T14:00:00Z' },
  { id: 'rpt-009', sample_id: 'smp-018', lab_id: 'lab-006', report_number: 'RPT-PET-20260516-0001', uploaded_at: '2026-05-16T16:00:00Z', created_at: '2026-05-16T16:00:00Z' },
  { id: 'rpt-010', sample_id: 'smp-020', lab_id: 'lab-007', report_number: 'RPT-SEM-20260419-0001', uploaded_at: '2026-04-19T15:00:00Z', created_at: '2026-04-19T15:00:00Z' },
  { id: 'rpt-011', sample_id: 'smp-022', lab_id: 'lab-008', report_number: 'RPT-DTA-20260529-0001', uploaded_at: '2026-05-29T12:00:00Z', created_at: '2026-05-29T12:00:00Z' },
  { id: 'rpt-012', sample_id: 'smp-024', lab_id: 'lab-009', report_number: 'RPT-CRU-20260221-0001', uploaded_at: '2026-02-21T16:00:00Z', created_at: '2026-02-21T16:00:00Z' },
  { id: 'rpt-013', sample_id: 'smp-026', lab_id: 'lab-010', report_number: 'RPT-ENV-20260414-0001', uploaded_at: '2026-04-14T14:00:00Z', created_at: '2026-04-14T14:00:00Z' },
];

const SEED_TESTS = [
  // ── AAS (lab-001) ──────────────────────────────────────────────
  { id: 'tst-001', lab_id: 'lab-001', test_name: 'Fire Assay — Au (Gold)', test_code: 'FA-AU', test_type: 'precious_metals', turnaround_days: '5', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-002', lab_id: 'lab-001', test_name: 'Fire Assay — Ag (Silver)', test_code: 'FA-AG', test_type: 'precious_metals', turnaround_days: '5', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-003', lab_id: 'lab-001', test_name: 'Fire Assay — PGE (Pt, Pd)', test_code: 'FA-PGE', test_type: 'precious_metals', turnaround_days: '7', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-004', lab_id: 'lab-001', test_name: 'Base Metals (Cu, Pb, Zn)', test_code: 'AAS-BM', test_type: 'base_metals', turnaround_days: '3', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-005', lab_id: 'lab-001', test_name: 'Trace Elements by AAS', test_code: 'AAS-TE', test_type: 'trace_elements', turnaround_days: '3', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-006', lab_id: 'lab-001', test_name: 'Cyanide Leach Solution', test_code: 'AAS-CN', test_type: 'trace_elements', turnaround_days: '2', created_at: '2026-01-01T00:00:00Z', active: true },
  // ── MP-AES (lab-002) ───────────────────────────────────────────
  { id: 'tst-007', lab_id: 'lab-002', test_name: 'Major Elements Suite', test_code: 'AES-MAJ', test_type: 'major_oxides', turnaround_days: '4', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-008', lab_id: 'lab-002', test_name: 'REE (Rare Earth Elements) Suite', test_code: 'AES-REE', test_type: 'ree', turnaround_days: '7', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-009', lab_id: 'lab-002', test_name: 'Multi-Element Scan (30+ Elements)', test_code: 'AES-ME', test_type: 'trace_elements', turnaround_days: '5', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-010', lab_id: 'lab-002', test_name: 'Water Dissolved Metals', test_code: 'AES-H2O', test_type: 'trace_elements', turnaround_days: '3', created_at: '2026-01-01T00:00:00Z', active: true },
  // ── WDXRF (lab-003) ───────────────────────────────────────────
  { id: 'tst-011', lab_id: 'lab-003', test_name: 'Whole Rock Major Oxides', test_code: 'WDX-WR', test_type: 'major_oxides', turnaround_days: '5', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-012', lab_id: 'lab-003', test_name: 'Trace Elements by XRF', test_code: 'WDX-TE', test_type: 'trace_elements', turnaround_days: '5', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-013', lab_id: 'lab-003', test_name: 'Loss on Ignition (LOI)', test_code: 'WDX-LOI', test_type: 'major_oxides', turnaround_days: '2', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-014', lab_id: 'lab-003', test_name: 'Cement Raw Mix Analysis', test_code: 'WDX-CEM', test_type: 'major_oxides', turnaround_days: '4', created_at: '2026-01-01T00:00:00Z', active: true },
  // ── EDXRF (lab-004) ───────────────────────────────────────────
  { id: 'tst-015', lab_id: 'lab-004', test_name: 'Portable XRF Screening', test_code: 'EDX-PXRF', test_type: 'trace_elements', turnaround_days: '1', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-016', lab_id: 'lab-004', test_name: 'Elemental Scan (Na to U)', test_code: 'EDX-SCAN', test_type: 'trace_elements', turnaround_days: '2', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-017', lab_id: 'lab-004', test_name: 'Alloy Identification', test_code: 'EDX-ALLOY', test_type: 'trace_elements', turnaround_days: '1', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-018', lab_id: 'lab-004', test_name: 'RoHS Screening', test_code: 'EDX-ROHS', test_type: 'trace_elements', turnaround_days: '2', created_at: '2026-01-01T00:00:00Z', active: true },
  // ── XRD (lab-005) ─────────────────────────────────────────────
  { id: 'tst-019', lab_id: 'lab-005', test_name: 'Bulk Mineral Identification', test_code: 'XRD-BMI', test_type: 'mineralogy', turnaround_days: '4', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-020', lab_id: 'lab-005', test_name: 'Quantitative Phase Analysis (Rietveld)', test_code: 'XRD-QPA', test_type: 'mineralogy', turnaround_days: '7', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-021', lab_id: 'lab-005', test_name: 'Clay Mineralogy', test_code: 'XRD-CLAY', test_type: 'mineralogy', turnaround_days: '5', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-022', lab_id: 'lab-005', test_name: 'Crystallite Size & Strain', test_code: 'XRD-CSS', test_type: 'mineralogy', turnaround_days: '4', created_at: '2026-01-01T00:00:00Z', active: true },
  // ── Petrology (lab-006) ───────────────────────────────────────
  { id: 'tst-023', lab_id: 'lab-006', test_name: 'Thin Section Petrography', test_code: 'PET-TS', test_type: 'petrology', turnaround_days: '5', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-024', lab_id: 'lab-006', test_name: 'Modal Analysis (Point Counting)', test_code: 'PET-MOD', test_type: 'petrology', turnaround_days: '4', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-025', lab_id: 'lab-006', test_name: 'Photomicrography', test_code: 'PET-PHOTO', test_type: 'petrology', turnaround_days: '2', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-026', lab_id: 'lab-006', test_name: 'Fluid Inclusion Studies', test_code: 'PET-FI', test_type: 'petrology', turnaround_days: '7', created_at: '2026-01-01T00:00:00Z', active: true },
  // ── SEM (lab-007) ─────────────────────────────────────────────
  { id: 'tst-027', lab_id: 'lab-007', test_name: 'SEM-EDS Spot Analysis', test_code: 'SEM-EDS', test_type: 'imaging', turnaround_days: '3', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-028', lab_id: 'lab-007', test_name: 'Backscattered Electron Imaging', test_code: 'SEM-BSE', test_type: 'imaging', turnaround_days: '2', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-029', lab_id: 'lab-007', test_name: 'Elemental Mapping', test_code: 'SEM-MAP', test_type: 'imaging', turnaround_days: '4', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-030', lab_id: 'lab-007', test_name: 'Particle Size & Morphology', test_code: 'SEM-PSM', test_type: 'imaging', turnaround_days: '3', created_at: '2026-01-01T00:00:00Z', active: true },
  // ── DTA-TG (lab-008) ─────────────────────────────────────────
  { id: 'tst-031', lab_id: 'lab-008', test_name: 'Thermogravimetric Analysis (TGA)', test_code: 'DTA-TGA', test_type: 'thermal', turnaround_days: '3', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-032', lab_id: 'lab-008', test_name: 'Differential Scanning Calorimetry (DSC)', test_code: 'DTA-DSC', test_type: 'thermal', turnaround_days: '3', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-033', lab_id: 'lab-008', test_name: 'Moisture & Volatile Content', test_code: 'DTA-H2O', test_type: 'thermal', turnaround_days: '2', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-034', lab_id: 'lab-008', test_name: 'Melting Point Determination', test_code: 'DTA-MP', test_type: 'thermal', turnaround_days: '1', created_at: '2026-01-01T00:00:00Z', active: true },
  // ── Crushing (lab-009) ────────────────────────────────────────
  { id: 'tst-035', lab_id: 'lab-009', test_name: 'Jaw Crushing (Coarse)', test_code: 'CRU-JAW', test_type: 'sample_prep', turnaround_days: '1', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-036', lab_id: 'lab-009', test_name: 'Cone Crushing (Intermediate)', test_code: 'CRU-CONE', test_type: 'sample_prep', turnaround_days: '1', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-037', lab_id: 'lab-009', test_name: 'Pulverizing to 75µm', test_code: 'CRU-PULV', test_type: 'sample_prep', turnaround_days: '2', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-038', lab_id: 'lab-009', test_name: 'Sieve Analysis (Particle Size Distribution)', test_code: 'CRU-SIEVE', test_type: 'sample_prep', turnaround_days: '1', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-039', lab_id: 'lab-009', test_name: 'Sample Splitting & Riffling', test_code: 'CRU-SPLIT', test_type: 'sample_prep', turnaround_days: '1', created_at: '2026-01-01T00:00:00Z', active: true },
  // ── Environmental (lab-010) ────────────────────────────────────
  { id: 'tst-040', lab_id: 'lab-010', test_name: 'Water Quality (pH, TDS, EC)', test_code: 'ENV-WQ', test_type: 'environmental', turnaround_days: '2', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-041', lab_id: 'lab-010', test_name: 'Heavy Metals in Water', test_code: 'ENV-HM', test_type: 'environmental', turnaround_days: '4', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-042', lab_id: 'lab-010', test_name: 'Effluent & Wastewater Testing', test_code: 'ENV-EFF', test_type: 'environmental', turnaround_days: '5', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-043', lab_id: 'lab-010', test_name: 'Drinking Water Potability', test_code: 'ENV-DW', test_type: 'environmental', turnaround_days: '3', created_at: '2026-01-01T00:00:00Z', active: true },
  { id: 'tst-044', lab_id: 'lab-010', test_name: 'Soil Contamination Screening', test_code: 'ENV-SOIL', test_type: 'environmental', turnaround_days: '5', created_at: '2026-01-01T00:00:00Z', active: true }
];

// ── Migration from old flat format to new hierarchical format ──
function migrateOldData() {
  // Check if old-format samples exist (using generateSampleNumber pattern)
  const oldSamples = DB.samples.filter(s => s.id && s.id.startsWith('smp-'));
  if (oldSamples.length === 0) return; // nothing to migrate

  console.log(`[DB] Migrating ${oldSamples.length} old-format samples to new structure...`);

  // Load or init labPortalData
  let portalData = getStoredData();

  let maxSubId = 1000;
  const subIdMap = {}; // map old submission grouping → new submissionId

  const migratedSamples = [];

  oldSamples.forEach((s, idx) => {
    // Derive lab code from lab name
    const lab = DB.labs.find(l => l.id === s.lab_id);
    const labCode = deriveLabCode(lab?.lab_name || 'LAB');

    // Generate a submissionId based on collected_by + date to group samples
    const groupKey = `${s.collected_by || 'unknown'}_${s.collection_date || s.created_at}`;
    if (!subIdMap[groupKey]) {
      maxSubId++;
      subIdMap[groupKey] = String(maxSubId);
    }
    const subId = subIdMap[groupKey];

    // Generate structured IDs
    const ids = generateSampleIDs(labCode, subId, 1, s.collection_date || s.created_at);
    const newSampleId = ids[0].fullId;

    // Create submission record if not already created
    if (!portalData.submissions.find(sub => sub.submissionId === subId)) {
      portalData.submissions.push({
        submissionId: subId,
        date: s.collection_date ? s.collection_date.slice(0, 10) : s.created_at.slice(0, 10),
        labCode: labCode,
        sampleCount: 0, // will be incremented
        createdAt: s.created_at
      });
    }

    // Update sampleCount
    const subRecord = portalData.submissions.find(sub => sub.submissionId === subId);
    if (subRecord) subRecord.sampleCount++;

    // Build migrated sample entry
    const migratedSample = {
      sampleId: newSampleId,
      submissionId: subId,
      sampleNumber: ids[0].sampleNumber,
      sampleName: s.customer_name || '',
      sampleType: 'Rock',
      status: s.status || 'assigned',
      // Carry forward old fields
      id: newSampleId,
      customer_name: s.customer_name,
      customer_contact: s.customer_contact,
      customer_address: s.customer_address,
      external_sample_id: s.external_sample_id,
      cnic: s.cnic,
      sample_location: s.sample_location,
      collection_date: s.collection_date,
      collected_by: s.collected_by,
      lab_id: s.lab_id,
      test_id: s.test_id,
      notes: s.notes,
      created_at: s.created_at,
      in_progress_at: s.in_progress_at,
      completed_at: s.completed_at,
    };

    portalData.samples.push(migratedSample);
    migratedSamples.push(migratedSample);
  });

  // Update systemState
  portalData.systemState.nextSubmissionId = maxSubId + 1;

  // Save migrated data
  saveStoredData(portalData);

  // Replace DB.samples with migrated versions
  const nonMigrated = DB.samples.filter(s => !s.id || !s.id.startsWith('smp-'));
  DB.samples = [...nonMigrated, ...migratedSamples];
  DB.submissions = portalData.submissions;
  DB.systemState = portalData.systemState;

  // Persist to old storage keys too for backward compat with other dashboards
  saveDB('samples');
  saveDB('submissions');
  saveDB('systemState');

  console.log('[DB] Migration complete.');
}

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
// Embedded directly to eliminate fetch dependency; the JSON file is kept
// as reference only.
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
DB.elements = []; // will be populated from embedded data

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
  // Use embedded element data so it always works regardless of fetch/Supabase status
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
  // Initialize Supabase if available
  initSupabase();
  const useSupabase = supabaseClient !== null;

  // Load elements first
  await loadElements();

  if (useSupabase) {
    console.log('[DB] Supabase connected. Loading data from cloud...');
    const [users, labs, tests, samples, reports, events, submissions] = await Promise.all([
      supabaseFetch('users'),
      supabaseFetch('labs'),
      supabaseFetch('tests'),
      supabaseFetch('samples'),
      supabaseFetch('reports'),
      supabaseFetch('events'),
      supabaseFetch('submissions'),
    ]);

    // If Supabase has data, use it; otherwise seed initial data
    if (users && users.length > 0) {
      DB.users   = users;
      DB.labs    = labs   || [];
      DB.tests   = tests  || [];
      DB.samples = samples || [];
      DB.reports = reports || [];
      DB.events  = events  || [];
      DB.submissions = submissions || [];
      DB.systemState = { nextSubmissionId: 1001 + (DB.submissions.length || 0) };
    } else {
      // First run — seed with initial data
      console.log('[DB] No data in Supabase. Seeding initial data...');
      DB.users   = SEED_USERS;
      DB.labs    = SEED_LABS;
      DB.tests   = SEED_TESTS;
      DB.samples = SEED_SAMPLES;
      DB.reports = SEED_REPORTS;
      DB.events  = [];
      DB.submissions = [];
      DB.systemState = { nextSubmissionId: 1026 };

      // Persist seed data to Supabase
      await Promise.all([
        supabaseUpsert('users', DB.users),
        supabaseUpsert('labs', DB.labs),
        supabaseUpsert('tests', DB.tests),
        supabaseUpsert('samples', DB.samples),
        supabaseUpsert('reports', DB.reports),
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
    DB.submissions = loadFromStorage('submissions') || [];
    const storedState = loadFromStorage('systemState');
    DB.systemState = storedState || { nextSubmissionId: 1001 + (DB.submissions.length || 0) };

    // Merge stored data with seed data (seed acts as defaults)
    DB.users   = mergeSeedData(storedUsers, SEED_USERS);
    DB.labs    = mergeSeedData(storedLabs, SEED_LABS);
    DB.tests   = mergeSeedData(storedTests, SEED_TESTS);
    DB.samples = mergeSeedData(DB.samples, SEED_SAMPLES);
    DB.reports = mergeSeedData(DB.reports, SEED_REPORTS);

    // Run migration on old-format data
    migrateOldData();
  }

  // Normalise boolean fields
  DB.users  = DB.users.map(u => ({ ...u, active: u.active === true || u.active === 'true' }));
  DB.labs   = DB.labs.map(l  => ({ ...l, active: l.active === true || l.active === 'true' }));
  DB.tests  = DB.tests.map(t  => ({ ...t, active: t.active === true || t.active === 'true' }));

  // Migrate existing tests: add test_type if missing (use seed defaults)
  const testTypeMap = {};
  SEED_TESTS.forEach(s => { testTypeMap[s.id] = s.test_type; });
  DB.tests = DB.tests.map(t => {
    if (!t.test_type && testTypeMap[t.id]) {
      return { ...t, test_type: testTypeMap[t.id] };
    }
    return t;
  });

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
  ['users','labs','tests','samples','reports','events','submissions','systemState'].forEach(saveDB);
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

/* Submissions */
function createSubmission(data) {
  const subId = DB.systemState.nextSubmissionId;
  const submission = {
    submissionId: String(subId),
    date: data.date,
    labCode: data.labCode,
    sampleCount: data.sampleCount || 0,
    createdAt: new Date().toISOString(),
  };
  DB.submissions.push(submission);
  DB.systemState.nextSubmissionId = subId + 1;
  saveDB('submissions');
  saveDB('systemState');
  syncToSupabase('submissions');
  return submission;
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

function createSampleForSubmission(data) {
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
  DB.samples.push(sample);
  saveDB('samples');
  syncToSupabase('samples');
  logEvent(sample.id, 'created', `Sample registered: ${sample.sampleId}`);
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
function getSample(id) { return DB.samples.find(s => s.id === id || s.sampleId === id); }
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
  ['garl_users','garl_labs','garl_tests','garl_samples','garl_reports','garl_events','garl_submissions','garl_systemState'].forEach(k => localStorage.removeItem(k));
  localStorage.removeItem('labPortalData');
  showToast('Local cache cleared. Reloading...', 'info');
  setTimeout(() => location.reload(), 1500);
}