/**
 * SharePay - Local Storage Manager
 * All app data stored in localStorage; synced to Google Sheets on write.
 */

const DB_KEY = "sharepay_db";

function getDB() {
  try {
    const db = JSON.parse(localStorage.getItem(DB_KEY)) || initDB();
    // Backward-compat: fill in any tables that didn't exist in older saved DBs
    let changed = false;
    ['members', 'groups', 'expenses', 'settlements', 'notifications', 'friendRequests', 'groupInvites'].forEach(key => {
      if (!Array.isArray(db[key])) { db[key] = []; changed = true; }
    });
    if (changed) saveDB(db);
    return db;
  }
  catch { return initDB(); }
}

function initDB() {
  const db = { members: [], groups: [], expenses: [], settlements: [], notifications: [], friendRequests: [], groupInvites: [] };
  saveDB(db);
  return db;
}

function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ===== MEMBERS =====
const Members = {
  getAll() { return getDB().members; },
  getById(id) { return getDB().members.find(m => m.id === id); },
  getByEmail(email) { return getDB().members.find(m => m.email.toLowerCase() === email.toLowerCase()); },

  create(data) {
    const db = getDB();
    const member = { id: genId(), createdAt: new Date().toISOString(), ...data };
    db.members.push(member);
    saveDB(db);
    SheetsAPI.createRow(SHEET_NAMES.members, member).catch(() => {});
    return member;
  },

  update(id, data) {
    const db = getDB();
    const idx = db.members.findIndex(m => m.id === id);
    if (idx === -1) return null;
    db.members[idx] = { ...db.members[idx], ...data, updatedAt: new Date().toISOString() };
    saveDB(db);
    SheetsAPI.updateRow(SHEET_NAMES.members, id, db.members[idx]).catch(() => {});
    return db.members[idx];
  },

  delete(id) {
    const db = getDB();
    db.members = db.members.filter(m => m.id !== id);
    saveDB(db);
    SheetsAPI.deleteRow(SHEET_NAMES.members, id).catch(() => {});
  },

  // Search real (non-guest) accounts by Username / ชื่อเล่น (name) / User ID / email
  search(query, excludeId) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    return getDB().members.filter(m => {
      if (m.id === excludeId) return false;
      if (m.isGuest) return false;
      return (
        m.id.toLowerCase().includes(q) ||
        (m.name || '').toLowerCase().includes(q) ||
        (m.username || '').toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q)
      );
    }).slice(0, 20);
  }
};

// ===== GROUPS =====
const Groups = {
  getAll() { return getDB().groups; },
  getById(id) { return getDB().groups.find(g => g.id === id); },
  getByMember(memberId) { return getDB().groups.filter(g => (g.memberIds || []).includes(memberId)); },

  create(data) {
    const db = getDB();
    const group = { id: genId(), createdAt: new Date().toISOString(), totalExpenses: 0, ...data };
    db.groups.push(group);
    saveDB(db);
    SheetsAPI.createRow(SHEET_NAMES.groups, { ...group, memberIds: (group.memberIds || []).join(',') }).catch(() => {});
    return group;
  },

  update(id, data) {
    const db = getDB();
    const idx = db.groups.findIndex(g => g.id === id);
    if (idx === -1) return null;
    db.groups[idx] = { ...db.groups[idx], ...data, updatedAt: new Date().toISOString() };
    saveDB(db);
    SheetsAPI.updateRow(SHEET_NAMES.groups, id, { ...db.groups[idx], memberIds: (db.groups[idx].memberIds || []).join(',') }).catch(() => {});
    return db.groups[idx];
  },

  delete(id) {
    const db = getDB();
    db.groups = db.groups.filter(g => g.id !== id);
    db.expenses = db.expenses.filter(e => e.groupId !== id);
    db.settlements = db.settlements.filter(s => s.groupId !== id);
    saveDB(db);
    SheetsAPI.deleteRow(SHEET_NAMES.groups, id).catch(() => {});
  }
};

// ===== EXPENSES =====
const Expenses = {
  getAll() { return getDB().expenses; },
  getById(id) { return getDB().expenses.find(e => e.id === id); },
  getByGroup(groupId) { return getDB().expenses.filter(e => e.groupId === groupId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); },
  getByMember(memberId) { return getDB().expenses.filter(e => (e.splitMemberIds || []).includes(memberId) || e.paidById === memberId); },

  create(data) {
    const db = getDB();
    const expense = { id: genId(), createdAt: new Date().toISOString(), ...data };
    db.expenses.push(expense);
    // update group total
    const gIdx = db.groups.findIndex(g => g.id === data.groupId);
    if (gIdx !== -1) { db.groups[gIdx].totalExpenses = (db.groups[gIdx].totalExpenses || 0) + data.amount; db.groups[gIdx].lastActivity = new Date().toISOString(); }
    saveDB(db);
    SheetsAPI.createRow(SHEET_NAMES.expenses, { ...expense, splitMemberIds: (expense.splitMemberIds || []).join(','), splitMemberNames: (expense.splitMemberNames || []).join(',') }).catch(() => {});
    return expense;
  },

  update(id, data) {
    const db = getDB();
    const idx = db.expenses.findIndex(e => e.id === id);
    if (idx === -1) return null;
    db.expenses[idx] = { ...db.expenses[idx], ...data, updatedAt: new Date().toISOString() };
    saveDB(db);
    SheetsAPI.updateRow(SHEET_NAMES.expenses, id, db.expenses[idx]).catch(() => {});
    return db.expenses[idx];
  },

  delete(id) {
    const db = getDB();
    const expense = db.expenses.find(e => e.id === id);
    if (expense) {
      const gIdx = db.groups.findIndex(g => g.id === expense.groupId);
      if (gIdx !== -1) db.groups[gIdx].totalExpenses = Math.max(0, (db.groups[gIdx].totalExpenses || 0) - expense.amount);
    }
    db.expenses = db.expenses.filter(e => e.id !== id);
    saveDB(db);
    SheetsAPI.deleteRow(SHEET_NAMES.expenses, id).catch(() => {});
  }
};

