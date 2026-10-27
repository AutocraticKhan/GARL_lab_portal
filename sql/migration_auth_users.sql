-- ============================================================
-- Auth-managed users (Supabase Auth provisioning from the
-- admin dashboard via the create-auth-user Edge Function).
--
-- Additive only — safe to run on a live database.
-- RUN THIS BEFORE deploying the Edge Function / updated admin.js,
-- otherwise creating a user fails with a missing-column error.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_uid TEXT DEFAULT '';
