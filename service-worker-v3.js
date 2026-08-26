const CACHE_NAME = "fantasy-draft-tool-v3";

const APP_ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=3.0.0",
  "./app.js?v=3.0.0",
  "./players.json?v=3.0.0",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((names) =>
        Promise.all(
          names.map((name) => {
            if (name !== CACHE_NAME) return caches.delete(name);
          })
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Always prefer network for app code/data so GitHub updates appear immediately.
  const isCoreAsset =
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/styles.css") ||
    url.pathname.endsWith("/players.json") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/");

  if (isCoreAsset) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