// ===== SETTLEMENTS =====
const Settlements = {
  getAll() { return getDB().settlements; },
  getByGroup(groupId) { return getDB().settlements.filter(s => s.groupId === groupId); },
  getByMember(memberId) { return getDB().settlements.filter(s => s.fromId === memberId || s.toId === memberId); },

  create(data) {
    const db = getDB();
    const s = { id: genId(), createdAt: new Date().toISOString(), status: 'pending', ...data };
    db.settlements.push(s);
    saveDB(db);
    SheetsAPI.createRow(SHEET_NAMES.settlements, s).catch(() => {});
    return s;
  },

  update(id, data) {
    const db = getDB();
    const idx = db.settlements.findIndex(s => s.id === id);
    if (idx === -1) return null;
    db.settlements[idx] = { ...db.settlements[idx], ...data, updatedAt: new Date().toISOString() };
    saveDB(db);
    SheetsAPI.updateRow(SHEET_NAMES.settlements, id, db.settlements[idx]).catch(() => {});
    return db.settlements[idx];
  }
};

// ===== NOTIFICATIONS =====
const Notifications = {
  getByMember(memberId) { return getDB().notifications.filter(n => n.memberId === memberId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,50); },
  getUnreadCount(memberId) { return getDB().notifications.filter(n => n.memberId === memberId && !n.isRead).length; },

  create(data) {
    const db = getDB();
    const n = { id: genId(), createdAt: new Date().toISOString(), isRead: false, ...data };
    db.notifications.push(n);
    saveDB(db);
    return n;
  },

  markRead(id) {
    const db = getDB();
    const idx = db.notifications.findIndex(n => n.id === id);
    if (idx !== -1) { db.notifications[idx].isRead = true; saveDB(db); }
  },

  markAllRead(memberId) {
    const db = getDB();
    db.notifications.forEach(n => { if (n.memberId === memberId) n.isRead = true; });
    saveDB(db);
  }
};

// ===== FRIEND REQUESTS =====
const FriendRequests = {
  getAll() { return getDB().friendRequests; },
  getById(id) { return getDB().friendRequests.find(r => r.id === id); },

  // Any existing request (pending/accepted/rejected) between the two users, in either direction
  getBetween(aId, bId) {
    return getDB().friendRequests.find(r =>
      (r.fromId === aId && r.toId === bId) || (r.fromId === bId && r.toId === aId));
  },

  getIncomingPending(memberId) {
    return getDB().friendRequests.filter(r => r.toId === memberId && r.status === 'pending');
  },

  getFriends(memberId) {
    const ids = getDB().friendRequests
      .filter(r => r.status === 'accepted' && (r.fromId === memberId || r.toId === memberId))
      .map(r => (r.fromId === memberId ? r.toId : r.fromId));
    return ids.map(id => Members.getById(id)).filter(Boolean);
  },

  areFriends(aId, bId) {
    const r = this.getBetween(aId, bId);
    return !!r && r.status === 'accepted';
  },

  // 'none' | 'friends' | 'pending_sent' (aId sent to bId) | 'pending_received' (bId sent to aId)
  statusBetween(aId, bId) {
    const r = this.getBetween(aId, bId);
    if (!r || r.status === 'rejected') return 'none';
    if (r.status === 'accepted') return 'friends';
    return r.fromId === aId ? 'pending_sent' : 'pending_received';
  },

  send(fromId, toId) {
    if (!fromId || !toId) return { ok: false, error: 'ข้อมูลไม่ถูกต้อง' };
    if (fromId === toId) return { ok: false, error: 'ไม่สามารถเพิ่มตัวเองเป็นเพื่อนได้' };

    const db = getDB();
    const existing = db.friendRequests.find(r =>
      (r.fromId === fromId && r.toId === toId) || (r.fromId === toId && r.toId === fromId));

    if (existing) {
      if (existing.status === 'accepted') return { ok: false, error: 'เป็นเพื่อนกันอยู่แล้ว' };
      if (existing.status === 'pending') return { ok: false, error: 'มีคำขอเป็นเพื่อนค้างอยู่แล้ว' };
      // rejected before — allow sending a fresh request, replacing the old record
      db.friendRequests = db.friendRequests.filter(r => r.id !== existing.id);
    }

    const request = { id: genId(), fromId, toId, status: 'pending', createdAt: new Date().toISOString() };
    db.friendRequests.push(request);
    saveDB(db);
    return { ok: true, request };
  },

  respond(requestId, accept) {
    const db = getDB();
    const idx = db.friendRequests.findIndex(r => r.id === requestId);
    if (idx === -1) return null;
    if (db.friendRequests[idx].status !== 'pending') return db.friendRequests[idx];
    db.friendRequests[idx] = { ...db.friendRequests[idx], status: accept ? 'accepted' : 'rejected', respondedAt: new Date().toISOString() };
    saveDB(db);
    return db.friendRequests[idx];
  }
};

