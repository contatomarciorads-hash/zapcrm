/* eslint-disable no-restricted-globals */
// Minimal Service Worker (MVP): offline fallback for the app shell.
// Note: This does NOT provide offline data sync.
//
// Strategy is NETWORK-FIRST for everything. The previous stale-while-revalidate
// strategy served cached JS on every load, so users kept running an old build
// for one or more reloads after each deploy (the cache only updated in the
// background). Network-first always fetches the fresh build when online and
// falls back to the cache only when the network is unavailable.

const CACHE_NAME = 'zapcrm-shell-v3';
const SHELL_URLS = [
  '/',
  '/login',
  '/boards',
  '/inbox',
  '/contacts',
  '/activities',
  '/icons/icon.svg',
  '/icons/maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? Promise.resolve() : caches.delete(k))))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Network-first for everything: always prefer the fresh response so a new
  // deploy is picked up immediately; fall back to the cache only when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || (req.mode === 'navigate' ? caches.match('/') : undefined))
      )
  );
});
