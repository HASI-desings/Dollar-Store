import { h, toast, sheet, ask } from './ui.js';
import { all, put, tx, req, uid } from './db.js';
import { rs, subtotal, receiptNo, waNumber } from './money.js';
import { t } from './i18n.js';
import { current, notify } from './staff.js';

const STARTER = ['Glass', 'Candle', 'Comb', 'Kitchen', 'Lamp', 'Toys', 'Other'];
const METHODS = [['cash', 'Cash'], ['easypaisa', 'Easypaisa'], ['jazzcash', 'JazzCash'], ['credit', 'Credit']];
const fresh = () => ({ id: uid(), cart: [], discount: 0, method: 'cash', cash: '', name: '', phone: '' });
const lineName = l => l.category_name + (l.label ? ' - ' + l.label : '');
let held = [], cats = [], prices = [], sel = null, bill = fresh(), saving = false, root;

// Auto-save the open bill so a reload or power cut never loses it.
const saveDraft = () => tx(['held_bills'], 'readwrite', s => { s.held_bills.put({ id: 'draft', created_at: new Date().toISOString(), cart: bill }); })
  .catch(() => toast('Storage problem. Your bill is still open.'));

export async function mount(el) {
  root = el;
  cats = (await all('categories')).filter(c => !c.archived).sort((a, b) => a.sort_order - b.sort_order);
  if (!cats.length) {
    cats = STARTER.map((name, i) => ({ id: uid(), name, sort_order: i, archived: false }));
    await tx(['categories'], 'readwrite', s => { cats.forEach(c => s.categories.put(c)); });
  }
  prices = (await all('prices')).filter(p => !p.archived);
  held = (await all('held_bills')).filter(x => x.id !== 'draft');
  const d = await tx(['held_bills'], 'readonly', s => req(s.held_bills.get('draft')));
  if (!bill.cart.length && d && d.cart.cart.length) { bill = d.cart; toast('We restored your unfinished bill.'); }
  if (!cats.some(c => c.id === sel)) sel = cats[0].id;
  draw();
}

function draw() {
  const n = bill.cart.reduce((a, l) => a + l.qty, 0), cat = cats.find(c => c.id === sel);
  const pills = cats.map(c => h('button', { class: 'pill' + (c.id === sel ? ' on' : ''), type: 'button', onclick: () => { sel = c.id; draw(); } }, c.name));
  pills.push(h('button', { class: 'pill dash', type: 'button', onclick: addCat }, '+ Category'));
  const tags = prices.filter(p => p.category_id === sel).sort((a, b) => a.amount - b.amount)
    .map(p => h('button', { class: 'tag', type: 'button', 'data-p': p.id, onclick: () => add(cat, p) }, h('b', {}, rs(p.amount)), h('small', {}, p.label || cat.name)));
  tags.push(h('button', { class: 'tag dash', type: 'button', onclick: addPrice }, '+ Price'));
  root.replaceChildren(held.length ? h('button', { class: 'pill', type: 'button', onclick: openHeld }, 'Held bills (' + held.length + ')') : null, h('div', { class: 'pills' }, pills), h('div', { class: 'grid' }, tags),
    n ? h('button', { class: 'billbar', type: 'button', onclick: openBill }, h('span', {}, n + (n === 1 ? ' item, ' : ' items, ') + rs(subtotal(bill.cart))), h('b', {}, t('Review'))) : null);
}

function add(cat, p) {
  const l = bill.cart.find(x => x.key === p.id);
  if (l) l.qty++; else bill.cart.push({ key: p.id, category_name: cat.name, label: p.label || '', unit_price: p.amount, qty: 1 });
  saveDraft(); draw();
  const b = root.querySelector('[data-p="' + p.id + '"]');  // "+1" floats up from the tag
  if (b) { const r = b.getBoundingClientRect(), el = h('span', { class: 'plus' }, '+1'); el.style.left = r.left + r.width / 2 + 'px'; el.style.top = r.top + 'px'; document.body.append(el); setTimeout(() => el.remove(), 450); }
}
function openHeld() {
  const box = h('div', {}); const close = sheet(box);
  box.replaceChildren(h('h2', {}, 'Held bills'), ...(held.length ? held.map(x => h('div', { class: 'ln' }, h('span', {}, new Date(x.created_at).toLocaleTimeString() + ' · ' + rs(subtotal(x.cart.cart))),
    h('button', { class: 'btn sec', type: 'button', onclick: async () => {
      if (bill.cart.length) { toast('Hold or clear your current bill first.'); return; }
      bill = x.cart; held = held.filter(y => y.id !== x.id);
      await tx(['held_bills'], 'readwrite', s => { s.held_bills.delete(x.id); }); saveDraft(); close(); draw();
    } }, 'Resume'))) : [h('p', { class: 'muted' }, 'No held bills.')]));
}
function addCat() {
  ask('New category', [{ k: 'name', label: 'Name' }], async v => {
    if (!v.name) return 'Enter a name.';
    const c = { id: uid(), name: v.name, sort_order: cats.length, archived: false };
    await put('categories', c); cats.push(c); sel = c.id; draw();
  });
}
function addPrice() {
  ask('New price tag', [{ k: 'label', label: 'Name (optional)' }, { k: 'amount', label: 'Price (Rs)', type: 'number' }], async v => {
    const a = Number(v.amount);
    if (!Number.isInteger(a) || a <= 0 || a > 1000000) return 'Enter a price in whole rupees.';
    const p = { id: uid(), category_id: sel, label: v.label, amount: a, archived: false };
    await put('prices', p); prices.push(p); draw();
  });
}

