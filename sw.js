// Service worker : app utilisable hors ligne. Incrémente VERSION à chaque déploiement.
const VERSION = "pokefolio-v1.0.0";
const SHELL = ["./", "index.html", "app.css", "app.js", "seed.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // réseau d'abord pour l'app (mises à jour immédiates), cache en secours hors ligne
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return r; }).catch(() => caches.match(req).then(r => r || caches.match("index.html"))));
  } else if (url.host === "assets.tcgdex.net" || url.host.endsWith("gstatic.com") || url.host.endsWith("googleapis.com")) {
    // images de cartes et polices : cache d'abord
    e.respondWith(caches.open(VERSION + "-ext").then(c => c.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; }))));
  }
});
