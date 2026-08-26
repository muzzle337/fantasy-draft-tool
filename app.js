const STORAGE_KEY = "fantasyDraftToolStateV2";
const TEAM_COUNT = 14;

let players = [];

let state = {
  draftedByOthers: [],
  myPlayers: [],
  history: [],
  selectedPosition: "ALL",
  showDrafted: false,
  searchTerm: "",
  draftSlot: null,
  activeView: "draftView"
};

let selectedPlayerId = null;

const el = (id) => document.getElementById(id);

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;

  try {
    state = { ...state, ...JSON.parse(saved) };
  } catch (error) {
    console.error("Could not load draft state.", error);
  }
}

async function loadPlayers() {
  try {
    const response = await fetch("./players.json", { cache: "no-store" });
    if (!response.ok) throw new Error("players.json failed to load");
    players = await response.json();
  } catch (error) {
    console.error(error);
    el("playerList").innerHTML =
      '<p class="muted">Player data could not load. Refresh once while online.</p>';
  }
}

function getPlayer(id) {
  return players.find((player) => player.id === id);
}

function isDrafted(id) {
  return state.draftedByOthers.includes(id) || state.myPlayers.includes(id);
}

function currentOverallPick() {
  return state.history.length + 1;
}

function currentRound() {
  return Math.floor((currentOverallPick() - 1) / TEAM_COUNT) + 1;
}

function pickForRound(round, slot) {
  const pickInRound = round % 2 === 1 ? slot : TEAM_COUNT + 1 - slot;
  return (round - 1) * TEAM_COUNT + pickInRound;
}

function nextMyPick() {
  if (!state.draftSlot) return null;

  const now = currentOverallPick();

  for (let round = currentRound(); round <= 30; round += 1) {
    const pick = pickForRound(round, state.draftSlot);
    if (pick >= now) return pick;
  }

  return null;
}

function injuryText(player) {
  const status = player.injuryStatus;
  if (!status || status === "healthy") return "";

  if (status === "questionable") {
    return player.expectedReturn ? `⚠ ${player.expectedReturn}` : "⚠ Q";
  }

  if (status === "out") return "OUT";
  if (status === "IR") return "IR";
  if (status === "PUP") return "PUP";
  return "⚠ Injury";
}

function tagClass(tag) {
  const value = tag.toLowerCase();
  if (value.includes("risk")) return "risk";
  if (value.includes("value")) return "value";
  if (value.includes("upside")) return "upside";
  if (value.includes("target")) return "target";
  if (value.includes("cliff")) return "cliff";
  return "";
}

function playerTagsHtml(player, extraTags = []) {
  const tags = [...(player.tags || []), ...extraTags];
  const injury = injuryText(player);

  if (injury) tags.push(injury);

  return tags
    .slice(0, 4)
    .map((tag) => {
      const injuryClass =
        tag.startsWith("⚠") || tag === "OUT" || tag === "IR" || tag === "PUP"
          ? "injury"
          : tagClass(tag);

      return `<span class="tag ${injuryClass}">${tag}</span>`;
    })
    .join("");
}

function playerButtonHtml(player, options = {}) {
  const drafted = isDrafted(player.id);
  const mine = state.myPlayers.includes(player.id);
  const extraTags = options.extraTags || [];

  return `
    <button
      type="button"
      class="player-row ${drafted ? "drafted-row" : ""}"
      data-open-player="${player.id}"
      ${drafted && !state.showDrafted ? "hidden" : ""}
      style="${drafted ? "opacity:.45;" : ""}"
    >
      <div class="player-main">
        <div class="player-name">
          ${player.name}${mine ? " ★" : ""}
        </div>
        <div class="player-meta">
          ${player.position} · ${player.team} · Tier ${player.tier} · ${player.position}#${player.positionRank}
        </div>
        <div class="player-tags">${playerTagsHtml(player, extraTags)}</div>
      </div>
      <div class="player-rank">#${player.overallRank}</div>
    </button>
  `;
}

