/**
 * SharePay - Member Dashboard (No Firebase)
 * All data from localStorage via window.SP
 */

const EXPENSE_CATEGORIES = {
  food:          { label: 'ค่าอาหาร',       icon: '🍜', color: '#F59E0B' },
  fuel:          { label: 'ค่าน้ำมัน',      icon: '⛽', color: '#EF4444' },
  accommodation: { label: 'ค่าที่พัก',      icon: '🏨', color: '#8B5CF6' },
  transport:     { label: 'ค่าเดินทาง',     icon: '🚌', color: '#06B6D4' },
  drinks:        { label: 'ค่าเครื่องดื่ม', icon: '🥤', color: '#10B981' },
  entertainment: { label: 'ความบันเทิง',    icon: '🎭', color: '#F97316' },
  shopping:      { label: 'ช้อปปิ้ง',       icon: '🛍️', color: '#EC4899' },
  other:         { label: 'อื่นๆ',          icon: '📦', color: '#6B7280' }
};

let currentUser = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  currentUser = window.Auth.guard();
  if (!currentUser) return;

  try {
    SharePay.initTheme();
    SharePay.populateNavUser(currentUser);
    SharePay.updateNotifBell(currentUser.id);

    initDashboard();
    initNavigation();
    initGroupForm();
    initExpenseForm();
    bindLogout();
    bindNotifications();
  } finally {
    // Hide the full-screen page loader once the dashboard is ready
    const loader = document.getElementById('page-loader');
    if (loader) loader.style.display = 'none';
  }
});

// ===== DASHBOARD =====
function initDashboard() {
  renderBalanceSummary();
  renderMyGroups();
  renderRecentExpenses();
  renderMonthlyTotal();
}

function renderBalanceSummary() {
  const expenses   = window.SP.Expenses.getByMember(currentUser.id);
  const settlements = window.SP.Settlements.getByMember(currentUser.id);

  let owed = 0, owing = 0;
  expenses.forEach(e => {
    const split = e.amount / Math.max(1, (e.splitMemberIds || []).length);
    if (e.paidById === currentUser.id) {
      (e.splitMemberIds || []).forEach(mid => { if (mid !== currentUser.id) owed += split; });
    } else if ((e.splitMemberIds || []).includes(currentUser.id)) {
      owing += split;
    }
  });

  settlements.forEach(s => {
    if (s.status === 'confirmed') {
      if (s.fromId === currentUser.id) owing  -= s.amount;
      if (s.toId   === currentUser.id) owed   -= s.amount;
    }
  });

  owed  = Math.max(0, owed);
  owing = Math.max(0, owing);
  const net = owed - owing;

  const set = (id, val, currency = true) => {
    const el = document.getElementById(id);
    if (el) el.textContent = currency ? SharePay.formatCurrency(val) : val;
  };

  set('total-owed',  owed);
  set('total-owing', owing);
  const netEl = document.getElementById('net-balance');
  if (netEl) {
    netEl.textContent = SharePay.formatCurrency(Math.abs(net));
    netEl.className = net >= 0 ? 'stat-value positive' : 'stat-value negative';
  }
}

function renderMyGroups() {
  const container = document.getElementById('recent-groups');
  if (!container) return;
  const groups = window.SP.Groups.getByMember(currentUser.id).slice(0, 6);

  if (groups.length === 0) {
    container.innerHTML = SharePay.emptyState('👥', 'ยังไม่มีกลุ่ม', 'สร้างกลุ่มใหม่เพื่อเริ่มหารค่าใช้จ่าย');
    return;
  }

  container.innerHTML = groups.map(g => {
    const memberCount = (g.memberIds || []).length;
    const total = SharePay.formatCurrency(g.totalExpenses || 0);
    return `
      <div class="group-card glass" onclick="openGroup('${g.id}')">
        <div class="group-icon">${g.icon || '👥'}</div>
        <div class="group-info">
          <h4 class="group-name">${escHtml(g.name)}</h4>
          <p class="group-meta">${memberCount} คน · ${total}</p>
        </div>
        <div class="group-arrow">›</div>
      </div>`;
  }).join('');
}

