/* ============================================================
   reports.js — Progress Report page logic
   ============================================================ */
'use strict';

let reportSession = null;
let chartInstance = null;

// ── Init ──────────────────────────────────────────────────────
async function initReports() {
  reportSession = requireAuth(['admin', 'receptionist']);
  if (!reportSession) return;
  await initDB();
  renderSidebarUser();
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
    DB.labs.map(l => `<option value="${l.id}">${escHtml(l.lab_name)}</option>`).join('');
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
    const received   = samples.filter(s => s.status === 'received').length;
    const assigned   = samples.filter(s => s.status === 'assigned').length;
    const inProgress = samples.filter(s => s.status === 'in_progress').length;
    const completed  = samples.filter(s => s.status === 'completed').length;
    const pending    = received + assigned + inProgress;

    // Average turnaround: days from created_at to report.uploaded_at for completed
    const completedSamples = samples.filter(s => s.status === 'completed');
    let avgTurnaround = '—';
    if (completedSamples.length) {
      const total_days = completedSamples.reduce((sum, s) => {
        const report = getReportForSample(s.id);
        if (report && report.uploaded_at) {
          return sum + daysBetween(s.created_at, report.uploaded_at);
        }
        return sum;
      }, 0);
      const avg = (total_days / completedSamples.length).toFixed(1);
      avgTurnaround = `${avg} day${avg == 1 ? '' : 's'}`;
    }

    return {
      lab_id:       lab.id,
      lab_name:     lab.lab_name,
      lab_code:     lab.lab_code,
      total,
      received,
      assigned,
      in_progress:  inProgress,
      completed,
      pending,
      avg_turnaround: avgTurnaround,
    };
  });
}

// ── Render everything ─────────────────────────────────────────
function renderReport() {
  const filters = getFilterValues();
  const rows    = aggregateData(filters);

  // Summary stats
  const totals = rows.reduce((acc, r) => {
    acc.total      += r.total;
    acc.pending    += r.pending;
    acc.completed  += r.completed;
    acc.inProgress += r.in_progress;
    return acc;
  }, { total: 0, pending: 0, completed: 0, inProgress: 0 });

  document.getElementById('summary-total').textContent      = totals.total;
  document.getElementById('summary-pending').textContent    = totals.pending;
  document.getElementById('summary-progress').textContent   = totals.inProgress;
  document.getElementById('summary-completed').textContent  = totals.completed;

  const pct = totals.total ? Math.round((totals.completed / totals.total) * 100) : 0;
  document.getElementById('completion-pct').textContent = pct + '%';
  document.getElementById('completion-bar').style.width  = pct + '%';

  renderTable(rows);
  renderChart(rows);
}