function bindPlayerButtons(container) {
  container.querySelectorAll("[data-open-player]").forEach((button) => {
    button.addEventListener("click", () => {
      openPlayerModal(button.dataset.openPlayer);
    });
  });
}

function matchesSearch(player) {
  const term = state.searchTerm.trim().toLowerCase();
  if (!term) return true;

  const haystack = [
    player.name,
    player.team,
    player.position,
    ...(player.aliases || [])
  ]
    .join(" ")
    .toLowerCase();

  const compactTerm = term.replace(/\s+/g, "");
  const initials = player.name
    .split(/\s+/)
    .map((part) => part[0] || "")
    .join("")
    .toLowerCase();

  return haystack.includes(term) || initials.includes(compactTerm);
}

function matchesPosition(player) {
  return state.selectedPosition === "ALL" || player.position === state.selectedPosition;
}

function availablePlayers() {
  return players.filter((player) => !isDrafted(player.id));
}

function filteredAvailablePlayers() {
  return availablePlayers().filter(matchesPosition);
}

function renderSearchResults() {
  const card = el("searchResultsCard");
  const resultsEl = el("searchResults");
  const term = state.searchTerm.trim();

  if (!term) {
    card.classList.add("hidden");
    return;
  }

  const matches = players
    .filter(matchesSearch)
    .filter(matchesPosition)
    .filter((player) => state.showDrafted || !isDrafted(player.id))
    .sort((a, b) => a.overallRank - b.overallRank)
    .slice(0, 12);

  el("searchResultCount").textContent = `${matches.length} found`;
  resultsEl.innerHTML = matches.length
    ? matches.map((player) => playerButtonHtml(player)).join("")
    : '<p class="muted">No players found.</p>';

  card.classList.remove("hidden");
  bindPlayerButtons(resultsEl);
}

function renderPlayerBoard() {
  const board = players
    .filter(matchesSearch)
    .filter(matchesPosition)
    .filter((player) => state.showDrafted || !isDrafted(player.id))
    .sort((a, b) => a.overallRank - b.overallRank);

  el("playerList").innerHTML = board.length
    ? board.map((player) => playerButtonHtml(player)).join("")
    : '<p class="muted">No players found.</p>';

  bindPlayerButtons(el("playerList"));
}

function tierRemaining(player) {
  return availablePlayers().filter(
    (candidate) =>
      candidate.position === player.position && candidate.tier === player.tier
  ).length;
}

function recommendationScore(player) {
  let score = 320 - player.overallRank;
  const round = currentRound();
  const myRoster = state.myPlayers.map(getPlayer).filter(Boolean);

  const counts = myRoster.reduce((acc, item) => {
    acc[item.position] = (acc[item.position] || 0) + 1;
    return acc;
  }, {});

  if ((player.tags || []).includes("VALUE")) score += 22;
  if ((player.tags || []).includes("UPSIDE")) score += 14;
  if ((player.tags || []).includes("TARGET")) score += 12;
  if ((player.tags || []).includes("SAFE")) score += round <= 5 ? 8 : 3;
  if ((player.tags || []).includes("RISK")) score -= 8;

  if (player.position === "RB") {
    score += 10;
    if ((counts.RB || 0) < 2) score += 18;
  }

  if (player.position === "WR" && (counts.WR || 0) < 2) score += 12;
  if (player.position === "QB" && !(counts.QB || 0) && round >= 6) score += 8;
  if (player.position === "TE" && !(counts.TE || 0) && round >= 6) score += 6;

  const remaining = tierRemaining(player);
  if (remaining === 1) score += 25;
  else if (remaining === 2) score += 17;
  else if (remaining === 3) score += 9;

  if (player.position === "DEF" || player.position === "K") {
    if (round < 12) score -= 100;
    else score -= 15;
  }

  const injury = player.injuryStatus;
  if (injury === "questionable") score -= 6;
  if (injury === "out") score -= 25;
  if (injury === "IR" || injury === "PUP") score -= 45;

  if (player.adp) {
    const now = currentOverallPick();
    const valueGap = now - player.adp;
    if (valueGap > 12) score += 18;
    else if (valueGap > 5) score += 8;
    else if (valueGap < -20) score -= 18;
  }

  return score;
}

