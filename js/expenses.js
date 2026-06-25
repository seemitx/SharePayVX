/**
 * SharePay - Expenses Module
 * ✅ ลบ Firebase Storage ออก — ไม่รองรับอัปโหลดรูปใบเสร็จ
 */

import { db, collections, SheetsAPI, sheetsConfig } from './app.js';
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs,
  query, where, orderBy, limit, onSnapshot, serverTimestamp,
  getDoc, writeBatch, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export const EXPENSE_CATEGORIES = {
  food:          { label: 'ค่าอาหาร',    icon: '🍜', color: '#F59E0B' },
  fuel:          { label: 'ค่าน้ำมัน',   icon: '⛽', color: '#EF4444' },
  accommodation: { label: 'ค่าที่พัก',   icon: '🏨', color: '#8B5CF6' },
  transport:     { label: 'ค่าเดินทาง',  icon: '🚌', color: '#06B6D4' },
  drinks:        { label: 'ค่าเครื่องดื่ม', icon: '🥤', color: '#10B981' },
  entertainment: { label: 'ความบันเทิง', icon: '🎭', color: '#F97316' },
  shopping:      { label: 'ช้อปปิ้ง',   icon: '🛍️', color: '#EC4899' },
  other:         { label: 'อื่นๆ',       icon: '📦', color: '#6B7280' }
};

// ===== เพิ่มค่าใช้จ่าย =====
export async function addExpense(expenseData, receiptFile = null) {
  try {
    // ✅ ไม่ upload รูป Storage — ข้ามส่วนนี้ไปเลย
    const receiptUrl = null;

    const splitAmount = expenseData.amount / expenseData.splitMembers.length;
    const splits = {};
    expenseData.splitMembers.forEach(memberId => {
      splits[memberId] = {
        amount: splitAmount,
        paid: memberId === expenseData.paidBy,
        settledAt: null
      };
    });

    const expense = {
      groupId:          expenseData.groupId,
      title:            expenseData.title,
      category:         expenseData.category,
      amount:           expenseData.amount,
      paidBy:           expenseData.paidBy,
      paidByName:       expenseData.paidByName,
      splitMembers:     expenseData.splitMembers,
      splitMemberNames: expenseData.splitMemberNames,
      splitAmount,
      splits,
      receiptImage:     receiptUrl,
      note:             expenseData.note || '',
      createdBy:        expenseData.createdBy,
      createdAt:        serverTimestamp(),
      updatedAt:        serverTimestamp()
    };

    const docRef = await addDoc(collection(db, collections.expenses), expense);
    await createExpenseNotifications(docRef.id, expense);
    await updateGroupBalances(expenseData.groupId, expense);

    // Sync → Google Sheets (best-effort)
    SheetsAPI.exportRows(sheetsConfig.sheets.expenses, [{
      id:           docRef.id,
      title:        expense.title,
      category:     expense.category,
      amount:       expense.amount,
      paidBy:       expense.paidByName,
      splitMembers: (expense.splitMemberNames || []).join(', '),
      splitAmount:  expense.splitAmount,
      groupId:      expense.groupId,
      note:         expense.note,
      createdAt:    new Date().toISOString()
    }]).catch(e => console.warn('[SheetsAPI] expense sync failed:', e));

    return { id: docRef.id, ...expense };
  } catch (error) {
    console.error('Error adding expense:', error);
    throw error;
  }
}

// ===== ดึงค่าใช้จ่ายของกลุ่ม =====
export async function getGroupExpenses(groupId, filters = {}) {
  try {
    let q = query(
      collection(db, collections.expenses),
      where('groupId', '==', groupId),
      orderBy('createdAt', 'desc')
    );
    if (filters.category) q = query(q, where('category', '==', filters.category));
    if (filters.limit)    q = query(q, limit(filters.limit));

    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Error getting expenses:', error);
    throw error;
  }
}

