const CACHE_NAME = "inventario-cache-v18";

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
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );

  // 🔥 Fuerza activación inmediata
  self.skipWaiting();
});

// --------------------
// ACTIVATE
// --------------------
self.addEventListener("activate", event => {
  event.waitUntil(
    Promise.all([
      // Borra versiones antiguas
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cache => {
            if (cache !== CACHE_NAME) {
              return caches.delete(cache);
            }
          })
        );
      }),
      // 🔥 Toma control inmediato
      self.clients.claim()
    ])
  );
});


// --------------------
// FETCH
// --------------------
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});