/**
 * SharePay - Firebase Configuration & Google Sheets API Layer
 * รองรับทั้ง ES Module import และ <script src> แบบธรรมดา
 */

// ===== Google Apps Script Config =====
// วาง URL ของ Google Apps Script Web App ของคุณที่นี่
const GOOGLE_APPS_SCRIPT_URL = "YOUR_GOOGLE_APPS_SCRIPT_URL";

// Sheet names ที่ใช้ใน Google Sheets
const SHEET_NAMES = {
  expenses:    "Expenses",
  settlements: "Settlements",
  members:     "Members",
  groups:      "Groups"
};

// ===== Firebase Configuration =====
// TODO: แทนที่ค่าเหล่านี้ด้วย config จาก Firebase Console
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
const collections = {
  users:         "users",
  groups:        "groups",
  expenses:      "expenses",
  settlements:   "settlements",
  notifications: "notifications"
};

// ===== sheetsConfig (compat alias) =====
const sheetsConfig = {
  webAppUrl: GOOGLE_APPS_SCRIPT_URL,
  sheets:    SHEET_NAMES
};

// ===== Google Sheets / Apps Script API Layer =====
const SheetsAPI = {
  /**
   * ส่งข้อมูลไปยัง Google Apps Script
   * @param {string} action   - action ที่ต้องการ ('export' | 'get' | 'update' | 'delete')
   * @param {string} sheet    - ชื่อ Sheet
   * @param {*}      payload  - ข้อมูลที่จะส่ง (optional)
   * @returns {Promise<any>}
   */
  async call(action, sheet, payload = null) {
    if (!GOOGLE_APPS_SCRIPT_URL || GOOGLE_APPS_SCRIPT_URL === "YOUR_GOOGLE_APPS_SCRIPT_URL") {
      console.warn("[SharePay] Google Apps Script URL ยังไม่ได้ตั้งค่า");
      return null;
    }
    const body = { action, sheetName: sheet };
    if (payload !== null) body.data = payload;

    try {
      const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      return await res.json();
    } catch (err) {
      console.error("[SharePay] SheetsAPI error:", err);
      throw err;
    }
  },

  /** Export rows ไปยัง Google Sheet */
  exportRows(sheetName, rows) {
    return this.call("export", sheetName, rows);
  },

  /** ดึงข้อมูลจาก Google Sheet */
  getRows(sheetName) {
    return this.call("get", sheetName);
  },

  /** อัปเดตแถวใน Google Sheet โดยใช้ id */
  updateRow(sheetName, id, data) {
    return this.call("update", sheetName, { id, ...data });
  },

  /** ลบแถวใน Google Sheet โดยใช้ id */
  deleteRow(sheetName, id) {
    return this.call("delete", sheetName, { id });
  }
};

// ===== Initialize Firebase (ES Module path) =====
// ฟังก์ชันนี้จะถูกเรียกเมื่อ Firebase SDK โหลดสำเร็จ
async function _initFirebase() {
  const { initializeApp }  = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js");
  const { getAuth }        = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
  const { getFirestore }   = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
  const { getStorage }     = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js");

  const app     = initializeApp(firebaseConfig);
  const auth    = getAuth(app);
  const db      = getFirestore(app);
  const storage = getStorage(app);

  return { app, auth, db, storage };
}

// ===== Global SharePayConfig (สำหรับ <script src> ธรรมดา) =====
// หน้าที่โหลดไฟล์นี้แบบ non-module จะใช้ window.SharePayConfig
window.SharePayConfig = {
  firebaseConfig,
  collections,
  sheetsConfig,
  GOOGLE_APPS_SCRIPT_URL,
  SHEET_NAMES,
  SheetsAPI,
  _initFirebase,

  // ตัวเก็บ Firebase instances (จะถูก set หลัง initFirebase())
  app:     null,
  auth:    null,
  db:      null,
  storage: null,

  /**
   * เริ่มต้น Firebase และเก็บ instances ไว้ใน SharePayConfig
   * เรียกจากหน้าที่ใช้ <script src> แล้วต้องการ Firebase
   */
  async initFirebase() {
    if (this.app) return this; // already initialized
    const { app, auth, db, storage } = await _initFirebase();
    this.app     = app;
    this.auth    = auth;
    this.db      = db;
    this.storage = storage;
    return this;
  }
};

// ===== ES Module Exports =====
// ไฟล์ที่ใช้ import { ... } from './firebase-config.js' จะใช้ส่วนนี้
let _firebase = null;

async function getFirebaseInstances() {
  if (_firebase) return _firebase;
  _firebase = await _initFirebase();
  // sync กลับไปที่ global ด้วย
  Object.assign(window.SharePayConfig, _firebase);
  return _firebase;
}

// Lazy exports — resolve ครั้งแรกที่ถูกใช้
const _lazy = new Proxy({}, {
  get(_, key) {
    // คืนค่าจาก _firebase ถ้ามีแล้ว
    if (_firebase && key in _firebase) return _firebase[key];
    // ไม่งั้นคืน Promise ที่ resolve เป็นค่านั้น
    return getFirebaseInstances().then(f => f[key]);
  }
});

// Named exports
export { collections, sheetsConfig, SheetsAPI };

export async function getApp()     { return (await getFirebaseInstances()).app; }
export async function getAuthInst(){ return (await getFirebaseInstances()).auth; }
export async function getDb()      { return (await getFirebaseInstances()).db; }
export async function getStorageInst(){ return (await getFirebaseInstances()).storage; }

// compat exports ที่ไฟล์อื่น import อยู่แล้ว
export const app     = getFirebaseInstances().then(f => f.app);
export const auth    = getFirebaseInstances().then(f => f.auth);
export const db      = getFirebaseInstances().then(f => f.db);
export const storage = getFirebaseInstances().then(f => f.storage);
