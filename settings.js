import { h, ask, toast } from './ui.js';
import { requirePin } from './staff.js';
import { put, tx, req, open } from './db.js';
import { setLang, lang } from './i18n.js';
import * as license from './license.js';
const get = async k => (await tx(['settings'], 'readonly', s => req(s.settings.get(k))))?.value;

export async function mount(root) {
  const shop = (await get('shop')) || { name: 'My Store', address: '', phone: '' }, tpl = (await get('receipt')) || { width: '80', footer: 'Thank you!', policy: '' }, st = await license.status();
  const save = async n => { await put('settings', { key: 'receipt', value: { ...tpl, ...n } }); await mount(root); };
  const row = (a, b) => h('div', { class: 'rw' }, h('span', {}, a), h('span', {}, b));
  const preview = h('div', { class: 'paper' + (tpl.width === '58' ? ' w58' : '') }, h('div', { class: 'c big' }, shop.name), h('div', { class: 'c' }, shop.address), h('hr'), row('2 x Glass - Wine', '800'), h('hr'), row('TOTAL', 'Rs 800'),
    h('hr'), h('div', { class: 'c' }, (tpl.policy ? tpl.policy + ' ' : '') + 'Returns need receipt no. R-0001'), h('div', { class: 'c' }, tpl.footer || 'Thank you!'));
  const pill = (on, label, fn) => h('button', { class: 'pill' + (on ? ' on' : ''), type: 'button', onclick: fn }, label);
  const txt = st.mode === 'licensed' ? 'Activated.' : st.mode === 'trial' ? 'Trial: ' + st.left + ' day(s) left.' : 'Trial ended. The app is read-only. You can still export your data.';
  root.replaceChildren(
    h('section', { class: 'card' }, h('b', {}, 'Language'), h('div', { class: 'pills' }, [['en', 'English'], ['ru', 'Roman Urdu'], ['ur', 'اردو']].map(([c, n]) => pill(lang === c, n, async () => { await setLang(c); location.reload(); })))),
    h('section', { class: 'card' }, h('b', {}, 'Receipt'), h('div', { class: 'pills' }, pill(tpl.width === '58', '58 mm', () => save({ width: '58' })), pill(tpl.width !== '58', '80 mm', () => save({ width: '80' }))),
      h('button', { class: 'btn sec', type: 'button', onclick: () => ask('Footer and return policy', [{ k: 'footer', label: 'Footer line', v: tpl.footer }, { k: 'policy', label: 'Return policy', v: tpl.policy }], async v => { await save(v); }) }, 'Footer and policy'), h('p', { class: 'muted' }, 'Live preview'), preview),
    h('section', { class: 'card' }, h('b', {}, 'Activation'), h('p', { class: 'muted' }, txt),
      h('button', { class: 'btn sec', type: 'button', onclick: () => ask('Activation code', [{ k: 'code', label: 'Code' }], async v => { if (!(await license.activate(v.code))) return 'This activation code is not valid.'; toast('Activated.'); await mount(root); }) }, 'Enter code')),
    h('section', { class: 'card' }, h('b', {}, 'Help'),
      h('p', { class: 'muted' }, 'Android: Chrome menu, Install app. Windows or Linux: install icon in the address bar. iPhone: Safari, Share, Add to Home Screen. Printing: use Print on the receipt (80 mm or 58 mm). iPhone has no Bluetooth printing from a web app: use AirPrint, Save PDF or WhatsApp.')),
    h('section', { class: 'card' }, h('button', { class: 'btn sec', type: 'button', onclick: () => ask('Erase all local data', [{ k: 'n', label: 'Type the shop name to confirm' }], async v => {
      if (v.n !== shop.name) return 'The name does not match.';
      if (!(await requirePin('Erase data'))) return 'Cancelled.';
      (await open()).close();
      await new Promise((res, rej) => { const r = indexedDB.deleteDatabase('dsb'); r.onsuccess = res; r.onblocked = res; r.onerror = () => rej(r.error); });
      location.reload();
    }) }, 'Erase local data')));
}
