import { h } from './ui.js';
import { put, tx, req, uid } from './db.js';
import { setLang } from './i18n.js';
import { activate } from './license.js';
const STARTER = ['Glass', 'Candle', 'Comb', 'Kitchen', 'Lamp', 'Toys', 'Other'];
export const needed = async () => !(await tx(['settings'], 'readonly', s => req(s.settings.get('setup_done'))));

// First-run flow: language, shop, activation or trial, starter categories.
export function run() {
  return new Promise(done => {
    const st = { name: '', address: '', phone: '', cashier: 'Owner', cats: new Set(STARTER) }, inputs = {}, err = h('p', { class: 'err' });
    const box = h('div', { class: 'setup' }); document.body.append(box);
    let step = 0;
    const field = (k, label) => h('label', { class: 'fld' }, label, inputs[k] = h('input', { type: 'text', value: st[k] }));
    const next = () => { step++; paint(); };
    const finish = async () => {
      const names = st.cats.size ? [...st.cats] : ['Other'];
      await tx(['settings', 'categories'], 'readwrite', s => {
        s.settings.put({ key: 'shop', value: { name: st.name, address: st.address, phone: st.phone } });
        s.settings.put({ key: 'cashier_name', value: st.cashier || 'Owner' });
        names.forEach((n, i) => s.categories.put({ id: uid(), name: n, sort_order: i, archived: false }));
        s.settings.put({ key: 'setup_done', value: true });
      });
      box.remove(); done();
    };
    const steps = [
      () => [h('h1', {}, 'Choose your language'), ...[['en', 'English'], ['ru', 'Roman Urdu'], ['ur', 'اردو']].map(([c, n]) => h('button', { class: 'btn sec opt', type: 'button', onclick: async () => { await setLang(c); next(); } }, n))],
      () => [h('h1', {}, 'Your shop'), field('name', 'Shop name'), field('address', 'Address'), field('phone', 'Phone'), field('cashier', 'Your name'), err,
        h('button', { class: 'btn full', type: 'button', onclick: () => { for (const k of ['name', 'address', 'phone', 'cashier']) st[k] = inputs[k].value.trim(); if (!st.name) { err.textContent = 'Enter the shop name.'; return; } next(); } }, 'Continue')],
      () => { const code = h('input', { type: 'text', 'aria-label': 'Activation code' });
        return [h('h1', {}, 'Activation'), h('label', { class: 'fld' }, 'Activation code', code), err,
          h('button', { class: 'btn full', type: 'button', onclick: async () => { if (await activate(code.value)) next(); else err.textContent = 'This activation code is not valid.'; } }, 'Activate'),
          h('button', { class: 'btn sec opt', type: 'button', onclick: async () => { await put('settings', { key: 'trial_start', value: Date.now() }); next(); } }, 'Start 7-day trial')]; },
      () => [h('h1', {}, 'Starter categories'), ...STARTER.map(n => h('label', { class: 'rl' }, h('input', { type: 'checkbox', checked: st.cats.has(n) ? '' : null, onchange: e => { if (e.target.checked) st.cats.add(n); else st.cats.delete(n); } }), n)),
        h('button', { class: 'btn ok full', type: 'button', onclick: finish }, 'Finish')]];
    function paint() {
      err.textContent = '';
      const bar = h('div', { class: 'prog' }, h('i')); bar.firstChild.style.setProperty('--w', (step + 1) / 4);
      box.replaceChildren(bar, ...steps[step]());
    }
    paint();
  });
}