function recommendationReason(player) {
  const pieces = [];
  const remaining = tierRemaining(player);
  const myRoster = state.myPlayers.map(getPlayer).filter(Boolean);
  const count = myRoster.filter((p) => p.position === player.position).length;

  if (remaining <= 2) {
    pieces.push(`Only ${remaining} ${player.position}${remaining === 1 ? "" : "s"} remain in this tier.`);
  }

  if (player.position === "RB" && count < 2) {
    pieces.push("RB scarcity matters in this 14-team league.");
  } else if (player.position === "WR" && count < 2) {
    pieces.push("Adds a starting WR while volume still matters.");
  } else if ((player.tags || []).includes("VALUE")) {
    pieces.push("Our value is stronger than the current market price.");
  } else if ((player.tags || []).includes("UPSIDE")) {
    pieces.push("Offers meaningful upside at this point in the draft.");
  }

  if (!pieces.length) {
    pieces.push(player.thesis || "Strong combination of rank, tier and roster fit.");
  }

  return pieces.slice(0, 2).join(" ");
}

function renderRecommendations() {
  const recommendations = availablePlayers()
    .map((player) => ({ ...player, score: recommendationScore(player) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  el("recommendationContext").textContent = `Pick ${currentOverallPick()}`;

  if (!recommendations.length) {
    el("recommendationPanel").innerHTML =
      '<p class="muted">No recommendations available.</p>';
    return;
  }

  el("recommendationPanel").innerHTML = recommendations
    .map((player, index) => {
      const cliff = tierRemaining(player) <= 2 ? ["CLIFF"] : [];

      return `
        <button
          type="button"
          class="recommendation-row ${index === 0 ? "top-pick" : ""}"
          data-open-player="${player.id}"
        >
          <div class="recommendation-rank">${index + 1}</div>
          <div class="player-main">
            <div class="player-name">${player.name} — ${player.position}</div>
            <div class="player-tags">${playerTagsHtml(player, cliff)}</div>
            <p class="recommendation-reason">${recommendationReason(player)}</p>
          </div>
          <div class="player-rank">#${player.overallRank}</div>
        </button>
      `;
    })
    .join("");

  bindPlayerButtons(el("recommendationPanel"));
}

function renderCliffs() {
  const positionOrder = ["RB", "WR", "TE", "QB"];
  const warnings = [];

  for (const position of positionOrder) {
    const available = availablePlayers()
      .filter((player) => player.position === position)
      .sort((a, b) => a.overallRank - b.overallRank);

    if (!available.length) continue;

    const best = available[0];
    const sameTier = available.filter((p) => p.tier === best.tier);

    if (sameTier.length <= 2) {
      warnings.push({
        position,
        tier: best.tier,
        count: sameTier.length,
        names: sameTier.map((p) => p.name).join(" and ")
      });
    }
  }

  if (!warnings.length) {
    el("cliffCard").classList.add("hidden");
    return;
  }

  const warning = warnings[0];
  el("cliffPanel").innerHTML = `
    <p class="cliff-title">⚠ ${warning.position} CLIFF</p>
    <p class="cliff-copy">
      ${warning.count} player${warning.count === 1 ? "" : "s"} remain in the top available Tier ${warning.tier}: ${warning.names}.
    </p>
  `;
  el("cliffCard").classList.remove("hidden");
}

function renderBestAvailable() {
  const list = filteredAvailablePlayers()
    .sort((a, b) => a.overallRank - b.overallRank)
    .slice(0, 8);

  el("bestAvailableContext").textContent = state.selectedPosition;

  el("bestAvailableList").innerHTML = list.length
    ? list.map((player) => playerButtonHtml(player)).join("")
    : '<p class="muted">No players remaining in this filter.</p>';

  bindPlayerButtons(el("bestAvailableList"));
}

function rosterCounts() {
  const roster = state.myPlayers.map(getPlayer).filter(Boolean);
  return roster.reduce((acc, player) => {
    acc[player.position] = (acc[player.position] || 0) + 1;
    return acc;
  }, {});
}

function renderRosterSummary() {
  const counts = rosterCounts();
  const starterNeeds = [
    ["QB", counts.QB || 0, 1],
    ["RB", counts.RB || 0, 2],
    ["WR", counts.WR || 0, 2],
    ["TE", counts.TE || 0, 1],
    ["FLEX", Math.max(0, (counts.RB || 0) + (counts.WR || 0) + (counts.TE || 0) - 5), 1],
    ["DEF", counts.DEF || 0, 1],
    ["K", counts.K || 0, 1]
  ];

  el("rosterSummary").innerHTML = starterNeeds
    .map(([label, count, need]) => `
      <div class="roster-slot">
        <span class="roster-slot-label">${label}</span>
        <span class="roster-slot-value">${Math.min(count, need)}/${need}</span>
      </div>
    `)
    .join("");
}

function renderMyRoster() {
  const roster = state.myPlayers.map(getPlayer).filter(Boolean);
  el("teamPickCount").textContent = `${roster.length} Pick${roster.length === 1 ? "" : "s"}`;

  if (!roster.length) {
    el("myRoster").innerHTML = '<p class="muted">No players drafted yet.</p>';
    renderRosterSummary();
    return;
  }

  el("myRoster").innerHTML = roster
    .map((player) => playerButtonHtml(player))
    .join("");

  bindPlayerButtons(el("myRoster"));
  renderRosterSummary();
}

function renderDraftStatus() {
  const round = currentRound();
  const nextPick = nextMyPick();

  el("draftSlotDisplay").textContent = state.draftSlot ? `#${state.draftSlot}` : "Set Slot";
  el("roundDisplay").textContent = round;
  el("nextPickDisplay").textContent = nextPick || "—";

  if (!nextPick) {
    el("picksAwayDisplay").textContent = "—";
  } else {
    el("picksAwayDisplay").textContent = Math.max(0, nextPick - currentOverallPick());
  }
}

function openPlayerModal(playerId) {
  const player = getPlayer(playerId);
  if (!player) return;

  selectedPlayerId = playerId;

  const remaining = tierRemaining(player);
  const status = injuryText(player);

  el("modalPlayerContent").innerHTML = `
    <p class="eyebrow">${player.position} · ${player.team}</p>
    <h2 style="padding-right:42px;">${player.name}</h2>
    <p class="player-meta" style="margin-top:6px;">
      Overall #${player.overallRank} · ${player.position}#${player.positionRank} · Tier ${player.tier}
      ${player.adp ? ` · ADP ${player.adp}` : ""}
    </p>
    <div class="player-tags">${playerTagsHtml(player, remaining <= 2 ? ["CLIFF"] : [])}</div>
    <p style="font-size:13px;line-height:1.45;margin-bottom:0;">
      ${player.thesis || ""}
    </p>
    ${status ? `<p style="font-size:12px;color:#c7342e;"><strong>Health:</strong> ${status}</p>` : ""}
  `;

  const unavailable = isDrafted(playerId);
  el("draftedByOtherButton").disabled = unavailable;
  el("myPickButton").disabled = unavailable;

  el("playerModal").classList.remove("hidden");
}

function closePlayerModal() {
  el("playerModal").classList.add("hidden");
  selectedPlayerId = null;
}

function openSlotModal() {
  el("draftSlotGrid").innerHTML = Array.from({ length: TEAM_COUNT }, (_, index) => {
    const slot = index + 1;
    return `
      <button
        type="button"
        class="slot-button ${state.draftSlot === slot ? "selected" : ""}"
        data-slot="${slot}"
      >
        ${slot}
      </button>
    `;
  }).join("");

  el("draftSlotGrid").querySelectorAll("[data-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      state.draftSlot = Number(button.dataset.slot);
      saveState();
      closeSlotModal();
      renderAll();
    });
  });

  el("slotModal").classList.remove("hidden");
}

