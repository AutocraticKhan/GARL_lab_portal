/* ============================================================
   reports.js — Progress Report page logic
   ============================================================ */
'use strict';

let reportSession = null;

// ── Build dynamic sidebar based on role ────────────────────────
function buildProgressSidebar(session) {
  var sidebar = document.getElementById('dynamic-sidebar');
  if (!sidebar) return;

  var isReceptionist = session && session.role === 'receptionist';
  var backDest = isReceptionist ? 'receptionist-dashboard.html' : 'admin-dashboard.html';
  var backLabel = isReceptionist ? 'Receptionist Dashboard' : 'Admin Dashboard';
  var backIcon = isReceptionist ? '➕' : '👥';
  var panelName = isReceptionist ? 'Receptionist' : 'Admin Panel';

  sidebar.innerHTML =
    '<div class="sidebar-logo">' +
      '<div class="sidebar-logo-icon">🧪</div>' +
      '<div class="sidebar-logo-text">Geoscience Advanced Research Laboratories<span>' + panelName + '</span></div>' +
    '</div>' +
    '<nav class="sidebar-nav">' +
      '<p class="sidebar-section-label">' + (isReceptionist ? 'Samples' : 'Management') + '</p>' +
      '<button class="nav-item" id="nav-back-dashboard"><span class="nav-icon">' + backIcon + '</span> <span id="nav-back-label">' + backLabel + '</span></button>' +
      '<p class="sidebar-section-label">Reports</p>' +
      '<button class="nav-item active"><span class="nav-icon">📊</span> Progress Report</button>' +
    '</nav>' +
    '<div class="sidebar-footer">' +
      '<div class="user-chip">' +
        '<div class="user-avatar" id="sidebar-user-avatar">' + initials(session.full_name) + '</div>' +
        '<div class="user-info">' +
          '<div class="user-name" id="sidebar-user-name">' + escHtml(session.full_name) + '</div>' +
          '<div class="user-role" id="sidebar-user-role">' + session.role.replace('_', ' ') + '</div>' +
        '</div>' +
      '</div>' +
      '<button class="btn btn-ghost btn-full btn-sm" data-action="logout">⎋ Sign Out</button>' +
    '</div>';

  // Wire the back-dashboard button
  var backBtn = document.getElementById('nav-back-dashboard');
  if (backBtn) {
    backBtn.onclick = function() {
      var sep = backDest.indexOf('?') === -1 ? '?' : '&';
      window.location.href = backDest + sep + 'session=' + encodeURIComponent(JSON.stringify(session || {}));
    };
  }
}

// ── Init ──────────────────────────────────────────────────────
async function initReports() {
  reportSession = requireAuth(['admin', 'receptionist']);
  if (!reportSession) return;
  await initDB();
  buildProgressSidebar(reportSession);
  wireLogout();
  populateLabFilter();
  setDefaultDateRange();
  renderReport();
  wireReportEvents();
}

// ── Wire events ───────────────────────────────────────────────
function wireReportEvents() {
  document.getElementById('btn-apply-filter').addEventListener('click', renderReport);
  document.getElementById('btn-export-report').addEventListener('click', exportReportCSV);
  document.getElementById('filter-date-start').addEventListener('change', renderReport);
  document.getElementById('filter-date-end').addEventListener('change', renderReport);
  document.getElementById('filter-lab').addEventListener('change', renderReport);
}

// ── Filters ───────────────────────────────────────────────────
function populateLabFilter() {
  const sel = document.getElementById('filter-lab');
  sel.innerHTML = '<option value="">All Labs</option>' +
    DB.labs.map(l => '<option value="' + l.id + '">' + escHtml(l.lab_name) + '</option>').join('');
}

function setDefaultDateRange() {
  const now   = new Date();
  const start = new Date(now);
  start.setDate(1); // first of current month
  document.getElementById('filter-date-start').value = start.toISOString().slice(0,10);
  document.getElementById('filter-date-end').value   = now.toISOString().slice(0,10);
}

function getFilterValues() {
  return {
    startDate: document.getElementById('filter-date-start').value,
    endDate:   document.getElementById('filter-date-end').value,
    labId:     document.getElementById('filter-lab').value,
  };
}

