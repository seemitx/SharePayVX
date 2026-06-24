/**
 * SharePay - App Initializer (จุดศูนย์กลาง)
 * ไฟล์นี้ init Firebase ครั้งเดียว แล้ว export instances ให้ทุกโมดูลใช้
 *
 * วิธีใช้ใน ES Module:
 *   import { auth, db, storage, collections, SheetsAPI } from './app.js';
 *
 * วิธีใช้ใน non-module script (หลังโหลด app.js):
 *   await window.SharePayConfig.initFirebase();
 *   const { auth, db } = window.SharePayConfig;
 */

import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage }     from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// ===== Firebase Config =====
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDgf7rYlJriOnE8_ieyCkY52sNWE2Upg_I",
  authDomain: "sharepay-36d88.firebaseapp.com",
  projectId: "sharepay-36d88",
  storageBucket: "sharepay-36d88.firebasestorage.app",
  messagingSenderId: "29935540555",
  appId: "1:29935540555:web:199714c22d5217621df0ce",
  measurementId: "G-Y47T7B2CRV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
// ===== Firestore Collection Names =====
export const collections = {
  users:         "users",
  groups:        "groups",
  expenses:      "expenses",
  settlements:   "settlements",
  notifications: "notifications"
};

// ===== Initialize Firebase (singleton) =====
const app     = initializeApp(firebaseConfig);
export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);

// ===== Google Apps Script URL =====
// TODO: วาง URL จาก Google Apps Script Deployment ที่นี่
const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwPbMVvvexhfZoo-pnK4kjbv0DEuYIf4Wz0geQk-_qb_2X46Cfy6cEn89h1QyACFfWs/exec";

export const sheetsConfig = {
  webAppUrl: GOOGLE_APPS_SCRIPT_URL,
  sheets: {
    expenses:    "Expenses",
    settlements: "Settlements",
    members:     "Members",
    groups:      "Groups"
  }
};

// ===== Sync to global (สำหรับ non-module scripts) =====
window.SharePayConfig = {
  app, auth, db, storage,
  collections, sheetsConfig, SheetsAPI
};
