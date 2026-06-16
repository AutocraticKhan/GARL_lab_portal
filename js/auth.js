/* ============================================================
   auth.js — Authentication & session management
   ============================================================ */

'use strict';

// ── Login ─────────────────────────────────────────────────────
function login(username, password) {
  console.log('[AUTH] ===== LOGIN ATTEMPT =====');
  console.log('[AUTH] Username entered:', JSON.stringify(username));
  console.log('[AUTH] Password entered:', JSON.stringify(password));
  console.log('[AUTH] DB.users available:', Array.isArray(DB.users), '| count:', DB.users ? DB.users.length : 'undefined');

  if (!DB.users || DB.users.length === 0) {
    console.error('[AUTH] FATAL: DB.users is empty or undefined! initDB may have failed.');
    throw new Error('Database not loaded. Please click "Reset Database" and try again.');
  }

  // Log all users to help debug
  console.log('[AUTH] All users in DB:');
  if (Array.isArray(DB.users)) {
    DB.users.forEach((u, i) => {
      console.log(`[AUTH]   [${i}] username="${u.username}" password="${u.password}" active=${u.active} role=${u.role}`);
    });
  }

  const normalizedInput = (username || '').trim().toLowerCase();
  const user = (DB.users || []).find(u => {
    if (!u || !u.username) return false;
    const isActive = u.active === true || u.active === 'true' || u.active === undefined;
    const match = u.username.toLowerCase() === normalizedInput && isActive;
    console.log(`[AUTH]   Checking "${u.username}" active=${u.active} (isActive=${isActive}) → match=${match}`);
    return match;
  });

  if (!user) {
    console.error('[AUTH] No matching user found for username:', normalizedInput);
    throw new Error('Invalid username or password.');
  }

  console.log('[AUTH] Found user:', user.username, '| stored password:', JSON.stringify(user.password));

  if (!user.password) {
    console.error('[AUTH] User has no password field! User object:', JSON.stringify(user));
    throw new Error('User account has no password set. Contact admin.');
  }

  if (password !== user.password) {
    console.error('[AUTH] Password mismatch!');
    console.error('[AUTH]   Entered  :', JSON.stringify(password));
    console.error('[AUTH]   Stored   :', JSON.stringify(user.password));
    throw new Error('Invalid username or password.');
  }

  console.log('[AUTH] Password matched! Creating session...');

  const session = {
    id:        user.id,
    username:  user.username,
    role:      user.role,
    lab_id:    user.lab_id || null,
    full_name: user.full_name,
  };

  localStorage.setItem('garl_session', JSON.stringify(session));
  console.log('[AUTH] Session saved:', JSON.stringify(session));
  return session;
}

// ── Logout ────────────────────────────────────────────────────
function logout() {
  console.log('[AUTH] Logging out — clearing session only');
  localStorage.removeItem('garl_session');
  window.location.href = '../index.html';
}

