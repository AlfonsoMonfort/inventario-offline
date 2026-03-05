const CACHE_NAME = "inventario-cache-v5";

const urlsToCache = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./quagga.min.js",
  "./xlsx.full.min.js",
  "./icon-192.png",
  "./icon-512.png",
  "./equivalencias.json",
  "./referencias_sin_codigo_barras.json"
];

// --------------------
// INSTALL
// --------------------
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const url of urlsToCache) {
        try {
          await cache.add(url);
        } catch (err) {
          console.log("No se pudo cachear:", url);
        }
      }
    })
  );

  self.skipWaiting();
});

// --------------------
// ACTIVATE
// --------------------
self.addEventListener("activate", event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cache => {
            if (cache !== CACHE_NAME) {
              return caches.delete(cache);
            }
          })
        );
      }),
      self.clients.claim()
    ])
  );
});

// --------------------
// FETCH
// --------------------
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        return response;
      }

      return fetch(event.request).catch(() => {
        return caches.match("./index.html");
      });
    })
  );
});