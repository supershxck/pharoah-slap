/* ============================================================================
   Pharaoh Slap — COSMO (XP/levels, packs, cosmetics, slap effects)
   Server-backed for signed-in players (/api/match, /api/pack/open, /api/equip);
   a faithful localStorage mirror for guests. Catalog mirrors auth.js.
   ========================================================================== */
window.PS = window.PS || {};
(function (PS) {
  'use strict';
  const { $, el } = PS;
  const GUEST_KEY = 'ps_cosmo';
  const GAMES_PER_PACK = 5;
  const PACK_SIZE = 3;

  // Mirror of the server catalog (auth.js is authoritative for accounts).
  const CATALOG = [
    { id: 'skin_tiedye',  kind: 'skin', value: 'tiedye',  name: 'Tie-Dye',       rarity: 'starter', weight: 0,  glyph: null },
    { id: 'skin_egypt',   kind: 'skin', value: 'egypt',   name: 'Lapis Seal',    rarity: 'starter', weight: 0,  glyph: null },
    { id: 'skin_scarab',  kind: 'skin', value: 'scarab',  name: 'Scarab Shell',  rarity: 'common',  weight: 24, glyph: null },
    { id: 'skin_nile',    kind: 'skin', value: 'nile',    name: 'Nile at Dusk',  rarity: 'common',  weight: 24, glyph: null },
    { id: 'skin_sunboat', kind: 'skin', value: 'sunboat', name: 'Solar Barque',  rarity: 'rare',    weight: 12, glyph: null },
    { id: 'skin_duat',    kind: 'skin', value: 'duat',    name: 'The Duat',      rarity: 'epic',    weight: 5,  glyph: null },
    { id: 'fx_burst',     kind: 'fx',   value: 'burst',   name: 'Gold Burst',    rarity: 'common',  weight: 24, glyph: '✨' },
    { id: 'fx_bolt',      kind: 'fx',   value: 'bolt',    name: "Set's Bolt",    rarity: 'common',  weight: 24, glyph: '⚡' },
    { id: 'fx_scarabs',   kind: 'fx',   value: 'scarabs', name: 'Scarab Swarm',  rarity: 'rare',    weight: 12, glyph: '\u{1FAB2}' },
    { id: 'fx_flames',    kind: 'fx',   value: 'flames',  name: "Ra's Flames",   rarity: 'rare',    weight: 12, glyph: '\u{1F525}' },
    { id: 'fx_ankhs',     kind: 'fx',   value: 'ankhs',   name: 'Rain of Ankhs', rarity: 'epic',    weight: 5,  glyph: '☥' },
    { id: 'fx_eclipse',   kind: 'fx',   value: 'eclipse', name: 'Black Sun',     rarity: 'epic',    weight: 4,  glyph: '\u{1F311}' },
    { id: 'play_comet',   kind: 'play', value: 'comet',   name: 'Comet Trail',   rarity: 'rare',    weight: 8,  glyph: '☄' },
    { id: 'play_sands',   kind: 'play', value: 'sands',   name: 'Desert Vortex', rarity: 'rare',    weight: 8,  glyph: '\u{1F32A}' },
    { id: 'play_storm',   kind: 'play', value: 'storm',   name: 'Storm of Set',  rarity: 'epic',    weight: 4,  glyph: '\u{26C8}' },
    { id: 'table_gold',   kind: 'table', value: 'gold',   name: 'Gilded Hall',   rarity: 'rare',    weight: 10, glyph: '\u{1F3DB}' },
    { id: 'table_duatbg', kind: 'table', value: 'duatbg', name: 'Duat Void',     rarity: 'epic',    weight: 5,  glyph: '\u{1F30C}' },
    { id: 'charm_scarab', kind: 'charm', value: 'scarab', name: 'Scarab Seal',   rarity: 'common',  weight: 18, glyph: '\u{1FAB2}' },
    { id: 'charm_lotus',  kind: 'charm', value: 'lotus',  name: 'Lotus Bloom',   rarity: 'common',  weight: 18, glyph: '\u{1FAB7}' },
    { id: 'charm_gild',   kind: 'charm', value: 'gild',   name: 'Gold Leaf',     rarity: 'rare',    weight: 10, glyph: '✨' },
    { id: 'charm_eye',    kind: 'charm', value: 'eye',    name: 'Eye of Horus',  rarity: 'rare',    weight: 10, glyph: '\u{13080}' },
    { id: 'charm_aten',   kind: 'charm', value: 'aten',   name: "Aten's Halo",   rarity: 'epic',    weight: 5,  glyph: '☀' },
    // premium — store bundles only (weight 0 keeps them out of free packs)
    { id: 'skin_pharaoh',    kind: 'skin',  value: 'pharaoh',   name: "Pharaoh's Gold",  rarity: 'premium', weight: 0, glyph: null },
    { id: 'charm_cartouche', kind: 'charm', value: 'cartouche', name: 'Royal Cartouche', rarity: 'premium', weight: 0, glyph: '\u{13379}' },
    { id: 'fx_crowns',       kind: 'fx',    value: 'crowns',    name: 'Crown Rain',      rarity: 'premium', weight: 0, glyph: '\u{1F451}' },
    { id: 'skin_anubisn',    kind: 'skin',  value: 'anubisn',   name: 'Anubis Night',    rarity: 'premium', weight: 0, glyph: null },
    { id: 'table_necro',     kind: 'table', value: 'necro',     name: 'Necropolis',      rarity: 'premium', weight: 0, glyph: '\u{26B0}' },
    { id: 'fx_souls',        kind: 'fx',    value: 'souls',     name: 'Soul Wisps',      rarity: 'premium', weight: 0, glyph: '✧' },
    { id: 'skin_stars',      kind: 'skin',  value: 'stars',     name: 'Star Field',      rarity: 'premium', weight: 0, glyph: null },
    { id: 'play_nova',       kind: 'play',  value: 'nova',      name: 'Supernova',       rarity: 'premium', weight: 0, glyph: '\u{1F4A5}' },
    { id: 'charm_moon',      kind: 'charm', value: 'moon',      name: "Khonsu's Moon",   rarity: 'premium', weight: 0, glyph: '\u{1F319}' },
    // seasonal — Season 1 'The Inundation' ladder rewards
    { id: 'skin_reedboat', kind: 'skin',  value: 'reedboat', name: 'Reed Boat',   rarity: 'seasonal', weight: 0, glyph: null },
    { id: 'charm_fish',    kind: 'charm', value: 'fish',     name: 'Nile Fish',   rarity: 'seasonal', weight: 0, glyph: '\u{1F41F}' },
    { id: 'skin_flood',    kind: 'skin',  value: 'flood',    name: 'Floodwater',  rarity: 'seasonal', weight: 0, glyph: null },
    { id: 'fx_deluge',     kind: 'fx',    value: 'deluge',   name: 'Deluge',      rarity: 'seasonal', weight: 0, glyph: '\u{1F30A}' },
    { id: 'play_tide',     kind: 'play',  value: 'tide',     name: 'The Tide',    rarity: 'seasonal', weight: 0, glyph: '\u{1F4A7}' },
    { id: 'table_sunken',  kind: 'table', value: 'sunken',   name: 'Sunken Hall', rarity: 'seasonal', weight: 0, glyph: '\u{1F3DB}' },
    { id: 'charm_lily',    kind: 'charm', value: 'lily',     name: 'Flood Lily',  rarity: 'seasonal', weight: 0, glyph: '\u{1FAB7}' },
  ];
  const BY_ID = Object.fromEntries(CATALOG.map(c => [c.id, c]));
  const STARTERS = CATALOG.filter(c => c.rarity === 'starter').map(c => c.id);

  function levelFromXp(xp) {
    let level = 1, rem = Math.max(0, xp | 0), need = 120;
    while (rem >= need) { rem -= need; level++; need = 120 + 60 * (level - 1); }
    return { level, into: rem, next: need };
  }

  // ---- State ---------------------------------------------------------------
  const state = {
    xp: 0, level: 1, levelInto: 0, levelNext: 120,
    games: 0, wins: 0, cardsPlayed: 0, slapsLanded: 0,
    packs: 0, owned: new Set(STARTERS), equipped: {},
    guest: true,
  };
  let lastRoll = null; // items from the most recent pack open (for the fan)

  const isUser = () => !!(PS.AUTH && PS.AUTH.getUser());

  function loadGuest() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(GUEST_KEY) || '{}'); } catch {}
    state.xp = s.xp | 0; state.games = s.games | 0; state.wins = s.wins | 0;
    state.cardsPlayed = s.cardsPlayed | 0; state.slapsLanded = s.slapsLanded | 0;
    state.packs = s.packs | 0;
    state.owned = new Set([...(s.owned || []), ...STARTERS]);
    state.equipped = s.equipped || {};
    state.guest = true;
    recalc();
  }
  function saveGuest() {
    if (!state.guest) return;
    try {
      localStorage.setItem(GUEST_KEY, JSON.stringify({
        xp: state.xp, games: state.games, wins: state.wins,
        cardsPlayed: state.cardsPlayed, slapsLanded: state.slapsLanded,
        packs: state.packs, owned: [...state.owned], equipped: state.equipped,
      }));
    } catch {}
  }
  function syncFromUser(u) {
    if (!u) { loadGuest(); applyEquip(); return; }
    state.xp = u.xp | 0; state.games = u.games | 0; state.wins = u.wins | 0;
    state.cardsPlayed = u.cardsPlayed | 0; state.slapsLanded = u.slapsLanded | 0;
    state.packs = u.packs | 0;
    state.owned = new Set([...(u.cosmetics || []), ...STARTERS]);
    state.equipped = u.equipped || {};
    state.guest = false;
    recalc(); applyEquip();
  }
  function recalc() {
    const lv = levelFromXp(state.xp);
    state.level = lv.level; state.levelInto = lv.into; state.levelNext = lv.next;
    // keep the legacy PROFILE shape the renderers already read
    const P = PS.PROFILE;
    P.level = state.level; P.xp = state.levelInto; P.xpMax = state.levelNext;
    P.cardsPlayed = state.cardsPlayed; P.slapsLanded = state.slapsLanded;
  }
  function applyEquip() {
    const skin = state.equipped.skin && BY_ID[state.equipped.skin];
    if (skin) PS.tweaks.deckSkin = skin.value;
    const fx = state.equipped.fx && BY_ID[state.equipped.fx];
    PS.equippedFx = fx ? fx.value : null;
    const play = state.equipped.play && BY_ID[state.equipped.play];
    PS.equippedPlay = play ? play.value : null;
    const table = state.equipped.table && BY_ID[state.equipped.table];
    if (table) { PS.tweaks.tableTheme = table.value; if (PS.applyTableTheme) PS.applyTableTheme(); if (PS.persistTweaks) PS.persistTweaks(); }
  }

  // ---- Match results -------------------------------------------------------
  async function recordMatch(r) {
    if (PS.STATS) PS.STATS.record(r);   // local match log for the stats screen
    const xp = (r.won ? 60 : 25) + Math.min(30, (r.slaps | 0) * 2);
    if (isUser()) {
      try {
        const { ok, data } = await PS.AUTH.api('/api/match', { method: 'POST', body: r });
        if (ok && data.user) {
          PS.AUTH.setUserData(data.user);
          syncFromUser(data.user);
          if (data.gained && data.gained.packs > 0) PS.toast('\u{1F381} Pack earned! Open it from your profile');
          else if (data.gained && data.gained.leveledUp) PS.toast('⭐ Level ' + state.level + '!');
          return;
        }
        // non-OK (e.g. older server without /api/match) → keep playing locally
      } catch (e) { /* offline — fall through to local */ }
    }
    const before = state.level;
    state.xp += xp; state.games++;
    if (r.won) state.wins++;
    state.cardsPlayed += r.cards | 0; state.slapsLanded += r.slaps | 0;
    recalc();
    let packs = state.games % GAMES_PER_PACK === 0 ? 1 : 0;
    packs += Math.max(0, state.level - before);
    if (packs > 0) { state.packs += packs; PS.toast('\u{1F381} Pack earned! Open it from your profile'); }
    else if (state.level > before) PS.toast('⭐ Level ' + state.level + '!');
    saveGuest();
  }

  // ---- Packs ---------------------------------------------------------------
  function rollLocal() {
    const items = [];
    for (let i = 0; i < PACK_SIZE; i++) {
      const pool = CATALOG.filter(c => c.weight > 0 && !state.owned.has(c.id) && !items.some(x => x.id === c.id));
      if (!pool.length) { items.push({ duplicate: true, xp: 40 }); continue; }
      let t = Math.random() * pool.reduce((s, c) => s + c.weight, 0);
      const pick = pool.find(c => (t -= c.weight) <= 0) || pool[pool.length - 1];
      items.push({ id: pick.id, kind: pick.kind, value: pick.value, name: pick.name, rarity: pick.rarity });
      state.owned.add(pick.id);
    }
    return items;
  }
  function openLocal() {
    const items = rollLocal();
    state.packs--;
    state.xp += items.filter(i => i.duplicate).reduce((s, i) => s + i.xp, 0);
    recalc(); saveGuest();
    return items;
  }
  async function openPack() {
    if (state.packs < 1) return null;
    if (isUser()) {
      try {
        const { ok, data } = await PS.AUTH.api('/api/pack/open', { method: 'POST' });
        if (ok) {
          if (data.user) { PS.AUTH.setUserData(data.user); syncFromUser(data.user); }
          return data.items || [];
        }
        // older server / route missing → open locally so the player isn't stuck
        return openLocal();
      } catch (e) { return openLocal(); }
    }
    return openLocal();
  }

  /* ---- Card charms: cosmetics placed on individual cards ------------------- */
  const cardKey = (c) => c.rank + '-' + c.suit;
  // Render hook: ui.js makeCard consults this for every card it draws.
  PS.getCardCharm = function (card) {
    const mods = state.equipped.cards;
    if (!mods || !card || card.rank == null || !card.suit) return null;
    const id = mods[cardKey(card)];
    return id ? BY_ID[id] || null : null;
  };
  async function setCardCharm(key, charmId) {
    if (charmId && !state.owned.has(charmId)) return;
    if (isUser()) {
      try {
        const body = { cards: {} }; body.cards[key] = charmId || null;
        const { ok, data } = await PS.AUTH.api('/api/equip', { method: 'POST', body });
        if (ok && data.user) { PS.AUTH.setUserData(data.user); syncFromUser(data.user); renderForge(); return; }
      } catch (e) { /* fall through to local */ }
    }
    state.equipped.cards = state.equipped.cards || {};
    if (charmId) state.equipped.cards[key] = charmId; else delete state.equipped.cards[key];
    saveGuest(); renderForge();
  }

  /* ---- The Card Forge (pick a card, place the charm) ------------------------ */
  const SUIT_G = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
  const RLAB = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  let forgeCharm = null;
  function openForge(charm) {
    forgeCharm = charm;
    const veil = $('#forge-veil'); if (!veil) return;
    $('#forge-title').textContent = 'Place ' + charm.name;
    renderForge();
    veil.classList.add('show');
  }
  function closeForge() {
    const veil = $('#forge-veil'); if (veil) veil.classList.remove('show');
    forgeCharm = null;
    renderPackScreen();   // refresh charm tile counts
  }
  function renderForge() {
    const grid = $('#forge-grid'); if (!grid || !forgeCharm) return;
    grid.innerHTML = '';
    const mods = state.equipped.cards || {};
    ['spades', 'hearts', 'diamonds', 'clubs'].forEach((suit) => {
      for (let rank = 2; rank <= 14; rank++) {
        const card = { rank, suit, red: suit === 'hearts' || suit === 'diamonds', label: RLAB[rank] || String(rank), glyph: SUIT_G[suit] };
        const c = PS.makeCard(card, 34);
        const key = cardKey(card);
        const cur = mods[key];
        if (cur === forgeCharm.id) c.classList.add('forge-on');
        else if (cur) c.classList.add('forge-other');
        c.onclick = () => setCardCharm(key, cur === forgeCharm.id ? null : forgeCharm.id);
        grid.appendChild(c);
      }
    });
    const n = Object.values(mods).filter((v) => v === forgeCharm.id).length;
    $('#forge-sub').textContent = n ? (n + ' card' + (n > 1 ? 's' : '') + ' bear this charm — tap to add or remove') : 'Tap any card to place the charm';
  }
  (function wireForge() {
    const x = $('#forge-close'); if (x) x.addEventListener('click', closeForge);
    const veil = $('#forge-veil');
    if (veil) veil.addEventListener('click', (e) => { if (e.target === veil) closeForge(); });
  })();

  async function equip(kind, id) {
    if (id && !state.owned.has(id)) return;
    if (isUser()) {
      try {
        const body = {}; body[kind] = id || null;
        const { ok, data } = await PS.AUTH.api('/api/equip', { method: 'POST', body });
        if (ok && data.user) { PS.AUTH.setUserData(data.user); syncFromUser(data.user); }
      } catch (e) {}
    } else {
      if (id) state.equipped[kind] = id; else delete state.equipped[kind];
      saveGuest(); applyEquip();
    }
    renderPackScreen();
    PS.toast(id ? 'Equipped ' + (BY_ID[id] ? BY_ID[id].name : id) : 'Unequipped');
  }

  // ---- Slap FX (particles over the slap moment) ----------------------------
  const FX_PARTICLES = {
    burst:   { glyphs: ['✨', '✦', '✧'], n: 14, rise: false },
    bolt:    { glyphs: ['⚡'], n: 8, rise: false },
    scarabs: { glyphs: ['\u{1FAB2}'], n: 10, rise: false },
    flames:  { glyphs: ['\u{1F525}'], n: 10, rise: true },
    ankhs:   { glyphs: ['☥'], n: 12, rise: false, fall: true },
    eclipse: { glyphs: ['\u{1F311}', '✸'], n: 8, rise: false },
    crowns:  { glyphs: ['\u{1F451}'], n: 10, rise: false, fall: true },
    souls:   { glyphs: ['✧', '✦'], n: 14, rise: true },
    deluge:  { glyphs: ['\u{1F4A7}', '\u{1F30A}'], n: 14, rise: false, fall: true },
  };
  PS.playSlapFx = function (host) {
    const name = PS.equippedFx;
    const cfg = name && FX_PARTICLES[name];
    if (!cfg || !host) return;
    const wrap = el('div', 'slapfx');
    for (let i = 0; i < cfg.n; i++) {
      const p = el('i', 'fxp ' + name);
      p.textContent = cfg.glyphs[i % cfg.glyphs.length];
      p.style.left = (8 + Math.random() * 84) + '%';
      p.style.top = cfg.fall ? (-10 - Math.random() * 20) + '%' : (35 + Math.random() * 30) + '%';
      p.style.fontSize = (16 + Math.random() * 18) + 'px';
      p.style.animationDelay = (Math.random() * 0.25) + 's';
      p.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
      p.style.setProperty('--dy', (cfg.fall ? 420 : cfg.rise ? -200 : (Math.random() * 240 - 120)) + 'px');
      wrap.appendChild(p);
    }
    host.appendChild(wrap);
    setTimeout(() => wrap.remove(), 1400);
  };

  // ---- Pack screen ---------------------------------------------------------
  function itemTile(c) {
    const owned = state.owned.has(c.id);
    if (c.kind === 'charm') {
      const placed = Object.values(state.equipped.cards || {}).filter((v) => v === c.id).length;
      const t = el('div', 'citem ' + c.rarity + (owned ? '' : ' locked') + (placed ? ' equipped' : ''));
      t.appendChild(el('div', 'fx-tile', c.glyph));
      t.appendChild(el('div', 'cname', c.name));
      t.appendChild(el('div', 'crar', placed ? ('on ' + placed + ' card' + (placed > 1 ? 's' : '')) : owned ? 'tap to place' : c.rarity));
      if (owned) t.onclick = () => openForge(c);
      return t;
    }
    const eq = state.equipped[c.kind] === c.id;
    const t = el('div', 'citem ' + c.rarity + (owned ? '' : ' locked') + (eq ? ' equipped' : ''));
    if (c.kind === 'skin') t.appendChild(PS.makeBack(c.value, 52));
    else t.appendChild(el('div', 'fx-tile', c.glyph));
    t.appendChild(el('div', 'cname', c.name));
    t.appendChild(el('div', 'crar', eq ? 'EQUIPPED' : owned ? 'tap to equip' : c.rarity));
    if (owned) t.onclick = () => equip(c.kind, eq ? null : c.id);
    return t;
  }

  function renderPackScreen() {
    const fan = $('#pack-fan'); if (!fan) return;
    fan.innerHTML = '';
    const n = state.packs;
    $('#pack-count').textContent = n > 0
      ? (n + ' pack' + (n > 1 ? 's' : '') + ' ready')
      : 'Win games to earn packs — one every ' + GAMES_PER_PACK + ' games, plus level-ups';
    const btn = $('#pack-claim');
    if (lastRoll) {
      // show the rolled items as a fan
      const rot = [-22, 0, 22];
      lastRoll.forEach((it, i) => {
        let c;
        if (it.duplicate) { c = el('div', 'fx-tile big', '+' + it.xp + ' XP'); }
        else if (it.kind === 'skin') c = PS.makeBack(it.value, 92);
        else { c = el('div', 'fx-tile big', BY_ID[it.id] ? BY_ID[it.id].glyph : '?'); }
        const w = el('div', 'pack-item ' + (it.rarity || ''));
        w.appendChild(c);
        w.appendChild(el('div', 'cname', it.duplicate ? 'Collection bonus' : it.name));
        w.style.transform = 'rotate(' + rot[i % 3] + 'deg)';
        fan.appendChild(w);
      });
      btn.textContent = 'Claim';
      btn.disabled = false;
    } else {
      for (let i = 0; i < 3; i++) fan.appendChild(PS.makeBack(PS.tweaks.deckSkin, 92));
      btn.textContent = n > 0 ? ('Open Pack (' + n + ')') : 'No Packs Yet';
      btn.disabled = n < 1;
      fan.style.cursor = n > 0 ? 'pointer' : 'default';
      fan.onclick = n > 0 ? onPackButton : null;   // tapping the pack opens it too
    }
    // collection
    let grid = $('#collection');
    if (grid) {
      grid.innerHTML = '';
      grid.appendChild(el('div', 'coll-head', 'Card Backs'));
      const skins = el('div', 'coll-grid');
      CATALOG.filter(c => c.kind === 'skin').forEach(c => skins.appendChild(itemTile(c)));
      grid.appendChild(skins);
      grid.appendChild(el('div', 'coll-head', 'Slap Effects'));
      const fxs = el('div', 'coll-grid');
      CATALOG.filter(c => c.kind === 'fx').forEach(c => fxs.appendChild(itemTile(c)));
      grid.appendChild(fxs);
      grid.appendChild(el('div', 'coll-head', 'Charged Play Effects'));
      const plays = el('div', 'coll-grid');
      CATALOG.filter(c => c.kind === 'play').forEach(c => plays.appendChild(itemTile(c)));
      grid.appendChild(plays);
      grid.appendChild(el('div', 'coll-head', 'Table Backgrounds'));
      const tables = el('div', 'coll-grid');
      CATALOG.filter(c => c.kind === 'table').forEach(c => tables.appendChild(itemTile(c)));
      grid.appendChild(tables);
      grid.appendChild(el('div', 'coll-head', 'Card Charms — adorn single cards'));
      const charms = el('div', 'coll-grid');
      CATALOG.filter(c => c.kind === 'charm').forEach(c => charms.appendChild(itemTile(c)));
      grid.appendChild(charms);
    }
  }

  async function onPackButton() {
    if (lastRoll) { lastRoll = null; renderPackScreen(); return; } // claim → reset
    if (state.packs < 1) { PS.toast('No packs yet — every 5th game drops one'); return; }
    const items = await openPack();
    if (!items) { PS.toast('Could not open the pack'); return; }
    lastRoll = items;
    renderPackScreen();
    if (PS.SFX) { PS.SFX.coins(9); }
    const scr = $('#screen-pack'); if (scr && PS.confetti) PS.confetti(scr, 50);
  }

  // Override the placeholder pack renderer; ui.js loads before this module.
  PS.renderPack = function () { lastRoll = null; renderPackScreen(); };

  loadGuest(); applyEquip();
  PS.COSMO = { state, syncFromUser, loadGuest, recordMatch, openPack, equip, onPackButton, renderPackScreen, levelFromXp, CATALOG };
})(window.PS);
