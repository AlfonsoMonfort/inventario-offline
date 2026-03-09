const CACHE_NAME = "inventario-cache-v3";

const urlsToCache = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./quagga.min.js",
  "./xlsx.full.min.js",
  "./jspdf.umd.min.js",
  "./JsBarcode.all.min.js",
  "./icon-192.png",
  "./icon-512.png",
  "./equivalencias.json",
  "./referencias_sin_codigo_barras.json",
  "./usuarios.json",
  "./wood_plank_flicks.ogg",
  "./beep_short.ogg",
  "./Logo_BAL_copy.png"
];

// INSTALL
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );

  self.skipWaiting();
});

// ACTIVATE
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

// FETCH
self.addEventListener("fetch", event => {

  event.respondWith(

    caches.match(event.request).then(response => {

      if (response) {
        return response;
      }

      return fetch(event.request).catch(() => {

        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }

      });

    })

  );

});