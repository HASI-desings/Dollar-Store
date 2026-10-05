import { h, ask, toast, errorSheet, banner } from './ui.js';
import { tx, req, put } from './db.js';
import * as sell from './sell.js';
import * as receipts from './receipts.js';
import * as udhaar from './udhaar.js';
import * as expenses from './expenses.js';
import * as closeday from './closeday.js';
import * as lots from './lots.js';
import * as reports from './reports.js';
import * as backup from './backup.js';
import * as insights from './insights.js';
import * as goals from './goals.js';
import * as staff from './staff.js';
import * as settings from './settings.js';
import * as sync from './sync.js';
import * as setup from './setup.js';
import * as license from './license.js';
import * as i18n from './i18n.js';
const t = i18n.t;

const empty = line => body => body.replaceChildren(h('section', { class: 'card empty' }, h('h2', {}, 'Coming soon'), h('p', { class: 'muted' }, line)));
// Shop details are used on every receipt.
async function more(body) {
  const cur = (await tx(['settings'], 'readonly', s => req(s.settings.get('shop'))))?.value || {};
  body.replaceChildren(h('section', { class: 'card' }, h('button', { class: 'btn', type: 'button', onclick: () => ask('Shop details', [
    { k: 'name', label: 'Shop name', v: cur.name }, { k: 'address', label: 'Address', v: cur.address }, { k: 'phone', label: 'Phone', v: cur.phone }],
  async v => { if (!v.name) return 'Enter the shop name.'; await put('settings', { key: 'shop', value: v }); toast('Saved.'); }) }, 'Shop details')),
  h('div', { id: 'bk' }));
  body.append(h('section', { class: 'card' }, ...[['staff', 'Staff and roles'], ['settings', 'Settings'], ['cloud', 'Cloud backup and reports']].map(([id, n]) => h('a', { class: 'lnk', href: '#/' + id }, n, h('span', {}, '›')))));
  if (await staff.guardOwner()) await backup.mount(body.querySelector('#bk'));
}
const money = body => body.replaceChildren(h('section', { class: 'card' }, ...[['udhaar', 'Udhaar'], ['expenses', 'Expenses'], ['lots', 'Stock lots'], ['closeday', 'Close the day'], ['reports', 'Reports'], ['insights', 'Insights'], ['goals', 'Goals']].map(([id, n]) => h('a', { class: 'lnk', href: '#/' + id }, n, h('span', {}, '›')))));
const PAGES = [
  { id: 'sell', title: 'Sell', mount: sell.mount }, { id: 'receipts', title: 'Receipts', mount: receipts.mount },
  { id: 'money', title: 'Money', mount: money }, { id: 'more', title: 'More', mount: more }];
const guard = f => async b => { if (await staff.guardOwner()) return f(b); empty('Owner PIN needed.')(b); };
const SUBS = [{ id: 'udhaar', title: 'Udhaar', tab: 2, mount: udhaar.mount }, { id: 'expenses', title: 'Expenses', tab: 2, mount: expenses.mount }, { id: 'lots', title: 'Stock lots', tab: 2, mount: lots.mount }, { id: 'closeday', title: 'Close the day', tab: 2, mount: closeday.mount }, { id: 'reports', title: 'Reports', tab: 2, mount: reports.mount }, { id: 'insights', title: 'Insights', tab: 2, mount: insights.mount }, { id: 'goals', title: 'Goals', tab: 2, mount: goals.mount }, { id: 'staff', title: 'Staff and roles', tab: 3, mount: guard(staff.mount) }, { id: 'settings', title: 'Settings', tab: 3, mount: guard(settings.mount) }, { id: 'cloud', title: 'Cloud backup', tab: 3, mount: guard(sync.mount) }];
const view = document.getElementById('view'), tabs = document.getElementById('tabs'), barTitle = document.getElementById('barTitle');
let current = -1;

