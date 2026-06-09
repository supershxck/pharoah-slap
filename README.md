# Pharaoh Slap — Accounts, Progression & The Trials of the Gods

A Node + WebSocket game with usernamed accounts, a branching onboarding
("The Weighing"), a seven-god tutorial ladder, and a free-for-all Arena.
Single deployable service on Render.

## Files

| File | Role |
|---|---|
| `server.js` | WebSocket game server + delegates `/api/*` to `auth.js` |
| `auth.js` | Accounts, JWT sessions, onboarding/path assignment, progress (anti-spoof) |
| `db.js` | SQLite persistence — **all** DB access lives here (swap to Postgres in one file) |
| `pharaoh-slap-v6.html` | The game: login → Weighing → ladder → god duels → Arena |
| `render.yaml` | Render service + persistent disk + env vars |
| `package.json` | deps: `ws`, `better-sqlite3`, `bcryptjs`, `jsonwebtoken` |

## Deploy to Render

1. Push this folder to a Git repo and create a **Blueprint** from `render.yaml`
   (or a Web Service pointing at it).
2. `render.yaml` is set to **`plan: starter`** because SQLite needs a
   **persistent disk** (the free tier has none). The disk mounts at
   `…/src/data` and `DB_PATH` points inside it. `JWT_SECRET` is auto-generated.
3. To stay on the **free tier instead**, delete the `disk:` block and repoint
   `db.js` at an external Postgres (e.g. Neon) — only `db.js` changes.

Local run: `npm install && npm start` → http://localhost:8080
(creates `./data/pharaoh.db`).

## Smoke-test checklist (the parts only a live browser/server confirm)

Static analysis here verified: every JS file parses, the SQLite schema +
upsert run correctly, path assignment is correct across all 27 onboarding
combos, star rules, the ladder path/next logic, and the arena driver's
decision table. The following need one real playthrough:

**Auth (Phase 2)**
- [ ] Register a new name → lands in The Weighing.
- [ ] Reload the page → auto-logged-in (no login screen flash).
- [ ] Logout → login screen returns; wrong passcode shows an error.

**The Weighing (Phase 3)**
- [ ] Trial I: a double lands; slapping fast vs. slow vs. not-at-all all advance.
- [ ] Trial II: five cards flip, then you pick the repeated value.
- [ ] Trial III: Yes / No / Something like it.
- [ ] Lands on the ladder afterward; your path entry point is correct
      (Initiate→Thoth, Contender→Set, Ascendant→Horus).

**Ladder & god duels (Phase 4-5)**
- [ ] Each god's duel applies its rule set (e.g. Anubis enables sandwiches,
      Ra hides slap cues) and shows the god's name/avatar on the opponent band.
- [ ] Winning shows the god's defeat line, lights stars, and returns to the ladder.
- [ ] Stars persist after logout/login (server-recorded).

**Earned-title reveal (Phase 6)**
- [ ] Your **first** victory shows the one-time "You walk as The …" reveal,
      then never again (stored per device).

**Arena — You + 2 Gods (Phase 7)**
- [ ] The Triad launches a 3-band free-for-all vs. Set & Horus.
- [ ] Turns rotate among all three; both AIs race to slap legal piles.
- [ ] A seat that empties is removed; last seat (or whoever holds all cards) wins.
- [ ] Win/Loss → "Menu" returns to the ladder.

## Known limitation

- **You + 3 Gods (4-seat)** is marked *coming soon* in the ladder. The engine
  renders at most three local bands (bottom/mid/top); a 4-seat table needs a
  4th band + `layout-4p`. The free-for-all driver and win logic are already
  N-agnostic, so this is a UI add, best done with live visual testing.

## Tuning knobs (open threads from the design spec)

- **Path distribution** skews to Contender (~74% of inputs). Raw onboarding
  signals are stored on the user row, so thresholds in
  `auth.js → assignTutorialPath` can be retuned without a migration.
- **Star rules** live in `auth.js → computeStars` (win=1, no false-slaps=+1,
  fastest slap <400ms=+1). Reaction time is a proxy (time since last card).
