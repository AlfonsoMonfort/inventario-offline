const CACHE_NAME = "inventario-cache-v1";

const urlsToCache = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./xlsx.full.min.js",
  "./jspdf.umd.min.js",
  "./JsBarcode.all.min.js",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const url of urlsToCache) {
        try {
          await cache.add(url);
          console.log("Cache OK:", url);
        } catch (e) {
          console.log("Cache ERROR:", url);
        }
      }
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );

  self.clients.claim();
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request))
  );
});