// ===== GROUP INVITES =====
const GroupInvites = {
  getAll() { return getDB().groupInvites; },
  getById(id) { return getDB().groupInvites.find(i => i.id === id); },
  getIncomingPending(memberId) { return getDB().groupInvites.filter(i => i.toId === memberId && i.status === 'pending'); },
  getPendingForGroupAndUser(groupId, userId) {
    return getDB().groupInvites.find(i => i.groupId === groupId && i.toId === userId && i.status === 'pending');
  },

  send(groupId, groupName, fromId, fromName, toId) {
    const group = Groups.getById(groupId);
    if (!group) return { ok: false, error: 'ไม่พบกลุ่ม' };
    if ((group.memberIds || []).includes(toId)) return { ok: false, error: 'ผู้ใช้นี้อยู่ในกลุ่มแล้ว' };
    if (toId === fromId) return { ok: false, error: 'ไม่สามารถเชิญตัวเองได้' };

    const db = getDB();
    const existing = db.groupInvites.find(i => i.groupId === groupId && i.toId === toId && i.status === 'pending');
    if (existing) return { ok: false, error: 'มีคำเชิญค้างอยู่แล้ว' };

    const invite = { id: genId(), groupId, groupName, fromId, fromName, toId, status: 'pending', createdAt: new Date().toISOString() };
    db.groupInvites.push(invite);
    saveDB(db);
    return { ok: true, invite };
  },

  respond(inviteId, accept) {
    const db = getDB();
    const idx = db.groupInvites.findIndex(i => i.id === inviteId);
    if (idx === -1) return null;
    if (db.groupInvites[idx].status !== 'pending') return db.groupInvites[idx];

    db.groupInvites[idx] = { ...db.groupInvites[idx], status: accept ? 'accepted' : 'rejected', respondedAt: new Date().toISOString() };

    if (accept) {
      const gIdx = db.groups.findIndex(g => g.id === db.groupInvites[idx].groupId);
      if (gIdx !== -1) {
        const memberIds = db.groups[gIdx].memberIds || [];
        if (!memberIds.includes(db.groupInvites[idx].toId)) {
          db.groups[gIdx] = { ...db.groups[gIdx], memberIds: [...memberIds, db.groupInvites[idx].toId] };
        }
      }
    }
    saveDB(db);
    return db.groupInvites[idx];
  }
};

// ===== DEBT CALCULATOR =====
function calculateDebts(groupId) {
  const expenses = Expenses.getByGroup(groupId);
  const group = Groups.getById(groupId);
  if (!group) return [];

  const balance = {};
  (group.memberIds || []).forEach(mid => { balance[mid] = 0; });

  expenses.forEach(exp => {
    const perPerson = exp.amount / (exp.splitMemberIds || [exp.paidById]).length;
    (exp.splitMemberIds || [exp.paidById]).forEach(mid => {
      if (mid !== exp.paidById) {
        balance[mid] = (balance[mid] || 0) - perPerson;
        balance[exp.paidById] = (balance[exp.paidById] || 0) + perPerson;
      }
    });
  });

  // Apply confirmed settlements
  Settlements.getByGroup(groupId).forEach(s => {
    if (s.status === 'confirmed') {
      balance[s.fromId] = (balance[s.fromId] || 0) + s.amount;
      balance[s.toId]   = (balance[s.toId]   || 0) - s.amount;
    }
  });

  const debtors   = Object.entries(balance).filter(([,v]) => v < -0.01).map(([id,v]) => ({ id, amount: v }));
  const creditors = Object.entries(balance).filter(([,v]) => v >  0.01).map(([id,v]) => ({ id, amount: v }));
  const transactions = [];

  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i], c = creditors[j];
    const amt = Math.min(-d.amount, c.amount);
    const dMember = Members.getById(d.id);
    const cMember = Members.getById(c.id);
    transactions.push({
      fromId: d.id, fromName: dMember?.name || d.id,
      toId: c.id,   toName: cMember?.name   || c.id,
      amount: Math.round(amt * 100) / 100
    });
    d.amount += amt;
    c.amount -= amt;
    if (Math.abs(d.amount) < 0.01) i++;
    if (Math.abs(c.amount) < 0.01) j++;
  }
  return transactions;
}

window.SP = { Members, Groups, Expenses, Settlements, Notifications, FriendRequests, GroupInvites, calculateDebts, genId };
