// sw.js - Service worker for RENAN TV
// Network-first for same-origin files so updates ship immediately; the cache
// is only an offline fallback. Requests revalidate ({cache: 'no-cache'})
// because GitHub Pages sends max-age=600: without that, a browser could mix
// old and new ES modules for 10 minutes after a deploy and fail to start.

const CACHE_VERSION = 'renan-tv-v6-redesign';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/main.js',
  './js/config.js',
  './js/dom.js',
  './js/store.js',
  './js/playlist.js',
  './js/streams.js',
  './js/player.js',
  './js/device.js',
  './js/layers.js',
  './js/nav.js',
  './js/keys.js',
  './js/ui/browse.js',
  './js/ui/watch.js',
  './js/ui/overlays.js',
  './js/ui/settings.js',
  './js/ui/logo.js',
  './js/ui/clock.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(STATIC_ASSETS.map((url) => new Request(url, { cache: 'no-cache' }))))
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
  const request = event.request;
  const url = new URL(request.url);

  // Never intercept cross-origin requests (stream playlists, .ts segments,
  // CDNs). They must go straight to the network.
  if (url.origin !== self.location.origin) return;
  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(new Request(request.url, { cache: 'no-cache', credentials: 'same-origin' }))
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          // Key by path (no query) so `main.js?v=6` or `./?tv=1` refresh the
          // same entry the install step precached: offline never mixes versions
          caches.open(CACHE_VERSION)
            .then((cache) => cache.put(new Request(url.origin + url.pathname), copy))
            .catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then((cached) => cached || (request.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
