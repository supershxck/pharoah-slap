# Pharaoh Slap — v7 + v6.2 Merge

Goal: keep **v7's clean modular client** as the foundation and fold in **v6.2's
working systems** (server, accounts, progression, online play). v6.2 is treated
as read-only reference — nothing in that folder is edited.

## Architecture, at a glance

| Layer | Came from | Status |
|---|---|---|
| Client shell + screens (`Pharaoh Slap.html`, `css/`, `js/`) | v7 | ✅ kept as-is |
| Local card engine + match controller (`js/engine.js`, `js/match.js`) | v7 | ✅ kept as-is |
| Game server + WebSocket (`server.js`) | v6.2 | ✅ copied + adapted |
| Accounts / JWT / onboarding API (`auth.js`) | v6.2 | ✅ copied as-is |
| SQLite persistence (`db.js`, built-in `node:sqlite`) | v6.2 | ✅ copied as-is |
| Deploy config (`render.yaml`, `package.json`) | v6.2 | ✅ copied as-is |
| AUTH veil + accounts (`js/auth.js`) | v6.2 monolith | ✅ ported to PS module |
| The Weighing onboarding (`js/weighing.js`) | v6.2 monolith | ✅ ported to PS module |
| 7-god Ladder + stars + reveal (`js/ladder.js`) | v6.2 monolith | ✅ ported, drives v7 engine |
| Online multiplayer (`js/net.js` ↔ server) | v6.2 monolith | ✅ ported, server-authoritative |
| Arena — Triad (3) **and** Quorum (4-seat) | v6.2 monolith | ✅ both live (v7 engine is N-agnostic) |

## What changed in Phase 1 (done)

The only file modified from its v6.2 original is `server.js`. v6.2 served one
monolithic HTML file; v7 is modular, so the static layer was rewritten to serve
a small asset tree:

- `/` and any deep link → `Pharaoh Slap.html` (the SPA shell)
- `/css/*`, `/js/*`, `/uploads/*` → served from disk with correct MIME types
- Requests outside that whitelist (and `..` traversal) are rejected and fall
  back to the shell — verified that `server.js` source is never served.

`/api/*`, `/health`, and `/lobbies` routing is untouched from v6.2.

### Verified live
Booted `server.js` (against stub deps, since the sandbox npm registry is
blocked) and confirmed: `/` → 200 HTML, every `css/js/uploads` asset → 200 with
right MIME, `/api/register` → 201, path-traversal probes safely fall through.
All eight JS files pass `node --check`.

## Running locally

```
npm install        # needs registry access (ws, bcryptjs, jsonwebtoken)
npm start          # → http://localhost:8080
```

`db.js` uses Node's built-in `node:sqlite` (Node ≥ 22.5), so there's no native
build step. Set `DB_PATH` to a writable file and `JWT_SECRET` to any string.

> Note: SQLite WAL mode needs a real local disk — it errors on some network
> mounts. Keep `DB_PATH` on local storage (Render's persistent disk, or `/tmp`
> for a throwaway test).

## Phase 2 (done) — accounts + tutorial + progression spine

Three new `PS` modules, plus a themed `css/progression.css` and four new
screens (`auth`, `weighing`, `ladder`, and a one-time `reveal` overlay):

- **`js/auth.js`** — login/register veil, JWT in `localStorage`, auto-login via
  `/api/me`, and a routing gate (`auth → weighing → home`). Includes a "Play
  offline vs the gods" guest path so v7 still runs with no server.
- **`js/weighing.js`** — the 3-trial onboarding (Instinct / Memory /
  Experience), POSTing to `/api/onboarding`; the server assigns the hidden path.
- **`js/ladder.js`** — the seven gods, path sequences, stars, and the one-time
  earned-title reveal. Each god duel launches through `PS.startMatch()` with a
  rule-set + difficulty mapped onto v7's engine; wins record via `/api/progress`.

Supporting changes (backward-compatible): `engine.js` `slapCheck` now honors
`double`/`sandwich` toggles; `match.js` `startMatch(opts)` accepts opponents,
slap rules, difficulty/speed, an `expert` cue-hiding flag (Ra), and an
`onEnd(won, stats)` hook; `app.js` boots through `AUTH` and routes the victory
screen back to the ladder during a duel.

**Verified:** all 11 JS files pass `node --check`; a headless DOM shim loads all
8 client scripts in order and runs guest play, a logged-in ladder render, a god
duel, the arena, and the Weighing with no errors; the live server serves every
new `css/js` asset with correct MIME and the shell links all of them.

## Phase 3 (done) — online multiplayer

`js/net.js` adds `PS.NET` (connection, clock-sync, lobby, message routing) and a
network-driven `NetMatch`. The **server is authoritative**: it runs the game and
broadcasts events; the client renders them with v7 visuals and sends only
`PLAY_CARD` / `SLAP`. The server's card shape `{rank,val,suit,red}` maps to v7's
render shape via `rank = val + 2`. Flow: create/join room → ready → host starts →
countdown → live duel. `match.js` gained a `PS.activeController` indirection so
the table's buttons/keys route to either the local `Match` or the `NetMatch`.

New `screen-online` (lobby) + `#countdown` overlay, an **Online Duel** button on
home, and lobby/countdown styles in `progression.css`. Default server is the
same origin; a field allows overriding it (e.g. the Render URL).

## Phase 4 (done) — the 4-seat arena

No `layout-4p` hack was needed: v7's engine and the opponent belt are already
N-agnostic. **The Quorum (You + 3 Gods)** is now a real free-for-all alongside
the Triad — `LADDER.beginArena(3)` deals four seats and the table renders three
opponents in the belt.

## Verification (all phases)

All 12 JS files pass `node --check`. The headless DOM shim loads all **9**
client scripts and drives: guest play, a logged-in ladder render, a god duel,
both arenas (3- and 4-seat), the Weighing, and the **entire online path** with a
stubbed WebSocket — `openLobby → createRoom → ROOM_CREATED → PLAYER_JOINED →
COUNTDOWN → GAME_START → PLAY_CARD → CARD_PLAYED → SLAP → SLAP_VALID →
PILE_AWARDED → FALSE_SLAP → GAME_OVER`. The client emits exactly `PING,
CREATE_ROOM, PLAY_CARD, SLAP`. The live server serves every asset with correct MIME.

### Honest caveats
- The sandbox can't install `ws`/`bcryptjs`/`jsonwebtoken` or open real sockets,
  so multiplayer is verified at the protocol/render level, not against a live
  socket. One real two-browser playthrough is still worth doing.
- `NetMatch` opens a short slap window on each played card (the server doesn't
  emit an explicit "slappable" event). Slap *validity* is still arbitrated
  server-side, so this only affects the local cue, never correctness.
- Seshat's "7 → war" and true marriage/divorce remain approximated in the local
  ladder (Phase 2 note); the authoritative server implements the fuller rule set
  for online play.
