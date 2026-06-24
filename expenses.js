/**
 * SharePay - Expenses Module
 * จัดการระบบค่าใช้จ่าย การเพิ่ม แก้ไข ลบ และคำนวณการหาร
 */

import { db, storage, collections, SheetsAPI, sheetsConfig } from './app.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs,
  query, where, orderBy, limit, onSnapshot, serverTimestamp,
  getDoc, writeBatch, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ===== หมวดหมู่ค่าใช้จ่าย =====
export const EXPENSE_CATEGORIES = {
  food: { label: 'ค่าอาหาร', icon: '🍜', color: '#F59E0B' },
  fuel: { label: 'ค่าน้ำมัน', icon: '⛽', color: '#EF4444' },
  accommodation: { label: 'ค่าที่พัก', icon: '🏨', color: '#8B5CF6' },
  transport: { label: 'ค่าเดินทาง', icon: '🚌', color: '#06B6D4' },
  drinks: { label: 'ค่าเครื่องดื่ม', icon: '🥤', color: '#10B981' },
  entertainment: { label: 'ความบันเทิง', icon: '🎭', color: '#F97316' },
  shopping: { label: 'ช้อปปิ้ง', icon: '🛍️', color: '#EC4899' },
  other: { label: 'อื่นๆ', icon: '📦', color: '#6B7280' }
};

// ===== เพิ่มค่าใช้จ่าย =====
/**
 * เพิ่มรายการค่าใช้จ่ายใหม่
 * @param {Object} expenseData - ข้อมูลค่าใช้จ่าย
 * @param {File} receiptFile - ไฟล์รูปใบเสร็จ (optional)
 */
export async function addExpense(expenseData, receiptFile = null) {
  try {
    let receiptUrl = null;

    // อัปโหลดรูปใบเสร็จถ้ามี
    if (receiptFile) {
      const storageRef = ref(storage, `receipts/${expenseData.groupId}/${Date.now()}_${receiptFile.name}`);
      await uploadBytes(storageRef, receiptFile);
      receiptUrl = await getDownloadURL(storageRef);
    }

    // คำนวณการแบ่งหนี้
    const splitAmount = expenseData.amount / expenseData.splitMembers.length;
    const splits = {};
    expenseData.splitMembers.forEach(memberId => {
      splits[memberId] = {
        amount: splitAmount,
        paid: memberId === expenseData.paidBy, // ผู้จ่ายถือว่าจ่ายแล้ว
        settledAt: null
      };
    });

    const expense = {
      groupId: expenseData.groupId,
      title: expenseData.title,
      category: expenseData.category,
      amount: expenseData.amount,
      paidBy: expenseData.paidBy,        // uid ของผู้จ่าย
      paidByName: expenseData.paidByName, // ชื่อผู้จ่าย
      splitMembers: expenseData.splitMembers, // array ของ uid
      splitMemberNames: expenseData.splitMemberNames, // array ของชื่อ
      splitAmount: splitAmount,
      splits: splits,                     // ข้อมูลการแบ่งหนี้รายคน
      receiptImage: receiptUrl,
      note: expenseData.note || '',
      createdBy: expenseData.createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, collections.expenses), expense);

    // สร้างการแจ้งเตือนให้สมาชิกที่เกี่ยวข้อง
    await createExpenseNotifications(docRef.id, expense);

    // อัปเดตยอดหนี้ในกลุ่ม
    await updateGroupBalances(expenseData.groupId, expense, docRef.id);

    // ===== Sync ไปยัง Google Sheets =====
    try {
      await SheetsAPI.exportRows(sheetsConfig.sheets.expenses, [{
        id:               docRef.id,
        title:            expense.title,
        category:         expense.category,
        amount:           expense.amount,
        paidBy:           expense.paidByName,
        splitMembers:     (expense.splitMemberNames || []).join(', '),
        splitAmount:      expense.splitAmount,
        groupId:          expense.groupId,
        note:             expense.note,
        createdAt:        new Date().toISOString()
      }]);
    } catch (sheetsErr) {
      // ไม่ให้ error ของ Sheets กระทบ Firebase
      console.warn('[SheetsAPI] Expense sync failed (non-critical):', sheetsErr);
    }

    return { id: docRef.id, ...expense };
  } catch (error) {
    console.error('Error adding expense:', error);
    throw error;
  }
}

// ===== ดึงค่าใช้จ่ายของกลุ่ม =====
/**
 * ดึงรายการค่าใช้จ่ายทั้งหมดของกลุ่ม
 * @param {string} groupId - Group ID
 * @param {Object} filters - ตัวกรอง
 */
