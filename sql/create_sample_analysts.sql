-- ============================================================
-- STANDALONE SQL: Create sample_analysts table in Supabase
-- Copy and paste this into Supabase SQL Editor and Run
-- (Run this BEFORE deploying the toggle-with-analyst JS.)
-- ============================================================
-- Tracks WHICH logged-in user toggled each sample of a submission
-- from Received to In Progress (the "analyst"):
--   * Top button    — claims every not-yet-claimed sample of the
--                     submission for the current user.
--   * Sample button — claims (or releases) only that one sample.
--
-- Permission model (one row per sample, UNIQUE sample_id):
--   * status = 'in_progress' → sample is being analysed by analyst_*
--   * status = 'received'    → analyst released their OWN sample back
--                              to Received; analyst_* still records who
--                              claimed it (no other user may claim it)
--   * no row                 → sample never toggled; ANY user may claim
--                              it and their name is recorded
--
-- Permission rules are enforced by the app (js/lab-engineer.js):
--   1. Toggle to In Progress allowed only when NO row exists for the
--      sample, or the existing row belongs to the current user.
--   2. Toggle back to Received allowed only when analyst_id = current user.
--   3. All other users: button hidden / action rejected for that sample.
-- ============================================================

CREATE TABLE IF NOT EXISTS sample_analysts (
  id TEXT PRIMARY KEY,                          -- client: generateId('ana')
  sample_id TEXT NOT NULL UNIQUE REFERENCES samples(id) ON DELETE CASCADE,
  submission_id TEXT NOT NULL,                  -- full submission ID e.g. "26-07-AAS-1041"
  analyst_id TEXT NOT NULL,                     -- users.id of the logged-in user who claimed it
  analyst_name TEXT NOT NULL,                   -- users.full_name snapshot at claim time
  status TEXT NOT NULL DEFAULT 'in_progress'
         CHECK (status IN ('in_progress', 'received')),
  toggled_at TIMESTAMPTZ DEFAULT NOW(),         -- last time the toggle changed
  created_at TIMESTAMPTZ DEFAULT NOW(),         -- when the sample was first claimed
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lookup indexes: fetch a submission's analysts, or a user's claims
CREATE INDEX IF NOT EXISTS sample_analysts_submission_id_idx
  ON sample_analysts (submission_id);
CREATE INDEX IF NOT EXISTS sample_analysts_analyst_id_idx
  ON sample_analysts (analyst_id);

-- Enable Row Level Security
ALTER TABLE sample_analysts ENABLE ROW LEVEL SECURITY;

-- Allow public access (matching existing tables, since we use anon key)
DROP POLICY IF EXISTS "Allow public all sample_analysts" ON sample_analysts;
CREATE POLICY "Allow public all sample_analysts" ON sample_analysts FOR ALL USING (true);

-- ============================================================
-- OPTIONAL but recommended: server-side guard. The public RLS policy
-- lets anyone write, so this trigger is the only DB-level protection:
-- an UPDATE can never re-assign a sample to a different analyst
-- (releases only flip status back to 'received'). Inserts are
-- untouched, so the first claim wins. Idempotent — safe to re-run.
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_analyst_reassign()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sample_id    IS DISTINCT FROM OLD.sample_id    OR
     NEW.analyst_id   IS DISTINCT FROM OLD.analyst_id   OR
     NEW.analyst_name IS DISTINCT FROM OLD.analyst_name THEN
    RAISE EXCEPTION
      'sample % is claimed by % (%); analyst cannot be changed',
      OLD.sample_id, OLD.analyst_name, OLD.analyst_id;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sample_analysts_no_reassign ON sample_analysts;
CREATE TRIGGER sample_analysts_no_reassign
  BEFORE UPDATE ON sample_analysts
  FOR EACH ROW EXECUTE FUNCTION prevent_analyst_reassign();

-- ============================================================
-- That's it! The table is ready to use.
-- ============================================================

-- Optional: verify the table exists
-- SELECT * FROM sample_analysts;

-- Optional: analysts of one submission, e.g. "26-07-AAS-1041"
-- SELECT sample_id, analyst_name, status, toggled_at
--   FROM sample_analysts
--  WHERE submission_id = '26-07-AAS-1041'
--  ORDER BY created_at;
