/**
 * SharePay - Member Module
 * จัดการหน้าสมาชิก Dashboard และฟังก์ชันสำหรับ Member
 */

import { auth, db, collections } from './app.js';
import { routeGuard, logoutUser, getUserData } from './auth.js';
import { getMemberDashboardData } from './dashboard.js';
import { getUserBalanceSummary } from './expenses.js';
import { listenToNotifications } from './notifications.js';
import {
  collection, query, where, getDocs, addDoc, updateDoc, deleteDoc,
  doc, orderBy, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ===== State =====
let currentUser = null;
let currentUserData = null;
let unsubscribers = [];

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await routeGuard();
  currentUserData = await getUserData(currentUser.uid);

  updateUserUI();
  await initMemberDashboard();
  initNavigation();
  initDarkMode();

  const unsubNotif = listenToNotifications(currentUser.uid, updateNotificationBell);
  unsubscribers.push(unsubNotif);
});

// ===== Update User UI =====
function updateUserUI() {
  const nameEl = document.getElementById('user-name');
  const avatarEl = document.getElementById('user-avatar');
  const roleEl = document.getElementById('user-role');

  if (nameEl) nameEl.textContent = currentUserData?.name || currentUser.displayName;
  if (avatarEl) avatarEl.src = currentUserData?.avatar || currentUser.photoURL;
  if (roleEl) roleEl.textContent = currentUserData?.role === 'admin' ? 'Admin' : 'Member';
}

// ===== Initialize Member Dashboard =====
async function initMemberDashboard() {
  showLoading(true);

  try {
    const [balanceSummary, dashboardData] = await Promise.all([
      getUserBalanceSummary(currentUser.uid),
      getMemberDashboardData(currentUser.uid)
    ]);

    updateBalanceCards(balanceSummary);
    renderRecentGroups(dashboardData.groups);
    renderRecentExpenses(dashboardData.expenses);
    updateMonthlyExpense(dashboardData.monthlyTotal);

  } catch (error) {
    console.error('Error initializing member dashboard:', error);
    showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
  } finally {
    showLoading(false);
  }
}

// ===== Balance Cards =====
function updateBalanceCards(balance) {
  const elements = {
    totalOwed: document.getElementById('total-owed'),
    totalOwing: document.getElementById('total-owing'),
    netBalance: document.getElementById('net-balance')
  };

  if (elements.totalOwed) {
    animateNumber(elements.totalOwed, balance.totalOwed, true);
  }
  if (elements.totalOwing) {
    animateNumber(elements.totalOwing, balance.totalOwing, true);
  }
  if (elements.netBalance) {
    const net = balance.netBalance;
    elements.netBalance.textContent = `฿${Math.abs(net).toLocaleString()}`;
    elements.netBalance.classList.toggle('positive', net >= 0);
    elements.netBalance.classList.toggle('negative', net < 0);
  }
}

// ===== Render Groups =====
function renderRecentGroups(groups) {
  const container = document.getElementById('recent-groups');
  if (!container) return;

  if (groups.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">👥</span>
        <p>ยังไม่มีกลุ่ม</p>
        <button class="btn btn-primary" onclick="openCreateGroupModal()">สร้างกลุ่มแรก</button>
      </div>
    `;
    return;
  }

  const GROUP_EMOJIS = ['🏖️', '🏔️', '🍕', '✈️', '🏠', '🎉', '🚗', '🎵'];

  container.innerHTML = groups.map((group, i) => `
    <div class="group-card glass-card fade-in" onclick="navigateToGroup('${group.id}')">
      <div class="group-emoji">${GROUP_EMOJIS[i % GROUP_EMOJIS.length]}</div>
      <div class="group-info">
        <h3 class="group-name">${group.groupName}</h3>
        <p class="group-members">${group.members?.length || 0} สมาชิก</p>
      </div>
      <div class="group-meta">
        <span class="group-total">฿${(group.totalExpenses || 0).toLocaleString()}</span>
        <span class="group-date">${formatRelativeTime(group.lastActivity)}</span>
      </div>
    </div>
  `).join('');
}

// ===== Render Expenses =====
function renderRecentExpenses(expenses) {
  const container = document.getElementById('recent-expenses');
  if (!container) return;

  const CATEGORY_ICONS = {
    food: '🍜', fuel: '⛽', accommodation: '🏨',
    transport: '🚌', drinks: '🥤', entertainment: '🎭',
    shopping: '🛍️', other: '📦'
  };

  if (expenses.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">💸</span>
        <p>ยังไม่มีค่าใช้จ่าย</p>
      </div>
    `;
    return;
  }

  container.innerHTML = expenses.slice(0, 5).map(expense => {
    const myShare = expense.paidBy === currentUser.uid
      ? expense.amount - expense.splitAmount
      : -expense.splitAmount;
    const isPositive = myShare > 0;

    return `
      <div class="expense-item fade-in">
        <div class="expense-icon">${CATEGORY_ICONS[expense.category] || '💸'}</div>
        <div class="expense-content">
          <p class="expense-title">${expense.title}</p>
          <p class="expense-meta">${expense.paidByName} จ่าย • ${formatDate(expense.createdAt)}</p>
        </div>
        <div class="expense-amount ${isPositive ? 'positive' : 'negative'}">
          ${isPositive ? '+' : ''}฿${Math.abs(myShare).toLocaleString()}
        </div>
      </div>
    `;
  }).join('');
}