function renderRecentExpenses() {
  const container = document.getElementById('recent-expenses');
  if (!container) return;
  const expenses = window.SP.Expenses.getByMember(currentUser.id).slice(0, 8);

  if (expenses.length === 0) {
    container.innerHTML = SharePay.emptyState('💸', 'ยังไม่มีค่าใช้จ่าย', 'เพิ่มค่าใช้จ่ายในกลุ่มของคุณ');
    return;
  }

  container.innerHTML = expenses.map(e => {
    const cat = EXPENSE_CATEGORIES[e.category] || EXPENSE_CATEGORIES.other;
    const isMine = e.paidById === currentUser.id;
    return `
      <div class="expense-item">
        <div class="expense-icon" style="background:${cat.color}22;color:${cat.color}">${cat.icon}</div>
        <div class="expense-info">
          <div class="expense-title">${escHtml(e.title)}</div>
          <div class="expense-meta">${cat.label} · ${SharePay.timeAgo(e.createdAt)}</div>
        </div>
        <div class="expense-amount ${isMine ? 'positive' : 'negative'}">
          ${isMine ? '+' : '-'}${SharePay.formatCurrency(e.splitAmount || e.amount / Math.max(1,(e.splitMemberIds||[]).length))}
        </div>
      </div>`;
  }).join('');
}

function renderMonthlyTotal() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const expenses = window.SP.Expenses.getByMember(currentUser.id)
    .filter(e => e.createdAt >= startOfMonth);
  const total = expenses.reduce((s, e) => s + (e.splitAmount || e.amount / Math.max(1,(e.splitMemberIds||[]).length)), 0);
  const el = document.getElementById('monthly-expense');
  if (el) el.textContent = SharePay.formatCurrency(total);
  const countEl = document.getElementById('expense-count');
  if (countEl) countEl.textContent = expenses.length;
}

// ===== NAVIGATION =====
function initNavigation() {
  document.querySelectorAll('[data-section]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const target = btn.dataset.section;
      showSection(target);
      document.querySelectorAll('[data-section]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll(`[data-section="${target}"]`).forEach(b => b.classList.add('active'));
    });
  });

  // Mobile sidebar toggle
  const menuBtn = document.getElementById('menu-toggle');
  const sidebar = document.querySelector('.sidebar');
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', e => {
      if (!sidebar.contains(e.target) && !menuBtn.contains(e.target)) sidebar.classList.remove('open');
    });
  }
}

function showSection(name) {
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`section-${name}`);
  if (target) {
    target.classList.add('active');
    if (name === 'expenses')    renderExpensesSection();
    if (name === 'groups')      renderGroupsSection();
    if (name === 'settlements') renderSettlementsSection();
    if (name === 'notifications') renderNotificationsSection();
  }
}

// ===== EXPENSES SECTION =====
function renderExpensesSection() {
  const container = document.getElementById('expenses-list');
  if (!container) return;
  const expenses = window.SP.Expenses.getByMember(currentUser.id);

  if (expenses.length === 0) {
    container.innerHTML = SharePay.emptyState('💸', 'ยังไม่มีค่าใช้จ่าย');
    return;
  }

  container.innerHTML = expenses.map(e => {
    const cat = EXPENSE_CATEGORIES[e.category] || EXPENSE_CATEGORIES.other;
    const isMine = e.paidById === currentUser.id;
    const splitAmt = e.splitAmount || e.amount / Math.max(1,(e.splitMemberIds||[]).length);
    return `
      <div class="expense-row glass">
        <div class="expense-icon" style="background:${cat.color}22;color:${cat.color}">${cat.icon}</div>
        <div class="expense-info flex-1">
          <div class="expense-title">${escHtml(e.title)}</div>
          <div class="expense-meta">${cat.label} · ${e.paidByName || 'ไม่ทราบ'} จ่าย · ${SharePay.formatDate(e.createdAt)}</div>
          ${e.note ? `<div class="expense-note">${escHtml(e.note)}</div>` : ''}
        </div>
        <div class="expense-amounts">
          <div class="expense-total">${SharePay.formatCurrency(e.amount)}</div>
          <div class="expense-split ${isMine ? 'positive' : 'negative'}">${isMine ? 'ได้รับ' : 'ต้องจ่าย'} ${SharePay.formatCurrency(splitAmt)}</div>
        </div>
        ${isMine ? `<button class="btn-icon" onclick="deleteExpense('${e.id}')" title="ลบ">🗑️</button>` : ''}
      </div>`;
  }).join('');
}

window.deleteExpense = function(id) {
  SharePay.confirmAction('ลบค่าใช้จ่าย', 'คุณต้องการลบรายการนี้ใช่ไหม?', () => {
    window.SP.Expenses.delete(id);
    SharePay.showToast('ลบเรียบร้อยแล้ว', 'success');
    renderExpensesSection();
    initDashboard();
  });
};

