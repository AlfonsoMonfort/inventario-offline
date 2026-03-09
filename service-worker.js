const CACHE_NAME = "inventario-cache-v1";

const urlsToCache = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./quagga.min.js",
  "./xlsx.full.min.js",
  "./jspdf.umd.min.js",
  "./JsBarcode.all.min.js",
  "./equivalencias.json",
  "./referencias_sin_codigo_barras.json",
  "./usuarios.json",
  "./icon-192.png",
  "./icon-512.png",
  "./wood_plank_flicks.ogg",
  "./beep_short.ogg",
  "./Logo_BAL_copy.png"
];


// INSTALL
self.addEventListener("install", event => {

  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {

      return Promise.all(
        urlsToCache.map(url => {
          return cache.add(url).catch(err => {
            console.log("No se pudo cachear:", url);
          });
        })
      );

    })
  );

});


// ACTIVATE
self.addEventListener("activate", event => {

  event.waitUntil(

    caches.keys().then(cacheNames => {
      return Promise.all(

        cacheNames.map(cache => {

          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }

        })

      );
    })

  );

  self.clients.claim();

});


// FETCH
self.addEventListener("fetch", event => {

  event.respondWith(

    caches.match(event.request).then(cachedResponse => {

      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then(networkResponse => {

        // 🚨 NO guardar respuestas parciales
        if (!networkResponse || networkResponse.status === 206) {
          return networkResponse;
        }

        return caches.open(CACHE_NAME).then(cache => {

          cache.put(event.request, networkResponse.clone());

          return networkResponse;

        });

      }).catch(() => {

        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }

      });

    })

  );

});