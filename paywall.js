import { h, toast, download } from './ui.js';
import * as license from './license.js';
import { snapshot } from './backup.js';
import { SUPPORT_WHATSAPP } from './config.js';
const TEXT = {
  trial_ended: ['Your free trial has ended', 'Pay to unlock the app. Enter your activation key below, or contact us to buy one.'],
  subscription_expired: ['Your subscription has ended', 'Renew to unlock the app. Enter your new activation key below, or contact us.'],
  blocked: ['This shop is locked', 'Contact us to unlock it.'],
  offline_expired: ['Connect to the internet', 'The app needs to check your plan. Connect and tap Check again.']
};
let shown = false;
// Full-screen block. Nothing underneath can be used until the plan is active again.
export function show(why) {
  if (shown) return; shown = true;
  for (const id of ['view', 'tabs']) { const el = document.getElementById(id); if (el) el.inert = true; }
  const [title, text] = TEXT[why] || TEXT.offline_expired;
  const key = h('input', { type: 'text', 'aria-label': 'Activation key', onfocus: e => e.target.select() });
  const dev = h('input', { type: 'number', inputmode: 'numeric', value: '1', 'aria-label': 'Number of devices', onfocus: e => e.target.select() });
  const err = h('p', { class: 'err' });
  const busy = async (btn, fn) => { if (btn.classList.contains('loading')) return; btn.classList.add('loading'); err.textContent = ''; try { await fn(); } catch (e) { err.textContent = e.message; } finally { btn.classList.remove('loading'); } };
  const unlock = h('button', { class: 'btn full', type: 'button' }, 'Unlock');
  unlock.addEventListener('click', () => busy(unlock, async () => {
    if (!key.value.trim()) throw new Error('Enter your activation key.');
    await license.activate(key.value.trim(), Number(dev.value)); location.reload();
  }));
  const again = h('button', { class: 'btn sec opt', type: 'button' }, 'Check again');
  again.addEventListener('click', () => busy(again, async () => {
    await license.refresh(); const s = await license.status();
    if (['trial', 'subscription', 'permanent'].includes(s.mode)) location.reload(); else throw new Error('Your plan is still not active.');
  }));
  const pay = h('button', { class: 'btn sec opt', type: 'button', onclick: () => {
    if (!/^\d{11,15}$/.test(SUPPORT_WHATSAPP)) { toast('The support number is not set yet.'); return; }
    window.open('https://wa.me/' + SUPPORT_WHATSAPP + '?text=' + encodeURIComponent('I want to pay for Dollar Store Billing.'), '_blank', 'noopener');
  } }, 'Contact us to pay');
  const out = h('button', { class: 'btn sec', type: 'button' }, 'Download my data');
  out.addEventListener('click', () => busy(out, async () => { const s = await snapshot(); download('my-shop-data.json', JSON.stringify(s), 'application/json'); }));
  const box = h('div', { class: 'setup' }, h('h1', {}, title), h('p', { class: 'muted' }, text),
    h('label', { class: 'fld' }, 'Activation key', key), h('label', { class: 'fld' }, 'How many devices?', dev), err, unlock, pay, again, h('p', { class: 'muted' }, 'Your data stays on this device. You can download it any time.'), out);
  box.style.zIndex = '150';
  document.body.append(box);
}