// ===== GROUPS SECTION =====
function renderGroupsSection() {
  const container = document.getElementById('groups-list');
  if (!container) return;
  const groups = window.SP.Groups.getByMember(currentUser.id);

  if (groups.length === 0) {
    container.innerHTML = SharePay.emptyState('👥', 'ยังไม่มีกลุ่ม', 'สร้างกลุ่มใหม่เพื่อเริ่มต้น');
    return;
  }

  container.innerHTML = groups.map(g => {
    const members = (g.memberIds || []).map(id => window.SP.Members.getById(id)).filter(Boolean);
    return `
      <div class="group-card-full glass">
        <div class="group-header">
          <div class="group-icon-lg">${g.icon || '👥'}</div>
          <div class="group-meta-block">
            <h3>${escHtml(g.name)}</h3>
            <p>${members.length} สมาชิก · สร้างเมื่อ ${SharePay.formatDate(g.createdAt)}</p>
          </div>
          <div class="group-actions">
            <button class="btn btn-sm btn-ghost" onclick="openGroupDetail('${g.id}')">ดูรายละเอียด</button>
            <button class="btn-icon" onclick="deleteGroup('${g.id}')" title="ลบกลุ่ม">🗑️</button>
          </div>
        </div>
        <div class="group-stats">
          <div class="stat-pill">💰 ${SharePay.formatCurrency(g.totalExpenses || 0)}</div>
          <div class="stat-pill">👥 ${members.map(m => m.name).join(', ') || '-'}</div>
        </div>
      </div>`;
  }).join('');
}

window.openGroup = function(id) {
  showSection('groups');
  document.querySelectorAll('[data-section]').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('[data-section="groups"]').forEach(b => b.classList.add('active'));
};

window.openGroupDetail = function(id) {
  const group = window.SP.Groups.getById(id);
  if (!group) return;
  // Show group expense modal or navigate
  const expenses = window.SP.Expenses.getByGroup(id);
  const debts = window.SP.calculateDebts(id);

  let modal = document.getElementById('group-detail-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'group-detail-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal glass" style="max-width:600px;width:95vw;max-height:80vh;overflow-y:auto;">
      <div class="modal-header"><h2 id="gd-title"></h2><button class="btn-icon" onclick="document.getElementById('group-detail-modal').classList.remove('active')">✕</button></div>
      <div id="gd-body"></div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });
  }

  document.getElementById('gd-title').textContent = `${group.icon || '👥'} ${group.name}`;
  const members = (group.memberIds || []).map(id => window.SP.Members.getById(id)).filter(Boolean);

  document.getElementById('gd-body').innerHTML = `
    <div class="section-block">
      <h4>สมาชิก (${members.length} คน)</h4>
      <div class="member-chips">${members.map(m => `<span class="chip">${m.name}</span>`).join('')}</div>
    </div>
    <div class="section-block">
      <h4>ยอดหนี้ที่ต้องชำระ</h4>
      ${debts.length === 0
        ? '<p class="text-muted">✅ ทุกคนเท่ากันแล้ว!</p>'
        : debts.map(d => `<div class="debt-row"><span class="debt-from">${d.fromName}</span><span class="debt-arrow">→</span><span class="debt-to">${d.toName}</span><span class="debt-amount">${SharePay.formatCurrency(d.amount)}</span>
            <button class="btn btn-sm btn-primary" onclick="recordSettlement('${id}','${d.fromId}','${d.fromName}','${d.toId}','${d.toName}',${d.amount})">บันทึกการจ่าย</button></div>`).join('')
      }
    </div>
    <div class="section-block">
      <div class="flex-between mb-2"><h4>รายการค่าใช้จ่าย (${expenses.length})</h4>
      <button class="btn btn-sm btn-primary" onclick="openAddExpense('${id}')">+ เพิ่มรายการ</button></div>
      ${expenses.length === 0
        ? '<p class="text-muted">ยังไม่มีรายการ</p>'
        : expenses.slice(0,10).map(e => {
            const cat = EXPENSE_CATEGORIES[e.category] || EXPENSE_CATEGORIES.other;
            return `<div class="expense-item">
              <span>${cat.icon}</span>
              <span class="flex-1">${escHtml(e.title)}</span>
              <span class="text-muted">${e.paidByName}</span>
              <span>${SharePay.formatCurrency(e.amount)}</span>
            </div>`;
          }).join('')
      }
    </div>`;
  modal.classList.add('active');
};

