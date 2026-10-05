// Bump CACHE on every release so users get the new files.
const CACHE = 'dsb-shell-v6';
const SHELL = ['./', './index.html', './styles.css', './app.js', './ui.js', './db.js', './money.js', './sell.js', './receipts.js', './udhaar.js', './expenses.js', './closeday.js', './lots.js', './reports.js', './backup.js', './insights.js', './goals.js', './staff.js', './settings.js', './sync.js', './setup.js', './license.js', './i18n.js', './schema.js', './moneyhub.js', './shop.js', './config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => hit || fetch(r).catch(() => (r.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
