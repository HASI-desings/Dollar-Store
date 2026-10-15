import { tx, req, put, setLock, setLockAt, setLockHook } from './db.js';
import * as cloud from './cloud.js';
import { LEASE_PUBLIC_JWK } from './lease-key.js';
const get = async k => (await tx(['settings'], 'readonly', s => req(s.settings.get(k))))?.value;
const DAY = 864e5, MAX_TIMER = 2147483647;
const ACTIVE = ['trial', 'subscription', 'permanent'];
const dec = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
let offsetMs = 0, pending = false, cur = null, timer = null;
const subs = new Set();

// ONE shared plan state for the whole app. Everything on screen reads it; nothing guesses on its own.
export const onChange = fn => { subs.add(fn); return () => subs.delete(fn); };
export const current = () => cur || { state: 'verification_required' };

// A lease is only believed if the server's signature checks out. Editing it on the device breaks the signature.
async function verifyLease(l) {
  try {
    const key = await crypto.subtle.importKey('jwk', LEASE_PUBLIC_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, dec(l.sig), new TextEncoder().encode(l.payload)))) return null;
    return JSON.parse(new TextDecoder().decode(dec(l.payload)));
  } catch (e) { return null; }
}
const issuedAt = l => { try { return JSON.parse(new TextDecoder().decode(dec(l.payload))).issued_at || 0; } catch (e) { return 0; } };

// Pure: what a plan record means at time `now` (ms). The end date wins over the offline limit, so a trial ends exactly when it ends.
export function judge(p, now) {
  if (['blocked', 'trial_ended', 'subscription_expired'].includes(p.state)) return { mode: 'expired', why: p.state };
  if (p.valid_until && now >= Date.parse(p.valid_until)) return { mode: 'expired', why: p.plan === 'subscription' ? 'subscription_expired' : 'trial_ended' };
  if (now >= p.expires_at) return { mode: 'offline_expired' };
  return { mode: p.plan, left: p.valid_until ? Math.max(0, Math.ceil((Date.parse(p.valid_until) - now) / DAY)) : null, until: p.valid_until, expiresAtMs: p.expires_at };
}
// Pure: the five states the screens use (plus the two expired variants).
export function derive(st, isPending) {
  if (isPending) return { state: 'activation_pending' };
  if (st.mode === 'trial') return { state: 'trial_active', left: st.left, until: st.until };
  if (st.mode === 'subscription') return { state: 'activated', kind: 'subscription', left: st.left, until: st.until };
  if (st.mode === 'permanent') return { state: 'activated', kind: 'permanent' };
  if (st.mode === 'expired') return { state: st.why === 'subscription_expired' ? 'subscription_expired' : st.why === 'blocked' ? 'blocked' : 'trial_expired', why: st.why };
  return { state: 'verification_required' };
}
// Pure: how long to wait before checking again (browsers cap timers at about 24 days).
export const nextDelay = (expiresMs, nowMs) => Math.min(Math.max(expiresMs - nowMs, 0) + 50, MAX_TIMER);
// Customer-safe messages. Raw server text, codes and SQL never reach the screen.
export function friendly(e) {
  const m = String((e && e.message) || '');
  if (/not valid/i.test(m)) return 'This activation key is not valid, or it has already been used.';
  if (/too many wrong keys|choose 1 to|more devices than/i.test(m)) return m;
  if (/not registered/i.test(m)) return 'This device is no longer registered. Ask the shop owner for a new device link.';
  if (/internet|busy|paused|could not check your plan|not deployed/i.test(m)) return "We couldn't verify your activation right now. Check your connection and try again.";
  console.warn('Activation problem:', m);
  return 'Something went wrong. Please try again. If it keeps happening, contact HASI Designs.';
}