function closeSlotModal() {
  el("slotModal").classList.add("hidden");
}

function recordAction(action) {
  state.history.push(action);
  saveState();
}

function markDraftedByOther(playerId) {
  if (isDrafted(playerId)) return;

  state.draftedByOthers.push(playerId);
  recordAction({ type: "draftedByOther", playerId });
  closePlayerModal();
  renderAll();
}

function markMyPick(playerId) {
  if (isDrafted(playerId)) return;

  state.myPlayers.push(playerId);
  recordAction({ type: "myPick", playerId });
  closePlayerModal();
  renderAll();
}

function undoLastAction() {
  const action = state.history.pop();
  if (!action) return;

  if (action.type === "draftedByOther") {
    state.draftedByOthers = state.draftedByOthers.filter((id) => id !== action.playerId);
  }

  if (action.type === "myPick") {
    state.myPlayers = state.myPlayers.filter((id) => id !== action.playerId);
  }

  saveState();
  renderAll();
}

function setActiveView(viewId) {
  state.activeView = viewId;

  document.querySelectorAll(".app-view").forEach((view) => {
    view.classList.toggle("active", view.id === viewId);
  });

  document.querySelectorAll(".bottom-nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewId);
  });

  saveState();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function renderAll() {
  renderDraftStatus();
  renderSearchResults();
  renderRecommendations();
  renderCliffs();
  renderBestAvailable();
  renderPlayerBoard();
  renderMyRoster();
  setActiveView(state.activeView || "draftView");
}

