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
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID",
  measurementId:     "YOUR_MEASUREMENT_ID"
};

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
const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzqIgytS1oussrdx_kZyzyZP2UQ5hGnsMkQrB-McOVIdF733uCkPY5e6-nTBj6QVaZM/exec";

export const sheetsConfig = {
  webAppUrl: GOOGLE_APPS_SCRIPT_URL,
  sheets: {
    expenses:    "Expenses",
    settlements: "Settlements",
    members:     "Members",
    groups:      "Groups"
  }
};

// ===== Google Sheets / Apps Script API Layer =====
export const SheetsAPI = {
  /**
   * เรียก Google Apps Script
   * @param {'export'|'get'|'update'|'delete'} action
   * @param {string} sheetName
   * @param {any}    data
   */
  async call(action, sheetName, data = null) {
    if (!GOOGLE_APPS_SCRIPT_URL || GOOGLE_APPS_SCRIPT_URL === "YOUR_GOOGLE_APPS_SCRIPT_URL") {
      console.warn("[SheetsAPI] URL ยังไม่ได้ตั้งค่า — ข้ามการส่งข้อมูล");
      return null;
    }
    const body = { action, sheetName };
    if (data !== null) body.data = data;

    try {
      const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error("[SheetsAPI] Error:", err);
      throw err;
    }
  },

  /** เพิ่ม/อัปเดต rows ใน Sheet */
  exportRows(sheetName, rows) {
    return this.call("export", sheetName, rows);
  },

  /** ดึงข้อมูลทั้งหมดจาก Sheet */
  getRows(sheetName) {
    return this.call("get", sheetName);
  },

  /** อัปเดตแถวตาม id */
  updateRow(sheetName, id, data) {
    return this.call("update", sheetName, { id, ...data });
  },

  /** ลบแถวตาม id */
  deleteRow(sheetName, id) {
    return this.call("delete", sheetName, { id });
  }
};

// ===== Sync to global (สำหรับ non-module scripts) =====
window.SharePayConfig = {
  app, auth, db, storage,
  collections, sheetsConfig, SheetsAPI
};
