/* ============================================================
   auth.js — Authentication & session management
   ============================================================ */

'use strict';

// ── Login via Supabase ──────────────────────────────────────────
async function login(username, password) {
  console.log('[AUTH] ===== LOGIN ATTEMPT =====');
  console.log('[AUTH] Username entered:', JSON.stringify(username));

  if (!username || !password) {
    throw new Error('Please enter both username and password.');
  }

  const session = await supabaseLogin(username, password);

  // Save session to localStorage
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

  // Show the login form container, hide error state initially
  const loginForm = document.getElementById('login-form');
  const errorContainer = document.getElementById('connection-error');
  const statusContainer = document.getElementById('connection-status');
  const submitBtn = document.getElementById('login-submit');
  const demoSection = document.getElementById('demo-section');

  // Hide login form initially, show loading
  if (loginForm) loginForm.style.display = 'none';
  if (errorContainer) errorContainer.style.display = 'none';
  if (statusContainer) statusContainer.innerHTML = '<span class="spinner"></span> Checking database connection...';
  if (submitBtn) submitBtn.disabled = true;
  if (demoSection) demoSection.style.display = 'none';

  try {
    // Initialize Supabase
    const clientReady = initSupabase();
    if (!clientReady || !supabaseClient) {
      throw new Error('Supabase client could not be initialized.');
    }

    // Check connection
    const health = await checkSupabaseConnection();
    
    if (health.connected) {
      console.log('[AUTH] Connection OK. Latency:', health.message);
      if (statusContainer) statusContainer.innerHTML = '✅ Connected to database';
      
      // Load initial DB data (users for login)
      await initDB();
      
      // Show the login form
      if (loginForm) loginForm.style.display = '';
      if (submitBtn) submitBtn.disabled = false;
      if (statusContainer) statusContainer.style.display = 'none';
    } else {
      // Connection failed — show error
      console.error('[AUTH] Connection FAILED:', health.error);
      if (statusContainer) statusContainer.style.display = 'none';
      if (errorContainer) {
        errorContainer.style.display = 'block';
        errorContainer.innerHTML = `
          <div class="alert alert-error">
            <strong>⚠️ Unable to connect to database</strong>
            <p>${health.error?.message || health.message || 'Unknown connection error'}</p>
            <p style="font-size:0.85rem;margin-top:0.5rem;">
              Please ensure the Supabase database is running and accessible.
              <br>Check your internet connection and try again later.
            </p>
            <button class="btn btn-sm" onclick="location.reload()">Retry Connection</button>
          </div>
        `;
      }
      return;
    }
  } catch (e) {
    console.error('[AUTH] init error:', e);
    if (statusContainer) statusContainer.style.display = 'none';
    if (errorContainer) {
      errorContainer.style.display = 'block';
      errorContainer.innerHTML = `
        <div class="alert alert-error">
          <strong>⚠️ Unable to connect to database</strong>
          <p>${e.message || 'Unknown connection error'}</p>
          <button class="btn btn-sm" onclick="location.reload()" style="margin-top:0.5rem;">Retry Connection</button>
        </div>
      `;
    }
    return;
  }

  // ── Wire form events ─────────────────────────────────────────
  async function handleLogin() {
    console.log('[AUTH] handleLogin() called');

    const errEl    = document.getElementById('login-error');
    
    // Robust input value queries
    const usernameEl = loginForm.querySelector('[name="username"]') || document.getElementById('username');
    const passwordEl = loginForm.querySelector('[name="password"]') || document.getElementById('password');
    const username = usernameEl ? usernameEl.value : '';
    const password = passwordEl ? passwordEl.value : '';

    if (!username || !password) {
      if (errEl) errEl.textContent = 'Please enter both username and password.';
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Signing in…';
    }
    if (errEl) errEl.textContent = '';

    try {
      const session = await login(username, password);
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
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Sign In';
        }
      }
    } catch (err) {
      console.error('[AUTH] Login failed:', err.message);
      if (errEl) errEl.textContent = err.message;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Sign In';
      }
    }
  }

  // Primary: form submit event (catches Enter key in inputs)
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[AUTH] Form submitted!');
    handleLogin();
  });

  // Fallback: direct click on the submit button (ensures click always works)
  if (submitBtn) {
    submitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[AUTH] Submit button clicked (fallback handler)!');
      handleLogin();
    });
  }

  console.log('[AUTH] initLoginPage() complete — ready for input');
}