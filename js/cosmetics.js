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
    const xp = (r.won ? 60 : 25) + Math.min(30, (r.slaps | 0) * 2);
    if (isUser()) {
      try {
        const { ok, data } = await PS.AUTH.api('/api/match', { method: 'POST', body: r });
        if (ok && data.user) {
          PS.AUTH.setUserData(data.user);
          syncFromUser(data.user);
          if (data.gained && data.gained.packs > 0) PS.toast('\u{1F381} Pack earned! Open it from your profile');
          else if (data.gained && data.gained.leveledUp) PS.toast('⭐ Level ' + state.level + '!');
        }
        return;
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
  async function openPack() {
    if (state.packs < 1) return null;
    if (isUser()) {
      try {
        const { ok, data } = await PS.AUTH.api('/api/pack/open', { method: 'POST' });
        if (ok) {
          if (data.user) { PS.AUTH.setUserData(data.user); syncFromUser(data.user); }
          return data.items || [];
        }
        return null;
      } catch (e) { return null; }
    }
    const items = rollLocal();
    state.packs--;
    state.xp += items.filter(i => i.duplicate).reduce((s, i) => s + i.xp, 0);
    recalc(); saveGuest();
    return items;
  }

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
    }
  }

  async function onPackButton() {
    if (lastRoll) { lastRoll = null; renderPackScreen(); return; } // claim → reset
    const items = await openPack();
    if (!items) { PS.toast('Could not open the pack'); return; }
    lastRoll = items;
    renderPackScreen();
    const scr = $('#screen-pack'); if (scr && PS.confetti) PS.confetti(scr, 50);
  }

  // Override the placeholder pack renderer; ui.js loads before this module.
  PS.renderPack = function () { lastRoll = null; renderPackScreen(); };

  loadGuest(); applyEquip();
  PS.COSMO = { state, syncFromUser, loadGuest, recordMatch, openPack, equip, onPackButton, renderPackScreen, levelFromXp, CATALOG };
})(window.PS);
