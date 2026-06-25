/**
 * SharePay - Admin Module
 * จัดการหน้า Admin Dashboard และฟังก์ชันสำหรับผู้ดูแลระบบ
 */

import { auth, db, collections } from './js/app.js';
import { routeGuard, logoutUser } from './js/auth.js';
import { getAdminStats, getRecentActivities, buildCategoryChartData } from './js/dashboard.js';
import { listenToNotifications, markAllAsRead } from './js/notifications.js';
import {
  collection, query, getDocs, doc, updateDoc, deleteDoc,
  orderBy, onSnapshot, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ===== State =====
let currentUser = null;
let charts = {};
let unsubscribers = [];

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', async () => {
  // ตรวจสอบสิทธิ์ Admin
  currentUser = await routeGuard('admin');
  
  await initAdminDashboard();
  initNavigation();
  initSidebar();
  initSearch();
  initDarkMode();
  
  // ฟังการแจ้งเตือน
  const unsubNotif = listenToNotifications(currentUser.uid, updateNotificationBell);
  unsubscribers.push(unsubNotif);
});

// ===== Initialize Admin Dashboard =====
async function initAdminDashboard() {
  showLoading(true);
  
  try {
    const stats = await getAdminStats();
    updateStatCards(stats);
    
    await initCharts(stats);
    
    const activities = await getRecentActivities(10);
    renderRecentActivities(activities);
    
    // Real-time listeners
    initRealtimeListeners();
  } catch (error) {
    console.error('Error initializing admin dashboard:', error);
    showToast('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'error');
  } finally {
    showLoading(false);
  }
}

// ===== Update Stat Cards =====
function updateStatCards(stats) {
  const elements = {
    totalUsers: document.getElementById('stat-users'),
    totalGroups: document.getElementById('stat-groups'),
    totalExpenses: document.getElementById('stat-expenses'),
    pendingSettlements: document.getElementById('stat-pending')
  };

  if (elements.totalUsers) {
    animateNumber(elements.totalUsers, stats.totalUsers);
  }
  if (elements.totalGroups) {
    animateNumber(elements.totalGroups, stats.totalGroups);
  }
  if (elements.totalExpenses) {
    animateNumber(elements.totalExpenses, stats.totalExpenses, true);
  }
  if (elements.pendingSettlements) {
    animateNumber(elements.pendingSettlements, stats.pendingSettlements, true);
  }
}

// ===== Initialize Charts =====
async function initCharts(stats) {
  // ตรวจสอบว่า Chart.js โหลดแล้ว
  if (typeof Chart === 'undefined') {
    await loadScript('https://cdn.jsdelivr.net/npm/chart.js');
  }

  // Pie Chart - หมวดหมู่
  const pieCtx = document.getElementById('categoryChart');
  if (pieCtx) {
    const { labels, data, colors } = buildCategoryChartData(stats.categoryBreakdown);
    
    if (charts.pie) charts.pie.destroy();
    
    charts.pie = new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderWidth: 0,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary'),
              padding: 16,
              font: { size: 12, family: 'Inter' }
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => `${context.label}: ฿${context.raw.toLocaleString()}`
            }
          }
        },
        cutout: '65%'
      }
    });
  }

  // Bar Chart - รายเดือน
  const barCtx = document.getElementById('monthlyChart');
  if (barCtx) {
    const monthLabels = stats.monthlyData.map(d => {
      const [year, month] = d.month.split('-');
      const date = new Date(year, parseInt(month) - 1);
      return date.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
    });
    const monthValues = stats.monthlyData.map(d => d.amount);

    if (charts.bar) charts.bar.destroy();

    charts.bar = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: monthLabels,
        datasets: [{
          label: 'ค่าใช้จ่าย (บาท)',
          data: monthValues,
          backgroundColor: 'rgba(99, 102, 241, 0.8)',
          borderRadius: 8,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `฿${context.raw.toLocaleString()}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary')
            }
          },
          y: {
            grid: {
              color: 'rgba(255,255,255,0.05)'
            },
            ticks: {
              color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary'),
              callback: (value) => `฿${(value / 1000).toFixed(0)}K`
            }
          }
        }
      }
    });
  }
}

// ===== Render Recent Activities =====
function renderRecentActivities(activities) {
  const container = document.getElementById('recent-activities');
  if (!container) return;

  if (activities.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📭</span>
        <p>ยังไม่มีกิจกรรม</p>
      </div>
    `;
    return;
  }

  const CATEGORY_ICONS = {
    food: '🍜', fuel: '⛽', accommodation: '🏨',
    transport: '🚌', drinks: '🥤', entertainment: '🎭',
    shopping: '🛍️', other: '📦'
  };

  container.innerHTML = activities.map(activity => `
    <div class="activity-item fade-in">
      <div class="activity-icon">${CATEGORY_ICONS[activity.category] || '💸'}</div>
      <div class="activity-content">
        <p class="activity-title">${activity.title}</p>
        <p class="activity-time">${formatRelativeTime(activity.createdAt)}</p>
      </div>
      <div class="activity-amount">฿${activity.amount.toLocaleString()}</div>
    </div>
  `).join('');
}

// ===== Navigation =====
function initNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('.admin-section');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.dataset.section;

      navLinks.forEach(l => l.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));

      link.classList.add('active');
      const section = document.getElementById(target);
      if (section) {
        section.classList.add('active');
        loadSectionData(target);
      }
    });
  });
}

// ===== Load Section Data =====
async function loadSectionData(section) {
  switch (section) {
    case 'members':
      await loadMembersTable();
      break;
    case 'groups':
      await loadGroupsTable();
      break;
    case 'all-expenses':
      await loadExpensesTable();
      break;
    case 'reports':
      await loadReports();
      break;
  }
}

