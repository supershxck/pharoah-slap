/**
 * Pharaoh Slap — Authoritative WebSocket Server
 * Node.js + ws — deploy on Render free tier
 *
 * Protocol (all messages are JSON):
 *
 * Handshake:
 *   C→S  { type: "PING", clientTs }
 *   S→C  { type: "PONG", clientTs, serverTs }
 *
 * Lobby:
 *   C→S  { type: "CREATE_ROOM", playerName, settings }
 *   S→C  { type: "ROOM_CREATED", roomId, playerId }
 *
 *   C→S  { type: "JOIN_ROOM", roomId, playerName }
 *   S→C  { type: "JOIN_OK", roomId, playerId, players }   ← to joiner
 *   S→C  { type: "PLAYER_JOINED", players }               ← broadcast
 *
 *   C→S  { type: "START_GAME" }    ← host only
 *   S→C  { type: "GAME_START", players, turnIdx, pile: [] }
 *
 * Gameplay:
 *   C→S  { type: "PLAY_CARD", ts }
 *   S→C  { type: "CARD_PLAYED", playerId, card, turnIdx, seq }
 *
 *   C→S  { type: "SLAP", ts }
 *   S→C  { type: "SLAP_VALID", winnerId, rule, tiebroken }  ← on valid slap
 *   S→C  { type: "FALSE_SLAP", playerId, penaltyCard }       ← on false slap
 *   S→C  { type: "PILE_AWARDED", winnerId, cards, reason }
 *
 *   S→C  { type: "GAME_OVER", winnerId, stats }
 *
 * Connection:
 *   S→C  { type: "HEARTBEAT", seq }  every 5s
 *   C→S  { type: "HEARTBEAT_ACK", seq }
 *   S→C  { type: "STATE_SYNC", state }  on reconnect
 *   S→C  { type: "ERROR", code, message }
 */

"use strict";

const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
// Slap arbitration window: slaps within this many ms of each other are "simultaneous"
// → server picks the lower adjusted timestamp (earlier reaction wins)
const SLAP_GRACE_MS = 30;
// Max players per room
const MAX_PLAYERS = 4;
// Heartbeat interval
const HEARTBEAT_MS = 5000;
// Room code charset (no 0/O/I/1 to avoid confusion)
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// ─── CARD DATA ────────────────────────────────────────────────────────────────
const SUITS = [
  { s: "♠", red: false },
  { s: "♣", red: false },
  { s: "♥", red: true },
  { s: "♦", red: true },
];
const RANKS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];
const CHALLENGE = { J: 1, Q: 2, K: 3, A: 4 };
function rankVal(r) {
  return { J: 11, Q: 12, K: 13, A: 14 }[r] || parseInt(r) || 0;
}

