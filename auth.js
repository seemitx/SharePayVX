/**
 * SharePay - Authentication Module
 * จัดการระบบ Authentication ทั้งหมด รวมถึง Login, Register, Logout
 */

import { auth, db, storage, collections } from './app.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc, setDoc, getDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ===== Auth State Observer =====
/**
 * ตรวจสอบสถานะการล็อกอินของผู้ใช้
 * @param {Function} callback - ฟังก์ชันที่จะเรียกเมื่อสถานะเปลี่ยน
 */
export function observeAuthState(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      // ดึงข้อมูลผู้ใช้จาก Firestore
      const userData = await getUserData(user.uid);
      callback(user, userData);
    } else {
      callback(null, null);
    }
  });
}

// ===== Register =====
/**
 * สมัครสมาชิกใหม่
 * @param {string} name - ชื่อผู้ใช้
 * @param {string} email - อีเมล
 * @param {string} password - รหัสผ่าน
 * @param {File} avatarFile - ไฟล์รูปโปรไฟล์ (optional)
 * @returns {Promise<Object>} ข้อมูลผู้ใช้ที่สร้างใหม่
 */
export async function registerUser(name, email, password, avatarFile = null) {
  try {
    // สร้างบัญชีใหม่
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    let avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366F1&color=fff&size=200`;

    // อัปโหลดรูปโปรไฟล์ถ้ามี
    if (avatarFile) {
      const storageRef = ref(storage, `avatars/${user.uid}`);
      await uploadBytes(storageRef, avatarFile);
      avatarUrl = await getDownloadURL(storageRef);
    }

    // อัปเดต Display Name และ Photo
    await updateProfile(user, {
      displayName: name,
      photoURL: avatarUrl
    });

    // บันทึกข้อมูลลง Firestore
    const userData = {
      uid: user.uid,
      name: name,
      email: email,
      avatar: avatarUrl,
      role: 'member', // default role
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      totalOwed: 0,    // ยอดที่เราติดคนอื่น
      totalOwing: 0,   // ยอดที่คนอื่นติดเรา
      groups: []       // กลุ่มที่เป็นสมาชิก
    };

    await setDoc(doc(db, collections.users, user.uid), userData);

    showToast('สมัครสมาชิกสำเร็จ! ยินดีต้อนรับสู่ SharePay 🎉', 'success');
    return { user, userData };
  } catch (error) {
    handleAuthError(error);
    throw error;
  }
}

// ===== Login =====
/**
 * เข้าสู่ระบบ
 * @param {string} email - อีเมล
 * @param {string} password - รหัสผ่าน
 * @param {boolean} rememberMe - จดจำการเข้าสู่ระบบ
 * @returns {Promise<Object>} ข้อมูลผู้ใช้
 */
export async function loginUser(email, password, rememberMe = false) {
  try {
    // ตั้งค่า persistence ตาม Remember Me
    const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistence);

    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // อัปเดต last login
    await updateDoc(doc(db, collections.users, user.uid), {
      lastLogin: serverTimestamp()
    });

    const userData = await getUserData(user.uid);

    showToast(`ยินดีต้อนรับกลับมา, ${userData.name}! 👋`, 'success');
    return { user, userData };
  } catch (error) {
    handleAuthError(error);
    throw error;
  }
}

// ===== Logout =====
/**
 * ออกจากระบบ
 */
export async function logoutUser() {
  try {
    await signOut(auth);
    showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
    window.location.href = '/index.html';
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
}

// ===== Forgot Password =====
/**
 * ส่งอีเมลรีเซ็ตรหัสผ่าน
 * @param {string} email - อีเมล
 */
export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    showToast('ส่งอีเมลรีเซ็ตรหัสผ่านแล้ว กรุณาตรวจสอบอีเมลของคุณ 📧', 'success');
  } catch (error) {
    handleAuthError(error);
    throw error;
  }
}

// ===== Get User Data =====
/**
 * ดึงข้อมูลผู้ใช้จาก Firestore
 * @param {string} uid - User ID
 * @returns {Promise<Object>} ข้อมูลผู้ใช้
 */
export async function getUserData(uid) {
  try {
    const userDoc = await getDoc(doc(db, collections.users, uid));
    if (userDoc.exists()) {
      return { id: userDoc.id, ...userDoc.data() };
    }
    return null;
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
}

// ===== Get Current User =====
/**
 * ดึงข้อมูลผู้ใช้ปัจจุบัน
 */
export function getCurrentUser() {
  return auth.currentUser;
}

// ===== Error Handler =====
/**
 * จัดการ Error จาก Firebase Auth
 * @param {Error} error - Firebase Auth Error
 */
function handleAuthError(error) {
  const errorMessages = {
    'auth/email-already-in-use': 'อีเมลนี้ถูกใช้แล้ว กรุณาใช้อีเมลอื่น',
    'auth/invalid-email': 'รูปแบบอีเมลไม่ถูกต้อง',
    'auth/operation-not-allowed': 'ไม่อนุญาตให้ดำเนินการนี้',
    'auth/weak-password': 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร',
    'auth/user-disabled': 'บัญชีนี้ถูกระงับการใช้งาน',
    'auth/user-not-found': 'ไม่พบบัญชีผู้ใช้นี้',
    'auth/wrong-password': 'รหัสผ่านไม่ถูกต้อง',
    'auth/too-many-requests': 'คุณพยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่',
    'auth/network-request-failed': 'เกิดข้อผิดพลาดด้านเครือข่าย กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต'
  };

  const message = errorMessages[error.code] || `เกิดข้อผิดพลาด: ${error.message}`;
  showToast(message, 'error');
}

// ===== Route Guard =====
/**
 * ตรวจสอบสิทธิ์การเข้าถึงหน้า
 * @param {string} requiredRole - Role ที่ต้องการ ('admin' | 'member' | null)
 */
export function routeGuard(requiredRole = null) {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (!user) {
        window.location.href = '/login.html';
        return;
      }

      if (requiredRole) {
        const userData = await getUserData(user.uid);
        if (!userData || userData.role !== requiredRole) {
          window.location.href = '/member.html';
          return;
        }
      }

      resolve(user);
    });
  });
}

// ===== Toast Notification Helper =====
/**
 * แสดง Toast notification
 * @param {string} message - ข้อความ
 * @param {string} type - ประเภท ('success' | 'error' | 'info' | 'warning')
 */
function showToast(message, type = 'info') {
  // ใช้ global showToast ถ้ามี หรือสร้างใหม่
  if (window.SharePay && window.SharePay.showToast) {
    window.SharePay.showToast(message, type);
  } else {
    // Fallback toast
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      padding: 16px 24px; border-radius: 12px; color: white;
      font-family: 'Inter', sans-serif; font-size: 14px;
      background: ${type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#6366F1'};
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
}
