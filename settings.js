import { h, ask, toast, sheet, skel, progress, confirmBox, download } from './ui.js';
import { put, tx, req, open, all, uid } from './db.js';
import { setLang, lang } from './i18n.js';
import { requirePin } from './staff.js';
import * as license from './license.js';
import * as cloud from './cloud.js';
import { readPrices, planImport } from './csv.js';
import { SUPPORT_WHATSAPP } from './config.js';
const get = async k => (await tx(['settings'], 'readonly', s => req(s.settings.get(k))))?.value;
const day = d => new Date(d).toLocaleDateString();
const key = s => String(s).trim().toLowerCase();

export async function mount(root) {
  root.replaceChildren(skel('cards'));
  const shop = (await get('shop')) || { name: 'My Store', address: '', phone: '' }, tpl = (await get('receipt')) || { width: '80', footer: 'Thank you!', policy: '' };
  const st = await license.status(), info = await get('license_state'), lastPush = await get('last_push');
  let devs = null, devErr = '';
  try { devs = await cloud.listDevices(); } catch (e) { devErr = e.message; }
  const card = (...k) => h('section', { class: 'card' }, ...k);
  const pill = (on, label, fn) => h('button', { class: 'pill' + (on ? ' on' : ''), type: 'button', onclick: fn }, label);
  const save = async n => { await put('settings', { key: 'receipt', value: { ...tpl, ...n } }); await mount(root); };
  const row = (a, b) => h('div', { class: 'rw' }, h('span', {}, a), h('span', {}, b));

  // ----- plan, activation, devices
  const planTxt = st.mode === 'trial' ? 'Free trial: ' + st.left + ' day(s) left' : st.mode === 'subscription' ? 'Subscription active until ' + day(st.until) : st.mode === 'permanent' ? 'Permanent license'
    : st.mode === 'offline_expired' ? 'Connect to the internet to check your plan.' : 'Your plan is not active. The app is read-only, but you can still export your data.';
  const locked = info && info.limit_locked_at ? (Date.now() < Date.parse(info.limit_locked_at) ? 'You can change the device number until ' + day(info.limit_locked_at) + '.' : 'The device number is locked.') : '';
  const activate = () => ask('Activation key', [{ k: 'key', label: 'Activation key' }, { k: 'n', label: 'Number of devices', type: 'number', v: '1' }], async v => {
    const n = Number(v.n); if (!v.key) return 'Enter the key.'; if (!Number.isInteger(n) || n < 1) return 'Enter the number of devices.';
    try { await license.activate(v.key, n); } catch (e) { return e.message; }
    toast('Activated.'); await mount(root);
  });
  const changeLimit = () => ask('Number of devices', [{ k: 'n', label: 'Devices', type: 'number', v: String(info.device_limit) }], async v => {
    try { await cloud.setLimit(Number(v.n)); } catch (e) { return e.message; }
    await license.refresh().catch(() => null); await mount(root);
  });
  const addDevice = async () => {
    try {
      const link = location.origin + location.pathname + '#/join/' + (await cloud.makeInvite()).token;
      sheet(h('div', {}, h('h2', {}, 'Add a device'), h('p', { class: 'muted' }, 'Send this link to the device. It works once and expires in 24 hours.'), h('p', { class: 'linkbox' }, link),
        h('div', { class: 'row' }, h('button', { class: 'btn sec', type: 'button', onclick: () => (navigator.clipboard ? navigator.clipboard.writeText(link).then(() => toast('Copied.'), () => toast('Could not copy.')) : toast('Could not copy.')) }, 'Copy'),
          navigator.share ? h('button', { class: 'btn', type: 'button', onclick: () => navigator.share({ text: 'Join my shop on Dollar Store Billing', url: link }).catch(() => null) }, 'Share') : null)));
    } catch (e) { toast(e.message); }
  };
  const remove = async d => {
    if (!(await confirmBox('Remove this device?', 'Remove'))) return;
    try { await cloud.revoke(d.id); } catch (e) { toast(e.message); return; }
    await mount(root);
  };
  const owner = info && info.is_owner;
  const devCard = card(h('b', {}, 'Devices'), devErr ? h('p', { class: 'muted' }, devErr + ' Connect to the internet to manage devices.') : h('p', { class: 'muted' }, (info ? info.devices_used + ' of ' + info.device_limit + ' in use. ' : '') + locked),
    ...(devs || []).map(d => h('div', { class: 'ln' }, h('span', {}, 'Device ' + d.device_no + (d.is_owner ? ' (owner)' : '') + (d.is_this ? ' · this device' : ''), h('br'), h('small', { class: 'muted' }, 'Added ' + day(d.registered_at))),
      owner && !d.is_this ? h('button', { class: 'btn sec', type: 'button', onclick: () => remove(d) }, 'Remove') : null)),
    owner && !devErr ? h('button', { class: 'btn', type: 'button', onclick: addDevice }, 'Add a device') : null,
    owner && !devErr && info && Date.now() < Date.parse(info.limit_locked_at || 0) ? h('button', { class: 'btn sec', type: 'button', onclick: changeLimit }, 'Change device number') : null);

  // ----- CSV import of categories and prices
  const doImport = (cats, plan) => tx(['categories', 'prices'], 'readwrite', s => {
    const ids = new Map(cats.map(c => [key(c.name), c.id])); let order = cats.length;
    for (const n of plan.newCats) { const id = uid(); ids.set(key(n), id); s.categories.add({ id, name: n, sort_order: order++, archived: false }); }
    for (const r of plan.add) s.prices.add({ id: uid(), category_id: ids.get(key(r.category)), label: r.label, amount: r.price, archived: false });
  });
  const picker = h('input', { class: 'file', type: 'file', accept: '.csv,text/csv', 'aria-label': 'CSV file', onchange: async () => {
    const f = picker.files[0]; picker.value = ''; if (!f) return;
    if (f.size > 1e6) { toast('This file is too big (max 1 MB).'); return; }
    const { out, errors } = readPrices(await f.text());
    const cats = (await all('categories')).filter(c => !c.archived), prices = (await all('prices')).filter(p => !p.archived), plan = planImport(out, cats, prices);
    const go = h('button', { class: 'btn full', type: 'button' }, 'Import'); let close;
    close = sheet(h('div', {}, h('h2', {}, 'Import preview'), h('p', {}, plan.newCats.length + ' new categories, ' + plan.add.length + ' new price tags, ' + plan.dupes + ' already there.'),
      errors.length ? h('p', { class: 'err' }, errors.length + ' row(s) skipped. ' + errors.slice(0, 5).join(' ')) : null,
      plan.add.length || plan.newCats.length ? go : h('p', { class: 'muted' }, 'Nothing to import.')));
    go.addEventListener('click', async () => { go.classList.add('loading'); try { await doImport(cats, plan); close(); toast('Imported ' + plan.add.length + ' price tags.'); } finally { go.classList.remove('loading'); } });
  } });
  const csvCard = card(h('b', {}, 'Import categories and prices'), h('p', { class: 'muted' }, 'CSV columns: category, name, price (name is optional).'),
    h('label', { class: 'btn filebtn' }, 'Choose CSV file', picker), h('button', { class: 'btn sec', type: 'button', onclick: () => download('price-template.csv', 'category,label,price\nGlass,Wine,400\nGlass,Small,250\nLamp,,650\n', 'text/csv') }, 'Download template'));

  // ----- cloud history, support
  const pb = progress(); pb.el.classList.add('hidden');
  const upload = h('button', { class: 'btn sec', type: 'button' }, 'Upload sales history now');
  upload.addEventListener('click', async () => {
    if (upload.classList.contains('loading')) return; upload.classList.add('loading'); pb.el.classList.remove('hidden'); pb.set(5);
    try { const n = await cloud.push(p => pb.set(p)); toast('Uploaded ' + n + ' records.'); await mount(root); } catch (e) { toast(e.message); upload.classList.remove('loading'); pb.el.classList.add('hidden'); }
  });
  const histCard = card(h('b', {}, 'Sales history in the cloud'), h('p', { class: 'muted' }, lastPush ? 'Last upload ' + new Date(lastPush).toLocaleString() : 'Not uploaded yet.'), upload, pb.el);
  const support = type => {
    if (!/^\d{11,15}$/.test(SUPPORT_WHATSAPP)) { toast('The support number is not set yet.'); return; }
    window.open('https://wa.me/' + SUPPORT_WHATSAPP + '?text=' + encodeURIComponent(type + '\nShop: ' + shop.name + '\nShop ID: ' + ((info && info.shop_id) || '-')), '_blank', 'noopener');
  };
  const preview = h('div', { class: 'paper' + (tpl.width === '58' ? ' w58' : '') }, h('div', { class: 'c big' }, shop.name), h('div', { class: 'c' }, shop.address), h('hr'), row('2 x Glass - Wine', '800'), h('hr'), row('TOTAL', 'Rs 800'),
    h('hr'), h('div', { class: 'c' }, (tpl.policy ? tpl.policy + ' ' : '') + 'Returns need receipt no. R-0001'), h('div', { class: 'c' }, tpl.footer || 'Thank you!'));

  root.replaceChildren(
    card(h('b', {}, 'Your plan'), h('p', { class: 'muted' }, planTxt), h('button', { class: 'btn', type: 'button', onclick: activate }, 'Enter activation key')),
    devCard, csvCard, histCard,
    card(h('b', {}, 'Language'), h('div', { class: 'pills' }, [['en', 'English'], ['ru', 'Roman Urdu'], ['ur', 'اردو']].map(([c, n]) => pill(lang === c, n, async () => { await setLang(c); location.reload(); })))),
    card(h('b', {}, 'Receipt'), h('div', { class: 'pills' }, pill(tpl.width === '58', '58 mm', () => save({ width: '58' })), pill(tpl.width !== '58', '80 mm', () => save({ width: '80' }))),
      h('button', { class: 'btn sec', type: 'button', onclick: () => ask('Footer and return policy', [{ k: 'footer', label: 'Footer line', v: tpl.footer }, { k: 'policy', label: 'Return policy', v: tpl.policy }], async v => { await save(v); }) }, 'Footer and policy'), h('p', { class: 'muted' }, 'Live preview'), preview),
    card(h('b', {}, 'Support'), h('button', { class: 'btn sec', type: 'button', onclick: () => support('Problem report') }, 'Report a problem'), h('button', { class: 'btn sec', type: 'button', onclick: () => support('Change request') }, 'Request a change')),
    card(h('b', {}, 'Help'), h('p', { class: 'muted' }, 'Android: Chrome menu, Install app. Windows or Linux: install icon in the address bar. iPhone: Safari, Share, Add to Home Screen. Printing: use Print on the receipt (80 mm or 58 mm). iPhone has no Bluetooth printing from a web app: use AirPrint, Save PDF or WhatsApp.')),
    card(h('button', { class: 'btn sec', type: 'button', onclick: () => ask('Erase all local data', [{ k: 'n', label: 'Type the shop name to confirm' }], async v => {
      if (v.n !== shop.name) return 'The name does not match.';
      if (!(await requirePin('Erase data'))) return 'Cancelled.';
      (await open()).close();
      await new Promise((res, rej) => { const r = indexedDB.deleteDatabase('dsb'); r.onsuccess = res; r.onblocked = res; r.onerror = () => rej(r.error); });
      location.reload();
    }) }, 'Erase local data')));
}
