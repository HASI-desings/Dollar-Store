import { h, toast } from './ui.js';
import { all, tx, req, uid } from './db.js';
import { rs, refundAmount } from './money.js';
import { showReceipt } from './sell.js';
import { current } from './staff.js';

export async function mount(root) {
  const sales = (await all('sales')).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const lines = await all('sale_lines');
  const q = h('input', { class: 'search', type: 'search', placeholder: 'Search receipt, name or phone', 'aria-label': 'Search' });
  const list = h('div', {});
  const draw = () => {
    const t = q.value.trim().toLowerCase();
    const rows = sales.filter(s => !t || (s.receipt_no + ' ' + s.customer_name + ' ' + s.customer_phone).toLowerCase().includes(t));
    list.replaceChildren(...(rows.length ? rows.map(card) : [h('section', { class: 'card empty' }, h('h2', {}, 'No receipts yet'), h('p', { class: 'muted' }, 'Bills you make will show up here.'))]));
  };
  const card = s => {
    const sl = lines.filter(l => l.sale_id === s.id), picked = new Set();
    const btn = h('button', { class: 'btn', type: 'button', disabled: 'disabled' }, 'Pick items to refund');
    const reason = h('select', { 'aria-label': 'Reason' }, h('option', { value: 'back_on_shelf' }, 'Back on shelf'), h('option', { value: 'damaged' }, 'Damaged'));
    const upd = () => {
      const sum = sl.filter(l => picked.has(l.id)).reduce((a, l) => a + l.unit_price * (l.qty - l.refunded_qty), 0);
      btn.textContent = picked.size ? 'Refund ' + rs(refundAmount(sum, s.total, s.subtotal)) : 'Pick items to refund';
      if (picked.size) btn.removeAttribute('disabled'); else btn.setAttribute('disabled', 'disabled');
    };
    btn.addEventListener('click', async () => {
      try { await refund(s, [...picked], reason.value); toast('Refund saved.'); await mount(root); }
      catch (e) { toast(e.message === 'done' ? 'This item was already refunded.' : e.message === 'perm' ? 'This cashier cannot refund.' : 'Could not refund. Try again.'); }
    });
    const rows = sl.map(l => {
      const rem = l.qty - l.refunded_qty;
      const cb = h('input', { type: 'checkbox', 'aria-label': 'Refund ' + l.category_name, disabled: rem > 0 ? null : 'disabled', onchange: e => { if (e.target.checked) picked.add(l.id); else picked.delete(l.id); upd(); } });
      return h('label', { class: 'rl' + (rem > 0 ? '' : ' x') }, cb, h('span', {}, l.qty + ' x ' + l.category_name + (l.label ? ' - ' + l.label : '') + ' · ' + rs(l.qty * l.unit_price)), rem > 0 ? null : h('em', {}, 'Refunded'));
    });
    return h('details', { class: 'card rc' }, h('summary', {}, h('b', {}, s.receipt_no + ' · ' + rs(s.total)), h('span', { class: 'muted' }, new Date(s.created_at).toLocaleDateString())),
      ...rows, reason, btn, h('button', { class: 'btn sec', type: 'button', style: null, onclick: () => showReceipt(s, sl) }, 'Reprint / share'));
  };
  q.addEventListener('input', draw); draw();
  root.replaceChildren(q, list);
}

// Validates every line inside the transaction, so nothing can be refunded twice.
function refund(s, ids, reason) {
  if (!current().can_refund) return Promise.reject(new Error('perm'));
  return tx(['sale_lines', 'refunds', 'activity_log'], 'readwrite', async st => {
    let sum = 0; const qty = {};
    for (const id of ids) {
      const l = await req(st.sale_lines.get(id)), rem = l.qty - l.refunded_qty;
      if (rem <= 0) throw new Error('done');
      sum += l.unit_price * rem; qty[id] = rem; l.refunded_qty = l.qty; st.sale_lines.put(l);
    }
    const prev = (await req(st.refunds.getAll())).filter(r => r.sale_id === s.id).reduce((a, r) => a + r.amount, 0);
    const amount = Math.min(refundAmount(sum, s.total, s.subtotal), s.total - prev), at = new Date().toISOString();
    st.refunds.add({ id: uid(), sale_id: s.id, created_at: at, cashier_id: current().id, reason, amount, lines: qty });
    st.activity_log.add({ id: uid(), created_at: at, cashier_id: current().id, action: 'refund', ref_id: s.id });
  });
}
