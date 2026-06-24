/**
 * SharePay - Dashboard Module
 * จัดการข้อมูลแสดงผลบน Dashboard
 */

import { db, collections } from './app.js';
import {
  collection, query, where, getDocs, orderBy, limit,
  onSnapshot, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ===== ดึงสถิติสำหรับ Admin =====
/**
 * ดึงข้อมูลสถิติทั้งหมดสำหรับ Admin Dashboard
 */
export async function getAdminStats() {
  try {
    const [usersSnap, groupsSnap, expensesSnap, settlementsSnap] = await Promise.all([
      getDocs(collection(db, collections.users)),
      getDocs(collection(db, collections.groups)),
      getDocs(collection(db, collections.expenses)),
      getDocs(query(collection(db, collections.settlements), where('status', '==', 'pending')))
    ]);

    // คำนวณค่าใช้จ่ายรวม
    let totalExpenses = 0;
    let pendingSettlements = 0;
    const categoryBreakdown = {};
    const monthlyData = {};

    expensesSnap.docs.forEach(doc => {
      const expense = doc.data();
      totalExpenses += expense.amount;

      // จัดกลุ่มตามหมวดหมู่
      if (!categoryBreakdown[expense.category]) {
        categoryBreakdown[expense.category] = 0;
      }
      categoryBreakdown[expense.category] += expense.amount;

      // จัดกลุ่มตามเดือน
      if (expense.createdAt) {
        const date = expense.createdAt.toDate ? expense.createdAt.toDate() : new Date(expense.createdAt);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[monthKey]) monthlyData[monthKey] = 0;
        monthlyData[monthKey] += expense.amount;
      }
    });

    settlementsSnap.docs.forEach(doc => {
      pendingSettlements += doc.data().amount;
    });

    return {
      totalUsers: usersSnap.size,
      totalGroups: groupsSnap.size,
      totalExpenses,
      pendingSettlements,
      categoryBreakdown,
      monthlyData: Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12) // 12 เดือนล่าสุด
        .map(([month, amount]) => ({ month, amount }))
    };
  } catch (error) {
    console.error('Error getting admin stats:', error);
    throw error;
  }
}

// ===== ดึงกิจกรรมล่าสุด =====
/**
 * ดึงกิจกรรมล่าสุดสำหรับ Dashboard
 * @param {number} count - จำนวนกิจกรรมที่ต้องการ
 */
export async function getRecentActivities(count = 10) {
  try {
    const q = query(
      collection(db, collections.expenses),
      orderBy('createdAt', 'desc'),
      limit(count)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        type: 'expense',
        title: `${data.paidByName} เพิ่ม "${data.title}"`,
        amount: data.amount,
        createdAt: data.createdAt,
        category: data.category
      };
    });
  } catch (error) {
    console.error('Error getting recent activities:', error);
    return [];
  }
}

// ===== ดึงข้อมูล Member Dashboard =====
/**
 * ดึงข้อมูลสำหรับ Member Dashboard
 * @param {string} userId - User ID
 */
export async function getMemberDashboardData(userId) {
  try {
    // ดึงกลุ่มของผู้ใช้
    const groupsQuery = query(
      collection(db, collections.groups),
      where('members', 'array-contains', userId),
      orderBy('lastActivity', 'desc'),
      limit(5)
    );

    // ดึง expenses ล่าสุดของผู้ใช้
    const expensesQuery = query(
      collection(db, collections.expenses),
      where('splitMembers', 'array-contains', userId),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const [groupsSnap, expensesSnap] = await Promise.all([
      getDocs(groupsQuery),
      getDocs(expensesQuery)
    ]);

    const groups = groupsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const expenses = expensesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // คำนวณค่าใช้จ่ายเดือนนี้
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyExpenses = expenses.filter(e => {
      if (!e.createdAt) return false;
      const date = e.createdAt.toDate ? e.createdAt.toDate() : new Date(e.createdAt);
      return date >= startOfMonth;
    });

    const monthlyTotal = monthlyExpenses.reduce((sum, e) => {
      return sum + (e.splitAmount || (e.amount / e.splitMembers.length));
    }, 0);

    return { groups, expenses, monthlyTotal };
  } catch (error) {
    console.error('Error getting member dashboard data:', error);
    return { groups: [], expenses: [], monthlyTotal: 0 };
  }
}

// ===== สร้างข้อมูล Chart =====
/**
 * สร้างข้อมูลสำหรับ Pie Chart (หมวดหมู่)
 * @param {Object} categoryBreakdown - ข้อมูลหมวดหมู่
 */
export function buildCategoryChartData(categoryBreakdown) {
  const { EXPENSE_CATEGORIES } = { EXPENSE_CATEGORIES: {
    food: { label: 'ค่าอาหาร', color: '#F59E0B' },
    fuel: { label: 'ค่าน้ำมัน', color: '#EF4444' },
    accommodation: { label: 'ค่าที่พัก', color: '#8B5CF6' },
    transport: { label: 'ค่าเดินทาง', color: '#06B6D4' },
    drinks: { label: 'ค่าเครื่องดื่ม', color: '#10B981' },
    entertainment: { label: 'ความบันเทิง', color: '#F97316' },
    shopping: { label: 'ช้อปปิ้ง', color: '#EC4899' },
    other: { label: 'อื่นๆ', color: '#6B7280' }
  }};

  const labels = [];
  const data = [];
  const colors = [];

  Object.entries(categoryBreakdown).forEach(([category, amount]) => {
    const cat = EXPENSE_CATEGORIES[category] || { label: category, color: '#6B7280' };
    labels.push(cat.label);
    data.push(amount);
    colors.push(cat.color);
  });

  return { labels, data, colors };
}

// ===== Export สำหรับ PDF =====
/**
 * เตรียมข้อมูลสำหรับ Export PDF
 * @param {string} groupId - Group ID
 */
export async function prepareExportData(groupId) {
  try {
    const expensesQuery = query(
      collection(db, collections.expenses),
      where('groupId', '==', groupId),
      orderBy('createdAt', 'desc')
    );

    const settlementsQuery = query(
      collection(db, collections.settlements),
      where('groupId', '==', groupId),
      orderBy('requestedAt', 'desc')
    );

    const [expensesSnap, settlementsSnap] = await Promise.all([
      getDocs(expensesQuery),
      getDocs(settlementsQuery)
    ]);

    return {
      expenses: expensesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      settlements: settlementsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    };
  } catch (error) {
    console.error('Error preparing export data:', error);
    throw error;
  }
}
