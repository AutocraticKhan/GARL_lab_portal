-- ============================================================
-- STANDALONE SQL: Create saved_reports table in Supabase
-- Copy and paste this into Supabase SQL Editor and Run
-- ============================================================

-- Create the saved_reports table
CREATE TABLE IF NOT EXISTS saved_reports (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,          -- full submission ID e.g. "26-07-AAS-1041"
  report_type TEXT NOT NULL,            -- 'pnac' or 'qscert'
  report_number TEXT NOT NULL,          -- "26-07-AAS-1041-P" or "26-07-AAS-1041"
  report_issue_date TEXT,
  customer_name TEXT DEFAULT '',
  sample_count INTEGER DEFAULT 0,
  sample_location TEXT DEFAULT '',
  sample_receiving_date TEXT,
  sample_description TEXT DEFAULT '',
  sample_analysis_date TEXT,
  method_used TEXT DEFAULT '',
  temperature_humidity TEXT DEFAULT '',
  unit TEXT DEFAULT 'ppm',
  lab_id TEXT DEFAULT '',
  lab_name TEXT DEFAULT '',
  lab_code TEXT DEFAULT '',
  test_name TEXT DEFAULT '',
  test_code TEXT DEFAULT '',
  elements JSONB DEFAULT '[]',          -- ["Au","Ag","Cu",...]
  sample_ids JSONB DEFAULT '[]',        -- ["26-07-AAS-1041-001",...]
  data_points JSONB DEFAULT '[]',       -- [{sample_id, sample_label, element, value}, ...]
  engineer_id TEXT DEFAULT '',
  engineer_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(submission_id, report_type)
);

-- Enable Row Level Security
ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;

-- Allow public access (matching existing tables, since we use anon key)
CREATE POLICY "Allow public all saved_reports" ON saved_reports FOR ALL USING (true);

-- ============================================================
-- That's it! The table is ready to use.
-- The app will automatically save and load report data.
-- ============================================================