const samplePlayers = [
  {
    id: "justin-jefferson",
    name: "Justin Jefferson",
    position: "WR",
    team: "MIN",
    overallRank: 1,
    positionRank: 1,
    tier: 1,
    tags: ["SAFE", "UPSIDE"],
    thesis: "Elite target volume and elite PPR floor.",
    injuryStatus: "healthy"
  },
  {
    id: "bijan-robinson",
    name: "Bijan Robinson",
    position: "RB",
    team: "ATL",
    overallRank: 2,
    positionRank: 1,
    tier: 1,
    tags: ["UPSIDE", "SAFE"],
    thesis: "Three-down ceiling with strong receiving value.",
    injuryStatus: "healthy"
  },
  {
    id: "jamarr-chase",
    name: "Ja'Marr Chase",
    position: "WR",
    team: "CIN",
    overallRank: 3,
    positionRank: 2,
    tier: 1,
    tags: ["UPSIDE", "SAFE"],
    thesis: "Elite target and touchdown ceiling.",
    injuryStatus: "healthy"
  },
  {
    id: "saquon-barkley",
    name: "Saquon Barkley",
    position: "RB",
    team: "PHI",
    overallRank: 4,
    positionRank: 2,
    tier: 1,
    tags: ["SAFE", "RISK"],
    thesis: "Elite offense and workload, with age and workload risk.",
    injuryStatus: "healthy"
  },
  {
    id: "garrett-wilson",
    name: "Garrett Wilson",
    position: "WR",
    team: "NYJ",
    overallRank: 12,
    positionRank: 6,
    tier: 2,
    tags: ["UPSIDE", "VALUE"],
    thesis: "High target-share ceiling at a potentially discounted price.",
    injuryStatus: "healthy"
  },
  {
    id: "jonathan-brooks",
    name: "Jonathan Brooks",
    position: "RB",
    team: "CAR",
    overallRank: 38,
    positionRank: 16,
    tier: 4,
    tags: ["UPSIDE", "VALUE", "TARGET"],
    thesis: "Receiving upside with a realistic lead-back path.",
    injuryStatus: "questionable"
  },
  {
    id: "quentin-johnston",
    name: "Quentin Johnston",
    position: "WR",
    team: "LAC",
    overallRank: 54,
    positionRank: 28,
    tier: 5,
    tags: ["UPSIDE", "VALUE", "TARGET"],
    thesis: "Role and target profile may be stronger than market price.",
    injuryStatus: "healthy",
    aliases: ["qj"]
  },
  {
    id: "jayden-daniels",
    name: "Jayden Daniels",
    position: "QB",
    team: "WAS",
    overallRank: 45,
    positionRank: 3,
    tier: 2,
    tags: ["UPSIDE", "RISK"],
    thesis: "Rushing creates elite fantasy ceiling in four-point passing TD formats.",
    injuryStatus: "healthy"
  },
  {
    id: "brock-bowers",
    name: "Brock Bowers",
    position: "TE",
    team: "LV",
    overallRank: 28,
    positionRank: 1,
    tier: 1,
    tags: ["SAFE", "UPSIDE"],
    thesis: "Difference-making target volume at tight end.",
    injuryStatus: "healthy"
  },
  {
    id: "denver-defense",
    name: "Denver Broncos",
    position: "DEF",
    team: "DEN",
    overallRank: 165,
    positionRank: 1,
    tier: 1,
    tags: ["SAFE"],
    thesis: "Strong late-round defense target.",
    injuryStatus: "healthy"
  },
  {
    id: "brandon-aubrey",
    name: "Brandon Aubrey",
    position: "K",
    team: "DAL",
    overallRank: 175,
    positionRank: 1,
    tier: 1,
    tags: ["SAFE"],
    thesis: "High-upside kicker in a strong scoring environment.",
    injuryStatus: "healthy"
  }
];

const STORAGE_KEY = "fantasyDraftToolStateV1";

let state = {
  draftedByOthers: [],
  myPlayers: [],
  history: [],
  selectedPosition: "ALL",
  showDrafted: false,
  searchTerm: "",
  draftSlot: null
};

let selectedPlayerId = null;

