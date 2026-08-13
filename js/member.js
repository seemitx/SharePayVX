/**
 * SharePay - Member Dashboard (No Firebase)
 * All data from localStorage via window.SP
 */

const EXPENSE_CATEGORIES = {
  food:          { label: 'ค่าอาหาร',       icon: '🍜', color: '#F59E0B' },
  fuel:          { label: 'ค่าน้ำมัน',      icon: '⛽', color: '#EF4444' },
  accommodation: { label: 'ค่าที่พัก',      icon: '🏨', color: '#22D3EE' },
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
    initSettleTabs();
    bindLogout();
    bindNotifications();
    updateSettleBadge();
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
  updateSettleBadge();
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
  if (netEl) netEl.textContent = SharePay.formatCurrency(Math.abs(net));
  const statusEl = document.getElementById('balance-status');
  if (statusEl) {
    statusEl.textContent = net > 0.004 ? 'คุณจะได้รับเงินคืน 🎉' : net < -0.004 ? 'คุณมียอดที่ต้องจ่าย' : 'ทุกอย่างเท่ากันแล้ว ✅';
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
  const groupCountEl = document.getElementById('group-count');
  if (groupCountEl) groupCountEl.textContent = window.SP.Groups.getByMember(currentUser.id).length;
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
  document.querySelectorAll('.member-section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`section-${name}`);
  if (target) {
    target.classList.add('active');
    window.scrollTo(0, 0);
    if (name === 'expenses') renderExpensesSection();
    if (name === 'groups')   renderGroupsSection();
    if (name === 'settle')   renderSettlementsSection();
  }
}

// ===== EXPENSES SECTION =====
function renderExpensesSection() {
  const container = document.getElementById('all-expenses-list');
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
  const container = document.getElementById('all-groups-list');
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
  const settledGroup = window.SP.Groups.getById(groupId);
  window.Discord?.notifySettlement({ groupName: settledGroup?.name, fromName, toName, amount });
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

// Expenses in a group that were shared between exactly these two people
// (used to show "related items" on a debt card)
function getRelatedExpenses(groupId, aId, bId) {
  return window.SP.Expenses.getByGroup(groupId).filter(e => {
    const split = e.splitMemberIds || [];
    return (e.paidById === aId && split.includes(bId)) || (e.paidById === bId && split.includes(aId));
  });
}

// All of this member's live, calculated debts across every group they're in.
// `owe`  = money the member needs to pay someone else
// `owed` = money someone else needs to pay the member
function getMyDebts(memberId) {
  const owe = [];
  const owed = [];
  window.SP.Groups.getByMember(memberId).forEach(g => {
    window.SP.calculateDebts(g.id).forEach(d => {
      if (d.fromId !== memberId && d.toId !== memberId) return;
      const entry = {
        groupId: g.id, groupName: g.name, groupIcon: g.icon || '👥',
        fromId: d.fromId, fromName: d.fromName,
        toId: d.toId, toName: d.toName,
        amount: d.amount,
        items: getRelatedExpenses(g.id, d.fromId, d.toId)
      };
      (d.fromId === memberId ? owe : owed).push(entry);
    });
  });
  return { owe, owed };
}

function avatarUrl(member, bg) {
  if (member?.avatar) return member.avatar;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(member?.name || '?')}&background=${bg}&color=fff`;
}

// Escapes a string for safe embedding inside a single-quoted onclick="..." JS string
function jsStr(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function renderDebtCard(entry, direction) {
  const iAmPayer = direction === 'owe';
  const other = window.SP.Members.getById(iAmPayer ? entry.toId : entry.fromId);
  const meAvatar    = avatarUrl(currentUser, '0EA5E9');
  const otherAvatar = avatarUrl(other, '22D3EE');
  const otherName   = other?.name || (iAmPayer ? entry.toName : entry.fromName);

  const leftUser  = iAmPayer ? { name: 'ฉัน', avatar: meAvatar } : { name: otherName, avatar: otherAvatar };
  const rightUser = iAmPayer ? { name: otherName, avatar: otherAvatar } : { name: 'ฉัน', avatar: meAvatar };

  const shownItems = entry.items.slice(0, 3).map(i => escHtml(i.title)).join(', ');
  const moreCount = entry.items.length - 3;
  const itemsLine = entry.items.length
    ? `เกี่ยวข้องกับ <strong>${shownItems}</strong>${moreCount > 0 ? ` และอีก ${moreCount} รายการ` : ''}`
    : 'ยอดคงเหลือจากกลุ่มนี้';

  const btnLabel = iAmPayer ? '✓ จ่ายแล้ว' : '✓ ได้รับแล้ว';

  return `
    <div class="settlement-card glass">
      <div class="settlement-parties">
        <div class="settlement-user">
          <img class="settlement-avatar" src="${leftUser.avatar}" alt="${escHtml(leftUser.name)}">
          <span class="settlement-name">${escHtml(leftUser.name)}</span>
        </div>
        <div class="settlement-arrow">
          <div class="arrow-line"></div>
          <span class="settlement-amount">${SharePay.formatCurrency(entry.amount)}</span>
        </div>
        <div class="settlement-user">
          <img class="settlement-avatar" src="${rightUser.avatar}" alt="${escHtml(rightUser.name)}">
          <span class="settlement-name">${escHtml(rightUser.name)}</span>
        </div>
      </div>
      <div class="settlement-group-meta">${entry.groupIcon} ${escHtml(entry.groupName)}</div>
      <div class="settlement-items">${itemsLine}</div>
      <div class="settlement-actions">
        <button class="btn btn-primary" onclick="window.paySettlementDebt('${entry.groupId}','${entry.fromId}','${jsStr(entry.fromName)}','${entry.toId}','${jsStr(entry.toName)}',${entry.amount},${iAmPayer})">${btnLabel}</button>
      </div>
    </div>`;
}

function updateSettleBadge() {
  if (!currentUser) return;
  const { owe, owed } = getMyDebts(currentUser.id);
  const count = owe.length + owed.length;
  const badge = document.getElementById('settle-nav-badge');
  if (badge) {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}

function initSettleTabs() {
  document.querySelectorAll('[data-settle-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-settle-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.settleTab;
      document.getElementById('settle-panel-pending')?.classList.toggle('active', tab === 'pending');
      document.getElementById('settle-panel-history')?.classList.toggle('active', tab === 'history');
    });
  });
}

function renderSettlementsSection() {
  if (!currentUser) return;
  const { owe, owed } = getMyDebts(currentUser.id);
  const totalOwe  = owe.reduce((s, e) => s + e.amount, 0);
  const totalOwed = owed.reduce((s, e) => s + e.amount, 0);

  const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setTxt('settle-total-owe', SharePay.formatCurrency(totalOwe));
  setTxt('settle-total-owed', SharePay.formatCurrency(totalOwed));
  setTxt('settle-pending-count', owe.length + owed.length);

  // ----- Pending panel -----
  const pendingContainer = document.getElementById('settlement-list');
  if (pendingContainer) {
    if (owe.length === 0 && owed.length === 0) {
      pendingContainer.innerHTML = SharePay.emptyState('🤝', 'ไม่มีหนี้ที่รอชำระ', 'เยี่ยม! คุณไม่มีหนี้ค้างชำระ');
    } else {
      const oweHtml  = owe.length  ? `<h4 class="settle-group-title">💸 ที่ต้องจ่าย</h4>${owe.map(e => renderDebtCard(e, 'owe')).join('')}` : '';
      const owedHtml = owed.length ? `<h4 class="settle-group-title">💰 ที่ต้องได้รับ</h4>${owed.map(e => renderDebtCard(e, 'owed')).join('')}` : '';
      pendingContainer.innerHTML = oweHtml + owedHtml;
    }
  }

  // ----- History panel -----
  const historyContainer = document.getElementById('settlement-history-list');
  if (historyContainer) {
    const history = window.SP.Settlements.getByMember(currentUser.id)
      .filter(s => s.status === 'confirmed')
      .sort((a, b) => (b.confirmedAt || b.createdAt).localeCompare(a.confirmedAt || a.createdAt));

    if (history.length === 0) {
      historyContainer.innerHTML = SharePay.emptyState('📜', 'ยังไม่มีประวัติการชำระเงิน');
    } else {
      historyContainer.innerHTML = history.map(s => {
        const isFrom = s.fromId === currentUser.id;
        return `
          <div class="settlement-row glass">
            <div class="settlement-info">
              <div>${isFrom ? '💸 จ่ายให้' : '💰 รับจาก'} <strong>${escHtml(isFrom ? s.toName : s.fromName)}</strong></div>
              <div class="text-muted">${SharePay.formatDate(s.confirmedAt || s.createdAt)}</div>
            </div>
            <div class="settlement-right">
              <div class="settlement-amount ${isFrom ? 'negative' : 'positive'}">${isFrom ? '-' : '+'}${SharePay.formatCurrency(s.amount)}</div>
              <span class="badge badge-success">จ่ายแล้ว</span>
            </div>
          </div>`;
      }).join('');
    }
  }

  updateSettleBadge();
}

// Shared bookkeeping for "money changed hands": records the settlement,
// notifies both members in-app, and pings the Discord webhook.
function createSettlementRecord(groupId, fromId, fromName, toId, toName, amount) {
  window.SP.Settlements.create({ groupId, fromId, fromName, toId, toName, amount, status: 'confirmed', confirmedAt: new Date().toISOString() });
  window.SP.Notifications.create({ memberId: toId, type: 'payment_received', message: `${fromName} ชำระเงิน ${SharePay.formatCurrency(amount)} แล้ว ✅` });
  if (fromId !== toId) {
    window.SP.Notifications.create({ memberId: fromId, type: 'payment_sent', message: `คุณชำระเงิน ${SharePay.formatCurrency(amount)} ให้ ${toName} เรียบร้อยแล้ว ✅` });
  }
  const settledGroup = window.SP.Groups.getById(groupId);
  window.Discord?.notifySettlement({ groupName: settledGroup?.name, fromName, toName, amount });
}

// Called from a group's debt list ("บันทึกการจ่าย")
window.recordSettlement = function(groupId, fromId, fromName, toId, toName, amount) {
  SharePay.confirmAction(
    'ยืนยันการบันทึกชำระเงิน',
    `บันทึกว่า "${fromName}" จ่ายให้ "${toName}" จำนวน ${SharePay.formatCurrency(amount)} ใช่หรือไม่?`,
    () => {
      createSettlementRecord(groupId, fromId, fromName, toId, toName, amount);
      SharePay.showToast('บันทึกการชำระเงินเรียบร้อย ✅', 'success');
      document.getElementById('group-detail-modal')?.classList.remove('active');
      initDashboard();
      renderSettlementsSection();
    },
    'primary'
  );
};

// Called from the "การชำระหนี้" tab's "✓ จ่ายแล้ว / ✓ ได้รับแล้ว" button
window.paySettlementDebt = function(groupId, fromId, fromName, toId, toName, amount, iAmPayer) {
  const title = iAmPayer ? 'ยืนยันว่าจ่ายแล้ว' : 'ยืนยันว่าได้รับเงินแล้ว';
  const message = iAmPayer
    ? `ยืนยันว่าคุณจ่ายเงิน ${SharePay.formatCurrency(amount)} ให้ "${toName}" เรียบร้อยแล้วใช่ไหม?`
    : `ยืนยันว่าคุณได้รับเงิน ${SharePay.formatCurrency(amount)} จาก "${fromName}" เรียบร้อยแล้วใช่ไหม?`;

  SharePay.confirmAction(title, message, () => {
    createSettlementRecord(groupId, fromId, fromName, toId, toName, amount);
    SharePay.showToast('บันทึกการชำระเงินเรียบร้อย ✅ ย้ายไปหน้าประวัติแล้ว', 'success');
    initDashboard();
    renderSettlementsSection();
  }, 'primary');
};

// ===== NOTIFICATIONS =====
function renderNotifDropdown() {
  const container = document.getElementById('notif-items');
  if (!container) return;
  const notifs = window.SP.Notifications.getByMember(currentUser.id);

  if (notifs.length === 0) {
    container.innerHTML = '<p class="notif-empty">ไม่มีการแจ้งเตือน</p>';
    return;
  }

  container.innerHTML = notifs.map(n => `
    <div class="notif-item ${n.isRead ? '' : 'unread'}">
      <div class="notif-icon">${n.type === 'payment_received' ? '✅' : n.type === 'new_expense' ? '💸' : '🔔'}</div>
      <div class="notif-body">
        <div>${escHtml(n.message)}</div>
        <div class="text-muted">${SharePay.timeAgo(n.createdAt)}</div>
      </div>
    </div>`).join('');
}

function bindNotifications() {
  const bell = document.getElementById('notif-bell');
  renderNotifDropdown();
  if (bell) {
    bell.addEventListener('click', () => {
      if (bell.classList.contains('open')) {
        renderNotifDropdown();
      }
    });
  }
  document.getElementById('mark-all-read-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.SP.Notifications.markAllRead(currentUser.id);
    SharePay.updateNotifBell(currentUser.id);
    renderNotifDropdown();
  });
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
    window.Discord?.notifyNewGroup({ groupName: name, groupIcon: icon, creatorName: currentUser.name, memberCount: 1 });
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
  const modal = document.getElementById('add-expense-modal');
  if (!modal) return;

  const form = document.getElementById('add-expense-form');
  form.reset();
  document.getElementById('receipt-preview').style.display = 'none';
  document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
  document.querySelector('.category-btn[data-cat="food"]')?.classList.add('selected');
  document.getElementById('expense-category').value = 'food';
  document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
  resetAddMemberInline();

  // Populate group dropdown with the current user's groups
  const groups = window.SP.Groups.getByMember(currentUser.id);
  const groupSelect = document.getElementById('expense-group');
  groupSelect.innerHTML = '<option value="">เลือกกลุ่ม</option>' +
    groups.map(g => `<option value="${g.id}">${g.icon || '👥'} ${g.name}</option>`).join('');
  groupSelect.value = groupId || (groups[0]?.id ?? '');

  populateExpenseGroupDependentFields();
  modal.classList.add('active');
};

// Fill "ผู้จ่าย" (paid by) select and "หารกับ" (split with) checkboxes based on the selected group
function populateExpenseGroupDependentFields() {
  const groupId = document.getElementById('expense-group').value;
  const paidBySelect   = document.getElementById('expense-paidby');
  const memberSelector = document.getElementById('member-selector');
  const group = groupId ? window.SP.Groups.getById(groupId) : null;
  const members = (group?.memberIds || []).map(id => window.SP.Members.getById(id)).filter(Boolean);

  if (!group || members.length === 0) {
    paidBySelect.innerHTML = '<option value="">เลือกผู้จ่าย</option>';
    memberSelector.innerHTML = '<p style="color: var(--text-tertiary); font-size: var(--text-sm);">เลือกกลุ่มก่อน</p>';
    updateSplitPreview();
    return;
  }

  paidBySelect.innerHTML = members.map(m =>
    `<option value="${m.id}" ${m.id === currentUser.id ? 'selected' : ''}>${escHtml(m.name)}${m.isGuest ? ' (เพิ่มเอง)' : ''}</option>`).join('');

  memberSelector.innerHTML = members.map(m => `
    <label class="member-checkbox-item">
      <input type="checkbox" name="ae-member" value="${m.id}" data-name="${escHtml(m.name)}" ${m.id === currentUser.id ? 'checked' : ''}>
      <img class="member-checkbox-avatar" src="${m.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=3B82F6&color=fff`}" alt="${escHtml(m.name)}">
      <span class="member-checkbox-name">${escHtml(m.name)}</span>
      ${m.isGuest ? '<span class="member-checkbox-guest-tag">เพิ่มเอง</span>' : ''}
    </label>`).join('');

  memberSelector.querySelectorAll('input[name="ae-member"]').forEach(cb => {
    cb.addEventListener('change', updateSplitPreview);
  });

  updateSplitPreview();
}

// Re-populate the payer/split fields after a guest is added mid-form, without
// losing whatever the user had already picked (rebuilds, then restores selection).
function refreshExpenseMemberFields(autoCheckId) {
  const prevChecked = new Set([...document.querySelectorAll('[name="ae-member"]:checked')].map(cb => cb.value));
  const prevPayer = document.getElementById('expense-paidby').value;
  if (autoCheckId) prevChecked.add(autoCheckId);

  populateExpenseGroupDependentFields();

  document.querySelectorAll('[name="ae-member"]').forEach(cb => {
    cb.checked = prevChecked.has(cb.value);
  });
  const paidBySelect = document.getElementById('expense-paidby');
  if (prevPayer && [...paidBySelect.options].some(o => o.value === prevPayer)) {
    paidBySelect.value = prevPayer;
  }
  updateSplitPreview();
}

// Reset the "add a custom name" mini-form back to its collapsed state
function resetAddMemberInline() {
  const inlineRow = document.getElementById('add-member-inline');
  const showBtn = document.getElementById('show-add-member-btn');
  const nameInput = document.getElementById('new-member-name');
  if (nameInput) nameInput.value = '';
  inlineRow?.classList.remove('active');
  if (showBtn) showBtn.style.display = '';
}

// Let the person type a name that isn't a registered account (a "guest"), add
// them to the selected group, and make them immediately pickable as ผู้จ่าย/หารกับ.
function addCustomGuestMember() {
  const groupId = document.getElementById('expense-group').value;
  const nameInput = document.getElementById('new-member-name');
  const name = (nameInput?.value || '').trim();

  if (!groupId) { SharePay.showToast('กรุณาเลือกกลุ่มก่อน', 'error'); return; }
  if (!name) { SharePay.showToast('กรุณาพิมพ์ชื่อ', 'error'); return; }

  const group = window.SP.Groups.getById(groupId);
  const existingNames = (group?.memberIds || [])
    .map(id => window.SP.Members.getById(id)?.name?.toLowerCase())
    .filter(Boolean);
  if (existingNames.includes(name.toLowerCase())) {
    SharePay.showToast('มีชื่อนี้ในกลุ่มอยู่แล้ว', 'error');
    return;
  }

  const guest = window.SP.Members.create({
    name,
    email: `guest-${window.SP.genId()}@sharepay.local`,
    role: 'guest',
    isGuest: true
  });

  window.SP.Groups.update(groupId, { memberIds: [...(group?.memberIds || []), guest.id] });

  resetAddMemberInline();
  refreshExpenseMemberFields(guest.id);
  SharePay.showToast(`เพิ่ม "${name}" เข้ากลุ่มแล้ว ✅`, 'success');
}

// Live-update the "สรุปการหาร" (split summary) preview
function updateSplitPreview() {
  const amount = parseFloat(document.getElementById('expense-amount').value) || 0;
  const checked = [...document.querySelectorAll('[name="ae-member"]:checked')];
  const preview = document.getElementById('split-preview');
  const items = document.getElementById('split-preview-items');

  if (checked.length === 0 || amount <= 0) {
    preview.style.display = 'none';
    return;
  }

  const splitAmount = amount / checked.length;
  items.innerHTML = checked.map(c => `
    <div class="split-item">
      <span class="split-item-name">${c.dataset.name}</span>
      <span class="split-item-amount">${SharePay.formatCurrency(splitAmount)}</span>
    </div>`).join('');
  preview.style.display = 'block';
}

function submitExpense(e) {
  e.preventDefault();
  const groupId   = document.getElementById('expense-group').value;
  const title     = document.getElementById('expense-title').value.trim();
  const amount    = parseFloat(document.getElementById('expense-amount').value);
  const category  = document.getElementById('expense-category').value;
  const paidById  = document.getElementById('expense-paidby').value;
  const note      = document.getElementById('expense-note').value.trim();
  const date      = document.getElementById('expense-date').value;
  const checked   = [...document.querySelectorAll('[name="ae-member"]:checked')];

  if (!groupId) { SharePay.showToast('กรุณาเลือกกลุ่ม', 'error'); return; }
  if (!title || !amount || amount <= 0) { SharePay.showToast('กรุณากรอกข้อมูลให้ครบ', 'error'); return; }
  if (!paidById) { SharePay.showToast('กรุณาเลือกผู้จ่าย', 'error'); return; }
  if (checked.length === 0) { SharePay.showToast('เลือกสมาชิกอย่างน้อย 1 คน', 'error'); return; }

  const paidByMember     = window.SP.Members.getById(paidById);
  const group            = window.SP.Groups.getById(groupId);
  const catInfo           = EXPENSE_CATEGORIES[category] || EXPENSE_CATEGORIES.other;
  const splitMemberIds   = checked.map(c => c.value);
  const splitMemberNames = checked.map(c => c.dataset.name);
  const splitAmount      = amount / splitMemberIds.length;

  const expense = window.SP.Expenses.create({
    groupId, title, category, amount, note, date,
    paidById, paidByName: paidByMember?.name || currentUser.name,
    splitMemberIds, splitMemberNames, splitAmount,
    createdBy: currentUser.id
  });

  window.Discord?.notifyNewExpense({
    groupName: group?.name || '-', groupIcon: group?.icon,
    title, categoryLabel: catInfo.label, categoryIcon: catInfo.icon,
    amount, paidByName: paidByMember?.name || currentUser.name,
    splitMemberNames, splitAmount, note, date
  });

  // Notify other members
  splitMemberIds.forEach(mid => {
    if (mid !== paidById) {
      window.SP.Notifications.create({ memberId: mid, type: 'new_expense', message: `${paidByMember?.name || currentUser.name} เพิ่มค่าใช้จ่าย "${title}" คุณต้องจ่าย ${SharePay.formatCurrency(splitAmount)}` });
    }
  });

  SharePay.showToast('บันทึกค่าใช้จ่ายเรียบร้อย! 💸', 'success');
  document.getElementById('add-expense-modal').classList.remove('active');
  document.getElementById('add-expense-form').reset();
  document.getElementById('split-preview').style.display = 'none';
  resetAddMemberInline();
  initDashboard();
  renderExpensesSection();
}

function initExpenseForm() {
  const form = document.getElementById('add-expense-form');
  if (!form) return;
  form.addEventListener('submit', submitExpense);
  document.getElementById('expense-group')?.addEventListener('change', () => {
    resetAddMemberInline();
    populateExpenseGroupDependentFields();
  });
  document.getElementById('expense-amount')?.addEventListener('input', updateSplitPreview);

  // "เพิ่มชื่อคนใหม่" (add a custom/guest name) mini-form
  const showBtn    = document.getElementById('show-add-member-btn');
  const inlineRow  = document.getElementById('add-member-inline');
  const nameInput  = document.getElementById('new-member-name');

  showBtn?.addEventListener('click', () => {
    inlineRow.classList.add('active');
    showBtn.style.display = 'none';
    nameInput?.focus();
  });
  document.getElementById('cancel-add-member-btn')?.addEventListener('click', resetAddMemberInline);
  document.getElementById('confirm-add-member-btn')?.addEventListener('click', addCustomGuestMember);
  nameInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addCustomGuestMember(); }
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
