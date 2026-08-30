const CACHE_NAME = "fantasy-draft-tool-v6-5-1-first-load-fix";

const APP_SHELL = [
  "./",
  "./index.html",
  "./index-v6-5.html",
  "./styles-v6-5.css?v=6.5.0",
  "./app-v6-5.js?v=6.5.1",
  "./draft-brain-v6-5.json?v=6.5.1",
  "./draft-corrections-v6-5-1.json?v=20260829-1",
  "./draft-news-v6-5-1.json?v=20260829-1",
  "./draft-mock-intel-v6-5-1.json?v=20260829-1",
  "./manifest.json"
];

const REFRESH_URLS = [
  "./draft-corrections-v6-5-1.json?v=20260829-1",
  "./draft-news-v6-5-1.json?v=20260829-1",
  "./draft-mock-intel-v6-5-1.json?v=20260829-1"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (!key.startsWith("fantasy-draft-tool-")) return Promise.resolve();
      return key === CACHE_NAME ? Promise.resolve() : caches.delete(key);
    }));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: "window" });
    await Promise.all(clients.map((client) => client.navigate(client.url).catch(() => null)));
  })());
});

async function networkOrCache(input) {
  try {
    const response = await fetch(input, { cache: "no-store" });
    if (response && response.ok) return response;
  } catch (_) {}
  return caches.match(input);
}

async function mergedBrainResponse(request) {
  try {
    const [baseResponse, ...layerResponses] = await Promise.all([
      networkOrCache(request),
      ...REFRESH_URLS.map((url) => networkOrCache(url))
    ]);

    if (!baseResponse || layerResponses.some((response) => !response)) {
      const cached = await caches.match(request);
      return cached || new Response("Brain unavailable", { status: 503 });
    }

    const base = await baseResponse.json();
    const layers = await Promise.all(layerResponses.map((response) => response.json()));

    for (const layer of layers) {
      const overrides = layer.player_overrides || {};
      base.players = base.players.map((player) => ({ ...player, ...(overrides[player.name] || {}) }));
    }

    base.version = "1.2.1-transcript-refresh";
    base.as_of = "2026-08-29";
    base.latest_intel_refresh = {
      date: "2026-08-29",
      type: "TRANSCRIPT_RECONCILIATION",
      sources: layers.map((layer) => layer.source),
      rules: [
        "Yahoo ADP is unchanged by transcript mock-draft positions.",
        "our_rank and tier are unchanged in this refresh; rank-review flags are for Sept. 1 synthesis.",
        "Resolved contract/holdout notes do not create an injury or recommendation penalty."
      ]
    };

    return new Response(JSON.stringify(base), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (_) {
    const cached = await caches.match(request);
    return cached || new Response("Brain unavailable", { status: 503 });
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (!sameOrigin) {
    event.respondWith(fetch(event.request).catch(() => new Response("", { status: 504 })));
    return;
  }

  if (url.pathname.endsWith("/draft-brain-v6-5.json")) {
    event.respondWith(mergedBrainResponse(event.request));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", clone));
          }
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

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
