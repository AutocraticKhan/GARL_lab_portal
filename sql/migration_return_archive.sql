-- ============================================================
-- GARL Minerals Lab Portal — Return / Review / Archive workflow
-- Run this in the Supabase SQL Editor BEFORE deploying the new JS.
--
-- Adds two sample statuses:
--   'returned'  → lab engineer sent the sample back to reception
--   'archived'  → reception closed the sample without analysis
--                 (counted as "completed" in the progress report,
--                  but no analytical report is generated for it)
--
-- Also adds the audit columns the app writes when performing these
-- transitions, and a staleness flag for saved report data.
-- ============================================================

-- 1) Drop any existing CHECK constraint on samples.status (name-agnostic)
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'samples'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE samples DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- 2) Re-create the CHECK constraint including the new statuses
ALTER TABLE samples ADD CONSTRAINT samples_status_check
  CHECK (status IN ('received', 'assigned', 'in_progress', 'completed', 'returned', 'archived'));

-- 3) Audit / workflow columns
--    returned_at + archived_at are required because setSampleStatus() writes
--    a "<status>_at" timestamp column for every status change.
ALTER TABLE samples ADD COLUMN IF NOT EXISTS returned_at    TIMESTAMPTZ;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS archived_at    TIMESTAMPTZ;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS return_reason  TEXT DEFAULT '';
ALTER TABLE samples ADD COLUMN IF NOT EXISTS returned_by    TEXT DEFAULT '';
ALTER TABLE samples ADD COLUMN IF NOT EXISTS return_count   INTEGER DEFAULT 0;
ALTER TABLE samples ADD COLUMN IF NOT EXISTS archive_reason TEXT DEFAULT '';
ALTER TABLE samples ADD COLUMN IF NOT EXISTS archived_by    TEXT DEFAULT '';

-- 4) Saved report data becomes stale when reception edits/resubmits a sample
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS is_stale BOOLEAN DEFAULT false;

-- 5) Quick verification (optional)
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conrelid = 'samples'::regclass AND contype = 'c';