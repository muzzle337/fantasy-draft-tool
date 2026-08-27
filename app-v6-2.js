const BUILD_VERSION = "6.2.0-final-k-def";
const TEAM_COUNT = 14;
const STORAGE_PREFIX = "fantasyDraftToolStateV5";
const BACKUP_PREFIX = "fantasyDraftBackupsV6";
const MAX_BACKUPS = 10;
const LAST_SAVE_KEY = "fantasyDraftLastSaveV6";
const BRAIN_URL = "./draft-brain-v6-2.json?v=6.2.0";

let brainMeta = {};
let leagueStrategy = {};
let dstStreaming = new Map();
let kickerStreaming = new Map();
let players = [];
let selectedPlayerId = null;
let runtimeErrors = [];
let selfCheck = null;
let resetHoldTimer = null;
let resetHoldStart = null;
let resetProgressTimer = null;
let pendingResetAction = "current";

const defaultState = () => ({
  draftedByOthers: [],
  myPlayers: [],
  history: [],
  selectedPosition: "ALL",
  showDrafted: false,
  searchTerm: "",
  draftSlot: null,
  activeView: "draftView",
  recentOpen: false,
  mode: "live"
});

let liveState = defaultState();
let mockState = { ...defaultState(), mode: "mock" };

const el = (id) => document.getElementById(id);
const storageKeyFor = (mode) => `${STORAGE_PREFIX}_${mode}`;

function currentState() {
  return liveState.mode === "live" && mockState.mode === "mock"
    ? (activeMode() === "mock" ? mockState : liveState)
    : liveState;
}

const ACTIVE_MODE_KEY = "fantasyDraftActiveModeV5";

function activeMode() {
  try {
    const saved = localStorage.getItem(ACTIVE_MODE_KEY);
    return saved === "mock" ? "mock" : "live";
  } catch (_) {
    return "live";
  }
}

function setActiveMode(mode) {
  try {
    localStorage.setItem(ACTIVE_MODE_KEY, mode === "mock" ? "mock" : "live");
  } catch (error) {
    captureError("Save active mode", error);
  }
}

function stateFor(mode) {
  return mode === "mock" ? mockState : liveState;
}

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
  const suffixes = new Set(["jr","sr","ii","iii","iv"]);
  const aliases = [parts.map((p) => p[0]).join("").toLowerCase()];
  const withoutSuffix = parts.filter((part) => !suffixes.has(part.toLowerCase()));
  if (withoutSuffix.length >= 2) aliases.push(withoutSuffix.map((p) => p[0]).join("").toLowerCase());
  return [...new Set(aliases)];
}

