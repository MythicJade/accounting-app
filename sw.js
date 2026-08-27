/* My Accounting PWA v2.1.3 application shell. */
const CACHE_NAME = 'accounting-v2.1.3';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/pwa.js',
  './js/db.js',
  './js/store.js',
  './js/categories.js',
  './js/category-icons.js',
  './js/accounts.js',
  './js/excel-io.js',
  './js/native-bridge.js',
  './js/backup-crypto.js',
  './js/date-only.js',
  './js/money.js',
  './js/format.js',
  './js/router.js',
  './js/ui.js',
  './js/version.js',
  './js/views/home.js',
  './js/views/transactions.js',
  './js/views/add-transaction.js',
  './js/views/stats.js',
  './js/views/budget.js',
  './js/views/settings.js',
  './js/views/accounts.js',
  './js/views/account-detail.js',
  './js/views/assets-trend.js',
  './js/views/categories.js',
  './js/charts/pie-chart.js',
  './js/charts/line-chart.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event.request));
    return;
  }
  event.respondWith(staleWhileRevalidate(event.request));
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request)) || (await cache.match('./index.html')) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request).then(async response => {
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  if (cached) return cached;
  return (await network) || new Response('', { status: 504, statusText: 'Offline' });
}
