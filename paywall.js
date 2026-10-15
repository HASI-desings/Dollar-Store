import { h, toast, download } from './ui.js';
import * as license from './license.js';
import { snapshot } from './backup.js';
import { SUPPORT_WHATSAPP } from './config.js';
const TEXT = {
  trial_ended: ['Your free trial has ended', 'Contact HASI Designs to activate your shop. Your data is safe and will be here when you unlock.'],
  subscription_expired: ['Your subscription has ended', 'Contact HASI Designs to renew. Your data is safe and will be here when you unlock.'],
  blocked: ['This shop is locked', 'Contact HASI Designs to unlock it. Your data is safe.'],
  offline_expired: ["We couldn't verify your plan", 'Check your connection and tap Check again.']
};
const MESSAGES = {
  trial_active: 'Hello, I am using the Dollar Store Billing free trial and would like to pay and activate my shop.',
  trial_expired: "Hello, my shop's Dollar Store Billing trial has ended. I would like to pay and activate my shop.",
  subscription_expired: "Hello, my shop's Dollar Store Billing subscription has ended. I would like to renew and activate my shop."
};
const REASON = { trial_expired: 'trial_ended', subscription_expired: 'subscription_expired', blocked: 'blocked', verification_required: 'offline_expired' };
let box = null, shownWhy = null;

// Opens WhatsApp with a ready message. The number comes from SUPPORT_WHATSAPP in config.js. Contacting us never unlocks anything.
export function openPay(state) {
  if (!/^\d{11,15}$/.test(SUPPORT_WHATSAPP)) { toast('The payment contact is not set up yet. Please contact HASI Designs directly.', 'error'); return; }
  window.open('https://wa.me/' + SUPPORT_WHATSAPP + '?text=' + encodeURIComponent(MESSAGES[state] || MESSAGES.trial_expired), '_blank', 'noopener');
}
// The plan state decides: blocked screen when the plan is not active, gone again the moment it is.
export function sync(s) {
  if (s.state === 'activation_pending') return;
  if (REASON[s.state]) show(REASON[s.state], s.state); else hide();
}
export function hide() {
  if (!box) return;
  box.remove(); box = null; shownWhy = null;
  for (const id of ['view', 'tabs']) { const el = document.getElementById(id); if (el) el.inert = false; }
}
// Full-screen block. Nothing underneath can be used until the plan is active again.
export function show(why, state) {
  if (box && shownWhy === why) return;
  hide(); shownWhy = why;
  for (const id of ['view', 'tabs']) { const el = document.getElementById(id); if (el) el.inert = true; }
  const [title, text] = TEXT[why] || TEXT.offline_expired, needsCheck = why === 'offline_expired';
  const key = h('input', { type: 'text', 'aria-label': 'Activation key', onfocus: e => e.target.select() });
  const dev = h('input', { type: 'number', inputmode: 'numeric', value: '1', 'aria-label': 'Number of devices', onfocus: e => e.target.select() });
  const err = h('p', { class: 'err' });
  const busy = async (btn, fn) => { if (btn.classList.contains('loading')) return; btn.classList.add('loading'); err.textContent = ''; try { await fn(); } catch (e) { err.textContent = e.message; toast(e.message, 'error'); } finally { btn.classList.remove('loading'); } };
  const pay = h('button', { class: 'btn ok full', type: 'button', onclick: () => openPay(state || 'trial_expired') }, 'Pay to unlock');
  const unlock = h('button', { class: 'btn full', type: 'button' }, 'Unlock with key');
  unlock.addEventListener('click', () => busy(unlock, async () => {
    if (!key.value.trim()) throw new Error('Enter your activation key.');
    const n = Number(dev.value); if (!Number.isInteger(n) || n < 1) throw new Error('Enter how many devices will use this shop.');
    const res = await license.activate(key.value.trim(), n);
    if (res.state !== 'activated') toast('Key accepted. Your plan will update when we can confirm it.');
  }));
  const again = h('button', { class: 'btn sec opt', type: 'button' }, 'Check again');
  again.addEventListener('click', () => busy(again, async () => {
    await license.apply();
    if (!['trial_active', 'activated'].includes(license.current().state)) throw new Error("We couldn't confirm an active plan yet.");
  }));
  const out = h('button', { class: 'btn sec', type: 'button' }, 'Download my data');
  out.addEventListener('click', () => busy(out, async () => { const s = await snapshot(); download('my-shop-data.json', JSON.stringify(s), 'application/json'); }));
  box = h('div', { class: 'setup' }, h('h1', {}, title), h('p', { class: 'muted' }, text),
    needsCheck ? null : pay,
    needsCheck ? null : h('p', { class: 'muted' }, 'Already paid? Enter your activation key.'), needsCheck ? null : h('label', { class: 'fld' }, 'Activation key', key), needsCheck ? null : h('label', { class: 'fld' }, 'How many devices?', dev),
    err, needsCheck ? null : unlock, again, h('p', { class: 'muted' }, 'Your data stays on this device. You can download it any time.'), out);
  box.style.zIndex = '150';
  document.body.append(box);
}
