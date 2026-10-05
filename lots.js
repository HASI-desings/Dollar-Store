import { h, ask, confirmBox } from './ui.js';
import { requirePin } from './staff.js';
import { all, put, uid } from './db.js';
import { rs, posInt, lotRecovery } from './money.js';

export async function mount(root) {
  const [lots, sales, refunds] = await Promise.all([all('lots'), all('sales'), all('refunds')]);
  const net = sales.reduce((a, s) => a + s.total, 0) - refunds.reduce((a, r) => a + r.amount, 0);
  const rec = new Map(lotRecovery(lots, net).map(r => [r.id, r]));
  const add = () => ask('Add lot', [{ k: 'name', label: 'Name' }, { k: 'cost', label: 'Cost (Rs)', type: 'number' }, { k: 'extra', label: 'Extra costs (Rs)', type: 'number', v: '0' }, { k: 'supplier', label: 'Supplier' }], async v => {
    const c = posInt(v.cost), x = Number(v.extra);
    if (!v.name) return 'Enter a name.'; if (!c) return 'Enter the cost.'; if (!Number.isInteger(x) || x < 0) return 'Extra costs must be 0 or more.';
    await put('lots', { id: uid(), name: v.name, cost: c, extra_costs: x, supplier: v.supplier, supplier_owed: 0, bought_at: new Date().toISOString(), closed: false, written_off_amount: 0, photo: null }); await mount(root);
  });
  const card = l => {
    const r = rec.get(l.id), c = l.cost + l.extra_costs, i = h('i'); i.style.setProperty('--w', Math.min(r.percent, 100) / 100);
    const close = async () => {
      if (!(await confirmBox('Close this lot and write off ' + rs(c - r.recovered) + ' as loss?', 'Close lot'))) return;
      if (!(await requirePin('Close lot'))) return;
      await put('lots', { ...l, closed: true, written_off_amount: c - r.recovered }); await mount(root);
    };
    return h('section', { class: 'card' }, h('b', {}, l.name), h('p', { class: 'muted' }, 'Cost ' + rs(c) + ' · recovered ' + rs(r.recovered) + ' (' + r.percent + '%) · ' + Math.floor((Date.now() - new Date(l.bought_at)) / 864e5) + ' days'),
      h('div', { class: 'bar2' + (r.percent < 40 ? ' bad' : r.percent >= 100 ? ' gold' : '') }, i),
      l.closed ? h('p', { class: 'muted' }, 'Closed. Written off ' + rs(l.written_off_amount)) : h('button', { class: 'btn sec', type: 'button', onclick: close }, 'Close lot'));
  };
  root.replaceChildren(h('button', { class: 'btn', type: 'button', onclick: add }, '+ Lot'), h('div', { class: 'ln' }),
    ...(lots.length ? [...lots].sort((a, b) => (a.bought_at < b.bought_at ? 1 : -1)).map(card) : [h('section', { class: 'card empty' }, h('h2', {}, 'No lots yet'))]));
}
