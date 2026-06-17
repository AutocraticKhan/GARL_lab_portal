/* ============================================================
   supabase.js — Supabase client configuration
   ============================================================ */

'use strict';

// ── Supabase Configuration ───────────────────────────────────
// Replace these with your actual Supabase project credentials
const SUPABASE_URL = 'https://dtpbxpegapvatzxdjnjq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_fC1Wm3YwDs-nQtFq55MePw_-8RQDShK';

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
async function supabaseFetch(table) {
  if (!supabaseClient) return null;
  try {
    const { data, error } = await supabaseClient.from(table).select('*');
    if (error) throw error;
    return data;
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
    // Perform a lightweight query to verify connectivity
    const start = performance.now();
    const { data, error, count } = await supabaseClient
      .from('system_state')
      .select('key', { count: 'exact', head: true })
      .limit(1);
    const latency = Math.round(performance.now() - start);

    if (error) {
      // Try fallback: check if any table exists by trying 'users'
      const fallbackCheck = await supabaseClient
        .from('users')
        .select('id', { count: 'exact', head: true })
        .limit(1);

      if (fallbackCheck.error) {
        return {
          connected: false,
          message: `Query failed after ${latency}ms`,
          error: {
            message: fallbackCheck.error.message,
            details: fallbackCheck.error.details || null,
            hint: fallbackCheck.error.hint || null,
            code: fallbackCheck.error.code || null
          }
        };
      }
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