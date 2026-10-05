import { h, ask, toast } from './ui.js';
import { all, put, uid, tx, req } from './db.js';
const OWNER = { id: 'owner', name: 'Owner', role: 'owner', can_discount: true, can_refund: true, can_see_profit: true };
let cur = OWNER;
const get = async k => (await tx(['settings'], 'readonly', s => req(s.settings.get(k))))?.value;
const hex = u => [...u].map(v => v.toString(16).padStart(2, '0')).join('');
const bytes = x => Uint8Array.from(x.match(/../g).map(v => parseInt(v, 16)));
export const current = () => cur;

// PBKDF2 hash with a per-cashier salt. PINs are never stored.
async function hash(pin, saltHex) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: bytes(saltHex), iterations: 100000, hash: 'SHA-256' }, k, 256)));
}
// Returns the matching cashier or null. A wrong PIN is counted once; 5 misses lock for 30 seconds, growing.
async function tryPin(list, pin) {
  const L = (await get('pin_lock')) || { tries: 0, until: 0 };
  if (Date.now() < L.until) throw new Error('Too many tries. Wait ' + Math.ceil((L.until - Date.now()) / 1000) + ' seconds.');
  for (const c of list) if ((await hash(pin, c.pin_salt)) === c.pin_hash) { await put('settings', { key: 'pin_lock', value: { tries: 0, until: 0 } }); return c; }
  const tries = L.tries + 1;
  await put('settings', { key: 'pin_lock', value: { tries, until: tries >= 5 ? Date.now() + 30000 * (tries - 4) : 0 } });
  return null;
}
const active = async () => (await all('cashiers')).filter(c => c.active);
// The sign-in lasts until the day is closed: closing a day starts a new cycle.
const cycle = async () => (await all('day_closes')).map(d => d.closed_at).sort().pop() || 'none';

export async function init() {
  cur = { ...OWNER, name: (await get('cashier_name')) || 'Owner' };
  const list = await active(); if (!list.length) return;
  const cy = await cycle(), ses = await get('session'), kept = ses && ses.cycle === cy && list.find(c => c.id === ses.id);
  if (kept) { cur = kept; return; }
  await new Promise(res => {
    const sel = h('select', { 'aria-label': 'Cashier' }, list.map(c => h('option', { value: c.id }, c.name + ' (' + c.role + ')')));
    const pin = h('input', { type: 'password', inputmode: 'numeric', 'aria-label': 'PIN' }), err = h('p', { class: 'err' });
    const box = h('div', { class: 'setup' }, h('h1', {}, 'Who is selling?'), sel, h('label', { class: 'fld' }, 'PIN', pin), err,
      h('button', { class: 'btn full', type: 'button', onclick: async () => {
        try {
          const ok = await tryPin([list.find(x => x.id === sel.value)], pin.value);
          if (ok) { cur = ok; await put('settings', { key: 'session', value: { id: ok.id, cycle: cy } }); box.remove(); res(); } else err.textContent = 'Wrong PIN.';
        } catch (e) { err.textContent = e.message; }
      } }, 'Sign in'));
    document.body.append(box);
  });
}
// Owner-only pages. The daily sign-in is enough; no repeated prompts.
export async function guardOwner() {
  if (!(await active()).length) return true;
  if (cur.role !== 'owner') { toast('Owner only.'); return false; }
  return true;
}
// Dangerous moves always need an owner PIN, even for the owner. A cashier doing it is recorded for the owner.
export async function requirePin(label) {
  const owners = (await active()).filter(c => c.role === 'owner');
  if (!owners.length) return true;
  return new Promise(res => ask('Owner PIN needed', [{ k: 'pin', label: label + ': enter the owner PIN', type: 'password' }], async v => {
    try { if (await tryPin(owners, v.pin)) { if (cur.role !== 'owner') await notify('needed owner PIN for ' + label); res(true); return; } } catch (e) { return e.message; }
    return 'Wrong PIN.';
  }, () => res(false)));
}
// A cashier's actions are logged so the owner sees them on the next visit.
export async function notify(what, ref) {
  if (cur.role === 'owner') return;
  await tx(['activity_log'], 'readwrite', s => { s.activity_log.add({ id: uid(), created_at: new Date().toISOString(), cashier_id: cur.id, action: 'staff:' + cur.name + ' ' + what, ref_id: ref || '' }); });
}
export async function unseen() {
  if (cur.role !== 'owner') return 0;
  const seen = (await get('staff_seen')) || '';
  return (await all('activity_log')).filter(a => a.action.startsWith('staff:') && a.created_at > seen).length;
}
export async function mount(root) {
  await put('settings', { key: 'staff_seen', value: new Date().toISOString() });
  const [cs, log] = await Promise.all([all('cashiers'), all('activity_log')]), yn = v => /^(y|yes)$/i.test(v);
  const add = () => ask('Add cashier', [{ k: 'name', label: 'Name' }, { k: 'pin', label: 'PIN (4 to 6 digits)', type: 'password' }, { k: 'role', label: 'Role (owner or cashier)', v: 'cashier' },
    { k: 'd', label: 'Can give discounts (yes/no)', v: 'no' }, { k: 'r', label: 'Can refund (yes/no)', v: 'no' }, { k: 'p', label: 'Can see profit (yes/no)', v: 'no' }], async v => {
    const role = v.role.toLowerCase();
    if (!v.name) return 'Enter a name.'; if (!/^\d{4,6}$/.test(v.pin)) return 'PIN must be 4 to 6 digits.';
    if (!['owner', 'cashier'].includes(role)) return 'Role must be owner or cashier.'; if (!cs.length && role !== 'owner') return 'Add an owner first.';
    if (cs.length && !(await requirePin('Add cashier'))) return 'Cancelled.';
    const salt = hex(crypto.getRandomValues(new Uint8Array(16))), o = role === 'owner';
    await put('cashiers', { id: uid(), name: v.name, pin_salt: salt, pin_hash: await hash(v.pin, salt), role, can_discount: o || yn(v.d), can_refund: o || yn(v.r), can_see_profit: o || yn(v.p), active: true });
    await mount(root);
  });
  const toggle = async c => {
    if (c.active && c.role === 'owner' && cs.filter(x => x.active && x.role === 'owner').length === 1) { toast('Keep one active owner.'); return; }
    if (!(await requirePin('Change staff'))) return;
    await put('cashiers', { ...c, active: !c.active }); await mount(root);
  };
  root.replaceChildren(h('button', { class: 'btn', type: 'button', onclick: add }, '+ Cashier'), h('p', { class: 'muted' }, 'Permissions are a convenience, not tamper-proof security.'),
    ...cs.map(c => h('section', { class: 'card' }, h('b', {}, c.name + ' · ' + c.role + (c.active ? '' : ' (off)')),
      h('p', { class: 'muted' }, ['discount', 'refund', 'profit'].filter((_, i) => [c.can_discount, c.can_refund, c.can_see_profit][i]).join(', ') || 'no extra permissions'),
      h('button', { class: 'btn sec', type: 'button', onclick: () => toggle(c) }, c.active ? 'Turn off' : 'Turn on'))),
    h('section', { class: 'card' }, h('b', {}, 'Activity'), ...[...log].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 15).map(a => h('div', { class: 'ln' }, h('span', {}, a.created_at.slice(0, 16).replace('T', ' ')), h('span', {}, a.action.replace(/^staff:/, ''))))));
}
