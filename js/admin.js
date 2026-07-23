/**
 * SharePay - Admin Dashboard (No Firebase)
 * Rewritten to match the actual admin.html markup (ids/classes).
 */

let currentUser = null;

const CATS  = { food:'🍜',fuel:'⛽',accommodation:'🏨',transport:'🚌',drinks:'🥤',entertainment:'🎭',shopping:'🛍️',other:'📦' };
const CAT_LABELS = { food:'ค่าอาหาร',fuel:'ค่าน้ำมัน',accommodation:'ค่าที่พัก',transport:'ค่าเดินทาง',drinks:'ค่าเครื่องดื่ม',entertainment:'ความบันเทิง',shopping:'ช้อปปิ้ง',other:'อื่นๆ' };
const COLORS = { food:'#F59E0B',fuel:'#EF4444',accommodation:'#22D3EE',transport:'#06B6D4',drinks:'#10B981',entertainment:'#F97316',shopping:'#EC4899',other:'#6B7280' };

let charts = {}; // keep Chart.js instances so we can destroy/redraw

document.addEventListener('DOMContentLoaded', () => {
  currentUser = window.Auth.guard('admin');
  if (!currentUser) return;

  try {
    SharePay.initTheme();
    SharePay.populateNavUser(currentUser);
    // admin.html uses its own sidebar ids not covered by populateNavUser
    const nameEl = document.getElementById('sidebar-name');
    if (nameEl) nameEl.textContent = currentUser.name || currentUser.email;
    const avatarEl = document.getElementById('sidebar-avatar');
    if (avatarEl) avatarEl.src = currentUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name||'A')}&background=0EA5E9&color=fff`;

    initDashboard();
    bindLogout();
    bindSearchAndFilters();
    bindNotifBell();
    bindInviteMember();
    bindExports();
    bindSettings();
    initReports();
    renderMembersTable();
    renderGroupsTable();
    renderExpensesTable();
    renderSettlementsTable();
  } finally {
    const loader = document.getElementById('page-loader');
    if (loader) loader.style.display = 'none';
  }
});

// ===== DASHBOARD =====
function initDashboard() {
  const members     = window.SP.Members.getAll().filter(m => m.role !== 'admin');
  const groups      = window.SP.Groups.getAll();
  const expenses     = window.SP.Expenses.getAll();
  const settlements  = window.SP.Settlements.getAll();

  const totalExp = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const pending  = settlements.filter(s => s.status === 'pending').reduce((s, e) => s + (e.amount || 0), 0);

  setEl('stat-users',    members.length);
  setEl('stat-groups',   groups.length);
  setEl('stat-expenses', SharePay.formatCurrency(totalExp));
  setEl('stat-pending',  SharePay.formatCurrency(pending));
  setEl('members-count', members.length);

  renderRecentActivities(expenses.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,10));
  renderCategoryChart(expenses);
  renderMonthlyChart(expenses);
}

function renderRecentActivities(expenses) {
  const container = document.getElementById('recent-activities');
  if (!container) return;
  if (expenses.length === 0) {
    container.innerHTML = SharePay.emptyState('📭', 'ยังไม่มีกิจกรรม');
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

function categoryTotals(expenses) {
  const cats = {};
  expenses.forEach(e => { cats[e.category] = (cats[e.category] || 0) + (e.amount || 0); });
  return cats;
}

function renderCategoryChart(expenses) {
  const canvas = document.getElementById('categoryChart');
  if (!canvas || typeof Chart === 'undefined') return;
  const cats = categoryTotals(expenses);
  const labels = Object.keys(cats).map(k => `${CATS[k]||'📦'} ${CAT_LABELS[k]||k}`);
  const data   = Object.values(cats);
  const colors = Object.keys(cats).map(k => COLORS[k] || '#6B7280');

  charts.category?.destroy();
  if (labels.length === 0) return;
  charts.category = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: { plugins: { legend: { position: 'bottom', labels: { color: '#94A3B8', font: { size: 11 } } } } }
  });
}

function renderMonthlyChart(expenses) {
  const canvas = document.getElementById('monthlyChart');
  if (!canvas || typeof Chart === 'undefined') return;
  const monthly = {};
  expenses.forEach(e => {
    if (!e.createdAt) return;
    const d = new Date(e.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    monthly[key] = (monthly[key] || 0) + (e.amount || 0);
  });
  const sorted = Object.entries(monthly).sort(([a],[b]) => a.localeCompare(b)).slice(-6);

  charts.monthly?.destroy();
  if (sorted.length === 0) return;
  charts.monthly = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sorted.map(([m]) => m.slice(5)),
      datasets: [{ label: 'ค่าใช้จ่าย', data: sorted.map(([,v]) => v), backgroundColor: '#0EA5E9', borderRadius: 6 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#94A3B8' } }, x: { ticks: { color: '#94A3B8' } } } }
  });
}

// ===== MEMBERS TABLE =====
function renderMembersTable() {
  const tbody = document.getElementById('members-table-body');
  if (!tbody) return;
  const q    = (document.getElementById('member-search')?.value || document.getElementById('global-search')?.value || '').toLowerCase().trim();
  const role = document.getElementById('role-filter')?.value || '';

  let members = window.SP.Members.getAll();
  if (q)    members = members.filter(m => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
  if (role) members = members.filter(m => m.role === role);

  if (members.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;">${SharePay.emptyState('👤','ไม่พบสมาชิก')}</td></tr>`;
    return;
  }

  tbody.innerHTML = members.map(m => `
    <tr>
      <td><div class="user-cell"><img src="${m.avatar||`https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=0EA5E9&color=fff`}" class="avatar-sm" onerror="this.style.display='none'">${escHtml(m.name)}</div></td>
      <td>${escHtml(m.email)}</td>
      <td><span class="badge ${m.role === 'admin' ? 'badge-primary' : 'badge-default'}">${m.role}</span></td>
      <td>${SharePay.formatDate(m.createdAt)}</td>
      <td>${m.updatedAt ? SharePay.formatDate(m.updatedAt) : '-'}</td>
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
  renderMembersTable();
};

window.deleteMember = function(id) {
  SharePay.confirmAction('ลบสมาชิก', 'ต้องการลบสมาชิกนี้ออกจากระบบใช่ไหม?', () => {
    window.SP.Members.delete(id);
    SharePay.showToast('ลบสมาชิกเรียบร้อยแล้ว', 'success');
    renderMembersTable();
    initDashboard();
  });
};

function bindInviteMember() {
  document.getElementById('invite-member-btn')?.addEventListener('click', () => {
    const name = prompt('ชื่อสมาชิกใหม่:');
    if (!name) return;
    const email = prompt('อีเมล:');
    if (!email) return;
    if (window.SP.Members.getByEmail(email)) {
      SharePay.showToast('อีเมลนี้ถูกใช้แล้ว', 'error');
      return;
    }
    window.SP.Members.create({
      name, email, password: Math.random().toString(36).slice(2, 10),
      role: 'member',
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0EA5E9&color=fff&size=200`
    });
    SharePay.showToast(`เพิ่มสมาชิก "${name}" เรียบร้อยแล้ว 🎉`, 'success');
    renderMembersTable();
    initDashboard();
  });
}

