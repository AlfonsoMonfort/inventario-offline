const CACHE_NAME = "inventario-offline-v5";

const urlsToCache = [
  "/",
  "/index.html",
  "/manifest.json",
  "/app.js",
  "/quagga.min.js",
  "/xlsx.full.min.js"
];

self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener("fetch", function(event) {
  event.respondWith(
    caches.match(event.request).then(function(response) {
      return response || fetch(event.request);
    })
  );
});