/**
 * auth.js — Accounts, sessions, onboarding & progression for Pharaoh Slap
 *
 * Exposes a single `handleApi(req, res)` that returns true if it handled the
 * request, so server.js can delegate before falling through to static serving.
 *
 * Routes (all JSON):
 *   POST /api/register    { username, passcode }            → { token, user }
 *   POST /api/login       { username, passcode }            → { token, user }
 *   GET  /api/me          (Bearer token)                    → { user }
 *   POST /api/onboarding  (Bearer) { slapSpeed, memoryScore, priorExperience }
 *                                                           → { user }  (path assigned server-side)
 *   POST /api/progress    (Bearer) { godId, result }        → { user }  (validated, anti-spoof)
 */
"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");

// JWT secret: set JWT_SECRET in prod. Falls back to an ephemeral random secret
// in dev (tokens won't survive a restart — fine for local testing).
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
const TOKEN_TTL = "30d";

// God ladder order — index = tutorial_stage milestone.
// (v7.3 ladder: Anubis teaches doubles+sandwiches, Set is The Professor with
// sequences, Apep retired. Old 'apep' progress rows are harmless orphans.)
const GODS = ["thoth", "anubis", "horus", "set", "seshat", "ra"];

// ─── COSMETICS CATALOG (server-authoritative; client mirrors in cosmetics.js) ─
// kind: 'skin' = card back, 'fx' = slap effect. weight drives pack rolls.
const CATALOG = [
  { id: "skin_tiedye",  kind: "skin", value: "tiedye",  name: "Tie-Dye",       rarity: "starter", weight: 0 },
  { id: "skin_egypt",   kind: "skin", value: "egypt",   name: "Lapis Seal",    rarity: "starter", weight: 0 },
  { id: "skin_scarab",  kind: "skin", value: "scarab",  name: "Scarab Shell",  rarity: "common",  weight: 24 },
  { id: "skin_nile",    kind: "skin", value: "nile",    name: "Nile at Dusk",  rarity: "common",  weight: 24 },
  { id: "skin_sunboat", kind: "skin", value: "sunboat", name: "Solar Barque",  rarity: "rare",    weight: 12 },
  { id: "skin_duat",    kind: "skin", value: "duat",    name: "The Duat",      rarity: "epic",    weight: 5 },
  { id: "fx_burst",     kind: "fx",   value: "burst",   name: "Gold Burst",    rarity: "common",  weight: 24 },
  { id: "fx_bolt",      kind: "fx",   value: "bolt",    name: "Set's Bolt",    rarity: "common",  weight: 24 },
  { id: "fx_scarabs",   kind: "fx",   value: "scarabs", name: "Scarab Swarm",  rarity: "rare",    weight: 12 },
  { id: "fx_flames",    kind: "fx",   value: "flames",  name: "Ra's Flames",   rarity: "rare",    weight: 12 },
  { id: "fx_ankhs",     kind: "fx",   value: "ankhs",   name: "Rain of Ankhs", rarity: "epic",    weight: 5 },
  { id: "fx_eclipse",   kind: "fx",   value: "eclipse", name: "Black Sun",     rarity: "epic",    weight: 4 },
  // Charged-play effects (the drama meter's payoff) — deliberately rare drops.
  { id: "play_comet",   kind: "play", value: "comet",   name: "Comet Trail",   rarity: "rare",    weight: 8 },
  { id: "play_sands",   kind: "play", value: "sands",   name: "Desert Vortex", rarity: "rare",    weight: 8 },
  { id: "play_storm",   kind: "play", value: "storm",   name: "Storm of Set",  rarity: "epic",    weight: 4 },
  // Table backgrounds: green/red/blue are free in Settings; these drop in packs.
  { id: "table_gold",   kind: "table", value: "gold",   name: "Gilded Hall",   rarity: "rare",    weight: 10 },
  { id: "table_duatbg", kind: "table", value: "duatbg", name: "Duat Void",     rarity: "epic",    weight: 5 },
  // Card charms: placed on INDIVIDUAL cards of the player's choosing.
  { id: "charm_scarab", kind: "charm", value: "scarab", name: "Scarab Seal",   rarity: "common",  weight: 18 },
  { id: "charm_lotus",  kind: "charm", value: "lotus",  name: "Lotus Bloom",   rarity: "common",  weight: 18 },
  { id: "charm_gild",   kind: "charm", value: "gild",   name: "Gold Leaf",     rarity: "rare",    weight: 10 },
  { id: "charm_eye",    kind: "charm", value: "eye",    name: "Eye of Horus",  rarity: "rare",    weight: 10 },
  { id: "charm_aten",   kind: "charm", value: "aten",   name: "Aten's Halo",   rarity: "epic",    weight: 5 },
  // ── PREMIUM (weight 0 = never rolls in free packs; store bundles only) ──
  { id: "skin_pharaoh",    kind: "skin",  value: "pharaoh",  name: "Pharaoh's Gold",  rarity: "premium", weight: 0 },
  { id: "charm_cartouche", kind: "charm", value: "cartouche",name: "Royal Cartouche", rarity: "premium", weight: 0 },
  { id: "fx_crowns",       kind: "fx",    value: "crowns",   name: "Crown Rain",      rarity: "premium", weight: 0 },
  { id: "skin_anubisn",    kind: "skin",  value: "anubisn",  name: "Anubis Night",    rarity: "premium", weight: 0 },
  { id: "table_necro",     kind: "table", value: "necro",    name: "Necropolis",      rarity: "premium", weight: 0 },
  { id: "fx_souls",        kind: "fx",    value: "souls",    name: "Soul Wisps",      rarity: "premium", weight: 0 },
  { id: "skin_stars",      kind: "skin",  value: "stars",    name: "Star Field",      rarity: "premium", weight: 0 },
  { id: "play_nova",       kind: "play",  value: "nova",     name: "Supernova",       rarity: "premium", weight: 0 },
  { id: "charm_moon",      kind: "charm", value: "moon",     name: "Khonsu's Moon",   rarity: "premium", weight: 0 },
  // ── SEASONAL (Season 1 "The Inundation" — granted by the season ladder) ──
  { id: "skin_reedboat", kind: "skin",  value: "reedboat", name: "Reed Boat",     rarity: "seasonal", weight: 0 },
  { id: "charm_fish",    kind: "charm", value: "fish",     name: "Nile Fish",     rarity: "seasonal", weight: 0 },
  { id: "skin_flood",    kind: "skin",  value: "flood",    name: "Floodwater",    rarity: "seasonal", weight: 0 },
  { id: "fx_deluge",     kind: "fx",    value: "deluge",   name: "Deluge",        rarity: "seasonal", weight: 0 },
  { id: "play_tide",     kind: "play",  value: "tide",     name: "The Tide",      rarity: "seasonal", weight: 0 },
  { id: "table_sunken",  kind: "table", value: "sunken",   name: "Sunken Hall",   rarity: "seasonal", weight: 0 },
  { id: "charm_lily",    kind: "charm", value: "lily",     name: "Flood Lily",    rarity: "seasonal", weight: 0 },
];
const CARD_KEY_RE = /^([2-9]|1[0-4])-(spades|hearts|diamonds|clubs)$/;

