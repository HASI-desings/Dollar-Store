import { h } from './ui.js';
import { put, tx, req, uid } from './db.js';
import { setLang } from './i18n.js';
import * as cloud from './cloud.js';
import { waNumber } from './money.js';
const STARTER = ['Glass', 'Candle', 'Comb', 'Kitchen', 'Lamp', 'Toys', 'Other'];
export const needed = async () => { const g = k => tx(['settings'], 'readonly', s => req(s.settings.get(k))); return !(await g('setup_done')) || !(await g('license_state')); };
// Opened from a device link: adds this device to the shop that shared it.
export function join(token) {
  return new Promise(done => {
    const err = h('p', { class: 'err' }), btn = h('button', { class: 'btn full', type: 'button' }, 'Join this shop');
    const box = h('div', { class: 'setup' }, h('h1', {}, 'Join a shop'), h('p', { class: 'muted' }, 'This device will be added to the shop that shared this link. Needs internet.'), err, btn);
    btn.addEventListener('click', async () => {
      btn.classList.add('loading'); err.textContent = '';
      try { await cloud.join(token); location.hash = '#/sell'; box.remove(); done(); } catch (e) { err.textContent = e.message; } finally { btn.classList.remove('loading'); }
    });
    document.body.append(box);
  });
}

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
      const has = (await tx(['categories'], 'readonly', s => req(s.categories.count()))) > 0;
      await tx(['settings', 'categories'], 'readwrite', s => {
        s.settings.put({ key: 'shop', value: { name: st.name, address: st.address, phone: st.phone } });
        s.settings.put({ key: 'cashier_name', value: st.cashier || 'Owner' });
        if (!has) names.forEach((n, i) => s.categories.put({ id: uid(), name: n, sort_order: i, archived: false }));
        s.settings.put({ key: 'setup_done', value: true });
      });
      box.remove(); done();
    };
    const steps = [
      () => [h('h1', {}, 'Choose your language'), ...[['en', 'English'], ['ru', 'Roman Urdu'], ['ur', 'اردو']].map(([c, n]) => h('button', { class: 'btn sec opt', type: 'button', onclick: async () => { await setLang(c); next(); } }, n))],
      () => [h('h1', {}, 'Your shop'), field('name', 'Shop name'), field('address', 'Address'), field('phone', 'Phone'), field('cashier', 'Your name'), err,
        h('button', { class: 'btn full', type: 'button', onclick: () => { for (const k of ['name', 'address', 'phone', 'cashier']) st[k] = inputs[k].value.trim(); if (!st.name) { err.textContent = 'Enter the shop name.'; return; } if (!waNumber(st.phone)) { err.textContent = 'Enter a valid phone number.'; return; } next(); } }, 'Continue')],
      () => {
        const code = h('input', { type: 'text', 'aria-label': 'Activation key' }), dev = h('input', { type: 'number', inputmode: 'numeric', value: '1', 'aria-label': 'Number of devices', onfocus: e => e.target.select() });
        const trial = h('button', { class: 'btn full', type: 'button' }, 'Start 7-day free trial'), act = h('button', { class: 'btn sec opt', type: 'button' }, 'Activate with key');
        const go = async (btn, key) => {
          if (btn.classList.contains('loading')) return; btn.classList.add('loading'); err.textContent = '';
          try { await cloud.registerShop(st.name, st.phone, key, key ? Number(dev.value) : null); next(); } catch (e) { err.textContent = e.message; } finally { btn.classList.remove('loading'); }
        };
        trial.addEventListener('click', () => go(trial, null));
        act.addEventListener('click', () => { if (!code.value.trim()) { err.textContent = 'Enter your activation key.'; return; } go(act, code.value.trim()); });
        return [h('h1', {}, 'Start'), trial, h('p', { class: 'muted' }, 'Needs an internet connection.'), h('label', { class: 'fld' }, 'Activation key', code), h('label', { class: 'fld' }, 'How many devices will use this shop?', dev), err, act];
      },
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