function openBill() {
  const box = h('div', {}); const close = sheet(box);
  const hold = async () => {
    const x = { id: uid(), created_at: new Date().toISOString(), cart: bill };
    await tx(['held_bills'], 'readwrite', s => { s.held_bills.put(x); });
    held.push(x); bill = fresh(); saveDraft(); close(); draw(); toast('Bill held.');
  };
  const paint = () => {
    if (!bill.cart.length) { close(); draw(); return; }
    const sub = subtotal(bill.cart); bill.discount = Math.min(bill.discount, sub);
    const tot = h('b', {}), chg = h('p', { class: 'info' }), err = h('p', { class: 'err' });
    const upd = () => {
      const t = sub - bill.discount, c = Number(bill.cash); tot.textContent = rs(t);
      chg.textContent = bill.method !== 'cash' ? '' : (bill.cash !== '' && c >= t ? 'Return ' + rs(c - t) : 'Short ' + rs(t - (c || 0)));
    };
    const field = (label, type, val, on) => h('label', { class: 'fld' }, label, h('input', { type, value: val === 0 ? '' : val, inputmode: type === 'number' ? 'numeric' : null, oninput: e => { on(e.target.value.trim()); saveDraft(); upd(); } }));
    box.replaceChildren(h('h2', {}, t('Your bill')),
      ...bill.cart.map((l, i) => h('div', { class: 'ln' }, h('span', {}, lineName(l) + ' · ' + rs(l.unit_price)), h('span', { class: 'step' },
        h('button', { type: 'button', 'aria-label': 'Less', onclick: () => { l.qty--; if (l.qty < 1) bill.cart.splice(i, 1); saveDraft(); paint(); } }, '-'), String(l.qty),
        h('button', { type: 'button', 'aria-label': 'More', onclick: () => { l.qty++; saveDraft(); paint(); } }, '+')))),
      field('Discount (Rs)', 'number', bill.discount, v => { bill.discount = Math.max(0, Math.min(parseInt(v, 10) || 0, sub)); }),
      h('div', { class: 'pills' }, METHODS.map(([k, n]) => h('button', { class: 'pill' + (bill.method === k ? ' on' : ''), type: 'button', onclick: () => { bill.method = k; saveDraft(); paint(); } }, n))),
      bill.method === 'cash' ? field('Cash received (Rs)', 'number', bill.cash, v => { bill.cash = v; }) : null, chg,
      field('Customer name', 'text', bill.name, v => { bill.name = v; }),
      field('Customer phone' + (bill.method === 'credit' ? ' (required)' : ''), 'tel', bill.phone, v => { bill.phone = v; }),
      h('p', { class: 'tot' }, 'Total ', tot), err,
      h('div', { class: 'row' },
        h('button', { class: 'btn sec', type: 'button', onclick: () => { bill = fresh(); saveDraft(); close(); draw(); } }, 'Clear'),
        h('button', { class: 'btn sec', type: 'button', onclick: hold }, 'Hold'), h('button', { class: 'btn ok', type: 'button', onclick: () => make(err, close) }, t('Make bill'))));
    upd();
  };
  paint();
}

async function make(err, close) {
  if (saving) return;
  const tot = subtotal(bill.cart) - bill.discount, c = Number(bill.cash);
  if (!bill.cart.length) { err.textContent = 'Add an item first.'; return; }
  if (bill.discount > 0 && !current().can_discount) { err.textContent = 'This cashier cannot give discounts.'; return; }
  if (bill.method === 'cash' && (bill.cash === '' || !Number.isInteger(c) || c < tot)) { err.textContent = 'Short by ' + rs(tot - (c || 0)) + '.'; return; }
  if (bill.method === 'credit' && !waNumber(bill.phone)) { err.textContent = 'Enter a valid phone number.'; return; }
  saving = true; err.textContent = '';
  try { const r = await saveSale(bill); bill = fresh(); close(); draw(); if (r.clock) toast('Your phone clock looks wrong. Check the date.'); notify('sale ' + r.sale.receipt_no).catch(() => toast('Could not alert the owner.')); showReceipt(r.sale, r.lines); }
  catch (e) { err.textContent = e.message === 'locked' ? 'Trial ended. Enter an activation code.' : 'Could not save. Nothing was charged. Try again.'; }
  finally { saving = false; }
}