function freshDeck(numDecks = 1) {
  const d = [];
  for (let k = 0; k < numDecks; k++)
    for (const su of SUITS)
      for (let i = 0; i < RANKS.length; i++)
        d.push({ rank: RANKS[i], val: i, suit: su.s, red: su.red });
  // Fisher-Yates
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// ─── SLAP RULES ───────────────────────────────────────────────────────────────
function matchedRule(pile, rules, mode) {
  const n = pile.length;
  if (!n) return false;
  const top = pile[n - 1];
  const two = n >= 2 ? pile[n - 2] : null;
  const three = n >= 3 ? pile[n - 3] : null;
  const isKQ = (a, b) =>
    a &&
    b &&
    ((a.rank === "K" && b.rank === "Q") || (a.rank === "Q" && b.rank === "K"));
  if (mode === "alchemical") {
    if (three) {
      const v1 = rankVal(three.rank),
        v2 = rankVal(two.rank),
        v3 = rankVal(top.rank);
      if ((v3 === v2 + 1 && v2 === v1 + 1) || (v3 === v2 - 1 && v2 === v1 - 1))
        return "SEQUENCE";
    }
    if (three && top.suit === three.suit && top.suit !== two.suit)
      return "SUIT MIRROR";
  }
  if (rules.double && two && top.rank === two.rank) return "DOUBLE";
  if (rules.marriage && isKQ(top, two)) return "MARRIAGE";
  if (rules.sandwich && three && top.rank === three.rank) return "SANDWICH";
  if (rules.divorce && isKQ(top, three)) return "DIVORCE";
  return false;
}

// ─── ROOM STORE ───────────────────────────────────────────────────────────────
const rooms = new Map(); // roomId → Room

function makeRoomCode() {
  let code,
    attempts = 0;
  do {
    code = Array.from(
      { length: 4 },
      () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
    ).join("");
    attempts++;
  } while (rooms.has(code) && attempts < 1000);
  return code;
}

class Room {
  constructor(id, hostPlayerId, settings) {
    this.id = id;
    this.hostPlayerId = hostPlayerId;
    this.settings = {
      rules: { double: true, sandwich: true, marriage: true, divorce: true },
      mode: "none",
      prizeRank: "A",
      numDecks: 1,
      ...settings,
    };
    // players: { id, name, deck, ws, clockOffset, connected }
    this.players = [];
    this.phase = "lobby"; // "lobby" | "playing" | "over"
    this.seq = 0;

    // game state
    this.pile = [];
    this.turnIdx = 0;
    this.challengeOwed = 0;
    this.challengerIdx = null;
    this.prizeCollected = [];

    // pending slaps within SLAP_GRACE_MS
    this.pendingSlaps = [];
    this.slapWindow = null;

    this.heartbeatInterval = null;
    this.countdownTimer = null;
    this.cardsSinceLastAward = 0;
    this.judgmentActive = false;
  }

  addPlayer(id, name, ws) {
    this.players.push({
      id,
      name,
      deck: [],
      ws,
      clockOffset: 0,
      connected: true,
      ready: false,
    });
    this.prizeCollected.push([]);
  }

  // Lobby roster sent to clients (id, name, ready, host flag).
  lobbyPlayers() {
    return this.players.map((p) => ({
      id: p.id,
      name: p.name,
      ready: !!p.ready,
      isHost: p.id === this.hostPlayerId,
    }));
  }

  // Everyone except the host must be ready; the host is implicitly ready.
  allReady() {
    if (this.players.length < 2) return false;
    return this.players.every((p) => p.id === this.hostPlayerId || p.ready);
  }

  getPlayer(id) {
    return this.players.find((p) => p.id === id);
  }
  getPlayerIdx(id) {
    return this.players.findIndex((p) => p.id === id);
  }

  broadcast(msg, excludeId = null) {
    const raw = JSON.stringify(msg);
    for (const p of this.players) {
      if (p.id === excludeId) continue;
      if (p.ws && p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(raw);
      }
    }
  }

  send(playerId, msg) {
    const p = this.getPlayer(playerId);
    if (p && p.ws && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify(msg));
    }
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.seq++;
      this.broadcast({ type: "HEARTBEAT", seq: this.seq });
    }, HEARTBEAT_MS);
  }

  stopHeartbeat() {
    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
  }

  // ── COUNTDOWN ──────────────────────────────────────────────────────────────
  beginCountdown() {
    if (this.phase !== "lobby") return;
    this.phase = "countdown";
    let n = 3;
    this.broadcast({ type: "COUNTDOWN", n });
    const tick = () => {
      n--;
      if (n > 0) {
        this.broadcast({ type: "COUNTDOWN", n });
        this.countdownTimer = setTimeout(tick, 1000);
      } else {
        this.broadcast({ type: "COUNTDOWN", n: 0 }); // "GO"
        this.countdownTimer = setTimeout(() => {
          if (this.phase === "countdown") this.startGame();
        }, 700);
      }
    };
    this.countdownTimer = setTimeout(tick, 1000);
  }

  // ── GAME START ─────────────────────────────────────────────────────────────
  startGame() {
    const deck = freshDeck(this.settings.numDecks);
    const n = this.players.length;
    const perPlayer = Math.floor(deck.length / n);
    this.players.forEach((p, i) => {
      p.deck = deck.slice(i * perPlayer, (i + 1) * perPlayer);
    });
    // remaining cards go to last player
    const rem = deck.slice(n * perPlayer);
    rem.forEach((c) => this.players[n - 1].deck.push(c));

    this.pile = [];
    this.turnIdx = 0;
    this.challengeOwed = 0;
    this.challengerIdx = null;
    this.cardsSinceLastAward = 0;
    this.judgmentActive = false;
    this.prizeCollected = this.players.map(() => []);
    this.phase = "playing";

    this.broadcast({
      type: "GAME_START",
      players: this.players.map((p, i) => ({
        id: p.id,
        name: p.name,
        cardCount: p.deck.length,
      })),
      turnIdx: this.turnIdx,
    });

    this.startHeartbeat();
  }

  // ── PLAY CARD ──────────────────────────────────────────────────────────────
  playCard(playerId) {
    const pIdx = this.getPlayerIdx(playerId);
    if (pIdx < 0 || this.phase !== "playing") return;
    if (this.turnIdx !== pIdx) {
      return this.send(playerId, {
        type: "ERROR",
        code: "NOT_YOUR_TURN",
        message: "Not your turn.",
      });
    }
    const p = this.players[pIdx];
    if (!p.deck.length) {
      return this.send(playerId, {
        type: "ERROR",
        code: "NO_CARDS",
        message: "No cards to play.",
      });
    }

    const card = p.deck.shift();
    this.pile.push(card);
    this.seq++;
    this.cardsSinceLastAward++;

    // PRIZE MODE
    if (
      this.settings.mode === "prize" &&
      card.rank === this.settings.prizeRank
    ) {
      const idx = this.pile.lastIndexOf(card);
      if (idx >= 0) this.pile.splice(idx, 1);
      this.prizeCollected[pIdx].push(card);
      this.broadcast({
        type: "CARD_PLAYED",
        playerId,
        card,
        turnIdx: this.turnIdx,
        prizeCaptured: { playerId, rank: card.rank },
        seq: this.seq,
      });
      if (this.checkPrizeWin()) return;
      this.advanceTurn();
      this.broadcast({
        type: "TURN_CHANGE",
        turnIdx: this.turnIdx,
        seq: this.seq,
      });
      return;
    }

    // CHALLENGE system
    if (this.challengeOwed > 0) {
      if (CHALLENGE[card.rank]) {
        this.challengerIdx = pIdx;
        this.challengeOwed = CHALLENGE[card.rank];
        this.advanceTurn();
      } else {
        this.challengeOwed--;
        if (this.challengeOwed === 0) {
          const cIdx = this.challengerIdx;
          this.broadcast({
            type: "CARD_PLAYED",
            playerId,
            card,
            turnIdx: this.turnIdx,
            seq: this.seq,
          });
          this.awardPile(cIdx, "CHALLENGE WON");
          return;
        }
        // responder keeps going — same turn index
      }
    } else if (CHALLENGE[card.rank]) {
      this.challengerIdx = pIdx;
      this.challengeOwed = CHALLENGE[card.rank];
      this.advanceTurn();
    } else {
      this.advanceTurn();
    }

    // stalemate check
    this.checkStalemate();
    if (this.phase === "over") return;

    this.broadcast({
      type: "CARD_PLAYED",
      playerId,
      card,
      turnIdx: this.turnIdx,
      seq: this.seq,
    });

    // check if next player has no cards — skip
    this.handleEmptyTurn();
  }

  advanceTurn() {
    const n = this.players.length;
    let next = (this.turnIdx + 1) % n;
    let tries = 0;
    // skip players with no cards (they can still slap back in)
    while (this.players[next].deck.length === 0 && tries < n) {
      next = (next + 1) % n;
      tries++;
    }
    this.turnIdx = next;
  }

  handleEmptyTurn() {
    // if everyone is out of cards somehow, end
    if (
      this.players.every((p) => p.deck.length === 0 && this.pile.length === 0)
    ) {
      this.endGame(null, "Stalemate", "No cards remain.");
    }
  }

  // ── SLAP ARBITRATION ──────────────────────────────────────────────────────
  // Players send { type: "SLAP", ts } where ts is clientTs + clockOffset
  // We collect all slaps within SLAP_GRACE_MS then pick the lowest adjusted ts.

  receiveSlap(playerId, clientAdjustedTs) {
    if (this.phase !== "playing") return;

    const pIdx = this.getPlayerIdx(playerId);
    if (pIdx < 0) return;

    this.pendingSlaps.push({
      playerId,
      pIdx,
      ts: clientAdjustedTs,
      received: Date.now(),
    });

    if (!this.slapWindow) {
      this.slapWindow = setTimeout(() => this.adjudicateSlap(), SLAP_GRACE_MS);
    }
  }

  adjudicateSlap() {
    this.slapWindow = null;
    const slaps = this.pendingSlaps.slice();
    this.pendingSlaps = [];

    if (!slaps.length) return;

    const rule = matchedRule(
      this.pile,
      this.settings.rules,
      this.settings.mode,
    );

    if (rule) {
      // Valid slap — winner is lowest adjusted timestamp (fastest finger)
      slaps.sort((a, b) => a.ts - b.ts);
      const winner = slaps[0];
      this.broadcast({
        type: "SLAP_VALID",
        winnerId: winner.playerId,
        rule,
        tiebroken:
          slaps.length > 1 && slaps[1].ts - slaps[0].ts < SLAP_GRACE_MS,
      });
      this.awardPile(winner.pIdx, rule + " SLAP");
    } else {
      // False slap — penalise all who slapped (same window)
      for (const slap of slaps) {
        const p = this.players[slap.pIdx];
        if (p.deck.length > 0) {
          const penaltyCard = p.deck.shift();
          this.pile.unshift(penaltyCard);
          this.broadcast({
            type: "FALSE_SLAP",
            playerId: slap.playerId,
            penaltyCard,
          });
        }
      }
      // re-broadcast updated state
      this.seq++;
      this.broadcast({
        type: "CARD_PLAYED", // repurpose to resync pile top
        playerId: null,
        card: this.pile[this.pile.length - 1],
        turnIdx: this.turnIdx,
        seq: this.seq,
      });
    }
  }

  // ── AWARD PILE ─────────────────────────────────────────────────────────────
  awardPile(pIdx, reason) {
    if (this.phase !== "playing") return;
    const cards = this.pile.slice();
    const winner = this.players[pIdx];
    while (this.pile.length) winner.deck.push(this.pile.shift());
    this.challengeOwed = 0;
    this.challengerIdx = null;
    this.cardsSinceLastAward = 0;
    this.turnIdx = pIdx; // winner plays next
    this.seq++;

    this.broadcast({
      type: "PILE_AWARDED",
      winnerId: winner.id,
      cardCount: cards.length,
      cards, // send full card list so clients can animate flanks
      reason,
      turnIdx: this.turnIdx,
      playerCounts: this.players.map((p) => ({
        id: p.id,
        cardCount: p.deck.length,
      })),
      seq: this.seq,
    });

    this.checkCardWin();
  }

  // ── WIN CONDITIONS ─────────────────────────────────────────────────────────
  checkCardWin() {
    const total = this.settings.numDecks * 52;
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i].deck.length === total) {
        this.endGame(i);
        return;
      }
    }
  }

  checkPrizeWin() {
    const rank = this.settings.prizeRank;
    const needed = 4 * this.settings.numDecks;
    for (let i = 0; i < this.players.length; i++) {
      if (
        (this.prizeCollected[i] || []).filter((c) => c.rank === rank).length >=
        needed
      ) {
        this.endGame(
          i,
          `${this.players[i].name} WINS`,
          `Claimed all ${needed} ${rank}s`,
        );
        return true;
      }
    }
    return false;
  }

  checkStalemate() {
    if (this.cardsSinceLastAward >= 200 && !this.judgmentActive) {
      this.judgmentActive = true;
      this.broadcast({ type: "JUDGMENT" }); // clients show banner + activate all rules
    }
    if (this.cardsSinceLastAward >= 300) {
      let maxCards = 0,
        winnerIdx = 0;
      this.players.forEach((p, i) => {
        if (p.deck.length > maxCards) {
          maxCards = p.deck.length;
          winnerIdx = i;
        }
      });
      this.endGame(
        winnerIdx,
        "Pharaoh's Decree",
        `${this.players[winnerIdx].name} held the most cards.`,
      );
    }
  }

  endGame(winnerIdx, title, subtitle) {
    if (this.phase === "over") return;
    this.phase = "over";
    clearTimeout(this.countdownTimer);
    this.stopHeartbeat();
    const winner = winnerIdx != null ? this.players[winnerIdx] : null;
    this.broadcast({
      type: "GAME_OVER",
      winnerId: winner ? winner.id : null,
      winnerName: winner ? winner.name : null,
      title: title || (winner ? winner.name + " WINS!" : "GAME OVER"),
      subtitle: subtitle || "",
      playerCounts: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        cardCount: p.deck.length,
      })),
    });
    // clean up room after 60s
    setTimeout(() => rooms.delete(this.id), 60_000);
  }
}