// Asks the server for this shop's plan. A reply for another device, or older than the saved one, is ignored.
export async function refresh() {
  const dev = await cloud.device();
  try {
    let info;
    if (LEASE_PUBLIC_JWK) {
      const r = await cloud.lease(), old = await get('lease');
      if (((await get('device')) || {}).id !== dev.id || (old && issuedAt(old) > issuedAt(r))) return null;
      await put('settings', { key: 'lease', value: { payload: r.payload, sig: r.sig } });
      info = r.info;
    } else {
      info = await cloud.shopState();
      if (((await get('device')) || {}).id !== dev.id) return null;
    }
    if (info) {
      await put('settings', { key: 'license_state', value: cloud.stateFrom(info) });
      if (info.now) await put('settings', { key: 'clock_offset', value: Date.parse(info.now) - Date.now() });  // server time, so a wrong phone clock cannot stretch a plan
    }
    return info;
  } catch (e) {
    if (e.message === 'This device is not registered.') {
      await put('settings', { key: 'license_state', value: { state: 'blocked', plan: 'blocked', checked_at: Date.now() } });
      await put('settings', { key: 'lease', value: null });
    }
    throw e;
  }
}
// Offline, the saved signed lease is used. Time never runs backwards (last_seen only goes up).
export async function status() {
  offsetMs = (await get('clock_offset')) || 0;
  const now = Math.max(Date.now() + offsetMs, (await get('last_seen')) || 0);
  await put('settings', { key: 'last_seen', value: now });
  if (LEASE_PUBLIC_JWK) {
    const l = await get('lease'), d = await get('device'), p = l && (await verifyLease(l));
    if (!p || !d || p.device !== d.id) return { mode: 'none' };
    return judge(p, now);
  }
  const s = await get('license_state');
  if (!s || !s.plan) return { mode: 'none' };
  return judge({ state: s.state, plan: s.plan, valid_until: s.valid_until, expires_at: s.checked_at + (s.plan === 'permanent' ? 30 : 7) * DAY }, now);
}
// Works out the state, locks or unlocks writes, tells every screen if it changed, and sets the timer for the next end time.
export async function evaluate() {
  const st = await status(), active = ACTIVE.includes(st.mode), next = { ...derive(st, pending), expiresAtMs: st.expiresAtMs || null };
  setLock(!active);
  setLockAt(active && st.expiresAtMs ? st.expiresAtMs - offsetMs : null);
  const key = o => JSON.stringify([o.state, o.kind, o.left, o.until]);
  const changed = !cur || key(cur) !== key(next);
  cur = next;
  if (changed) subs.forEach(fn => fn(cur));
  schedule();
  return cur;
}
function schedule() {
  clearTimeout(timer);
  if (!cur || !cur.expiresAtMs) return;
  timer = setTimeout(() => { evaluate().catch(() => null); }, nextDelay(cur.expiresAtMs, Date.now() + offsetMs));  // fires at the end time; the 20 second check below covers sleeping devices
}
export async function apply() {
  await refresh().catch(() => null);  // offline is fine: the saved lease is used
  return evaluate();
}
// Keeps the plan right while the app stays open: exact timer, plus a re-check on focus, coming back from the background, and reconnecting.
export function watch() {
  const check = () => { apply().catch(() => null); };
  const onVis = () => { if (document.visibilityState === 'visible') check(); };
  const events = ['focus', 'online', 'pageshow'];
  document.addEventListener('visibilitychange', onVis);
  events.forEach(ev => addEventListener(ev, check));
  const local = setInterval(() => { evaluate().catch(() => null); }, 20000), remote = setInterval(check, 1800000);
  return () => { document.removeEventListener('visibilitychange', onVis); events.forEach(ev => removeEventListener(ev, check)); clearInterval(local); clearInterval(remote); clearTimeout(timer); };
}
// A write attempted at or after the end time re-checks the plan right away.
setLockHook(() => { apply().catch(() => null); });

// Entering a key never unlocks anything by itself: only a verified answer from the server changes the state.
export async function activate(key, devices) {
  if (pending) throw new Error('Your key is already being checked.');
  pending = true; await evaluate();
  try {
    let info;
    try { info = await cloud.activateKey(key, devices); } catch (e) { throw new Error(friendly(e)); }
    await put('settings', { key: 'license_state', value: cloud.stateFrom(info) });
    await refresh().catch(() => null);
  } finally { pending = false; await evaluate(); }
  return current();
}
// 'off' = no public key in the app. 'unverified' = key set but no valid signed lease yet. 'ok' = a signed lease checked out.
export async function securityState() {
  if (!LEASE_PUBLIC_JWK) return 'off';
  const l = await get('lease'), d = await get('device'), p = l && (await verifyLease(l));
  return p && d && p.device === d.id ? 'ok' : 'unverified';
}
