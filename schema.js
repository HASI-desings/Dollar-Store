// Field types for every store (s string, n integer, b boolean, a anything). null is always allowed. Unknown fields are rejected.
const T = {
  settings: { key: 's', value: 'a' },
  cashiers: { id: 's', name: 's', pin_salt: 's', pin_hash: 's', role: 's', can_discount: 'b', can_refund: 'b', can_see_profit: 'b', active: 'b' },
  categories: { id: 's', name: 's', sort_order: 'n', archived: 'b' },
  prices: { id: 's', category_id: 's', label: 's', amount: 'n', archived: 'b' },
  sales: { id: 's', receipt_no: 's', created_at: 's', cashier_id: 's', cashier_name: 's', customer_name: 's', customer_phone: 's', subtotal: 'n', discount: 'n', total: 'n', method: 's', cash_received: 'n', status: 's' },
  sale_lines: { id: 's', sale_id: 's', category_name: 's', label: 's', unit_price: 'n', qty: 'n', refunded_qty: 'n' },
  refunds: { id: 's', sale_id: 's', created_at: 's', cashier_id: 's', reason: 's', amount: 'n', lines: 'a' },
  udhaar_payments: { id: 's', customer_phone: 's', customer_name: 's', amount: 'n', created_at: 's' },
  lots: { id: 's', name: 's', cost: 'n', extra_costs: 'n', supplier: 's', supplier_owed: 'n', bought_at: 's', closed: 'b', written_off_amount: 'n', photo: 'a' },
  expenses: { id: 's', label: 's', amount: 'n', category: 's', date: 's', recurring_id: 's' },
  recurring_expenses: { id: 's', label: 's', amount: 'n', category: 's', day_of_month: 'n', active: 'b', last_run: 's' },
  withdrawals: { id: 's', amount: 'n', note: 's', created_at: 's' },
  day_closes: { id: 's', date: 's', expected_cash: 'n', counted_cash: 'n', difference: 'n', closed_at: 's' },
  held_bills: { id: 's', created_at: 's', cart: 'a' },
  activity_log: { id: 's', created_at: 's', cashier_id: 's', action: 's', ref_id: 's' }
};
const ok = (t, v) => v === null || t === 'a' || (t === 's' && typeof v === 'string') || (t === 'n' && Number.isInteger(v)) || (t === 'b' && typeof v === 'boolean');
export function okRow(store, r) {
  const m = T[store], idk = store === 'settings' ? 'key' : 'id';
  return !!m && !!r && typeof r === 'object' && !Array.isArray(r) && typeof r[idk] === 'string' && Object.entries(r).every(([k, v]) => m[k] && ok(m[k], v));
}
