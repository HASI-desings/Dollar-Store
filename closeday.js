import { h, toast, confirmBox } from './ui.js';
import { requirePin } from './staff.js';
import { all, put, uid } from './db.js';
import { rs, dayKey, expectedCash } from './money.js';

export async function mount(root) {
  const [sales, refunds, pays, ex, wd, dc] = await Promise.all(['sales', 'refunds', 'udhaar_payments', 'expenses', 'withdrawals', 'day_closes'].map(all));
  const today = d => dayKey(d) === dayKey(new Date()), sm = new Map(sales.map(s => [s.id, s])), sum = a => a.reduce((x, y) => x + y, 0);
  const exp = expectedCash({
    cashSales: sum(sales.filter(s => s.method === 'cash' && today(s.created_at)).map(s => s.total)),
    cashRefunds: sum(refunds.filter(r => today(r.created_at) && sm.get(r.sale_id)?.method === 'cash').map(r => r.amount)),
    udhaarIn: sum(pays.filter(p => today(p.created_at)).map(p => p.amount)),
    expenses: sum(ex.filter(x => today(x.date)).map(x => x.amount)), withdrawals: sum(wd.filter(w => today(w.created_at)).map(w => w.amount)) });
  const verdict = d => (d === 0 ? 'Cash matches.' : d < 0 ? 'Missing ' + rs(-d) : 'Extra ' + rs(d));
  const done = dc.find(d => d.date === dayKey(new Date()));
  const result = h('p', { class: 'info' }), input = h('input', { type: 'number', inputmode: 'numeric', 'aria-label': 'Counted cash' });
  input.addEventListener('input', () => { result.textContent = input.value === '' ? '' : verdict(Number(input.value) - exp); });
  const close = async () => {
    const n = Number(input.value);
    if (input.value === '' || !Number.isInteger(n) || n < 0) { result.textContent = 'Enter the counted cash.'; return; }
    if (!(await confirmBox('Close the day? It cannot be changed after.', 'Close day'))) return;
    if (!(await requirePin('Close the day'))) return;
    await put('day_closes', { id: uid(), date: dayKey(new Date()), expected_cash: exp, counted_cash: n, difference: n - exp, closed_at: new Date().toISOString() });
    toast('Day closed.'); await mount(root);
  };
  root.replaceChildren(h('section', { class: 'card' }, h('p', { class: 'muted' }, 'Expected cash today'), h('p', { class: 'num' }, rs(exp)),
    h('p', { class: 'muted' }, 'Cash sales - cash refunds + udhaar received - expenses - withdrawals'),
    done ? h('p', {}, 'This day is closed. Counted ' + rs(done.counted_cash) + '. ' + verdict(done.difference))
      : [h('label', { class: 'fld' }, 'Counted cash (Rs)', input), result, h('button', { class: 'btn full', type: 'button', onclick: close }, 'Close day')]),
  h('section', { class: 'card' }, h('b', {}, 'History'), ...[...dc].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10).map(d => h('div', { class: 'ln' }, h('span', {}, d.date), h('span', {}, verdict(d.difference))))));
}