export async function getGroupExpenses(groupId, filters = {}) {
  try {
    let q = query(
      collection(db, collections.expenses),
      where('groupId', '==', groupId),
      orderBy('createdAt', 'desc')
    );

    if (filters.category) {
      q = query(q, where('category', '==', filters.category));
    }

    if (filters.limit) {
      q = query(q, limit(filters.limit));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Error getting expenses:', error);
    throw error;
  }
}

// ===== Real-time Expense Listener =====
/**
 * ฟังการเปลี่ยนแปลงค่าใช้จ่ายแบบ Real-time
 * @param {string} groupId - Group ID
 * @param {Function} callback - ฟังก์ชันที่จะเรียกเมื่อมีการเปลี่ยนแปลง
 */
export function listenToExpenses(groupId, callback) {
  const q = query(
    collection(db, collections.expenses),
    where('groupId', '==', groupId),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(expenses);
  });
}

// ===== คำนวณหนี้ =====
/**
 * คำนวณหนี้ระหว่างสมาชิกในกลุ่ม (Debt Simplification Algorithm)
 * @param {Array} expenses - รายการค่าใช้จ่าย
 * @param {Array} members - รายชื่อสมาชิก
 * @returns {Array} รายการหนี้ที่ต้องชำระ
 */
export function calculateDebts(expenses, members) {
  // สร้าง balance map สำหรับแต่ละสมาชิก
  const balance = {};
  members.forEach(member => {
    balance[member.uid] = { uid: member.uid, name: member.name, amount: 0 };
  });

  // คำนวณ balance จากค่าใช้จ่ายทั้งหมด
  expenses.forEach(expense => {
    const paidBy = expense.paidBy;
    const splitAmount = expense.splitAmount;

    expense.splitMembers.forEach(memberId => {
      if (memberId !== paidBy) {
        // ผู้ที่ต้องจ่ายมีหนี้เพิ่ม
        if (balance[memberId]) balance[memberId].amount -= splitAmount;
        // ผู้จ่ายได้รับเงินคืน
        if (balance[paidBy]) balance[paidBy].amount += splitAmount;
      }
    });
  });

  // แยกเป็น debtors (ติดหนี้) และ creditors (เจ้าหนี้)
  const debtors = Object.values(balance).filter(b => b.amount < 0);
  const creditors = Object.values(balance).filter(b => b.amount > 0);

  const transactions = [];

  // Greedy algorithm เพื่อลดจำนวน transactions
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const amount = Math.min(-debtor.amount, creditor.amount);

    transactions.push({
      from: debtor.uid,
      fromName: debtor.name,
      to: creditor.uid,
      toName: creditor.name,
      amount: Math.round(amount * 100) / 100 // ปัดทศนิยม 2 ตำแหน่ง
    });

    debtor.amount += amount;
    creditor.amount -= amount;

    if (Math.abs(debtor.amount) < 0.01) i++;
    if (Math.abs(creditor.amount) < 0.01) j++;
  }

  return transactions;
}

// ===== ยืนยันการชำระ =====
/**
 * บันทึกการชำระหนี้
 * @param {Object} settlementData - ข้อมูลการชำระ
 */
export async function createSettlement(settlementData) {
  try {
    const settlement = {
      groupId: settlementData.groupId,
      fromUser: settlementData.fromUser,
      fromUserName: settlementData.fromUserName,
      toUser: settlementData.toUser,
      toUserName: settlementData.toUserName,
      amount: settlementData.amount,
      status: 'pending', // pending | confirmed
      requestedAt: serverTimestamp(),
      confirmedAt: null,
      note: settlementData.note || ''
    };

    const docRef = await addDoc(collection(db, collections.settlements), settlement);

    // แจ้งเตือนเจ้าหนี้
    await addDoc(collection(db, collections.notifications), {
      userId: settlementData.toUser,
      type: 'payment_request',
      message: `${settlementData.fromUserName} แจ้งว่าได้ชำระเงิน ${settlementData.amount.toLocaleString()} บาทแล้ว`,
      relatedId: docRef.id,
      isRead: false,
      createdAt: serverTimestamp()
    });

    return { id: docRef.id, ...settlement };
  } catch (error) {
    console.error('Error creating settlement:', error);
    throw error;
  }
}

// ===== ยืนยันการชำระ =====
/**
 * ยืนยันว่าได้รับเงินแล้ว
 * @param {string} settlementId - Settlement ID
 */
export async function confirmSettlement(settlementId) {
  try {
    const settlementRef = doc(db, collections.settlements, settlementId);
    await updateDoc(settlementRef, {
      status: 'confirmed',
      confirmedAt: serverTimestamp()
    });

    const settlementDoc = await getDoc(settlementRef);
    const settlement = settlementDoc.data();

    // แจ้งเตือนลูกหนี้
    await addDoc(collection(db, collections.notifications), {
      userId: settlement.fromUser,
      type: 'payment_confirmed',
      message: `${settlement.toUserName} ยืนยันการรับเงิน ${settlement.amount.toLocaleString()} บาทแล้ว ✅`,
      relatedId: settlementId,
      isRead: false,
      createdAt: serverTimestamp()
    });

  } catch (error) {
    console.error('Error confirming settlement:', error);
    throw error;
  }
}