const playerList = document.getElementById("playerList");
const bestAvailableList = document.getElementById("bestAvailableList");
const myRoster = document.getElementById("myRoster");
const recommendationPanel = document.getElementById("recommendationPanel");
const playerSearch = document.getElementById("playerSearch");
const showDraftedToggle = document.getElementById("showDraftedToggle");
const undoButton = document.getElementById("undoButton");
const modal = document.getElementById("playerModal");
const modalPlayerContent = document.getElementById("modalPlayerContent");
const draftedByOtherButton = document.getElementById("draftedByOtherButton");
const myPickButton = document.getElementById("myPickButton");

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) return;

  try {
    const parsed = JSON.parse(saved);
    state = { ...state, ...parsed };
  } catch (error) {
    console.error("Could not load saved draft state.", error);
  }
}

function isDrafted(playerId) {
  return (
    state.draftedByOthers.includes(playerId) ||
    state.myPlayers.includes(playerId)
  );
}

function getPlayer(playerId) {
  return samplePlayers.find((player) => player.id === playerId);
}

function injuryLabel(status) {
  if (!status || status === "healthy") return "";
  if (status === "questionable") return "⚠ Q";
  if (status === "out") return "OUT";
  if (status === "IR") return "IR";
  if (status === "PUP") return "PUP";
  return "⚠";
}

function matchesSearch(player) {
  const term = state.searchTerm.trim().toLowerCase();

  if (!term) return true;

  const nameMatch = player.name.toLowerCase().includes(term);
  const teamMatch = player.team.toLowerCase().includes(term);
  const positionMatch = player.position.toLowerCase().includes(term);

  const aliasMatch =
    player.aliases &&
    player.aliases.some((alias) => alias.toLowerCase().includes(term));

  return nameMatch || teamMatch || positionMatch || aliasMatch;
}

function matchesPosition(player) {
  return (
    state.selectedPosition === "ALL" ||
    player.position === state.selectedPosition
  );
}

function getVisiblePlayers() {
  return samplePlayers
    .filter(matchesSearch)
    .filter(matchesPosition)
    .filter((player) => state.showDrafted || !isDrafted(player.id))
    .sort((a, b) => a.overallRank - b.overallRank);
}

function playerRowHtml(player) {
  const drafted = isDrafted(player.id);
  const mine = state.myPlayers.includes(player.id);

  return `
    <div
      class="player-row"
      data-player-id="${player.id}"
      style="${drafted ? "opacity:0.45;" : ""}"
    >
      <div class="player-main">
        <div class="player-name">
          ${player.name}
          ${mine ? "⭐" : ""}
        </div>

        <div class="player-meta">
          ${player.position} · ${player.team} · Tier ${player.tier}
          ${injuryLabel(player.injuryStatus)}
        </div>

        <div class="player-tags">
          ${player.tags
            .map((tag) => `<span class="tag">${tag}</span>`)
            .join("")}
        </div>
      </div>

      <div class="player-rank">
        #${player.overallRank}
      </div>
    </div>
  `;
}

function renderPlayerBoard() {
  const players = getVisiblePlayers();

  if (!players.length) {
    playerList.innerHTML = `<p class="muted">No players found.</p>`;
    return;
  }

  playerList.innerHTML = players.map(playerRowHtml).join("");

  document.querySelectorAll("[data-player-id]").forEach((row) => {
    row.addEventListener("click", () => {
      openPlayerModal(row.dataset.playerId);
    });
  });
}

function renderBestAvailable() {
  const available = samplePlayers
    .filter((player) => !isDrafted(player.id))
    .sort((a, b) => a.overallRank - b.overallRank)
    .slice(0, 8);

  if (!available.length) {
    bestAvailableList.innerHTML = `<p class="muted">No players remaining.</p>`;
    return;
  }

  bestAvailableList.innerHTML = available.map(playerRowHtml).join("");
}

function renderMyRoster() {
  const roster = state.myPlayers
    .map(getPlayer)
    .filter(Boolean);

  if (!roster.length) {
    myRoster.innerHTML = `<p class="muted">No players drafted yet.</p>`;
    return;
  }

  const positionOrder = ["QB", "RB", "WR", "TE", "DEF", "K"];

  const rosterHtml = positionOrder
    .map((position) => {
      const players = roster.filter(
        (player) => player.position === position
      );

      if (!players.length) return "";

      return `
        <div style="margin-bottom:12px;">
          <strong>${position}</strong>
          ${players
            .map(
              (player) =>
                `<div style="margin-top:4px;">${player.name}</div>`
            )
            .join("")}
        </div>
      `;
    })
    .join("");

  myRoster.innerHTML = rosterHtml;
}

