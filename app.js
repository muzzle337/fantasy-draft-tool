const BUILD_VERSION = "4.0.0";
const STORAGE_KEY = "fantasyDraftToolStateV4";
const PREVIOUS_STORAGE_KEYS = ["fantasyDraftToolStateV3", "fantasyDraftToolStateV2", "fantasyDraftToolStateV1"];
const BRAIN_URL = "./draft-brain.json?v=4.0.0";

let brainMeta = {};
let leagueStrategy = {};
let dstStreaming = new Map();
let kickerStreaming = new Map();
let players = [];
let selectedPlayerId = null;
let runtimeErrors = [];
let selfCheck = null;

let state = {
  draftedByOthers: [],
  myPlayers: [],
  history: [],
  selectedPosition: "ALL",
  showDrafted: false,
  searchTerm: "",
  draftSlot: null,
  activeView: "draftView",
  recentOpen: false
};

const el = (id) => document.getElementById(id);

function safeText(value, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizePosition(pos) {
  return pos === "DST" ? "DEF" : pos;
}

function parseTier(value) {
  const match = String(value || "").match(/(\d+)/);
  return match ? Number(match[1]) : 99;
}

function parseRoundStart(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).toUpperCase();
  if (text.includes("LATE") || text.includes("FINAL")) return 13;
  const nums = text.match(/\d+/g);
  if (!nums || !nums.length) return null;
  return Number(nums[0]);
}

function parseRoundEnd(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).toUpperCase();
  if (text.includes("LATE") || text.includes("FINAL")) return 15;
  const nums = text.match(/\d+/g);
  if (!nums || !nums.length) return null;
  return Number(nums[nums.length - 1]);
}

function searchAliases(name) {
  const parts = String(name).replace(/[.'’]/g, "").split(/\s+/).filter(Boolean);
  const initials = parts.map((part) => part[0]).join("").toLowerCase();
  const aliases = [initials];

  const suffixes = new Set(["jr", "sr", "ii", "iii", "iv"]);
  const withoutSuffix = parts.filter((part) => !suffixes.has(part.toLowerCase()));
  if (withoutSuffix.length >= 2) {
    aliases.push(withoutSuffix.map((part) => part[0]).join("").toLowerCase());
  }
  return [...new Set(aliases)];
}

function normalizePlayer(raw, index) {
  const position = normalizePosition(raw.pos);
  const idBase = slugify(raw.name) || `player-${index + 1}`;

  return {
    id: idBase,
    name: raw.name,
    team: raw.team,
    position,
    baselineRank: raw.baseline_rank,
    baselinePositionRank: raw.baseline_pos_rank,
    overallRank: raw.our_rank,
    positionRank: raw.pos_rank,
    tierLabel: raw.tier,
    tierNumber: parseTier(raw.tier),
    marketAdp: raw.market_adp,
    marketAdpSource: raw.market_adp_source,
    marketAdpQuality: raw.market_adp_quality || "UNKNOWN",
    marketRound14: raw.market_round_14team,
    ourRound14: raw.our_round_14team,
    targetRound: raw.target_round,
    targetRoundStart: parseRoundStart(raw.target_round),
    targetRoundEnd: parseRoundEnd(raw.target_round),
    doNotReachBeforeRound: raw.do_not_reach_before_round,
    doNotReachStart: parseRoundStart(raw.do_not_reach_before_round),
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    injuryStatus: raw.injury_status,
    injurySeverity: Number(raw.injury_severity_0_5 || 0),
    week1Availability: raw.week1_availability,
    durabilityRisk: Number(raw.durability_risk_1_5 || 0),
    roleConfidence: Number(raw.role_confidence_1_10 || 0),
    stance: raw.stance || "BASELINE",
    intelLevel: raw.intel_level || "BASELINE_ONLY",
    thesis: raw.short_thesis || "",
    riskNote: raw.risk_note || "",
    newsNote: raw.news_note || "",
    lastIntelUpdate: raw.last_intel_update || "",
    aliases: searchAliases(raw.name),
    raw
  };
}

function setEngineStatus(kind, message) {
  const status = el("engineStatus");
  if (!status) return;
  status.className = `engine-status ${kind}`;
  status.textContent = message;
}

function captureError(label, error) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  runtimeErrors.push(`${label}: ${message}`);
  console.error(label, error);
  setEngineStatus("error", `Engine Error v${BUILD_VERSION}`);
}

window.addEventListener("error", (event) => captureError("Runtime", event.error || event.message));
window.addEventListener("unhandledrejection", (event) => captureError("Promise", event.reason));

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    captureError("Save state", error);
  }
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      state = { ...state, ...JSON.parse(saved) };
      return;
    } catch (error) {
      captureError("Load current state", error);
    }
  }

  // Intentionally do NOT migrate old draft histories because V1-V3 used a different sample dataset.
  // We only preserve harmless preferences.
  for (const key of PREVIOUS_STORAGE_KEYS) {
    const older = localStorage.getItem(key);
    if (!older) continue;
    try {
      const parsed = JSON.parse(older);
      state.draftSlot = parsed.draftSlot || null;
      state.selectedPosition = parsed.selectedPosition || "ALL";
      state.showDrafted = Boolean(parsed.showDrafted);
      break;
    } catch (_) {
      // Ignore corrupt legacy state.
    }
  }
}

