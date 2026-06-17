-- ============================================================
-- GARL Minerals Lab Portal — Complete Supabase Schema
-- Run this in the Supabase SQL Editor to create all tables
-- Schema supports: AAS, MP-AES, WDXRF, EDXRF, XRD, Petrology,
-- SEM, DTA-TG, Crushing, Environmental mineral testing labs
-- ============================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'receptionist', 'lab_engineer')),
  lab_id TEXT DEFAULT '',
  full_name TEXT NOT NULL,
  created_by TEXT DEFAULT 'system',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Labs table
CREATE TABLE IF NOT EXISTS labs (
  id TEXT PRIMARY KEY,
  lab_name TEXT NOT NULL,
  lab_code TEXT NOT NULL,
  description TEXT DEFAULT '',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tests table
CREATE TABLE IF NOT EXISTS tests (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  test_name TEXT NOT NULL,
  test_code TEXT NOT NULL,
  test_type TEXT DEFAULT '',
  turnaround_days TEXT DEFAULT '1',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Submissions table (groups samples together)
CREATE TABLE IF NOT EXISTS submissions (
  "submissionId" TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  "labCode" TEXT NOT NULL,
  "sampleCount" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Samples table
CREATE TABLE IF NOT EXISTS samples (
  id TEXT PRIMARY KEY,
  "sampleId" TEXT,
  "submissionId" TEXT REFERENCES submissions("submissionId") ON DELETE SET NULL,
  "sampleNumber" TEXT,
  "sampleName" TEXT DEFAULT '',
  "sampleType" TEXT DEFAULT 'Rock',
  test_id TEXT,
  test_name TEXT DEFAULT '',
  "selectedElements" JSONB DEFAULT '[]',
  "elementCount" INTEGER DEFAULT 0,
  status TEXT DEFAULT 'assigned' CHECK (status IN ('received','assigned','in_progress','completed')),
  customer_name TEXT NOT NULL,
  customer_contact TEXT DEFAULT '',
  customer_address TEXT DEFAULT '',
  external_sample_id TEXT DEFAULT '',
  cnic TEXT DEFAULT '',
  sample_location TEXT DEFAULT '',
  collection_date TEXT DEFAULT '',
  collected_by TEXT DEFAULT '',
  lab_id TEXT,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_at TIMESTAMPTZ,
  in_progress_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  sample_id TEXT,
  lab_id TEXT,
  engineer_id TEXT DEFAULT '',
  report_number TEXT NOT NULL,
  report_notes TEXT DEFAULT '',
  report_file_name TEXT DEFAULT '',
  report_file_data TEXT DEFAULT '',
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Events / Audit table
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  sample_id TEXT,
  type TEXT NOT NULL,
  note TEXT DEFAULT '',
  actor_id TEXT DEFAULT 'system',
  actor_name TEXT DEFAULT 'System',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- System state table (for auto-increment counters)
CREATE TABLE IF NOT EXISTS system_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Elements library (geochemical elements)
CREATE TABLE IF NOT EXISTS elements (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL
);

-- Insert default system state
INSERT INTO system_state (key, value) VALUES ('nextSubmissionId', '1001')
ON CONFLICT (key) DO NOTHING;

-- Enable Row Level Security (optional, can be disabled for simplicity)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE labs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE elements ENABLE ROW LEVEL SECURITY;

-- Allow public access (since we use anon key)
CREATE POLICY "Allow public read users" ON users FOR SELECT USING (true);
CREATE POLICY "Allow public insert users" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update users" ON users FOR UPDATE USING (true);
CREATE POLICY "Allow public delete users" ON users FOR DELETE USING (true);

CREATE POLICY "Allow public all labs" ON labs FOR ALL USING (true);
CREATE POLICY "Allow public all tests" ON tests FOR ALL USING (true);
CREATE POLICY "Allow public all submissions" ON submissions FOR ALL USING (true);
CREATE POLICY "Allow public all samples" ON samples FOR ALL USING (true);
CREATE POLICY "Allow public all reports" ON reports FOR ALL USING (true);
CREATE POLICY "Allow public all events" ON events FOR ALL USING (true);
CREATE POLICY "Allow public all system_state" ON system_state FOR ALL USING (true);
CREATE POLICY "Allow public all elements" ON elements FOR ALL USING (true);

-- ============================================================
-- After creating tables, you need to populate them.
-- Run the INSERT statements below to add initial data.
-- ============================================================

-- Initial admin user (password: asdfQWER!1234)
-- IMPORTANT: Change this password after first login!
INSERT INTO users (id, username, password, role, lab_id, full_name, created_by, active)
VALUES ('usr-001', 'admin', 'asdfQWER!1234', 'admin', '', 'Dr. Admin User', 'system', true)
ON CONFLICT (id) DO NOTHING;

-- Labs
INSERT INTO labs (id, lab_name, lab_code, description, active) VALUES
  ('lab-001', 'AAS', 'AAS', 'Atomic Absorption Spectrometry for trace and precious metal analysis (Au, Ag, Pt, Pd, Cu, Pb, Zn)', true),
  ('lab-002', 'MP-AES', 'AES', 'Microwave Plasma Atomic Emission Spectrometry for multi-element and major oxide analysis', true),
  ('lab-003', 'WDXRF', 'WDX', 'Wavelength Dispersive X-Ray Fluorescence for whole-rock major oxides and trace elements', true),
  ('lab-004', 'EDXRF', 'EDX', 'Energy Dispersive X-Ray Fluorescence for rapid elemental screening and alloy ID', true),
  ('lab-005', 'XRD', 'XRD', 'X-Ray Diffraction for mineral identification, quantitative phase analysis, and clay mineralogy', true),
  ('lab-006', 'Petrology', 'PET', 'Petrographic and mineralogical examination of thin sections and polished blocks', true),
  ('lab-007', 'SEM', 'SEM', 'Scanning Electron Microscopy with EDS for imaging, elemental mapping, and particle analysis', true),
  ('lab-008', 'DTA-TG', 'DTA', 'Differential Thermal Analysis and Thermogravimetry for thermal behavior and weight loss', true),
  ('lab-009', 'Crushing', 'CRU', 'Sample preparation including jaw crushing, cone crushing, pulverizing, and sieve analysis', true),
  ('lab-010', 'Environmental', 'ENV', 'Environmental and water testing for pH, TDS, EC, heavy metals, effluent, and drinking water quality', true)
ON CONFLICT (id) DO NOTHING;

-- Elements (geochemical element library)
INSERT INTO elements (symbol, name, category) VALUES
  ('Au', 'Gold', 'precious_metals'),
  ('Ag', 'Silver', 'precious_metals'),
  ('Pt', 'Platinum', 'precious_metals'),
  ('Pd', 'Palladium', 'precious_metals'),
  ('Cu', 'Copper', 'base_metals'),
  ('Pb', 'Lead', 'base_metals'),
  ('Zn', 'Zinc', 'base_metals'),
  ('Ni', 'Nickel', 'base_metals'),
  ('Co', 'Cobalt', 'base_metals'),
  ('Mo', 'Molybdenum', 'trace_elements'),
  ('Cd', 'Cadmium', 'trace_elements'),
  ('Cr', 'Chromium', 'trace_elements'),
  ('As', 'Arsenic', 'trace_elements'),
  ('Sb', 'Antimony', 'trace_elements'),
  ('Bi', 'Bismuth', 'trace_elements'),
  ('Hg', 'Mercury', 'trace_elements'),
  ('Sn', 'Tin', 'trace_elements'),
  ('W', 'Tungsten', 'trace_elements'),
  ('Se', 'Selenium', 'trace_elements'),
  ('Te', 'Tellurium', 'trace_elements'),
  ('Ba', 'Barium', 'trace_elements'),
  ('Sr', 'Strontium', 'trace_elements'),
  ('V', 'Vanadium', 'trace_elements'),
  ('Zr', 'Zirconium', 'trace_elements'),
  ('Nb', 'Niobium', 'trace_elements'),
  ('Ta', 'Tantalum', 'trace_elements'),
  ('Th', 'Thorium', 'trace_elements'),
  ('U', 'Uranium', 'trace_elements'),
  ('La', 'Lanthanum', 'ree'),
  ('Ce', 'Cerium', 'ree'),
  ('Pr', 'Praseodymium', 'ree'),
  ('Nd', 'Neodymium', 'ree'),
  ('Sm', 'Samarium', 'ree'),
  ('Eu', 'Europium', 'ree'),
  ('Gd', 'Gadolinium', 'ree'),
  ('Tb', 'Terbium', 'ree'),
  ('Dy', 'Dysprosium', 'ree'),
  ('Ho', 'Holmium', 'ree'),
  ('Er', 'Erbium', 'ree'),
  ('Tm', 'Thulium', 'ree'),
  ('Yb', 'Ytterbium', 'ree'),
  ('Lu', 'Lutetium', 'ree'),
  ('Y', 'Yttrium', 'ree'),
  ('Sc', 'Scandium', 'trace_elements'),
  ('Li', 'Lithium', 'light_elements'),
  ('Be', 'Beryllium', 'light_elements'),
  ('B', 'Boron', 'light_elements'),
  ('Na', 'Sodium', 'major_oxides'),
  ('Mg', 'Magnesium', 'major_oxides'),
  ('Al', 'Aluminium', 'major_oxides'),
  ('Si', 'Silicon', 'major_oxides'),
  ('P', 'Phosphorus', 'major_oxides'),
  ('S', 'Sulphur', 'light_elements'),
  ('Cl', 'Chlorine', 'light_elements'),
  ('K', 'Potassium', 'major_oxides'),
  ('Ca', 'Calcium', 'major_oxides'),
  ('Ti', 'Titanium', 'major_oxides'),
  ('Mn', 'Manganese', 'major_oxides'),
  ('Fe', 'Iron', 'major_oxides'),
  ('Rb', 'Rubidium', 'trace_elements'),
  ('Cs', 'Caesium', 'trace_elements'),
  ('Hf', 'Hafnium', 'trace_elements'),
  ('Ga', 'Gallium', 'trace_elements'),
  ('Ge', 'Germanium', 'trace_elements'),
  ('In', 'Indium', 'trace_elements'),
  ('Re', 'Rhenium', 'trace_elements'),
  ('Tl', 'Thallium', 'trace_elements'),
  ('F', 'Fluorine', 'light_elements')
ON CONFLICT (symbol) DO NOTHING;