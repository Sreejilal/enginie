// Keeps Enginie working offline, such as in a garage with no signal. It always tries the network
// first so that updates arrive straight away, and falls back to the saved copy when offline.

const CACHE = 'enginie-v2';
const FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'icon.svg',
  'data/sound-database.json',
  'js/app.js',
  'js/audio.js',
  'js/cost.js',
  'js/features.js',
  'js/match.js',
  'js/motion.js',
  'js/prints.js',
  'js/shared.js',
  'js/store.js',
  'js/synth.js',
  'js/data/engines.js',
  'js/data/faults.js',
  'js/data/symptoms.js',
  'js/views/about.js',
  'js/views/engines.js',
  'js/views/help.js',
  'js/views/home.js',
  'js/views/library.js',
  'js/views/ticket.js',
  'fonts/Barlow-400.woff2',
  'fonts/Barlow-500.woff2',
  'fonts/Barlow-600.woff2',
  'fonts/BarlowCondensed-700.woff2',
  'fonts/BarlowCondensed-800.woff2',
  'fonts/CourierPrime-400.woff2',
  'fonts/CourierPrime-700.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? caches.match('index.html'))),
  );
});
