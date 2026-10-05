import { h, skel } from './ui.js';
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
  el.replaceChildren(h('div', { class: 'stats' },
    tile("Today's sales", sum(sales.filter(s => td(s.created_at)).map(s => s.total)) - sum(refunds.filter(r => td(r.created_at)).map(r => r.amount))), tile('Expenses today', exp),
    tile('Cash in drawer', expectedCash({ cashSales, cashRefunds, udhaarIn: sum(pays.filter(p => td(p.created_at)).map(p => p.amount)), expenses: exp, withdrawals: sum(wd.filter(w => td(w.created_at)).map(w => w.amount)) })), tile('Udhaar owed', owed)));
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
