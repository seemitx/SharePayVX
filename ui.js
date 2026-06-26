/**
 * SharePay - Shared UI Utilities
 */

// ===== TOAST =====
function showToast(message, type = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:10px;";
    document.body.appendChild(container);
  }
  const icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
  const colors = { success: "#10B981", error: "#EF4444", warning: "#F59E0B", info: "#3B82F6" };
  const toast = document.createElement("div");
  toast.style.cssText = `padding:14px 20px;border-radius:12px;color:#fff;font-family:'Inter',sans-serif;font-size:14px;background:${colors[type]};box-shadow:0 10px 40px rgba(0,0,0,0.3);display:flex;align-items:center;gap:10px;max-width:340px;animation:slideInRight 0.3s ease;`;
  toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = "0"; toast.style.transition = "opacity 0.3s"; setTimeout(() => toast.remove(), 300); }, 3500);
}

// ===== LOADING =====
function showLoading(show = true, message = "กำลังโหลด...") {
  let overlay = document.getElementById("loading-overlay");
  if (show) {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "loading-overlay";
      overlay.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,0.7);backdrop-filter:blur(4px);z-index:9998;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;";
      overlay.innerHTML = `<div class="spinner-large"></div><p style="color:#94A3B8;font-family:'Inter',sans-serif;font-size:14px;">${message}</p>`;
      document.body.appendChild(overlay);
    }
  } else {
    overlay?.remove();
  }
}

// ===== FORMAT CURRENCY =====
function formatCurrency(amount, currency = "฿") {
  return `${currency}${Number(amount || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ===== FORMAT DATE =====
function formatDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

// ===== RELATIVE TIME =====
function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "เมื่อสักครู่";
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`;
  const days = Math.floor(hrs / 24);
  return `${days} วันที่แล้ว`;
}

// ===== THEME =====
function initTheme() {
  const saved = localStorage.getItem("sharepay-theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  const btn = document.getElementById("theme-toggle") || document.getElementById("dark-mode-toggle");
  if (btn) btn.textContent = saved === "dark" ? "🌙" : "☀️";
  const allBtns = document.querySelectorAll("#theme-toggle, #dark-mode-toggle");
  allBtns.forEach(b => {
    b.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("sharepay-theme", next);
      allBtns.forEach(bb => bb.textContent = next === "dark" ? "🌙" : "☀️");
    });
  });
}

// ===== NAV USER =====
function populateNavUser(user) {
  if (!user) return;
  const nameEls = document.querySelectorAll("#user-name, #userName, .nav-user-name");
  const avatarEls = document.querySelectorAll("#user-avatar, #userAvatar, .nav-avatar");
  const roleEls = document.querySelectorAll("#user-role, .nav-user-role");
  nameEls.forEach(el => { el.textContent = user.name || user.email; });
  avatarEls.forEach(el => {
    if (el.tagName === "IMG") el.src = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name||'U')}&background=3B82F6&color=fff`;
    else el.textContent = (user.name || "U")[0].toUpperCase();
  });
  roleEls.forEach(el => { el.textContent = user.role === "admin" ? "Admin" : "Member"; });
}

// ===== EMPTY STATE =====
function emptyState(icon, title, subtitle = "") {
  return `<div class="empty-state"><div class="empty-icon">${icon}</div><h3>${title}</h3>${subtitle ? `<p>${subtitle}</p>` : ""}</div>`;
}

// ===== CONFIRM MODAL =====
function confirmAction(title, message, onConfirm, type = "danger") {
  let modal = document.getElementById("confirm-modal-sp");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "confirm-modal-sp";
    modal.className = "modal-overlay";
    modal.innerHTML = `<div class="modal glass" style="max-width:420px;padding:2rem;"><h3 id="cm-title" style="margin-bottom:.5rem;color:var(--text-primary);"></h3><p id="cm-msg" style="color:var(--text-secondary);margin-bottom:1.5rem;line-height:1.6;"></p><div style="display:flex;gap:12px;justify-content:flex-end;"><button class="btn btn-ghost" id="cm-cancel">ยกเลิก</button><button class="btn" id="cm-confirm">ยืนยัน</button></div></div>`;
    document.body.appendChild(modal);
    document.getElementById("cm-cancel").addEventListener("click", () => modal.classList.remove("active"));
  }
  document.getElementById("cm-title").textContent = title;
  document.getElementById("cm-msg").textContent = message;
  const confirmBtn = document.getElementById("cm-confirm");
  confirmBtn.className = `btn ${type === "danger" ? "btn-danger" : "btn-primary"}`;
  confirmBtn.textContent = "ยืนยัน";
  const newBtn = confirmBtn.cloneNode(true);
  confirmBtn.replaceWith(newBtn);
  newBtn.addEventListener("click", () => { modal.classList.remove("active"); onConfirm(); });
  modal.classList.add("active");
}

// ===== NOTIFICATION BELL =====
function updateNotifBell(memberId) {
  const badge = document.getElementById("notif-badge");
  if (!badge || !memberId) return;
  const count = window.SP?.Notifications?.getUnreadCount(memberId) || 0;
  badge.textContent = count;
  badge.style.display = count > 0 ? "flex" : "none";
}

window.SharePay = { showToast, showLoading, formatCurrency, formatDate, timeAgo, initTheme, populateNavUser, emptyState, confirmAction, updateNotifBell };