window.recordSettlement = function(groupId, fromId, fromName, toId, toName, amount) {
  window.SP.Settlements.create({ groupId, fromId, fromName, toId, toName, amount, status: 'confirmed', confirmedAt: new Date().toISOString() });
  window.SP.Notifications.create({ memberId: toId, type: 'payment_received', message: `${fromName} ชำระเงิน ${SharePay.formatCurrency(amount)} แล้ว ✅` });
  SharePay.showToast('บันทึกการชำระเงินเรียบร้อย ✅', 'success');
  document.getElementById('group-detail-modal').classList.remove('active');
  initDashboard();
  renderSettlementsSection();
};

window.deleteGroup = function(id) {
  SharePay.confirmAction('ลบกลุ่ม', 'การลบกลุ่มจะลบค่าใช้จ่ายทั้งหมดด้วย ยืนยันหรือไม่?', () => {
    window.SP.Groups.delete(id);
    SharePay.showToast('ลบกลุ่มเรียบร้อยแล้ว', 'success');
    renderGroupsSection();
    initDashboard();
  });
};

// ===== SETTLEMENTS SECTION =====
function renderSettlementsSection() {
  const container = document.getElementById('settlements-list');
  if (!container) return;
  const settlements = window.SP.Settlements.getByMember(currentUser.id);

  if (settlements.length === 0) {
    container.innerHTML = SharePay.emptyState('✅', 'ไม่มียอดค้างชำระ', 'เยี่ยม! ทุกอย่างเท่ากันแล้ว');
    return;
  }

  container.innerHTML = settlements.map(s => {
    const isFrom = s.fromId === currentUser.id;
    const statusBadge = s.status === 'confirmed' ? '<span class="badge badge-success">ชำระแล้ว</span>' : '<span class="badge badge-warning">รอการยืนยัน</span>';
    return `
      <div class="settlement-row glass">
        <div class="settlement-info">
          <div>${isFrom ? '💸 จ่ายให้' : '💰 รับจาก'} <strong>${isFrom ? s.toName : s.fromName}</strong></div>
          <div class="text-muted">${SharePay.formatDate(s.createdAt)}</div>
        </div>
        <div class="settlement-right">
          <div class="settlement-amount ${isFrom ? 'negative' : 'positive'}">${isFrom ? '-' : '+'}${SharePay.formatCurrency(s.amount)}</div>
          ${statusBadge}
        </div>
      </div>`;
  }).join('');
}

// ===== NOTIFICATIONS =====
function renderNotificationsSection() {
  const container = document.getElementById('notifications-list');
  if (!container) return;
  const notifs = window.SP.Notifications.getByMember(currentUser.id);
  window.SP.Notifications.markAllRead(currentUser.id);
  SharePay.updateNotifBell(currentUser.id);

  if (notifs.length === 0) {
    container.innerHTML = SharePay.emptyState('🔔', 'ไม่มีการแจ้งเตือน');
    return;
  }

  container.innerHTML = notifs.map(n => `
    <div class="notif-item ${n.isRead ? '' : 'unread'} glass">
      <div class="notif-icon">${n.type === 'payment_received' ? '✅' : n.type === 'new_expense' ? '💸' : '🔔'}</div>
      <div class="notif-body">
        <div>${n.message}</div>
        <div class="text-muted">${SharePay.timeAgo(n.createdAt)}</div>
      </div>
    </div>`).join('');
}

function bindNotifications() {
  const bell = document.getElementById('notif-bell');
  if (bell) bell.addEventListener('click', () => showSection('notifications'));
}

// ===== CREATE GROUP FORM =====
function initGroupForm() {
  const form = document.getElementById('create-group-form');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('group-name')?.value?.trim();
    const icon = document.querySelector('.icon-btn.selected')?.dataset?.icon || '👥';
    if (!name) { SharePay.showToast('กรุณาระบุชื่อกลุ่ม', 'error'); return; }

    const group = window.SP.Groups.create({ name, icon, memberIds: [currentUser.id], createdBy: currentUser.id });
    window.SP.Members.update(currentUser.id, {}); // trigger save
    SharePay.showToast(`สร้างกลุ่ม "${name}" เรียบร้อยแล้ว! 🎉`, 'success');
    form.reset();
    document.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('selected'));
    initDashboard();
    showSection('groups');
    document.querySelectorAll('[data-section]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('[data-section="groups"]').forEach(b => b.classList.add('active'));
  });

  // Icon picker
  document.querySelectorAll('.icon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
}

