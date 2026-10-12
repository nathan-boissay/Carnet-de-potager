// ==========================================================================
// Service Worker — Carnet de Potager PWA
// Cycle de vie maîtrisé, Cache First (assets), Network First (navigation),
// Fallback hors-ligne (offline.html) et Background Sync.
// ==========================================================================

const CACHE_NAME = "potager-v2";

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/offline.html",
  "/manifest.json",
  "/potager.md",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "https://cdn.jsdelivr.net/npm/idb@8/build/umd.js"
];

// 1. Installation : mise en cache statique de l'App Shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // NOTE : Ne pas appeler self.skipWaiting() d'office ici afin de permettre
  // à l'utilisateur de valider la mise à jour via la bannière interactive.
});

// 2. Activation : purge des anciennes versions de caches et prise de contrôle
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Réception de messages (mise à jour maîtrisée)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// 4. Stratégie de routage et de cache (Fetch)
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Requêtes de navigation (pages HTML) : Network First avec fallback Cache puis offline.html
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match(event.request, { ignoreSearch: true });
        })
        .then((response) => {
          return response || caches.match("/offline.html");
        })
    );
    return;
  }

  // Ne pas intercepter les requêtes non GET ou d'autres schémas (ex: chrome-extension)
  if (event.request.method !== "GET" || !url.protocol.startsWith("http")) {
    return;
  }

  // Ressources statiques (CSS, JS, images, polices, CDN idb) : Cache First avec mise en cache dynamique
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === "opaque") {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch((err) => {
        // En cas d'erreur de chargement d'image hors-ligne, on peut renvoyer l'icône par défaut si c'est une image
        if (event.request.headers.get("accept")?.includes("image")) {
          return caches.match("/icons/icon-192.png");
        }
        throw err;
      });
    })
  );
});

// 5. Background Sync API (sync-plants)
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-plants") {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "BACKGROUND_SYNC_TRIGGERED" });
        });
      })
    );
  }
});

// 6. Gestion du clic sur une notification système
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow("/");
      }
    })
  );
});
