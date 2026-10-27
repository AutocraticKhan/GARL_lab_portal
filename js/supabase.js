/* ============================================================
   supabase.js — Supabase client configuration
   ============================================================ */

'use strict';

// ── Supabase Configuration ───────────────────────────────────
// Project URL — not secret (it is visible in every network request).
const SUPABASE_URL = 'https://dtpbxpegapvatzxdjnjq.supabase.co';

// ── Obfuscated publishable (anon) key ────────────────────────
// The key is stored XOR-encrypted (base64) and decoded synchronously
// once at load, so it is never readable in plain text in this source
// and every existing consumer (createClient, health check, …) keeps
// working unchanged.
//
// To re-encode after rotating the key in Supabase → Settings → API:
//   node tools/generate_key_blob.js "<NEW_KEY>"
const _KEY_B64 = 'QgY5Fk1RW1gRW1hSXlZuVSdVNlVQbEYiQkkIN0x1RgRXflxgRWwcCzY1JWsLfg==';
const _KEY_PASS_FRAGMENTS = ['1dff8371', 'b3902313', 'dda8c51f'];

function _decodeSupabaseKey() {
  const pass = _KEY_PASS_FRAGMENTS.join('');
  const bin = atob(_KEY_B64);
  let out = '';
  for (let i = 0; i < bin.length; i++) {
    out += String.fromCharCode(bin.charCodeAt(i) ^ (pass.charCodeAt(i % pass.length) & 0xff));
  }
  return out;
}

const SUPABASE_ANON_KEY = _decodeSupabaseKey();

// ── Supabase client (loaded from CDN in index.html) ──────────
let supabaseClient = null;

function initSupabase() {
  if (typeof supabase === 'undefined') {
    console.warn('[SUPABASE] Supabase client library not loaded.');
    return null;
  }
  try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('[SUPABASE] Client initialized successfully.');
    return supabaseClient;
  } catch (err) {
    console.error('[SUPABASE] Failed to initialize client:', err);
    return null;
  }
}

// ── Generic Supabase CRUD helpers ────────────────────────────
// Supabase/PostgREST caps one response at `max-rows` (1000 by default).
// Fetch in pages so large tables (samples, events) are never truncated —
// a truncated list makes newly logged samples silently disappear.
const SUPABASE_PAGE_SIZE = 1000;
const SUPABASE_MAX_PAGES = 200; // safety valve (~200k rows)

// Primary-key columns that aren't named `id`.
const TABLE_ORDER_COLUMNS = {
  submissions: 'submissionId',
  system_state: 'key',
};

async function supabaseFetch(table) {
  if (!supabaseClient) return null;
  try {
    const orderCol = TABLE_ORDER_COLUMNS[table] || 'id';
    const rows = [];
    for (let page = 0; page < SUPABASE_MAX_PAGES; page++) {
      const from = page * SUPABASE_PAGE_SIZE;
      const to = from + SUPABASE_PAGE_SIZE - 1;
      const { data, error } = await supabaseClient
        .from(table)
        .select('*')
        .order(orderCol, { ascending: true })
        .range(from, to);
      if (error) throw error;
      const batch = data || [];
      rows.push(...batch);
      if (batch.length < SUPABASE_PAGE_SIZE) break; // last page
    }
    return rows;
  } catch (err) {
    console.error(`[SUPABASE] Error fetching ${table}:`, err);
    throw err; // Re-throw so callers can handle errors
  }
}

async function supabaseUpsert(table, records, onConflict = 'id') {
  if (!supabaseClient) return false;
  if (!Array.isArray(records)) records = [records];
  if (records.length === 0) return true;
  try {
    const { error } = await supabaseClient
      .from(table)
      .upsert(records, { onConflict, ignoreDuplicates: false });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error(`[SUPABASE] Error upserting ${table}:`, err);
    throw err; // Re-throw so callers can handle errors
  }
}

async function supabaseUpdate(table, id, patch) {
  if (!supabaseClient) return false;
  try {
    const { error } = await supabaseClient
      .from(table)
      .update(patch)
      .eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error(`[SUPABASE] Error updating ${table}:`, err);
    throw err;
  }
}

async function supabaseDelete(table, id) {
  if (!supabaseClient) return false;
  try {
    const { error } = await supabaseClient.from(table).delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error(`[SUPABASE] Error deleting from ${table}:`, err);
    throw err;
  }
}

async function supabaseFindOne(table, column, value) {
  if (!supabaseClient) return null;
  try {
    const { data, error } = await supabaseClient
      .from(table)
      .select('*')
      .eq(column, value)
      .limit(1);
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  } catch (err) {
    console.error(`[SUPABASE] Error finding in ${table}:`, err);
    throw err;
  }
}