// ─── HTTP SERVER (health check for Render) ───────────────────────────────────
const HTML_FILE = path.join(__dirname, "pharaoh-slap-v6.html");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

const server = http.createServer((req, res) => {
  // Preflight / cross-origin support so the optional /health warm-up never blocks.
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain", ...CORS });
    res.end("OK");
    return;
  }
  // Serve the game for all other routes
  fs.readFile(HTML_FILE, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain", ...CORS });
      res.end("pharaoh-slap-v6.html not found next to server.js");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...CORS });
    res.end(data);
  });
});

// ─── WEBSOCKET SERVER ────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
  let playerId = null;
  let roomId = null;
  console.log(
    `WS connection from ${req && req.socket ? req.socket.remoteAddress : "?"}`,
  );

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      // ── Clock sync ──────────────────────────────────────────────────────
      case "PING": {
        ws.send(
          JSON.stringify({
            type: "PONG",
            clientTs: msg.clientTs,
            serverTs: Date.now(),
          }),
        );
        // Store offset on the player if they're in a room
        if (playerId && roomId) {
          const room = rooms.get(roomId);
          const p = room && room.getPlayer(playerId);
          if (p) {
            // offset = serverTs - clientTs  (approximate; single-trip estimate)
            p.clockOffset = Date.now() - msg.clientTs;
          }
        }
        break;
      }

      // ── Create room ────────────────────────────────────────────────────
      case "CREATE_ROOM": {
        const code = makeRoomCode();
        playerId = makePlayerId();
        roomId = code;
        const room = new Room(code, playerId, msg.settings || {});
        room.addPlayer(playerId, sanitizeName(msg.playerName), ws);
        rooms.set(code, room);
        ws.send(
          JSON.stringify({
            type: "ROOM_CREATED",
            roomId: code,
            playerId,
            players: room.lobbyPlayers(),
            settings: room.settings,
          }),
        );
        console.log(`Room ${code} created by ${msg.playerName}`);
        break;
      }

      // ── Join room ──────────────────────────────────────────────────────
      case "JOIN_ROOM": {
        const code = (msg.roomId || "").toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) {
          ws.send(
            JSON.stringify({
              type: "ERROR",
              code: "ROOM_NOT_FOUND",
              message: `Room ${code} not found.`,
            }),
          );
          return;
        }
        if (room.phase !== "lobby") {
          ws.send(
            JSON.stringify({
              type: "ERROR",
              code: "GAME_IN_PROGRESS",
              message: "Game already started.",
            }),
          );
          return;
        }
        if (room.players.length >= MAX_PLAYERS) {
          ws.send(
            JSON.stringify({
              type: "ERROR",
              code: "ROOM_FULL",
              message: "Room is full.",
            }),
          );
          return;
        }
        playerId = makePlayerId();
        roomId = code;
        room.addPlayer(playerId, sanitizeName(msg.playerName), ws);

        ws.send(
          JSON.stringify({
            type: "JOIN_OK",
            roomId: code,
            playerId,
            hostId: room.hostPlayerId,
            players: room.lobbyPlayers(),
            settings: room.settings,
          }),
        );

        room.broadcast(
          {
            type: "PLAYER_JOINED",
            players: room.lobbyPlayers(),
          },
          playerId,
        );

        console.log(
          `${msg.playerName} joined room ${code} (${room.players.length}/${MAX_PLAYERS})`,
        );
        break;
      }

      // ── Start game ─────────────────────────────────────────────────────
      case "START_GAME": {
        const room = rooms.get(roomId);
        if (!room || room.phase !== "lobby") return;
        if (playerId !== room.hostPlayerId) {
          ws.send(
            JSON.stringify({
              type: "ERROR",
              code: "NOT_HOST",
              message: "Only the host can start.",
            }),
          );
          return;
        }
        if (room.players.length < 2) {
          ws.send(
            JSON.stringify({
              type: "ERROR",
              code: "NOT_ENOUGH_PLAYERS",
              message: "Need at least 2 players.",
            }),
          );
          return;
        }
        if (!room.allReady()) {
          ws.send(
            JSON.stringify({
              type: "ERROR",
              code: "NOT_ALL_READY",
              message: "All players must be ready.",
            }),
          );
          return;
        }
        room.beginCountdown();
        console.log(
          `Countdown started in room ${roomId} (${room.players.length} players)`,
        );
        break;
      }

      // ── Play card ──────────────────────────────────────────────────────
      case "PLAY_CARD": {
        const room = rooms.get(roomId);
        if (room) room.playCard(playerId);
        break;
      }

      // ── Slap ───────────────────────────────────────────────────────────
      case "SLAP": {
        const room = rooms.get(roomId);
        if (room) {
          // msg.ts is clientTs adjusted with clockOffset (client-side)
          // We trust it directionally — winner adjudicated by smallest ts
          room.receiveSlap(playerId, msg.ts || Date.now());
        }
        break;
      }

      // ── Settings update (host only, lobby only) ────────────────────────
      case "UPDATE_SETTINGS": {
        const room = rooms.get(roomId);
        if (!room || room.phase !== "lobby" || playerId !== room.hostPlayerId)
          return;
        Object.assign(room.settings, msg.settings || {});
        // Rules changed — clear everyone's ready so they re-confirm.
        room.players.forEach((p) => {
          if (p.id !== room.hostPlayerId) p.ready = false;
        });
        room.broadcast({ type: "SETTINGS_UPDATED", settings: room.settings });
        room.broadcast({ type: "LOBBY_UPDATE", players: room.lobbyPlayers() });
        break;
      }

      // ── Ready toggle (guests; host is always implicitly ready) ─────────
      case "READY": {
        const room = rooms.get(roomId);
        if (!room || room.phase !== "lobby") return;
        const p = room.getPlayer(playerId);
        if (!p) return;
        if (p.id !== room.hostPlayerId) p.ready = msg.ready !== false;
        room.broadcast({
          type: "LOBBY_UPDATE",
          players: room.lobbyPlayers(),
          allReady: room.allReady(),
        });
        break;
      }

      // ── Heartbeat ack ──────────────────────────────────────────────────
      case "HEARTBEAT_ACK":
        break;

      // ── Reconnect ─────────────────────────────────────────────────────
      case "RECONNECT": {
        const room = rooms.get(msg.roomId);
        if (!room) {
          ws.send(
            JSON.stringify({
              type: "ERROR",
              code: "ROOM_NOT_FOUND",
              message: "Room gone.",
            }),
          );
          return;
        }
        const p = room.getPlayer(msg.playerId);
        if (!p) {
          ws.send(
            JSON.stringify({
              type: "ERROR",
              code: "PLAYER_NOT_FOUND",
              message: "Unknown player.",
            }),
          );
          return;
        }
        // Reattach socket
        p.ws = ws;
        p.connected = true;
        playerId = msg.playerId;
        roomId = msg.roomId;
        // Send full state
        ws.send(
          JSON.stringify({
            type: "STATE_SYNC",
            phase: room.phase,
            pile: room.pile,
            turnIdx: room.turnIdx,
            challengeOwed: room.challengeOwed,
            playerCounts: room.players.map((p) => ({
              id: p.id,
              name: p.name,
              cardCount: p.deck.length,
            })),
            seq: room.seq,
          }),
        );
        room.broadcast({ type: "PLAYER_RECONNECTED", playerId }, playerId);
        break;
      }
    }
  });

  ws.on("close", () => {
    if (!roomId || !playerId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const p = room.getPlayer(playerId);
    if (p) p.connected = false;
    room.broadcast({ type: "PLAYER_DISCONNECTED", playerId }, playerId);
    // In the lobby, drop disconnected players entirely so the roster stays clean.
    if (room.phase === "lobby" || room.phase === "countdown") {
      // Cancel any running countdown — roster changed.
      if (room.phase === "countdown") {
        clearTimeout(room.countdownTimer);
        room.phase = "lobby";
        room.broadcast({ type: "COUNTDOWN_CANCELLED" });
      }
      const idx = room.getPlayerIdx(playerId);
      if (idx >= 0) {
        room.players.splice(idx, 1);
        room.prizeCollected.splice(idx, 1);
      }
      // Migrate host if needed.
      if (playerId === room.hostPlayerId) {
        const next = room.players.find((pl) => pl.connected);
        if (next) {
          room.hostPlayerId = next.id;
          next.ready = false;
          room.send(next.id, { type: "YOU_ARE_HOST" });
        }
      }
      room.broadcast({
        type: "LOBBY_UPDATE",
        players: room.lobbyPlayers(),
        allReady: room.allReady(),
      });
    }
    // If all players disconnect from a lobby, clean up immediately
    if (room.phase === "lobby" && room.players.every((p) => !p.connected)) {
      rooms.delete(roomId);
    }
    console.log(`Player ${playerId} disconnected from room ${roomId}`);
  });

  ws.on("error", (err) => console.error("WS error:", err.message));
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function sanitizeName(name) {
  return (
    String(name || "Player")
      .trim()
      .slice(0, 20) || "Player"
  );
}

let _uidCounter = 0;
function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${_uidCounter++}`;
}
function makePlayerId() {
  try {
    if (crypto && typeof crypto.randomUUID === "function")
      return crypto.randomUUID();
  } catch (e) {}
  return uid();
}

// ─── START ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[Pharaoh Slap] Server listening on port ${PORT}`);
  console.log(`   Rooms: 0 | Players: 0 | Grace window: ${SLAP_GRACE_MS}ms`);
});

// Log active rooms every 30s in dev
if (process.env.NODE_ENV !== "production") {
  setInterval(() => {
    const active = [...rooms.values()].filter((r) => r.phase !== "over");
    if (active.length)
      console.log(
        `Active rooms: ${active.map((r) => `${r.id}(${r.players.length}p,${r.phase})`).join(" ")}`,
      );
  }, 30_000);
}
