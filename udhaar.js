import { h, ask, sheet } from './ui.js';
import { all, put, uid } from './db.js';
import { rs, waNumber, posInt } from './money.js';

// Balance = credit sales - refunds on them - payments received.
export async function mount(root) {
  const [sales, refunds, pays] = await Promise.all([all('sales'), all('refunds'), all('udhaar_payments')]);
  const by = {}, sm = new Map(sales.map(s => [s.id, s])), k = p => waNumber(p) || p;
  for (const s of sales) if (s.method === 'credit') {
    const b = by[k(s.customer_phone)] ||= { phone: k(s.customer_phone), name: s.customer_name, bal: 0, since: s.created_at };
    b.bal += s.total; if (s.created_at < b.since) b.since = s.created_at;
  }
  for (const r of refunds) { const s = sm.get(r.sale_id); if (s && s.method === 'credit') by[k(s.customer_phone)].bal -= r.amount; }
  for (const p of pays) if (by[p.customer_phone]) by[p.customer_phone].bal -= p.amount;
  const list = Object.values(by).filter(b => b.bal > 0).sort((a, b) => (a.since < b.since ? -1 : 1));
  const receive = b => ask('Receive payment', [{ k: 'amount', label: 'Amount (Rs)', type: 'number' }], async v => {
    const a = posInt(v.amount); if (!a) return 'Enter an amount.'; if (a > b.bal) return 'Payment is more than the balance.';
    await put('udhaar_payments', { id: uid(), customer_phone: b.phone, customer_name: b.name, amount: a, created_at: new Date().toISOString() }); await mount(root);
  });
  const statement = b => {
    const ev = [];
    for (const s of sales) if (s.method === 'credit' && k(s.customer_phone) === b.phone) ev.push([s.created_at, 'Credit ' + s.receipt_no, s.total]);
    for (const r of refunds) { const s = sm.get(r.sale_id); if (s && s.method === 'credit' && k(s.customer_phone) === b.phone) ev.push([r.created_at, 'Refund ' + s.receipt_no, -r.amount]); }
    for (const p of pays) if (p.customer_phone === b.phone) ev.push([p.created_at, 'Payment', -p.amount]);
    ev.sort((a, c) => (a[0] < c[0] ? -1 : 1)); let run = 0;
    sheet(h('div', {}, h('h2', {}, b.name || b.phone), ...ev.map(([d, n, v]) => { run += v; return h('div', { class: 'ln' }, h('span', {}, d.slice(0, 10) + ' ' + n), h('span', {}, (v < 0 ? '-' : '+') + rs(Math.abs(v)) + ' = ' + rs(run))); })));
  };
  const row = b => h('section', { class: 'card' }, h('b', {}, b.name || b.phone), h('p', { class: 'muted' }, b.phone + ' · ' + Math.floor((Date.now() - new Date(b.since)) / 864e5) + ' days'), h('p', { class: 'num' }, rs(b.bal)),
    h('button', { class: 'btn', type: 'button', onclick: () => receive(b) }, 'Receive'), h('button', { class: 'btn sec', type: 'button', onclick: () => statement(b) }, 'Statement'),
    h('a', { class: 'btn sec', href: 'https://wa.me/' + b.phone + '?text=' + encodeURIComponent('Hello ' + (b.name || '') + ', your balance is ' + rs(b.bal) + '. Thank you.'), target: '_blank', rel: 'noopener' }, 'Remind'));
  root.replaceChildren(h('section', { class: 'card' }, h('p', { class: 'muted' }, 'Total owed'), h('p', { class: 'num' }, rs(list.reduce((a, b) => a + b.bal, 0)))),
    ...(list.length ? list.map(row) : [h('section', { class: 'card empty' }, h('h2', {}, 'No one owes you money'))]));
}