// ─── STORE (premium bundles — $2.99 each, deterministic contents) ────────────
// Payments: POST /api/store/checkout is the seam. Until a provider (Stripe /
// App Store) is wired, it grants only when DEV_FREE_PURCHASES=1 (testing) and
// otherwise answers 501 so the client can show a friendly "coming at launch".
const STORE = [
  { id: "pack_royal",     name: "Royal Treasury",    priceCents: 299,
    tagline: "Gold for the worthy",
    items: ["skin_pharaoh", "charm_cartouche", "fx_crowns"] },
  { id: "pack_duat",      name: "Night of the Duat", priceCents: 299,
    tagline: "What waits below",
    items: ["skin_anubisn", "table_necro", "fx_souls"] },
  { id: "pack_celestial", name: "Celestial Bundle",  priceCents: 299,
    tagline: "The sky, purchased",
    items: ["skin_stars", "play_nova", "charm_moon"] },
];
const STORE_BY_ID = Object.fromEntries(STORE.map((p) => [p.id, p]));

// ─── SEASON 1 — "The Inundation" ─────────────────────────────────────────────
// 8 weeks, 30 tiers, tier = season XP / 150 (season XP mirrors match XP).
// Pass = $4.99 product through the same checkout seam (pack_season1).
const SEASON = {
  id: "s1",
  name: "The Inundation",
  tagline: "The Nile rises",
  start: "2026-06-11T00:00:00Z",
  end: "2026-08-06T00:00:00Z",
  tiers: 30,
  xpPerTier: 150,
};
STORE.push({ id: "pack_season1", name: "Season 1 Pass — The Inundation",
  priceCents: 499, tagline: "All 30 tiers of the flood", season: SEASON.id, items: [] });
