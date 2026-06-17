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
    console.warn('[SUPABASE] Supabase client library not loaded. Using localStorage fallback.');
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
    return null;
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
    return false;
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
    return false;
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
      .from('users')
      .select('id', { count: 'exact', head: true })
      .limit(1);
    const latency = Math.round(performance.now() - start);

    if (error) {
      return {
        connected: false,
        message: `Query failed after ${latency}ms`,
        error: {
          message: error.message,
          details: error.details || null,
          hint: error.hint || null,
          code: error.code || null
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
