const CACHE_NAME = "inventario-cache-v2";

const urlsToCache = [
  "/",
  "/index.html",
  "/app.js",
  "/manifest.json",
  "/quagga.min.js",
  "/xlsx.full.min.js",
  "/jspdf.umd.min.js",
  "/JsBarcode.all.min.js",
  "/equivalencias.json",
  "/referencias_sin_codigo_barras.json",
  "/usuarios.json",
  "/icon-192.png",
  "/icon-512.png",
  "/wood_plank_flicks.ogg",
  "/beep_short.ogg",
  "/Logo_BAL_copy.png"
];


// INSTALL
self.addEventListener("install", event => {

  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );

});


// ACTIVATE
self.addEventListener("activate", event => {

  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );

  self.clients.claim();

});


// FETCH
self.addEventListener("fetch", event => {

  const request = event.request;

  // dejar pasar peticiones parciales (audio/video)
  if (request.headers.get("range")) {
    return;
  }

  event.respondWith(

    caches.match(request).then(response => {

      if (response) {
        return response;
      }

      return fetch(request).then(networkResponse => {

        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        const clone = networkResponse.clone();

        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, clone);
        });

        return networkResponse;

      }).catch(() => {

        if (request.mode === "navigate") {
          return caches.match("/index.html");
        }

      });

    })

  );

});