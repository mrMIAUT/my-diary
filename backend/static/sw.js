const CACHE='eplan-pwa-v2-offline';
const SHELL=['/','/manifest.webmanifest','/static/icons/icon-192.png','/static/icons/icon-512.png','/static/icons/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy=res.clone();
        caches.open(CACHE).then(c => c.put('/', copy));
        return res;
      }).catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    fetch(req).then(res => {
      const copy=res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req))
  );
});
