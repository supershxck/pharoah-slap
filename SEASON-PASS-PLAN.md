# Pharaoh Slap — Season Pass Proposal & 6-Month Live Plan

*Drafted June 11, 2026. A proposal, not a contract — numbers are starting points to tune against real data.*

---

## The core idea

Pharaoh Slap already has the right bones for a season pass: an XP economy that pays every match, a pack pipeline, four cosmetic types (card backs, slap effects, charged plays, table backgrounds) plus per-card charms, and a Trials ladder that gives progression a narrative. A season pass doesn't add a new system — it adds a **clock and a story** to the systems that exist. Every 8 weeks the temple changes its face, the rewards rotate, and there's a reason to come back tonight rather than someday.

## Season structure

**Length:** 8 weeks per season (6 seasons ≈ 11 months; this plan covers the first 3 seasons in detail = 6 months of content).

**Two tracks, one ladder of 30 tiers.** Tiers are earned with the existing XP (no second currency — season XP *is* match XP, counted from season start). Tier pacing: a casual player (3 games/day) finishes around week 7; a dedicated player finishes by week 5 and chases the post-track repeatable (a pack every 5 tiers' worth of XP).

- **Free track (everyone):** ~12 of the 30 tiers pay out — packs, XP boosts, one seasonal card back at tier 10, the seasonal *charm* at tier 25. The free track must feel generous; it's the advertisement for the paid one.
- **Pass track ($4.99/season):** all 30 tiers pay — the seasonal *mythic* cosmetic line (exclusive skin + slap FX + charged play + table, one of each per season), bonus packs at every 3rd tier, an exclusive title shown on the leaderboard/lobby ("Bearer of the Flood"), and the season's *animated* card back at tier 30 as the trophy.
- **Pass Premium ($9.99, optional tier):** the pass + 10 tier skips + an instant exclusive charm. This is the whale lane; never gate gameplay behind it.

**Hard rule: cosmetics only.** No gameplay power is ever sold — not decks, not slap windows, not XP multipliers that affect matchmaking. This keeps the game honest, keeps app-store review simple, and keeps the community goodwill that an indie game lives on.

**Season end:** unearned pass tiers expire; earned cosmetics are forever. Expired seasonal items return ~2 seasons later in the Treasury at a premium ($2.99 singles) — scarcity with mercy.

## The first three seasons (months 1–6)

### Season 1 — "The Inundation" (weeks 1–8)
*The Nile floods; the temple drowns in lapis and silver.*
- **Mythic line:** Flood-water card back (animated ripple), "Deluge" slap FX (water crash), "Tide" charged play (wave sweeps the table), Sunken Hall table.
- **Free highlights:** Reed-boat card back (tier 10), Fish charm (tier 25).
- **Event beat (week 4):** *High Water Weekend* — double pack drops, login gift charm.
- **Why this theme first:** visually distinct from the launch gold/sand palette; shows players the game transforms.

### Season 2 — "The Burning Decan" (weeks 9–16)
*Sopdet rises; everything is fire and star-omens.*
- **Mythic line:** Ember-glass back (animated embers), "Starfall" slap FX, "Decan Rising" charged play (constellation flare), Observatory table.
- **Free highlights:** Charcoal back, Comet charm.
- **Event beat:** *The Alignment* (week 12) — limited-time arena where all rule aliases display in their celestial names and Gemini/Trine pay double charge meter; pure spectacle, no balance change.
- **New system shipped this season:** **gifting** — buy a Treasury bundle for a friend's account name. Cheap to build, strong social hook.

### Season 3 — "The Court of Osiris" (weeks 17–24)
*Judgment-themed; the boldest visual season.*
- **Mythic line:** Scales-of-Ma'at back (animated feather), "Verdict" slap FX (gavel of light), "Forty-Two Judges" charged play, Hall of Two Truths table.
- **Free highlights:** Feather charm, Papyrus back.
- **Event beat:** *The Weighing* (week 20) — seasonal leaderboard where stars earned in re-cleared Trials count; top 100 get a unique title.
- **New system shipped this season:** **seasonal leaderboard reset** + placement rewards, converting the existing leaderboard widget into a real ladder.

*(Seasons 4–6 sketched: "The Architect" / building & geometry, "Whispers of Set" / storm & chaos, "The Golden Jubilee" / anniversary remix of S1–S5 hits. Detail them at month 4 with real data in hand.)*

## Pricing & the store, together

| Product | Price | Role |
|---|---|---|
| Treasury bundles (live now) | $2.99 | Impulse cosmetics, evergreen |
| Season Pass | $4.99 / 8 weeks | The engine — best value, main conversion target |
| Pass Premium | $9.99 | Pass + 10 skips + exclusive charm |
| Returning seasonal singles | $2.99 | Scarcity release valve |

Anchor pricing: the pass must visibly contain >3 bundles' worth of items so $4.99 reads as the smart buy. Expected revenue mix at modest scale: ~60% pass, ~30% bundles, ~10% premium upgrades.

## What has to be built (engineering phases)

**Phase A — weeks 1–2 (before Season 1 can start):**
- `seasons` config on the server (id, start/end, tier table, reward ids) + `season_progress` per user (season XP snapshot, tiers claimed, pass owned).
- Pass purchase = a Treasury product (`pack_season1`) through the existing checkout seam — payments and pass share one pipeline.
- Client: Season screen (track view, claim buttons, countdown), season banner on home.
- Reuses: XP already flows through `/api/match`; rewards are catalog ids; granting is `setEconomy`.

**Phase B — during Season 1:**
- Real payments: Stripe Checkout for web/PWA (webhook → grant), App Store/Play IAP when the Capacitor wrap ships. The 501 seam in `/api/store/checkout` is exactly where this plugs in.
- Animated card backs (CSS keyframe layer on `.card.back` — cheap, high perceived value).

**Phase C — Season 2–3:**
- Gifting (S2), seasonal leaderboard + reset (S3).
- Telemetry: log tier-up events, conversion funnel (saw pass → opened pass screen → bought), D1/D7/D30 retention.

## KPIs to steer by

- **D7 retention ≥ 25%** before pushing monetization hard — a pass sold to players who leave is a refund.
- **Pass conversion 5–8%** of weekly actives is healthy for a casual game; below 3% means the free track is too generous or the mythic line too weak.
- **Tier-30 completion 35–50%** of pass buyers — lower means pacing is too slow (resentment), higher means too fast (no reason to log in week 7).
- Watch **session length around the drama meter**: if charged plays drive longer sessions, seasonal charged-play effects should headline marketing.

## Risks & honest counsel

- **Don't launch the pass before the game is live and sticky.** Sequence: public launch → 2–4 weeks of retention data → Season 1. A season pass amplifies an existing habit; it cannot create one.
- **Apple/Google take 30%/15%** and require their IAP for digital goods in-app — price identically everywhere, treat the web/PWA (Stripe, ~3% fees) as the high-margin channel, and never *mention* the web price inside the iOS app (guideline 3.1.1).
- **Loot-box optics:** free packs are random (fine — they're free), but everything *sold* stays deterministic, as the Treasury already is. This sidesteps gambling-disclosure rules in several jurisdictions.
- **Content treadmill:** one mythic line per 8 weeks is ~4 cosmetics + a theme palette — sustainable for a solo dev with the current CSS/canvas cosmetic system. Resist shortening seasons.

---

*Next concrete step when you're ready: Phase A's `seasons` config + Season screen, and wiring `pack_season1` through the existing checkout seam. The store shipped today is the foundation — the pass is one more product in it.*
