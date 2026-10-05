import { tx, req, put, setLock } from './db.js';
import { LICENSE_PUBLIC_JWK } from './config.js';
const dec = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const get = async k => (await tx(['settings'], 'readonly', s => req(s.settings.get(k))))?.value;

// Code = base64url(payload).base64url(ECDSA P-256 signature). Only the public key is in the app.
export async function verify(code) {
  try {
    const [p, sg] = String(code).trim().split('.');
    const key = await crypto.subtle.importKey('jwk', LICENSE_PUBLIC_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, dec(sg), new TextEncoder().encode(p)))) return null;
    return JSON.parse(new TextDecoder().decode(dec(p)));
  } catch (e) { return null; }
}
// "Now" never goes backwards, so moving the phone clock back does not extend the trial.
export async function status() {
  const now = Math.max(Date.now(), (await get('last_seen')) || 0);
  await put('settings', { key: 'last_seen', value: now });
  const lic = await get('license');
  if (lic) { const d = await verify(lic); if (d && (!d.exp || Date.parse(d.exp) > now)) return { mode: 'licensed' }; }
  let t0 = await get('trial_start');
  if (!t0) { t0 = now; await put('settings', { key: 'trial_start', value: t0 }); }
  const left = 7 - Math.floor((now - t0) / 864e5);
  return left > 0 ? { mode: 'trial', left } : { mode: 'expired' };
}
export async function apply() { const s = await status(); setLock(s.mode === 'expired'); return s; }
export async function activate(code) {
  if (!(await verify(code))) return false;
  await put('settings', { key: 'license', value: String(code).trim() }); await apply(); return true;
}
