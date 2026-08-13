/**
 * SharePay - Cloud Sync
 * ---------------------------------------------------------------
 * Every write already gets pushed to Google Sheets (see storage.js),
 * but until now nothing ever pulled that data back down — so a
 * second device (or a second browser) only ever saw whatever had
 * been created locally on IT, never anything created elsewhere.
 * That's why friend requests / new accounts "didn't show up" when
 * switching devices.
 *
 * CloudSync.pullAll() fetches every table from Sheets and merges it
 * into the local copy (localStorage) so the app behaves the same no
 * matter which device you're on. Call it before you rely on the DB
 * having up-to-date info from other people/devices (login, register,
 * opening the app, opening the friends panel, etc).
 */

const CloudSync = {
  _pulling: null,
  lastSyncedAt: null,

  // Rows coming back from Sheets are flat/stringified (Sheets only stores
  // text/numbers) — turn them back into the shape the local DB expects.
  _normalize(dbKey, row) {
    const r = { ...row };
    const toArray = v => Array.isArray(v) ? v : (typeof v === 'string' && v.length ? v.split(',').map(s => s.trim()).filter(Boolean) : []);
    const toNum = v => (v === '' || v === null || v === undefined) ? undefined : Number(v);
    const toBool = v => v === true || v === 'true' || v === 'TRUE' || v === 1 || v === '1';

    if (dbKey === 'groups') {
      r.memberIds = toArray(r.memberIds);
      const n = toNum(r.totalExpenses); if (n !== undefined) r.totalExpenses = n;
    }
    if (dbKey === 'expenses') {
      r.splitMemberIds = toArray(r.splitMemberIds);
      r.splitMemberNames = toArray(r.splitMemberNames);
      const a = toNum(r.amount); if (a !== undefined) r.amount = a;
      const sa = toNum(r.splitAmount); if (sa !== undefined) r.splitAmount = sa;
    }
    if (dbKey === 'settlements') {
      const a = toNum(r.amount); if (a !== undefined) r.amount = a;
    }
    if (dbKey === 'members') {
      if ('isGuest' in r) r.isGuest = toBool(r.isGuest);
    }
    if (dbKey === 'notifications') {
      if ('isRead' in r) r.isRead = toBool(r.isRead);
      if (typeof r.data === 'string' && r.data) {
        try { r.data = JSON.parse(r.data); } catch { /* leave as-is */ }
      }
    }
    return r;
  },

  // The Apps Script backend can come back in a few different shapes
  // depending on how it was deployed — handle the common ones.
  _extractRows(res) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.data)) return res.data;
    if (res && Array.isArray(res.rows)) return res.rows;
    if (res && Array.isArray(res.result)) return res.result;
    if (res && res.ok === false) return null;
    return null;
  },

  // Merge remote rows into a local table by id. Remote is the shared
  // source of truth for anything both sides know about; local-only
  // records (created while offline, not synced yet) are kept as-is.
  _mergeTable(localArr, remoteArr, dbKey) {
    const map = new Map((localArr || []).map(item => [item.id, item]));
    remoteArr.forEach(row => {
      if (!row || !row.id) return;
      const norm = this._normalize(dbKey, row);
      map.set(row.id, { ...(map.get(row.id) || {}), ...norm });
    });
    return [...map.values()];
  },

  // Fetch + merge everything. Safe to call often — concurrent calls
  // share the same in-flight request instead of firing duplicates.
  async pullAll() {
    if (!window.SharePayConfig?.SheetsAPI?.isConfigured) return false;
    if (this._pulling) return this._pulling;
    this._pulling = this._doPull().finally(() => { this._pulling = null; });
    return this._pulling;
  },

  async _doPull() {
    try {
      const api = window.SharePayConfig.SheetsAPI;
      const names = window.SharePayConfig.SHEET_NAMES;
      const tables = [
        ['members', names.members],
        ['groups', names.groups],
        ['expenses', names.expenses],
        ['settlements', names.settlements],
        ['friendRequests', names.friendRequests],
        ['groupInvites', names.groupInvites],
        ['notifications', names.notifications]
      ].filter(([, sheetName]) => !!sheetName);

      const results = await Promise.all(
        tables.map(([, sheetName]) => api.getRows(sheetName).catch(() => null))
      );

      const db = getDB();
      tables.forEach(([dbKey], i) => {
        const rows = this._extractRows(results[i]);
        if (!rows) return; // request failed / not configured — keep local data untouched
        db[dbKey] = this._mergeTable(db[dbKey], rows, dbKey);
      });
      saveDB(db);
      this.lastSyncedAt = new Date().toISOString();
      return true;
    } catch (err) {
      console.error('[CloudSync] pullAll failed:', err);
      return false;
    }
  }
};

window.CloudSync = CloudSync;
