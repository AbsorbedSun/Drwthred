var CACHE_NAME = 'drwthred-v37-local';
var URLS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/core-scene-setup.js',
  './js/local-plane-gizmo.js',
  './js/rendering-strokes.js',
  './js/input-gestures.js',
  './js/pages-views-io.js',
  './js/record-surface-gizmo.js',
  './js/stroke-gizmo.js',
  './js/loft-primitives.js',
  './js/navigation-controls.js',
  './js/narrow-ui-bindings.js',
  './js/sidecol-floatcard.js',
  './js/selection-ruler.js',
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(resp) {
        if (resp && resp.status === 200 && (resp.type === 'basic' || resp.type === 'cors')) {
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return resp;
      });
    })
  );
});
