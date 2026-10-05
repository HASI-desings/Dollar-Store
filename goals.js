import { h, ask } from './ui.js';
import { all, put, tx, req } from './db.js';
import { rs, posInt } from './money.js';
const ns = 'http://www.w3.org/2000/svg', C = 339.3;
const svg = (t, a) => { const e = document.createElementNS(ns, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };

export async function mount(root) {
  const [sales, refunds, ex] = await Promise.all(['sales', 'refunds', 'expenses'].map(all));
  const g = (await tx(['settings'], 'readonly', s => req(s.settings.get('goal'))))?.value || { sales: 0, profit: 0 };
  const now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), 1), inM = d => new Date(d) >= start, sum = a => a.reduce((x, y) => x + y, 0);
  const s = sum(sales.filter(x => inM(x.created_at)).map(x => x.total)) - sum(refunds.filter(x => inM(x.created_at)).map(x => x.amount));
  const profit = s - sum(ex.filter(x => inM(x.date)).map(x => x.amount));
  const p = g.sales ? Math.min(s / g.sales, 1) : 0, left = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
  const ring = svg('svg', { viewBox: '0 0 120 120', width: '160', height: '160', role: 'img', 'aria-label': Math.floor(p * 100) + ' percent of the sales goal' });
  ring.append(svg('circle', { cx: 60, cy: 60, r: 54, fill: 'none', stroke: 'currentColor', 'stroke-opacity': '.12', 'stroke-width': 10 }),
    svg('circle', { cx: 60, cy: 60, r: 54, fill: 'none', stroke: '#FFD23F', 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-dasharray': C, 'stroke-dashoffset': C * (1 - p), transform: 'rotate(-90 60 60)' }));
  const set = () => ask('Monthly goals', [{ k: 's', label: 'Sales target (Rs)', type: 'number', v: String(g.sales || '') }, { k: 'p', label: 'Profit target (Rs)', type: 'number', v: String(g.profit || '') }], async v => {
    const a = posInt(v.s), b = v.p === '' ? 0 : posInt(v.p); if (!a) return 'Enter a sales target.'; if (b === null) return 'Profit target must be a whole number.';
    await put('settings', { key: 'goal', value: { sales: a, profit: b } }); await mount(root);
  });
  root.replaceChildren(h('section', { class: 'card empty' }, ring, h('p', { class: 'num' }, Math.floor(p * 100) + '%'), h('p', { class: 'muted' }, 'Sales this month ' + rs(s) + (g.sales ? ' of ' + rs(g.sales) : '')),
    g.sales ? h('p', {}, 'Needed per day: ' + rs(Math.ceil(Math.max(g.sales - s, 0) / left))) : h('p', { class: 'muted' }, 'Set a target to see your progress.'),
    g.profit ? h('p', { class: 'muted' }, 'Profit this month ' + rs(profit) + ' of ' + rs(g.profit)) : null, h('button', { class: 'btn', type: 'button', onclick: set }, 'Set goals')));
}