// ── Get current user from localStorage ───────────────────────
function currentUser() {
  try {
    // Fallback: check query parameter first (crucial for file:// protocol)
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get('session');
    if (sessionParam) {
      const parsed = JSON.parse(decodeURIComponent(sessionParam));
      // Try to save to localStorage as well in case it's supported
      try { localStorage.setItem('garl_session', JSON.stringify(parsed)); } catch (err) {}
      return parsed;
    }

    const raw = localStorage.getItem('garl_session');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// ── Auth Guard ────────────────────────────────────────────────
function requireAuth(allowedRoles) {
  const session = currentUser();
  if (!session) {
    console.warn('[AUTH] No session found, redirecting to login.');
    window.location.href = '../index.html';
    return null;
  }
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (roles.length && !roles.includes(session.role)) {
    console.warn('[AUTH] Role mismatch. Session role:', session.role, '| Required:', roles);
    
    // Maintain query parameter if on file:// protocol to avoid losing session during invalid transitions
    const sessionStr = window.location.protocol === 'file:' ? `?session=${encodeURIComponent(JSON.stringify(session))}` : '';
    window.location.href = '../index.html' + sessionStr;
    return null;
  }
  return session;
}

// ── Render user info into sidebar ─────────────────────────────
function renderSidebarUser() {
  const session = currentUser();
  if (!session) return;
  const nameEl   = document.getElementById('sidebar-user-name');
  const roleEl   = document.getElementById('sidebar-user-role');
  const avatarEl = document.getElementById('sidebar-user-avatar');
  if (nameEl)   nameEl.textContent   = session.full_name;
  if (roleEl)   roleEl.textContent   = session.role.replace('_', ' ');
  if (avatarEl) avatarEl.textContent = initials(session.full_name);
}

// ── Wire logout buttons ───────────────────────────────────────
function wireLogout() {
  document.querySelectorAll('[data-action="logout"]').forEach(btn => {
    btn.addEventListener('click', logout);
  });
}

// ── Login page init ───────────────────────────────────────────
async function initLoginPage() {
  console.log('[AUTH] initLoginPage() called');

  try {
    await initDB();
    console.log('[AUTH] initDB() done. Users:', DB.users.length, '| Labs:', DB.labs.length);
  } catch (e) {
    console.error('[AUTH] initDB() threw an error:', e);
  }

  const form = document.getElementById('login-form');
  if (!form) {
    console.error('[AUTH] login-form element NOT FOUND in DOM!');
    return;
  }
  console.log('[AUTH] login-form found, attaching submit handler');

  // Shared login logic
  function handleLogin() {
    console.log('[AUTH] handleLogin() called');

    const errEl    = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit');
    
    // Robust input value queries
    const usernameEl = form.querySelector('[name="username"]') || document.getElementById('username');
    const passwordEl = form.querySelector('[name="password"]') || document.getElementById('password');
    const username = usernameEl ? usernameEl.value : '';
    const password = passwordEl ? passwordEl.value : '';

    console.log('[AUTH] Values read — username:', JSON.stringify(username), '| password:', JSON.stringify(password));

    if (!username || !password) {
      console.warn('[AUTH] Empty username or password');
      if (errEl) errEl.textContent = 'Please enter both username and password.';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Signing in…';
    if (errEl) errEl.textContent = '';

    try {
      const session = login(username, password);
      const redirects = {
        admin:        'pages/admin-dashboard.html',
        receptionist: 'pages/receptionist-dashboard.html',
        lab_engineer: 'pages/lab-dashboard.html',
      };
      const dest = redirects[session.role];
      console.log('[AUTH] Login successful! Redirecting to:', dest);
      if (dest) {
        // Append session to URL query parameter if running on file:// protocol
        const sessionStr = window.location.protocol === 'file:' ? `?session=${encodeURIComponent(JSON.stringify(session))}` : '';
        window.location.href = dest + sessionStr;
      } else {
        if (errEl) errEl.textContent = 'Unknown role. Contact admin.';
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Sign In';
      }
    } catch (err) {
      console.error('[AUTH] Login failed:', err.message);
      if (errEl) errEl.textContent = err.message;
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Sign In';
    }
  }

  // Primary: form submit event (catches Enter key in inputs)
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[AUTH] Form submitted!');
    handleLogin();
  });

  // Fallback: direct click on the submit button (ensures click always works)
  const submitBtn = document.getElementById('login-submit');
  if (submitBtn) {
    submitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[AUTH] Submit button clicked (fallback handler)!');
      handleLogin();
    });
  }

  // Wire demo buttons
  document.querySelectorAll('[data-demo]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [user, pass] = btn.dataset.demo.split(':');
      const usernameEl = form.querySelector('[name="username"]') || document.getElementById('username');
      const passwordEl = form.querySelector('[name="password"]') || document.getElementById('password');
      if (usernameEl) usernameEl.value = user;
      if (passwordEl) passwordEl.value = pass;
      console.log('[AUTH] Demo credentials filled:', user);
    });
  });

  console.log('[AUTH] initLoginPage() complete — ready for input');
}