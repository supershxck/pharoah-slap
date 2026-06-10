/* ============================================================================
   Pharaoh Slap — Trials of the Gods (the ladder)
   Ported from v6.2 and re-wired to drive v7's match engine (PS.startMatch).
   Each god is one mechanic; beating them teaches that rule. Stars + the
   one-time earned-title reveal persist server-side / in localStorage.
   ========================================================================== */
window.PS = window.PS || {};
(function (PS) {
  'use strict';
  const { $, el } = PS;

  const GODS = [
    { id: 'thoth',  name: 'Thoth',  title: 'The Dealer',     domain: 'Wisdom & order',         avatar: '📜', teach: 'The play & slap loop',
      teach_long: 'Cards fall in turn. When the top two cards match rank, slap the pile. First to win every card takes the temple.',
      intro: 'I will deal. You will learn the shape of it.', defeat: 'Recorded.',
      diff: 'easy',   expert: false, rules: { double: true,  sandwich: false, run: false } },
    { id: 'set',    name: 'Set',    title: 'Doubles Danny',  domain: 'Chaos & impulse',        avatar: '🌩', teach: 'Doubles — slap matching pairs',
      teach_long: 'Set plays fast and loud. The instant two equal ranks stack, slap. Hesitate and the storm takes the pile.',
      intro: 'Two of a kind. SLAP IT. Or don’t — I don’t care.', defeat: 'Tch. Lucky.',
      diff: 'normal', expert: false, rules: { double: true,  sandwich: false, run: false } },
    { id: 'anubis', name: 'Anubis', title: 'Sandwich Sam',   domain: 'Judgement & patience',   avatar: '𓁢', teach: 'Sandwiches — rank · any · same rank',
      teach_long: 'A new truth: a sandwich is slappable — same rank with exactly one card between. Doubles still count. Weigh before you strike.',
      intro: 'Every card is a soul. I weigh them all.', defeat: 'Your hand was… heavier.',
      diff: 'normal', expert: false, rules: { double: true,  sandwich: true,  run: false } },
    { id: 'horus',  name: 'Horus',  title: 'The Monk',       domain: 'Sky & precision',        avatar: '🦅', teach: 'Pure reaction — be faster',
      teach_long: 'No new rule. Only speed. Horus does not blink. Doubles and sandwiches both count — slap before you think.',
      intro: '(He simply watches, unblinking.)', defeat: 'You saw it. Good.',
      diff: 'hard',   expert: false, rules: { double: true,  sandwich: true,  run: false } },
    { id: 'apep',   name: 'Apep',   title: 'The Snake',      domain: 'Deception & entropy',    avatar: '🐍', teach: 'Sequences — and refuse the bait',
      teach_long: 'Three cards climbing or falling in rank are slappable. Apep plays bait that only looks legal — a false slap costs you a card. Strike only on truth.',
      intro: 'The pile lies. So do I.', defeat: 'Sssslippery…',
      diff: 'normal', expert: false, rules: { double: true,  sandwich: true,  run: true } },
    { id: 'seshat', name: 'Seshat', title: 'The Professor',  domain: 'Mathematics',            avatar: '📐', teach: 'Read the board — no mercy on tempo',
      teach_long: 'Seshat counts faster than you. Doubles, sandwiches and sequences are all live, and she never wastes a beat. Commit only when the math is certain.',
      intro: 'It’s only arithmetic. You’re simply bad at it.', defeat: '…the math changed.',
      diff: 'hard',   expert: false, rules: { double: true,  sandwich: true,  run: true } },
    { id: 'ra',     name: 'Ra',     title: 'The Shark',      domain: 'Supreme power',          avatar: '☀️', teach: 'All rules. No cues. No mercy.',
      teach_long: 'Every rule is live — doubles, sandwiches, sequences, top-and-bottom — and the slap cues are gone. See it yourself, or lose. The sun does not explain itself.',
      intro: '', defeat: '',
      diff: 'hard',   expert: true,  rules: { double: true,  sandwich: true,  run: true, topBottom: true } },
  ];
  const GOD_BY_ID = Object.fromEntries(GODS.map((g) => [g.id, g]));
  const PATH_SEQ = {
    initiate:  ['thoth', 'set', 'anubis', 'horus', 'apep', 'seshat', 'ra'],
    contender: ['set', 'anubis', 'horus', 'apep', 'seshat', 'ra'],
    ascendant: ['horus', 'apep', 'seshat', 'ra'],
  };
  const PATH_LABEL = { initiate: 'Path I · The Initiate', contender: 'Path II · The Contender', ascendant: 'Path III · The Ascendant' };
  const PATH_TITLE = { initiate: 'The Initiate', contender: 'The Contender', ascendant: 'The Ascendant' };
  const PATH_TAG = {
    initiate:  'The full road of the gods lies before you. Walk it from the first deal.',
    contender: 'The gods waste no time on you. The storm came first.',
    ascendant: 'You began where others end. The falcon knew you already.',
  };
  // god difficulty → v7 match difficulty + speed
  const DIFF_MAP  = { easy: 'easy',   normal: 'medium', hard: 'hard' };
  const SPEED_MAP = { easy: 'chill',  normal: 'normal', hard: 'fast'  };
  const REVEAL_KEY = 'ps_path_revealed';

  let active = false;        // a ladder/arena match is in flight → route end-screen back here
  let currentGod = null;
  let pendingReveal = false;

  const wasRevealed = () => { try { return !!localStorage.getItem(REVEAL_KEY); } catch { return false; } };
  const markRevealed = () => { try { localStorage.setItem(REVEAL_KEY, '1'); } catch {} };

  const usr = () => (PS.AUTH ? PS.AUTH.getUser() : null);
  const pathOf = () => { const u = usr(); return (u && u.tutorialPath) || 'initiate'; };
  function progressMap() {
    const u = usr(); const m = {};
    if (u && u.progress) u.progress.forEach((p) => (m[p.godId] = p));
    return m;
  }
  function recommendedNext() {
    const seq = PATH_SEQ[pathOf()] || PATH_SEQ.initiate;
    const pm = progressMap();
    return seq.find((id) => !pm[id] || !pm[id].stars) || null;
  }

  function starStr(n) {
    n = n || 0; let s = '';
    for (let i = 0; i < 3; i++) s += i < n ? '★' : '<span class="dim">★</span>';
    return s;
  }

  /* ---- List ------------------------------------------------------------- */
  function renderList() {
    $('#ladder-intro').classList.remove('show');
    $('#ladder-list').style.display = 'flex';
    const path = pathOf();
    $('#ladder-path').textContent = PATH_LABEL[path] || '';
    const seq = PATH_SEQ[path] || PATH_SEQ.initiate;
    const onPath = new Set(seq);
    const pm = progressMap();
    const next = recommendedNext();
    const list = $('#ladder-list'); list.innerHTML = '';
    GODS.forEach((g) => {
      const beaten = pm[g.id] && pm[g.id].stars > 0;
      const row = el('div', 'god-row' + (g.id === next ? ' next' : '') + (!onPath.has(g.id) ? ' offpath' : '') + (beaten ? ' beaten' : ''));
      row.innerHTML =
        '<div class="god-ava">' + g.avatar + '</div>' +
        '<div class="god-meta"><div class="gname">' + g.name + ' <span class="gtitle">· ' + g.title + '</span></div>' +
        '<div class="gteach">' + g.teach + '</div></div>' +
        '<div class="god-right">' + (g.id === next ? '<span class="next-tag">Next</span>' : '') +
        '<span class="god-stars">' + starStr(pm[g.id] ? pm[g.id].stars : 0) + '</span></div>';
      row.onclick = () => showIntro(g.id);
      list.appendChild(row);
    });

    // Arena tables (Phase 4 wires these to real free-for-alls).
    const raBeaten = pm['ra'] && pm['ra'].stars > 0;
    arenaRow(list, 'The Triad · You + 2 Gods',
      raBeaten ? 'Free-for-all against Set & Horus' : 'Free-for-all — beat Ra to feel ready (open now)',
      true, () => beginArena(2));
    // Phase 4: the 4-seat table. v7's engine + opponent belt are N-agnostic,
    // so the Quorum is a real free-for-all now (no layout-4p hack needed).
    arenaRow(list, 'The Quorum · You + 3 Gods',
      raBeaten ? 'The four-god table — Set, Horus & Apep' : 'The four-god free-for-all (open now)',
      true, () => beginArena(3));
  }
  function arenaRow(list, label, sub, enabled, onClick) {
    const r = el('div', 'god-row' + (enabled ? '' : ' offpath'));
    r.innerHTML =
      '<div class="god-ava">⚔️</div>' +
      '<div class="god-meta"><div class="gname">' + label + '</div><div class="gteach">' + sub + '</div></div>' +
      '<div class="god-right"><span class="next-tag">' + (enabled ? 'Arena' : 'Soon') + '</span></div>';
    if (enabled && onClick) r.onclick = onClick;
    list.appendChild(r);
  }

  function showIntro(id) {
    currentGod = id;
    const g = GOD_BY_ID[id]; if (!g) return;
    $('#ladder-list').style.display = 'none';
    $('#intro-ava').textContent = g.avatar;
    $('#intro-name').textContent = g.name;
    $('#intro-title').textContent = g.title + ' — ' + g.domain;
    $('#intro-teach').textContent = g.teach_long;
    $('#intro-line').textContent = g.intro ? '“' + g.intro + '”' : '';
    $('#ladder-intro').classList.add('show');
  }

  /* ---- Launch a god duel on the v7 engine -------------------------------- */
  function begin(id) {
    currentGod = id || currentGod;
    const g = GOD_BY_ID[currentGod]; if (!g) return;
    active = true;
    PS.startMatch({
      opponents: [{ name: g.name, glyph: g.avatar }],
      slapOpts: {
        double: g.rules.double !== false,
        sandwich: !!g.rules.sandwich,
        runs: !!g.rules.run,
        topBottom: !!g.rules.topBottom,
      },
      difficulty: DIFF_MAP[g.diff] || 'medium',
      gameSpeed: SPEED_MAP[g.diff] || 'normal',
      expert: !!g.expert,
      slapTarget: 5,
      label: g.name + ' · ' + g.title,
      onEnd: (won, stats) => onEnd(won, stats),
    });
  }

  function beginArena(n) {
    currentGod = null;
    active = true;
    const pool = [{ name: 'Set', glyph: '🌩' }, { name: 'Horus', glyph: '🦅' }, { name: 'Apep', glyph: '🐍' }];
    PS.startMatch({
      opponents: pool.slice(0, n),
      slapOpts: { double: true, sandwich: true, runs: false, topBottom: false },
      difficulty: 'medium',
      gameSpeed: 'normal',
      slapTarget: 6,
      label: 'The Arena',
      onEnd: () => { /* arena: no stars, just return to the ladder */ },
    });
  }

  async function recordProgress(godId, stats) {
    try {
      const { ok, data } = await PS.AUTH.api('/api/progress', {
        method: 'POST',
        body: { godId, result: { won: true, pileWins: stats.pileWins || 0, falseSlaps: stats.falseSlaps || 0, fastestSlap: stats.fastestSlap || 0 } },
      });
      if (ok && data.user) PS.AUTH.setUserData(data.user);
    } catch (e) { /* offline — stars sync on next /me */ }
  }

  // Called by the match end-screen hook.
  function onEnd(won, stats) {
    const g = GOD_BY_ID[currentGod];
    if (won && g) {
      recordProgress(g.id, stats || {});
      if (!wasRevealed()) pendingReveal = true; // first win ever confers the title
    }
  }

  /* ---- Reveal + open ----------------------------------------------------- */
  function showReveal(done) {
    const path = pathOf();
    $('#rv-title').textContent = PATH_TITLE[path] || 'The Initiate';
    $('#rv-tag').textContent = PATH_TAG[path] || '';
    const veil = $('#reveal-veil'); veil.classList.add('show');
    const dismiss = () => { veil.removeEventListener('click', dismiss); veil.classList.remove('show'); markRevealed(); pendingReveal = false; done(); };
    veil.addEventListener('click', dismiss);
  }
  function showLadder() { renderList(); PS.showScreen('ladder'); }

  function open() {
    active = false; currentGod = null;
    if (PS.AUTH && !PS.AUTH.getUser()) { PS.toast('Sign in to walk the Trials'); PS.showScreen('home'); return; }
    if (pendingReveal && !wasRevealed()) showReveal(showLadder);
    else showLadder();
  }

  // After a ladder/arena match ends, the victory screen routes back here.
  function resumeAfterMatch(replay) {
    if (replay && currentGod) { begin(currentGod); return; }
    open();
  }

  PS.LADDER = {
    open, begin, beginArena, renderList, resumeAfterMatch,
    get active() { return active; },
    set active(v) { active = v; },
    get currentGod() { return currentGod; },
  };
})(window.PS);
