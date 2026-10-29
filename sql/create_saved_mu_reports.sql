-- ============================================================
-- STANDALONE SQL: Create saved_mu_reports table in Supabase
-- Copy and paste this into Supabase SQL Editor and Run
-- (Run this BEFORE using the MU report's Save button.)
-- ============================================================

-- One row per submission's Measurement Uncertainty (MU) report.
-- Self-contained: the meta table, the parameters and every row's
-- RSD / computed uncertainty are stored so the report can be rebuilt.
CREATE TABLE IF NOT EXISTS saved_mu_reports (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,          -- full submission ID e.g. "26-07-AAS-1041"
  report_type TEXT NOT NULL DEFAULT 'mu',
  report_number TEXT NOT NULL DEFAULT '',
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
  mu_params JSONB DEFAULT '{}',         -- {rbar, sR, n, uCert, k}
  mu_rows JSONB DEFAULT '[]',           -- [{no, sample_key, sample_label, element,
                                        --   value, value_num, rsd, uc_rel,
                                        --   u_value, corrected_result}, ...]
  engineer_id TEXT DEFAULT '',
  engineer_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_stale BOOLEAN DEFAULT false,       -- true when reception edited/resubmitted the submission
  UNIQUE(submission_id, report_type)
);

-- Enable Row Level Security
ALTER TABLE saved_mu_reports ENABLE ROW LEVEL SECURITY;

-- Allow public access (matching existing tables, since we use anon key)
CREATE POLICY "Allow public all saved_mu_reports" ON saved_mu_reports FOR ALL USING (true);

-- ============================================================
-- That's it! The table is ready to use.
-- Open the MU report and press "Save" to store its data.
-- ============================================================

-- Optional: verify the table exists
-- SELECT * FROM saved_mu_reports;
