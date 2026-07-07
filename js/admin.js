/**
 * SharePay - Admin Dashboard (No Firebase)
 */

let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
  currentUser = window.Auth.guard('admin');
  if (!currentUser) return;

  try {
    SharePay.initTheme();
    SharePay.populateNavUser(currentUser);
    initDashboard();
    initNavigation();
    bindLogout();
    bindSearch();
    initReports();
    renderUsersTable();
    renderGroupsTable();
    renderExpensesTable();
  } finally {
    // Hide the full-screen page loader once the dashboard is ready
    const loader = document.getElementById('page-loader');
    if (loader) loader.style.display = 'none';
  }
});

// ===== DASHBOARD =====
function initDashboard() {
  const members     = window.SP.Members.getAll().filter(m => m.role !== 'admin');
  const groups      = window.SP.Groups.getAll();
  const expenses    = window.SP.Expenses.getAll();
  const settlements = window.SP.Settlements.getAll();

  const totalExp   = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const pending    = settlements.filter(s => s.status === 'pending').reduce((s, e) => s + (e.amount || 0), 0);

  setEl('stat-users',    members.length);
  setEl('stat-groups',   groups.length);
  setEl('stat-expenses', SharePay.formatCurrency(totalExp));
  setEl('stat-pending',  SharePay.formatCurrency(pending));

  renderRecentActivities(expenses.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,10));
  renderCategoryBreakdown(expenses);
  renderMonthlyChart(expenses);
}

function renderRecentActivities(expenses) {
  const container = document.getElementById('recent-activities');
  if (!container) return;

  if (expenses.length === 0) {
    container.innerHTML = SharePay.emptyState('📊', 'ยังไม่มีกิจกรรม');
    return;
  }

  container.innerHTML = expenses.map(e => `
    <div class="activity-row">
      <div class="activity-icon">💸</div>
      <div class="activity-info">
        <div>${escHtml(e.paidByName || '?')} เพิ่ม "${escHtml(e.title)}"</div>
        <div class="text-muted">${SharePay.timeAgo(e.createdAt)}</div>
      </div>
      <div class="activity-amount">${SharePay.formatCurrency(e.amount)}</div>
    </div>`).join('');
}

function renderCategoryBreakdown(expenses) {
  const container = document.getElementById('category-breakdown');
  if (!container) return;

  const cats = {};
  expenses.forEach(e => { cats[e.category] = (cats[e.category] || 0) + e.amount; });
  const total = Object.values(cats).reduce((s, v) => s + v, 0) || 1;
  const CATS = { food:'🍜',fuel:'⛽',accommodation:'🏨',transport:'🚌',drinks:'🥤',entertainment:'🎭',shopping:'🛍️',other:'📦' };
  const COLORS = { food:'#F59E0B',fuel:'#EF4444',accommodation:'#8B5CF6',transport:'#06B6D4',drinks:'#10B981',entertainment:'#F97316',shopping:'#EC4899',other:'#6B7280' };

  if (Object.keys(cats).length === 0) {
    container.innerHTML = '<p class="text-muted text-center">ยังไม่มีข้อมูล</p>';
    return;
  }

  container.innerHTML = Object.entries(cats)
    .sort(([,a],[,b]) => b - a)
    .map(([k, v]) => {
      const pct = Math.round(v / total * 100);
      return `<div class="cat-row">
        <span>${CATS[k] || '📦'} ${k}</span>
        <div class="cat-bar-wrap"><div class="cat-bar" style="width:${pct}%;background:${COLORS[k]||'#6B7280'}"></div></div>
        <span>${SharePay.formatCurrency(v)} (${pct}%)</span>
      </div>`;
    }).join('');
}

