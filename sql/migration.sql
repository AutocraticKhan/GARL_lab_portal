-- ============================================================
-- GARL Minerals Lab Portal — Supabase Migration
-- Run this in the Supabase SQL Editor to create all tables
-- Schema supports: AAS, MP-AES, WDXRF, EDXRF, XRD, Petrology,
-- SEM, DTA-TG, Crushing, Environmental mineral testing labs

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
  lab_id TEXT NOT NULL REFERENCES labs(id),
  test_name TEXT NOT NULL,
  test_code TEXT NOT NULL,
  turnaround_days INTEGER DEFAULT 1,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Samples table
CREATE TABLE IF NOT EXISTS samples (
  id TEXT PRIMARY KEY,
  sample_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_contact TEXT DEFAULT '',
  customer_address TEXT DEFAULT '',
  external_sample_id TEXT DEFAULT '',
  cnic TEXT DEFAULT '',
  sample_location TEXT DEFAULT '',
  collection_date TIMESTAMPTZ,
  collected_by TEXT,
  lab_id TEXT NOT NULL REFERENCES labs(id),
  test_id TEXT NOT NULL REFERENCES tests(id),
  status TEXT DEFAULT 'assigned' CHECK (status IN ('received','assigned','in_progress','completed')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_at TIMESTAMPTZ,
  in_progress_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  sample_id TEXT NOT NULL REFERENCES samples(id),
  lab_id TEXT NOT NULL REFERENCES labs(id),
  engineer_id TEXT,
  report_number TEXT NOT NULL,
  report_notes TEXT DEFAULT '',
  report_file_name TEXT DEFAULT '',
  report_file_data TEXT DEFAULT '',
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Events / Audit table
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  sample_id TEXT REFERENCES samples(id),
  type TEXT NOT NULL,
  note TEXT DEFAULT '',
  actor_id TEXT DEFAULT 'system',
  actor_name TEXT DEFAULT 'System',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (optional, can be disabled for simplicity)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE labs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Allow public access (since we use anon key)
CREATE POLICY "Allow public read users" ON users FOR SELECT USING (true);
CREATE POLICY "Allow public insert users" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update users" ON users FOR UPDATE USING (true);
CREATE POLICY "Allow public delete users" ON users FOR DELETE USING (true);

CREATE POLICY "Allow public all labs" ON labs FOR ALL USING (true);
CREATE POLICY "Allow public all tests" ON tests FOR ALL USING (true);
CREATE POLICY "Allow public all samples" ON samples FOR ALL USING (true);
CREATE POLICY "Allow public all reports" ON reports FOR ALL USING (true);
CREATE POLICY "Allow public all events" ON events FOR ALL USING (true);