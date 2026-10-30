-- ============================================================
-- STANDALONE SQL: Create mu_sample_masses table in Supabase
-- Copy and paste this into Supabase SQL Editor and Run
-- (Run this BEFORE using the MU sheet's Save button.)
-- ============================================================

-- One row per sample x element: the noted "Mass of Sample Taken (g)"
-- column of the MU sheet.
CREATE TABLE IF NOT EXISTS mu_sample_masses (
  id TEXT PRIMARY KEY,                -- deterministic: submission_id::sample_key::sample_label::element
  submission_id TEXT NOT NULL,        -- full submission ID e.g. "26-07-AAS-1041"
  sample_key TEXT DEFAULT '',         -- report row's dataset.sampleId
  sample_label TEXT DEFAULT '',       -- Sample ID shown on the sheet
  element TEXT DEFAULT '',            -- "Au", "Ag", ... ("Result" when unnamed)
  mass_g NUMERIC(10,4) NOT NULL,      -- mass of sample taken in grams (e.g. 10.1234)
  engineer_id TEXT DEFAULT '',
  engineer_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(submission_id, sample_key, sample_label, element)
);

-- Enable Row Level Security
ALTER TABLE mu_sample_masses ENABLE ROW LEVEL SECURITY;

-- Allow public access (matching existing tables, since we use anon key)
CREATE POLICY "Allow public all mu_sample_masses" ON mu_sample_masses FOR ALL USING (true);

-- ============================================================
-- That's it! The table is ready to use.
-- Open the MU sheet and press "Save" to store its data.
-- ============================================================

-- Optional: verify the table exists
-- SELECT * FROM mu_sample_masses;
