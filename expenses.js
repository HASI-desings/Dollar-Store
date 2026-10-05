import { h, ask } from './ui.js';
import { all, put, uid, tx, req, locked } from './db.js';
import { rs, posInt, dayKey } from './money.js';
const CATS = ['rent', 'electricity', 'staff', 'transport', 'personal', 'other'];

// Posts each active recurring expense once a month, from its day of the month.
async function runRecurring() {
  const mk = dayKey(new Date()).slice(0, 7), dom = new Date().getDate();
  await tx(['recurring_expenses', 'expenses'], 'readwrite', async s => {
    for (const r of await req(s.recurring_expenses.getAll())) if (r.active && dom >= r.day_of_month && r.last_run !== mk) {
      s.expenses.add({ id: uid(), label: r.label, amount: r.amount, category: r.category, date: new Date().toISOString(), recurring_id: r.id });
      s.recurring_expenses.put({ ...r, last_run: mk });
    }
  });
}
export async function mount(root) {
  if (!locked) await runRecurring();
  const [ex, wd, rec] = await Promise.all([all('expenses'), all('withdrawals'), all('recurring_expenses')]);
  const mk = dayKey(new Date()).slice(0, 7);
  const month = ex.filter(e => dayKey(e.date).startsWith(mk)).reduce((a, e) => a + e.amount, 0);
  const closed = async () => (await tx(['day_closes'], 'readonly', s => req(s.day_closes.getAll()))).some(d => d.date === dayKey(new Date()));
  const addEx = () => ask('Add expense', [{ k: 'label', label: 'What for' }, { k: 'amount', label: 'Amount (Rs)', type: 'number' }, { k: 'category', label: 'Category: ' + CATS.join(', '), v: 'other' }], async v => {
    const a = posInt(v.amount), c = v.category.toLowerCase();
    if (!v.label) return 'Enter a name.'; if (!a) return 'Enter an amount.'; if (!CATS.includes(c)) return 'Pick a listed category.';
    if (await closed()) return 'This day is closed.';
    await put('expenses', { id: uid(), label: v.label, amount: a, category: c, date: new Date().toISOString(), recurring_id: null }); await mount(root);
  });
  const addWd = () => ask('Owner withdrawal', [{ k: 'amount', label: 'Amount (Rs)', type: 'number' }, { k: 'note', label: 'Note' }], async v => {
    const a = posInt(v.amount); if (!a) return 'Enter an amount.'; if (await closed()) return 'This day is closed.';
    await put('withdrawals', { id: uid(), amount: a, note: v.note, created_at: new Date().toISOString() }); await mount(root);
  });
  const addRec = () => ask('Recurring expense', [{ k: 'label', label: 'What for (rent, electricity...)' }, { k: 'amount', label: 'Amount (Rs)', type: 'number' }, { k: 'category', label: 'Category: ' + CATS.join(', '), v: 'rent' }, { k: 'day', label: 'Day of month (1-28)', type: 'number', v: '1' }], async v => {
    const a = posInt(v.amount), d = Number(v.day), c = v.category.toLowerCase();
    if (!v.label) return 'Enter a name.'; if (!a) return 'Enter an amount.'; if (!CATS.includes(c)) return 'Pick a listed category.'; if (!Number.isInteger(d) || d < 1 || d > 28) return 'Day must be 1 to 28.';
    await put('recurring_expenses', { id: uid(), label: v.label, amount: a, category: c, day_of_month: d, active: true, last_run: '' }); await mount(root);
  });
  const recSection = h('section', { class: 'card' }, h('b', {}, 'Recurring'), ...(rec.length ? rec.map(r => h('div', { class: 'ln' }, h('span', {}, r.label + ' · ' + rs(r.amount) + ' · day ' + r.day_of_month + (r.active ? '' : ' (stopped)')),
    h('button', { class: 'btn sec', type: 'button', onclick: async () => { await put('recurring_expenses', { ...r, active: !r.active }); await mount(root); } }, r.active ? 'Stop' : 'Start'))) : [h('p', { class: 'muted' }, 'None yet.')]));
  const rows = [...ex].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 50).map(e => h('div', { class: 'ln' }, h('span', {}, e.label + ' · ' + e.category), h('b', {}, rs(e.amount))));
  root.replaceChildren(h('section', { class: 'card' }, h('p', { class: 'muted' }, 'This month'), h('p', { class: 'num' }, rs(month)),
    h('button', { class: 'btn', type: 'button', onclick: addEx }, '+ Expense'), h('button', { class: 'btn sec', type: 'button', onclick: addWd }, 'Withdrawal'), h('button', { class: 'btn sec', type: 'button', onclick: addRec }, 'Recurring'),
    h('p', { class: 'muted' }, 'Withdrawals so far: ' + rs(wd.reduce((a, w) => a + w.amount, 0)))),
    recSection, h('section', { class: 'card' }, ...(rows.length ? rows : [h('p', { class: 'muted' }, 'No expenses yet.')])));
}
