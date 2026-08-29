(() => {
  const originalFetch = window.fetch.bind(window);
  const BASE_BRAIN_MATCH = "draft-brain-v6-5.json";
  const REFRESH_URLS = [
    "./draft-corrections-v6-5-1.json?v=20260829-1",
    "./draft-news-v6-5-1.json?v=20260829-1",
    "./draft-mock-intel-v6-5-1.json?v=20260829-1"
  ];

  function requestUrl(input) {
    if (typeof input === "string") return input;
    if (input && typeof input.url === "string") return input.url;
    return "";
  }

  function applyLayer(base, layer) {
    const overrides = layer?.player_overrides || {};
    base.players = base.players.map((player) => ({ ...player, ...(overrides[player.name] || {}) }));
    return base;
  }

  window.fetch = async function(input, init) {
    const url = requestUrl(input);
    if (!url.includes(BASE_BRAIN_MATCH)) return originalFetch(input, init);

    const [baseResponse, ...layerResponses] = await Promise.all([
      originalFetch(input, init),
      ...REFRESH_URLS.map((url) => originalFetch(url, { cache: "no-store" }))
    ]);

    if (!baseResponse.ok || layerResponses.some((response) => !response.ok)) return baseResponse;

    const base = await baseResponse.clone().json();
    const layers = await Promise.all(layerResponses.map((response) => response.json()));
    for (const layer of layers) applyLayer(base, layer);

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
    base.draft_logic = base.draft_logic || {};
    base.draft_logic.core = Array.isArray(base.draft_logic.core) ? base.draft_logic.core : [];
    for (const note of [
      "Treat injury, contract, holdout and availability notes as time-sensitive. Resolved issues must not continue to penalize recommendations.",
      "Mock-draft pick positions are analyst/draft-room evidence only and must never be written into yahoo_adp."
    ]) {
      if (!base.draft_logic.core.includes(note)) base.draft_logic.core.push(note);
    }

    return new Response(JSON.stringify(base), {
      status: baseResponse.status,
      statusText: baseResponse.statusText,
      headers: { "Content-Type": "application/json" }
    });
  };
})();
