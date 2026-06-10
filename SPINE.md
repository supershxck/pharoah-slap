# Pharaoh Slap — Spine

One document, three folders. This is the backbone of the project: what each version is, what it carries, and where the live edge sits.

> **Live edge (June 9, 2026): this folder, `pharaoh-slap-v7.2`.** Convergence is done and v7.2 has since moved *ahead* of v7/v7.1 — it now carries a git repo (pushed to `github.com/supershxck/pharaoh-slap`), a tenth client module, new slap rules, and a seeded master account. v7 and v7.1 are frozen history; nothing below this line should be edited there.

## The lineage

All three folders descend from the same merge: **v7's modular client** (clean SPA shell, N-agnostic card engine) fused with **v6.2's working systems** (authoritative WebSocket server, JWT accounts, SQLite progression). The differences between them are thin layers of polish and packaging, not architecture.

```
v6.2 (monolith, working systems)
        │  merged into
v7 modular client
        │
   ┌────┴─────────┬──────────────┐
pharaoh-slapv7   pharaoh-slapv7.1   pharaoh-slap-v7.2
(latest polish)  (pre-noscript)     (Docker packaging)
```

## What every version shares

The common spine — identical across all three folders:

- **Client** — `Pharaoh Slap.html` SPA shell, `css/`, and the `PS` modules in `js/`: `app`, `ui`, `engine` (local card engine, slap rules incl. double/sandwich — and in v7.2, marriage/divorce), `match` (controller with `PS.activeController` indirection), `auth` (login veil, JWT, guest offline path), `weighing` (3-trial onboarding: Instinct / Memory / Experience), `ladder` (7-god progression, stars, one-time title reveal), `net` (server-authoritative online play), `tweaks` — plus, in v7.2 only, `rules` (in-game rules panel + first-match tutorial).
- **Server** — `server.js` (HTTP static + WebSocket game server, server runs the game and arbitrates slaps; client sends only `PLAY_CARD`/`SLAP`), `auth.js` (accounts/JWT/onboarding API), `db.js` (built-in `node:sqlite`, Node ≥ 22.5, no native builds).
- **Modes** — guest offline play, 7-god Ladder duels, the Triad (3-seat) and the Quorum (4-seat) arenas, and online duels via lobby → ready → countdown.
- **Deploy** — `render.yaml`, `package.json` (ws, bcryptjs, jsonwebtoken).

## The three versions

### pharaoh-slapv7 — the latest client polish
The most recent client code. Identical to v7.1 except it **adds a `<noscript>` warning** to the shell and its styling in `screens.css`. Carries the hardened server (see v7.1) and the full MERGE-NOTES documenting all four phases complete. Includes working-state clutter: `node_modules/`, `package-lock.json`, `data/`, `err.txt`.

### pharaoh-slapv7.1 — the hardened baseline
Same as v7 minus the noscript warning. Its `server.js` (shared with v7) contains the **post-v7.2 hardening**: `decodeURIComponent` wrapped in try/catch (malformed URLs can't crash the static router), room-code joins normalized through `normalizeRoomCode()`, and the redundant `broadcastLobbyList()` fan-out on lobby close removed. Same MERGE-NOTES (all phases done), same clutter.

### pharaoh-slap-v7.2 — the deployment package
A cleaned folder built for shipping: **adds `Dockerfile`, `docker-compose.yml`, `.dockerignore`, and `DOCKER.md`** — a single container running server + API + client, SQLite persisted on a `pharaoh-data` volume, health-checked via `/health`. Drops `node_modules`, lockfile, `data/`, `err.txt`. Two caveats: its `server.js` predates the v7/v7.1 hardening (raw `decodeURIComponent`, inline room-code uppercase, lobby-list broadcast still present), and its `MERGE-NOTES.md` is the older Phase-1-only edition even though the `js/` modules for all four phases are present and current.

## Feature spine (all four merge phases, present in every folder)

1. **Phase 1 — static layer**: v6.2's monolith server rewritten to serve the modular asset tree (`/css/*`, `/js/*`, `/uploads/*`) with MIME correctness and traversal rejection; `/api/*`, `/health`, `/lobbies` untouched.
2. **Phase 2 — accounts + progression**: auth veil → The Weighing → home routing gate; hidden path assigned server-side; god duels launch through `PS.startMatch()` with per-god rule-sets, difficulty, and Ra's expert cue-hiding; wins recorded via `/api/progress`.
3. **Phase 3 — online multiplayer**: `PS.NET` with clock-sync and lobby flow; server card shape `{rank,val,suit,red}` mapped to v7 render shape; `NetMatch` driven entirely by server events.
4. **Phase 4 — the Quorum**: 4-seat free-for-all with no layout hack — the engine and opponent belt were already N-agnostic.

## Recommended convergence — DONE (June 9, 2026)

The true head of the project is **v7's client + v7/v7.1's hardened `server.js` + v7.2's Docker packaging**. v7's `server.js`, `Pharaoh Slap.html`, `css/screens.css`, and full `MERGE-NOTES.md` have been copied into v7.2 — **this folder is now the single canonical version.** Treat v7/v7.1 as frozen history. Note: the Custom Match mode (`js/custom.js` + wiring) built in an earlier session never landed in any of the three folders (it lived only in a lost scratch copy) and must be rebuilt — see PRODUCTION-PLAN.md.

## Known caveats (carried from MERGE-NOTES)

Multiplayer was verified at the protocol/render level with a stubbed socket — one real two-browser playthrough is still owed. `NetMatch` opens a local slap-cue window per played card (validity stays server-arbitrated). Seshat's "7 → war" and marriage/divorce are approximated in the local ladder; the server implements the fuller rules online. SQLite WAL needs a real local disk for `DB_PATH`; always set `JWT_SECRET` in prod.
