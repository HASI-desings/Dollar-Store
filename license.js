import { tx, req, put, setLock } from './db.js';
import * as cloud from './cloud.js';
import { LEASE_PUBLIC_JWK } from './lease-key.js';
const get = async k => (await tx(['settings'], 'readonly', s => req(s.settings.get(k))))?.value;
const DAY = 864e5;
const dec = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

// A lease is only believed if the server's signature checks out. Editing it on the device breaks the signature.
async function verifyLease(l) {
  try {
    const key = await crypto.subtle.importKey('jwk', LEASE_PUBLIC_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, dec(l.sig), new TextEncoder().encode(l.payload)))) return null;
    return JSON.parse(new TextDecoder().decode(dec(l.payload)));
  } catch (e) { return null; }
}
// Asks the server for this shop's plan. With the lease keys set, the signed lease is what the app trusts.
export async function refresh() {
  try {
    if (LEASE_PUBLIC_JWK) {
      const r = await cloud.lease();
      await put('settings', { key: 'lease', value: { payload: r.payload, sig: r.sig } });
      if (r.info) await put('settings', { key: 'license_state', value: cloud.stateFrom(r.info) });  // for display only
      return r.info;
    }
    const info = await cloud.shopState(); await put('settings', { key: 'license_state', value: cloud.stateFrom(info) }); return info;
  } catch (e) {
    if (e.message === 'This device is not registered.') {
      await put('settings', { key: 'license_state', value: { state: 'blocked', plan: 'blocked', checked_at: Date.now() } });
      await put('settings', { key: 'lease', value: null });
    }
    throw e;
  }
}
// Works out what the app may do. Time never runs backwards, and an offline lease runs out on its own date.
export async function status() {
  const now = Math.max(Date.now(), (await get('last_seen')) || 0);
  await put('settings', { key: 'last_seen', value: now });
  if (LEASE_PUBLIC_JWK) {
    const l = await get('lease'), d = await get('device'), p = l && (await verifyLease(l));
    if (!p || !d || p.device !== d.id) return { mode: 'none' };
    if (['blocked', 'trial_ended', 'subscription_expired'].includes(p.state)) return { mode: 'expired', why: p.state };
    if (now >= p.expires_at) return { mode: 'offline_expired' };
    return { mode: p.plan, left: p.valid_until ? Math.max(0, Math.ceil((Date.parse(p.valid_until) - now) / DAY)) : null, until: p.valid_until };
  }
  const s = await get('license_state');
  if (!s) return { mode: 'none' };
  if (['blocked', 'trial_ended', 'subscription_expired'].includes(s.state)) return { mode: 'expired', why: s.state };
  if (now - s.checked_at > (s.plan === 'permanent' ? 30 : 7) * DAY) return { mode: 'offline_expired' };
  if (s.valid_until && Date.parse(s.valid_until) <= now) return { mode: 'expired', why: s.state };
  return { mode: s.plan, left: s.valid_until ? Math.max(0, Math.ceil((Date.parse(s.valid_until) - now) / DAY)) : null, until: s.valid_until };
}
export async function apply() {
  await refresh().catch(() => null);  // offline is fine: the saved plan or lease is used
  const s = await status();
  setLock(!['trial', 'subscription', 'permanent'].includes(s.mode));
  return s;
}
export async function activate(key, devices) {
  const info = await cloud.activateKey(key, devices);
  await put('settings', { key: 'license_state', value: cloud.stateFrom(info) });
  await apply(); return info;
}
