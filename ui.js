// Shared helpers. User text always goes through textContent, never innerHTML.
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function h(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) { if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return n;
}
export function toast(msg) {
  const box = document.getElementById('toasts') || document.body.appendChild(h('div', { id: 'toasts', class: 'toasts' }));
  let gone = false;
  const out = () => { if (gone) return; gone = true; t.classList.add('out'); setTimeout(() => t.remove(), 300); };
  const t = h('div', { class: 'toast', role: 'status' }, h('span', {}, msg), h('button', { class: 'x', type: 'button', 'aria-label': 'Close', onclick: out }, '×'));
  box.append(t); setTimeout(out, 3500);
}
// Bottom sheet. Returns a close function.
export function sheet(content, onClose) {
  const back = h('div', { class: 'backdrop' });
  const s = h('div', { class: 'sheet', role: 'dialog' }, h('div', { class: 'grab' }), content);
  const close = () => { back.remove(); s.remove(); };
  back.addEventListener('click', () => { close(); if (onClose) onClose(); });
  const g = s.querySelector('.grab'); let y0 = null, dy = 0;  // drag the grabber down to dismiss
  g.addEventListener('pointerdown', e => { y0 = e.clientY; g.setPointerCapture(e.pointerId); });
  g.addEventListener('pointermove', e => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); s.style.transform = 'translateY(' + dy + 'px)'; });
  g.addEventListener('pointerup', () => { if (y0 === null) return; y0 = null; if (dy > 100) { close(); if (onClose) onClose(); } else s.style.transform = ''; dy = 0; });
  document.body.append(back, s);
  return close;
}
export function errorSheet(details) {
  if (document.querySelector('.sheet[aria-label=Error]')) return;
  let close;
  const copy = () => (navigator.clipboard ? navigator.clipboard.writeText(String(details)).then(() => toast('Copied.'), () => toast('Could not copy.')) : toast('Could not copy.'));
  close = sheet(h('div', { 'aria-label': 'Error' }, h('h2', {}, 'Something went wrong'), h('p', { class: 'muted' }, 'Your data is safe.'),
    h('div', { class: 'row' }, h('button', { class: 'btn sec', type: 'button', onclick: copy }, 'Copy details'), h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Close'))));
  document.querySelector('.sheet:last-of-type').setAttribute('aria-label', 'Error');
}
// Small form sheet. ok(values) returns an error string to keep it open.
export function ask(title, fields, ok, cancel) {
  const inp = {}, err = h('p', { class: 'err' }); let close;
  // Selecting on focus means typing replaces the default text.
  const rows = fields.map(f => h('label', { class: 'fld' }, f.label, inp[f.k] = h('input', { type: f.type || 'text', value: f.v || '', inputmode: f.type === 'number' ? 'numeric' : null, onfocus: e => e.target.select() })));
  const btn = h('button', { class: 'btn full', type: 'button' }, 'Save');
  btn.addEventListener('click', async () => {
    if (btn.classList.contains('loading')) return;
    const v = {}; for (const f of fields) v[f.k] = inp[f.k].value.trim();
    btn.classList.add('loading'); err.textContent = '';
    try { const m = await ok(v); if (m) err.textContent = m; else close(); } finally { btn.classList.remove('loading'); }
  });
  close = sheet(h('div', {}, h('h2', {}, title), rows, err, btn), cancel);
}
export function download(name, text, type) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// replaceChildren(null) would print the word "null". Skip empty values instead.
const rc = Element.prototype.replaceChildren;
Element.prototype.replaceChildren = function (...k) { return rc.apply(this, k.filter(x => x != null && x !== false)); };
// Banner above the tab bar. keep:true leaves it open after the button is tapped.
export function banner(text, actions) {
  const box = document.getElementById('banners') || document.body.appendChild(h('div', { id: 'banners', class: 'banners', 'aria-live': 'polite' }));
  let gone = false;
  const out = () => { if (gone) return; gone = true; el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  const el = h('div', { class: 'banner', role: 'status' }, h('span', {}, text), h('div', { class: 'acts' }, actions.map(a => h('button', { class: 'btn' + (a.secondary ? ' sec' : ''), type: 'button', onclick: () => { if (!a.keep) out(); a.run(); } }, a.label))),
    h('button', { class: 'x', type: 'button', 'aria-label': 'Close', onclick: out }, '×'));
  box.append(el); setTimeout(out, 12000); return { remove: out };
}
// In-app confirm box (replaces the browser's own popup).
export function confirmBox(message, okLabel = 'Confirm', danger = true) {
  return new Promise(res => {
    const back = h('div', { class: 'backdrop hi' });
    const done = v => { back.remove(); box.remove(); res(v); };
    const box = h('div', { class: 'dialog', role: 'alertdialog' }, h('p', {}, message), h('div', { class: 'row' },
      h('button', { class: 'btn sec', type: 'button', onclick: () => done(false) }, 'Cancel'), h('button', { class: 'btn' + (danger ? ' bad' : ''), type: 'button', onclick: () => done(true) }, okLabel)));
    back.addEventListener('click', () => done(false)); document.body.append(back, box);
  });
}
// Loading placeholders shaped like the real screens.
export function skel(kind) {
  const L = c => h('i', { class: 'sk ' + c });
  const wrap = (...k) => h('div', { class: 'skels', 'aria-busy': 'true' }, ...k);
  if (kind === 'grid') return wrap(h('div', { class: 'pills' }, [1, 2, 3, 4].map(() => L('pillsk'))), h('div', { class: 'grid' }, [1, 2, 3, 4, 5, 6].map(() => L('tagsk'))));
  if (kind === 'cards') return wrap(...[1, 2, 3].map(() => h('div', { class: 'card' }, L('m'), L('l'), L('btnsk'))));
  if (kind === 'stats') return h('div', { class: 'stats', 'aria-busy': 'true' }, [1, 2, 3, 4].map(() => h('div', { class: 'stat-tile' }, L('s'), L('m'))));
  return wrap(h('div', { class: 'card' }, [1, 2, 3, 4, 5].map(() => h('div', { class: 'sk-row' }, h('div', {}, L('m'), L('s')), L('b')))));
}
export function progress() { const i = h('i'); return { el: h('div', { class: 'bar2' }, i), set: p => i.style.setProperty('--w', p / 100) }; }