function renderMonthlyChart(expenses) {
  const container = document.getElementById('monthly-chart');
  if (!container) return;

  const monthly = {};
  expenses.forEach(e => {
    if (!e.createdAt) return;
    const d = new Date(e.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    monthly[key] = (monthly[key] || 0) + e.amount;
  });

  const sorted = Object.entries(monthly).sort(([a],[b]) => a.localeCompare(b)).slice(-6);
  if (sorted.length === 0) { container.innerHTML = '<p class="text-muted text-center">ยังไม่มีข้อมูล</p>'; return; }

  const max = Math.max(...sorted.map(([,v]) => v)) || 1;
  container.innerHTML = `<div class="bar-chart">${sorted.map(([month, val]) => {
    const pct = Math.round(val / max * 100);
    return `<div class="bar-col">
      <div class="bar-fill" style="height:${pct}%" title="${SharePay.formatCurrency(val)}"></div>
      <div class="bar-label">${month.slice(5)}</div>
    </div>`;
  }).join('')}</div>`;
}

// ===== USERS TABLE =====
function renderUsersTable(filter = '') {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  let members = window.SP.Members.getAll();
  if (filter) members = members.filter(m => m.name.toLowerCase().includes(filter) || m.email.toLowerCase().includes(filter));

  if (members.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;">${SharePay.emptyState('👤','ไม่พบสมาชิก')}</td></tr>`;
    return;
  }

  tbody.innerHTML = members.map(m => `
    <tr>
      <td><div class="user-cell"><img src="${m.avatar||`https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=3B82F6&color=fff`}" class="avatar-sm" onerror="this.style.display='none'">${escHtml(m.name)}</div></td>
      <td>${escHtml(m.email)}</td>
      <td><span class="badge ${m.role === 'admin' ? 'badge-primary' : 'badge-default'}">${m.role}</span></td>
      <td>${SharePay.formatDate(m.createdAt)}</td>
      <td>
        <button class="btn btn-sm btn-ghost" onclick="toggleRole('${m.id}','${m.role}')">เปลี่ยน Role</button>
        <button class="btn btn-sm btn-danger" onclick="deleteMember('${m.id}')">ลบ</button>
      </td>
    </tr>`).join('');
}

window.toggleRole = function(id, currentRole) {
  const newRole = currentRole === 'admin' ? 'member' : 'admin';
  window.SP.Members.update(id, { role: newRole });
  SharePay.showToast(`เปลี่ยน Role เป็น ${newRole} แล้ว`, 'success');
  renderUsersTable();
};

window.deleteMember = function(id) {
  SharePay.confirmAction('ลบสมาชิก', 'ต้องการลบสมาชิกนี้ออกจากระบบใช่ไหม?', () => {
    window.SP.Members.delete(id);
    SharePay.showToast('ลบสมาชิกเรียบร้อยแล้ว', 'success');
    renderUsersTable();
    initDashboard();
  });
};

// ===== GROUPS TABLE =====
function renderGroupsTable(filter = '') {
  const tbody = document.getElementById('groups-tbody');
  if (!tbody) return;
  let groups = window.SP.Groups.getAll();
  if (filter) groups = groups.filter(g => g.name.toLowerCase().includes(filter));

  if (groups.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;">${SharePay.emptyState('👥','ไม่มีกลุ่ม')}</td></tr>`;
    return;
  }

  tbody.innerHTML = groups.map(g => {
    const creator = window.SP.Members.getById(g.createdBy);
    return `
    <tr>
      <td>${g.icon||'👥'} ${escHtml(g.name)}</td>
      <td>${(g.memberIds||[]).length} คน</td>
      <td>${SharePay.formatCurrency(g.totalExpenses||0)}</td>
      <td>${creator ? escHtml(creator.name) : '-'}</td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="adminDeleteGroup('${g.id}')">ลบ</button>
      </td>
    </tr>`;
  }).join('');
}

window.adminDeleteGroup = function(id) {
  SharePay.confirmAction('ลบกลุ่ม', 'การลบกลุ่มจะลบค่าใช้จ่ายทั้งหมดด้วย', () => {
    window.SP.Groups.delete(id);
    SharePay.showToast('ลบกลุ่มเรียบร้อยแล้ว', 'success');
    renderGroupsTable();
    initDashboard();
  });
};

// ===== EXPENSES TABLE =====
function renderExpensesTable(filter = '') {
  const tbody = document.getElementById('expenses-tbody');
  if (!tbody) return;
  let expenses = window.SP.Expenses.getAll().sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  if (filter) expenses = expenses.filter(e => e.title.toLowerCase().includes(filter) || (e.paidByName||'').toLowerCase().includes(filter));

  if (expenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;">${SharePay.emptyState('💸','ไม่มีค่าใช้จ่าย')}</td></tr>`;
    return;
  }

  tbody.innerHTML = expenses.map(e => `
    <tr>
      <td>${escHtml(e.title)}</td>
      <td>${SharePay.formatCurrency(e.amount)}</td>
      <td>${escHtml(e.paidByName||'-')}</td>
      <td>${SharePay.formatDate(e.createdAt)}</td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="adminDeleteExpense('${e.id}')">ลบ</button>
      </td>
    </tr>`).join('');
}

window.adminDeleteExpense = function(id) {
  SharePay.confirmAction('ลบค่าใช้จ่าย', 'ต้องการลบรายการนี้ใช่ไหม?', () => {
    window.SP.Expenses.delete(id);
    SharePay.showToast('ลบรายการเรียบร้อยแล้ว', 'success');
    renderExpensesTable();
    initDashboard();
  });
};

// ===== REPORTS =====
function initReports() {
  document.querySelectorAll('.filter-btn[data-period]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn[data-period]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderReport(btn.dataset.period);
    });
  });
  renderReport('monthly');
}

