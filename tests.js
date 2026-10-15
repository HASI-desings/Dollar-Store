import { okRow } from './schema.js';
import { readPrices, planImport } from './csv.js';
import { judge, derive, friendly, nextDelay } from './license.js';
import { posInt, dayKey, rs, subtotal, refundAmount, waNumber, receiptNo, expectedCash, lotRecovery } from './money.js';
const j = JSON.stringify, lr = lotRecovery([{ cost: 500, extra_costs: 100, bought_at: '2026-02-01' }, { cost: 1000, extra_costs: 0, bought_at: '2026-01-01' }], 1300).map(r => [r.recovered, r.percent]);
const T = [['subtotal', subtotal([{ unit_price: 250, qty: 2 }, { unit_price: 400, qty: 1 }]), 900], ['rs', rs(1234567), 'Rs 1,234,567'], ['receipt no', receiptNo(7), 'R-0007'],
  ['refund full', refundAmount(900, 800, 900), 800], ['refund exact', refundAmount(100, 90, 200), 45], ['refund half up', refundAmount(1, 1, 2), 1], ['refund rounds down', refundAmount(1, 1, 3), 0], ['refund rounds up', refundAmount(2, 1, 3), 1],
  ['phone 03', waNumber('0300-1234567'), '923001234567'], ['phone +92', waNumber('+92 300 1234567'), '923001234567'], ['phone bad', waNumber('12345'), null],
  ['subtotal empty', subtotal([]), 0], ['posInt ok', posInt('12'), 12], ['posInt decimal', posInt('1.5'), null], ['posInt negative', posInt('-3'), null], ['dayKey', dayKey('2026-03-05T12:00:00'), '2026-03-05'],
  ['lots overflow', j(lotRecovery([{ cost: 1000, extra_costs: 0, bought_at: 'a' }, { cost: 600, extra_costs: 0, bought_at: 'b' }], 5000).map(r => [r.recovered, r.percent])), j([[1000, 100], [600, 100]])],
  ['lots zero sales', j(lotRecovery([{ cost: 1000, extra_costs: 0, bought_at: 'a' }], 0).map(r => [r.recovered, r.percent])), j([[0, 0]])],
  ['backup row ok', okRow('sales', { id: 'x', receipt_no: 'R-0001', created_at: 'd', cashier_id: 'owner', cashier_name: 'Owner', customer_name: '', customer_phone: '', subtotal: 5, discount: 0, total: 5, method: 'cash', cash_received: 5, status: 'completed' }), true],
  ['backup unknown field', okRow('sales', { id: 'x', evil: 1 }), false], ['backup wrong type', okRow('sales', { id: 'x', total: '5' }), false], ['backup settings', okRow('settings', { key: 'shop', value: { name: 'A' } }), true],
  ['csv header skipped', readPrices('category,label,price\nGlass,Wine,400\nLamp,,650').out.length, 2], ['csv quoted comma', readPrices('"Kitchen, big",Jug,300').out[0].category, 'Kitchen, big'],
  ['csv bad price', readPrices('Glass,Wine,400\nLamp,Pot,x').errors.length, 1], ['csv semicolon', readPrices('Glass;Wine;400').out[0].price, 400], ['csv two columns', readPrices('Glass,250').out[0].label, ''],
  ['import plan', j(((p) => [p.dupes, p.newCats, p.add.length])(planImport([{ category: 'glass', label: 'wine', price: 400 }, { category: 'Lamp', label: '', price: 650 }], [{ id: '1', name: 'Glass' }], [{ category_id: '1', label: 'Wine', amount: 400 }]))), j([1, ['Lamp'], 1])],
  ['receipt prefix', receiptNo(7, 'B'), 'B-0007'],
  ['judge trial valid', judge({ state: 'trial', plan: 'trial', valid_until: new Date(5 * 864e5).toISOString(), expires_at: 5 * 864e5 }, 1000).mode, 'trial'],
  ['judge trial expired', j(judge({ state: 'trial', plan: 'trial', valid_until: new Date(5 * 864e5).toISOString(), expires_at: 5 * 864e5 }, 6 * 864e5)), j({ mode: 'expired', why: 'trial_ended' })],
  ['judge permanent', judge({ state: 'permanent', plan: 'permanent', valid_until: null, expires_at: 30 * 864e5 }, 1).mode, 'permanent'],
  ['judge permanent offline', judge({ state: 'permanent', plan: 'permanent', valid_until: null, expires_at: 30 * 864e5 }, 31 * 864e5).mode, 'offline_expired'],
  ['judge sub expired', judge({ state: 'subscription', plan: 'subscription', valid_until: new Date(10).toISOString(), expires_at: 10 }, 20).why, 'subscription_expired'],
  ['judge blocked', judge({ state: 'blocked', plan: 'blocked', valid_until: null, expires_at: 99 }, 1).why, 'blocked'],
  ['judge lease ends before plan', judge({ state: 'trial', plan: 'trial', valid_until: new Date(7 * 864e5).toISOString(), expires_at: 3 * 864e5 }, 4 * 864e5).mode, 'offline_expired'],
  ['derive pending', derive({ mode: 'trial' }, true).state, 'activation_pending'], ['derive trial', derive({ mode: 'trial', left: 3 }).state, 'trial_active'],
  ['derive permanent', j(derive({ mode: 'permanent' })), j({ state: 'activated', kind: 'permanent' })],
  ['derive sub expired', derive({ mode: 'expired', why: 'subscription_expired' }).state, 'subscription_expired'],
  ['derive offline', derive({ mode: 'offline_expired' }).state, 'verification_required'], ['derive none', derive({ mode: 'none' }).state, 'verification_required'],
  ['error invalid key', /not valid/.test(friendly(new Error('This activation code is not valid.'))), true],
  ['error network', /verify your activation/.test(friendly(new Error('No internet connection.'))), true],
  ['error hides raw text', /syntax/.test(friendly(new Error('syntax error at or near x'))), false],
  ['timer clamp', nextDelay(1e12, 1000), 2147483647], ['timer minimum', nextDelay(500, 1000), 50],
  ['expected cash', expectedCash({ cashSales: 1000, cashRefunds: 100, udhaarIn: 200, expenses: 300, withdrawals: 50 }), 750], ['lots oldest first', j(lr), j([[1000, 100], [300, 50]])]];
const out = T.map(([n, a, b]) => (j(a) === j(b) ? 'PASS ' : 'FAIL ') + n + ' (' + j(a) + ')');
if (typeof document !== 'undefined') document.getElementById('out').textContent = out.join('\n'); else console.log(out.join('\n'));