// ===== ADD EXPENSE =====
window.openAddExpense = function(groupId) {
  document.getElementById('group-detail-modal')?.classList.remove('active');
  let modal = document.getElementById('add-expense-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'add-expense-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal glass" style="max-width:500px;width:95vw;">
      <div class="modal-header"><h3>เพิ่มค่าใช้จ่าย</h3><button class="btn-icon" onclick="document.getElementById('add-expense-modal').classList.remove('active')">✕</button></div>
      <form id="add-expense-form" style="padding:1.5rem;display:flex;flex-direction:column;gap:1rem;">
        <input type="hidden" id="ae-group-id">
        <div class="form-group"><label class="form-label">ชื่อรายการ *</label><input class="form-input" id="ae-title" placeholder="เช่น ค่าข้าวเที่ยง" required></div>
        <div class="form-group"><label class="form-label">จำนวนเงิน (฿) *</label><input class="form-input" id="ae-amount" type="number" min="0.01" step="0.01" placeholder="0.00" required></div>
        <div class="form-group"><label class="form-label">หมวดหมู่</label>
          <select class="form-input" id="ae-cat">
            ${Object.entries(EXPENSE_CATEGORIES).map(([k,v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">หมายเหตุ</label><input class="form-input" id="ae-note" placeholder="(ไม่บังคับ)"></div>
        <div class="form-group"><label class="form-label">สมาชิกที่หาร</label><div id="ae-members" class="checkbox-group"></div></div>
        <button type="submit" class="btn btn-primary">บันทึกค่าใช้จ่าย</button>
      </form>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });
    document.getElementById('add-expense-form').addEventListener('submit', submitExpense);
  }

  document.getElementById('ae-group-id').value = groupId;
  const group = window.SP.Groups.getById(groupId);
  const members = (group?.memberIds || []).map(id => window.SP.Members.getById(id)).filter(Boolean);
  const membersDiv = document.getElementById('ae-members');
  membersDiv.innerHTML = members.map(m => `
    <label class="checkbox-label">
      <input type="checkbox" name="ae-member" value="${m.id}" data-name="${m.name}" ${m.id === currentUser.id ? 'checked' : ''}> ${m.name}
    </label>`).join('');
  modal.classList.add('active');
};

function submitExpense(e) {
  e.preventDefault();
  const groupId   = document.getElementById('ae-group-id').value;
  const title     = document.getElementById('ae-title').value.trim();
  const amount    = parseFloat(document.getElementById('ae-amount').value);
  const category  = document.getElementById('ae-cat').value;
  const note      = document.getElementById('ae-note').value.trim();
  const checked   = [...document.querySelectorAll('[name="ae-member"]:checked')];

  if (!title || !amount || amount <= 0) { SharePay.showToast('กรุณากรอกข้อมูลให้ครบ', 'error'); return; }
  if (checked.length === 0) { SharePay.showToast('เลือกสมาชิกอย่างน้อย 1 คน', 'error'); return; }

  const splitMemberIds   = checked.map(c => c.value);
  const splitMemberNames = checked.map(c => c.dataset.name);
  const splitAmount      = amount / splitMemberIds.length;

  window.SP.Expenses.create({
    groupId, title, category, amount, note,
    paidById: currentUser.id, paidByName: currentUser.name,
    splitMemberIds, splitMemberNames, splitAmount,
    createdBy: currentUser.id
  });

  // Notify other members
  splitMemberIds.forEach(mid => {
    if (mid !== currentUser.id) {
      window.SP.Notifications.create({ memberId: mid, type: 'new_expense', message: `${currentUser.name} เพิ่มค่าใช้จ่าย "${title}" คุณต้องจ่าย ${SharePay.formatCurrency(splitAmount)}` });
    }
  });

  SharePay.showToast('บันทึกค่าใช้จ่ายเรียบร้อย! 💸', 'success');
  document.getElementById('add-expense-modal').classList.remove('active');
  document.getElementById('add-expense-form').reset();
  initDashboard();
  renderExpensesSection();
}

function initExpenseForm() {
  const addBtn = document.getElementById('add-expense-btn') || document.querySelector('[data-action="add-expense"]');
  if (!addBtn) return;
  addBtn.addEventListener('click', () => {
    const groups = window.SP.Groups.getByMember(currentUser.id);
    if (groups.length === 0) { SharePay.showToast('สร้างกลุ่มก่อนเพิ่มค่าใช้จ่าย', 'warning'); return; }
    openAddExpense(groups[0].id);
  });
}

function bindLogout() {
  document.querySelectorAll('[data-action="logout"], #logout-btn, .logout-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.preventDefault(); window.Auth.logout(); });
  });
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
