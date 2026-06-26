/**
 * SharePay - Google Apps Script Configuration
 * =============================================
 * STEP 1: Deploy your Google Apps Script as a Web App
 * STEP 2: Paste the deployment URL below
 * STEP 3: Save and reload the page
 */

const GOOGLE_APPS_SCRIPT_URL = "PASTE_YOUR_WEB_APP_URL_HERE";
// Example: "https://script.google.com/macros/s/AKfycb.../exec"

const SHEET_NAMES = {
  expenses:    "Expenses",
  settlements: "Settlements",
  members:     "Members",
  groups:      "Groups"
};

/**
 * Google Sheets API Layer
 * Uses Content-Type: text/plain to avoid CORS preflight
 */
const SheetsAPI = {
  get isConfigured() {
    return Boolean(
      GOOGLE_APPS_SCRIPT_URL &&
      GOOGLE_APPS_SCRIPT_URL.startsWith("https://script.google.com/macros/s/") &&
      !GOOGLE_APPS_SCRIPT_URL.includes("PASTE_")
    );
  },

  async call(action, sheetName, data = null) {
    if (!this.isConfigured) {
      console.warn("[SharePay] Apps Script URL not set — running in offline mode.");
      return null;
    }
    const body = { action, sheetName };
    if (data !== null) body.data = data;
    try {
      const res = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error("[SheetsAPI] Error:", err);
      return null;
    }
  },

  getRows(sheetName)              { return this.call("get",    sheetName); },
  exportRows(sheetName, rows)     { return this.call("export", sheetName, rows); },
  createRow(sheetName, row)       { return this.call("create", sheetName, row); },
  updateRow(sheetName, id, data)  { return this.call("update", sheetName, { id, ...data }); },
  deleteRow(sheetName, id)        { return this.call("delete", sheetName, { id }); }
};

// Expose globally
window.SharePayConfig = { GOOGLE_APPS_SCRIPT_URL, SHEET_NAMES, SheetsAPI };