// ── Table ─────────────────────────────────────────────────────
function renderTable(rows) {
  const tbody = document.getElementById('report-tbody');
  if (!rows.length || rows.every(r => r.total === 0)) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📊</div><p>No data for selected filters</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    if (r.total === 0) return '';
    const pct = Math.round((r.completed / r.total) * 100);
    return `<tr>
      <td><strong>${escHtml(r.lab_name)}</strong> <code style="font-size:0.72rem;color:var(--clr-accent)">${escHtml(r.lab_code)}</code></td>
      <td style="text-align:center;font-weight:700;">${r.total}</td>
      <td style="text-align:center;">${r.assigned > 0 ? `<span style="color:#fcd34d;font-weight:600;">${r.assigned}</span>` : `<span class="muted">0</span>`}</td>
      <td style="text-align:center;">${r.in_progress > 0 ? `<span style="color:#c4b5fd;font-weight:600;">${r.in_progress}</span>` : `<span class="muted">0</span>`}</td>
      <td style="text-align:center;">${r.completed > 0 ? `<span style="color:#6ee7b7;font-weight:600;">${r.completed}</span>` : `<span class="muted">0</span>`}</td>
      <td style="text-align:center;">${r.pending > 0 ? `<span style="color:#fca5a5;font-weight:600;">${r.pending}</span>` : `<span class="muted">0</span>`}</td>
      <td>
        <div style="display:flex;align-items:center;gap:var(--sp-3);">
          <div class="progress-bar" style="flex:1;"><div class="progress-fill" style="width:${pct}%;background:${pct>80?'var(--clr-success)':pct>50?'var(--clr-primary)':'var(--clr-warning)'}"></div></div>
          <span style="font-size:0.78rem;color:var(--txt-secondary);min-width:32px;">${pct}%</span>
        </div>
      </td>
    </tr>`;
  }).join('');

  // Totals row
  const rows2 = rows.filter(r => r.total > 0);
  if (rows2.length > 1) {
    const t = rows2.reduce((a,r) => ({
      total: a.total+r.total, assigned: a.assigned+r.assigned,
      in_progress: a.in_progress+r.in_progress,
      completed: a.completed+r.completed, pending: a.pending+r.pending,
    }), { total:0, assigned:0, in_progress:0, completed:0, pending:0 });
    const tp = Math.round((t.completed/t.total)*100);
    tbody.innerHTML += `<tr style="border-top:2px solid var(--clr-border-2);background:rgba(255,255,255,0.02);">
      <td><strong>All Labs</strong></td>
      <td style="text-align:center;font-weight:800;">${t.total}</td>
      <td style="text-align:center;font-weight:700;color:#fcd34d;">${t.assigned}</td>
      <td style="text-align:center;font-weight:700;color:#c4b5fd;">${t.in_progress}</td>
      <td style="text-align:center;font-weight:700;color:#6ee7b7;">${t.completed}</td>
      <td style="text-align:center;font-weight:700;color:#fca5a5;">${t.pending}</td>
      <td>
        <div style="display:flex;align-items:center;gap:var(--sp-3);">
          <div class="progress-bar" style="flex:1;"><div class="progress-fill" style="width:${tp}%;"></div></div>
          <span style="font-size:0.78rem;color:var(--txt-secondary);min-width:32px;">${tp}%</span>
        </div>
      </td>
    </tr>`;
  }
}

// ── Chart ─────────────────────────────────────────────────────
function renderChart(rows) {
  const canvas = document.getElementById('report-chart');
  if (!canvas || !window.Chart) return;

  const activeRows = rows.filter(r => r.total > 0);
  if (!activeRows.length) {
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }

  const labels    = activeRows.map(r => r.lab_name);
  const assigned  = activeRows.map(r => r.assigned);
  const progress  = activeRows.map(r => r.in_progress);
  const completed = activeRows.map(r => r.completed);

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Assigned',
        data: assigned,
        backgroundColor: 'rgba(245,158,11,0.7)',
        borderColor: 'rgba(245,158,11,1)',
        borderWidth: 1,
        borderRadius: 6,
      },
      {
        label: 'In Progress',
        data: progress,
        backgroundColor: 'rgba(168,85,247,0.7)',
        borderColor: 'rgba(168,85,247,1)',
        borderWidth: 1,
        borderRadius: 6,
      },
      {
        label: 'Completed',
        data: completed,
        backgroundColor: 'rgba(16,185,129,0.7)',
        borderColor: 'rgba(16,185,129,1)',
        borderWidth: 1,
        borderRadius: 6,
      },
    ],
  };

  if (chartInstance) {
    chartInstance.data = chartData;
    chartInstance.update();
    return;
  }

  chartInstance = new Chart(canvas, {
    type: 'bar',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 } },
        },
        tooltip: {
          backgroundColor: '#0d1627',
          titleColor: '#f1f5f9',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          stacked: false,
          ticks: { color: '#94a3b8', font: { family: 'Inter' } },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#94a3b8', stepSize: 1, font: { family: 'Inter' } },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
      },
    },
  });
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
    'Assigned':       r.assigned,
    'In Progress':    r.in_progress,
    'Completed':      r.completed,
    'Pending':        r.pending,
    'Avg Turnaround': r.avg_turnaround,
  }));

  const dateStr = new Date().toISOString().slice(0,10);
  downloadCSV(`garl-progress-report-${dateStr}.csv`, exportRows);
  showToast('Report exported successfully.', 'success');
}

document.addEventListener('DOMContentLoaded', initReports);
