// PokéFolio service worker : app hors ligne + cache des images de cartes
const SHELL = 'classeurs-shell-v1', IMG = 'classeurs-img-v1';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.hostname === 'assets.tcgdex.net') {
    e.respondWith(caches.open(IMG).then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; })));
  } else if (u.origin === location.origin) {
    e.respondWith(fetch(e.request).then(r => { caches.open(SHELL).then(c => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request)));
  }
});
