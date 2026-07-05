/**
 * CoopSys — Main JavaScript
 * Handles: sidebar toggling, tooltips, table search, loan EMI calculator,
 *          ML prediction fetch, and UI utilities.
 */

'use strict';

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const main = document.querySelector('.main-content');
  if (window.innerWidth <= 991) {
    sidebar.classList.toggle('show');
  } else {
    sidebar.classList.toggle('collapsed');
    if (main) main.classList.toggle('expanded');
  }
}

// Close sidebar on outside click (mobile)
document.addEventListener('click', function (e) {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.querySelector('.sidebar-toggle');
  if (!sidebar || !toggle) return;
  if (window.innerWidth <= 991 && sidebar.classList.contains('show')) {
    if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
      sidebar.classList.remove('show');
    }
  }
});


// ─── BOOTSTRAP TOOLTIPS ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  const tooltips = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  tooltips.forEach(el => new bootstrap.Tooltip(el));
});


// ─── AUTO-DISMISS TOASTS ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.toast').forEach(function (toastEl) {
    const toast = new bootstrap.Toast(toastEl, { delay: 4500 });
    toast.show();
  });
});


// ─── TABLE SEARCH (client-side) ───────────────────────────────────────────────

function tableSearch(inputId, tableId) {
  const input = document.getElementById(inputId);
  const table = document.getElementById(tableId);
  if (!input || !table) return;
  input.addEventListener('keyup', function () {
    const filter = input.value.toLowerCase();
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(function (row) {
      row.style.display = row.textContent.toLowerCase().includes(filter) ? '' : 'none';
    });
  });
}


// ─── LOAN EMI CALCULATOR ─────────────────────────────────────────────────────

function calculateEMI(principal, annualRate, months) {
  if (!principal || !months) return { emi: 0, total: 0, interest: 0 };
  const r = annualRate / 100 / 12;
  let emi;
  if (r === 0) {
    emi = principal / months;
  } else {
    emi = principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1);
  }
  const total    = emi * months;
  const interest = total - principal;
  return {
    emi:      Math.round(emi * 100) / 100,
    total:    Math.round(total * 100) / 100,
    interest: Math.round(interest * 100) / 100,
  };
}

// Live EMI preview on loan application form
document.addEventListener('DOMContentLoaded', function () {
  const amtField     = document.getElementById('id_amount_requested');
  const tenureField  = document.getElementById('id_tenure_months');
  const emiPreview   = document.getElementById('emi-preview');

  function updateEMI() {
    if (!amtField || !tenureField || !emiPreview) return;
    const principal = parseFloat(amtField.value) || 0;
    const tenure    = parseInt(tenureField.value) || 0;
    const rate      = parseFloat(emiPreview.dataset.rate) || 10;
    if (principal > 0 && tenure > 0) {
      const { emi, total, interest } = calculateEMI(principal, rate, tenure);
      emiPreview.innerHTML = `
        <div class="alert alert-info py-2 mt-2 small">
          <strong>Estimated Monthly EMI:</strong> ₦${emi.toLocaleString('en-NG', {minimumFractionDigits: 2})}
          &nbsp;|&nbsp;
          <strong>Total Repayable:</strong> ₦${total.toLocaleString('en-NG', {minimumFractionDigits: 2})}
          &nbsp;|&nbsp;
          <strong>Interest:</strong> ₦${interest.toLocaleString('en-NG', {minimumFractionDigits: 2})}
        </div>`;
    } else {
      emiPreview.innerHTML = '';
    }
  }

  if (amtField)    amtField.addEventListener('input', updateEMI);
  if (tenureField) tenureField.addEventListener('input', updateEMI);
});


// ─── ML PREDICTION WIDGET ─────────────────────────────────────────────────────

function runMLPrediction(memberId, loanAmount, tenure) {
  const btn     = document.getElementById('ml-predict-btn');
  const result  = document.getElementById('ml-result');
  if (!result) return;

  result.innerHTML = `
    <div class="text-center py-3">
      <div class="spinner-border spinner-border-sm text-primary me-2"></div>
      <span class="small text-muted">Running ML prediction…</span>
    </div>`;

  if (btn) { btn.disabled = true; btn.textContent = 'Analysing…'; }

  const url = `/admin-panel/predict/${memberId}/?loan_amount=${loanAmount}&tenure=${tenure}`;

  fetch(url)
    .then(res => res.json())
    .then(data => {
      const colorMap = { Low: 'success', Medium: 'warning', High: 'danger' };
      const color    = colorMap[data.risk_level] || 'secondary';
      result.innerHTML = `
        <div class="alert alert-${color} py-2">
          <div class="fw-700 mb-1">
            <i class="bi bi-cpu-fill me-1"></i>
            Risk Level: <span class="badge bg-${color}">${data.risk_level}</span>
            &nbsp; Default Probability: <strong>${data.default_probability}%</strong>
          </div>
          <div class="small">${data.recommendation}</div>
        </div>`;
      if (btn) { btn.disabled = false; btn.textContent = 'Re-run Prediction'; }
    })
    .catch(() => {
      result.innerHTML = `<div class="alert alert-warning py-2 small">ML service unavailable. Using rule-based assessment.</div>`;
      if (btn) { btn.disabled = false; btn.textContent = 'Run Prediction'; }
    });
}


// ─── CONFIRM DIALOGS ─────────────────────────────────────────────────────────

function confirmAction(message) {
  return window.confirm(message || 'Are you sure you want to proceed?');
}

// Attach to all elements with data-confirm
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('[data-confirm]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      if (!confirmAction(el.dataset.confirm)) {
        e.preventDefault();
      }
    });
  });
});


// ─── NUMBER FORMATTING ───────────────────────────────────────────────────────

function formatNaira(amount) {
  return '₦' + parseFloat(amount).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}


// ─── PRINT PAGE ──────────────────────────────────────────────────────────────

function printSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) { window.print(); return; }
  const original = document.body.innerHTML;
  document.body.innerHTML = section.innerHTML;
  window.print();
  document.body.innerHTML = original;
  window.location.reload();
}


// ─── RESPONSIVE SIDEBAR ON RESIZE ────────────────────────────────────────────

window.addEventListener('resize', function () {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  if (window.innerWidth > 991) {
    sidebar.classList.remove('show');
  }
});