// ===== Monthly Expense =====
function updateMonthlyExpense(total) {
  const el = document.getElementById('monthly-expense');
  if (el) animateNumber(el, total, true);
}

// ===== Create Group Modal =====
window.openCreateGroupModal = () => {
  const modal = document.getElementById('create-group-modal');
  if (modal) modal.classList.add('active');
};

window.closeCreateGroupModal = () => {
  const modal = document.getElementById('create-group-modal');
  if (modal) modal.classList.remove('active');
};

// ===== Handle Create Group =====
const createGroupForm = document.getElementById('create-group-form');
if (createGroupForm) {
  createGroupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const groupName = document.getElementById('group-name').value.trim();
    const groupDesc = document.getElementById('group-desc').value.trim();
    
    if (!groupName) return;

    try {
      const groupData = {
        groupName,
        description: groupDesc,
        ownerId: currentUser.uid,
        ownerName: currentUserData?.name,
        members: [currentUser.uid],
        memberNames: [currentUserData?.name],
        memberDetails: [{
          uid: currentUser.uid,
          name: currentUserData?.name,
          avatar: currentUserData?.avatar,
          role: 'owner'
        }],
        totalExpenses: 0,
        expenseCount: 0,
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, collections.groups), groupData);
      
      // อัปเดต user's groups
      await updateDoc(doc(db, collections.users, currentUser.uid), {
        groups: arrayUnion(docRef.id)
      });

      showToast('สร้างกลุ่มสำเร็จ! 🎉', 'success');
      closeCreateGroupModal();
      
      // Refresh dashboard
      await initMemberDashboard();
      
    } catch (error) {
      console.error('Error creating group:', error);
      showToast('เกิดข้อผิดพลาดในการสร้างกลุ่ม', 'error');
    }
  });
}

// ===== Navigate to Group =====
window.navigateToGroup = (groupId) => {
  window.location.href = `/pages/expense-list.html?groupId=${groupId}`;
};

// ===== Navigation =====
function initNavigation() {
  const navLinks = document.querySelectorAll('.member-nav-link');
  const sections = document.querySelectorAll('.member-section');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.dataset.section;

      navLinks.forEach(l => l.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));

      link.classList.add('active');
      const section = document.getElementById(target);
      if (section) section.classList.add('active');
    });
  });

  // Logout
  const logoutBtn = document.getElementById('member-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => logoutUser());
  }
}

// ===== Dark Mode =====
function initDarkMode() {
  const savedMode = localStorage.getItem('sharepay-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedMode);

  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('sharepay-theme', next);
    });
  }
}

// ===== Notification Bell =====
function updateNotificationBell(notifications, unreadCount) {
  const badge = document.getElementById('notif-badge');
  const dropdown = document.getElementById('notif-dropdown');

  if (badge) {
    badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
    badge.style.display = unreadCount > 0 ? 'flex' : 'none';
  }

  if (dropdown) {
    if (notifications.length === 0) {
      dropdown.innerHTML = '<p class="notif-empty">ไม่มีการแจ้งเตือน</p>';
    } else {
      dropdown.innerHTML = notifications.slice(0, 5).map(n => `
        <div class="notif-item ${n.isRead ? '' : 'unread'}" onclick="window.markNotifRead('${n.id}')">
          <p class="notif-message">${n.message}</p>
          <p class="notif-time">${formatRelativeTime(n.createdAt)}</p>
        </div>
      `).join('');
    }
  }
}

// ===== Utilities =====
function animateNumber(element, target, isCurrency = false) {
  const duration = 1000;
  const start = performance.now();

  const update = (time) => {
    const progress = Math.min((time - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = target * eased;

    element.textContent = isCurrency ? `฿${Math.round(current).toLocaleString()}` : Math.round(current);
    if (progress < 1) requestAnimationFrame(update);
  };

  requestAnimationFrame(update);
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'เพิ่งจะ';
  if (minutes < 60) return `${minutes} นาที`;
  if (hours < 24) return `${hours} ชม.`;
  return `${days} วัน`;
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

function showLoading(show) {
  const loader = document.getElementById('page-loader');
  if (loader) loader.style.display = show ? 'flex' : 'none';
}

function showToast(message, type = 'info') {
  if (window.SharePay?.showToast) window.SharePay.showToast(message, type);
}

window.markNotifRead = async (id) => {
  const { markAsRead } = await import('./notifications.js');
  await markAsRead(id);
};

window.addEventListener('beforeunload', () => {
  unsubscribers.forEach(fn => fn());
});