function errorEl(e) {
  const msg = e && e.message === 'nodb' ? 'This browser is blocking storage. Open the app in normal mode.' : 'Something went wrong. Your data is safe.';
  return h('section', { class: 'card empty' }, h('h2', {}, msg), h('button', { class: 'btn', type: 'button', onclick: route }, 'Try again'));
}
function route() {
  const p = [...PAGES, ...SUBS].find(x => x.id === location.hash.replace('#/', ''));
  if (!p) { location.replace('#/sell'); return; }
  const i = p.tab ?? PAGES.indexOf(p), body = h('div', {}, h('div', { class: 'skel' }));
  view.style.setProperty('--dx', (i >= current ? 12 : -12) + 'px'); current = i;
  const chip = h('span', { class: 'chip', id: 'chip' }, 'Offline');
  view.replaceChildren(h('header', { class: 'head' }, h('div', {}, p.tab != null ? h('a', { class: 'back', href: '#/' + PAGES[p.tab].id }, '‹ ' + t(PAGES[p.tab].title)) : null, h('h1', {}, t(p.title))), p.id === 'sell' ? chip : null), body);
  view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter');
  Promise.resolve(p.mount(body)).catch(e => body.replaceChildren(errorEl(e)));
  tabs.style.setProperty('--i', i);
  tabs.querySelectorAll('.tab').forEach((a, k) => a.classList.toggle('active', k === i));
  barTitle.textContent = t(p.title); tabs.querySelectorAll('.tab span').forEach((sp, k) => { sp.textContent = t(PAGES[k].title); }); window.scrollTo(0, 0); onScroll(); updateChip();
}
addEventListener('hashchange', route);

let lastY = 0, ticking = false;
function onScroll() {
  if (ticking) return; ticking = true;
  requestAnimationFrame(() => {
    const y = Math.max(0, scrollY);
    document.documentElement.style.setProperty('--p', Math.min(1, y / 60));
    if (y > lastY + 8 && y > 80) tabs.classList.add('hide'); else if (y < lastY - 8) tabs.classList.remove('hide');
    lastY = y; ticking = false;
  });
}
addEventListener('scroll', onScroll, { passive: true });
const updateChip = () => { const c = document.getElementById('chip'); if (c) c.classList.toggle('hidden', navigator.onLine); };
addEventListener('online', updateChip); addEventListener('offline', updateChip);

// A new service worker waits until the app is fully closed, so an open bill is never interrupted.
async function checkDue() {
  try {
    if (await backup.dueCheck()) banner('Backup due. Save a backup file.', [{ label: 'Open', run: () => { location.hash = '#/more'; } }]);
    if (await sync.dueCheck()) banner('Cloud backup is due.', [{ label: 'Open', run: () => { location.hash = '#/cloud'; } }]);
  } catch (e) { toast('Could not check backups.'); }
}
// Install banner (a UI flag only, not business data).
const flag = k => { try { return localStorage.getItem('dsb_' + k); } catch (e) { return null; } };
const setFlag = k => { try { localStorage.setItem('dsb_' + k, '1'); } catch (e) { return false; } return true; };
let deferred = null;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferred = e;
  if (!flag('noinstall')) banner('Install this app to use it offline.', [{ label: 'Not now', secondary: true, run: () => setFlag('noinstall') },
    { label: 'Install', run: async () => { try { deferred.prompt(); await deferred.userChoice; } catch (e2) { toast('Could not start install.'); } deferred = null; } }]);
});
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !(matchMedia('(display-mode: standalone)').matches || navigator.standalone) && !flag('noinstall')) banner('To install: tap Share, then Add to Home Screen.', [{ label: 'Got it', run: () => setFlag('noinstall') }]);
// A new version never reloads the app by itself. It waits for a tap, and only when no bill is open.
if ('serviceWorker' in navigator) {
  const had = !!navigator.serviceWorker.controller; let offered = false, reloading = false;
  const offer = reg => {
    if (offered) return; offered = true;
    banner('Update ready. Tap to refresh.', [{ label: 'Refresh', keep: true, run: () => { if (sell.hasOpenDraft()) { toast('Finish your open bill first.'); return; } if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING'); } }]);
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!had || reloading || sell.hasOpenDraft()) return; reloading = true; location.reload(); });
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg);
    reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(reg); }); });
  }).catch(() => toast('Offline mode could not start.')));
}
addEventListener('error', e => errorSheet(String(e.message)));
addEventListener('unhandledrejection', e => (e.reason && e.reason.message === 'locked' ? toast('Trial ended. Enter an activation code.') : errorSheet(String((e.reason && e.reason.message) || e.reason))));
(async () => {
  try {
    await i18n.load(); i18n.watch();
    if (await setup.needed()) await setup.run();
    const st = await license.apply();
    if (st.mode === 'expired') toast('Trial ended. Enter an activation code.');
    await staff.init();
  } catch (e) { errorSheet(e.message === 'nodb' ? 'This browser is blocking storage.' : String(e.message)); }
  route();
  checkDue();
})();