// ===== GROUPS TABLE =====
function renderGroupsTable() {
  const tbody = document.getElementById('groups-table-body');
  if (!tbody) return;
  const q = (document.getElementById('group-search')?.value || document.getElementById('global-search')?.value || '').toLowerCase().trim();

  let groups = window.SP.Groups.getAll();
  if (q) groups = groups.filter(g => g.name.toLowerCase().includes(q));

  if (groups.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;">${SharePay.emptyState('👥','ไม่มีกลุ่ม')}</td></tr>`;
    return;
  }

  tbody.innerHTML = groups.map(g => {
    const creator = window.SP.Members.getById(g.createdBy);
    return `
    <tr>
      <td>${g.icon||'👥'} ${escHtml(g.name)}</td>
      <td>${creator ? escHtml(creator.name) : '-'}</td>
      <td>${(g.memberIds||[]).length} คน</td>
      <td>${SharePay.formatCurrency(g.totalExpenses||0)}</td>
      <td>${SharePay.formatDate(g.createdAt)}</td>
      <td><button class="btn btn-sm btn-danger" onclick="adminDeleteGroup('${g.id}')">ลบ</button></td>
    </tr>`;
  }).join('');
}

window.adminDeleteGroup = function(id) {
  SharePay.confirmAction('ลบกลุ่ม', 'การลบกลุ่มจะลบค่าใช้จ่ายทั้งหมดด้วย', () => {
    window.SP.Groups.delete(id);
    SharePay.showToast('ลบกลุ่มเรียบร้อยแล้ว', 'success');
    renderGroupsTable();
    renderExpensesTable();
    initDashboard();
  });
};