async function loadBrain() {
  const response = await fetch(BRAIN_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Brain file failed to load (${response.status})`);
  }

  const data = await response.json();
  if (!data || !Array.isArray(data.players)) {
    throw new Error("Brain file has no players array");
  }

  brainMeta = {
    datasetName: data.dataset_name,
    version: data.version,
    asOf: data.as_of,
    status: data.status,
    finalFreezeDate: data.final_freeze_date
  };

  leagueStrategy = data.league_strategy || {};

  dstStreaming = new Map(
    (data.dst_streaming || []).map((item) => [
      item.abbr,
      {
        rank: item.stream_rank,
        opponent: item.week1_opponent,
        grade: item.week1_grade,
        strategy: item.strategy,
        note: item.note
      }
    ])
  );

  kickerStreaming = new Map(
    (data.kicker_streaming || []).map((item) => [
      item.name,
      {
        rank: item.stream_rank,
        opponent: item.week1_opponent,
        strategy: item.strategy,
        note: item.note
      }
    ])
  );

  players = data.players.map(normalizePlayer);
}

function runSelfCheck() {
  const requiredIds = [
    "engineStatus", "setDraftSlotButton", "playerSearch", "recommendationPanel",
    "bestAvailableList", "playerList", "playerModal", "slotModal",
    "recentPicksToggle", "recentPicksList", "debugModal"
  ];

  const missingElements = requiredIds.filter((id) => !el(id));
  const ids = players.map((player) => player.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const invalidPositions = players
    .filter((player) => !["QB", "RB", "WR", "TE", "DEF", "K"].includes(player.position))
    .map((player) => `${player.name}:${player.position}`);

  const missingCore = players
    .filter((player) => !player.name || !player.position || !Number.isFinite(Number(player.overallRank)))
    .map((player) => player.name || player.id);

  selfCheck = {
    ok:
      missingElements.length === 0 &&
      players.length >= 200 &&
      duplicateIds.length === 0 &&
      invalidPositions.length === 0 &&
      missingCore.length === 0,
    playerCount: players.length,
    missingElements,
    duplicateIds: [...new Set(duplicateIds)],
    invalidPositions,
    missingCore,
    datasetVersion: brainMeta.version,
    datasetAsOf: brainMeta.asOf
  };

  if (!selfCheck.ok) {
    throw new Error("Self-check failed. Tap the red Engine status for diagnostics.");
  }

  return selfCheck;
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
  return Math.floor((currentOverallPick() - 1) / 14) + 1;
}

function pickInRound(overallPick) {
  return ((overallPick - 1) % 14) + 1;
}

function pickForRound(round, slot) {
  const pickInThatRound = round % 2 === 1 ? slot : 15 - slot;
  return (round - 1) * 14 + pickInThatRound;
}

function nextMyPick() {
  if (!state.draftSlot) return null;
  const now = currentOverallPick();

  for (let round = currentRound(); round <= 20; round += 1) {
    const pick = pickForRound(round, state.draftSlot);
    if (pick >= now) return pick;
  }
  return null;
}

function getRoster() {
  return state.myPlayers.map(getPlayer).filter(Boolean);
}

function rosterCounts() {
  return getRoster().reduce((acc, player) => {
    acc[player.position] = (acc[player.position] || 0) + 1;
    return acc;
  }, {});
}

function skillStarterNeed(position) {
  const counts = rosterCounts();
  if (position === "QB") return Math.max(0, 1 - (counts.QB || 0));
  if (position === "RB") return Math.max(0, 2 - (counts.RB || 0));
  if (position === "WR") return Math.max(0, 2 - (counts.WR || 0));
  if (position === "TE") return Math.max(0, 1 - (counts.TE || 0));
  if (position === "DEF") return Math.max(0, 1 - (counts.DEF || 0));
  if (position === "K") return Math.max(0, 1 - (counts.K || 0));
  return 0;
}

function flexNeed() {
  const counts = rosterCounts();
  const rbExcess = Math.max(0, (counts.RB || 0) - 2);
  const wrExcess = Math.max(0, (counts.WR || 0) - 2);
  const teExcess = Math.max(0, (counts.TE || 0) - 1);
  return Math.max(0, 1 - Math.min(1, rbExcess + wrExcess + teExcess));
}

function availablePlayers() {
  return players.filter((player) => !isDrafted(player.id));
}

function availableAtPosition(position) {
  return availablePlayers().filter((player) => player.position === position);
}

function tierRemaining(player) {
  return availablePlayers().filter(
    (candidate) =>
      candidate.position === player.position &&
      candidate.tierLabel === player.tierLabel
  ).length;
}

function adpConfidenceWeight(quality) {
  const normalized = String(quality || "").toUpperCase();
  if (normalized === "QUOTED") return 1.0;
  if (normalized === "ESTIMATE") return 0.55;
  if (normalized === "PROXY") return 0.20;
  return 0.15;
}

function stanceAdjustment(stance) {
  const table = {
    STRONG_TARGET: 24,
    STRONG_TARGET_AT_DISCOUNT: 20,
    TARGET: 14,
    TARGET_AT_PRICE: 11,
    TARGET_IF_HEALTHY: 8,
    TARGET_IF_RB_NEEDED: 7,
    LATE_QB_TARGET: 8,
    LATE_TE_TARGET: 8,
    DEEP_TARGET: 5,
    DEEP_RB_TARGET: 7,
    WATCH_ROLE: -3,
    PRICE_SENSITIVE: -5,
    DO_NOT_REACH: -16,
    INJURY_DISCOUNT_ONLY: -18,
    BASELINE: 0
  };
  return table[stance] ?? 0;
}

function tagAdjustment(tags, round) {
  let score = 0;
  const set = new Set(tags || []);

  if (set.has("VALUE")) score += 11;
  if (set.has("TARGET")) score += 10;
  if (set.has("UPSIDE")) score += round <= 5 ? 5 : 10;
  if (set.has("SAFE")) score += round <= 5 ? 7 : 3;
  if (set.has("PPR")) score += 6;
  if (set.has("CONTINGENCY")) score += round >= 8 ? 10 : 2;
  if (set.has("RISK")) score -= round <= 5 ? 8 : 4;
  if (set.has("PRICE")) score -= 5;

  return score;
}

function rosterAdjustment(player, round) {
  const counts = rosterCounts();
  let score = 0;

  const need = skillStarterNeed(player.position);
  if (need > 0) {
    if (player.position === "RB") score += 22;
    else if (player.position === "WR") score += 15;
    else if (player.position === "QB") score += round >= 5 ? 11 : 2;
    else if (player.position === "TE") score += round >= 5 ? 8 : 2;
    else if (player.position === "DEF" || player.position === "K") score += round >= 13 ? 8 : -35;
  }

  if (["RB", "WR", "TE"].includes(player.position) && flexNeed() > 0) {
    score += player.position === "RB" ? 8 : 5;
  }

  // Avoid unnecessary backups while useful RB/WR upside remains.
  if (player.position === "QB" && (counts.QB || 0) >= 1) score -= 35;
  if (player.position === "TE" && (counts.TE || 0) >= 2) score -= 22;
  if (player.position === "DEF" && (counts.DEF || 0) >= 1) score -= 60;
  if (player.position === "K" && (counts.K || 0) >= 1) score -= 60;

  return score;
}

function priceDisciplineAdjustment(player, round) {
  let score = 0;

  if (player.doNotReachStart && round < player.doNotReachStart) {
    const earlyBy = player.doNotReachStart - round;
    score -= 30 + earlyBy * 10;
  }

  if (player.targetRoundStart && player.targetRoundEnd) {
    if (round >= player.targetRoundStart && round <= player.targetRoundEnd) {
      score += 15;
    } else if (round > player.targetRoundEnd) {
      score += Math.min(25, 8 + (round - player.targetRoundEnd) * 5);
    } else if (round < player.targetRoundStart) {
      score -= Math.min(22, (player.targetRoundStart - round) * 6);
    }
  }

  if (Number.isFinite(Number(player.marketAdp))) {
    const confidence = adpConfidenceWeight(player.marketAdpQuality);
    const gap = currentOverallPick() - Number(player.marketAdp);

    if (gap >= 14) score += 16 * confidence;
    else if (gap >= 7) score += 9 * confidence;
    else if (gap <= -28) score -= 14 * confidence;
    else if (gap <= -14) score -= 7 * confidence;
  }

  return score;
}

function injuryAdjustment(player, round) {
  let score = 0;

  score -= player.injurySeverity * (round <= 5 ? 7 : 4);
  score -= player.durabilityRisk * (round <= 5 ? 2.5 : 1.2);

  const availability = String(player.week1Availability || "").toUpperCase();
  if (availability.includes("UNCERTAIN")) score -= 10;
  if (availability.includes("POSSIBLE")) score -= 7;
  if (availability.includes("UNKNOWN")) score -= 3;

  const status = String(player.injuryStatus || "").toUpperCase();
  if (status.includes("PUP")) score -= 12;
  if (status.includes("SUSPENSION")) score -= 12;
  if (status.includes("HOLD")) score -= 4;

  return score;
}

function tierAdjustment(player) {
  const remaining = tierRemaining(player);
  if (remaining === 1) return 26;
  if (remaining === 2) return 18;
  if (remaining === 3) return 10;
  return 0;
}

function streamingInfo(player) {
  if (player.position === "DEF") return dstStreaming.get(player.team) || null;
  if (player.position === "K") return kickerStreaming.get(player.name) || null;
  return null;
}

function positionStrategyAdjustment(player, round) {
  let score = 0;

  if (player.position === "RB") {
    score += 8; // 14-team scarcity
  }

  if (player.position === "QB") {
    const preferredQbs = availableAtPosition("QB")
      .filter((qb) => qb.overallRank <= 115 || qb.stance.includes("QB_TARGET"));
    if (preferredQbs.length <= 2 && skillStarterNeed("QB") > 0) score += 22;
  }

  if (player.position === "TE") {
    // Elite-or-wait: reward top end, otherwise only modest boost unless targeted.
    if (player.positionRank <= 4) score += 8;
    else if (!String(player.stance).includes("TE_TARGET")) score -= 4;
  }

  if (player.position === "DEF" || player.position === "K") {
    if (round < 13) {
      score -= 120;
    } else {
      score -= 12;
      const stream = streamingInfo(player);
      if (stream) {
        if (stream.rank === 1) score += 16;
        else if (stream.rank === 2) score += 12;
        else if (stream.rank === 3) score += 8;
        else if (stream.rank <= 5) score += 5;

        if (player.position === "DEF") {
          if (stream.grade === "A") score += 7;
          else if (stream.grade === "A-") score += 5;
          else if (stream.grade === "B+") score += 3;
        }
      }
    }
  }

  return score;
}

function recommendationScore(player) {
  const round = currentRound();

  // Rank remains the foundation, but not the whole answer.
  let score = 340 - Number(player.overallRank || 300);

  score += stanceAdjustment(player.stance);
  score += tagAdjustment(player.tags, round);
  score += rosterAdjustment(player, round);
  score += priceDisciplineAdjustment(player, round);
  score += injuryAdjustment(player, round);
  score += tierAdjustment(player);
  score += positionStrategyAdjustment(player, round);

  // Role confidence matters more early; uncertainty is acceptable late.
  score += (player.roleConfidence - 5) * (round <= 6 ? 2.4 : 1.3);

  // Research-backed opinions get a small confidence edge over untouched baseline.
  if (player.intelLevel === "TRANSCRIPT_RESEARCH") score += 5;

  return score;
}

function recommendationLabel(player) {
  const round = currentRound();

  if (player.doNotReachStart && round < player.doNotReachStart) return "WAIT";
  if (player.injurySeverity >= 3 || player.stance === "INJURY_DISCOUNT_ONLY") return "DISCOUNT ONLY";
  if (["STRONG_TARGET", "STRONG_TARGET_AT_DISCOUNT"].includes(player.stance)) return "TARGET";
  if (tierRemaining(player) <= 2) return "TIER CLIFF";
  return "GOOD PICK";
}

function recommendationReason(player) {
  const reasons = [];
  const round = currentRound();
  const remaining = tierRemaining(player);

  if (skillStarterNeed(player.position) > 0) {
    if (player.position === "RB") reasons.push("Fills a starting RB need in a 14-team scarcity spot.");
    else if (player.position === "WR") reasons.push("Fills a starting WR need.");
    else if (player.position === "QB" && round >= 5) reasons.push("You still need a starting QB.");
    else if (player.position === "TE" && round >= 5) reasons.push("You still need a starting TE.");
  }

  if (remaining <= 2 && ["RB", "WR", "TE", "QB"].includes(player.position)) {
    reasons.push(`Only ${remaining} ${player.position}${remaining === 1 ? "" : "s"} remain in ${player.tierLabel}.`);
  }

  if (player.doNotReachStart && round < player.doNotReachStart) {
    reasons.push(`We like him, but do not reach before R${player.doNotReachStart}.`);
  } else if (player.targetRoundStart && round >= player.targetRoundStart) {
    reasons.push(`Now inside our target range (${safeText(player.targetRound)}).`);
  }

  if (player.stance === "STRONG_TARGET") reasons.push("One of our strongest research-backed targets.");
  else if (player.stance === "TARGET_AT_PRICE") reasons.push("Good target at the right price.");
  else if (player.stance === "PRICE_SENSITIVE") reasons.push("Price discipline matters here.");

  if (player.roleConfidence >= 9) reasons.push(`Role confidence ${player.roleConfidence}/10.`);

  if (!reasons.length) {
    reasons.push(player.thesis || "Strong combination of rank, tier, roster fit and price.");
  }

  return reasons.slice(0, 2).join(" ");
}

function injuryTag(player) {
  if (player.injurySeverity >= 3) return "INJURY";
  const availability = String(player.week1Availability || "").toUpperCase();
  if (availability.includes("UNCERTAIN")) return "WEEK 1?";
  return "";
}

function tagClass(tag) {
  const value = String(tag).toLowerCase();
  if (value.includes("risk")) return "risk";
  if (value.includes("value")) return "value";
  if (value.includes("upside")) return "upside";
  if (value.includes("target")) return "target";
  if (value.includes("ppr")) return "ppr";
  if (value.includes("contingency")) return "contingency";
  if (value.includes("cliff")) return "cliff";
  if (value.includes("wait")) return "wait";
  if (value.includes("intel")) return "intel";
  return "";
}

function playerTagsHtml(player, extraTags = []) {
  const tags = [...(player.tags || []), ...extraTags];
  const injury = injuryTag(player);
  if (injury) tags.push(injury);

  const unique = [...new Set(tags)].slice(0, 5);
  return unique.map((tag) => {
    const injuryClass = tag === "INJURY" || tag === "WEEK 1?" ? "injury" : tagClass(tag);
    return `<span class="tag ${injuryClass}">${tag}</span>`;
  }).join("");
}

function playerPriceHtml(player) {
  const bits = [];
  if (player.targetRound) bits.push(`Target ${player.targetRound}`);
  if (player.marketAdp) bits.push(`ADP ${player.marketAdp}`);
  return bits.length ? `<div class="player-price">${bits.join(" · ")}</div>` : "";
}

function playerButtonHtml(player) {
  const drafted = isDrafted(player.id);
  const mine = state.myPlayers.includes(player.id);

  return `
    <button
      type="button"
      class="player-row"
      data-open-player="${player.id}"
      style="${drafted ? "opacity:.45;" : ""}"
    >
      <div class="player-main">
        <div class="player-name">${player.name}${mine ? " ★" : ""}</div>
        <div class="player-meta">
          ${player.position} · ${player.team} · ${player.tierLabel} · ${player.position}#${player.positionRank}
        </div>
        ${playerPriceHtml(player)}
        <div class="player-tags">${playerTagsHtml(player)}</div>
      </div>
      <div class="player-rank">#${player.overallRank}</div>
    </button>
  `;
}

function searchCorpus(player) {
  return [
    player.name,
    player.team,
    player.position,
    player.stance,
    ...(player.tags || []),
    ...(player.aliases || [])
  ].join(" ").toLowerCase();
}

function matchesSearch(player) {
  const term = state.searchTerm.trim().toLowerCase();
  if (!term) return true;
  const compact = term.replace(/\s+/g, "");
  return searchCorpus(player).includes(term) || player.aliases.includes(compact);
}

function matchesPosition(player) {
  return state.selectedPosition === "ALL" || player.position === state.selectedPosition;
}

function renderSearchResults() {
  const card = el("searchResultsCard");
  const results = el("searchResults");
  const term = state.searchTerm.trim();

  if (!term) {
    card.classList.add("hidden");
    return;
  }

  const matches = players
    .filter(matchesSearch)
    .filter(matchesPosition)
    .filter((player) => state.showDrafted || !isDrafted(player.id))
    .sort((a,b) => a.overallRank - b.overallRank)
    .slice(0, 15);

  el("searchResultCount").textContent = `${matches.length} found`;
  results.innerHTML = matches.length
    ? matches.map(playerButtonHtml).join("")
    : '<p class="muted">No players found.</p>';

  card.classList.remove("hidden");
}

function renderPlayerBoard() {
  const board = players
    .filter(matchesSearch)
    .filter(matchesPosition)
    .filter((player) => state.showDrafted || !isDrafted(player.id))
    .sort((a,b) => a.overallRank - b.overallRank);

  el("playerList").innerHTML = board.length
    ? board.map(playerButtonHtml).join("")
    : '<p class="muted">No players found.</p>';
}

function renderBestAvailable() {
  const list = availablePlayers()
    .filter(matchesPosition)
    .sort((a,b) => a.overallRank - b.overallRank)
    .slice(0, 8);

  el("bestAvailableContext").textContent = state.selectedPosition;

  el("bestAvailableList").innerHTML = list.length
    ? list.map(playerButtonHtml).join("")
    : '<p class="muted">No players remaining in this filter.</p>';
}

function renderRecommendations() {
  const recommendations = availablePlayers()
    .map((player) => ({ ...player, recommendationScore: recommendationScore(player) }))
    .sort((a,b) => {
      if (b.recommendationScore !== a.recommendationScore) {
        return b.recommendationScore - a.recommendationScore;
      }
      return a.overallRank - b.overallRank;
    })
    .slice(0, 3);

  el("recommendationContext").textContent = `R${currentRound()} · #${currentOverallPick()}`;

  if (!recommendations.length) {
    el("recommendationPanel").innerHTML = '<p class="muted">No recommendations available.</p>';
    return;
  }

  el("recommendationPanel").innerHTML = recommendations.map((player, index) => {
    const label = recommendationLabel(player);
    const labelClass = label === "WAIT" ? "wait" : label.includes("CLIFF") ? "cliff" : "target";

    return `
      <button
        type="button"
        class="recommendation-row ${index === 0 ? "top-pick" : ""}"
        data-open-player="${player.id}"
      >
        <div class="recommendation-rank">${index + 1}</div>
        <div class="player-main">
          <div class="player-name">${player.name} — ${player.position}</div>
          <div class="player-meta">
            Our #${player.overallRank} · ${player.tierLabel} · Role ${player.roleConfidence}/10
          </div>
          <div class="player-tags">
            <span class="tag ${labelClass}">${label}</span>
            ${playerTagsHtml(player)}
          </div>
          <p class="recommendation-reason">${recommendationReason(player)}</p>
        </div>
        <div class="player-rank">#${player.overallRank}</div>
      </button>
    `;
  }).join("");
}

function renderCliffs() {
  const candidates = ["RB","WR","TE","QB"]
    .map((position) => {
      const list = availableAtPosition(position).sort((a,b) => a.overallRank - b.overallRank);
      if (!list.length) return null;
      const best = list[0];
      const sameTier = list.filter((player) => player.tierLabel === best.tierLabel);
      return { position, best, sameTier };
    })
    .filter(Boolean)
    .filter((item) => item.sameTier.length <= 2);

  if (!candidates.length) {
    el("cliffCard").classList.add("hidden");
    return;
  }

  candidates.sort((a,b) => a.best.overallRank - b.best.overallRank);
  const warning = candidates[0];

  el("cliffPanel").innerHTML = `
    <p class="cliff-title">⚠ ${warning.position} CLIFF</p>
    <p class="cliff-copy">
      ${warning.sameTier.length} player${warning.sameTier.length === 1 ? "" : "s"} remain in ${warning.best.tierLabel}:
      ${warning.sameTier.map((player) => player.name).join(" and ")}.
    </p>
  `;
  el("cliffCard").classList.remove("hidden");
}

function renderDraftStatus() {
  const nextPick = nextMyPick();
  el("draftSlotDisplay").textContent = state.draftSlot ? `#${state.draftSlot}` : "Set Slot";
  el("roundDisplay").textContent = currentRound();
  el("overallPickDisplay").textContent = currentOverallPick();
  el("nextPickDisplay").textContent = nextPick || "—";
  el("picksAwayDisplay").textContent = nextPick ? Math.max(0, nextPick - currentOverallPick()) : "—";
}

function historyDetails(action, index) {
  const overall = index + 1;
  const round = Math.floor((overall - 1) / 14) + 1;
  const roundPick = pickInRound(overall);
  const player = getPlayer(action.playerId);
  return {
    ...action,
    overallPick: overall,
    round,
    roundPick,
    player
  };
}

function renderRecentPicks() {
  const detailed = state.history.map(historyDetails);
  const last = detailed[detailed.length - 1];

  if (!last || !last.player) {
    el("lastPickDisplay").textContent = "No picks recorded yet";
  } else {
    const mine = last.type === "myPick" ? " · MY PICK" : "";
    el("lastPickDisplay").textContent =
      `R${last.round} · #${last.overallPick} — ${last.player.name} (${last.player.position})${mine}`;
  }

  const recent = [...detailed].reverse().slice(0, 10);

  el("recentPicksList").innerHTML = recent.length
    ? recent.map((item) => {
        const player = item.player;
        if (!player) return "";
        return `
          <div class="recent-pick-row">
            <div class="recent-pick-number">R${item.round} · #${item.overallPick}</div>
            <div class="recent-pick-player">
              ${player.name}
              <small>${player.position} · ${player.team} · Round pick ${item.roundPick}</small>
            </div>
            ${item.type === "myPick" ? '<span class="my-pick-pill">MY PICK</span>' : ""}
          </div>
        `;
      }).join("")
    : '<p class="muted" style="padding:8px 0 2px;">Your last 10 picks will appear here.</p>';

  el("recentPicksList").classList.toggle("hidden", !state.recentOpen);
  el("recentChevron").classList.toggle("open", state.recentOpen);
}

function renderRosterSummary() {
  const counts = rosterCounts();
  const skillExtra = Math.max(
    0,
    (counts.RB || 0) + (counts.WR || 0) + (counts.TE || 0) - 5
  );

  const slots = [
    ["QB", Math.min(counts.QB || 0, 1), 1],
    ["RB", Math.min(counts.RB || 0, 2), 2],
    ["WR", Math.min(counts.WR || 0, 2), 2],
    ["TE", Math.min(counts.TE || 0, 1), 1],
    ["FLEX", Math.min(skillExtra, 1), 1],
    ["DEF", Math.min(counts.DEF || 0, 1), 1],
    ["K", Math.min(counts.K || 0, 1), 1],
    ["BENCH", Math.max(0, getRoster().length - 9), 6]
  ];

  el("rosterSummary").innerHTML = slots.map(([label,count,need]) => `
    <div class="roster-slot">
      <span class="roster-slot-label">${label}</span>
      <span class="roster-slot-value">${count}/${need}</span>
    </div>
  `).join("");
}

function renderMyRoster() {
  const roster = getRoster();
  el("teamPickCount").textContent = `${roster.length} Pick${roster.length === 1 ? "" : "s"}`;

  if (!roster.length) {
    el("myRoster").innerHTML = '<p class="muted">No players drafted yet.</p>';
    renderRosterSummary();
    return;
  }

  el("myRoster").innerHTML = roster.map(playerButtonHtml).join("");
  renderRosterSummary();
}

function openPlayerModal(playerId) {
  const player = getPlayer(playerId);
  if (!player) {
    captureError("Open player", `Unknown player id ${playerId}`);
    return;
  }

  selectedPlayerId = playerId;

  const unavailable = isDrafted(playerId);
  const remaining = tierRemaining(player);
  const marketQuality = safeText(player.marketAdpQuality);

  el("modalPlayerContent").innerHTML = `
    <p class="eyebrow">${player.position} · ${player.team}</p>
    <h2 style="padding-right:42px;">${player.name}</h2>

    <div class="player-tags" style="margin-top:9px;">
      ${playerTagsHtml(player, remaining <= 2 ? ["CLIFF"] : [])}
      ${player.intelLevel === "TRANSCRIPT_RESEARCH" ? '<span class="tag intel">RESEARCHED</span>' : ""}
    </div>

    <div class="detail-grid">
      <div class="detail-box"><span>Our Rank</span><strong>#${player.overallRank}</strong></div>
      <div class="detail-box"><span>Position</span><strong>${player.position}#${player.positionRank}</strong></div>
      <div class="detail-box"><span>Tier</span><strong>${safeText(player.tierLabel)}</strong></div>
      <div class="detail-box"><span>Role Confidence</span><strong>${player.roleConfidence}/10</strong></div>
      <div class="detail-box"><span>Market ADP</span><strong>${safeText(player.marketAdp)} (${marketQuality})</strong></div>
      <div class="detail-box"><span>Target Round</span><strong>${safeText(player.targetRound)}</strong></div>
      <div class="detail-box"><span>Don't Reach Before</span><strong>${safeText(player.doNotReachBeforeRound)}</strong></div>
      <div class="detail-box"><span>Stance</span><strong>${safeText(player.stance).replaceAll("_"," ")}</strong></div>
      <div class="detail-box"><span>Week 1</span><strong>${safeText(player.week1Availability)}</strong></div>
      <div class="detail-box"><span>Durability</span><strong>${player.durabilityRisk}/5</strong></div>
    </div>

    <div class="note-box"><strong>Our Thesis</strong><br>${safeText(player.thesis, "No custom thesis yet.")}</div>

    ${player.riskNote ? `<div class="note-box warning"><strong>Risk</strong><br>${player.riskNote}</div>` : ""}
    ${player.newsNote ? `<div class="note-box"><strong>News</strong><br>${player.newsNote}</div>` : ""}
    ${streamingInfo(player) ? `
      <div class="note-box">
        <strong>Week 1 Streaming</strong><br>
        #${streamingInfo(player).rank} · vs ${safeText(streamingInfo(player).opponent)}
        ${streamingInfo(player).grade ? ` · Grade ${streamingInfo(player).grade}` : ""}
        <br>${safeText(streamingInfo(player).note, "")}
      </div>
    ` : ""}

    <p class="player-meta" style="margin-top:10px;">
      Intel updated ${safeText(player.lastIntelUpdate)} · ${safeText(player.intelLevel).replaceAll("_"," ")}
    </p>
  `;

  el("draftedByOtherButton").disabled = unavailable;
  el("myPickButton").disabled = unavailable;

  el("playerModal").classList.remove("hidden");
}

function closePlayerModal() {
  el("playerModal").classList.add("hidden");
  selectedPlayerId = null;
}

function openSlotModal() {
  el("draftSlotGrid").innerHTML = Array.from({ length: 14 }, (_, index) => {
    const slot = index + 1;
    return `
      <button
        type="button"
        class="slot-button ${state.draftSlot === slot ? "selected" : ""}"
        data-slot="${slot}"
      >${slot}</button>
    `;
  }).join("");

  el("slotModal").classList.remove("hidden");
}

function closeSlotModal() {
  el("slotModal").classList.add("hidden");
}

function debugRow(label, value, ok = true) {
  return `
    <div class="debug-row">
      <span>${label}</span>
      <strong class="${ok ? "debug-ok" : "debug-bad"}">${value}</strong>
    </div>
  `;
}

function openDebugModal() {
  const check = selfCheck || {};
  const currentStateSize = (() => {
    try { return JSON.stringify(state).length; } catch (_) { return 0; }
  })();

  el("debugContent").innerHTML = `
    ${debugRow("Build", `v${BUILD_VERSION}`, true)}
    ${debugRow("Dataset", safeText(brainMeta.version), Boolean(brainMeta.version))}
    ${debugRow("Dataset date", safeText(brainMeta.asOf), Boolean(brainMeta.asOf))}
    ${debugRow("Players loaded", String(players.length), players.length >= 200)}
    ${debugRow("DST streams", String(dstStreaming.size), dstStreaming.size > 0)}
    ${debugRow("K streams", String(kickerStreaming.size), kickerStreaming.size > 0)}
    ${debugRow("Self-check", check.ok ? "PASS" : "FAIL", Boolean(check.ok))}
    ${debugRow("Draft slot", state.draftSlot ? `#${state.draftSlot}` : "Not set", true)}
    ${debugRow("Recorded picks", String(state.history.length), true)}
    ${debugRow("My players", String(state.myPlayers.length), true)}
    ${debugRow("State bytes", String(currentStateSize), true)}
    ${debugRow("Runtime errors", String(runtimeErrors.length), runtimeErrors.length === 0)}

    <div class="debug-log">${
      runtimeErrors.length
        ? runtimeErrors.join("\n")
        : [
            `Dataset: ${safeText(brainMeta.datasetName)}`,
            `Status: ${safeText(brainMeta.status)}`,
            `Missing UI elements: ${(check.missingElements || []).join(", ") || "none"}`,
            `Duplicate IDs: ${(check.duplicateIds || []).join(", ") || "none"}`,
            `Invalid positions: ${(check.invalidPositions || []).join(", ") || "none"}`
          ].join("\n")
    }</div>
  `;

  el("debugModal").classList.remove("hidden");
}

function closeDebugModal() {
  el("debugModal").classList.add("hidden");
}

function recordAction(type, playerId) {
  const player = getPlayer(playerId);
  if (!player || isDrafted(playerId)) return;

  if (type === "draftedByOther") state.draftedByOthers.push(playerId);
  if (type === "myPick") state.myPlayers.push(playerId);

  state.history.push({
    type,
    playerId,
    recordedAt: new Date().toISOString()
  });

  saveState();
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
}

function renderAll() {
  renderDraftStatus();
  renderRecentPicks();
  renderSearchResults();
  renderRecommendations();
  renderCliffs();
  renderBestAvailable();
  renderPlayerBoard();
  renderMyRoster();
  setActiveView(state.activeView || "draftView");
}

function handleDelegatedClick(event) {
  const openPlayer = event.target.closest("[data-open-player]");
  if (openPlayer) {
    openPlayerModal(openPlayer.dataset.openPlayer);
    return;
  }

  const filter = event.target.closest("[data-position]");
  if (filter) {
    state.selectedPosition = filter.dataset.position;
    document.querySelectorAll(".filter-button").forEach((button) => {
      button.classList.toggle("active", button.dataset.position === state.selectedPosition);
    });
    saveState();
    renderSearchResults();
    renderBestAvailable();
    renderPlayerBoard();
    return;
  }

  const slot = event.target.closest("[data-slot]");
  if (slot) {
    state.draftSlot = Number(slot.dataset.slot);
    saveState();
    closeSlotModal();
    renderAll();
    return;
  }

  const nav = event.target.closest("[data-view]");
  if (nav) {
    setActiveView(nav.dataset.view);
    window.scrollTo({ top: 0, behavior: "auto" });
    return;
  }

  if (event.target.closest("[data-close-player-modal]")) {
    closePlayerModal();
    return;
  }

  if (event.target.closest("[data-close-slot-modal]")) {
    closeSlotModal();
    return;
  }

  if (event.target.closest("[data-close-debug-modal]")) {
    closeDebugModal();
  }
}

function bindStaticEvents() {
  document.addEventListener("click", handleDelegatedClick);

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

  el("undoButton").addEventListener("click", undoLastAction);
  el("setDraftSlotButton").addEventListener("click", openSlotModal);
  el("engineStatus").addEventListener("click", openDebugModal);

  el("recentPicksToggle").addEventListener("click", () => {
    state.recentOpen = !state.recentOpen;
    saveState();
    renderRecentPicks();
  });

  el("draftedByOtherButton").addEventListener("click", () => {
    if (selectedPlayerId) recordAction("draftedByOther", selectedPlayerId);
  });

  el("myPickButton").addEventListener("click", () => {
    if (selectedPlayerId) recordAction("myPick", selectedPlayerId);
  });
}

async function init() {
  setEngineStatus("loading", `Engine loading v${BUILD_VERSION}…`);

  loadState();
  await loadBrain();
  runSelfCheck();

  el("playerSearch").value = state.searchTerm || "";
  el("showDraftedToggle").checked = Boolean(state.showDrafted);

  document.querySelectorAll(".filter-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.position === state.selectedPosition);
  });

  bindStaticEvents();
  renderAll();

  setEngineStatus("ready", `Engine Ready v${BUILD_VERSION} · ${players.length} players`);
}

init().catch((error) => {
  captureError("Initialization failed", error);

  // Keep diagnostics clickable even if initialization failed before normal event binding.
  const status = el("engineStatus");
  if (status) status.addEventListener("click", openDebugModal);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker-v4.js")
      .catch((error) => captureError("Service worker", error));
  });
}
