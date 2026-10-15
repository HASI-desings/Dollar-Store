// IndexedDB wrapper. All stores from App.md. Money is integer rupees.
const KEYS = { settings: 'key' };
export const STORES = ['settings', 'cashiers', 'categories', 'prices', 'sales', 'sale_lines', 'refunds', 'udhaar_payments', 'lots', 'expenses', 'recurring_expenses', 'withdrawals', 'day_closes', 'held_bills', 'backups_log', 'activity_log'];
let dbp;
export const uid = () => crypto.randomUUID();
export const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export function open() {
  if (!dbp) dbp = new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('nodb'));
    const r = indexedDB.open('dsb', 2);
    // Upgrades only ever ADD missing stores. Existing data is never touched.
    r.onupgradeneeded = () => { for (const s of STORES) { if (r.result.objectStoreNames.contains(s)) continue; const o = r.result.createObjectStore(s, { keyPath: KEYS[s] || 'id' }); if (s === 'sale_lines') o.createIndex('sale_id', 'sale_id'); } };
    r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); res(r.result); };
    r.onerror = () => rej(new Error('nodb'));
  });
  return dbp;
}
// Run fn(stores) in ONE transaction. fn may await requests only. Resolves with fn's result after commit.
export let locked = false;
export const setLock = v => { locked = v; };
// When the plan has a known end time, writes are blocked from that moment, even before the screen has redrawn.
export let lockAt = null;
export const setLockAt = v => { lockAt = v; };
let lockHook = null;
export const setLockHook = fn => { lockHook = fn; };
export async function tx(names, mode, fn) {
  // Read-only mode (trial over): only settings, drafts and the backup log may be written.
  if (!locked && lockAt && Date.now() >= lockAt) { locked = true; if (lockHook) lockHook(); }
  if (locked && mode === 'readwrite' && !names.every(n => ['settings', 'backups_log', 'held_bills'].includes(n))) throw new Error('locked');
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(names, mode); let out;
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('abort'));
    const st = {}; for (const n of names) st[n] = t.objectStore(n);
    Promise.resolve(fn(st)).then(v => { out = v; }, e => { try { t.abort(); } catch (x) { /* already finished */ } rej(e); });
  });
}
export const all = s => tx([s], 'readonly', st => req(st[s].getAll()));
export const put = (s, o) => tx([s], 'readwrite', st => { st[s].put(o); });
