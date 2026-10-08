import { tx, req, put, setLock } from './db.js';
import * as cloud from './cloud.js';
const get = async k => (await tx(['settings'], 'readonly', s => req(s.settings.get(k))))?.value;
const DAY = 864e5;

// Asks the server for this shop's plan and keeps a copy for offline use.
export async function refresh() {
  try { const info = await cloud.shopState(); await put('settings', { key: 'license_state', value: cloud.stateFrom(info) }); return info; }
  catch (e) {
    if (e.message === 'This device is not registered.') await put('settings', { key: 'license_state', value: { state: 'blocked', plan: 'blocked', checked_at: Date.now() } });
    throw e;
  }
}
// Offline, the saved plan is trusted for 7 days (30 for permanent), and time never runs backwards.
export async function status() {
  const now = Math.max(Date.now(), (await get('last_seen')) || 0);
  await put('settings', { key: 'last_seen', value: now });
  const s = await get('license_state');
  if (!s) return { mode: 'none' };
  if (['blocked', 'trial_ended', 'subscription_expired'].includes(s.state)) return { mode: 'expired', why: s.state };
  if (now - s.checked_at > (s.plan === 'permanent' ? 30 : 7) * DAY) return { mode: 'offline_expired' };
  if (s.valid_until && Date.parse(s.valid_until) <= now) return { mode: 'expired', why: s.state };
  return { mode: s.plan, left: s.valid_until ? Math.max(0, Math.ceil((Date.parse(s.valid_until) - now) / DAY)) : null, until: s.valid_until };
}
export async function apply() {
  await refresh().catch(() => null);  // offline is fine: the saved plan is used
  const s = await status();
  setLock(!['trial', 'subscription', 'permanent'].includes(s.mode));
  return s;
}
export async function activate(key, devices) {
  const info = await cloud.activateKey(key, devices);
  await put('settings', { key: 'license_state', value: cloud.stateFrom(info) });
  await apply(); return info;
}
