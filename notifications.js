/**
 * SharePay - Notifications Module
 * จัดการระบบการแจ้งเตือน
 */

import { db, collections } from './app.js';
import {
  collection, doc, query, where, orderBy, limit,
  onSnapshot, updateDoc, getDocs, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ===== ฟังการแจ้งเตือนแบบ Real-time =====
/**
 * ฟังการแจ้งเตือนของผู้ใช้แบบ real-time
 * @param {string} userId - User ID
 * @param {Function} callback - ฟังก์ชันที่จะเรียกเมื่อมีการแจ้งเตือนใหม่
 */
export function listenToNotifications(userId, callback) {
  const q = query(
    collection(db, collections.notifications),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  return onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const unreadCount = notifications.filter(n => !n.isRead).length;
    callback(notifications, unreadCount);
  });
}

// ===== ทำเครื่องหมายว่าอ่านแล้ว =====
/**
 * ทำเครื่องหมายการแจ้งเตือนว่าอ่านแล้ว
 * @param {string} notificationId - Notification ID
 */
export async function markAsRead(notificationId) {
  await updateDoc(doc(db, collections.notifications, notificationId), {
    isRead: true,
    readAt: serverTimestamp()
  });
}

// ===== ทำเครื่องหมายทั้งหมดว่าอ่านแล้ว =====
/**
 * ทำเครื่องหมายการแจ้งเตือนทั้งหมดว่าอ่านแล้ว
 * @param {string} userId - User ID
 */
export async function markAllAsRead(userId) {
  const q = query(
    collection(db, collections.notifications),
    where('userId', '==', userId),
    where('isRead', '==', false)
  );

  const snapshot = await getDocs(q);
  const batch = writeBatch(db);

  snapshot.docs.forEach(doc => {
    batch.update(doc.ref, { isRead: true, readAt: serverTimestamp() });
  });

  await batch.commit();
}

// ===== Notification Icons =====
export const NOTIFICATION_ICONS = {
  new_expense: '💸',
  payment_request: '💰',
  payment_confirmed: '✅',
  member_joined: '👋',
  member_left: '🚪',
  group_invitation: '📨',
  system: '🔔'
};
