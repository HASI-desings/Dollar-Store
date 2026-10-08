// Pure integer-rupee money functions.
export const rs = n => 'Rs ' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const subtotal = lines => lines.reduce((a, l) => a + l.unit_price * l.qty, 0);
export const receiptNo = (n, p = 'R') => p + '-' + String(n).padStart(4, '0');
// Pro-rata refund, rounded half up with integers only.
export const refundAmount = (sum, total, sub) => (sub ? Math.floor((2 * sum * total + sub) / (2 * sub)) : 0);
// Pakistan numbers: 03xxxxxxxxx or 923xxxxxxxxx -> 923xxxxxxxxx, else null.
export function waNumber(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (/^03\d{9}$/.test(d)) return '92' + d.slice(1);
  return /^923\d{9}$/.test(d) ? d : null;
}
export const posInt = v => { const n = Number(v); return Number.isInteger(n) && n > 0 && n <= 100000000 ? n : null; };
export const dayKey = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
export const expectedCash = o => o.cashSales - o.cashRefunds + o.udhaarIn - o.expenses - o.withdrawals;
// Net sales are applied to lots oldest first.
export function lotRecovery(lots, net) {
  let rem = Math.max(net, 0);
  return [...lots].sort((a, b) => (a.bought_at < b.bought_at ? -1 : 1)).map(l => {
    const c = l.cost + l.extra_costs, r = Math.min(rem, c); rem -= r;
    return { id: l.id, recovered: r, percent: c ? Math.floor(r * 100 / c) : 0 };
  });
}
