import { SUPABASE_URL as U, SUPABASE_ANON_KEY as K } from './config.js';
import { tx, req, put, all } from './db.js';
const get = async k => (await tx(['settings'], 'readonly', s => req(s.settings.get(k))))?.value;
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');

// Call a Supabase function. The server's plain-language errors are passed on as they are.
export async function rpc(name, args) {
  let r; try { r = await fetch(U + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: K, 'Content-Type': 'application/json' }, body: JSON.stringify(args) }); } catch (e) { throw new Error('No internet connection.'); }
  if (r.status >= 500) throw new Error('The server is busy or paused. Try again later.');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || 'Something went wrong.');
  if (j && typeof j === 'object' && typeof j.error === 'string') throw new Error(j.error);
  return j;
}
// Each device has a random id and secret. The server keeps only a hash of the secret.
export async function device() {
  let d = await get('device');
  if (!d) { d = { id: crypto.randomUUID(), token: hex(32) }; await put('settings', { key: 'device', value: d }); }
  return d;
}
export const stateFrom = info => ({ ...info, valid_until: info.plan === 'trial' ? info.trial_ends_at : info.plan === 'subscription' ? info.paid_until : null, checked_at: Date.now() });
// Saves the shop, the plan and this device's receipt letter (first device R, then B, C...).
async function saved(info) {
  const px = info.device_no === 1 ? 'R' : String.fromCharCode(64 + info.device_no);
  await tx(['settings'], 'readwrite', async s => {
    s.settings.put({ key: 'license_state', value: stateFrom(info) }); s.settings.put({ key: 'receipt_prefix', value: px });
    s.settings.put({ key: 'setup_done', value: true });
    if (!(await req(s.settings.get('shop')))) s.settings.put({ key: 'shop', value: { name: info.shop_name, address: '', phone: '' } });
  });
}
export async function registerShop(name, phone, key, devices) {
  const d = await device();
  const info = await rpc('register_shop', { p_name: name, p_phone: phone, p_device: d.id, p_token: d.token, p_key: key || null, p_devices: devices || null });
  await saved(info); return info;
}
export async function join(invite) { const d = await device(); const info = await rpc('join_shop', { p_invite: invite, p_device: d.id, p_token: d.token }); await saved(info); return info; }
const call = async (name, extra = {}) => { const d = await device(); return rpc(name, { p_device: d.id, p_token: d.token, ...extra }); };
export const shopState = () => call('shop_state');
export const activateKey = (key, devices) => call('activate_key', { p_key: key, p_devices: devices });
export const setLimit = n => call('set_device_limit', { p_limit: n });
export const makeInvite = () => call('make_invite');
export const listDevices = () => call('list_devices');
export const revoke = id => call('revoke_device', { p_target: id });
// A signed statement of this device's plan (made by supabase/functions/lease).
export async function lease() {
  const d = await device(); let r;
  try { r = await fetch(U + '/functions/v1/lease', { method: 'POST', headers: { apikey: K, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_device: d.id, p_token: d.token }) }); } catch (e) { throw new Error('No internet connection.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || 'Could not check your plan.');
  return j;
}

// Copies this shop's data to its rows in the cloud. Safe to repeat: rows are matched by id.
const HIST = ['sales', 'sale_lines', 'refunds', 'udhaar_payments', 'expenses', 'withdrawals', 'day_closes', 'lots'];
const PUSH = [...HIST, 'categories', 'prices'];
export async function push(onProgress) {
  const rows = []; for (const s of PUSH) for (const r of await all(s)) rows.push({ store: s, row_id: r.id, data: r });
  for (let i = 0; i < rows.length; i += 300) {
    await call('push_records', { p_rows: rows.slice(i, i + 300) });
    if (onProgress) onProgress(Math.min(100, (i + 300) / rows.length * 100));
  }
  await put('settings', { key: 'last_push', value: Date.now() }); return rows.length;
}
let timer = null, busy = false;
// Background upload a few seconds after a sale. Offline or ended plans just try again next time.
export function pushSoon() {
  clearTimeout(timer);
  timer = setTimeout(async () => { if (busy || !navigator.onLine) return; busy = true; await push().catch(() => null); busy = false; }, 5000);
}
async function pullAll(store) {
  const out = []; let after = '';
  for (;;) {
    const rows = await call('pull_records', { p_store: store, p_after: after });
    rows.forEach(r => out.push(r.data));
    if (rows.length < 500) return out;
    after = rows[rows.length - 1].row_id;
  }
}
// Brings the shop's saved data onto this device. Only rows that are missing here are added; nothing is overwritten.
export async function pull() {
  const got = {}; for (const s of PUSH) got[s] = await pullAll(s);
  const key = s => String(s).trim().toLowerCase();
  const byName = new Map((await all('categories')).map(c => [key(c.name), c.id])), map = new Map(), newCats = [];
  for (const c of got.categories) { if (byName.has(key(c.name))) map.set(c.id, byName.get(key(c.name))); else { map.set(c.id, c.id); byName.set(key(c.name), c.id); newCats.push(c); } }
  const have = new Set((await all('prices')).map(p => p.category_id + '|' + key(p.label || '') + '|' + p.amount));
  const newPrices = got.prices.map(p => ({ ...p, category_id: map.get(p.category_id) || p.category_id })).filter(p => { const k = p.category_id + '|' + key(p.label || '') + '|' + p.amount; if (have.has(k)) return false; have.add(k); return true; });
  const added = await tx([...HIST, 'categories', 'prices'], 'readwrite', async s => {
    let n = 0;
    for (const c of newCats) { s.categories.put(c); n++; }
    for (const p of newPrices) { s.prices.put(p); n++; }
    for (const st of HIST) for (const r of got[st]) if ((await req(s[st].getKey(r.id))) === undefined) { s[st].put(r); n++; }
    return n;
  });
  // Receipt numbers carry on after the highest one restored for this device's letter.
  const px = (await get('receipt_prefix')) || 'R'; let mx = 0;
  for (const r of got.sales) if (String(r.receipt_no).startsWith(px + '-')) mx = Math.max(mx, parseInt(String(r.receipt_no).slice(2), 10) || 0);
  if (mx > ((await get('receipt_counter')) || 0)) await put('settings', { key: 'receipt_counter', value: mx });
  return added;
}
