/* ============================================================================
   Pharaoh Slap — UI helpers, screen router, static screen rendering
   ========================================================================== */
window.PS = window.PS || {};
(function (PS) {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  PS.$ = $; PS.$$ = $$; PS.el = el;

  // Slap-rule vocabulary — each rule answers to several names; calls cycle
  // through them so the table keeps its mystique. First name = primary.
  const RULE_NAMES = {
    double:    ['Twins', 'Gemini'],
    sandwich:  ['Orbit', '180'],
    marriage:  ['Trine', 'Luminaries'],
    divorce:   ['Void', 'Squared'],
    run:       ['Sequence'],
    topbottom: ['Top & Bottom'],
  };
  const ruleCycle = {};
  PS.RULE_NAMES = RULE_NAMES;
  PS.ruleName = function (key) {
    const names = RULE_NAMES[key];
    if (!names) return key || '';
    ruleCycle[key] = ((ruleCycle[key] || 0) + 1) % names.length;
    return names[ruleCycle[key]];
  };
  PS.ruleLabel = function (key) {       // static form for menus & rule lists
    const names = RULE_NAMES[key];
    return names ? names.join(' · ') : key || '';
  };

  const ANKH = '\u{13099}';        // hieroglyph used as card seal
  PS.GLYPHS = ['\u{13000}', '\u{1304E}', '\u{13080}', '\u{1308C}', '\u{130C0}', '\u{1310C}', '\u{13171}', '\u{131CB}', '\u{13088}', '\u{13045}'];

  /* ---- Card rendering ---------------------------------------------------- */
  PS.makeCard = function (card, scale) {
    const e = el('div', 'card ' + (card.red ? 'red' : 'black'));
    if (card.rank >= 11) e.classList.add('face');
    if (scale) e.style.setProperty('--cw', scale + 'px');
    const g = card.glyph;
    // Royal portraits (hieroglyph figures) on courts; aces get the ornate seal
    const ROYAL = { 11: '\u{1320E}', 12: '\u{13050}', 13: '\u{1305B}' };
    if (card.rank === 14) e.classList.add('ace');
    e.innerHTML =
      '<div class="pip-corner tl"><span class="r">' + card.label + '</span><span class="s">' + g + '</span></div>' +
      (card.rank >= 11 && card.rank <= 13
        ? '<div class="court"><span class="royal">' + ROYAL[card.rank] + '</span></div>'
        : '') +
      (card.rank === 14
        ? '<div class="ace-orn"><span class="ao-ring"></span><span class="ao-suit">' + g + '</span><span class="ao-ankh">\u{13099}</span></div>'
        : '<div class="center-suit">' + g + '</div>') +
      '<div class="pip-corner br"><span class="r">' + card.label + '</span><span class="s">' + g + '</span></div>';
    // Player's per-card charm (pack cosmetic placed on this exact card)
    const charm = PS.getCardCharm && PS.getCardCharm(card);
    if (charm) {
      e.classList.add('charm-' + charm.value);
      e.appendChild(el('div', 'charm-mark', charm.glyph || ''));
    }
    return e;
  };

  PS.makeBack = function (skin, scale) {
    const e = el('div', 'card back ' + (skin || 'egypt'));
    if (scale) e.style.setProperty('--cw', scale + 'px');
    e.innerHTML = '<div class="seal">' + ANKH + '</div>';
    return e;
  };

  /* ---- Screen router ----------------------------------------------------- */
  let current = 'home';
  PS.currentScreen = () => current;
  PS.showScreen = function (id) {
    const next = document.getElementById('screen-' + id);
    if (!next) return;
    const prev = document.querySelector('.screen.active');
    if (prev && prev !== next) {
      prev.classList.remove('active');
      prev.classList.add('leaving');
      setTimeout(() => prev.classList.remove('leaving'), 360);
    }
    next.classList.add('active');
    current = id;
    if (PS.onScreen) PS.onScreen(id);
    window.scrollTo(0, 0);
  };

  /* ---- Toast ------------------------------------------------------------- */
  let toastEl, toastTimer;
  PS.toast = function (msg) {
    if (!toastEl) { toastEl = el('div', 'toast'); document.querySelector('.phone').appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
  };

  /* ---- Confetti ---------------------------------------------------------- */
  PS.confetti = function (host, n) {
    const wrap = el('div', 'confetti');
    const colors = ['#f6cf6b', '#2f63d6', '#34c8c0', '#d8472e', '#74e29a', '#ffffff'];
    for (let i = 0; i < (n || 60); i++) {
      const p = el('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = (1.6 + Math.random() * 1.8) + 's';
      p.style.animationDelay = (Math.random() * 0.6) + 's';
      p.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      wrap.appendChild(p);
    }
    host.appendChild(wrap);
    setTimeout(() => wrap.remove(), 4000);
  };

  /* ---- Profile / leaderboard data --------------------------------------- */
  // Real values come from PS.COSMO (server for accounts, localStorage for
  // guests) — these are just the pre-boot defaults. Everyone starts at 1.
  PS.PROFILE = {
    name: 'Wanderer', level: 1, xp: 0, xpMax: 120,
    cardsPlayed: 0, slapsLanded: 0, glyph: '\u{1304E}',
  };

  PS.BOT_ROSTER = [
    { name: 'PharaohRage', glyph: '\u{13000}', level: 15 },
    { name: 'AnubisSlap',  glyph: '\u{1308C}', level: 19 },
    { name: 'CleoClap',    glyph: '\u{13171}', level: 13 },
    { name: 'SphinxMastr', glyph: '\u{131CB}', level: 21 },
    { name: 'RaThunder',   glyph: '\u{130C0}', level: 17 },
  ];

  PS.LEADERBOARD = [
    { name: 'Slap Maher', score: 5495, glyph: '\u{13000}' },
    { name: 'PackRexnu',  score: 15384, glyph: '\u{1308C}' },
    { name: 'Slap Mastr', score: 3464, glyph: '\u{131CB}' },
    { name: 'Clap Flax',  score: 3583, glyph: '\u{130C0}' },
    { name: 'Slap Ellap', score: 3404, glyph: '\u{13171}' },
    { name: 'premiumisme',score: 2980, glyph: '\u{1304E}' },
  ];

  /* ---- Render HOME ------------------------------------------------------- */
  PS.renderHome = function () {
    const P = PS.PROFILE;
    $('#home-avatar').innerHTML = P.glyph;
    $('#home-name').firstChild && ($('#home-name').childNodes[0].nodeValue = P.name + ' ');
    $('#home-level').textContent = 'Level ' + P.level;
    const hp = $('#home-packs');
    if (hp && PS.COSMO) hp.innerHTML = '\u{1F381} ' + PS.COSMO.state.packs;

    // deck preview backs
    const dp = $('#home-deck'); dp.innerHTML = '';
    const skins = [PS.tweaks.deckSkin, PS.tweaks.deckSkin, PS.tweaks.deckSkin === 'tiedye' ? 'egypt' : 'tiedye'];
    [0,1,2].forEach(i => { dp.appendChild(PS.makeBack(skins[i] || 'tiedye', 56)); });
    const altcard = PS.makeCard({ rank: 14, suit: 'spades', red: false, label: 'A', glyph: '\u2660' }, 56);
    dp.appendChild(altcard);

    // floating cards around the hero
    PS.$$('#screen-home .float-card').forEach((fc, i) => {
      fc.innerHTML = '';
      fc.appendChild(PS.makeBack(PS.tweaks.deckSkin, 44));
      fc.style.transform = 'rotate(' + (i % 2 ? 14 : -16) + 'deg)';
    });

    // game modes (replaced the placeholder leaderboard)
    const modes = $('#home-modes');
    if (modes) {
      modes.innerHTML = '';
      const MODES = [
        { g: '\u26A1', n: 'Quick Duel', s: 'You vs one god', go: () => PS.startMatch({ players: 2 }) },
        { g: '\u{1F531}', n: 'The Triad', s: '3-seat brawl', go: () => PS.startMatch({ opponents: [{ name: 'Set', glyph: '\u{1F329}' }, { name: 'Horus', glyph: '\u{1F985}' }], slapTarget: 6, label: 'The Triad' }) },
        { g: '\u{1F451}', n: 'The Quorum', s: '4-seat brawl', go: () => PS.startMatch({ opponents: [{ name: 'Set', glyph: '\u{1F329}' }, { name: 'Horus', glyph: '\u{1F985}' }, { name: 'Anubis', glyph: '\u{13062}' }], slapTarget: 6, label: 'The Quorum' }) },
        { g: '\u2694', n: 'Trials', s: 'Face the gods', go: () => { if (PS.LADDER) PS.LADDER.open(); } },
        { g: '\u{1F310}', n: 'Online', s: 'Real opponents', go: () => { if (PS.NET) PS.NET.openLobby(); } },
        { g: '\u2699', n: 'Custom', s: 'Your house rules', go: () => { if (PS.CUSTOM) PS.CUSTOM.open(); } },
      ];
      MODES.forEach((m) => {
        const t = el('button', 'mode-tile');
        t.innerHTML = '<span class="mg">' + m.g + '</span><span class="mn">' + m.n + '</span><span class="ms2">' + m.s + '</span>';
        t.onclick = m.go;
        modes.appendChild(t);
      });
    }
    // season banner tier
    const sb = $('#sb-tier');
    if (sb && PS._seasonState) sb.textContent = 'Tier ' + PS._seasonState.tier + ' / 30 \u00B7 ' + (PS._seasonState.pass ? 'Pass active' : 'Free track');
  };

  /* ---- Render PROFILE ---------------------------------------------------- */
  PS.renderProfile = function () {
    const P = PS.PROFILE;
    $('#pf-avatar').innerHTML = P.glyph;
    $('#pf-name').textContent = P.name;
    $('#pf-level').textContent = 'Level ' + P.level;
    const pct = Math.round(P.xp / P.xpMax * 100);
    $('#pf-xpfill').style.width = pct + '%';
    $('#pf-xptext').textContent = 'XP ' + P.xp.toLocaleString() + ' / ' + P.xpMax.toLocaleString();
    $('#pf-cards').textContent = P.cardsPlayed.toLocaleString();
    $('#pf-slaps').textContent = P.slapsLanded.toLocaleString();

    const tray = $('#pf-rewards'); tray.innerHTML = '';
    const rewards = [
      { c: PS.makeCard({ rank: 2, suit: 'spades', red: false, label: '2', glyph: '\u2660' }, 58), lab: 'Upgraded' },
      { c: PS.makeCard({ rank: 11, suit: 'hearts', red: true, label: 'J', glyph: '\u2665' }, 58), lab: 'Alt Art' },
      { c: PS.makeBack('tiedye', 58), lab: 'Rare' },
    ];
    rewards.forEach(r => {
      const w = el('div', 'reward');
      w.appendChild(r.c);
      w.appendChild(el('div', 'rlab', r.lab));
      tray.appendChild(w);
    });
  };

  /* ---- Render PACK ------------------------------------------------------- */
  PS.renderPack = function () {
    const fan = $('#pack-fan'); fan.innerHTML = '';
    const cards = [
      PS.makeCard({ rank: 14, suit: 'spades', red: false, label: 'A', glyph: '\u2660' }, 92),
      PS.makeCard({ rank: 14, suit: 'spades', red: false, label: 'A', glyph: '\u2660' }, 92),
      PS.makeCard({ rank: 11, suit: 'hearts', red: true, label: 'J', glyph: '\u2665' }, 92),
      PS.makeBack('tiedye', 92),
    ];
    const rot = [-26, -9, 9, 26];
    cards.forEach((c, i) => {
      c.style.transform = 'translateX(-50%) rotate(0deg)';
      c.style.zIndex = i;
      fan.appendChild(c);
      requestAnimationFrame(() => {
        setTimeout(() => { c.style.transform = 'translateX(-50%) rotate(' + rot[i] + 'deg) translateY(' + Math.abs(rot[i]) * -0.6 + 'px)'; }, 120 + i * 110);
      });
    });
  };

})(window.PS);
