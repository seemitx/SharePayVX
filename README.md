# SharePay 💸

> แอปหารค่าใช้จ่ายร่วมกับเพื่อน — Split expenses, track debts, settle up.

[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-blue)](https://pages.github.com)
[![Google Sheets](https://img.shields.io/badge/Backend-Google%20Sheets-green)](https://sheets.google.com)

---

## 1. Project Overview

SharePay is a web-based expense-splitting app for friend groups, families, and teams. It stores all data in the browser's **localStorage** for offline-first use and syncs to **Google Sheets** via Apps Script as a backup/export layer.

**Tech stack:** HTML5 · CSS3 · Vanilla JS · Google Sheets · Google Apps Script  
**No build tools, no Node.js, no Firebase** — works directly on GitHub Pages.

---

## 2. Folder Structure

```
SharePay/
├── index.html              Landing page
├── login.html              Login page
├── register.html           Registration page
├── member.html             Member dashboard
├── admin.html              Admin dashboard
├── Code.gs                 Google Apps Script backend
├── manifest.json           PWA manifest
├── README.md               This file
│
├── css/
│   ├── main.css            Design system + all components
│   ├── admin.css           Admin-specific styles
│   ├── member.css          Member-specific styles
│   └── responsive.css      Responsive overrides
│
├── js/
│   ├── config.js           ← PASTE YOUR APPS SCRIPT URL HERE
│   ├── storage.js          localStorage CRUD + debt calculator
│   ├── auth.js             Session-based auth (no Firebase)
│   ├── ui.js               Toast, loading, theme, formatters
│   ├── member.js           Member dashboard logic
│   └── admin.js            Admin dashboard logic
│
├── pages/
│   ├── create-group.html
│   ├── expense-list.html
│   ├── settlement.html
│   └── settings.html
│
└── assets/
    └── logo/
        └── logo.svg
```

---

## 3. Installation (Local)

No build process needed. Just open `index.html` in a browser, or:

```bash
# With Python
python3 -m http.server 8080
# Then open http://localhost:8080
```

**Demo accounts** are seeded automatically on first load:
| Email | Password | Role |
|-------|----------|------|
| `admin@sharepay.th` | `admin123` | Admin |
| `demo@sharepay.th`  | `demo123`  | Member |

---

## 4. GitHub Pages Deployment

1. Push the project to a GitHub repository
2. Go to **Settings → Pages → Source: main branch / root**
3. Your app will be live at: `https://username.github.io/SharePay/`
4. All paths are relative — no changes needed

---

## 5. Google Sheets Setup

1. Go to [sheets.google.com](https://sheets.google.com) → Create a new blank spreadsheet
2. Name it **SharePay Database**
3. Open **Extensions → Apps Script**
4. Paste the entire contents of `Code.gs`
5. Click **Run → setupAllSheets()** (grant permissions when prompted)
6. This creates 4 sheets: **Expenses, Settlements, Members, Groups**

---

## 6. Google Apps Script Setup & Deployment

1. In the Apps Script editor, click **Deploy → New deployment**
2. Type: **Web App**
3. Description: `SharePay API v1`
4. Execute as: **Me**
5. Who has access: **Anyone**
6. Click **Deploy** → copy the Web App URL

---

## 7. Connecting Website to Apps Script

Open `js/config.js` and replace the placeholder URL:

```javascript
const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/YOUR_ID/exec";
//                              ↑ paste your deployment URL here
```

Save the file and push to GitHub. All writes will now sync to Google Sheets.

---

## 8. Testing CRUD Operations

Open the deployed URL in your browser, then in the console:

```javascript
// Create a test group
SP.Groups.create({ name: 'ทริปเชียงใหม่', icon: '✈️', memberIds: ['your-id'] });

// Add an expense
SP.Expenses.create({ title: 'ค่าโรงแรม', amount: 3000, paidById: 'your-id', ... });

// Calculate debts for a group
SP.calculateDebts('group-id');

// Force sync to Sheets
SheetsAPI.getRows('Expenses').then(console.log);
```

---

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Apps Script URL not set" toast | Paste deployment URL in `js/config.js` |
| CORS error on Sheets sync | Make sure deploy is "Anyone" access and Content-Type is `text/plain` |
| Data lost on reload | Check localStorage isn't blocked (private/incognito mode) |
| Login fails | First-time users are auto-seeded; try `admin@sharepay.th` / `admin123` |
| Sheets not created | Run `setupAllSheets()` in Apps Script editor manually |
| GitHub Pages 404 | Ensure all paths use `./` prefix not `/` |

---

## 10. User Manual

### Logging In
1. Open the app → click **เข้าสู่ระบบ**
2. Enter email + password, or click **Demo Login**
3. Members go to Member Dashboard; Admins go to Admin Dashboard

### Creating a Group
1. Member Dashboard → sidebar **กลุ่ม** → click **+ สร้างกลุ่มใหม่**
2. Enter a group name, choose an emoji icon, click **สร้าง**

### Adding an Expense
1. Click any group → **+ เพิ่มรายการ**
2. Fill in title, amount, category, select members to split with
3. Click **บันทึก** — splits are calculated automatically

### Settling Up
1. Open a group → see the **ยอดหนี้** section
2. Click **บันทึกการจ่าย** next to a debt to mark it settled
3. The debt recalculates immediately

### Viewing Reports (Admin)
1. Admin Dashboard → sidebar **รายงาน**
2. Choose Daily / Weekly / Monthly / Yearly
3. Click **Export CSV** to download

---

## 11. Admin Manual

### Managing Users
- Admin Dashboard → **สมาชิก** table
- Change role: click **เปลี่ยน Role** (Member ↔ Admin)
- Delete user: click **ลบ**

### Managing Groups & Expenses
- Admin can view all groups and expenses across all users
- Delete any group or expense from the admin tables

### Syncing to Google Sheets
- All writes automatically attempt to sync to the connected Apps Script URL
- To force a full re-sync, call `SheetsAPI.exportRows('Expenses', SP.Expenses.getAll())` in the browser console

### Resetting Data
To clear all local data (for demo/testing):
```javascript
localStorage.removeItem('sharepay_db');
localStorage.removeItem('sharepay_session');
location.reload();
```

---

## 12. Remaining Notes

- **Security:** This project uses plaintext passwords in localStorage — acceptable for academic submission, not for production.
- **Multi-device sync:** Data lives in localStorage per-device. Google Sheets sync enables shared access across devices.
- **Offline:** The app works fully offline; changes sync to Sheets when connectivity is available.

---

*Built for academic submission — SharePay © 2026*
