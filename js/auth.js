/**
 * SharePay - Authentication Module
 * ✅ ลบ Firebase Storage ออก — ใช้ ui-avatars แทนรูปโปรไฟล์
 */

import { auth, db, collections } from './app.js';
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

// ===== Auth State Observer =====
export function observeAuthState(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      const userData = await getUserData(user.uid);
      callback(user, userData);
    } else {
      callback(null, null);
    }
  });
}

// ===== Register =====
export async function registerUser(name, email, password, avatarFile = null) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // ✅ ใช้ ui-avatars เสมอ (ไม่ upload ไป Storage)
    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366F1&color=fff&size=200`;

    await updateProfile(user, {
      displayName: name,
      photoURL: avatarUrl
    });

    const userData = {
      uid: user.uid,
      name: name,
      email: email,
      avatar: avatarUrl,
      role: 'member',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      totalOwed: 0,
      totalOwing: 0,
      groups: []
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
export async function loginUser(email, password, rememberMe = false) {
  try {
    const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistence);

    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await updateDoc(doc(db, collections.users, user.uid), {
      lastLogin: serverTimestamp()
    });

    const userData = await getUserData(user.uid);
    showToast(`ยินดีต้อนรับกลับมา, ${userData?.name || user.displayName}! 👋`, 'success');
    return { user, userData };
  } catch (error) {
    handleAuthError(error);
    throw error;
  }
}

// ===== Logout =====
export async function logoutUser() {
  try {
    await signOut(auth);
    showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
    // ✅ ใช้ relative path ที่ถูกต้องสำหรับ GitHub Pages
    const base = window.location.pathname.replace(/\/[^/]*$/, '/');
    window.location.href = base + 'index.html';
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
}

// ===== Forgot Password =====
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
export function getCurrentUser() {
  return auth.currentUser;
}

// ===== Route Guard =====
export function routeGuard(requiredRole = null) {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (!user) {
        // ✅ หา base path ถูกต้องสำหรับ GitHub Pages
        const segments = window.location.pathname.split('/');
        const isInPages = segments.includes('pages');
        window.location.href = isInPages ? '../login.html' : './login.html';
        return;
      }

      if (requiredRole) {
        const userData = await getUserData(user.uid);
        if (!userData || userData.role !== requiredRole) {
          const segments = window.location.pathname.split('/');
          const isInPages = segments.includes('pages');
          window.location.href = isInPages ? '../member.html' : './member.html';
          return;
        }
      }

      resolve(user);
    });
  });
}

// ===== Error Handler =====
function handleAuthError(error) {
  const errorMessages = {
    'auth/email-already-in-use': 'อีเมลนี้ถูกใช้แล้ว กรุณาใช้อีเมลอื่น',
    'auth/invalid-email': 'รูปแบบอีเมลไม่ถูกต้อง',
    'auth/operation-not-allowed': 'ไม่อนุญาตให้ดำเนินการนี้',
    'auth/weak-password': 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร',
    'auth/user-disabled': 'บัญชีนี้ถูกระงับการใช้งาน',
    'auth/user-not-found': 'ไม่พบบัญชีผู้ใช้นี้',
    'auth/wrong-password': 'รหัสผ่านไม่ถูกต้อง',
    'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    'auth/too-many-requests': 'คุณพยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่',
    'auth/network-request-failed': 'เกิดข้อผิดพลาดด้านเครือข่าย กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต'
  };
  const message = errorMessages[error.code] || `เกิดข้อผิดพลาด: ${error.message}`;
  showToast(message, 'error');
}

// ===== Toast =====
function showToast(message, type = 'info') {
  if (window.SharePay && window.SharePay.showToast) {
    window.SharePay.showToast(message, type);
  } else {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 9999;
      padding: 16px 24px; border-radius: 12px; color: white;
      font-family: 'Inter', sans-serif; font-size: 14px;
      background: ${type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#6366F1'};
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }
}
