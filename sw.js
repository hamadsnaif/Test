// Offline cache for Hamad's Games. Each page is self contained, so the cache
// only holds the launcher, the three games, the manifest and the icons.
const CACHE = 'hamads-games-v3';
const ASSETS = ['./', './index.html', './bounce.html', './snake.html', './tetris.html',
  './manifest.webmanifest', './apple-touch-icon.png', './icon-120.png', './icon-152.png',
  './icon-167.png', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) {
        fetch(e.request).then(res => { if (res && res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone())); }).catch(() => {});
        return hit;
      }
      return fetch(e.request)
        .then(res => { if (res && res.ok && e.request.url.startsWith(self.registration.scope)) caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res; })
        .catch(() => caches.match('./index.html'));
    })
  );
});