function normalizePlayer(raw, index) {
  return {
    id: slugify(raw.name) || `player-${index + 1}`,
    name: raw.name,
    team: raw.team,
    position: normalizePosition(raw.pos),
    baselineRank: raw.baseline_rank,
    baselinePositionRank: raw.baseline_pos_rank,
    overallRank: raw.our_rank,
    positionRank: raw.pos_rank,
    tierLabel: raw.tier,
    tierNumber: parseTier(raw.tier),
    yahooAdp: raw.yahoo_adp,
    yahooAdpSource: raw.yahoo_adp_source,
    yahooAdpAvailable: Boolean(raw.yahoo_adp_available),
    yahooValueGap: raw.yahoo_value_gap,
    yahooRound14: raw.yahoo_round_14team,
    booneRank: raw.boone_rank,
    booneRankAvailable: Boolean(raw.boone_rank_available),
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


function backupKeyFor(mode) {
  return `${BACKUP_PREFIX}_${mode}`;
}

function getBackups(mode = activeMode()) {
  try {
    const raw = localStorage.getItem(backupKeyFor(mode));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function setBackups(mode, backups) {
  localStorage.setItem(backupKeyFor(mode), JSON.stringify(backups.slice(0, MAX_BACKUPS)));
}

function snapshotState(mode = activeMode(), reason = "auto") {
  try {
    const state = JSON.parse(JSON.stringify(stateFor(mode)));
    const backups = getBackups(mode);
    const latest = backups[0];

    // Avoid duplicate snapshots for identical pick count / roster state.
    const signature = JSON.stringify({
      history: state.history,
      myPlayers: state.myPlayers,
      draftedByOthers: state.draftedByOthers,
      draftSlot: state.draftSlot
    });

    if (latest && latest.signature === signature && reason === "auto") {
      return latest;
    }

    const snapshot = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      mode,
      reason,
      createdAt: new Date().toISOString(),
      pickCount: state.history.length,
      myPickCount: state.myPlayers.length,
      state,
      signature
    };

    backups.unshift(snapshot);
    setBackups(mode, backups);
    return snapshot;
  } catch (error) {
    captureError("Create backup", error);
    return null;
  }
}

function latestBackup(mode = activeMode()) {
  return getBackups(mode)[0] || null;
}

function markSaveSuccess(mode = activeMode()) {
  const payload = {
    mode,
    at: new Date().toISOString(),
    pickCount: stateFor(mode).history.length
  };
  localStorage.setItem(LAST_SAVE_KEY, JSON.stringify(payload));
}

function readLastSave() {
  try {
    const raw = localStorage.getItem(LAST_SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function formatSaveTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch (_) {
    return "—";
  }
}

function renderSaveHealth() {
  const state = currentState();
  const lastSave = readLastSave();
  const latest = latestBackup();
  const btn = el("saveHealthButton");
  if (!btn) return;

  const modeMatches = lastSave && lastSave.mode === activeMode();
  const pickMatches = lastSave && lastSave.pickCount === state.history.length;

  if (modeMatches && pickMatches) {
    btn.className = "save-health healthy";
    el("saveHealthIcon").textContent = "✓";
    el("saveHealthText").textContent =
      `Saved · ${state.history.length} picks · ${formatSaveTime(lastSave.at)}`;
  } else {
    btn.className = "save-health warning";
    el("saveHealthIcon").textContent = "!";
    el("saveHealthText").textContent =
      `Save check · ${state.history.length} picks`;
  }

  if (el("restoreBackupNote")) {
    el("restoreBackupNote").textContent = latest
      ? `Latest: ${latest.pickCount} picks · ${formatSaveTime(latest.createdAt)}`
      : "No backup yet";
  }
}

function saveState(mode = activeMode()) {
  try {
    snapshotState(mode, "auto");
    const serialized = JSON.stringify(stateFor(mode));
    localStorage.setItem(storageKeyFor(mode), serialized);

    const verify = localStorage.getItem(storageKeyFor(mode));
    if (verify !== serialized) throw new Error("Saved state verification failed");

    markSaveSuccess(mode);
    renderSaveHealth();
  } catch (error) {
    captureError("Save state", error);
    const btn = el("saveHealthButton");
    if (btn) {
      btn.className = "save-health error";
      el("saveHealthIcon").textContent = "×";
      el("saveHealthText").textContent = "SAVE ERROR — tap for details";
    }
  }
}

function loadOneState(mode) {
  try {
    const raw = localStorage.getItem(storageKeyFor(mode));
    if (!raw) return { ...defaultState(), mode };
    return { ...defaultState(), ...JSON.parse(raw), mode };
  } catch (error) {
    captureError(`Load ${mode} state`, error);
    return { ...defaultState(), mode };
  }
}

function loadStates() {
  liveState = loadOneState("live");
  mockState = loadOneState("mock");

  for (const mode of ["live","mock"]) {
    const state = stateFor(mode);
    const backup = latestBackup(mode);

    if (state.history.length === 0 && backup && backup.pickCount > 0) {
      if (mode === "live") liveState = { ...defaultState(), ...backup.state, mode:"live" };
      else mockState = { ...defaultState(), ...backup.state, mode:"mock" };

      try {
        localStorage.setItem(storageKeyFor(mode), JSON.stringify(stateFor(mode)));
      } catch (_) {}
    }
  }
}

async function loadBrain() {
  const response = await fetch(BRAIN_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Brain file failed to load (${response.status})`);
  const data = await response.json();
  if (!data || !Array.isArray(data.players)) throw new Error("Brain file has no players array");

  brainMeta = {
    datasetName: data.dataset_name,
    version: data.version,
    asOf: data.as_of,
    status: data.status,
    finalFreezeDate: data.final_freeze_date
  };

  leagueStrategy = data.league_strategy || {};

  dstStreaming = new Map(
    (data.dst_streaming || []).map((item) => [item.abbr, {
      rank:item.stream_rank, opponent:item.week1_opponent, grade:item.week1_grade,
      strategy:item.strategy, note:item.note
    }])
  );

  kickerStreaming = new Map(
    (data.kicker_streaming || []).map((item) => [item.name, {
      rank:item.stream_rank, opponent:item.week1_opponent,
      strategy:item.strategy, note:item.note
    }])
  );

  players = data.players.map(normalizePlayer);
}

function runSelfCheck() {
  const requiredIds = [
    "engineStatus","datasetStatus","setDraftSlotButton","playerSearch","recommendationPanel",
    "bestAvailableList","playerList","playerModal","slotModal","mockModal","resetModal",
    "recentPicksToggle","recentPicksList","debugModal","starterRoster","benchRoster","irRoster","saveHealthButton","createBackupButton","restoreBackupButton","exportStateButton","importStateInput","resetCurrentDraftButton","clearAllLocalDataButton","backupModal","restoreModal"
  ];
  const missingElements = requiredIds.filter((id) => !el(id));
  const ids = players.map((p) => p.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const invalidPositions = players.filter((p) => !["QB","RB","WR","TE","DEF","K"].includes(p.position));
  const missingCore = players.filter((p) => !p.name || !p.position || !Number.isFinite(Number(p.overallRank)));

  selfCheck = {
    ok: missingElements.length === 0 && players.length >= 200 &&
        duplicateIds.length === 0 && invalidPositions.length === 0 && missingCore.length === 0,
    playerCount: players.length,
    missingElements,
    duplicateIds:[...new Set(duplicateIds)],
    invalidPositions: invalidPositions.map((p) => `${p.name}:${p.position}`),
    missingCore: missingCore.map((p) => p.name || p.id)
  };

  if (!selfCheck.ok) throw new Error("Self-check failed. Tap the red Engine status.");
}

function getPlayer(id) {
  return players.find((player) => player.id === id);
}

function isDrafted(id, state = currentState()) {
  return state.draftedByOthers.includes(id) || state.myPlayers.includes(id);
}

function currentOverallPick(state = currentState()) {
  return state.history.length + 1;
}


function isLateSpecialTeamsRound(state) {
  return currentRound(state) >= 13;
}

function currentRound(state = currentState()) {
  return Math.floor((currentOverallPick(state) - 1) / TEAM_COUNT) + 1;
}

function pickInRound(overallPick) {
  return ((overallPick - 1) % TEAM_COUNT) + 1;
}

function pickForRound(round, slot) {
  const roundPick = round % 2 === 1 ? slot : 15 - slot;
  return (round - 1) * TEAM_COUNT + roundPick;
}

function nextMyPick(state = currentState()) {
  if (!state.draftSlot) return null;
  const now = currentOverallPick(state);
  for (let round = currentRound(state); round <= 20; round += 1) {
    const pick = pickForRound(round, state.draftSlot);
    if (pick >= now) return pick;
  }
  return null;
}

function getRoster(state = currentState()) {
  return state.myPlayers.map(getPlayer).filter(Boolean);
}

function rosterCounts(state = currentState()) {
  return getRoster(state).reduce((acc, player) => {
    acc[player.position] = (acc[player.position] || 0) + 1;
    return acc;
  }, {});
}

function assignRosterSlots(state = currentState()) {
  const roster = getRoster(state);
  const unassigned = [...roster];

  const take = (position) => {
    const index = unassigned.findIndex((p) => p.position === position);
    if (index < 0) return null;
    return unassigned.splice(index, 1)[0];
  };

  const starters = [
    ["QB", take("QB")],
    ["RB1", take("RB")],
    ["RB2", take("RB")],
    ["WR1", take("WR")],
    ["WR2", take("WR")],
    ["TE", take("TE")]
  ];

  const flexIndex = unassigned.findIndex((p) => ["RB","WR","TE"].includes(p.position));
  const flexPlayer = flexIndex >= 0 ? unassigned.splice(flexIndex, 1)[0] : null;
  starters.push(["FLEX", flexPlayer]);
  starters.push(["K", take("K")]);
  starters.push(["DEF", take("DEF")]);

  const bench = unassigned.slice(0, 6);
  const ir = [];

  return { starters, bench, ir };
}

function skillStarterNeed(position, state = currentState()) {
  const assigned = assignRosterSlots(state);
  const labels = assigned.starters.filter(([,p]) => p).map(([label]) => label);

  if (position === "QB") return labels.includes("QB") ? 0 : 1;
  if (position === "RB") return Math.max(0, 2 - labels.filter((l) => l.startsWith("RB")).length);
  if (position === "WR") return Math.max(0, 2 - labels.filter((l) => l.startsWith("WR")).length);
  if (position === "TE") return labels.includes("TE") ? 0 : 1;
  if (position === "K") return labels.includes("K") ? 0 : 1;
  if (position === "DEF") return labels.includes("DEF") ? 0 : 1;
  return 0;
}

function flexNeed(state = currentState()) {
  const assigned = assignRosterSlots(state);
  const flex = assigned.starters.find(([label]) => label === "FLEX");
  return flex && flex[1] ? 0 : 1;
}

function availablePlayers(state = currentState()) {
  return players.filter((player) => !isDrafted(player.id, state));
}

function availableAtPosition(position, state = currentState()) {
  return availablePlayers(state).filter((player) => player.position === position);
}

function tierRemaining(player, state = currentState()) {
  return availablePlayers(state).filter((p) => p.position === player.position && p.tierLabel === player.tierLabel).length;
}

function yahooAdpAvailable(player) {
  return player.yahooAdpAvailable && Number.isFinite(Number(player.yahooAdp));
}

function stanceAdjustment(stance) {
  const table = {
    STRONG_TARGET:24, STRONG_TARGET_AT_DISCOUNT:20, TARGET:14, TARGET_AT_PRICE:11,
    TARGET_IF_HEALTHY:8, TARGET_IF_RB_NEEDED:7, LATE_QB_TARGET:8, LATE_TE_TARGET:8,
    DEEP_TARGET:5, DEEP_RB_TARGET:7, WATCH_ROLE:-3, PRICE_SENSITIVE:-5,
    DO_NOT_REACH:-16, INJURY_DISCOUNT_ONLY:-18, BASELINE:0
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

function rosterAdjustment(player, round, state = currentState()) {
  const counts = rosterCounts(state);
  let score = 0;
  const need = skillStarterNeed(player.position, state);

  if (need > 0) {
    if (player.position === "RB") score += 22;
    else if (player.position === "WR") score += 15;
    else if (player.position === "QB") score += round >= 5 ? 11 : 2;
    else if (player.position === "TE") score += round >= 5 ? 8 : 2;
    else if (player.position === "DEF" || player.position === "K") score += round >= 13 ? 8 : -35;
  }

  if (["RB","WR","TE"].includes(player.position) && flexNeed(state) > 0) {
    score += player.position === "RB" ? 8 : 5;
  }

  if (player.position === "QB" && (counts.QB || 0) >= 1) score -= 35;
  if (player.position === "TE" && (counts.TE || 0) >= 2) score -= 22;
  if (player.position === "DEF" && (counts.DEF || 0) >= 1) score -= 60;
  if (player.position === "K" && (counts.K || 0) >= 1) score -= 60;
  return score;
}

function priceDisciplineAdjustment(player, round, state = currentState()) {
  let score = 0;

  if (player.doNotReachStart && round < player.doNotReachStart) {
    score -= 30 + (player.doNotReachStart - round) * 10;
  }

  if (player.targetRoundStart && player.targetRoundEnd) {
    if (round >= player.targetRoundStart && round <= player.targetRoundEnd) score += 15;
    else if (round > player.targetRoundEnd) score += Math.min(25, 8 + (round - player.targetRoundEnd) * 5);
    else if (round < player.targetRoundStart) score -= Math.min(22, (player.targetRoundStart - round) * 6);
  }

  if (yahooAdpAvailable(player)) {
    const gap = currentOverallPick(state) - Number(player.yahooAdp);
    if (gap >= 14) score += 18;
    else if (gap >= 7) score += 10;
    else if (gap <= -28) score -= 16;
    else if (gap <= -14) score -= 8;
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

function tierAdjustment(player, state = currentState()) {
  const remaining = tierRemaining(player, state);
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

function positionStrategyAdjustment(player, round, state = currentState()) {
  let score = 0;
  if (player.position === "RB") score += 8;

  if (player.position === "QB") {
    const preferred = availableAtPosition("QB", state)
      .filter((qb) => qb.overallRank <= 115 || qb.stance.includes("QB_TARGET"));
    if (preferred.length <= 2 && skillStarterNeed("QB", state) > 0) score += 22;
  }

  if (player.position === "TE") {
    if (player.positionRank <= 4) score += 8;
    else if (!String(player.stance).includes("TE_TARGET")) score -= 4;
  }

  if (player.position === "DEF" || player.position === "K") {
    if (round < 13) score -= 120;
    else {
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

function recommendationScore(player, state = currentState()) {
  const round = currentRound(state);
  let score = 340 - Number(player.overallRank || 300);
  score += stanceAdjustment(player.stance);
  score += tagAdjustment(player.tags, round);
  score += rosterAdjustment(player, round, state);
  score += priceDisciplineAdjustment(player, round, state);
  score += injuryAdjustment(player, round);
  score += tierAdjustment(player, state);
  score += positionStrategyAdjustment(player, round, state);
  score += (player.roleConfidence - 5) * (round <= 6 ? 2.4 : 1.3);
  if (player.intelLevel === "TRANSCRIPT_RESEARCH") score += 5;
  return score;
}

function recommendationLabel(player, state = currentState()) {
  const round = currentRound(state);
  if (player.doNotReachStart && round < player.doNotReachStart) return "WAIT";
  if (player.injurySeverity >= 3 || player.stance === "INJURY_DISCOUNT_ONLY") return "DISCOUNT ONLY";
  if (["STRONG_TARGET","STRONG_TARGET_AT_DISCOUNT"].includes(player.stance)) return "TARGET";
  if (tierRemaining(player, state) <= 2) return "TIER CLIFF";
  return "GOOD PICK";
}

function recommendationReason(player, state = currentState()) {
  const reasons = [];
  const round = currentRound(state);
  const remaining = tierRemaining(player, state);

  if (skillStarterNeed(player.position, state) > 0) {
    if (player.position === "RB") reasons.push("Fills a starting RB need in a 14-team scarcity spot.");
    else if (player.position === "WR") reasons.push("Fills a starting WR need.");
    else if (player.position === "QB" && round >= 5) reasons.push("You still need a starting QB.");
    else if (player.position === "TE" && round >= 5) reasons.push("You still need a starting TE.");
  }

  if (remaining <= 2 && ["RB","WR","TE","QB"].includes(player.position)) {
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
  if (!reasons.length) reasons.push(player.thesis || "Strong combination of rank, tier, roster fit and Yahoo price.");

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
  return [...new Set(tags)].slice(0,5).map((tag) => {
    const klass = tag === "INJURY" || tag === "WEEK 1?" ? "injury" : tagClass(tag);
    return `<span class="tag ${klass}">${tag}</span>`;
  }).join("");
}

function playerPriceHtml(player) {
  const bits = [];
  if (player.targetRound) bits.push(`Target ${player.targetRound}`);
  if (yahooAdpAvailable(player)) bits.push(`Yahoo ${player.yahooAdp}`);
  return bits.length ? `<div class="player-price">${bits.join(" · ")}</div>` : "";
}

function playerButtonHtml(player, state = currentState()) {
  const drafted = isDrafted(player.id, state);
  const mine = state.myPlayers.includes(player.id);
  return `
    <button type="button" class="player-row" data-open-player="${player.id}" style="${drafted ? "opacity:.45;" : ""}">
      <div class="player-main">
        <div class="player-name">${player.name}${mine ? " ★" : ""}</div>
        <div class="player-meta">${player.position} · ${player.team} · ${player.tierLabel} · ${player.position}#${player.positionRank}</div>
        ${playerPriceHtml(player)}
        <div class="player-tags">${playerTagsHtml(player)}</div>
      </div>
      <div class="player-rank">#${player.overallRank}</div>
    </button>
  `;
}

function searchCorpus(player) {
  return [player.name,player.team,player.position,player.stance,...(player.tags||[]),...(player.aliases||[])].join(" ").toLowerCase();
}

function matchesSearch(player, state = currentState()) {
  const term = state.searchTerm.trim().toLowerCase();
  if (!term) return true;
  const compact = term.replace(/\s+/g,"");
  return searchCorpus(player).includes(term) || player.aliases.includes(compact);
}

function matchesPosition(player, state = currentState()) {
  return state.selectedPosition === "ALL" || player.position === state.selectedPosition;
}

function renderSearchResults() {
  const state = currentState();
  const card = el("searchResultsCard");
  if (!state.searchTerm.trim()) {
    card.classList.add("hidden");
    return;
  }

  const matches = players
    .filter((p) => matchesSearch(p,state))
    .filter((p) => matchesPosition(p,state))
    .filter((p) => state.showDrafted || !isDrafted(p.id,state))
    .sort((a,b) => a.overallRank - b.overallRank)
    .slice(0,15);

  el("searchResultCount").textContent = `${matches.length} found`;
  el("searchResults").innerHTML = matches.length ? matches.map((p) => playerButtonHtml(p,state)).join("") : '<p class="muted">No players found.</p>';
  card.classList.remove("hidden");
}

function renderPlayerBoard() {
  const state = currentState();
  const board = players
    .filter((p) => matchesSearch(p,state))
    .filter((p) => matchesPosition(p,state))
    .filter((p) => state.showDrafted || !isDrafted(p.id,state))
    .sort((a,b) => a.overallRank - b.overallRank);

  el("playerList").innerHTML = board.length ? board.map((p) => playerButtonHtml(p,state)).join("") : '<p class="muted">No players found.</p>';
}

function renderBestAvailable() {
  const state = currentState();
  const list = availablePlayers(state)
    .filter((p) => matchesPosition(p,state))
    .sort((a,b) => a.overallRank - b.overallRank)
    .slice(0,8);

  el("bestAvailableContext").textContent = state.selectedPosition;
  el("bestAvailableList").innerHTML = list.length ? list.map((p) => playerButtonHtml(p,state)).join("") : '<p class="muted">No players remaining.</p>';
}

function renderRecommendations() {
  const state = currentState();
  const recs = availablePlayers(state)
    .map((p) => ({...p, recommendationScore: recommendationScore(p,state)}))
    .sort((a,b) => b.recommendationScore - a.recommendationScore || a.overallRank - b.overallRank)
    .slice(0,3);

  el("recommendationContext").textContent = `R${currentRound(state)} · #${currentOverallPick(state)}`;
  el("recommendationPanel").innerHTML = recs.length ? recs.map((p,index) => {
    const label = recommendationLabel(p,state);
    const labelClass = label === "WAIT" ? "wait" : label.includes("CLIFF") ? "cliff" : "target";
    return `
      <button type="button" class="recommendation-row ${index===0 ? "top-pick" : ""}" data-open-player="${p.id}">
        <div class="recommendation-rank">${index+1}</div>
        <div class="player-main">
          <div class="player-name">${p.name} — ${p.position}</div>
          <div class="player-meta">Our #${p.overallRank} · ${p.tierLabel} · Role ${p.roleConfidence}/10</div>
          <div class="player-tags"><span class="tag ${labelClass}">${label}</span>${playerTagsHtml(p)}</div>
          <p class="recommendation-reason">${recommendationReason(p,state)}</p>
        </div>
        <div class="player-rank">#${p.overallRank}</div>
      </button>
    `;
  }).join("") : '<p class="muted">No recommendations available.</p>';
}

function renderCliffs() {
  const state = currentState();
  const candidates = ["RB","WR","TE","QB"].map((position) => {
    const list = availableAtPosition(position,state).sort((a,b) => a.overallRank - b.overallRank);
    if (!list.length) return null;
    const best = list[0];
    const sameTier = list.filter((p) => p.tierLabel === best.tierLabel);
    return {position,best,sameTier};
  }).filter(Boolean).filter((item) => item.sameTier.length <= 2);

  if (!candidates.length) {
    el("cliffCard").classList.add("hidden");
    return;
  }

  candidates.sort((a,b) => a.best.overallRank - b.best.overallRank);
  const warning = candidates[0];
  el("cliffPanel").innerHTML = `
    <p class="cliff-title">⚠ ${warning.position} CLIFF</p>
    <p class="cliff-copy">${warning.sameTier.length} player${warning.sameTier.length===1?"":"s"} remain in ${warning.best.tierLabel}: ${warning.sameTier.map((p)=>p.name).join(" and ")}.</p>
  `;
  el("cliffCard").classList.remove("hidden");
}

function renderDraftStatus() {
  const state = currentState();
  const nextPick = nextMyPick(state);
  el("draftSlotDisplay").textContent = state.draftSlot ? `#${state.draftSlot}` : "Set Slot";
  el("roundDisplay").textContent = currentRound(state);
  el("overallPickDisplay").textContent = currentOverallPick(state);
  el("nextPickDisplay").textContent = nextPick || "—";
  el("picksAwayDisplay").textContent = nextPick ? Math.max(0,nextPick-currentOverallPick(state)) : "—";
}

function historyDetails(action,index) {
  const overall = index+1;
  return {...action,overallPick:overall,round:Math.floor((overall-1)/TEAM_COUNT)+1,roundPick:pickInRound(overall),player:getPlayer(action.playerId)};
}

function renderRecentPicks() {
  const state = currentState();
  const detailed = state.history.map(historyDetails);
  const last = detailed[detailed.length-1];

  el("lastPickDisplay").textContent = !last || !last.player
    ? "No picks recorded yet"
    : `R${last.round} · #${last.overallPick} — ${last.player.name} (${last.player.position})${last.type==="myPick" ? " · MY PICK" : ""}`;

  const recent = [...detailed].reverse().slice(0,10);
  el("recentPicksList").innerHTML = recent.length ? recent.map((item) => {
    if (!item.player) return "";
    const badge = item.type === "myPick" ? '<span class="my-pick-pill">MY PICK</span>' :
      (item.simulated ? '<span class="simulated-pill">SIM</span>' : "");
    return `
      <div class="recent-pick-row">
        <div class="recent-pick-number">R${item.round} · #${item.overallPick}</div>
        <div class="recent-pick-player">${item.player.name}<small>${item.player.position} · ${item.player.team} · Round pick ${item.roundPick}</small></div>
        ${badge}
      </div>
    `;
  }).join("") : '<p class="muted" style="padding:8px 0 2px;">Your last 10 picks will appear here.</p>';

  el("recentPicksList").classList.toggle("hidden",!state.recentOpen);
  el("recentChevron").classList.toggle("open",state.recentOpen);
}

function lineupRow(label, player) {
  return `
    <div class="lineup-slot">
      <span class="lineup-slot-label">${label}</span>
      <div class="lineup-slot-player">
        ${player
          ? `<strong>${player.name}</strong><small>${player.position} · ${player.team} · Our #${player.overallRank}</small>`
          : '<span class="lineup-empty">Empty</span>'}
      </div>
    </div>
  `;
}

function renderMyRoster() {
  const state = currentState();
  const roster = getRoster(state);
  const assigned = assignRosterSlots(state);

  el("teamPickCount").textContent = `${roster.length} Pick${roster.length===1?"":"s"}`;
  el("teamModeStatus").textContent = activeMode().toUpperCase();
  el("starterRoster").innerHTML = assigned.starters.map(([label,p]) => lineupRow(label,p)).join("");

  const benchSlots = Array.from({length:6},(_,i) => assigned.bench[i] || null);
  el("benchCount").textContent = `${assigned.bench.length}/6`;
  el("benchRoster").innerHTML = benchSlots.map((p,i) => lineupRow(`BN${i+1}`,p)).join("");
  el("irRoster").innerHTML = lineupRow("IR",assigned.ir[0] || null);
}

function renderMode() {
  const mode = activeMode();
  const state = currentState();
  el("modeDisplay").textContent = mode === "mock" ? "MOCK DRAFT" : "LIVE DRAFT";
  el("modeBanner").classList.toggle("mock",mode==="mock");
  el("modeBanner").classList.toggle("live",mode!=="mock");
  el("mockModeButton").textContent = mode === "mock" ? "Mock Options" : "Start Mock";
  el("mockControlCard").classList.toggle("hidden",mode!=="mock");

  if (mode === "mock") {
    const next = nextMyPick(state);
    const onClock = next !== null && next === currentOverallPick(state);
    el("mockStatusTitle").textContent = onClock ? "You're on the clock" : "Ready to simulate";
    el("mockStatusNote").textContent = onClock ? `Pick #${currentOverallPick(state)}` : `Next mine #${next || "—"}`;
    el("simulateToNextPickButton").textContent = onClock ? "You Pick First" : "Simulate to My Pick";
    el("simulateToNextPickButton").disabled = onClock || !state.draftSlot;
  }
}

function openPlayerModal(playerId) {
  const state = currentState();
  const player = getPlayer(playerId);
  if (!player) return captureError("Open player",`Unknown player id ${playerId}`);
  selectedPlayerId = playerId;

  const unavailable = isDrafted(playerId,state);
  const remaining = tierRemaining(player,state);
  const stream = streamingInfo(player);

  el("modalPlayerContent").innerHTML = `
    <p class="eyebrow">${player.position} · ${player.team}</p>
    <h2 style="padding-right:42px;">${player.name}</h2>
    <div class="player-tags" style="margin-top:9px;">
      ${playerTagsHtml(player,remaining<=2?["CLIFF"]:[])}
      ${player.intelLevel==="TRANSCRIPT_RESEARCH" ? '<span class="tag intel">RESEARCHED</span>' : ""}
    </div>
    <div class="detail-grid">
      <div class="detail-box"><span>Our Rank</span><strong>#${player.overallRank}</strong></div>
      <div class="detail-box"><span>Position</span><strong>${player.position}#${player.positionRank}</strong></div>
      <div class="detail-box"><span>Tier</span><strong>${safeText(player.tierLabel)}</strong></div>
      <div class="detail-box"><span>Role Confidence</span><strong>${player.roleConfidence}/10</strong></div>
      <div class="detail-box"><span>Yahoo ADP</span><strong>${yahooAdpAvailable(player) ? `#${player.yahooAdp}` : "Not available"}</strong></div>
      <div class="detail-box"><span>Target Round</span><strong>${safeText(player.targetRound)}</strong></div>
      <div class="detail-box"><span>Don't Reach Before</span><strong>${safeText(player.doNotReachBeforeRound)}</strong></div>
      <div class="detail-box"><span>Stance</span><strong>${safeText(player.stance).replaceAll("_"," ")}</strong></div>
      <div class="detail-box"><span>Boone Rank</span><strong>${player.booneRankAvailable ? `#${player.booneRank}` : "—"}</strong></div>
      <div class="detail-box"><span>Week 1</span><strong>${safeText(player.week1Availability)}</strong></div>
      <div class="detail-box"><span>Durability</span><strong>${player.durabilityRisk}/5</strong></div>
    </div>
    <div class="note-box"><strong>Our Thesis</strong><br>${safeText(player.thesis,"No custom thesis yet.")}</div>
    ${yahooAdpAvailable(player) && Number.isFinite(Number(player.yahooValueGap))
      ? `<div class="note-box"><strong>Yahoo Value</strong><br>Our #${player.overallRank} vs Yahoo #${player.yahooAdp} · Gap ${player.yahooValueGap > 0 ? "+" : ""}${player.yahooValueGap}</div>`
      : ""}
    ${player.riskNote ? `<div class="note-box warning"><strong>Risk</strong><br>${player.riskNote}</div>` : ""}
    ${player.newsNote ? `<div class="note-box"><strong>News</strong><br>${player.newsNote}</div>` : ""}
    ${stream ? `<div class="note-box"><strong>Week 1 Streaming</strong><br>#${stream.rank} · vs ${safeText(stream.opponent)}${stream.grade ? ` · Grade ${stream.grade}`:""}<br>${safeText(stream.note,"")}</div>` : ""}
    <p class="player-meta" style="margin-top:10px;">Intel updated ${safeText(player.lastIntelUpdate)} · ${safeText(player.intelLevel).replaceAll("_"," ")}</p>
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
  const state = currentState();
  el("draftSlotGrid").innerHTML = Array.from({length:14},(_,i) => {
    const slot = i+1;
    return `<button type="button" class="slot-button ${state.draftSlot===slot?"selected":""}" data-slot="${slot}">${slot}</button>`;
  }).join("");
  el("slotModal").classList.remove("hidden");
}

function closeSlotModal() { el("slotModal").classList.add("hidden"); }

function openMockModal() {
  const state = currentState();
  const existingMockPicks = mockState.history.length;

  el("mockSlotNote").textContent = state.draftSlot
    ? `Current ${activeMode()} draft slot: #${state.draftSlot}`
    : "Set your draft slot first. Mock mode needs it to know when to stop.";

  el("confirmStartMockButton").disabled = !state.draftSlot;

  if (existingMockPicks > 0) {
    el("existingMockNote").textContent =
      `Saved mock found: ${existingMockPicks} recorded picks · ${mockState.myPlayers.length} of your picks.`;
    el("existingMockNote").classList.remove("hidden");
    el("resumeMockButton").classList.remove("hidden");
  } else {
    el("existingMockNote").classList.add("hidden");
    el("resumeMockButton").classList.add("hidden");
  }

  el("mockModal").classList.remove("hidden");
}

function closeMockModal() { el("mockModal").classList.add("hidden"); }

function openResetModal(action = "current") {
  pendingResetAction = action;
  el("resetStepOneButton").classList.remove("hidden");
  el("resetStepTwo").classList.add("hidden");
  resetHoldCleanup();

  if (action === "all") {
    el("resetModalTitle").textContent = "Clear All Local Data";
    el("resetModalCopy").textContent =
      "This erases Live Draft, Mock Draft, rolling backups, saved mode/settings and offline cache from this device. GitHub/source files are not changed.";
  } else {
    el("resetModalTitle").textContent = "Reset Current Draft";
    el("resetModalCopy").textContent =
      "This clears the active Live or Mock draft's players, team and pick history. Your other mode and player brain remain intact.";
  }

  el("resetModal").classList.remove("hidden");
}

function closeResetModal() {
  resetHoldCleanup();
  el("resetModal").classList.add("hidden");
}


function openBackupModal() {
  const state = currentState();
  const backups = getBackups();
  const lastSave = readLastSave();

  el("backupModalContent").innerHTML = `
    ${debugRow("Mode", activeMode().toUpperCase(), true)}
    ${debugRow("Current picks", String(state.history.length), true)}
    ${debugRow("My picks", String(state.myPlayers.length), true)}
    ${debugRow("Last verified save", lastSave ? formatSaveTime(lastSave.at) : "None", Boolean(lastSave))}
    ${debugRow("Rolling backups", String(backups.length), backups.length > 0)}
    ${debugRow("Latest backup", backups[0] ? `${backups[0].pickCount} picks` : "None", backups.length > 0)}
  `;
  el("backupModal").classList.remove("hidden");
}

function closeBackupModal() {
  el("backupModal").classList.add("hidden");
}

function createManualBackup() {
  const snap = snapshotState(activeMode(), "manual");
  if (snap) {
    markSaveSuccess(activeMode());
    renderSaveHealth();
    openBackupModal();
  }
}

function openRestoreModal() {
  const backups = getBackups();
  el("restoreBackupList").innerHTML = backups.length
    ? backups.map((backup, index) => `
        <button type="button" class="restore-item" data-restore-backup="${backup.id}">
          <strong>${index === 0 ? "Latest Backup" : `Backup ${index + 1}`} · ${backup.pickCount} picks</strong>
          <small>${backup.reason.toUpperCase()} · ${new Date(backup.createdAt).toLocaleString()}</small>
        </button>
      `).join("")
    : '<p class="muted">No backups available for this mode.</p>';

  el("restoreModal").classList.remove("hidden");
}

function closeRestoreModal() {
  el("restoreModal").classList.add("hidden");
}

function restoreBackupById(id) {
  const mode = activeMode();
  const backup = getBackups(mode).find((item) => item.id === id);
  if (!backup) return;

  if (mode === "mock") mockState = { ...defaultState(), ...backup.state, mode:"mock" };
  else liveState = { ...defaultState(), ...backup.state, mode:"live" };

  saveState(mode);
  closeRestoreModal();
  renderAll();
}

function exportState() {
  try {
    const payload = {
      exportVersion: 1,
      build: BUILD_VERSION,
      datasetVersion: brainMeta.version,
      exportedAt: new Date().toISOString(),
      activeMode: activeMode(),
      liveState,
      mockState,
      liveBackups: getBackups("live"),
      mockBackups: getBackups("mock")
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `jewel-city-draft-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    captureError("Export state", error);
  }
}

async function importStateFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);

    if (!payload || payload.exportVersion !== 1 || !payload.liveState || !payload.mockState) {
      throw new Error("This is not a valid Jewel City Draft backup file.");
    }

    liveState = { ...defaultState(), ...payload.liveState, mode:"live" };
    mockState = { ...defaultState(), ...payload.mockState, mode:"mock" };

    localStorage.setItem(storageKeyFor("live"), JSON.stringify(liveState));
    localStorage.setItem(storageKeyFor("mock"), JSON.stringify(mockState));

    if (Array.isArray(payload.liveBackups)) setBackups("live", payload.liveBackups);
    if (Array.isArray(payload.mockBackups)) setBackups("mock", payload.mockBackups);

    setActiveMode(payload.activeMode === "mock" ? "mock" : "live");
    markSaveSuccess(activeMode());
    renderAll();
    openBackupModal();
  } catch (error) {
    captureError("Import state", error);
    alert(`Import failed: ${error.message}`);
  }
}

function debugRow(label,value,ok=true) {
  return `<div class="debug-row"><span>${label}</span><strong class="${ok?"debug-ok":"debug-bad"}">${value}</strong></div>`;
}

function openDebugModal() {
  const state = currentState();
  const check = selfCheck || {};
  const stateSize = (() => { try { return JSON.stringify(state).length; } catch (_) { return 0; } })();

  el("debugContent").innerHTML = `
    ${debugRow("Build",`v${BUILD_VERSION}`,true)}
    ${debugRow("Dataset",safeText(brainMeta.version),Boolean(brainMeta.version))}
    ${debugRow("Dataset date",safeText(brainMeta.asOf),Boolean(brainMeta.asOf))}
    ${debugRow("Players loaded",String(players.length),players.length>=200)}
    ${debugRow("Mode",activeMode().toUpperCase(),true)}
    ${debugRow("Self-check",check.ok?"PASS":"FAIL",Boolean(check.ok))}
    ${debugRow("Draft slot",state.draftSlot?`#${state.draftSlot}`:"Not set",true)}
    ${debugRow("Recorded picks",String(state.history.length),true)}
    ${debugRow("Saved live picks",String(liveState.history.length),true)}
    ${debugRow("Saved mock picks",String(mockState.history.length),true)}
    ${debugRow("My players",String(state.myPlayers.length),true)}
    ${debugRow("State bytes",String(stateSize),true)}
    ${debugRow("Runtime errors",String(runtimeErrors.length),runtimeErrors.length===0)}
    <div class="debug-log">${runtimeErrors.length ? runtimeErrors.join("\n") :
      `Missing UI elements: ${(check.missingElements||[]).join(", ")||"none"}\nDuplicate IDs: ${(check.duplicateIds||[]).join(", ")||"none"}\nInvalid positions: ${(check.invalidPositions||[]).join(", ")||"none"}`}</div>
  `;
  el("debugModal").classList.remove("hidden");
}

function closeDebugModal() { el("debugModal").classList.add("hidden"); }

function recordAction(type,playerId,{simulated=false}={}) {
  const state = currentState();
  const player = getPlayer(playerId);
  if (!player || isDrafted(playerId,state)) return;

  if (type === "draftedByOther") state.draftedByOthers.push(playerId);
  if (type === "myPick") state.myPlayers.push(playerId);

  state.history.push({type,playerId,recordedAt:new Date().toISOString(),simulated});
  saveState();
  closePlayerModal();
  renderAll();
}

function undoLastAction() {
  const state = currentState();
  const action = state.history.pop();
  if (!action) return;

  if (action.type === "draftedByOther") state.draftedByOthers = state.draftedByOthers.filter((id) => id !== action.playerId);
  if (action.type === "myPick") state.myPlayers = state.myPlayers.filter((id) => id !== action.playerId);
  saveState();
  renderAll();
}

function realisticMockCandidate(state) {
  const round = currentRound(state);
  const pick = currentOverallPick(state);

  const available = availablePlayers(state).filter((p) => {
    if ((p.position === "DEF" || p.position === "K") && round < 12) return false;
    return true;
  });

  if (!available.length) return null;

  const ranked = available.map((p) => {
    const expected = yahooAdpAvailable(p)
      ? Number(p.yahooAdp) * 0.78 + Number(p.overallRank) * 0.22
      : Number(p.overallRank);

    return { player:p, expected };
  }).sort((a,b) => a.expected - b.expected);

  let windowSize;
  if (round === 1) windowSize = 4;
  else if (round <= 3) windowSize = 6;
  else if (round <= 6) windowSize = 8;
  else if (round <= 10) windowSize = 10;
  else windowSize = 14;

  const urgent = ranked.filter((item) => item.expected <= pick - 3);

  const pool = urgent.length
    ? urgent.slice(0, Math.min(3, urgent.length))
    : ranked.slice(0, Math.min(windowSize, ranked.length));

  const weighted = pool.map((item, index) => {
    const distance = Math.abs(item.expected - pick);
    const rankWeight = Math.exp(-0.62 * index);
    const distanceWeight = 1 / (1 + distance * 0.22);

    return {
      ...item,
      weight: rankWeight * distanceWeight
    };
  });

  const total = weighted.reduce((sum,item) => sum + item.weight, 0);
  let roll = Math.random() * total;

  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item.player;
  }

  return weighted[0].player;
}

function simulateToMyPick() {
  const state = currentState();
  if (activeMode() !== "mock" || !state.draftSlot) return;

  let safety = 0;
  while (safety < 300) {
    const nextMine = nextMyPick(state);
    if (nextMine === null || currentOverallPick(state) >= nextMine) break;

    const player = realisticMockCandidate(state);
    if (!player) break;

    state.draftedByOthers.push(player.id);
    state.history.push({
      type:"draftedByOther",
      playerId:player.id,
      recordedAt:new Date().toISOString(),
      simulated:true
    });
    safety += 1;
  }

  saveState("mock");
  renderAll();
}

function startFreshMock() {
  const source = currentState();
  mockState = { ...defaultState(), mode:"mock", draftSlot: source.draftSlot };
  setActiveMode("mock");
  saveState("mock");
  closeMockModal();
  renderAll();
}

function resumeMock() {
  setActiveMode("mock");
  closeMockModal();
  renderAll();
}

function returnToLive() {
  setActiveMode("live");
  closeMockModal();
  renderAll();
}

function resetCurrentMode() {
  const mode = activeMode();
  const slot = currentState().draftSlot;

  // Preserve one final snapshot before reset.
  snapshotState(mode, "pre-reset");

  const fresh = { ...defaultState(), mode, draftSlot:slot };
  if (mode === "mock") mockState = fresh;
  else liveState = fresh;

  localStorage.setItem(storageKeyFor(mode), JSON.stringify(fresh));
  markSaveSuccess(mode);
  closeResetModal();
  renderAll();
}

async function clearAllLocalData() {
  try {
    localStorage.clear();

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }

    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }

    liveState = defaultState();
    mockState = { ...defaultState(), mode:"mock" };
    setActiveMode("live");
    closeResetModal();
    renderAll();

    alert("All local draft data and offline cache were cleared from this device.");
  } catch (error) {
    captureError("Clear all local data", error);
  }
}

function resetHoldCleanup() {
  if (resetHoldTimer) clearTimeout(resetHoldTimer);
  if (resetProgressTimer) clearInterval(resetProgressTimer);
  resetHoldTimer = null;
  resetProgressTimer = null;
  resetHoldStart = null;
  const progress = el("holdResetProgress");
  if (progress) progress.style.width = "0%";
  const text = el("holdResetText");
  if (text) text.textContent = "Hold to Reset";
}

function startResetHold() {
  resetHoldCleanup();
  resetHoldStart = Date.now();
  el("holdResetText").textContent = "Keep holding…";
  resetProgressTimer = setInterval(() => {
    const elapsed = Date.now() - resetHoldStart;
    el("holdResetProgress").style.width = `${Math.min(100,elapsed/20)}%`;
  },50);

  resetHoldTimer = setTimeout(() => {
    resetHoldCleanup();
    if (pendingResetAction === "all") clearAllLocalData();
    else resetCurrentMode();
  },2000);
}

function stopResetHold() {
  if (!resetHoldStart) return;
  if (Date.now() - resetHoldStart < 1950) resetHoldCleanup();
}

function setActiveView(viewId) {
  const state = currentState();
  state.activeView = viewId;
  document.querySelectorAll(".app-view").forEach((view) => view.classList.toggle("active",view.id===viewId));
  document.querySelectorAll(".bottom-nav-button").forEach((button) => button.classList.toggle("active",button.dataset.view===viewId));
  saveState();
}

function renderAll() {
  const state = currentState();
  el("playerSearch").value = state.searchTerm || "";
  el("showDraftedToggle").checked = Boolean(state.showDrafted);

  document.querySelectorAll(".filter-button").forEach((button) => {
    button.classList.toggle("active",button.dataset.position===state.selectedPosition);
  });

  renderMode();
  renderSaveHealth();
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
  if (openPlayer) return openPlayerModal(openPlayer.dataset.openPlayer);

  const filter = event.target.closest("[data-position]");
  if (filter) {
    const state = currentState();
    state.selectedPosition = filter.dataset.position;
    saveState();
    renderAll();
    return;
  }

  const slot = event.target.closest("[data-slot]");
  if (slot) {
    currentState().draftSlot = Number(slot.dataset.slot);
    saveState();
    closeSlotModal();
    renderAll();
    return;
  }

  const restoreBackup = event.target.closest("[data-restore-backup]");
  if (restoreBackup) {
    restoreBackupById(restoreBackup.dataset.restoreBackup);
    return;
  }

  const nav = event.target.closest("[data-view]");
  if (nav) {
    setActiveView(nav.dataset.view);
    window.scrollTo({top:0,behavior:"auto"});
    return;
  }

  if (event.target.closest("[data-close-player-modal]")) return closePlayerModal();
  if (event.target.closest("[data-close-slot-modal]")) return closeSlotModal();
  if (event.target.closest("[data-close-mock-modal]")) return closeMockModal();
  if (event.target.closest("[data-close-backup-modal]")) return closeBackupModal();
  if (event.target.closest("[data-close-restore-modal]")) return closeRestoreModal();
  if (event.target.closest("[data-close-reset-modal]")) return closeResetModal();
  if (event.target.closest("[data-close-debug-modal]")) return closeDebugModal();
}

function bindStaticEvents() {
  document.addEventListener("click",handleDelegatedClick);

  el("playerSearch").addEventListener("input",(event) => {
    currentState().searchTerm = event.target.value;
    saveState();
    renderSearchResults();
    renderPlayerBoard();
  });

  el("showDraftedToggle").addEventListener("change",(event) => {
    currentState().showDrafted = event.target.checked;
    saveState();
    renderSearchResults();
    renderPlayerBoard();
  });

  el("undoButton").addEventListener("click",undoLastAction);
  el("setDraftSlotButton").addEventListener("click",openSlotModal);
  el("engineStatus").addEventListener("click",openDebugModal);
  el("mockModeButton").addEventListener("click",openMockModal);
  el("simulateToNextPickButton").addEventListener("click",simulateToMyPick);

  el("recentPicksToggle").addEventListener("click",() => {
    currentState().recentOpen = !currentState().recentOpen;
    saveState();
    renderRecentPicks();
  });

  el("draftedByOtherButton").addEventListener("click",() => {
    if (selectedPlayerId) recordAction("draftedByOther",selectedPlayerId);
  });

  el("myPickButton").addEventListener("click",() => {
    if (selectedPlayerId) recordAction("myPick",selectedPlayerId);
  });

  el("resumeMockButton").addEventListener("click",resumeMock);
  el("confirmStartMockButton").addEventListener("click",startFreshMock);
  el("resumeLiveButton").addEventListener("click",returnToLive);

  el("saveHealthButton").addEventListener("click",openBackupModal);
  el("createBackupButton").addEventListener("click",createManualBackup);
  el("restoreBackupButton").addEventListener("click",openRestoreModal);
  el("exportStateButton").addEventListener("click",exportState);
  el("importStateInput").addEventListener("change",(event) => {
    const file = event.target.files && event.target.files[0];
    importStateFile(file);
    event.target.value = "";
  });
  el("resetCurrentDraftButton").addEventListener("click",() => openResetModal("current"));
  el("clearAllLocalDataButton").addEventListener("click",() => openResetModal("all"));
  el("resetStepOneButton").addEventListener("click",() => {
    el("resetStepOneButton").classList.add("hidden");
    el("resetStepTwo").classList.remove("hidden");
  });

  const hold = el("holdResetButton");
  ["pointerdown","touchstart"].forEach((name) => hold.addEventListener(name,(event) => {
    event.preventDefault();
    startResetHold();
  },{passive:false}));
  ["pointerup","pointercancel","pointerleave","touchend","touchcancel"].forEach((name) => hold.addEventListener(name,stopResetHold));
}

async function init() {
  setEngineStatus("loading",`Engine loading v${BUILD_VERSION}…`);
  loadStates();
  await loadBrain();
  runSelfCheck();
  bindStaticEvents();
  renderAll();

  el("datasetStatus").textContent = `${players.length} PLAYERS · ${safeText(brainMeta.version)} · ${safeText(brainMeta.asOf)}`;
  setEngineStatus("ready",`Engine Ready v${BUILD_VERSION}`);
}

init().catch((error) => {
  captureError("Initialization failed",error);
  const status = el("engineStatus");
  if (status) status.addEventListener("click",openDebugModal);
});



if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker-v6-2.js", { scope: "./" })
      .then((registration) => {
        console.log("Offline service worker ready", registration.scope);
      })
      .catch((error) => captureError("Service worker", error));
  });
}
