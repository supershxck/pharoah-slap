/* ============================================================================
   Pharaoh Slap — Online multiplayer (NET layer + NetMatch)
   Ported/adapted from v6.2. The SERVER (server.js) is authoritative: it runs
   the real game and broadcasts events; the client renders them with v7 visuals
   and sends only PLAY_CARD / SLAP. Lobby: create/join a room, ready, start.
   ========================================================================== */
window.PS = window.PS || {};
(function (PS) {
  'use strict';
  const { $, el } = PS;

  /* ---- server card → v7 card shape -------------------------------------- */
  const SUIT_NAME = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' };
  function conv(c) {
    if (!c) return null;
    return { rank: (c.val != null ? c.val + 2 : 2), suit: SUIT_NAME[c.suit] || 'spades', red: !!c.red, label: c.rank, glyph: c.suit };
  }

  /* ======================================================================= *
   *  NET — connection, clock sync, lobby, message routing
   * ======================================================================= */
  let ws = null, myId = null, roomId = null, isHost = false;
  let clockOffset = 0, pingTimer = null, intentional = false;
  let lobby = [];           // [{id,name,ready,isHost}]
  let pendingAction = null; // 'create' | 'join'
  let net = null;           // active NetMatch

  function defaultUrl() {
    if (location && location.host) return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    return 'wss://pharaoh-slap.onrender.com';
  }
  function serverUrl() {
    const inp = $('#net-server');
    let raw = (inp && inp.value.trim()) || defaultUrl();
    raw = raw.replace(/^http/, 'ws').replace(/\/+$/, '');
    if (location.protocol === 'https:' && raw.startsWith('ws://')) raw = 'wss://' + raw.slice(5);
    return raw;
  }
  const adjustedNow = () => Date.now() + clockOffset;
  function send(o) { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); } catch (e) {} }
  function status(msg, cls) { const e = $('#net-status'); if (e) { e.textContent = msg || ''; e.className = cls || ''; } }

  function connect(after) {
    const url = serverUrl();
    status('Connecting…', 'spin');
    if (ws) { try { ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null; ws.close(); } catch (e) {} ws = null; }
    intentional = false;
    let opened = false;
    try { ws = new WebSocket(url); }
    catch (e) { status('Bad server address: ' + url, 'error'); return; }
    const wake = setTimeout(() => { if (!opened) status('Server waking up (free tier) — up to a minute…', 'spin'); }, 6000);
    const giveUp = setTimeout(() => { if (!opened) { try { ws.close(); } catch (e) {} status('Couldn’t reach the server. Try again.', 'error'); } }, 70000);
    ws.onopen = () => {
      opened = true; clearTimeout(wake); clearTimeout(giveUp);
      status('Connected', 'ok');
      doPing(); pingTimer = setInterval(doPing, 15000);
      if (after) after();
    };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } handle(m); };
    ws.onclose = () => { clearInterval(pingTimer); if (!intentional && !(net && net.matchOver)) status('Disconnected.', 'error'); };
    ws.onerror = () => { status('Connection error.', 'error'); };
  }
  function doPing() { send({ type: 'PING', clientTs: Date.now() }); }
  function disconnect() { intentional = true; clearInterval(pingTimer); try { ws && ws.close(); } catch (e) {} ws = null; }

  /* ---- message handler --------------------------------------------------- */
  function handle(m) {
    switch (m.type) {
      case 'PONG': clockOffset = m.serverTs - Date.now(); break;
      case 'HEARTBEAT': send({ type: 'HEARTBEAT_ACK', seq: m.seq }); break;

      case 'ROOM_CREATED':
        myId = m.playerId; roomId = m.roomId; isHost = true;
        lobby = m.players || []; renderLobby(); break;
      case 'JOIN_OK':
        myId = m.playerId; roomId = m.roomId; isHost = (m.hostId === m.playerId);
        lobby = m.players || []; renderLobby(); break;
      case 'PLAYER_JOINED':
      case 'LOBBY_UPDATE':
      case 'SETTINGS_UPDATED':
        if (m.players) lobby = m.players; renderLobby(); break;
      case 'PLAYER_DISCONNECTED':
      case 'PLAYER_RECONNECTED':
        status(m.type === 'PLAYER_DISCONNECTED' ? 'A player dropped.' : 'A player returned.', ''); break;
      case 'YOU_ARE_HOST': isHost = true; renderLobby(); break;

      case 'COUNTDOWN': showCountdown(m.n); break;
      case 'GAME_START':
        hideCountdown();
        net = new NetMatch(m.players || [], m.turnIdx || 0, myId);
        PS.activeController = net;
        break;

      case 'CARD_PLAYED': if (net) net.onCardPlayed(m.card, m.turnIdx, m.playerId); break;
      case 'TURN_CHANGE': if (net) net.onTurn(m.turnIdx); break;
      case 'SLAP_VALID':  if (net) net.onSlapValid(m.winnerId, m.rule); break;
      case 'FALSE_SLAP':  if (net) net.onFalseSlap(m.playerId, m.penaltyCard); break;
      case 'PILE_AWARDED': if (net) net.onPileAwarded(m); break;
      case 'JUDGMENT': PS.toast('THE JUDGMENT — all rules now live!'); break;
      case 'GAME_OVER': if (net) net.onGameOver(m); break;

      case 'ERROR': status(m.message || 'Server error.', 'error'); break;
    }
  }

  /* ---- lobby actions ----------------------------------------------------- */
  function myName() {
    const u = PS.AUTH && PS.AUTH.getUser();
    return (u && u.username) || (PS.PROFILE && PS.PROFILE.name) || 'Pharaoh';
  }
  function createRoom() {
    pendingAction = 'create';
    connect(() => send({ type: 'CREATE_ROOM', playerName: myName(), settings: { rules: { double: true, sandwich: true, marriage: false, divorce: false }, mode: 'none', numDecks: 1 } }));
  }
  function joinRoom() {
    const code = ($('#net-code').value || '').toUpperCase().trim();
    if (!code) { status('Enter a room code.', 'error'); return; }
    pendingAction = 'join';
    connect(() => send({ type: 'JOIN_ROOM', roomId: code, playerName: myName() }));
  }
  function toggleReady() { send({ type: 'READY', ready: true }); }
  function startGame() { send({ type: 'START_GAME' }); }
  function leave() { disconnect(); roomId = null; myId = null; isHost = false; lobby = []; PS.showScreen('home'); }

  /* ---- lobby render ------------------------------------------------------ */
  function openLobby() {
    if (!PS.AUTH || !PS.AUTH.getUser()) { /* guests may still play online under their profile name */ }
    roomId = null; lobby = []; isHost = false;
    PS.showScreen('online');
    $('#lobby-room').style.display = 'none';
    $('#lobby-entry').style.display = 'flex';
    status('', '');
  }
  function renderLobby() {
    $('#lobby-entry').style.display = 'none';
    const box = $('#lobby-room'); box.style.display = 'flex';
    $('#lobby-code').textContent = roomId || '----';
    const list = $('#lobby-players'); list.innerHTML = '';
    lobby.forEach((p) => {
      const row = el('div', 'lobby-row');
      row.innerHTML = '<span class="lp-name">' + p.name + (p.id === myId ? ' (you)' : '') + '</span>' +
        '<span class="lp-tag">' + (p.isHost ? 'Host' : (p.ready ? 'Ready' : 'Waiting')) + '</span>';
      list.appendChild(row);
    });
    const startBtn = $('#lobby-start'), readyBtn = $('#lobby-ready');
    startBtn.style.display = isHost ? 'block' : 'none';
    readyBtn.style.display = isHost ? 'none' : 'block';
    const allReady = lobby.length >= 2 && lobby.every((p) => p.isHost || p.ready);
    startBtn.disabled = !allReady;
  }

  /* ---- countdown overlay ------------------------------------------------- */
  function showCountdown(n) {
    const c = $('#countdown'); c.classList.add('show');
    c.textContent = n > 0 ? String(n) : 'GO!';
    if (n <= 0) setTimeout(hideCountdown, 600);
  }
  function hideCountdown() { const c = $('#countdown'); if (c) c.classList.remove('show'); }

  /* ======================================================================= *
   *  NetMatch — renders authoritative server play on the v7 table
   * ======================================================================= */
  function NetMatch(serverPlayers, turnIdx, meId) {
    this.players = serverPlayers.map((p, i) => ({ index: i, id: p.id, name: p.name, count: p.cardCount, isHuman: p.id === meId }));
    this.human = Math.max(0, this.players.findIndex((p) => p.isHuman));
    this.turn = turnIdx;
    this.pileEls = [];
    this.slapTarget = 0;
    this.matchOver = false;
    this.slapWindowOpen = false;
    const glyphs = PS.GLYPHS || ['\u{13000}'];
    this.players.forEach((p, i) => { p.avatar = i === this.human ? PS.PROFILE.glyph : glyphs[i % glyphs.length]; });
    this.renderShell();
    PS.showScreen('table');
  }
  NetMatch.prototype.seatById = function (id) { return this.players.find((p) => p.id === id); };
  NetMatch.prototype.oppEl = function (i) { return document.querySelector('.opp[data-idx="' + i + '"]'); };

  NetMatch.prototype.renderShell = function () {
    const you = this.players[this.human];
    $('#hud-you').innerHTML =
      '<div class="avatar sm">' + you.avatar + '</div>' +
      '<div class="meta"><div class="pn">' + you.name + '</div>' +
      '<div class="pc"><span id="hud-you-slaps">0</span> slaps · <span id="hud-you-count">0</span> cards</div>' +
      '<div class="cardbar"><i id="hud-you-bar"></i></div></div>';
    $('#hud-info').innerHTML = '<div class="meta"><div class="pn engrave">Online</div><div class="pc">Room ' + (roomId || '') + '</div></div>';
    const belt = $('#opp-belt'); belt.innerHTML = '';
    this.players.forEach((p, i) => {
      if (i === this.human) return;
      const o = el('div', 'opp'); o.dataset.idx = i;
      o.innerHTML = '<div class="avatar">' + p.avatar + '</div><div class="on">' + p.name + '</div>' +
        '<div class="ocnt"><span class="cnt">0</span> cards</div>' +
        '<div class="cardbar" style="width:54px"><i></i></div>';
      belt.appendChild(o);
    });
    const mh = $('#myhand'); mh.innerHTML = '';
    for (let i = 0; i < 4; i++) mh.appendChild(PS.makeBack(PS.tweaks.deckSkin, 26));
    const pile = $('#pile');
    Array.from(pile.querySelectorAll('.card')).forEach(c => c.remove());
    pile.classList.remove('slappable');
    $('#tribute').hidden = true;
    this.slaps = 0;
    this.charge = 0;
    const tbl = document.getElementById('screen-table');
    if (tbl) tbl.classList.toggle('expert', !!PS.tweaks.expertUI);
    if (PS.VFX) { PS.VFX.reset(); PS.VFX.setMode('table'); }
    this.refreshHUD();
    this.highlightTurn(this.turn);
    this.updateControls();
  };

  NetMatch.prototype.highlightTurn = function (idx) {
    PS.$$('.opp').forEach(o => o.classList.toggle('turn', +o.dataset.idx === idx));
    $('#hud-you').classList.toggle('turn', idx === this.human);
  };
  NetMatch.prototype.onTurn = function (idx) { this.turn = idx; this.highlightTurn(idx); this.updateControls(); };

  NetMatch.prototype.humanPlay = function () {
    if (this.matchOver) return;
    if (this.turn !== this.human) return;
    if (this.charge >= 1) {           // charged play (visual only — server arbitrates)
      if (PS.VFX) PS.VFX.special(PS.equippedPlay || 'basic');
      this.charge = 0; this.renderCharge();
    }
    send({ type: 'PLAY_CARD', ts: adjustedNow() });
  };
  NetMatch.prototype.bumpCharge = function (x) {
    if (this.charge >= 1) return;
    this.charge = Math.min(1, (this.charge || 0) + x);
    this.renderCharge();
  };
  NetMatch.prototype.renderCharge = function () {
    const fill = $('#drama-fill'), box = $('#drama');
    if (!fill || !box) return;
    fill.style.width = Math.round((this.charge || 0) * 100) + '%';
    box.classList.toggle('ready', this.charge >= 1);
  };
  NetMatch.prototype.humanSlap = function () {
    if (this.matchOver) return;
    send({ type: 'SLAP', ts: adjustedNow() });
  };

  NetMatch.prototype.onCardPlayed = function (card, turnIdx, fromId) {
    const mine = fromId === myId;
    if (card) this.addPileCard(conv(card), fromId);
    if (PS.VFX) PS.VFX.cardPlayed(mine);
    if (mine) this.bumpCharge(1 / 6);
    if (turnIdx != null) { this.turn = turnIdx; this.highlightTurn(turnIdx); }
    // crude slap-window cue: a fresh card can become slappable
    this.slapWindowOpen = true;
    if (!PS.tweaks.expertUI) $('#pile').classList.add('slappable');
    clearTimeout(this._slapT);
    this._slapT = setTimeout(() => { this.slapWindowOpen = false; $('#pile').classList.remove('slappable'); this.updateControls(); }, 1400);
    this.updateControls();
  };

  NetMatch.prototype.onSlapValid = function (winnerId, rule) {
    this.slapWindowOpen = false; $('#pile').classList.remove('slappable');
    const w = this.seatById(winnerId);
    if (PS.VFX) PS.VFX.pileWon(!!(w && w.isHuman));
    if (w && w.isHuman) { this.slaps++; this.bumpCharge(1 / 3); this.flashSlap('win', rule); }
    else if (w) PS.toast(w.name + ' slapped — ' + (rule || 'pile') + '!');
    this.refreshHUD();
  };
  NetMatch.prototype.onFalseSlap = function (playerId, penaltyCard) {
    const p = this.seatById(playerId);
    if (p && p.isHuman) this.flashSlap('block');
    else if (p) PS.toast(p.name + ' false-slapped!');
    if (penaltyCard) this.addPileCard(conv(penaltyCard), playerId, true);
  };
  NetMatch.prototype.onPileAwarded = function (m) {
    this.slapWindowOpen = false; $('#pile').classList.remove('slappable');
    const w = this.seatById(m.winnerId);
    this.sweepPile(w ? w.index : -1);
    if (m.playerCounts) m.playerCounts.forEach(pc => { const s = this.seatById(pc.id); if (s) s.count = pc.cardCount; });
    if (m.turnIdx != null) { this.turn = m.turnIdx; this.highlightTurn(m.turnIdx); }
    this.refreshHUD();
    this.updateControls();
  };
  NetMatch.prototype.onGameOver = function (m) {
    if (this._ended) return;
    this._ended = true;
    this.matchOver = true;
    if (PS.VFX) PS.VFX.setMode(null);
    const won = m.winnerId === myId;
    if (PS.COSMO) PS.COSMO.recordMatch({ won, slaps: this.slaps || 0, cards: 0, falseSlaps: 0, duration: 0 });
    if (m.playerCounts) m.playerCounts.forEach(pc => { const s = this.seatById(pc.id); if (s) s.count = pc.cardCount; });
    const winner = this.seatById(m.winnerId) || { name: m.winnerName || 'Nobody', avatar: '☠' };
    PS.showVictory({
      winner: { name: winner.name, avatar: winner.avatar }, youWon: won,
      slaps: this.slaps, cards: 0,
    });
    setTimeout(disconnect, 1500);
  };

  /* ---- shared visual helpers (mirrors local Match) ----------------------- */
  NetMatch.prototype.addPileCard = function (card, fromId, toBottom) {
    const pile = $('#pile');
    const c = PS.makeCard(card, 120);
    const rot = (Math.random() * 16 - 8), ox = (Math.random() * 22 - 11), oy = (Math.random() * 16 - 8);
    const base = 'translate(-50%,-50%) translate(' + ox + 'px,' + oy + 'px) rotate(' + rot + 'deg)';
    c.style.transform = base; c.dataset.base = base;
    const seat = this.seatById(fromId);
    const dir = seat && seat.isHuman ? 1 : -1;
    c.animate([{ transform: base + ' translateY(' + (dir * 120) + 'px) scale(.6)', opacity: 0 }, { transform: base, opacity: 1 }],
      { duration: 220, easing: 'cubic-bezier(.2,1.1,.4,1)' });
    pile.appendChild(c);
    if (toBottom) this.pileEls.unshift(c); else this.pileEls.push(c);
    while (this.pileEls.length > 7) { const old = this.pileEls.shift(); old.remove(); }
  };
  NetMatch.prototype.sweepPile = function (winnerIdx) {
    const toYou = winnerIdx === this.human;
    const cards = this.pileEls.slice(); this.pileEls = [];
    cards.forEach((c, i) => {
      const dx = (Math.random() * 60 - 30), dy = toYou ? 260 : -260;
      c.animate([{ transform: c.dataset.base, opacity: 1 },
        { transform: c.dataset.base + ' translate(' + dx + 'px,' + dy + 'px) scale(.5) rotate(' + (Math.random() * 80 - 40) + 'deg)', opacity: 0 }],
        { duration: 360, delay: i * 25, easing: 'cubic-bezier(.4,0,.7,.4)', fill: 'forwards' });
      setTimeout(() => c.remove(), 420 + i * 25);
    });
  };
  NetMatch.prototype.flashSlap = function (kind, rule) {
    const scr = $('#screen-slap');
    const hand = $('#slap-hand'), title = $('#slap-title'), sub = $('#slap-sub'), prize = $('#slap-prize');
    if (kind === 'win') {
      hand.textContent = '\u{1F590}'; title.textContent = 'YOU SLAPPED FIRST!'; title.className = 'slap-title win';
      sub.textContent = (rule ? rule.replace(/_/g, ' ') : 'Clean slap') + '!';
      prize.hidden = false; prize.className = 'slap-prize frame'; prize.innerHTML = '<span class="gold-text">PILE WON</span>';
      if (PS.playSlapFx) PS.playSlapFx(scr);
    } else {
      hand.textContent = '✋'; title.textContent = 'BLOCKED!'; title.className = 'slap-title block';
      sub.textContent = 'Not a slap — you burned a card'; prize.hidden = false; prize.className = 'slap-prize frame';
      prize.innerHTML = '<span style="color:var(--carnelian-2)">PENALTY · −1 card</span>';
    }
    PS.showScreen('slap');
    setTimeout(() => { if (!this.matchOver) PS.showScreen('table'); }, kind === 'win' ? 1100 : 900);
  };
  NetMatch.prototype.refreshHUD = function () {
    const total = 52;
    const you = this.players[this.human];
    const slapsEl = $('#hud-you-slaps'); if (slapsEl) slapsEl.textContent = this.slaps || 0;
    const yc = $('#hud-you-count'); if (yc) yc.textContent = you.count || 0;
    const bar = $('#hud-you-bar'); if (bar) bar.style.width = Math.min(100, (you.count || 0) / total * 100) + '%';
    this.players.forEach((p) => {
      if (p.index === this.human) return;
      const o = this.oppEl(p.index); if (!o) return;
      const b = o.querySelector('.cardbar > i'); if (b) b.style.width = Math.min(100, (p.count || 0) / total * 100) + '%';
      const cnt = o.querySelector('.ocnt .cnt'); if (cnt) cnt.textContent = p.count || 0;
      o.classList.toggle('out', (p.count || 0) === 0);
    });
    const sl = $('#scoreline');
    if (sl) sl.innerHTML = '<span class="gold-text">' + (this.slaps || 0) + '</span> <span style="color:var(--muted);font-size:14px"> slaps </span>';
  };
  NetMatch.prototype.updateControls = function () {
    const myTurn = this.turn === this.human && !this.matchOver;
    const playBtn = $('#btn-play'); if (playBtn) playBtn.disabled = !myTurn;
    const lab = $('#btn-play').parentElement.querySelector('.lab');
    if (lab) lab.textContent = this.slapWindowOpen ? 'SLAP NOW!' : (myTurn ? 'YOUR TURN · A' : 'WAIT…');
    $('#btn-slap').classList.toggle('ready', this.slapWindowOpen);
  };

  PS.NET = { openLobby, createRoom, joinRoom, startGame, toggleReady, leave, isActive: () => !!(net && !net.matchOver) };
})(window.PS);