// One transaction: sale, lines, receipt counter, draft removal, activity log. The bill id makes retries safe.
function saveSale(b) {
  const lines = b.cart, sub = subtotal(lines), total = sub - b.discount, cu = current();
  return tx(['sales', 'sale_lines', 'settings', 'held_bills', 'activity_log'], 'readwrite', async s => {
    const ex = await req(s.sales.get(b.id)); if (ex) return { sale: ex, lines };
    const c = await req(s.settings.get('receipt_counter')), n = (c ? c.value : 0) + 1;
    const ls = await req(s.settings.get('last_sale_at')), nowIso = new Date().toISOString(), clock = !!(ls && nowIso < ls.value);
    const sale = { id: b.id, receipt_no: receiptNo(n), created_at: new Date().toISOString(), cashier_id: cu.id, cashier_name: cu.name, customer_name: b.name, customer_phone: b.phone, subtotal: sub, discount: b.discount, total, method: b.method, cash_received: b.method === 'cash' ? Number(b.cash) : 0, status: 'completed' };
    s.sales.add(sale);
    lines.forEach(l => s.sale_lines.add({ id: uid(), sale_id: b.id, category_name: l.category_name, label: l.label, unit_price: l.unit_price, qty: l.qty, refunded_qty: 0 }));
    s.settings.put({ key: 'receipt_counter', value: n }); s.held_bills.delete('draft');
    s.settings.put({ key: 'last_sale_at', value: clock ? ls.value : nowIso });
    if (clock) s.activity_log.add({ id: uid(), created_at: nowIso, cashier_id: cu.id, action: 'clock_backwards', ref_id: b.id });
    if (b.discount > 0 || b.method === 'credit') s.activity_log.add({ id: uid(), created_at: sale.created_at, cashier_id: cu.id, action: b.method === 'credit' ? 'credit_sale' : 'discount', ref_id: b.id });
    return { sale, lines, clock };
  });
}

// Paper receipt sheet with Print, WhatsApp and Done. Also used for reprints.
export async function showReceipt(sale, lines) {
  const shop = (await tx(['settings'], 'readonly', s => req(s.settings.get('shop'))))?.value || { name: 'My Store', address: '', phone: '' };
  const row = (a, b, c) => h('div', { class: 'rw' + (c ? ' t' : '') }, h('span', {}, a), h('span', {}, b));
  const when = new Date(sale.created_at).toLocaleString();
  const tpl = (await tx(['settings'], 'readonly', s => req(s.settings.get('receipt'))))?.value || {};
  const paper = h('div', { class: 'paper' + (tpl.width === '58' ? ' w58' : '') }, h('div', { class: 'c big' }, shop.name), h('div', { class: 'c' }, shop.address), h('div', { class: 'c' }, shop.phone), h('hr'),
    row(sale.receipt_no, when), row('Cashier', sale.cashier_name), sale.customer_name ? row('Customer', sale.customer_name) : null, h('hr'),
    ...lines.map(l => row(l.qty + ' x ' + lineName(l), String(l.qty * l.unit_price))), h('hr'),
    row('Subtotal', String(sale.subtotal)), sale.discount ? row('Discount', '-' + sale.discount) : null, row('TOTAL', rs(sale.total), 1),
    row('Paid by', sale.method), sale.method === 'cash' ? row('Cash', String(sale.cash_received)) : null, sale.method === 'cash' ? row('Change', String(sale.cash_received - sale.total)) : null, h('hr'),
    h('div', { class: 'c' }, (tpl.policy ? tpl.policy + ' ' : '') + 'Returns need receipt no. ' + sale.receipt_no), h('div', { class: 'c' }, tpl.footer || 'Thank you!'));
  const share = () => {
    const wa = waNumber(sale.customer_phone); if (!wa) { toast('Enter a valid phone number.'); return; }
    const text = shop.name + '\n' + sale.receipt_no + ' · ' + when + '\n' + lines.map(l => l.qty + ' x ' + lineName(l) + ' ' + l.qty * l.unit_price).join('\n') + '\nTOTAL ' + rs(sale.total);
    window.open('https://wa.me/' + wa + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
  };
  let close;
  close = sheet(h('div', {}, paper, h('div', { class: 'row' },
    h('button', { class: 'btn sec', type: 'button', onclick: () => window.print() }, 'Print / PDF'),
    h('button', { class: 'btn sec', type: 'button', onclick: share }, 'WhatsApp'),
    h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Done'))));
}

export const hasOpenDraft = () => bill.cart.length > 0;