// ── Connection health check ───────────────────────────────────
// Login-independent probe: hits an endpoint that only requires the
// publishable API key — no table rows, no RLS, no user session.
// NOTE: the PostgREST root (/rest/v1/) answers 401 "Secret API key
// required" on this project, so we probe the GoTrue health endpoint
// instead, which returns 200 with just the publishable key.
async function checkSupabaseConnection() {
  // Ensure client is initialized
  if (!supabaseClient) {
    const initialized = initSupabase();
    if (!initialized) {
      return {
        connected: false,
        message: 'Supabase client library not loaded or initialization failed.',
        error: { message: 'initSupabase() returned null. Check console for details.' }
      };
    }
  }

  try {
    // Probe the auth API itself — works before login, exposes no data
    const start = performance.now();
    const res = await fetch(SUPABASE_URL + '/auth/v1/health', {
      headers: { apikey: SUPABASE_ANON_KEY }
    });
    const latency = Math.round(performance.now() - start);

    if (!res.ok) {
      // Surface the gateway's error body when present (e.g.
      // "Invalid API key") so the UI shows more than a bare HTTP code.
      let body = null;
      try { body = await res.json(); } catch (_) { /* non-JSON body */ }
      return {
        connected: false,
        message: `Query failed after ${latency}ms`,
        error: {
          message: (body && body.message) || 'HTTP ' + res.status,
          details: (body && body.details) || null,
          hint: (body && body.hint) || null,
          code: (body && body.code) || null
        }
      };
    }

    return {
      connected: true,
      message: `Connected successfully (${latency}ms)`,
      error: null
    };
  } catch (err) {
    return {
      connected: false,
      message: 'Connection error — network or runtime failure',
      error: {
        message: err.message || String(err),
        details: err.details || null,
        hint: err.hint || null,
        code: err.code || null
      }
    };
  }
}

// ── User authentication via Supabase ──────────────────────────
// Two login paths, tried in order:
//   1. Supabase Auth (GoTrue) — accounts created in the Supabase dashboard
//      under Authentication → Users (secure, hashed passwords). Auth users
//      follow the email convention `<username>@AUTH_EMAIL_DOMAIN`, so the
//      login form keeps accepting either the plain username or the full
//      email address.
//   2. Legacy `users` table check (plaintext password) — the existing
//      arrangement, kept unchanged so every current account keeps working
//      while users are migrated to Supabase Auth one by one.
const AUTH_EMAIL_DOMAIN = '@garl.local';

function _authEmailCandidates(username) {
  const raw = String(username || '').trim().toLowerCase();
  if (!raw) return [];
  return raw.includes('@') ? [raw] : [raw + AUTH_EMAIL_DOMAIN];
}

function _authProfileError(message) {
  const err = new Error(message);
  err.supabaseAuth = true; // rethrown as-is by supabaseLogin()
  return err;
}

async function trySupabaseAuthLogin(username, password) {
  if (!supabaseClient || !supabaseClient.auth ||
      typeof supabaseClient.auth.signInWithPassword !== 'function') {
    return null; // Auth API unavailable — fall through to the legacy path
  }

  const candidates = _authEmailCandidates(username);
  for (const email of candidates) {
    let data = null;
    let error = null;
    try {
      ({ data, error } = await supabaseClient.auth.signInWithPassword({ email, password }));
    } catch (err) {
      // Network/runtime failure talking to GoTrue — let the legacy path try.
      console.warn('[SUPABASE] Auth sign-in attempt failed:', err && err.message);
      return null;
    }

    if (error || !data || !data.user) {
      if (error && error.code === 'email_not_confirmed') {
        throw _authProfileError('Please confirm your email address before signing in.');
      }
      // Invalid credentials (or unknown user) — try next candidate, then legacy path.
      console.log('[SUPABASE] Auth path did not match for', email, '→', (error && error.message) || 'no user');
      continue;
    }

    // ── Signed in via Supabase Auth — build the standard session ──
    const authUser = data.user;
    const meta = authUser.user_metadata || {};

    // Link to the profile row while it still exists, so id / role /
    // full_name / active behave EXACTLY like the current admin account.
    // Once the legacy row is deleted, the metadata above becomes the
    // source of truth for the profile.
    const profileUsername = String(meta.username || email.split('@')[0] || '').toLowerCase().trim();
    let row = null;
    if (profileUsername) {
      try { row = await supabaseFindOne('users', 'username', profileUsername); }
      catch (_) { row = null; }
    }

    const role = (row && row.role) || meta.role;
    if (!role) {
      throw _authProfileError('Your account has no role yet. Ask an administrator to provision it.');
    }

    const isActive = row
      ? (row.active === true || row.active === 'true')
      : (meta.active !== false && meta.active !== 'false');
    if (!isActive) {
      throw _authProfileError('Account is disabled. Contact administrator.');
    }

    return {
      id:        (row && row.id)        || authUser.id,
      username:  (row && row.username)  || meta.username || profileUsername,
      role:      role,
      lab_id:    (row ? (row.lab_id || null) : (meta.lab_id || null)),
      full_name: (row && row.full_name) || meta.full_name || profileUsername,
    };
  }
  return null;
}

async function supabaseLogin(username, password) {
  if (!supabaseClient) {
    throw new Error('Database not connected. Please try again later.');
  }

  try {
    // Path 1 — Supabase Auth (GoTrue): matches migrated accounts first.
    const authSession = await trySupabaseAuthLogin(username, password);
    if (authSession) return authSession;

    // Path 2 — legacy users-table check (current arrangement, unchanged).
    const user = await supabaseFindOne('users', 'username', username.toLowerCase().trim());
    if (!user) {
      throw new Error('Invalid username or password.');
    }

    // Check if user is active
    const isActive = user.active === true || user.active === 'true';
    if (!isActive) {
      throw new Error('Account is disabled. Contact administrator.');
    }

    // Verify password (plaintext comparison for now — same as before)
    if (user.password !== password) {
      throw new Error('Invalid username or password.');
    }

    return {
      id:        user.id,
      username:  user.username,
      role:      user.role,
      lab_id:    user.lab_id || null,
      full_name: user.full_name,
    };
  } catch (err) {
    if (err.supabaseAuth ||
        err.message === 'Invalid username or password.' ||
        err.message === 'Account is disabled. Contact administrator.') {
      throw err;
    }
    // Network or DB error
    console.error('[SUPABASE] Login error:', err);
    throw new Error('Database error — please try again.');
  }
}
