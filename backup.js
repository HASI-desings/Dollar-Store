import { h, toast, download } from './ui.js';
import { STORES, tx, all, req, uid } from './db.js';
import { okRow } from './schema.js';
const DATA = STORES.filter(s => s !== 'backups_log');
const hex = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

export async function snapshot() {
  const data = await tx(DATA, 'readonly', async st => { const o = {}; for (const n of DATA) o[n] = (await req(st[n].getAll())).filter(r => !(n === 'settings' && ['cloud_session', 'pin_lock'].includes(r.key))); return o; });  // login tokens never go into a backup file
  return { version: 1, created_at: new Date().toISOString(), data, checksum: await hex(JSON.stringify(data)) };
}
// Untrusted file: size, JSON, version, known stores only, arrays of objects, checksum.
async function validate(file) {
  if (file.size > 20e6) throw new Error('bad');
  return check(JSON.parse(await file.text()));
}
export async function check(f) {
  if (!f || f.version !== 1 || !f.data || typeof f.data !== 'object') throw new Error('bad');
  for (const [k, v] of Object.entries(f.data)) if (!DATA.includes(k) || !Array.isArray(v) || v.some(r => !okRow(k, r))) throw new Error('bad');
  if (f.checksum !== await hex(JSON.stringify(f.data))) throw new Error('bad');
  return f;
}
// All or nothing: a safety snapshot is saved, stores are replaced, the receipt counter is reset, in ONE transaction.
export async function restore(f) {
  const snap = await snapshot();
  await tx(STORES, 'readwrite', st => {
    st.backups_log.add({ id: uid(), created_at: new Date().toISOString(), kind: 'file', size: 0, status: 'pre-restore', checksum: snap.checksum, payload: JSON.stringify(snap) });
    for (const n of DATA) { st[n].clear(); (f.data[n] || []).forEach(r => st[n].put(r)); }
    const mx = (f.data.sales || []).reduce((a, s) => Math.max(a, parseInt(String(s.receipt_no).slice(2), 10) || 0), 0);
    st.settings.put({ key: 'receipt_counter', value: mx });
  });
}

export async function mount(el) {
  if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  const kept = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : true;
  const last = (await all('backups_log')).filter(b => b.status === 'ok').sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  const now = async () => {
    try {
      const s = await snapshot(), text = JSON.stringify(s);
      download('dollar-store-backup-' + s.created_at.slice(0, 10) + '.json', text, 'application/json');
      await tx(['backups_log'], 'readwrite', st => { st.backups_log.add({ id: uid(), created_at: s.created_at, kind: 'file', size: text.length, status: 'ok', checksum: s.checksum }); });
      toast('Backup saved.'); await mount(el);
    } catch (e) { toast('Backup failed. Try again.'); }
  };
  const picker = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Backup file', onchange: async () => {
    const file = picker.files[0]; if (!file) return;
    let f; try { f = await validate(file); } catch (e) { toast('This backup file is damaged.'); return; }
    if (!confirm('Replace ALL current data with this backup?')) return;
    try { await restore(f); toast('Backup restored.'); setTimeout(() => { location.hash = '#/sell'; location.reload(); }, 800); }
    catch (e) { toast('Restore failed. Your data is unchanged.'); }
  } });
  el.replaceChildren(h('section', { class: 'card' }, h('b', {}, 'Backup and restore'),
    h('p', { class: 'muted' }, last ? 'Last backup: ' + new Date(last.created_at).toLocaleString() + ' (' + Math.ceil(last.size / 1024) + ' KB)' : 'No backup yet.'),
    kept ? null : h('p', { class: 'err' }, 'Your browser may clear data. Back up often.'),
    h('button', { class: 'btn', type: 'button', onclick: now }, 'Backup now'), h('p', { class: 'muted' }, 'Restore from file'), picker));
}

// True when the last good file backup is over 7 days old and there are sales to protect.
export async function dueCheck() {
  const l = (await all('backups_log')).filter(b => b.status === 'ok'), t0 = l.length ? Math.max(...l.map(b => Date.parse(b.created_at))) : 0;
  return Date.now() - t0 > 7 * 864e5 && (await all('sales')).length > 0;
}