// ── Core aggregation ──────────────────────────────────────────
function aggregateData(filters) {
  const { startDate, endDate, labId } = filters;

  const start = startDate ? new Date(startDate + 'T00:00:00') : null;
  const end   = endDate   ? new Date(endDate   + 'T23:59:59') : null;

  const targetLabs = labId
    ? DB.labs.filter(l => l.id === labId)
    : DB.labs;

  return targetLabs.map(lab => {
    let samples = DB.samples.filter(s => s.lab_id === lab.id);

    // Date range filter on created_at
    if (start) samples = samples.filter(s => new Date(s.created_at) >= start);
    if (end)   samples = samples.filter(s => new Date(s.created_at) <= end);

    const total      = samples.length;
    const estimations = samples.reduce((sum, s) => sum + (s.elementCount || s.selectedElements?.length || 0), 0);
    const received   = samples.filter(s => s.status === 'received').length;
    const assigned   = samples.filter(s => s.status === 'assigned').length;
    const inProgress = samples.filter(s => s.status === 'in_progress').length;
    const completed  = samples.filter(s => s.status === 'completed').length;
    const pending    = received + assigned + inProgress;

    // Average turnaround: days from created_at to completed_at for completed
    const completedSamples = samples.filter(s => s.status === 'completed');
    let avgTurnaround = '—';
    let latestCompletionDate = null;
    if (completedSamples.length) {
      const total_days = completedSamples.reduce((sum, s) => {
        if (s.completed_at) {
          return sum + daysBetween(s.created_at, s.completed_at);
        }
        return sum;
      }, 0);
      const avg = (total_days / completedSamples.length).toFixed(1);
      avgTurnaround = avg + ' day' + (avg == 1 ? '' : 's');

      // Get latest completion date
      const completionDates = completedSamples.map(s => s.completed_at).filter(Boolean).sort().reverse();
      latestCompletionDate = completionDates[0] || null;
    }

    return {
      lab_id:        lab.id,
      lab_name:      lab.lab_name,
      lab_code:      lab.lab_code,
      total,
      estimations,
      received,
      assigned,
      in_progress:   inProgress,
      completed,
      pending,
      avg_turnaround: avgTurnaround,
      latest_completion: latestCompletionDate,
    };
  });
}

// ── Render everything ─────────────────────────────────────────
function renderReport() {
  const filters = getFilterValues();
  const rows    = aggregateData(filters);

  // Summary stats
  const totals = rows.reduce((acc, r) => {
    acc.total       += r.total;
    acc.estimations += r.estimations;
    acc.pending     += r.pending;
    acc.completed   += r.completed;
    acc.inProgress  += r.in_progress;
    return acc;
  }, { total: 0, estimations: 0, pending: 0, completed: 0, inProgress: 0 });

  document.getElementById('summary-total').textContent      = totals.total;
  document.getElementById('summary-estimations').textContent = totals.estimations.toLocaleString();
  document.getElementById('summary-pending').textContent    = totals.pending;
  document.getElementById('summary-progress').textContent   = totals.inProgress;
  document.getElementById('summary-completed').textContent  = totals.completed;

  const pct = totals.total ? Math.round((totals.completed / totals.total) * 100) : 0;
  document.getElementById('completion-pct').textContent = pct + '%';
  document.getElementById('completion-bar').style.width  = pct + '%';

  renderTable(rows);
}

