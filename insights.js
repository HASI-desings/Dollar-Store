import { h } from './ui.js';
import { all } from './db.js';
import { rs, lotRecovery } from './money.js';
const band = p => (p < 100 ? 'under 100' : p < 300 ? '100-299' : p < 600 ? '300-599' : '600+');

// Plain rules, no AI. Thresholds are the ones in App.md.
export async function mount(root) {
  const [lines, sales, lots, refunds, cats, closes] = await Promise.all(['sale_lines', 'sales', 'lots', 'refunds', 'categories', 'day_closes'].map(all));
  const out = [], day = 864e5, now = Date.now(), when = new Map(sales.map(s => [s.id, new Date(s.created_at).getTime()]));
  const bands = {}; let all$ = 0;
  for (const l of lines) { const v = l.unit_price * l.qty; bands[band(l.unit_price)] = (bands[band(l.unit_price)] || 0) + v; all$ += v; }
  for (const [b, v] of Object.entries(bands)) if (all$ && v * 100 / all$ > 30) out.push('Items priced ' + b + ' bring ' + Math.floor(v * 100 / all$) + '% of your sales. Consider buying more of them.');
  const net = sales.reduce((a, s) => a + s.total, 0) - refunds.reduce((a, r) => a + r.amount, 0), rec = new Map(lotRecovery(lots, net).map(r => [r.id, r]));
  for (const l of lots) { const age = Math.floor((now - new Date(l.bought_at)) / day), r = rec.get(l.id); if (!l.closed && age > 14 && r.percent < 40) out.push(l.name + ' is only ' + r.percent + '% recovered after ' + age + ' days. It is selling slowly (' + rs(r.recovered) + ' back).'); }
  const mk = new Date().toISOString().slice(0, 7), wd = {};
  for (const c of closes) if (c.date.startsWith(mk) && c.difference < 0) { const d = new Date(c.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' }); wd[d] = (wd[d] || 0) + 1; }
  for (const [d, n] of Object.entries(wd)) if (n >= 3) out.push('Cash was short ' + n + ' times on ' + d + 's this month. Check who is at the counter on that day.');
  const recent = new Set(), ever = new Set();
  for (const l of lines) { ever.add(l.category_name); if (now - (when.get(l.sale_id) || 0) < 14 * day) recent.add(l.category_name); }
  for (const c of cats) if (!c.archived && ever.has(c.name) && !recent.has(c.name)) out.push(c.name + ' had no sales in 14 days. It is a clearance candidate.');
  const card = t => {
    const el = h('section', { class: 'card swipe' }, h('p', {}, t), h('button', { class: 'btn sec', type: 'button', onclick: () => el.remove() }, 'Dismiss'));
    let x0 = null, dx = 0;  // swipe sideways to dismiss
    el.addEventListener('pointerdown', e => { x0 = e.clientX; });
    el.addEventListener('pointermove', e => { if (x0 === null) return; dx = e.clientX - x0; el.style.transform = 'translateX(' + dx + 'px)'; el.style.opacity = String(1 - Math.min(Math.abs(dx) / 200, 1)); });
    const end = () => { if (x0 === null) return; x0 = null; if (Math.abs(dx) > 120) el.remove(); else { el.style.transform = ''; el.style.opacity = ''; } dx = 0; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    return el;
  };
  root.replaceChildren(...(out.length ? out.map(card) : [h('section', { class: 'card empty' }, h('h2', {}, 'No suggestions yet'), h('p', { class: 'muted' }, 'Keep selling. Tips appear when the numbers show a pattern.'))]));
}
