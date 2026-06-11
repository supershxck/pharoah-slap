/* ============================================================================
   Pharaoh Slap — Game Engine (pure logic, no DOM)
   Egyptian Ratscrew / Slapjack rules with tribute + slap mechanics.
   ========================================================================== */
(function (global) {
  'use strict';

  const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
  const SUIT_GLYPH = { spades: '\u2660', hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663' };
  const RED = { hearts: true, diamonds: true };
  // 2..10 numeric, 11=J 12=Q 13=K 14=A
  const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  // Tribute "chances" owed when a face card is played
  const TRIBUTE = { 11: 1, 12: 2, 13: 3, 14: 4 };

  function rankLabel(r) { return RANK_LABEL[r] || String(r); }
  function isFace(card) { return card && card.rank >= 11; }

  function buildDeck() {
    const deck = [];
    let id = 0;
    for (const suit of SUITS) {
      for (let rank = 2; rank <= 14; rank++) {
        deck.push({ rank, suit, red: !!RED[suit], label: rankLabel(rank), glyph: SUIT_GLYPH[suit], id: id++ });
      }
    }
    return deck;
  }

  function shuffle(arr, rng) {
    rng = rng || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* -- Slap validity ------------------------------------------------------- */
  // Returns { valid, reasons:[] } evaluated on the current pile (top = last).
  function slapCheck(pile, opts) {
    opts = opts || {};
    const n = pile.length;
    const reasons = [];
    // double/sandwich are on by default; a god's rule-set can switch them off.
    if (opts.double !== false && n >= 2 && pile[n - 1].rank === pile[n - 2].rank) reasons.push('double');
    if (opts.sandwich !== false && n >= 3 && pile[n - 1].rank === pile[n - 3].rank) reasons.push('sandwich');
    // Marriage: Q & K back-to-back. Divorce: Q & K with one card between.
    // Both on by default (like double/sandwich); rule-sets can switch them off.
    const qk = (a, b) => (a === 12 && b === 13) || (a === 13 && b === 12);
    if (opts.marriage !== false && n >= 2 && qk(pile[n - 2].rank, pile[n - 1].rank)) reasons.push('marriage');
    if (opts.divorce !== false && n >= 3 && qk(pile[n - 3].rank, pile[n - 1].rank)) reasons.push('divorce');
    if (opts.topBottom && n >= 2 && pile[n - 1].rank === pile[0].rank) reasons.push('topbottom');
    // Run of 3 ascending/descending (consecutive ranks), optional
    if (opts.runs && n >= 3) {
      const a = pile[n - 3].rank, b = pile[n - 2].rank, c = pile[n - 1].rank;
      if ((b === a + 1 && c === b + 1) || (b === a - 1 && c === b - 1)) reasons.push('run');
    }
    return { valid: reasons.length > 0, reasons };
  }

  /* -- Game object --------------------------------------------------------- */
  function createGame(config) {
    config = config || {};
    const listeners = [];
    const rng = config.rng || Math.random;
    const slapOpts = config.slapOpts || { topBottom: false, runs: false };

    const players = (config.players || []).map((p, i) => ({
      index: i,
      id: p.id != null ? p.id : i,
      name: p.name || ('Player ' + (i + 1)),
      avatar: p.avatar || null,
      isHuman: !!p.isHuman,
      hand: [],
      cardsPlayed: 0,
      cardsCollected: 0,
      slapsLanded: 0,
      slapsMissed: 0,
      pilesWon: 0,
      eliminated: false,
    }));

    const state = {
      pile: [],
      bottomBurn: [],          // cards burned to bottom by bad slaps live at pile[0..]
      turn: 0,
      tributeOwed: 0,          // remaining tribute cards current player must beat
      challenger: -1,          // player who laid the last face card
      phase: 'idle',           // idle | playing | over
      winner: -1,
      slapOpen: false,         // is the current pile slappable & unclaimed
      slapClaimed: false,
      lastCard: null,
      pilesResolved: 0,
    };

    function emit(ev) { for (const fn of listeners) fn(ev); }
    function on(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }

    function activePlayers() { return players.filter(p => !p.eliminated); }
    function nextActive(from) {
      const n = players.length;
      for (let k = 1; k <= n; k++) {
        const idx = (from + k) % n;
        if (!players[idx].eliminated) return idx;
      }
      return from;
    }

    function deal() {
      const deck = shuffle(buildDeck(), rng);
      let i = 0;
      while (deck.length) {
        players[i % players.length].hand.push(deck.shift());
        i++;
      }
      state.phase = 'playing';
      state.turn = 0;
      emit({ type: 'dealt' });
      emit({ type: 'turn', player: state.turn });
    }

    function refreshSlap() {
      const chk = slapCheck(state.pile, slapOpts);
      state.slapOpen = chk.valid && !state.slapClaimed;
      return chk;
    }

    // The active player flips their top card onto the pile.
    function playTopCard(playerIdx) {
      if (state.phase !== 'playing') return null;
      if (playerIdx !== state.turn) return null;
      const player = players[playerIdx];

      // No cards to play
      if (player.hand.length === 0) {
        if (state.tributeOwed > 0 && state.challenger >= 0) {
          // Cannot pay tribute -> challenger wins the pile
          awardPile(state.challenger, 'challenge');
          return null;
        }
        // Skip an empty (not-yet-eliminated) player on a normal turn
        advanceTurn();
        return null;
      }

      const card = player.hand.shift();
      player.cardsPlayed++;
      state.pile.push(card);
      state.lastCard = card;
      state.slapClaimed = false;
      emit({ type: 'play', player: playerIdx, card, pileCount: state.pile.length });

      const chk = refreshSlap();
      if (chk.valid) emit({ type: 'slapOpen', reasons: chk.reasons, pileCount: state.pile.length });

      // Resolve turn / tribute mechanics
      if (isFace(card)) {
        // This card opens a new tribute challenge
        state.tributeOwed = TRIBUTE[card.rank];
        state.challenger = playerIdx;
        const nxt = nextActive(playerIdx);
        state.turn = nxt;
        emit({ type: 'faceChallenge', challenger: playerIdx, owed: state.tributeOwed, card });
        emit({ type: 'turn', player: nxt });
      } else if (state.tributeOwed > 0) {
        // Paying tribute with a non-face card
        state.tributeOwed--;
        if (state.tributeOwed === 0) {
          // Tribute failed -> challenger collects
          awardPile(state.challenger, 'challenge');
        } else {
          emit({ type: 'tribute', player: playerIdx, owed: state.tributeOwed });
          emit({ type: 'turn', player: state.turn }); // same player keeps flipping
        }
      } else {
        // Normal turn -> pass
        advanceTurn();
      }
      return card;
    }

    function advanceTurn() {
      const nxt = nextActive(state.turn);
      state.turn = nxt;
      emit({ type: 'turn', player: nxt });
    }

    // A player attempts to slap. Returns result object.
    function attemptSlap(playerIdx) {
      if (state.phase !== 'playing') return { ignored: true };
      // Pile already swept (or nothing dealt onto it yet) — a slap on empty
      // air does nothing and costs nothing.
      if (state.pile.length === 0) return { ignored: true, empty: true };
      const player = players[playerIdx];
      if (player.eliminated && player.hand.length === 0) {
        // Eliminated players can slap back in only if they still could win — allow
      }
      const chk = slapCheck(state.pile, slapOpts);
      // Accurate but second: someone faster already claimed it. No penalty —
      // being right and late is not a crime.
      if (chk.valid && state.slapClaimed) {
        emit({ type: 'slapLate', player: playerIdx });
        return { player: playerIdx, ignored: true, late: true };
      }
      if (chk.valid && !state.slapClaimed) {
        state.slapClaimed = true;
        state.slapOpen = false;
        player.slapsLanded++;
        const result = { player: playerIdx, valid: true, won: true, reasons: chk.reasons, pileCount: state.pile.length };
        emit({ type: 'slap', ...result });
        awardPile(playerIdx, 'slap');
        return result;
      }
      // Invalid slap -> burn penalty
      player.slapsMissed++;
      let burned = null;
      if (player.hand.length > 0) {
        burned = player.hand.pop();
        state.pile.unshift(burned); // to bottom of pile
      }
      const result = { player: playerIdx, valid: false, won: false, burned };
      emit({ type: 'slap', ...result });
      emit({ type: 'burn', player: playerIdx, card: burned });
      return result;
    }

    function awardPile(winnerIdx, reason) {
      const winner = players[winnerIdx];
      const count = state.pile.length;
      // Winner takes the whole pile to the bottom of their hand
      while (state.pile.length) winner.hand.push(state.pile.shift());
      winner.pilesWon++;
      winner.cardsCollected += count;
      state.tributeOwed = 0;
      state.challenger = -1;
      state.slapClaimed = false;
      state.slapOpen = false;
      state.lastCard = null;
      state.pilesResolved++;
      emit({ type: 'pileWon', winner: winnerIdx, count, reason });

      // Eliminate anyone (other than winner) now holding zero cards
      const newlyOut = [];
      for (const p of players) {
        if (!p.eliminated && p.index !== winnerIdx && p.hand.length === 0) {
          p.eliminated = true;
          newlyOut.push(p.index);
        }
      }
      if (newlyOut.length) emit({ type: 'eliminated', players: newlyOut });

      const alive = activePlayers();
      if (alive.length <= 1) {
        state.phase = 'over';
        state.winner = alive.length ? alive[0].index : winnerIdx;
        emit({ type: 'gameOver', winner: state.winner });
        return;
      }
      // Winner leads the next play
      state.turn = winner.eliminated ? nextActive(winnerIdx) : winnerIdx;
      emit({ type: 'turn', player: state.turn });
    }

    return {
      state, players, on, deal, playTopCard, attemptSlap,
      slapCheck: () => slapCheck(state.pile, slapOpts),
      activePlayers,
      get pile() { return state.pile; },
      get phase() { return state.phase; },
    };
  }

  global.PSEngine = { createGame, buildDeck, shuffle, slapCheck, rankLabel, isFace, SUIT_GLYPH, TRIBUTE };
})(window);
