const CACHE_NAME = "fantasy-draft-tool-v6-4-draft-flow";

const APP_SHELL = [
  "./",
  "./index.html",
  "./index-v6-4.html",
  "./styles-v6-4.css?v=6.4.0",
  "./app-v6-4.js?v=6.4.0",
  "./draft-brain-v6-4.json?v=6.4.0",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys.map((key) => key === CACHE_NAME ? Promise.resolve() : caches.delete(key))
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (!sameOrigin) {
    event.respondWith(fetch(event.request).catch(() => new Response("", { status: 504 })));
    return;
  }

  // Navigation: cache first so airplane mode opens instantly.
  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then((cached) => {
        return cached || fetch(event.request);
      })
    );
    return;
  }

  // App assets: cache first, with network refresh when available.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
