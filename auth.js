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
const GODS = ["thoth", "set", "anubis", "horus", "apep", "seshat", "ra"];

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
  return {
    id: u.id,
    username: u.username,
    tutorialPath: u.tutorial_path,
    tutorialStage: u.tutorial_stage,
    tutorialComplete: !!u.tutorial_complete,
    progress,
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

    const stars = computeStars(result);
    const bestStats = {
      fastestSlap: clampNum(result.fastestSlap, 0, 60000),
      pileWins: clampNum(result.pileWins, 0, 1000),
      falseSlaps: clampNum(result.falseSlaps, 0, 1000),
    };
    db.recordProgress(user.id, godId, stars, bestStats);

    // Advance tutorial_stage to at least this god's index + 1.
    const idx = GODS.indexOf(godId);
    const newStage = Math.max(user.tutorial_stage, idx + 1);
    const complete = newStage >= GODS.length ? 1 : 0;
    db.setStage(user.id, newStage, complete);

    return sendJson(res, 200, { user: publicUser(db.getUserById(user.id)) }), true;
  }

  return sendJson(res, 404, { error: "NOT_FOUND" }), true;
}

// ─── STAR RULES (spec §8 open thread — sensible defaults, tune later) ─────────
function computeStars(result) {
  let stars = 1; // a win is always worth one
  if (clampNum(result.falseSlaps, 0, 1e6) === 0) stars++; // clean hands
  if (clampNum(result.fastestSlap, 1, 1e9) > 0 && result.fastestSlap < 400) stars++; // sharp
  return Math.min(3, stars);
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
      db.recordProgress(u.id, g, 3, { fastestSlap: 250, pileWins: 12, falseSlaps: 0 });
    console.log(`[auth] master account '${name}' ready — all trials unlocked`);
  } catch (e) {
    console.warn("[auth] master account seed failed:", e.message);
  }
})();

module.exports = { handleApi, assignTutorialPath, GODS };