function renderReport(period) {
  const container = document.getElementById('report-content');
  if (!container) return;

  const now = new Date();
  let cutoff = new Date();
  if (period === 'daily')   cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'weekly')  cutoff = new Date(now.getTime() - 7*24*60*60*1000);
  if (period === 'monthly') cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'yearly')  cutoff = new Date(now.getFullYear(), 0, 1);

  const expenses = window.SP.Expenses.getAll().filter(e => e.createdAt >= cutoff.toISOString());
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const cats = {};
  expenses.forEach(e => { cats[e.category] = (cats[e.category] || 0) + e.amount; });
  const topCat = Object.entries(cats).sort(([,a],[,b]) => b-a)[0];

  container.innerHTML = `
    <div class="report-summary">
      <div class="stat-card glass"><div class="stat-label">รายการทั้งหมด</div><div class="stat-value">${expenses.length}</div></div>
      <div class="stat-card glass"><div class="stat-label">ยอดรวม</div><div class="stat-value">${SharePay.formatCurrency(total)}</div></div>
      <div class="stat-card glass"><div class="stat-label">เฉลี่ยต่อรายการ</div><div class="stat-value">${expenses.length ? SharePay.formatCurrency(total/expenses.length) : '฿0'}</div></div>
      <div class="stat-card glass"><div class="stat-label">หมวดหมู่หลัก</div><div class="stat-value">${topCat ? topCat[0] : '-'}</div></div>
    </div>
    <table class="data-table">
      <thead><tr><th>รายการ</th><th>จำนวนเงิน</th><th>ผู้จ่าย</th><th>วันที่</th></tr></thead>
      <tbody>${expenses.slice(0,20).map(e => `
        <tr><td>${escHtml(e.title)}</td><td>${SharePay.formatCurrency(e.amount)}</td><td>${escHtml(e.paidByName||'-')}</td><td>${SharePay.formatDate(e.createdAt)}</td></tr>`).join('')}
      </tbody>
    </table>`;

  // Export CSV
  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) {
    exportBtn.onclick = () => {
      const csv = ['Title,Amount,PaidBy,Category,Date',
        ...expenses.map(e => `"${e.title}",${e.amount},"${e.paidByName||''}","${e.category}","${e.createdAt}"`)].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `sharepay-report-${period}-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      SharePay.showToast('ดาวน์โหลด CSV เรียบร้อยแล้ว ✅', 'success');
    };
  }
}

// ===== NAV =====
function initNavigation() {
  document.querySelectorAll('[data-section]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const t = btn.dataset.section;
      document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('[data-section]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll(`[data-section="${t}"]`).forEach(b => b.classList.add('active'));
      const sec = document.getElementById(`section-${t}`);
      if (sec) {
        sec.classList.add('active');
        if (t === 'users')    renderUsersTable();
        if (t === 'groups')   renderGroupsTable();
        if (t === 'expenses') renderExpensesTable();
        if (t === 'reports')  initReports();
      }
    });
  });

  const menuBtn = document.getElementById('menu-toggle');
  const sidebar = document.querySelector('.sidebar');
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', e => {
      if (!sidebar.contains(e.target) && !menuBtn.contains(e.target)) sidebar.classList.remove('open');
    });
  }
}

function bindLogout() {
  document.querySelectorAll('[data-action="logout"], #logout-btn, .logout-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.preventDefault(); window.Auth.logout(); });
  });
}

function bindSearch() {
  const input = document.getElementById('search-input') || document.getElementById('admin-search');
  if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    renderUsersTable(q);
    renderGroupsTable(q);
    renderExpensesTable(q);
  });
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
