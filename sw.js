/* PWA Cache shell */
const CACHE_NAME = 'accounting-v9';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/store.js',
  './js/categories.js',
  './js/accounts.js',
  './js/excel-io.js',
  './js/format.js',
  './js/router.js',
  './js/ui.js',
  './js/lib/xlsx.full.min.js',
  './js/views/home.js',
  './js/views/add-transaction.js',
  './js/views/stats.js',
  './js/views/budget.js',
  './js/views/settings.js',
  './js/views/accounts.js',
  './js/views/categories.js',
  './js/charts/pie-chart.js',
  './js/charts/line-chart.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // Use individual fetches so one missing file doesn't break install
      return Promise.all(
        PRECACHE_URLS.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn('SW precache miss:', url, err);
          });
        })
      );
    }).then(function () {
      self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
          .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (resp) {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, copy).catch(function () {});
        });
        return resp;
      }).catch(function () {
        // Offline fallback - serve cached index for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 504 });
      });
    })
  );
});
