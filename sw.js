/* =========================================================================
   sw.js – Service Worker
   -------------------------------------------------------------------------
   • App-Dateien werden beim Installieren vorgeladen → sofortiger Start & offline.
   • Strategie "Network first": Online kommt immer die neueste Version von
     GitHub Pages, offline die gecachte.
   • Auto-Update: Bei jedem neuen Commit VERSION hochzählen. Der Browser
     erkennt die geänderte sw.js, installiert sie und die App lädt sich neu.
   ========================================================================= */
const VERSION = '3.1.0';
const CACHE = `budget-${VERSION}`;
const ASSETS = [
  './', './index.html', './manifest.json', './css/app.css',
  './js/config.js', './js/utils.js', './js/storage.js', './js/sync.js', './js/budget.js', './js/ui.js', './js/pwa.js', './js/main.js',
  './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' umgeht den HTTP-Cache, damit wirklich die neuen Dateien landen
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Nur eigene GET-Anfragen; Supabase & CDN laufen direkt übers Netz
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // no-cache: beim Server nachfragen (GitHub Pages cached sonst ~10 Min.)
      const fresh = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
      if (fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      // Offline-Navigation auf unbekannte Unterseite → App-Startseite
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});