// ===== EXPENSES TABLE =====
function renderExpensesTable() {
  const tbody = document.getElementById('expenses-table-body');
  if (!tbody) return;
  const q   = (document.getElementById('expense-search')?.value || document.getElementById('global-search')?.value || '').toLowerCase().trim();
  const cat = document.getElementById('category-filter')?.value || '';

  let expenses = window.SP.Expenses.getAll().sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  if (q)   expenses = expenses.filter(e => e.title.toLowerCase().includes(q) || (e.paidByName||'').toLowerCase().includes(q));
  if (cat) expenses = expenses.filter(e => e.category === cat);

  if (expenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;">${SharePay.emptyState('💸','ไม่มีค่าใช้จ่าย')}</td></tr>`;
    return;
  }

  tbody.innerHTML = expenses.map(e => {
    const group = window.SP.Groups.getById(e.groupId);
    const c = CAT_LABELS[e.category] ? `${CATS[e.category]} ${CAT_LABELS[e.category]}` : (e.category || '-');
    return `
    <tr>
      <td>${escHtml(e.title)}</td>
      <td>${c}</td>
      <td>${group ? `${group.icon||'👥'} ${escHtml(group.name)}` : '-'}</td>
      <td>${escHtml(e.paidByName||'-')}</td>
      <td>${SharePay.formatCurrency(e.amount)}</td>
      <td>${(e.splitMemberIds||[]).length} คน</td>
      <td>${SharePay.formatDate(e.createdAt)} <button class="btn-icon" style="font-size:12px" onclick="adminDeleteExpense('${e.id}')" title="ลบ">🗑️</button></td>
    </tr>`;
  }).join('');
}

window.adminDeleteExpense = function(id) {
  SharePay.confirmAction('ลบค่าใช้จ่าย', 'ต้องการลบรายการนี้ใช่ไหม?', () => {
    window.SP.Expenses.delete(id);
    SharePay.showToast('ลบรายการเรียบร้อยแล้ว', 'success');
    renderExpensesTable();
    initDashboard();
  });
};

// ===== SETTLEMENTS TABLE =====
function renderSettlementsTable() {
  const tbody = document.getElementById('settlements-table-body');
  if (!tbody) return;
  const status = document.getElementById('settlement-filter')?.value || '';

  let settlements = window.SP.Settlements.getAll().sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  if (status) settlements = settlements.filter(s => s.status === status);

  if (settlements.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:2rem;">${SharePay.emptyState('✅','ไม่มีรายการชำระเงิน')}</td></tr>`;
    return;
  }

  tbody.innerHTML = settlements.map(s => `
    <tr>
      <td>${escHtml(s.fromName||'-')}</td>
      <td>${escHtml(s.toName||'-')}</td>
      <td>${SharePay.formatCurrency(s.amount)}</td>
      <td><span class="badge ${s.status === 'confirmed' ? 'badge-success' : 'badge-warning'}">${s.status === 'confirmed' ? 'ยืนยันแล้ว' : 'รอยืนยัน'}</span></td>
      <td>${SharePay.formatDate(s.createdAt)}</td>
      <td>${s.status !== 'confirmed' ? `<button class="btn btn-sm btn-primary" onclick="adminConfirmSettlement('${s.id}')">ยืนยัน</button>` : '-'}</td>
    </tr>`).join('');
}

