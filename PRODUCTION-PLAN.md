# Pharaoh Slap — Production & Publishing Plan

*June 9, 2026. Canonical build: this folder (`pharaoh-slap-v7.2`), post-convergence.*

The arc: one canonical build → verify what was never live-tested → deploy to Render → make it installable (PWA) → wrap for app stores. Each phase gates the next; nothing here is speculative — the gaps named below come straight from the build history.

---

## Phase 0 — Canonical build ✅ (done June 9)

v7's hardened `server.js`, shell HTML, `screens.css`, and full MERGE-NOTES are now in this folder. v7/v7.1 are frozen history; **all future edits happen here only.**

**One casualty discovered:** the Custom Match mode (house-rules screen, `js/custom.js`, rematch-remembers-rules) was built in a prior session but only ever synced to scratch copies that no longer exist. It is documented well enough to rebuild in one sitting (new `custom.js`, `_lastMatchOpts` in `match.js`, home button + screen in HTML, wiring in `app.js`, overflow CSS). Decide: rebuild before launch, or ship without it and add post-launch. It is **not** a launch blocker — all other modes are intact.

**Do immediately, before anything else: put this folder in a git repo and push to GitHub.** The project has now lost finished work twice to folder shuffling. Render also deploys straight from GitHub, so this is step one of Phase 2 anyway.

```bash
cd pharaoh-slap-v7.2
git init && git add -A && git commit -m "v7.2 canonical: merged client + hardened server + Docker"
# create empty repo on github.com, then:
git remote add origin git@github.com:<you>/pharaoh-slap.git && git push -u origin main
```

---

## Phase 1 — The owed verification (before deploy)

Everything below has passed static/headless/simulation checks but has **never been confirmed in real conditions**:

1. **Online duel, two real browsers.** The full protocol was verified against a stubbed socket only. Run the Docker image, open two browser windows (one normal, one incognito), create room → join by code → ready → countdown → play a full game. Watch for: slap arbitration feel (latency of the heuristic slap window), disconnect mid-game, and the JUDGMENT/GAME_OVER flow.
2. **The Quorum (4-seat arena) live.** Engine sim covered 4 players (1,200 games, zero invariant violations), but the rendered 4-seat experience was never clicked through.
3. **Real phone pass.** iOS Safari and Android Chrome: auth screen, Weighing, a god duel, victory, and the online lobby. Past bugs (screen-overlay click interception, clipped buttons) were exactly the class headless testing can't catch.
4. **Rebuild the Docker image first** — the live image predates every fix since the CSS overlay bug: `docker compose up --build`.

Exit criteria: one clean online duel between two devices, one Quorum match, one full phone playthrough. Half a day of testing, maximum.

---

## Phase 2 — Deploy to Render

The `render.yaml` is already correct (starter plan + 1GB persistent disk for SQLite, health check, `JWT_SECRET` auto-generated, `DB_PATH` on the disk). Render gives HTTPS + WSS automatically — no config.

1. Push to GitHub (done in Phase 0).
2. Render dashboard → New → **Blueprint** → select the repo. It reads `render.yaml` and provisions everything. (~$7/mo for starter; the disk is why — free tier has no persistent disk and SQLite needs one.)
3. Smoke test on the live URL: register a fresh account → Weighing → one god duel → win records stars (`/api/me`) → online duel between your phone and laptop.
4. **Custom domain**: buy one (e.g. `pharaohslap.com`, ~$10/yr), add it in Render → Settings → Custom Domains, point DNS. Render issues the cert.
5. **Backups**: SQLite on a single disk is one bad day from data loss. Minimum viable: a weekly `sqlite3 .backup` cron or a Render job that copies `pharaoh.db` somewhere off-disk. When real users accumulate, migrate `db.js` to Postgres (Neon free tier) — the entire DB layer was deliberately built behind that one file for exactly this swap.

Exit criteria: public URL, account created from a phone on cellular (not your wifi), online duel across two networks.

---

## Phase 3 — Publish as a web game + PWA

**PWA (installable on phones, ~1 day):**
- `manifest.webmanifest`: name, theme colors (the gold/dark temple palette), icons (512/192/180px — need one good icon design), `display: standalone`, portrait orientation.
- Service worker: cache-first for the static shell (`/`, `/css/*`, `/js/*`, `/uploads/*`), network-only for `/api/*` and the WebSocket. The guest mode already works fully offline-of-account — with the shell cached, **guest play works with no connection at all**, which is a real selling point.
- Serve both from `server.js` (two more whitelisted static entries) and link the manifest in the shell.
- Result: "Add to Home Screen" gives a full-screen, app-like install on iOS and Android with zero store involvement.

**Launch basics:**
- A simple landing/about block or page: what the game is (Egyptian Ratscrew, reborn), how slapping works, a screenshot or three.
- `robots.txt` + OpenGraph/Twitter meta tags in the shell so shared links unfurl with the game's art.
- Privacy note page (one paragraph: username + hashed passcode stored, nothing else; no tracking). You'll need this for app stores anyway — write it now.

Exit criteria: installs to a phone home screen, opens full-screen, guest mode plays offline.

---

## Phase 4 — App stores (later, deliberately)

Don't gate the launch on this; the PWA is the launch. When ready:

- **Wrap with Capacitor** (the modern Cordova): points a native WebView at the deployed URL or bundles the client. The codebase needs almost no changes because it's already a self-contained SPA.
- **Costs/accounts**: Apple Developer $99/yr, Google Play $25 once.
- **Store requirements to plan for now**:
  - Apple requires **account deletion** in-app if you offer account creation → add a "Delete my account" endpoint + button before submission (small: one DELETE route in `auth.js`, one confirm dialog).
  - Privacy policy URL (Phase 3 page covers it).
  - Apple dislikes thin web wrappers — the offline guest engine, haptics (`navigator.vibrate` on slaps), and native feel of the v7 UI are the counterargument; consider adding haptics + sound before submitting.
- **Realistic sequencing**: Google Play first (cheaper, gentler review), Apple second.

---

## Backlog (post-launch, in rough priority)

1. **Rebuild Custom Match** (lost feature — well documented, one sitting).
2. **Online custom rules** — server must accept/enforce a rule-set per room (the plumbing custom mode was waiting for).
3. **Seshat's war + marriage/divorce parity** in the local ladder (server already has the fuller rules).
4. **Postgres migration** when users are real (swap inside `db.js` only).
5. **Leaderboard backed by real data** (currently seeded/placeholder names).
6. **Rate limiting on `/api/register` + `/api/login`** — cheap insurance against bot signups once public.
7. Sound + haptics pass (also strengthens the App Store case).
8. itch.io page if you want game-portal discovery without store overhead.

---

## Next three actions

1. **`git init` + push this folder to GitHub** (10 minutes; ends the lost-work era).
2. **Rebuild Docker + run the Phase 1 verification trio** (two-browser duel, Quorum, phone pass).
3. **Render Blueprint deploy** off the repo → smoke test the live URL.

After those three, Pharaoh Slap is in production. PWA work begins the publishing arc.
