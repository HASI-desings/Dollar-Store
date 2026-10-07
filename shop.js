import { h, ask, toast, progress } from './ui.js';
import { put, tx, req } from './db.js';
import { requirePin } from './staff.js';
import * as backup from './backup.js';
const get = async k => (await tx(['settings'], 'readonly', s => req(s.settings.get(k))))?.value;
const LIMIT = 524288000;
export const fmt = b => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.ceil(b / 1024) + ' KB');
export const usage = async () => (navigator.storage && navigator.storage.estimate ? (await navigator.storage.estimate()).usage || 0 : 0);

// The Shop tab: details (PIN to edit), backup panel that opens on tap, links, local storage.
export async function mount(root) {
  const shop = (await get('shop')) || { name: 'My Store', address: '', phone: '' }, used = await usage();
  const edit = async () => {
    if (!(await requirePin('Edit shop details'))) return;
    ask('Shop details', [{ k: 'name', label: 'Shop name', v: shop.name }, { k: 'address', label: 'Address', v: shop.address }, { k: 'phone', label: 'Phone', v: shop.phone }],
      async v => { if (!v.name) return 'Enter the shop name.'; await put('settings', { key: 'shop', value: v }); toast('Saved.'); await mount(root); });
  };
  const panel = h('div', { class: 'hidden' }); let loaded = false;
  const toggle = async () => { if (!loaded) { loaded = true; await backup.mount(panel); } panel.classList.toggle('hidden'); };
  const link = (id, n) => h('a', { class: 'lnk', href: '#/' + id }, n, h('span', {}, '›'));
  const bar = progress(); bar.set(Math.min(used / LIMIT, 1) * 100); bar.el.classList.toggle('bad', used / LIMIT > 0.8);
  root.replaceChildren(
    h('section', { class: 'card' }, h('b', {}, shop.name), h('p', { class: 'muted' }, [shop.address, shop.phone].filter(Boolean).join(' · ') || 'No address or phone yet.'), h('button', { class: 'btn sec', type: 'button', onclick: edit }, 'Edit shop details')),
    h('section', { class: 'card' }, h('button', { class: 'lnk btnlink', type: 'button', onclick: toggle }, 'Backup and restore', h('span', {}, '›')), panel, link('staff', 'Staff and roles'), link('settings', 'Settings')),
    h('section', { class: 'card' }, h('b', {}, 'Storage on this device'), h('p', { class: 'muted' }, fmt(used) + ' of 500 MB'), bar.el, used > LIMIT ? h('p', { class: 'err' }, 'Local data is over 500 MB. Back up now for safety.') : null));
}