// ===== สร้างการแจ้งเตือน =====
async function createExpenseNotifications(expenseId, expense) {
  const batch = writeBatch(db);

  // แจ้งเตือนสมาชิกทุกคนยกเว้นผู้จ่าย
  expense.splitMembers.forEach(memberId => {
    if (memberId !== expense.paidBy) {
      const notifRef = doc(collection(db, collections.notifications));
      batch.set(notifRef, {
        userId: memberId,
        type: 'new_expense',
        message: `${expense.paidByName} เพิ่มค่าใช้จ่าย "${expense.title}" คุณต้องจ่าย ${expense.splitAmount.toLocaleString()} บาท`,
        relatedId: expenseId,
        isRead: false,
        createdAt: serverTimestamp()
      });
    }
  });

  await batch.commit();
}

// ===== อัปเดต Group Balances =====
async function updateGroupBalances(groupId, expense, expenseId) {
  try {
    await updateDoc(doc(db, collections.groups, groupId), {
      totalExpenses: increment(expense.amount),
      lastActivity: serverTimestamp(),
      [`expenseCount`]: increment(1)
    });
  } catch (error) {
    console.error('Error updating group balances:', error);
  }
}

// ===== ดึงสรุปหนี้ของผู้ใช้ =====
/**
 * ดึงยอดหนี้ทั้งหมดของผู้ใช้
 * @param {string} userId - User ID
 */
export async function getUserBalanceSummary(userId) {
  try {
    // ดึง expenses ที่เกี่ยวข้องกับผู้ใช้
    const paidByQuery = query(
      collection(db, collections.expenses),
      where('paidBy', '==', userId)
    );
    const splitQuery = query(
      collection(db, collections.expenses),
      where('splitMembers', 'array-contains', userId)
    );

    const [paidBySnap, splitSnap] = await Promise.all([
      getDocs(paidByQuery),
      getDocs(splitQuery)
    ]);

    let totalOwed = 0;  // คนอื่นติดเรา
    let totalOwing = 0; // เราติดคนอื่น

    // คำนวณจาก expenses ที่เราเป็นผู้จ่าย
    paidBySnap.docs.forEach(doc => {
      const expense = doc.data();
      const splitAmount = expense.splitAmount || (expense.amount / expense.splitMembers.length);
      const othersCount = expense.splitMembers.filter(m => m !== userId).length;
      totalOwed += splitAmount * othersCount;
    });

    // คำนวณจาก expenses ที่เราต้องหาร (ที่คนอื่นจ่าย)
    splitSnap.docs.forEach(doc => {
      const expense = doc.data();
      if (expense.paidBy !== userId) {
        const splitAmount = expense.splitAmount || (expense.amount / expense.splitMembers.length);
        totalOwing += splitAmount;
      }
    });

    // หัก settlements ที่ confirmed แล้ว
    const settledAsDebtorQuery = query(
      collection(db, collections.settlements),
      where('fromUser', '==', userId),
      where('status', '==', 'confirmed')
    );
    const settledAsCreditorsQuery = query(
      collection(db, collections.settlements),
      where('toUser', '==', userId),
      where('status', '==', 'confirmed')
    );

    const [debtorSnap, creditorSnap] = await Promise.all([
      getDocs(settledAsDebtorQuery),
      getDocs(settledAsCreditorsQuery)
    ]);

    debtorSnap.docs.forEach(doc => {
      totalOwing -= doc.data().amount;
    });

    creditorSnap.docs.forEach(doc => {
      totalOwed -= doc.data().amount;
    });

    return {
      totalOwed: Math.max(0, totalOwed),
      totalOwing: Math.max(0, totalOwing),
      netBalance: totalOwed - totalOwing
    };
  } catch (error) {
    console.error('Error getting balance summary:', error);
    return { totalOwed: 0, totalOwing: 0, netBalance: 0 };
  }
}

// ===== Export ไปยัง Google Sheets =====
/**
 * ส่งข้อมูลไปยัง Google Apps Script
 * @param {Array} data - ข้อมูลที่จะส่ง
 * @param {string} sheetName - ชื่อ Sheet
 */
export async function exportToGoogleSheets(data, sheetName = 'Expenses') {
  // ใช้ SheetsAPI จาก app.js (ไม่ต้อง import ซ้ำ เพราะ import ไว้ที่บนแล้ว)
  return SheetsAPI.exportRows(sheetName, data);
}