// ── Table ─────────────────────────────────────────────────────
function renderTable(rows) {
  const tbody = document.getElementById('report-tbody');
  if (!rows.length || rows.every(r => r.total === 0)) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📊</div><p>No data for selected filters</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => {
    if (r.total === 0) return '';
    const pct = Math.round((r.completed / r.total) * 100);
    return '<tr>' +
      '<td><strong>' + escHtml(r.lab_name) + '</strong> <code style="font-size:0.72rem;color:var(--clr-accent)">' + escHtml(r.lab_code) + '</code></td>' +
      '<td style="text-align:center;font-weight:700;">' + r.total + '</td>' +
      '<td style="text-align:center;font-weight:700;color:var(--clr-primary);">' + r.estimations.toLocaleString() + '</td>' +
      '<td style="text-align:center;">' + (r.assigned > 0 ? '<span style="color:#b45309;font-weight:600;">' + r.assigned + '</span>' : '<span class="muted">0</span>') + '</td>' +
      '<td style="text-align:center;">' + (r.in_progress > 0 ? '<span style="color:#7c3aed;font-weight:600;">' + r.in_progress + '</span>' : '<span class="muted">0</span>') + '</td>' +
      '<td style="text-align:center;">' + (r.completed > 0 ? '<span style="color:#059669;font-weight:600;">' + r.completed + '</span>' : '<span class="muted">0</span>') + '</td>' +
      '<td style="text-align:center;">' + (r.pending > 0 ? '<span style="color:#dc2626;font-weight:600;">' + r.pending + '</span>' : '<span class="muted">0</span>') + '</td>' +
      '<td>' +
        '<div style="display:flex;align-items:center;gap:var(--sp-3);">' +
          '<div class="progress-bar" style="flex:1;"><div class="progress-fill" style="width:' + pct + '%;background:' + (pct>80?'var(--clr-success)':pct>50?'var(--clr-primary)':'var(--clr-warning)') + '"></div></div>' +
          '<span style="font-size:0.78rem;color:var(--txt-secondary);min-width:32px;">' + pct + '%</span>' +
        '</div>' +
      '</td>' +
      '<td style="text-align:center;font-size:0.75rem;color:var(--txt-secondary);">' + (r.latest_completion ? formatDate(r.latest_completion) : '—') + '</td>' +
    '</tr>';
  }).join('');

  // Totals row
  const rows2 = rows.filter(r => r.total > 0);
  if (rows2.length > 1) {
    const t = rows2.reduce((a,r) => ({
      total: a.total+r.total, estimations: a.estimations+r.estimations,
      assigned: a.assigned+r.assigned,
      in_progress: a.in_progress+r.in_progress,
      completed: a.completed+r.completed, pending: a.pending+r.pending,
    }), { total:0, estimations:0, assigned:0, in_progress:0, completed:0, pending:0 });
    const tp = Math.round((t.completed/t.total)*100);
    const allCompletionDates = rows2.flatMap(r => r.latest_completion ? [r.latest_completion] : []).sort().reverse();
    const allLatestCompletion = allCompletionDates[0] || null;

    tbody.innerHTML += '<tr style="border-top:2px solid var(--clr-border-2);background:rgba(0,0,0,0.02);">' +
      '<td><strong>All Labs</strong></td>' +
      '<td style="text-align:center;font-weight:800;">' + t.total + '</td>' +
      '<td style="text-align:center;font-weight:800;color:var(--clr-primary);">' + t.estimations.toLocaleString() + '</td>' +
      '<td style="text-align:center;font-weight:700;color:#b45309;">' + t.assigned + '</td>' +
      '<td style="text-align:center;font-weight:700;color:#7c3aed;">' + t.in_progress + '</td>' +
      '<td style="text-align:center;font-weight:700;color:#059669;">' + t.completed + '</td>' +
      '<td style="text-align:center;font-weight:700;color:#dc2626;">' + t.pending + '</td>' +
      '<td>' +
        '<div style="display:flex;align-items:center;gap:var(--sp-3);">' +
          '<div class="progress-bar" style="flex:1;"><div class="progress-fill" style="width:' + tp + '%;"></div></div>' +
          '<span style="font-size:0.78rem;color:var(--txt-secondary);min-width:32px;">' + tp + '%</span>' +
        '</div>' +
      '</td>' +
      '<td style="text-align:center;font-size:0.75rem;color:var(--txt-secondary);">' + (allLatestCompletion ? formatDate(allLatestCompletion) : '—') + '</td>' +
    '</tr>';
  }
}

// ── CSV Export ────────────────────────────────────────────────
function exportReportCSV() {
  const filters = getFilterValues();
  const rows    = aggregateData(filters);
  const active  = rows.filter(r => r.total > 0);
  if (!active.length) { showToast('No data to export.', 'warning'); return; }

  const exportRows = active.map(r => ({
    'Lab Name':       r.lab_name,
    'Lab Code':       r.lab_code,
    'Total Received': r.total,
    'Estimations':    r.estimations,
    'Assigned':       r.assigned,
    'In Progress':    r.in_progress,
    'Completed':      r.completed,
    'Pending':        r.pending,
    'Avg Turnaround': r.avg_turnaround,
  }));

  const dateStr = new Date().toISOString().slice(0,10);
  downloadCSV('garl-progress-report-' + dateStr + '.csv', exportRows);
  showToast('Report exported successfully.', 'success');
}

document.addEventListener('DOMContentLoaded', initReports);