// ============================================================
// create-auth-user — provision / update portal accounts in
// Supabase Auth (GoTrue) from the admin dashboard.
//
// SECURITY:
//   * Requires a REAL GoTrue session whose owner is an admin.
//     Legacy localStorage sessions are client-forgeable, so they
//     are rejected with a clear 401 message.
//   * Uses SUPABASE_SERVICE_ROLE_KEY stored as an Edge Function
//     secret — never shipped to the browser.
//
// Actions (JSON body, POST):
//   { "action": "create", "username", "password", "role",
//     "full_name", "lab_id" }
//       -> 200 { "uid", "email" }
//   { "action": "update", "auth_uid", "username", "role",
//     "full_name", "lab_id", "password"? }
//       -> 200 { "ok": true }
//
// Deploy order (see redme.txt): run sql/migration_auth_users.sql,
// set the SUPABASE_SERVICE_ROLE_KEY secret, then deploy this file
// as the function named `create-auth-user`.
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_ROLES = ["admin", "receptionist", "lab_engineer"];
// Keep in sync with AUTH_EMAIL_DOMAIN in js/supabase.js
const EMAIL_DOMAIN = "@garl.local";
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,38}[a-z0-9]$/;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeProfile(payload) {
  return {
    username: String(payload.username ?? "").trim().toLowerCase(),
    role: String(payload.role ?? "").trim(),
    full_name: String(payload.full_name ?? "").trim(),
    lab_id: String(payload.lab_id ?? "").trim() || "",
  };
}

function validateProfile(p) {
  if (!USERNAME_RE.test(p.username)) {
    return "Username must be 3-40 characters: lowercase letters, digits, dot, underscore or hyphen.";
  }
  if (!VALID_ROLES.includes(p.role)) return "Invalid role.";
  if (!p.full_name) return "Full name is required.";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json(500, { error: "Server not configured: SUPABASE_SERVICE_ROLE_KEY secret is missing." });
    }

    // ---- 1. Verify the CALLER is an admin (real GoTrue session) ----
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return json(401, { error: "Authentication required. Sign in with an Auth-managed admin account to manage users." });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // getUser(token) validates any user's access token against GoTrue.
    // (An anon key or garbage passed as Bearer fails here -> 401.)
    const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !callerData || !callerData.user) {
      return json(401, { error: "Your login is not managed by Supabase Auth. Sign in with an Auth-managed admin account to manage users." });
    }
    const callerMeta = callerData.user.user_metadata || {};
    // Mirror the portal login: users created without metadata link via the
    // email local part (admin@garl.local -> "admin").
    const callerUsername = String(callerMeta.username || String(callerData.user.email || "").split("@")[0] || "").trim().toLowerCase();

    let isAdmin = callerMeta.role === "admin";
    if (!isAdmin && callerUsername) {
      // Row is the source of truth while it exists (matches portal login rules)
      const { data: rows } = await admin
        .from("users")
        .select("role, active")
        .eq("username", callerUsername)
        .limit(1);
      const row = rows && rows[0];
      isAdmin = !!row && row.role === "admin" && row.active !== false && row.active !== "false";
    }
    if (!isAdmin) {
      return json(403, { error: "Only admin accounts can manage users." });
    }

    // ---- 2. Parse + validate payload ----
    let payload;
    try {
      payload = await req.json();
    } catch (_) {
      return json(400, { error: "Invalid JSON body." });
    }
    const action = String(payload.action || "create");
    const profile = normalizeProfile(payload);
    const invalid = validateProfile(profile);
    if (invalid) return json(400, { error: invalid });
    const email = profile.username + EMAIL_DOMAIN;

    // ---- 3a. CREATE: GoTrue account, then return its uid ----
    if (action === "create") {
      const password = String(payload.password ?? "");
      if (password.length < 6) return json(400, { error: "Password must be at least 6 characters." });

      const { data: dup } = await admin
        .from("users")
        .select("id")
        .eq("username", profile.username)
        .limit(1);
      if (dup && dup.length) return json(409, { error: "Username already exists." });

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          username: profile.username,
          role: profile.role,
          full_name: profile.full_name,
          lab_id: profile.lab_id,
          active: true,
        },
      });
      if (createErr || !created || !created.user) {
        const msg = (createErr && createErr.message) || "Unknown error";
        if (/exist/i.test(msg) || (createErr && createErr.status === 422)) {
          return json(409, { error: "An Auth account already exists for " + email + "." });
        }
        return json(500, { error: "Auth API error: " + msg });
      }
      return json(200, { uid: created.user.id, email });
    }

    // ---- 3b. UPDATE: email (follows username), metadata, optional password ----
    if (action === "update") {
      const authUid = String(payload.auth_uid || "");
      if (!authUid) return json(400, { error: "auth_uid is required for update." });
      const password = payload.password ? String(payload.password) : null;
      if (password && password.length < 6) return json(400, { error: "Password must be at least 6 characters." });

      const { data: existingRes, error: fetchErr } = await admin.auth.admin.getUserById(authUid);
      if (fetchErr || !existingRes || !existingRes.user) {
        return json(404, { error: "Linked Supabase Auth account not found. Recreate this user." });
      }
      // Merge into existing metadata so fields we do not manage (e.g.
      // active, set via the Deactivate button / dashboard) are preserved.
      const prevMeta = existingRes.user.user_metadata || {};

      const attrs = {
        email,
        email_confirm: true,
        user_metadata: {
          ...prevMeta,
          username: profile.username,
          role: profile.role,
          full_name: profile.full_name,
          lab_id: profile.lab_id,
        },
      };
      if (password) attrs.password = password;

      const { error: updErr } = await admin.auth.admin.updateUserById(authUid, attrs);
      if (updErr) {
        const msg = updErr.message || "Unknown error";
        if (/exist/i.test(msg) || updErr.status === 422) {
          return json(409, { error: "Another Auth account already uses " + email + "." });
        }
        return json(500, { error: "Auth API error: " + msg });
      }
      return json(200, { ok: true });
    }

    return json(400, { error: "Unknown action: " + action });
  } catch (err) {
    console.error("[create-auth-user] unexpected error:", err);
    return json(500, { error: "Unexpected server error." });
  }
});