// ===== Load Members Table =====
async function loadMembersTable() {
  const container = document.getElementById('members-table-body');
  if (!container) return;

  container.innerHTML = '<tr><td colspan="6" class="loading-cell"><div class="spinner"></div></td></tr>';

  const snapshot = await getDocs(query(
    collection(db, collections.users),
    orderBy('createdAt', 'desc')
  ));

  const members = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  container.innerHTML = members.map(member => `
    <tr class="table-row fade-in">
      <td>
        <div class="member-cell">
          <img src="${member.avatar}" alt="${member.name}" class="member-avatar-sm">
          <span>${member.name}</span>
        </div>
      </td>
      <td>${member.email}</td>
      <td><span class="badge badge-${member.role}">${member.role === 'admin' ? 'Admin' : 'Member'}</span></td>
      <td>${formatDate(member.createdAt)}</td>
      <td>${formatDate(member.lastLogin)}</td>
      <td>
        <div class="action-buttons">
          <button class="btn-icon" onclick="toggleAdminRole('${member.id}', '${member.role}')" title="${member.role === 'admin' ? 'ลด Role' : 'เพิ่มเป็น Admin'}">
            ${member.role === 'admin' ? '👤' : '👑'}
          </button>
          <button class="btn-icon btn-danger" onclick="confirmDeleteUser('${member.id}', '${member.name}')" title="ลบสมาชิก">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ===== Toggle Admin Role =====
window.toggleAdminRole = async (userId, currentRole) => {
  const newRole = currentRole === 'admin' ? 'member' : 'admin';
  const confirm = await showConfirmDialog(
    `เปลี่ยน Role เป็น ${newRole === 'admin' ? 'Admin' : 'Member'}?`
  );
  
  if (confirm) {
    await updateDoc(doc(db, collections.users, userId), { role: newRole });
    showToast('อัปเดต Role เรียบร้อย', 'success');
    await loadMembersTable();
  }
};

// ===== Sidebar Toggle =====
function initSidebar() {
  const toggleBtn = document.getElementById('sidebar-toggle');
  const sidebar = document.querySelector('.admin-sidebar');
  
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
    });
  }

  // Logout Button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => logoutUser());
  }
}

// ===== Search =====
function initSearch() {
  const searchInput = document.getElementById('global-search');
  if (!searchInput) return;

  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => performSearch(e.target.value), 300);
  });
}

// ===== Dark Mode =====
function initDarkMode() {
  const toggle = document.getElementById('dark-mode-toggle');
  const savedMode = localStorage.getItem('sharepay-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedMode);

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
  const list = document.getElementById('notif-list');

  if (badge) {
    badge.textContent = unreadCount;
    badge.style.display = unreadCount > 0 ? 'flex' : 'none';
  }

  if (list) {
    list.innerHTML = notifications.slice(0, 5).map(n => `
      <div class="notif-item ${n.isRead ? '' : 'unread'}" onclick="markNotificationRead('${n.id}')">
        <p class="notif-message">${n.message}</p>
        <p class="notif-time">${formatRelativeTime(n.createdAt)}</p>
      </div>
    `).join('');
  }
}

// ===== Real-time Listeners =====
function initRealtimeListeners() {
  // ฟัง expenses ใหม่
  const expensesUnsub = onSnapshot(
    query(collection(db, collections.expenses), orderBy('createdAt', 'desc'), limit(1)),
    (snapshot) => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          // อัปเดต stat cards
          initAdminDashboard();
        }
      });
    }
  );
  unsubscribers.push(expensesUnsub);
}

// ===== Utilities =====
function animateNumber(element, target, isCurrency = false) {
  const duration = 1000;
  const start = performance.now();
  const startVal = 0;

  const update = (time) => {
    const elapsed = time - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = startVal + (target - startVal) * eased;

    if (isCurrency) {
      element.textContent = `฿${Math.round(current).toLocaleString()}`;
    } else {
      element.textContent = Math.round(current).toLocaleString();
    }

    if (progress < 1) requestAnimationFrame(update);
  };

  requestAnimationFrame(update);
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return 'เพิ่งจะ';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'เพิ่งจะ';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return `${days} วันที่แล้ว`;
}

function formatDate(timestamp) {
  if (!timestamp) return '-';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function showLoading(show) {
  const loader = document.getElementById('page-loader');
  if (loader) loader.style.display = show ? 'flex' : 'none';
}

function showToast(message, type = 'info') {
  if (window.SharePay?.showToast) {
    window.SharePay.showToast(message, type);
  }
}

async function showConfirmDialog(message) {
  return new Promise(resolve => {
    const modal = document.createElement('div');
    modal.className = 'confirm-modal';
    modal.innerHTML = `
      <div class="confirm-backdrop"></div>
      <div class="confirm-dialog glass-card">
        <p>${message}</p>
        <div class="confirm-buttons">
          <button class="btn btn-secondary" id="confirm-cancel">ยกเลิก</button>
          <button class="btn btn-primary" id="confirm-ok">ยืนยัน</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelector('#confirm-ok').onclick = () => { modal.remove(); resolve(true); };
    modal.querySelector('#confirm-cancel').onclick = () => { modal.remove(); resolve(false); };
  });
}

async function performSearch(term) {
  if (!term || term.length < 2) return;
  // TODO: Implement full-text search
  console.log('Searching:', term);
}

async function loadGroupsTable() {
  // TODO: Load groups data
}

async function loadExpensesTable() {
  // TODO: Load all expenses
}

async function loadReports() {
  // TODO: Load reports
}

function loadScript(src) {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

window.markNotificationRead = async (id) => {
  const { markAsRead } = await import('./notifications.js');
  await markAsRead(id);
};

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  unsubscribers.forEach(unsub => unsub());
});
