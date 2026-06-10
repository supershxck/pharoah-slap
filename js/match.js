/* ============================================================================
   Pharaoh Slap — Match controller (drives engine, bots, slap race, animation)
   ========================================================================== */
window.PS = window.PS || {};
(function (PS) {
  'use strict';
  const { el, $ } = PS;

  const SPEED = {
    chill:  { turn: 1150, window: 1550 },
    normal: { turn: 820,  window: 1150 },
    fast:   { turn: 560,  window: 840  },
    blitz:  { turn: 380,  window: 600  },
  };
  const DIFF = {
    easy:   { react: [640, 1180], miss: 0.42, falseSlap: 0.010 },
    medium: { react: [410, 800],  miss: 0.24, falseSlap: 0.022 },
    hard:   { react: [250, 520],  miss: 0.10, falseSlap: 0.040 },
  };
  const rint = (a, b) => a + Math.random() * (b - a);

  let M = null; // active match

  // opts (all optional): { players, opponents:[{name,glyph}], slapOpts,
  //   difficulty, gameSpeed, expert, slapTarget, label, mode, onEnd(won,stats) }
  PS.startMatch = function (opts) {
    if (M) M.destroy();
    PS._lastMatchOpts = opts || {};   // so Rematch replays the same rules
    M = new Match(opts || {});
    PS.activeController = M;   // input router (a NetMatch can claim this too)
    M.begin();
  };
  // Route table input to whichever controller is live (local Match or NetMatch).
  PS.matchPlayCard = () => { const c = PS.activeController; if (c && c.humanPlay) c.humanPlay(); };
  PS.matchSlap = () => { const c = PS.activeController; if (c && c.humanSlap) c.humanSlap(); };

  function Match(opts) {
    opts = opts || {};
    this.cfg = opts;
    this.timers = new Set();
    this.botSlapTimers = new Set();
    this.windowTimer = null;
    this.turnTimer = null;
    this.slapWindowOpen = false;
    this.paused = false;
    this.matchOver = false;
    this.pileEls = [];
    this.slapTarget = opts.slapTarget || 8;
    this.expert = !!opts.expert;          // hide slap cues (Ra)
    this.onEnd = typeof opts.onEnd === 'function' ? opts.onEnd : null;
    this.label = opts.label || 'Slap Duel';

    const t = PS.tweaks;
    // Explicit opponents (e.g. a god duel) win over the generic bot roster.
    let cfg;
    if (opts.opponents && opts.opponents.length) {
      cfg = [{ name: PS.PROFILE.name, glyph: PS.PROFILE.glyph, isHuman: true }];
      opts.opponents.forEach(o => cfg.push({ name: o.name, glyph: o.glyph }));
    } else {
      const nPlayers = Math.max(2, Math.min(4, opts.players || t.players || 2));
      const roster = PS.BOT_ROSTER.slice();
      cfg = [{ name: PS.PROFILE.name, glyph: PS.PROFILE.glyph, isHuman: true }];
      for (let i = 0; i < nPlayers - 1; i++) cfg.push({ name: roster[i].name, glyph: roster[i].glyph });
    }
    this.playerCfg = cfg;

    this.engine = PSEngine.createGame({
      players: cfg.map(c => ({ name: c.name, avatar: c.glyph, isHuman: c.isHuman })),
      slapOpts: opts.slapOpts || { topBottom: false, runs: false },
    });
    this.human = 0;
    this.engine.on(this.onEvent.bind(this));
  }

  Match.prototype.timing = function () {
    const t = PS.tweaks;
    const speed = this.cfg.gameSpeed || t.gameSpeed;
    const diff = this.cfg.difficulty || t.difficulty;
    return { s: SPEED[speed] || SPEED.normal, d: DIFF[diff] || DIFF.medium };
  };

  Match.prototype.begin = function () {
    this._t0 = Date.now();
    this.renderShell();
    PS.showScreen('table');
    if (PS.RULES) PS.RULES.setActive(this.cfg.slapOpts || {}, this.label, this.slapTarget);
    // First match ever → quick tutorial; the deal waits until it's dismissed.
    if (PS.RULES && PS.RULES.needsTutorial()) {
      PS.RULES.openTutorial(() => this.engine.deal());
    } else {
      setTimeout(() => this.engine.deal(), 280);
    }
  };

  /* ---- Build static table chrome for this player set --------------------- */
  Match.prototype.renderShell = function () {
    const eng = this.engine;
    // HUD: you on left
    const you = eng.players[this.human];
    $('#hud-you').innerHTML =
      '<div class="avatar sm" id="hud-you-ava">' + you.avatar + '</div>' +
      '<div class="meta"><div class="pn">' + you.name + '</div>' +
      '<div class="pc"><span id="hud-you-slaps">0</span> slaps · <span id="hud-you-count">0</span> cards</div>' +
      '<div class="cardbar"><i id="hud-you-bar"></i></div></div>';
    $('#hud-info').innerHTML =
      '<div class="meta"><div class="pn engrave">First to ' + this.slapTarget + '</div>' +
      '<div class="pc">' + this.label + '</div></div>';

    // Opponent belt
    const belt = $('#opp-belt'); belt.innerHTML = '';
    for (let i = 0; i < eng.players.length; i++) {
      if (i === this.human) continue;
      const p = eng.players[i];
      const o = el('div', 'opp');
      o.dataset.idx = i;
      o.innerHTML =
        '<div class="avatar">' + p.avatar + '</div>' +
        '<div class="on">' + p.name + '</div>' +
        '<div class="ocnt"><span class="cnt">0</span> cards</div>' +
        '<div class="cardbar" style="width:54px"><i></i></div>';
      belt.appendChild(o);
    }
    // your deck strip
    const mh = $('#myhand'); mh.innerHTML = '';
    for (let i = 0; i < 4; i++) mh.appendChild(PS.makeBack(PS.tweaks.deckSkin, 26));
    const lab = el('span'); lab.style.cssText = 'font-size:11px;color:var(--muted);letter-spacing:.1em;font-family:var(--font-head)'; lab.textContent = 'YOUR DECK';
    mh.appendChild(lab);

    // clear pile visuals
    const pile = $('#pile');
    this.pileEls = [];
    Array.from(pile.querySelectorAll('.card')).forEach(c => c.remove());
    pile.classList.remove('slappable');
    $('#tribute').hidden = true;
    this.refreshHUD();
    this.updateControls();
  };

  /* ---- Engine event handler --------------------------------------------- */
  Match.prototype.onEvent = function (ev) {
    switch (ev.type) {
      case 'turn':
        this.pendingTurn = ev.player;
        if (!this.slapWindowOpen && !this.paused && !this.matchOver) this.scheduleTurn(ev.player);
        this.highlightTurn(ev.player);
        break;
      case 'play':
        this.addPileCard(ev.card, ev.player);
        this.refreshHUD();
        break;
      case 'faceChallenge':
        this.showTribute(ev.owed, ev.card);
        break;
      case 'tribute':
        this.showTribute(ev.owed);
        break;
      case 'slapOpen':
        this.openSlapWindow(ev.reasons);
        break;
      case 'slap':
        this.refreshHUD();
        break;
      case 'burn':
        if (ev.player !== this.human) {
          const p = this.engine.players[ev.player];
          PS.toast(p.name + ' slapped — BLOCKED!');
        }
        break;
      case 'pileWon':
        this.onPileWon(ev);
        break;
      case 'eliminated':
        ev.players.forEach(i => { const o = this.oppEl(i); if (o) o.classList.add('out'); });
        break;
      case 'gameOver':
        this.onGameOver(ev.winner);
        break;
    }
  };

  Match.prototype.oppEl = function (i) { return document.querySelector('.opp[data-idx="' + i + '"]'); };

  Match.prototype.highlightTurn = function (idx) {
    PS.$$('.opp').forEach(o => o.classList.toggle('turn', +o.dataset.idx === idx));
    $('#hud-you').classList.toggle('turn', idx === this.human);
  };

  /* ---- Turn scheduling --------------------------------------------------- */
  Match.prototype.scheduleTurn = function (idx) {
    if (this.matchOver) return;
    const p = this.engine.players[idx];
    if (!p || p.eliminated) return;
    if (p.isHuman) { this.updateControls(); return; }
    // bot auto-plays
    const delay = this.timing().s.turn * (0.8 + Math.random() * 0.5);
    const tm = setTimeout(() => {
      this.timers.delete(tm);
      if (this.matchOver || this.slapWindowOpen || this.paused) return;
      if (this.engine.state.turn === idx) this.engine.playTopCard(idx);
    }, delay);
    this.timers.add(tm);
    this.updateControls();
  };

  Match.prototype.humanPlay = function () {
    if (this.matchOver || this.paused || this.slapWindowOpen) return;
    if (this.engine.state.turn !== this.human) return;
    this.engine.playTopCard(this.human);
  };

  /* ---- Slap window ------------------------------------------------------- */
  Match.prototype.openSlapWindow = function (reasons) {
    this.slapWindowOpen = true;
    if (!this.expert) $('#pile').classList.add('slappable'); // Ra hides the cue
    this.clearBotSlapTimers();
    const { s, d } = this.timing();
    // each opponent decides whether/when to slap
    for (const p of this.engine.players) {
      if (p.isHuman || p.eliminated) continue;
      if (Math.random() < d.miss) continue;            // bot misses this one
      const react = rint(d.react[0], d.react[1]);
      if (react > s.window) continue;                  // too slow to land in window
      const tm = setTimeout(() => {
        this.botSlapTimers.delete(tm);
        if (!this.slapWindowOpen || this.matchOver) return;
        this.engine.attemptSlap(p.index);
      }, react);
      this.botSlapTimers.add(tm);
    }
    clearTimeout(this.windowTimer);
    this.windowTimer = setTimeout(() => this.closeSlapWindow(), s.window);
    this.updateControls();
  };

  Match.prototype.closeSlapWindow = function () {
    if (!this.slapWindowOpen) return;
    this.slapWindowOpen = false;
    $('#pile').classList.remove('slappable');
    this.clearBotSlapTimers();
    if (this.matchOver || this.paused) return;
    // the moment passed unslapped — resume play
    this.scheduleTurn(this.engine.state.turn);
  };

  Match.prototype.humanSlap = function () {
    if (this.matchOver || this.paused) return;
    const res = this.engine.attemptSlap(this.human);
    if (!res || res.ignored) return;
    if (res.valid) {
      // win path -> onPileWon shows the 'YOU SLAPPED FIRST' moment
    } else {
      this.flashSlap('block', { reasons: [] });
      this.refreshHUD();
    }
  };

  /* ---- Pile won ---------------------------------------------------------- */
  Match.prototype.onPileWon = function (ev) {
    this.slapWindowOpen = false;
    $('#pile').classList.remove('slappable');
    this.clearBotSlapTimers();
    clearTimeout(this.windowTimer);
    this.clearTurnTimers();
    $('#tribute').hidden = true;

    const winner = this.engine.players[ev.winner];
    this.sweepPile(ev.winner);
    this.refreshHUD();

    // match win by slaps target
    if (ev.reason === 'slap' && winner.slapsLanded >= this.slapTarget && !this.matchOver) {
      this.matchOver = true;
      this.paused = true;
      setTimeout(() => this.onGameOver(ev.winner), 700);
    }

    if (ev.reason === 'slap' && ev.winner === this.human) {
      this.flashSlap('win', ev);
    } else if (ev.reason === 'slap') {
      PS.toast(winner.name + ' grabbed ' + ev.count + ' cards!');
    }
  };

  /* ---- Slap moment overlay ---------------------------------------------- */
  Match.prototype.flashSlap = function (kind, ev) {
    this.paused = true;
    this.clearTurnTimers();
    const scr = $('#screen-slap');
    const hand = $('#slap-hand'), title = $('#slap-title'), sub = $('#slap-sub'), prize = $('#slap-prize');
    if (kind === 'win') {
      hand.textContent = '\u{1F590}';
      title.textContent = 'YOU SLAPPED FIRST!';
      title.className = 'slap-title win';
      const reason = (ev.reasons && ev.reasons[0]) || 'double';
      sub.textContent = ({ double: 'Double!', sandwich: 'Sandwich!', marriage: 'Marriage — Q & K!', divorce: 'Divorce — Q ✕ K!', topbottom: 'Top & Bottom!', run: 'Run of three!' }[reason]) || 'Clean slap!';
      prize.hidden = false;
      prize.className = 'slap-prize frame';
      prize.innerHTML = '<span class="gold-text">PILE WON · +' + ev.count + ' cards</span>';
      if (PS.playSlapFx) PS.playSlapFx(scr);   // equipped slap effect
    } else {
      hand.textContent = '\u270B';
      title.textContent = 'BLOCKED!';
      title.className = 'slap-title block';
      sub.textContent = 'Not a slap — you burned a card';
      prize.hidden = false;
      prize.className = 'slap-prize frame';
      prize.innerHTML = '<span style="color:var(--carnelian-2)">PENALTY · −1 card</span>';
    }
    PS.showScreen('slap');
    const hold = kind === 'win' ? 1250 : 950;
    setTimeout(() => {
      if (this.matchOver) return; // victory will take over
      PS.showScreen('table');
      this.paused = false;
      this.scheduleTurn(this.engine.state.turn);
    }, hold);
  };

  /* ---- Game over --------------------------------------------------------- */
  Match.prototype.onGameOver = function (winnerIdx) {
    if (this._ended) return;   // engine event + slap-target timer can both land here
    this._ended = true;
    this.matchOver = true;
    this.paused = true;
    this.clearAll();
    const winner = this.engine.players[winnerIdx];
    const me = this.engine.players[this.human];
    const won = winnerIdx === this.human;
    const duration = this._t0 ? Math.round((Date.now() - this._t0) / 1000) : 0;
    // Progression hook (ladder records stars, reveals title, etc.)
    if (this.onEnd) {
      try {
        this.onEnd(won, {
          pileWins: me.pilesWon,
          falseSlaps: me.slapsMissed,
          fastestSlap: 0,        // v7 engine doesn't time slaps yet
          slaps: me.slapsLanded,
          cards: me.cardsPlayed,
          duration,
        });
      } catch (e) { /* never let a hook break the end screen */ }
    }
    // XP / packs / totals — every local match counts (guest or account).
    if (PS.COSMO) {
      PS.COSMO.recordMatch({
        won, slaps: me.slapsLanded, cards: me.cardsPlayed,
        falseSlaps: me.slapsMissed, duration,
      });
    }
    PS.showVictory({
      winnerIdx, winner,
      youWon: won,
      slaps: me.slapsLanded,
      cards: me.cardsPlayed,
    });
  };

  /* ---- Pile rendering ---------------------------------------------------- */
  Match.prototype.addPileCard = function (card, fromPlayer) {
    const pile = $('#pile');
    const c = PS.makeCard(card, 120);
    const rot = (Math.random() * 16 - 8);
    const ox = (Math.random() * 22 - 11), oy = (Math.random() * 16 - 8);
    c.style.transform = 'translate(-50%,-50%) translate(' + ox + 'px,' + oy + 'px) rotate(' + rot + 'deg)';
    c.dataset.base = 'translate(-50%,-50%) translate(' + ox + 'px,' + oy + 'px) rotate(' + rot + 'deg)';
    // entrance
    const dir = fromPlayer === this.human ? 1 : -1;
    c.animate([
      { transform: c.dataset.base + ' translateY(' + (dir * 120) + 'px) scale(.6)', opacity: 0 },
      { transform: c.dataset.base, opacity: 1 },
    ], { duration: 220, easing: 'cubic-bezier(.2,1.1,.4,1)' });
    pile.appendChild(c);
    this.pileEls.push(c);
    // keep DOM light: drop very old hidden cards
    while (this.pileEls.length > 7) { const old = this.pileEls.shift(); old.remove(); }
  };

  Match.prototype.sweepPile = function (winnerIdx) {
    const toYou = winnerIdx === this.human;
    const cards = this.pileEls.slice();
    this.pileEls = [];
    cards.forEach((c, i) => {
      const dx = (Math.random() * 60 - 30);
      const dy = toYou ? 260 : -260;
      c.animate([
        { transform: c.dataset.base, opacity: 1 },
        { transform: c.dataset.base + ' translate(' + dx + 'px,' + dy + 'px) scale(.5) rotate(' + (Math.random()*80-40) + 'deg)', opacity: 0 },
      ], { duration: 360, delay: i * 25, easing: 'cubic-bezier(.4,0,.7,.4)', fill: 'forwards' });
      setTimeout(() => c.remove(), 420 + i * 25);
    });
  };

  /* ---- Tribute tag ------------------------------------------------------- */
  Match.prototype.showTribute = function (owed, card) {
    const tag = $('#tribute');
    tag.hidden = false;
    const label = card ? ('Pay ' + owed + ' for ' + card.label) : ('Tribute: ' + owed + ' left');
    tag.textContent = label;
  };

  /* ---- HUD refresh ------------------------------------------------------- */
  Match.prototype.refreshHUD = function () {
    const eng = this.engine;
    const total = 52;
    const you = eng.players[this.human];
    $('#hud-you-slaps').textContent = you.slapsLanded;
    const yc = $('#hud-you-count'); if (yc) yc.textContent = you.hand.length;
    $('#hud-you-bar').style.width = Math.min(100, you.hand.length / total * 100) + '%';
    for (const p of eng.players) {
      if (p.index === this.human) continue;
      const o = this.oppEl(p.index);
      if (!o) continue;
      const bar = o.querySelector('.cardbar > i');
      if (bar) bar.style.width = Math.min(100, p.hand.length / total * 100) + '%';
      const cnt = o.querySelector('.ocnt .cnt');
      if (cnt) cnt.textContent = p.hand.length;
      o.classList.toggle('out', p.eliminated);
    }
    // scoreline: you vs best opponent slaps
    let bestOpp = 0;
    eng.players.forEach(p => { if (p.index !== this.human) bestOpp = Math.max(bestOpp, p.slapsLanded); });
    $('#scoreline').innerHTML = '<span class="gold-text">' + you.slapsLanded + '</span>' +
      ' <span style="color:var(--muted);font-size:14px"> slaps </span> ' +
      '<span style="color:var(--carnelian-2)">' + bestOpp + '</span>';
  };

  Match.prototype.updateControls = function () {
    const myTurn = this.engine.state.turn === this.human && !this.slapWindowOpen && !this.paused && !this.matchOver && this.engine.phase === 'playing';
    const playBtn = $('#btn-play');
    playBtn.disabled = !myTurn;
    $('#btn-play').parentElement.querySelector('.lab').textContent =
      (this.slapWindowOpen && !this.expert) ? 'SLAP NOW!' : (myTurn ? 'YOUR TURN · A' : 'WAIT…');
    $('#btn-slap').classList.toggle('ready', this.slapWindowOpen && !this.expert);
  };

  /* ---- cleanup ----------------------------------------------------------- */
  Match.prototype.clearTurnTimers = function () { this.timers.forEach(t => clearTimeout(t)); this.timers.clear(); };
  Match.prototype.clearBotSlapTimers = function () { this.botSlapTimers.forEach(t => clearTimeout(t)); this.botSlapTimers.clear(); };
  Match.prototype.clearAll = function () { this.clearTurnTimers(); this.clearBotSlapTimers(); clearTimeout(this.windowTimer); };
  Match.prototype.destroy = function () { this.matchOver = true; this.paused = true; this.clearAll(); };

  PS.highlightTurn = () => {};

})(window.PS);
