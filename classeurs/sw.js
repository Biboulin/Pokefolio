// PokéFolio service worker : app hors ligne + cache des images de cartes
// v5 : on ne met plus en cache que les images réellement chargées (avant, une image ratée restait cassée pour toujours)
const SHELL = 'classeurs-shell-v6', IMG = 'classeurs-img-v2';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== SHELL && k !== IMG).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
async function cardImage(req){
  const c = await caches.open(IMG), hit = await c.match(req.url);
  if (hit) return hit;
  try {
    // Requête CORS pour connaître le vrai statut : seules les réponses 200 avec une image sont gardées
    const r = await fetch(req.url, {mode:'cors', credentials:'omit'});
    if (r.ok && (r.headers.get('content-type') || '').startsWith('image/')) c.put(req.url, r.clone());
    return r;
  } catch {
    return fetch(req); // pas de CORS : on charge sans mettre en cache
  }
}
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.hostname === 'assets.tcgdex.net') {
    e.respondWith(cardImage(e.request));
  } else if (u.origin === location.origin) {
    e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(SHELL).then(c => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request)));
  }
});
