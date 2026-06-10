const CACHE_VERSION = 'renan-tv-v2';
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

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only cache-first for same-origin static assets; let everything else go to network
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