// ===== Real-time listener =====
export function listenToExpenses(groupId, callback) {
  const q = query(
    collection(db, collections.expenses),
    where('groupId', '==', groupId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, snapshot => {
    callback(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ===== คำนวณหนี้ =====
export function calculateDebts(expenses, members) {
  const balance = {};
  members.forEach(m => { balance[m.uid] = { uid: m.uid, name: m.name, amount: 0 }; });

  expenses.forEach(expense => {
    const { paidBy, splitAmount, splitMembers } = expense;
    splitMembers.forEach(memberId => {
      if (memberId !== paidBy) {
        if (balance[memberId]) balance[memberId].amount -= splitAmount;
        if (balance[paidBy])   balance[paidBy].amount  += splitAmount;
      }
    });
  });

  const debtors   = Object.values(balance).filter(b => b.amount < 0);
  const creditors = Object.values(balance).filter(b => b.amount > 0);
  const transactions = [];

  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor   = debtors[i];
    const creditor = creditors[j];
    const amount   = Math.min(-debtor.amount, creditor.amount);

    transactions.push({
      from: debtor.uid, fromName: debtor.name,
      to:   creditor.uid, toName: creditor.name,
      amount: Math.round(amount * 100) / 100
    });

    debtor.amount   += amount;
    creditor.amount -= amount;
    if (Math.abs(debtor.amount)   < 0.01) i++;
    if (Math.abs(creditor.amount) < 0.01) j++;
  }
  return transactions;
}

// ===== สร้าง Settlement =====
export async function createSettlement(settlementData) {
  try {
    const settlement = {
      groupId:      settlementData.groupId,
      fromUser:     settlementData.fromUser,
      fromUserName: settlementData.fromUserName,
      toUser:       settlementData.toUser,
      toUserName:   settlementData.toUserName,
      amount:       settlementData.amount,
      status:       'pending',
      requestedAt:  serverTimestamp(),
      confirmedAt:  null,
      note:         settlementData.note || ''
    };

    const docRef = await addDoc(collection(db, collections.settlements), settlement);

    await addDoc(collection(db, collections.notifications), {
      userId:    settlementData.toUser,
      type:      'payment_request',
      message:   `${settlementData.fromUserName} แจ้งว่าได้ชำระเงิน ${settlementData.amount.toLocaleString()} บาทแล้ว`,
      relatedId: docRef.id,
      isRead:    false,
      createdAt: serverTimestamp()
    });

    return { id: docRef.id, ...settlement };
  } catch (error) {
    console.error('Error creating settlement:', error);
    throw error;
  }
}

// ===== ยืนยัน Settlement =====
export async function confirmSettlement(settlementId) {
  try {
    const settlementRef = doc(db, collections.settlements, settlementId);
    await updateDoc(settlementRef, { status: 'confirmed', confirmedAt: serverTimestamp() });

    const settlementDoc = await getDoc(settlementRef);
    const settlement = settlementDoc.data();

    await addDoc(collection(db, collections.notifications), {
      userId:    settlement.fromUser,
      type:      'payment_confirmed',
      message:   `${settlement.toUserName} ยืนยันการรับเงิน ${settlement.amount.toLocaleString()} บาทแล้ว ✅`,
      relatedId: settlementId,
      isRead:    false,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error confirming settlement:', error);
    throw error;
  }
}

// ===== Helpers =====
async function createExpenseNotifications(expenseId, expense) {
  const batch = writeBatch(db);
  expense.splitMembers.forEach(memberId => {
    if (memberId !== expense.paidBy) {
      const notifRef = doc(collection(db, collections.notifications));
      batch.set(notifRef, {
        userId:    memberId,
        type:      'new_expense',
        message:   `${expense.paidByName} เพิ่มค่าใช้จ่าย "${expense.title}" คุณต้องจ่าย ${expense.splitAmount.toLocaleString()} บาท`,
        relatedId: expenseId,
        isRead:    false,
        createdAt: serverTimestamp()
      });
    }
  });
  await batch.commit();
}

async function updateGroupBalances(groupId, expense) {
  try {
    await updateDoc(doc(db, collections.groups, groupId), {
      totalExpenses: increment(expense.amount),
      expenseCount:  increment(1),
      lastActivity:  serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating group balances:', error);
  }
}

// ===== ยอดหนี้รวมของ User =====
export async function getUserBalanceSummary(userId) {
  try {
    const [paidBySnap, splitSnap] = await Promise.all([
      getDocs(query(collection(db, collections.expenses), where('paidBy', '==', userId))),
      getDocs(query(collection(db, collections.expenses), where('splitMembers', 'array-contains', userId)))
    ]);

    let totalOwed = 0, totalOwing = 0;

    paidBySnap.docs.forEach(d => {
      const e = d.data();
      const split = e.splitAmount || (e.amount / e.splitMembers.length);
      totalOwed += split * e.splitMembers.filter(m => m !== userId).length;
    });

    splitSnap.docs.forEach(d => {
      const e = d.data();
      if (e.paidBy !== userId) {
        totalOwing += e.splitAmount || (e.amount / e.splitMembers.length);
      }
    });

    const [debtorSnap, creditorSnap] = await Promise.all([
      getDocs(query(collection(db, collections.settlements), where('fromUser', '==', userId), where('status', '==', 'confirmed'))),
      getDocs(query(collection(db, collections.settlements), where('toUser',   '==', userId), where('status', '==', 'confirmed')))
    ]);

    debtorSnap.docs.forEach(d => { totalOwing -= d.data().amount; });
    creditorSnap.docs.forEach(d => { totalOwed  -= d.data().amount; });

    return {
      totalOwed:  Math.max(0, totalOwed),
      totalOwing: Math.max(0, totalOwing),
      netBalance: totalOwed - totalOwing
    };
  } catch (error) {
    console.error('Error getting balance summary:', error);
    return { totalOwed: 0, totalOwing: 0, netBalance: 0 };
  }
}

export async function exportToGoogleSheets(data, sheetName = 'Expenses') {
  return SheetsAPI.exportRows(sheetName, data);
}
