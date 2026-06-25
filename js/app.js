/**
 * SharePay - App Initializer
 * ✅ ไม่ใช้ Firebase Storage (ไม่ฟรี)
 * ✅ ใช้แค่ Auth + Firestore
 * ✅ แก้ SheetsAPI CORS header
 */

import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDgf7rYlJriOnE8_ieyCkY52sNWE2Upg_I",
  authDomain: "sharepay-36d88.firebaseapp.com",
  projectId: "sharepay-36d88",
  storageBucket: "sharepay-36d88.firebasestorage.app",
  messagingSenderId: "29935540555",
  appId: "1:29935540555:web:199714c22d5217621df0ce",
  measurementId: "G-Y47T7B2CRV"
};

export const collections = {
  users:         "users",
  groups:        "groups",
  expenses:      "expenses",
  settlements:   "settlements",
  notifications: "notifications"
};

const app        = initializeApp(firebaseConfig);
export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = null; // ❌ Storage ไม่ได้เปิด ใช้ ui-avatars แทน

// ===== Google Apps Script =====
const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwPbMVvvexhfZoo-pnK4kjbv0DEuYIf4Wz0geQk-_qb_2X46Cfy6cEn89h1QyACFfWs/exec";

// ✅ เช็คว่า URL จริงๆ (ไม่ใช่ placeholder)
const SHEETS_ENABLED = Boolean(
  GOOGLE_APPS_SCRIPT_URL &&
  GOOGLE_APPS_SCRIPT_URL.startsWith("https://script.google.com/macros/s/") &&
  !GOOGLE_APPS_SCRIPT_URL.includes("YOUR_")
);

export const sheetsConfig = {
  webAppUrl: GOOGLE_APPS_SCRIPT_URL,
  sheets: {
    expenses:    "Expenses",
    settlements: "Settlements",
    members:     "Members",
    groups:      "Groups"
  }
};

export const SheetsAPI = {
  async call(action, sheetName, data = null) {
    if (!SHEETS_ENABLED) {
      console.warn("[SheetsAPI] URL ยังไม่ได้ตั้งค่า — ข้ามการส่งข้อมูล");
      return null;
    }
    const body = { action, sheetName };
    if (data !== null) body.data = data;
    try {
      const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: "POST",
        // ✅ Apps Script ต้องการ text/plain ไม่งั้น CORS preflight fail
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      // ✅ ไม่ throw — Sheets เป็นแค่ backup ไม่กระทบงานหลัก
      console.error("[SheetsAPI] Error:", err);
      return null;
    }
  },
  exportRows(sheetName, rows)    { return this.call("export", sheetName, rows); },
  getRows(sheetName)             { return this.call("get",    sheetName); },
  updateRow(sheetName, id, data) { return this.call("update", sheetName, { id, ...data }); },
  deleteRow(sheetName, id)       { return this.call("delete", sheetName, { id }); }
};

window.SharePayConfig = {
  app, auth, db,
  storage: null,
  collections, sheetsConfig, SheetsAPI
};
