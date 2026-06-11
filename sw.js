const CACHE_VERSION = 'renan-tv-v3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './js/state.js',
  './js/utils.js',
  './js/hls-player.js',
  './js/ui.js',
  './js/channels.js',
  './js/helperFetcher.js',
  './js/keyboard.js',
  './js/main.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Network-first for same-origin GETs: always try the live network copy so code
// updates ship immediately, and fall back to cache only when offline. This
// replaces the old cache-first strategy, which pinned stale JS (e.g. a dead
// helperFetcher.js) on returning visitors even after a cache-version bump.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept cross-origin requests (stream playlists, .ts segments,
  // CDNs). They must go straight to the network.
  if (url.origin !== location.origin) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_VERSION)
          .then((cache) => cache.put(event.request, copy))
          .catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
