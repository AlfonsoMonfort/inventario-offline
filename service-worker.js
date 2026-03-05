const CACHE_NAME = "inventario-cache-v5";

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
  "./equivalencias.xlsx",

  "./icon-192.png",
  "./icon-512.png",
  "./Logo_BAL_copy.png",

  "./wood_plank_flicks.ogg",
  "./beep_short.ogg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const url of urlsToCache) {
        try {
          await cache.add(url);
        } catch (e) {
          console.log("Error cacheando:", url);
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