function bindStaticEvents() {
  el("playerSearch").addEventListener("input", (event) => {
    state.searchTerm = event.target.value;
    saveState();
    renderSearchResults();
    renderPlayerBoard();
  });

  el("showDraftedToggle").addEventListener("change", (event) => {
    state.showDrafted = event.target.checked;
    saveState();
    renderSearchResults();
    renderPlayerBoard();
  });

  document.querySelectorAll(".filter-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedPosition = button.dataset.position;

      document.querySelectorAll(".filter-button").forEach((item) => {
        item.classList.toggle("active", item === button);
      });

      saveState();
      renderSearchResults();
      renderBestAvailable();
      renderPlayerBoard();
    });
  });

  document.querySelectorAll(".bottom-nav-button").forEach((button) => {
    button.addEventListener("click", () => setActiveView(button.dataset.view));
  });

  el("undoButton").addEventListener("click", undoLastAction);
  el("setDraftSlotButton").addEventListener("click", openSlotModal);

  el("draftedByOtherButton").addEventListener("click", () => {
    if (selectedPlayerId) markDraftedByOther(selectedPlayerId);
  });

  el("myPickButton").addEventListener("click", () => {
    if (selectedPlayerId) markMyPick(selectedPlayerId);
  });

  document.querySelectorAll("[data-close-player-modal]").forEach((node) => {
    node.addEventListener("click", closePlayerModal);
  });

  document.querySelectorAll("[data-close-slot-modal]").forEach((node) => {
    node.addEventListener("click", closeSlotModal);
  });
}

async function init() {
  loadState();
  await loadPlayers();

  el("playerSearch").value = state.searchTerm || "";
  el("showDraftedToggle").checked = Boolean(state.showDrafted);

  document.querySelectorAll(".filter-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.position === state.selectedPosition);
  });

  bindStaticEvents();
  renderAll();
}

init();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  });
}
