/**
 * SharePay - Authentication (No Firebase)
 * Uses localStorage session + Members table as user store.
 */

const SESSION_KEY = "sharepay_session";

const Auth = {
  // Get current logged-in user
  current() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); }
    catch { return null; }
  },

  // Save session
  setSession(member) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(member));
  },

  // Clear session
  clearSession() {
    localStorage.removeItem(SESSION_KEY);
  },

  // Login
  login(email, password) {
    const members = window.SP.Members.getAll();
    const member = members.find(m => m.email.toLowerCase() === email.toLowerCase() && m.password === password);
    if (!member) return { ok: false, error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
    const { password: _, ...safe } = member;
    this.setSession(safe);
    return { ok: true, member: safe };
  },

  // Register
  register(name, email, password, role = "member") {
    const existing = window.SP.Members.getByEmail(email);
    if (existing) return { ok: false, error: "อีเมลนี้ถูกใช้แล้ว" };
    const member = window.SP.Members.create({ name, email, password, role, avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=3B82F6&color=fff&size=200` });
    const { password: _, ...safe } = member;
    this.setSession(safe);
    return { ok: true, member: safe };
  },

  // Logout
  logout() {
    this.clearSession();
    const base = window.location.pathname.includes('/pages/') ? '../' : './';
    window.location.href = base + 'login.html';
  },

  // Route guard – redirects to login if not authenticated
  // Returns current user or redirects
  guard(requiredRole = null) {
    const user = this.current();
    if (!user) {
      const base = window.location.pathname.includes('/pages/') ? '../' : './';
      window.location.href = base + 'login.html';
      return null;
    }
    if (requiredRole && user.role !== requiredRole) {
      const base = window.location.pathname.includes('/pages/') ? '../' : './';
      window.location.href = base + 'member.html';
      return null;
    }
    return user;
  }
};

window.Auth = Auth;
