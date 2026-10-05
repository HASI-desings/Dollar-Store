import { h, ask, toast } from './ui.js';
import { SUPABASE_URL as U, SUPABASE_ANON_KEY as K } from './config.js';
import { all, put, tx, req, uid } from './db.js';
import { snapshot, check, restore } from './backup.js';
// Plain fetch to Supabase Auth and REST. No library, so no CDN is needed and the CSP stays tight.
const get = async k => (await tx(['settings'], 'readonly', s => req(s.settings.get(k))))?.value;
const set = (k, v) => put('settings', { key: k, value: v });
const toB64 = u => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); };
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
const saveSes = j => set('cloud_session', { access: j.access_token, refresh: j.refresh_token });
async function key(pass, salt) {
  const m = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, m, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function auth(grant, body) {
  let r; try { r = await fetch(U + '/auth/v1/token?grant_type=' + grant, { method: 'POST', headers: { apikey: K, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch (e) { throw new Error('Backup waiting for internet.'); }
  if (r.status >= 500) throw new Error('Your cloud project is paused. Resume it in Supabase.');
  if (!r.ok) throw new Error(grant === 'password' ? 'Wrong email or password.' : 'Please sign in again to back up.');
  await saveSes(await r.json());
}
// Every call: refresh once on 401, then map failures to the plain messages from security.md.
async function api(path, o = {}, retry = true) {
  const ses = await get('cloud_session'); let r;
  try { r = await fetch(U + path, { ...o, headers: { apikey: K, 'Content-Type': 'application/json', ...(ses ? { Authorization: 'Bearer ' + ses.access } : {}), ...(o.headers || {}) } }); } catch (e) { throw new Error('Backup waiting for internet.'); }
  if (r.status === 401) { if (retry && ses) { await auth('refresh_token', { refresh_token: ses.refresh }); return api(path, o, false); } throw new Error('Cloud connection details are wrong.'); }
  if (r.status === 403) throw new Error('Cloud permission problem. Contact support.');
  if (r.status >= 500) throw new Error('Your cloud project is paused. Resume it in Supabase.');
  return r;
}
// Encrypt on the device, upload as incomplete, read back and compare, only then mark complete.
async function backup(pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(pass, salt), new TextEncoder().encode(JSON.stringify(await snapshot()))));
  const c64 = toB64(ct), id = uid(), fail = new Error('Backup failed. Trying again.');
  let r = await api('/rest/v1/backups', { method: 'POST', body: JSON.stringify({ id, size: ct.length, salt: toB64(salt), iv: toB64(iv), ciphertext: c64, cipher_hash: await sha(c64), complete: false }) }); if (!r.ok) throw fail;
  r = await api('/rest/v1/backups?id=eq.' + id + '&select=ciphertext'); const back = await r.json();
  if (!back[0] || (await sha(back[0].ciphertext)) !== (await sha(c64))) throw fail;
  r = await api('/rest/v1/backups?id=eq.' + id, { method: 'PATCH', body: JSON.stringify({ complete: true }) }); if (!r.ok) throw fail;
  await summary(); await set('last_cloud_backup', Date.now());
}
// Plain totals for emailed reports (the backup itself stays encrypted).
async function summary() {
  const [sales, refunds, ex] = await Promise.all(['sales', 'refunds', 'expenses'].map(all)), out = {};
  for (const [k, d] of [['weekly', 7], ['monthly', 30], ['yearly', 365]]) {
    const s = new Date(); s.setHours(0, 0, 0, 0); s.setDate(s.getDate() - (d - 1));
    const f = a => a.filter(x => new Date(x.created_at || x.date) >= s).reduce((t, x) => t + (x.total ?? x.amount), 0);
    out[k] = { sales: f(sales), refunds: f(refunds), expenses: f(ex) };
  }
  const r = await api('/rest/v1/report_summary?on_conflict=owner_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ summary: out, updated_at: new Date().toISOString() }) });
  if (!r.ok) throw new Error('Backup failed. Trying again.');
}
async function fromCloud(id, pass) {
  const b = (await (await api('/rest/v1/backups?id=eq.' + id + '&complete=eq.true&select=salt,iv,ciphertext')).json())[0];
  if (!b) throw new Error('Backup not found.');
  let plain; try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(b.iv) }, await key(pass, fromB64(b.salt)), fromB64(b.ciphertext)); } catch (e) { throw new Error('Wrong passphrase.'); }
  let f; try { f = await check(JSON.parse(new TextDecoder().decode(plain))); } catch (e) { throw new Error('This backup file is damaged.'); }
  try { await restore(f); } catch (e) { throw new Error('Restore failed. Your data is unchanged.'); }
  location.hash = '#/sell'; location.reload();
}

export async function mount(root) {
  const card = (...k) => h('section', { class: 'card' }, ...k);
  if (!U.startsWith('https://')) { root.replaceChildren(card(h('p', { class: 'muted' }, 'Cloud is not set up. Put your Supabase URL and key in config.js.'))); return; }
  const ses = await get('cloud_session'), last = await get('last_cloud_backup'), email = await get('cloud_email');
  const pass = (title, go) => ask(title, [{ k: 'p', label: 'Backup passphrase', type: 'password' }], async v => { if (v.p.length < 8) return 'Use at least 8 characters.'; try { await go(v.p); } catch (e) { return e.message; } await mount(root); });
  const signIn = () => ask('Sign in to your cloud', [{ k: 'e', label: 'Email', type: 'email' }, { k: 'p', label: 'Password', type: 'password' }], async v => { try { await auth('password', { email: v.e, password: v.p }); } catch (e) { return e.message; } await set('cloud_email', v.e); await mount(root); });
  if (!ses) { root.replaceChildren(card(h('p', { class: 'muted' }, 'Sign in with the owner account you created in your Supabase project.'), h('button', { class: 'btn', type: 'button', onclick: signIn }, 'Sign in'))); return; }
  let list = [], rset = {}, logs = [], problem = '';
  try {
    list = await (await api('/rest/v1/backups?complete=eq.true&select=id,created_at,size&order=created_at.desc&limit=10')).json();
    rset = (await (await api('/rest/v1/report_settings?select=*')).json())[0] || {};
    logs = await (await api('/rest/v1/report_log?select=created_at,period,status,detail&order=created_at.desc&limit=10')).json();
  } catch (e) { problem = e.message; }
  const sc = await get('cloud_schedule'), due = !last || Date.now() - last > 7 * 864e5;
  const schedule = () => ask('Backup schedule', [{ k: 'd', label: 'Weekday (0 = Sunday ... 6 = Saturday)', type: 'number', v: String(sc ? sc.weekday : 0) }, { k: 'hr', label: 'Hour (0-23)', type: 'number', v: String(sc ? sc.hour : 20) }], async v => {
    const d = Number(v.d), hr = Number(v.hr);
    if (!Number.isInteger(d) || d < 0 || d > 6) return 'Weekday must be 0 to 6.'; if (!Number.isInteger(hr) || hr < 0 || hr > 23) return 'Hour must be 0 to 23.';
    await set('cloud_schedule', { weekday: d, hour: hr }); await mount(root);
  });
  const saveRep = () => ask('Report emails', [{ k: 'to', label: 'Recipient emails (comma separated)', v: (rset.recipients || []).join(', ') }, { k: 'w', label: 'Weekly (yes/no)', v: rset.weekly ? 'yes' : 'no' }, { k: 'm', label: 'Monthly (yes/no)', v: rset.monthly ? 'yes' : 'no' }, { k: 'y', label: 'Yearly (yes/no)', v: rset.yearly ? 'yes' : 'no' }, { k: 'hr', label: 'Send hour (0-23)', type: 'number', v: String(rset.send_hour ?? 8) }], async v => {
    const to = v.to.split(',').map(x => x.trim()).filter(Boolean), hr = Number(v.hr), yn = x => /^(y|yes)$/i.test(x);
    if (to.some(x => !/^\S+@\S+\.\S+$/.test(x))) return 'Enter valid email addresses.'; if (!Number.isInteger(hr) || hr < 0 || hr > 23) return 'Hour must be 0 to 23.';
    try { const r = await api('/rest/v1/report_settings?on_conflict=owner_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ recipients: to, weekly: yn(v.w), monthly: yn(v.m), yearly: yn(v.y), send_hour: hr }) }); if (!r.ok) return 'Could not save.'; } catch (e) { return e.message; }
    await mount(root);
  });
  const test = async () => { try { const r = await api('/functions/v1/report', { method: 'POST', body: '{}' }); toast(r.ok && (await r.text()) === 'sent' ? 'Test email sent.' : 'Report email could not be sent.'); } catch (e) { toast(e.message); } await mount(root); };
  root.replaceChildren(
    card(h('b', {}, 'Cloud backup'), problem ? h('p', { class: 'err' }, problem) : null, h('p', { class: 'muted' }, (email || 'Signed in') + (due ? ' · Backup due' : ' · Last backup ' + new Date(last).toLocaleString())),
      h('p', { class: 'muted' }, 'If you lose your passphrase, nobody can recover your cloud backups. Write it down.'),
      h('button', { class: 'btn', type: 'button', onclick: () => pass('Back up to cloud', async p => { await backup(p); toast('Cloud backup saved.'); }) }, 'Back up now'),
      h('button', { class: 'btn sec', type: 'button', onclick: schedule }, sc ? 'Schedule: ' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][sc.weekday] + ' ' + sc.hour + ':00' : 'Set schedule'), h('button', { class: 'btn sec', type: 'button', onclick: async () => { await set('cloud_session', null); await mount(root); } }, 'Sign out')),
    card(h('b', {}, 'Restore'), ...(list.length ? list.map(b => h('div', { class: 'ln' }, h('span', {}, new Date(b.created_at).toLocaleString() + ' · ' + Math.ceil(b.size / 1024) + ' KB'), h('button', { class: 'btn sec', type: 'button', onclick: () => pass('Restore backup', p => fromCloud(b.id, p)) }, 'Restore'))) : [h('p', { class: 'muted' }, 'No cloud backups yet.')])),
    card(h('b', {}, 'Report emails'), h('p', { class: 'muted' }, (rset.recipients || []).length ? (rset.recipients || []).join(', ') + ' · ' + ['weekly', 'monthly', 'yearly'].filter(k => rset[k]).join(', ') : 'Not set up.'),
      h('button', { class: 'btn', type: 'button', onclick: saveRep }, 'Edit'), h('button', { class: 'btn sec', type: 'button', onclick: test }, 'Send test'),
      ...logs.map(l => h('div', { class: 'ln' }, h('span', {}, l.created_at.slice(0, 10) + ' ' + l.period), h('span', {}, l.status === 'sent' ? 'Sent' : 'Report email could not be sent.')))));
}

// True when the most recent scheduled moment has passed without a cloud backup. The app asks for the passphrase, so it cannot back up silently.
export async function dueCheck() {
  const [ses, sc, last] = await Promise.all([get('cloud_session'), get('cloud_schedule'), get('last_cloud_backup')]);
  if (!ses || !sc) return false;
  const d = new Date(); d.setHours(sc.hour, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() - sc.weekday + 7) % 7));
  if (d > new Date()) d.setDate(d.getDate() - 7);
  return !last || last < d.getTime();
}