function recommendationScore(player) {
  let score = 300 - player.overallRank;

  if (player.tags.includes("VALUE")) score += 20;
  if (player.tags.includes("UPSIDE")) score += 12;
  if (player.tags.includes("SAFE")) score += 6;
  if (player.tags.includes("TARGET")) score += 10;
  if (player.tags.includes("RISK")) score -= 8;

  if (player.position === "RB") score += 10;
  if (player.position === "K") score -= 60;
  if (player.position === "DEF") score -= 55;

  if (
    player.injuryStatus === "IR" ||
    player.injuryStatus === "PUP"
  ) {
    score -= 50;
  }

  return score;
}

function renderRecommendation() {
  const recommendations = samplePlayers
    .filter((player) => !isDrafted(player.id))
    .map((player) => ({
      ...player,
      recommendationScore: recommendationScore(player)
    }))
    .sort((a, b) => b.recommendationScore - a.recommendationScore)
    .slice(0, 3);

  if (!recommendations.length) {
    recommendationPanel.innerHTML = `<p class="muted">No recommendations available.</p>`;
    return;
  }

  recommendationPanel.innerHTML = recommendations
    .map(
      (player, index) => `
        <div style="padding:10px 0;border-bottom:1px solid #eee;">
          <strong>${index + 1}. ${player.name} — ${player.position}</strong>

          <div class="player-tags" style="margin-top:6px;">
            ${player.tags
              .map((tag) => `<span class="tag">${tag}</span>`)
              .join("")}
          </div>

          <p style="margin:7px 0 0;font-size:13px;line-height:1.35;">
            ${player.thesis}
          </p>
        </div>
      `
    )
    .join("");
}

function openPlayerModal(playerId) {
  const player = getPlayer(playerId);
  if (!player) return;

  selectedPlayerId = playerId;

  modalPlayerContent.innerHTML = `
    <h2 style="padding-right:40px;">${player.name}</h2>

    <p class="player-meta">
      ${player.position} · ${player.team} · Tier ${player.tier} · Rank #${player.overallRank}
    </p>

    <div class="player-tags">
      ${player.tags
        .map((tag) => `<span class="tag">${tag}</span>`)
        .join("")}
    </div>

    <p style="line-height:1.45;">
      ${player.thesis}
    </p>
  `;

  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  selectedPlayerId = null;
}

function recordAction(action) {
  state.history.push(action);
  saveState();
}

function markDraftedByOther(playerId) {
  if (isDrafted(playerId)) return;

  state.draftedByOthers.push(playerId);

  recordAction({
    type: "draftedByOther",
    playerId
  });

  closeModal();
  renderAll();
}

function markMyPick(playerId) {
  if (isDrafted(playerId)) return;

  state.myPlayers.push(playerId);

  recordAction({
    type: "myPick",
    playerId
  });

  closeModal();
  renderAll();
}

function undoLastAction() {
  const action = state.history.pop();

  if (!action) return;

  if (action.type === "draftedByOther") {
    state.draftedByOthers = state.draftedByOthers.filter(
      (id) => id !== action.playerId
    );
  }

  if (action.type === "myPick") {
    state.myPlayers = state.myPlayers.filter(
      (id) => id !== action.playerId
    );
  }

  saveState();
  renderAll();
}

function renderAll() {
  renderPlayerBoard();
  renderBestAvailable();
  renderMyRoster();
  renderRecommendation();
}

playerSearch.addEventListener("input", (event) => {
  state.searchTerm = event.target.value;
  saveState();
  renderPlayerBoard();
});

showDraftedToggle.addEventListener("change", (event) => {
  state.showDrafted = event.target.checked;
  saveState();
  renderPlayerBoard();
});

document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    state.selectedPosition = button.dataset.position;

    document
      .querySelectorAll(".filter-button")
      .forEach((btn) => btn.classList.remove("active"));

    button.classList.add("active");

    saveState();
    renderPlayerBoard();
  });
});

undoButton.addEventListener("click", undoLastAction);

draftedByOtherButton.addEventListener("click", () => {
  if (selectedPlayerId) {
    markDraftedByOther(selectedPlayerId);
  }
});

myPickButton.addEventListener("click", () => {
  if (selectedPlayerId) {
    markMyPick(selectedPlayerId);
  }
});

document.querySelectorAll("[data-close-modal]").forEach((element) => {
  element.addEventListener("click", closeModal);
});

loadState();

playerSearch.value = state.searchTerm;
showDraftedToggle.checked = state.showDrafted;

document.querySelectorAll(".filter-button").forEach((button) => {
  button.classList.toggle(
    "active",
    button.dataset.position === state.selectedPosition
  );
});

renderAll();
