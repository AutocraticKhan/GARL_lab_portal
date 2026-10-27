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
async function supabaseLogin(username, password) {
  if (!supabaseClient) {
    throw new Error('Database not connected. Please try again later.');
  }

  try {
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
    if (err.message === 'Invalid username or password.' || err.message === 'Account is disabled. Contact administrator.') {
      throw err;
    }
    // Network or DB error
    console.error('[SUPABASE] Login error:', err);
    throw new Error('Database error — please try again.');
  }
}