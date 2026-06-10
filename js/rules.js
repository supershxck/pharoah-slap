/* ============================================================================
   Pharaoh Slap — RULES (in-game rules reference + first-match quick tutorial)
   A small veil listing exactly the rules live in the current match, plus a
   skippable tutorial shown once (localStorage) before the first deal.
   ========================================================================== */
window.PS = window.PS || {};
(function (PS) {
  'use strict';
  const { $ } = PS;
  const TUT_KEY = 'ps_tut_seen';

  // Defaults match the engine: double/sandwich/marriage/divorce ON unless a
  // rule-set switches them off; runs/topBottom OFF unless switched on.
  let active = { opts: null, label: 'Pharaoh Slap', target: 0 };
  let onClose = null;        // tutorial continuation (deal the cards)
  let pausedMatch = null;    // local match paused while the veil is up

  const seen = () => { try { return !!localStorage.getItem(TUT_KEY); } catch { return true; } };
  const markSeen = () => { try { localStorage.setItem(TUT_KEY, '1'); } catch {} };

  function setActive(opts, label, target) {
    active = { opts: opts || null, label: label || 'Pharaoh Slap', target: target || 0 };
  }

  function ruleRow(glyph, name, desc) {
    return '<div class="rule-row"><span class="rg">' + glyph + '</span>' +
      '<span class="rn">' + name + '</span><span class="rd">' + desc + '</span></div>';
  }

  function body(tutorial) {
    const o = active.opts || {};
    const on = (k, dflt) => (dflt ? o[k] !== false : !!o[k]);
    let h = '';
    if (tutorial) {
      h += '<div class="rules-sect">How to play</div>' +
        ruleRow('🂠', 'Play', 'Take turns flipping your top card onto the pile — tap PLAY CARD (or press A).') +
        ruleRow('🖐', 'Slap', 'When the pile matches a rule below, slap it first — tap the pile or SLAP (or press S). You take the whole pile.') +
        ruleRow('✋', 'Careful', 'A false slap burns one of your cards to the bottom of the pile.');
    }
    h += '<div class="rules-sect">Slappable piles' + (active.opts ? ' — this match' : '') + '</div>';
    if (on('double', true))   h += ruleRow('🃏🃏', 'Double', 'Two equal ranks back-to-back (7·7).');
    if (on('sandwich', true)) h += ruleRow('🃏·🃏', 'Sandwich', 'Equal ranks with one card between (7·K·7).');
    if (on('marriage', true)) h += ruleRow('👑♕', 'Marriage', 'Queen & King back-to-back, either order.');
    if (on('divorce', true))  h += ruleRow('♕·♔', 'Divorce', 'Queen & King with one card between.');
    if (on('runs', false))    h += ruleRow('1·2·3', 'Sequence', 'Three ranks climbing or falling in a row.');
    if (on('topBottom', false)) h += ruleRow('⇅', 'Top & Bottom', 'Top card matches the very bottom card.');
    h += '<div class="rules-sect">The tax (face cards)</div>' +
      ruleRow('🗡', 'Tribute', 'A face card demands tax: J = 1, Q = 2, K = 3, A = 4 cards.') +
      ruleRow('⚖', 'Pay or lose', 'Fail to flip a face card while paying and the challenger takes the pile. Flip one, and the debt passes on.');
    h += '<div class="rules-sect">Winning</div>' +
      ruleRow('🏆', 'Win', active.target
        ? ('First to ' + active.target + ' slaps — or take every card.')
        : 'Reach the slap target — or take every card.');
    return h;
  }

  function open(opts) {
    opts = opts || {};
    const veil = $('#rules-veil'); if (!veil) return;
    $('#rules-title').textContent = opts.tutorial ? 'Quick Tutorial' : 'Rules of the Temple';
    $('#rules-body').innerHTML = body(!!opts.tutorial);
    $('#rules-close').textContent = opts.tutorial ? 'Deal the Cards' : 'Got It';
    veil.classList.add('show');
    // Pause a live local match while reading (NetMatch is server-driven).
    const c = PS.activeController;
    if (opts.pause && c && c.engine && !c.matchOver) { c.paused = true; pausedMatch = c; }
  }

  function close() {
    const veil = $('#rules-veil'); if (veil) veil.classList.remove('show');
    if (pausedMatch) {
      const c = pausedMatch; pausedMatch = null;
      c.paused = false;
      if (c.scheduleTurn && c.engine) c.scheduleTurn(c.engine.state.turn);
    }
    if (onClose) { const fn = onClose; onClose = null; fn(); }
  }

  function needsTutorial() { return !seen(); }
  function openTutorial(cont) {
    markSeen();
    onClose = cont || null;
    open({ tutorial: true });
  }

  function boot() {
    const wire = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', fn); };
    wire('#rules-close', close);
    wire('#rules-btn', () => open({ pause: true }));
    wire('#howto-btn', () => { setActive(null, 'Pharaoh Slap', 0); open({ tutorial: true }); });
    const veil = $('#rules-veil');
    if (veil) veil.addEventListener('click', (e) => { if (e.target === veil) close(); });
  }
  boot();

  PS.RULES = { setActive, open, close, needsTutorial, openTutorial };
})(window.PS);