window.adminConfirmSettlement = function(id) {
  window.SP.Settlements.update(id, { status: 'confirmed', confirmedAt: new Date().toISOString() });
  SharePay.showToast('ยืนยันการชำระเงินแล้ว ✅', 'success');
  renderSettlementsTable();
  initDashboard();
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
  renderReport('daily');
}

function renderReport(period) {
  const now = new Date();
  let cutoff = new Date();
  if (period === 'daily')   cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'weekly')  cutoff = new Date(now.getTime() - 7*24*60*60*1000);
  if (period === 'monthly') cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'yearly')  cutoff = new Date(now.getFullYear(), 0, 1);

  const expenses = window.SP.Expenses.getAll().filter(e => e.createdAt >= cutoff.toISOString());

  // Time chart: bucket by day (last 14 buckets max)
  const byDay = {};
  expenses.forEach(e => {
    const key = (e.createdAt || '').slice(0, 10);
    byDay[key] = (byDay[key] || 0) + (e.amount || 0);
  });
  const sortedDays = Object.entries(byDay).sort(([a],[b]) => a.localeCompare(b)).slice(-14);

  const timeCanvas = document.getElementById('reportTimeChart');
  if (timeCanvas && typeof Chart !== 'undefined') {
    charts.reportTime?.destroy();
    charts.reportTime = new Chart(timeCanvas, {
      type: 'line',
      data: { labels: sortedDays.map(([d]) => d.slice(5)), datasets: [{ label: 'ค่าใช้จ่าย', data: sortedDays.map(([,v]) => v), borderColor: '#0EA5E9', backgroundColor: 'rgba(14,165,233,0.15)', fill: true, tension: 0.3 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#94A3B8' } }, x: { ticks: { color: '#94A3B8' } } } }
    });
  }

  const cats = categoryTotals(expenses);
  const catCanvas = document.getElementById('reportCatChart');
  if (catCanvas && typeof Chart !== 'undefined') {
    charts.reportCat?.destroy();
    const labels = Object.keys(cats).map(k => `${CATS[k]||'📦'} ${CAT_LABELS[k]||k}`);
    if (labels.length) {
      charts.reportCat = new Chart(catCanvas, {
        type: 'pie',
        data: { labels, datasets: [{ data: Object.values(cats), backgroundColor: Object.keys(cats).map(k => COLORS[k]||'#6B7280') }] },
        options: { plugins: { legend: { position: 'bottom', labels: { color: '#94A3B8', font: { size: 11 } } } } }
      });
    }
  }

  window._lastReportExpenses = expenses;
  window._lastReportPeriod = period;
}

function bindExports() {
  const toCSV = (expenses) => ['Title,Amount,PaidBy,Category,Date',
    ...expenses.map(e => `"${e.title}",${e.amount},"${e.paidByName||''}","${e.category}","${e.createdAt}"`)].join('\n');
  const download = (csv, name) => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  };

  document.getElementById('export-excel-btn')?.addEventListener('click', () => {
    download(toCSV(window.SP.Expenses.getAll()), `sharepay-expenses-${new Date().toISOString().slice(0,10)}.csv`);
    SharePay.showToast('ดาวน์โหลด Excel (CSV) เรียบร้อยแล้ว ✅', 'success');
  });
  document.getElementById('export-pdf-btn')?.addEventListener('click', () => { window.print(); });

  document.getElementById('report-export-excel')?.addEventListener('click', () => {
    download(toCSV(window._lastReportExpenses || []), `sharepay-report-${window._lastReportPeriod||'report'}-${new Date().toISOString().slice(0,10)}.csv`);
    SharePay.showToast('ดาวน์โหลดรายงาน (CSV) เรียบร้อยแล้ว ✅', 'success');
  });
  document.getElementById('report-export-pdf')?.addEventListener('click', () => { window.print(); });
  document.getElementById('report-export-sheets')?.addEventListener('click', async () => {
    if (!window.SharePayConfig?.SheetsAPI?.isConfigured) {
      SharePay.showToast('ยังไม่ได้ตั้งค่า Google Apps Script URL', 'warning');
      return;
    }
    SharePay.showLoading(true, 'กำลัง sync ไปยัง Google Sheets...');
    await window.SharePayConfig.SheetsAPI.exportRows(window.SharePayConfig.SHEET_NAMES.expenses, window.SP.Expenses.getAll());
    SharePay.showLoading(false);
    SharePay.showToast('Sync ไปยัง Google Sheets เรียบร้อยแล้ว ✅', 'success');
  });
}

// ===== SEARCH / FILTERS =====
function bindSearchAndFilters() {
  document.getElementById('global-search')?.addEventListener('input', () => {
    renderMembersTable(); renderGroupsTable(); renderExpensesTable();
  });
  document.getElementById('member-search')?.addEventListener('input', renderMembersTable);
  document.getElementById('role-filter')?.addEventListener('change', renderMembersTable);
  document.getElementById('group-search')?.addEventListener('input', renderGroupsTable);
  document.getElementById('expense-search')?.addEventListener('input', renderExpensesTable);
  document.getElementById('category-filter')?.addEventListener('change', renderExpensesTable);
  document.getElementById('settlement-filter')?.addEventListener('change', renderSettlementsTable);
}

// ===== NOTIFICATION BELL =====
function bindNotifBell() {
  SharePay.updateNotifBell(currentUser.id);
  const render = () => {
    const list = document.getElementById('notif-list');
    if (!list) return;
    const notifs = window.SP.Notifications.getByMember(currentUser.id);
    list.innerHTML = notifs.length === 0
      ? '<p class="notif-empty">ไม่มีการแจ้งเตือน</p>'
      : notifs.map(n => `<div class="notif-item ${n.isRead ? '' : 'unread'}">
          <div class="notif-icon">${n.type === 'payment_received' ? '✅' : n.type === 'new_expense' ? '💸' : '🔔'}</div>
          <div class="notif-body"><div>${escHtml(n.message)}</div><div class="text-muted">${SharePay.timeAgo(n.createdAt)}</div></div>
        </div>`).join('');
  };
  render();
  document.getElementById('notif-toggle')?.addEventListener('click', () => {
    window.SP.Notifications.markAllRead(currentUser.id);
    SharePay.updateNotifBell(currentUser.id);
    render();
  });
}

// ===== SETTINGS =====
function bindSettings() {
  const darkSetting = document.getElementById('dark-mode-setting');
  if (darkSetting) {
    darkSetting.checked = document.documentElement.getAttribute('data-theme') !== 'light';
    darkSetting.addEventListener('change', () => {
      const next = darkSetting.checked ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('sharepay-theme', next);
      document.querySelectorAll('#theme-toggle, #dark-mode-toggle').forEach(b => b.textContent = next === 'dark' ? '🌙' : '☀️');
    });
  }
  document.getElementById('save-settings-btn')?.addEventListener('click', () => {
    const url = document.getElementById('sheets-url')?.value?.trim();
    if (url) localStorage.setItem('sharepay-sheets-url-note', url);
    SharePay.showToast('บันทึกการตั้งค่าเรียบร้อยแล้ว ✅', 'success');
  });
  document.getElementById('test-sheets-btn')?.addEventListener('click', async () => {
    if (!window.SharePayConfig?.SheetsAPI?.isConfigured) {
      SharePay.showToast('Google Apps Script ยังไม่ได้ตั้งค่า (ดู js/config.js)', 'warning');
      return;
    }
    SharePay.showLoading(true, 'กำลังทดสอบการเชื่อมต่อ...');
    const res = await window.SharePayConfig.SheetsAPI.getRows(window.SharePayConfig.SHEET_NAMES.members);
    SharePay.showLoading(false);
    SharePay.showToast(res ? 'เชื่อมต่อสำเร็จ ✅' : 'เชื่อมต่อไม่สำเร็จ ❌', res ? 'success' : 'error');
  });
}

function bindLogout() {
  document.querySelectorAll('[data-action="logout"], #logout-btn, .logout-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.preventDefault(); window.Auth.logout(); });
  });
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
