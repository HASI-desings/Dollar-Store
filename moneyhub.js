import { h, skel, sheet } from './ui.js';
import { all } from './db.js';
import { rs, dayKey, expectedCash } from './money.js';
import * as udhaar from './udhaar.js';
import * as expenses from './expenses.js';
import * as lots from './lots.js';
import * as closeday from './closeday.js';
import * as reports from './reports.js';
import * as insights from './insights.js';
import * as goals from './goals.js';
const TABS = [['udhaar', 'Udhaar', udhaar], ['expenses', 'Expenses', expenses], ['lots', 'Stock lots', lots], ['closeday', 'Close the day', closeday], ['reports', 'Reports', reports], ['insights', 'Insights', insights], ['goals', 'Goals', goals]];
let cur = 'udhaar';

// Four numbers that stay on top of every Money tab.
async function stats(el) {
  const [sales, refunds, pays, ex, wd] = await Promise.all(['sales', 'refunds', 'udhaar_payments', 'expenses', 'withdrawals'].map(all));
  const td = d => dayKey(d) === dayKey(new Date()), sum = a => a.reduce((x, y) => x + y, 0), sm = new Map(sales.map(s => [s.id, s]));
  const cashSales = sum(sales.filter(s => s.method === 'cash' && td(s.created_at)).map(s => s.total));
  const cashRefunds = sum(refunds.filter(r => td(r.created_at) && sm.get(r.sale_id)?.method === 'cash').map(r => r.amount));
  const owed = sum(sales.filter(s => s.method === 'credit').map(s => s.total)) - sum(refunds.filter(r => sm.get(r.sale_id)?.method === 'credit').map(r => r.amount)) - sum(pays.map(p => p.amount));
  const exp = sum(ex.filter(x => td(x.date)).map(x => x.amount));
  const tile = (a, b) => h('div', { class: 'stat-tile' }, h('span', { class: 'muted' }, a), h('b', {}, rs(b)));
  const onl = m => sum(sales.filter(s => s.method === m && td(s.created_at)).map(s => s.total)) - sum(refunds.filter(r => sm.get(r.sale_id)?.method === m && td(r.created_at)).map(r => r.amount));
  const online = h('button', { class: 'stat-tile tap', type: 'button', onclick: () => openOnline(sales, refunds) }, h('span', { class: 'muted' }, 'Online today ›'), h('b', {}, rs(onl('easypaisa') + onl('jazzcash'))));
  el.replaceChildren(h('div', { class: 'stats' },
    tile("Today's sales", sum(sales.filter(s => td(s.created_at)).map(s => s.total)) - sum(refunds.filter(r => td(r.created_at)).map(r => r.amount))), tile('Expenses today', exp),
    tile('Cash in drawer', expectedCash({ cashSales, cashRefunds, udhaarIn: sum(pays.filter(p => td(p.created_at)).map(p => p.amount)), expenses: exp, withdrawals: sum(wd.filter(w => td(w.created_at)).map(w => w.amount)) })), online, tile('Udhaar owed', owed)));
}
const PAY = [['easypaisa', 'Easypaisa'], ['jazzcash', 'JazzCash']];
// Tap the Online tile, pick Easypaisa or JazzCash, see what has come into that account and every transaction.
function openOnline(sales, refunds) {
  const sm = new Map(sales.map(s => [s.id, s])), box = h('div', {}); let cur = 'easypaisa';
  sheet(box);
  const txs = m => [...sales.filter(s => s.method === m).map(s => ({ at: s.created_at, name: s.customer_name || s.receipt_no, amt: s.total })),
    ...refunds.filter(r => sm.get(r.sale_id)?.method === m).map(r => ({ at: r.created_at, name: 'Refund · ' + (sm.get(r.sale_id).customer_name || sm.get(r.sale_id).receipt_no), amt: -r.amount }))].sort((a, b) => (a.at < b.at ? 1 : -1));
  const paint = () => {
    const list = txs(cur), name = PAY.find(p => p[0] === cur)[1], total = list.reduce((a, x) => a + x.amt, 0);
    const today = list.filter(x => dayKey(x.at) === dayKey(new Date())).reduce((a, x) => a + x.amt, 0);
    box.replaceChildren(h('h2', {}, 'Online money'),
      h('div', { class: 'tabs2' }, PAY.map(([id, n]) => h('button', { class: 'tab2' + (id === cur ? ' on' : ''), type: 'button', onclick: () => { cur = id; paint(); } }, n))),
      h('p', { class: 'muted' }, 'Received in ' + name + ' (after refunds)'), h('p', { class: 'num' }, rs(total)), h('p', { class: 'muted' }, 'Today ' + rs(today)),
      ...(list.length ? list.slice(0, 100).map(x => h('div', { class: 'ln' }, h('span', {}, x.name, h('br'), h('small', { class: 'muted' }, new Date(x.at).toLocaleString())), h('b', {}, (x.amt < 0 ? '-' : '') + rs(Math.abs(x.amt))))) : [h('p', { class: 'muted' }, 'No ' + name + ' payments yet.')]));
  };
  paint();
}
export function mount(root) {
  const st = h('div', {}), body = h('div', {});
  const bar = h('div', { class: 'tabs2', role: 'tablist' }, TABS.map(([id, n]) => h('button', { class: 'tab2' + (id === cur ? ' on' : ''), role: 'tab', type: 'button', 'data-id': id, onclick: () => { cur = id; load(); } }, n)));
  const load = async () => {
    bar.querySelectorAll('.tab2').forEach(b => b.classList.toggle('on', b.dataset.id === cur));
    body.replaceChildren(skel('list'));
    stats(st).catch(() => st.replaceChildren(h('p', { class: 'muted' }, 'Could not load the summary.')));
    try { await TABS.find(t => t[0] === cur)[2].mount(body); }
    catch (e) { body.replaceChildren(h('section', { class: 'card empty' }, h('h2', {}, 'Something went wrong'), h('p', { class: 'muted' }, 'Your data is safe.'))); }
  };
  st.replaceChildren(skel('stats')); root.replaceChildren(st, bar, body); load();
}