STORE_BY_ID.pack_season1 = STORE[STORE.length - 1];

// reward = { packs: n } and/or { item: catalogId } and/or { title: str }
const SEASON_REWARDS = {
  1:  { pass: { item: "skin_flood" } },
  2:  { free: { packs: 1 } },
  3:  { pass: { packs: 1 } },
  5:  { free: { packs: 1 } },
  6:  { pass: { packs: 1 } },
  8:  { free: { packs: 1 }, pass: { item: "fx_deluge" } },
  10: { free: { item: "skin_reedboat" } },
  12: { pass: { packs: 2 } },
  13: { free: { packs: 1 } },
  15: { pass: { packs: 2 } },
  16: { free: { packs: 2 }, pass: { item: "play_tide" } },
  18: { pass: { packs: 2 } },
  20: { free: { packs: 2 } },
  21: { pass: { packs: 2 } },
  24: { pass: { item: "table_sunken" } },
  25: { free: { item: "charm_fish" } },
  27: { pass: { packs: 3 } },
  28: { free: { packs: 2 } },
  30: { free: { packs: 3 }, pass: { item: "charm_lily", title: "Bearer of the Flood" } },
};

function ensureSeason(user) {
  if (user.season_id !== SEASON.id) return db.resetSeason(user.id, SEASON.id);
  return user;
}
function seasonTier(u) {
  return Math.min(SEASON.tiers, Math.floor((u.season_xp || 0) / SEASON.xpPerTier));
}
function seasonClaimed(u) {
  try { const a = JSON.parse(u.season_claimed || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}
function seasonPublic(u) {
  return {
    id: SEASON.id, name: SEASON.name, tagline: SEASON.tagline, endsAt: SEASON.end,
    tiers: SEASON.tiers, xpPerTier: SEASON.xpPerTier,
    xp: u.season_xp || 0, tier: seasonTier(u),
    claimed: seasonClaimed(u), pass: !!u.season_pass,
    rewards: SEASON_REWARDS,
  };
}
const STARTERS = CATALOG.filter((c) => c.rarity === "starter").map((c) => c.id);
const CATALOG_BY_ID = Object.fromEntries(CATALOG.map((c) => [c.id, c]));
const PACK_SIZE = 3;
const GAMES_PER_PACK = 5;

// ─── LEVELING ────────────────────────────────────────────────────────────────
// Need 120 XP for level 2, +60 more per level after. A win pays 60 + 2/slap.
function levelFromXp(xp) {
  let level = 1, rem = Math.max(0, xp | 0), need = 120;
  while (rem >= need) { rem -= need; level++; need = 120 + 60 * (level - 1); }
  return { level, into: rem, next: need };
}
function xpForMatch(r) {
  const slaps = clampNum(r.slaps, 0, 50);
  return (r.won ? 60 : 25) + Math.min(30, slaps * 2);
}

function ownedOf(u) {
  let arr;
  try { arr = JSON.parse(u.cosmetics || "[]"); } catch { arr = []; }
  const set = new Set(Array.isArray(arr) ? arr : []);
  STARTERS.forEach((s) => set.add(s)); // starters are always owned
  return set;
}
function equippedOf(u) {
  try { return JSON.parse(u.equipped || "{}") || {}; } catch { return {}; }
}
function rollPack(owned) {
  const items = [];
  for (let i = 0; i < PACK_SIZE; i++) {
    const pool = CATALOG.filter((c) => c.weight > 0 && !owned.has(c.id) && !items.some((x) => x.id === c.id));
    if (!pool.length) { items.push({ duplicate: true, xp: 40 }); continue; } // collection complete → XP
    let t = Math.random() * pool.reduce((s, c) => s + c.weight, 0);
    const pick = pool.find((c) => (t -= c.weight) <= 0) || pool[pool.length - 1];
    items.push({ id: pick.id, kind: pick.kind, value: pick.value, name: pick.name, rarity: pick.rarity });
    owned.add(pick.id);
  }
  return items;
}

// ─── PATH ASSIGNMENT (design spec §3.1, verbatim logic) ──────────────────────
function assignTutorialPath(onboarding) {
  const { slapSpeed, memoryScore, priorExperience } = onboarding;
  if (
    priorExperience === "yes" &&
    memoryScore === "strong" &&
    slapSpeed === "instinctive"
  ) {
    return "ascendant"; // Path III
  }
  if (
    priorExperience === "something_like_it" ||
    memoryScore !== "needs_reinforcement"
  ) {
    return "contender"; // Path II
  }
  return "initiate"; // Path I
}

// ─── VALIDATION ──────────────────────────────────────────────────────────────
const SLAP_SPEEDS = new Set(["instinctive", "cautious", "observant"]);
const MEMORY_SCORES = new Set(["strong", "average", "needs_reinforcement"]);
const PRIOR_EXP = new Set(["yes", "no", "something_like_it"]);

function validUsername(u) {
  return typeof u === "string" && /^[A-Za-z0-9_]{3,20}$/.test(u);
}
function validPasscode(p) {
  return typeof p === "string" && p.length >= 4 && p.length <= 64;
}

// ─── SHAPING ─────────────────────────────────────────────────────────────────
function publicUser(u) {
  if (!u) return null;
  const progress = db.getProgress(u.id).map((p) => ({
    godId: p.god_id,
    stars: p.stars,
    bestStats: p.best_stats ? JSON.parse(p.best_stats) : null,
    completedAt: p.completed_at,
  }));
  const lv = levelFromXp(u.xp || 0);
  return {
    id: u.id,
    username: u.username,
    tutorialPath: u.tutorial_path,
    tutorialStage: u.tutorial_stage,
    tutorialComplete: !!u.tutorial_complete,
    progress,
    xp: u.xp || 0,
    level: lv.level,
    levelInto: lv.into,
    levelNext: lv.next,
    games: u.games || 0,
    wins: u.wins || 0,
    cardsPlayed: u.cards_played || 0,
    slapsLanded: u.slaps_landed || 0,
    packs: u.packs || 0,
    cosmetics: [...ownedOf(u)],
    equipped: equippedOf(u),
    season: seasonPublic(u),
  };
}

function sign(user) {
  return jwt.sign({ uid: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

// ─── HTTP PLUMBING ───────────────────────────────────────────────────────────
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e5) req.destroy(); // 100KB cap
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

function authUser(req) {
  const h = req.headers["authorization"] || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    return db.getUserById(payload.uid) || null;
  } catch {
    return null;
  }
}

// ─── ROUTE HANDLER ───────────────────────────────────────────────────────────
async function handleApi(req, res) {
  const url = req.url.split("?")[0];
  if (!url.startsWith("/api/")) return false;

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return true;
  }

  // ── POST /api/register ─────────────────────────────────────────────────────
  if (url === "/api/register" && req.method === "POST") {
    const body = await readBody(req);
    if (!body) return sendJson(res, 400, { error: "BAD_JSON" }), true;
    const { username, passcode } = body;
    if (!validUsername(username))
      return sendJson(res, 400, { error: "BAD_USERNAME", message: "3–20 letters, numbers, underscore." }), true;
    if (!validPasscode(passcode))
      return sendJson(res, 400, { error: "BAD_PASSCODE", message: "Passcode must be 4–64 characters." }), true;
    if (db.getUserByName(username))
      return sendJson(res, 409, { error: "USERNAME_TAKEN", message: "That name is already claimed." }), true;
    const hash = bcrypt.hashSync(passcode, 10);
    const user = db.createUser(username, hash);
    return sendJson(res, 201, { token: sign(user), user: publicUser(user) }), true;
  }

  // ── POST /api/login ────────────────────────────────────────────────────────
  if (url === "/api/login" && req.method === "POST") {
    const body = await readBody(req);
    if (!body) return sendJson(res, 400, { error: "BAD_JSON" }), true;
    const { username, passcode } = body;
    const user = db.getUserByName(String(username || ""));
    if (!user || !bcrypt.compareSync(String(passcode || ""), user.passcode_hash))
      return sendJson(res, 401, { error: "BAD_CREDENTIALS", message: "Wrong name or passcode." }), true;
    return sendJson(res, 200, { token: sign(user), user: publicUser(user) }), true;
  }

  // ── GET /api/me ────────────────────────────────────────────────────────────
  if (url === "/api/me" && req.method === "GET") {
    const user = authUser(req);
    if (!user) return sendJson(res, 401, { error: "UNAUTHORIZED" }), true;
    return sendJson(res, 200, { user: publicUser(user) }), true;
  }

  // ── POST /api/onboarding ───────────────────────────────────────────────────
  if (url === "/api/onboarding" && req.method === "POST") {
    const user = authUser(req);
    if (!user) return sendJson(res, 401, { error: "UNAUTHORIZED" }), true;
    const body = await readBody(req);
    if (!body) return sendJson(res, 400, { error: "BAD_JSON" }), true;
    const { slapSpeed, memoryScore, priorExperience } = body;
    if (
      !SLAP_SPEEDS.has(slapSpeed) ||
      !MEMORY_SCORES.has(memoryScore) ||
      !PRIOR_EXP.has(priorExperience)
    )
      return sendJson(res, 400, { error: "BAD_ONBOARDING" }), true;
    const path = assignTutorialPath({ slapSpeed, memoryScore, priorExperience });
    const updated = db.saveOnboarding(user.id, {
      path,
      slapSpeed,
      memoryScore,
      priorExperience,
    });
    // Path intentionally NOT echoed as a headline — client reveals it as an
    // earned title later (design spec §3.2). It's present in publicUser though.
    return sendJson(res, 200, { user: publicUser(updated) }), true;
  }

  // ── POST /api/progress ─────────────────────────────────────────────────────
  if (url === "/api/progress" && req.method === "POST") {
    const user = authUser(req);
    if (!user) return sendJson(res, 401, { error: "UNAUTHORIZED" }), true;
    const body = await readBody(req);
    if (!body) return sendJson(res, 400, { error: "BAD_JSON" }), true;
    const { godId, result } = body;
    if (!GODS.includes(godId))
      return sendJson(res, 400, { error: "BAD_GOD" }), true;

    // Anti-spoof: only award on a genuine win payload, and clamp the values
    // the client could otherwise inflate. (Tighten further once gameplay emits
    // a signed result token — see spec §5.)
    if (!result || result.won !== true)
      return sendJson(res, 400, { error: "NOT_A_WIN" }), true;

    const prior = db.getProgress(user.id).find((p) => p.god_id === godId);
    const firstClear = !prior || !prior.stars;

    const stars = computeStars(result);
    const bestStats = {
      fastestSlap: clampNum(result.fastestSlap, 0, 60000),
      pileWins: clampNum(result.pileWins, 0, 1000),
      falseSlaps: clampNum(result.falseSlaps, 0, 1000),
      duration: clampNum(result.duration, 0, 86400),
    };
    db.recordProgress(user.id, godId, stars, bestStats);

    // Advance tutorial_stage to at least this god's index + 1.
    const idx = GODS.indexOf(godId);
    const newStage = Math.max(user.tutorial_stage, idx + 1);
    const wasComplete = !!user.tutorial_complete;
    const complete = newStage >= GODS.length ? 1 : 0;
    db.setStage(user.id, newStage, complete);

    // First-clear bounty: every trial pays big; Ra pays bigger; finishing the
    // whole path pays a crown on top. Re-clears earn nothing here (no farming).
    const gained = { xp: 0, packs: 0, firstClear: false, pathComplete: false };
    if (firstClear) {
      gained.firstClear = true;
      gained.xp = godId === "ra" ? 600 : 250;
      gained.packs = godId === "ra" ? 4 : 2;
      const clearedAll = GODS.every((g) =>
        g === godId || db.getProgress(user.id).some((p) => p.god_id === g && p.stars > 0));
      if (clearedAll && !wasComplete) {
        gained.pathComplete = true;
        gained.xp += 500;
        gained.packs += 3;
      }
      db.grantXpAndPacks(user.id, gained.xp, gained.packs);
      ensureSeason(user);
      db.addSeasonXp(user.id, gained.xp);
    }

    return sendJson(res, 200, { user: publicUser(db.getUserById(user.id)), gained }), true;
  }

  // ── GET /api/store — premium catalog with ownership flags ──────────────────
  if (url === "/api/store" && req.method === "GET") {
    const user = authUser(req);
    const owned = user ? ownedOf(user) : new Set();
    return sendJson(res, 200, {
      packs: STORE.map((p) => ({
        id: p.id, name: p.name, tagline: p.tagline, priceCents: p.priceCents,
        items: p.items.map((id) => {
          const c = CATALOG_BY_ID[id];
          return { id, kind: c.kind, value: c.value, name: c.name, owned: owned.has(id) };
        }),
        owned: p.items.every((id) => owned.has(id)),
      })),
    }), true;
  }

  // ── POST /api/store/checkout — the payment seam ─────────────────────────────
  if (url === "/api/store/checkout" && req.method === "POST") {
    const user = authUser(req);
    if (!user) return sendJson(res, 401, { error: "UNAUTHORIZED" }), true;
    const body = await readBody(req);
    if (!body) return sendJson(res, 400, { error: "BAD_JSON" }), true;
    const pack = STORE_BY_ID[String(body.packId || "")];
    if (!pack) return sendJson(res, 400, { error: "BAD_PACK" }), true;
    const owned = ownedOf(user);
    // (season passes have no item list — their ownership check lives below)
    if (!pack.season && pack.items.length && pack.items.every((id) => owned.has(id)))
      return sendJson(res, 400, { error: "ALREADY_OWNED", message: "You already own this bundle." }), true;

    // Season pass purchase (no items — sets the pass flag instead)
    if (pack.season) {
      ensureSeason(user);
      const fresh = db.getUserById(user.id);
      if (fresh.season_pass)
        return sendJson(res, 400, { error: "ALREADY_OWNED", message: "You already hold this season's pass." }), true;
      if (process.env.DEV_FREE_PURCHASES === "1") {
        db.setSeasonPass(user.id);
        const updated = db.recordPurchase(user.id, { packId: pack.id, cents: 0, mode: "dev", at: new Date().toISOString() });
        return sendJson(res, 200, { granted: true, user: publicUser(updated) }), true;
      }
      return sendJson(res, 501, {
        error: "PAYMENTS_NOT_CONFIGURED",
        message: "The treasury opens at launch — purchases aren't live yet.",
      }), true;
    }

    // DEV/test grant — lets the full flow be exercised before payments launch.
    if (process.env.DEV_FREE_PURCHASES === "1") {
      pack.items.forEach((id) => owned.add(id));
      db.setEconomy(user.id, { packs: user.packs || 0, cosmetics: [...owned], equipped: equippedOf(user) });
      const updated = db.recordPurchase(user.id, { packId: pack.id, cents: 0, mode: "dev", at: new Date().toISOString() });
      return sendJson(res, 200, { granted: true, user: publicUser(updated) }), true;
    }
    // TODO(payments): create a Stripe Checkout session / App Store transaction
    // here, grant via verified webhook, then recordPurchase with real cents.
    return sendJson(res, 501, {
      error: "PAYMENTS_NOT_CONFIGURED",
      message: "The treasury opens at launch — purchases aren't live yet.",
    }), true;
  }

  // ── GET /api/season — current season state for this player ─────────────────
  if (url === "/api/season" && req.method === "GET") {
    const user0 = authUser(req);
    if (!user0) return sendJson(res, 401, { error: "UNAUTHORIZED" }), true;
    ensureSeason(user0);
    return sendJson(res, 200, { season: seasonPublic(db.getUserById(user0.id)) }), true;
  }

  // ── POST /api/season/claim — claim a reached tier (free + pass tracks) ─────
  if (url === "/api/season/claim" && req.method === "POST") {
    const user0 = authUser(req);
    if (!user0) return sendJson(res, 401, { error: "UNAUTHORIZED" }), true;
    ensureSeason(user0);
    const body = await readBody(req);
    if (!body) return sendJson(res, 400, { error: "BAD_JSON" }), true;
    const tier = clampNum(body.tier, 1, SEASON.tiers);
    const u = db.getUserById(user0.id);
    if (tier > seasonTier(u))
      return sendJson(res, 400, { error: "TIER_NOT_REACHED" }), true;
    const claimed = seasonClaimed(u);
    if (claimed.includes(tier))
      return sendJson(res, 400, { error: "ALREADY_CLAIMED" }), true;
    const r = SEASON_REWARDS[tier] || {};
    const grants = [r.free, u.season_pass ? r.pass : null].filter(Boolean);
    if (!grants.length && !r.pass)
      return sendJson(res, 400, { error: "NO_REWARD" }), true;
    let packs = 0;
    const owned = ownedOf(u);
    for (const g of grants) {
      if (g.packs) packs += g.packs;
      if (g.item && CATALOG_BY_ID[g.item]) owned.add(g.item);
    }
    db.setEconomy(u.id, { packs: (u.packs || 0) + packs, cosmetics: [...owned], equipped: equippedOf(u) });
    claimed.push(tier);
    const updated = db.claimSeasonTier(u.id, claimed);
    return sendJson(res, 200, {
      user: publicUser(updated),
      gained: { packs, items: grants.filter((g) => g.item).map((g) => g.item),
        passLocked: !u.season_pass && !!r.pass },
    }), true;
  }

  // ── POST /api/match — any finished match: XP, totals, pack drip ────────────
  if (url === "/api/match" && req.method === "POST") {
    const user = authUser(req);
    if (!user) return sendJson(res, 401, { error: "UNAUTHORIZED" }), true;
    const body = await readBody(req);
    if (!body) return sendJson(res, 400, { error: "BAD_JSON" }), true;
    const won = body.won === true;
    const xp = xpForMatch({ won, slaps: body.slaps });
    const beforeLv = levelFromXp(user.xp || 0).level;
    const gamesAfter = (user.games || 0) + 1;
    let packs = gamesAfter % GAMES_PER_PACK === 0 ? 1 : 0; // every 5th game
    const afterLv = levelFromXp((user.xp || 0) + xp).level;
    packs += Math.max(0, afterLv - beforeLv);              // +1 per level-up
    ensureSeason(user);
    const updated0 = db.addMatch(user.id, {
      xp, won,
      cards: clampNum(body.cards, 0, 200),
      slaps: clampNum(body.slaps, 0, 50),
      packs,
    });
    db.addSeasonXp(user.id, xp);
    const updated = db.getUserById(user.id);
    return sendJson(res, 200, {
      user: publicUser(updated),
      gained: { xp, packs, leveledUp: afterLv > beforeLv },
    }), true;
  }

  // ── POST /api/pack/open — consume one pack, roll cosmetics server-side ─────
  if (url === "/api/pack/open" && req.method === "POST") {
    const user = authUser(req);
    if (!user) return sendJson(res, 401, { error: "UNAUTHORIZED" }), true;
    if ((user.packs || 0) < 1)
      return sendJson(res, 400, { error: "NO_PACKS", message: "No packs to open — play more games!" }), true;
    const owned = ownedOf(user);
    const items = rollPack(owned);
    const bonusXp = items.filter((i) => i.duplicate).reduce((s, i) => s + i.xp, 0);
    let updated = db.setEconomy(user.id, {
      packs: (user.packs || 0) - 1,
      cosmetics: [...owned],
      equipped: equippedOf(user),
    });
    if (bonusXp) updated = db.grantXpAndPacks(user.id, bonusXp, 0);
    return sendJson(res, 200, { items, user: publicUser(updated) }), true;
  }

  // ── POST /api/equip — set active card back / slap effect ───────────────────
  if (url === "/api/equip" && req.method === "POST") {
    const user = authUser(req);
    if (!user) return sendJson(res, 401, { error: "UNAUTHORIZED" }), true;
    const body = await readBody(req);
    if (!body) return sendJson(res, 400, { error: "BAD_JSON" }), true;
    const owned = ownedOf(user);
    const eq = equippedOf(user);
    for (const key of ["skin", "fx", "play", "table"]) {
      if (body[key] === undefined) continue;
      if (body[key] === null) { delete eq[key]; continue; }
      const item = CATALOG_BY_ID[String(body[key])];
      if (!item || item.kind !== key || !owned.has(item.id))
        return sendJson(res, 400, { error: "NOT_OWNED" }), true;
      eq[key] = item.id;
    }
    // Per-card charm placements: { cards: { "14-spades": "charm_gild" | null } }
    if (body.cards && typeof body.cards === "object") {
      eq.cards = eq.cards && typeof eq.cards === "object" ? eq.cards : {};
      for (const [k, v] of Object.entries(body.cards)) {
        if (!CARD_KEY_RE.test(k)) continue;
        if (v === null) { delete eq.cards[k]; continue; }
        const item = CATALOG_BY_ID[String(v)];
        if (!item || item.kind !== "charm" || !owned.has(item.id)) continue;
        eq.cards[k] = item.id;
      }
      const keys = Object.keys(eq.cards);
      if (keys.length > 52) keys.slice(52).forEach((k) => delete eq.cards[k]);
    }
    const updated = db.setEconomy(user.id, { packs: user.packs || 0, cosmetics: [...owned], equipped: eq });
    return sendJson(res, 200, { user: publicUser(updated) }), true;
  }

  return sendJson(res, 404, { error: "NOT_FOUND" }), true;
}

// ─── STAR RULES ──────────────────────────────────────────────────────────────
// Competitive but reachable: the win itself is a star; play clean-ish OR fast
// for the second; clean AND brisk for the third.
//   1★  win the trial
//   2★  ≤2 false slaps OR finish under 4 minutes
//   3★  ≤1 false slap AND finish under 3 minutes
function computeStars(result) {
  const falseSlaps = clampNum(result.falseSlaps, 0, 1e6);
  const duration = clampNum(result.duration, 0, 86400); // seconds; 0 = unreported
  let stars = 1;
  if (falseSlaps <= 2 || (duration > 0 && duration <= 240)) stars = 2;
  if (falseSlaps <= 1 && duration > 0 && duration <= 180) stars = 3;
  return stars;
}
function clampNum(n, lo, hi) {
  n = Number(n);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

// ─── MASTER ACCOUNT SEED ─────────────────────────────────────────────────────
// Dev/QA account, created (or topped up) at boot: onboarding done, every god
// beaten at 3 stars, trials complete. Idempotent — recordProgress keeps MAX(stars).
//   MASTER_USER / MASTER_PASSCODE  override the credentials (set these in prod!)
//   MASTER_DISABLE=1               skips the seed entirely (public launch)
(function seedMasterAccount() {
  if (process.env.MASTER_DISABLE === "1") return;
  const name = process.env.MASTER_USER || "Pharaoh";
  const pass = process.env.MASTER_PASSCODE || "ankh1234";
  try {
    let u = db.getUserByName(name);
    if (!u) u = db.createUser(name, bcrypt.hashSync(pass, 10));
    db.saveOnboarding(u.id, {
      path: "ascendant",
      slapSpeed: "instinctive",
      memoryScore: "strong",
      priorExperience: "yes",
    });
    db.setStage(u.id, GODS.length, true);
    for (const g of GODS)
      db.recordProgress(u.id, g, 3, { fastestSlap: 250, pileWins: 12, falseSlaps: 0, duration: 120 });
    // Full collection, flashiest gear equipped, a healthy level, spare packs.
    db.setEconomy(u.id, {
      packs: 5,
      cosmetics: CATALOG.map((c) => c.id),
      equipped: { skin: "skin_duat", fx: "fx_ankhs", play: "play_storm",
        cards: { "14-spades": "charm_gild", "12-hearts": "charm_eye" } },
    });
    if ((db.getUserById(u.id).xp || 0) < 5000) db.grantXpAndPacks(u.id, 5000, 0);
    console.log(`[auth] master account '${name}' ready — all trials + cosmetics unlocked`);
  } catch (e) {
    console.warn("[auth] master account seed failed:", e.message);
  }
})();

module.exports = { handleApi, assignTutorialPath, GODS };
