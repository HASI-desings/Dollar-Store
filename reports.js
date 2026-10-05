import { h, download } from './ui.js';
import { all } from './db.js';
import { rs } from './money.js';
import { current } from './staff.js';
const PER = [['Today', 0], ['Week', 7], ['Month', 30], ['Year', 365]];
const cell = v => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

export async function mount(root, days = 0) {
  const [sales, refunds, ex, lines] = await Promise.all(['sales', 'refunds', 'expenses', 'sale_lines'].map(all));
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days ? days - 1 : 0));
  const inP = d => new Date(d) >= start, sum = a => a.reduce((x, y) => x + y, 0);
  const S = sales.filter(s => inP(s.created_at)), ids = new Set(S.map(s => s.id));
  const sT = sum(S.map(s => s.total)), rT = sum(refunds.filter(r => inP(r.created_at)).map(r => r.amount)), eT = sum(ex.filter(e => inP(e.date)).map(e => e.amount));
  const cat = {}; for (const l of lines) if (ids.has(l.sale_id)) cat[l.category_name] = (cat[l.category_name] || 0) + l.unit_price * l.qty;
  const top = Object.entries(cat).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const csv = () => download('sales.csv', ['receipt,date,cashier,customer,method,subtotal,discount,total', ...S.map(s => [s.receipt_no, s.created_at, s.cashier_name, s.customer_name, s.method, s.subtotal, s.discount, s.total].map(cell).join(','))].join('\n'), 'text/csv');
  const stat = (a, b) => h('div', { class: 'stat' }, h('span', {}, a), h('b', {}, rs(b)));
  root.replaceChildren(h('div', { class: 'pills' }, PER.map(([n, d]) => h('button', { class: 'pill' + (d === days ? ' on' : ''), type: 'button', onclick: () => mount(root, d) }, n))),
    h('section', { class: 'card' }, stat('Sales', sT), stat('Refunds', rT), stat('Expenses', eT), current().can_see_profit ? stat('Net', sT - rT - eT) : null, h('button', { class: 'btn sec', type: 'button', onclick: csv }, 'Export CSV')),
    h('section', { class: 'card' }, h('b', {}, 'Best categories (before discounts)'), ...(top.length ? top.map(([n, v]) => stat(n, v)) : [h('p', { class: 'muted' }, 'No sales in this period.')])));
}
