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
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t); setTimeout(() => t.remove(), 2500);
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
  const inp = {}; const err = h('p', { class: 'err' }); let close;
  const rows = fields.map(f => h('label', { class: 'fld' }, f.label, inp[f.k] = h('input', { type: f.type || 'text', value: f.v || '', inputmode: f.type === 'number' ? 'numeric' : null })));
  const save = async () => { const v = {}; for (const f of fields) v[f.k] = inp[f.k].value.trim(); const m = await ok(v); if (m) err.textContent = m; else close(); };
  close = sheet(h('div', {}, h('h2', {}, title), rows, err, h('button', { class: 'btn full', type: 'button', onclick: save }, 'Save')), cancel);
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
  const el = h('div', { class: 'banner', role: 'status' }, h('span', {}, text), h('div', { class: 'acts' }, actions.map(a => h('button', { class: 'btn' + (a.secondary ? ' sec' : ''), type: 'button', onclick: () => { if (!a.keep) el.remove(); a.run(); } }, a.label))));
  box.append(el); return { remove: () => el.remove() };
}
