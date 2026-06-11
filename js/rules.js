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

  /* ---- Tutorial pages (swipeable, one idea per page) ---------------------- */
  const TUT_PAGES = [
    { title: 'Take the Temple', body: () =>
      '<div class="tut-glyph">🂠</div>' +
      ruleRow('▶', 'Your turn', 'Players take turns flipping their top card onto the pile. Tap <b>PLAY CARD</b> (or press A).') +
      ruleRow('🏆', 'The goal', 'Win cards by slapping. Reach the slap target — or take every card — and the temple is yours.') },
    { title: 'Slap the Patterns', body: () =>
      '<div class="tut-glyph">🖐</div>' +
      ruleRow('🃏🃏', 'Twins · Gemini', 'Two equal ranks back-to-back.') +
      ruleRow('🃏·🃏', 'Orbit · 180', 'Equal ranks circling one card between.') +
      ruleRow('👑♕', 'Trine · Luminaries', 'Queen & King aligned together.') +
      ruleRow('♕·♔', 'Void · Squared', 'Queen & King parted by one card.') +
      ruleRow('⚡', 'Be first', 'Tap the pile or <b>SLAP</b> (or press S) — the whole pile is yours.') },
    { title: 'The Tax', body: () =>
      '<div class="tut-glyph">🗡</div>' +
      ruleRow('🗡', 'Tribute', 'A face card demands tax: J = 1, Q = 2, K = 3, A = 4 cards. <b>The amount owed is shown on screen whenever tribute is required.</b>') +
      ruleRow('⚖', 'Pay up', 'Fail to flip a face card while paying and the challenger takes the pile. Flip one, and the debt passes on.') +
      ruleRow('🖐', 'Stay sharp', 'Patterns can still appear during a tribute — and they are still slappable!') },
    { title: 'Justice', body: () =>
      '<div class="tut-glyph">⚖</div>' +
      ruleRow('✋', 'False slap', 'Slapping a pile that matches nothing burns one of your cards.') +
      ruleRow('🤝', 'Fair play', 'Right but second? If someone beats you to a true slap, you lose nothing.') +
      ruleRow('💨', 'Empty air', 'If the pile is already collected, a slap simply does nothing.') },
  ];
  let tutPage = 0;

  function body(tutorial) {
    const o = active.opts || {};
    const on = (k, dflt) => (dflt ? o[k] !== false : !!o[k]);
    let h = '';
    h += '<div class="rules-sect">Slappable piles' + (active.opts ? ' — this match' : '') + '</div>';
    if (on('double', true))   h += ruleRow('🃏🃏', 'Twins · Gemini', 'Two equal ranks back-to-back (7·7).');
    if (on('sandwich', true)) h += ruleRow('🃏·🃏', 'Orbit · 180', 'Equal ranks with one card between (7·K·7).');
    if (on('marriage', true)) h += ruleRow('👑♕', 'Trine · Luminaries', 'Queen & King back-to-back, either order.');
    if (on('divorce', true))  h += ruleRow('♕·♔', 'Void · Squared', 'Queen & King with one card between.');
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

  let tutorialMode = false;

  function renderTutPage() {
    const page = TUT_PAGES[tutPage];
    $('#rules-title').textContent = page.title;
    const bodyEl = $('#rules-body');
    bodyEl.innerHTML = page.body();
    bodyEl.classList.add('tut-page');
    // dots
    const dots = $('#rules-dots');
    if (dots) {
      dots.innerHTML = '';
      TUT_PAGES.forEach((_, i) => {
        const d = document.createElement('span');
        d.className = 'tdot' + (i === tutPage ? ' on' : '');
        d.onclick = () => { tutPage = i; renderTutPage(); };
        dots.appendChild(d);
      });
      dots.style.display = 'flex';
    }
    $('#rules-close').textContent = tutPage < TUT_PAGES.length - 1 ? 'Next ›' : 'Deal the Cards';
  }

  function open(opts) {
    opts = opts || {};
    const veil = $('#rules-veil'); if (!veil) return;
    tutorialMode = !!opts.tutorial;
    if (tutorialMode) {
      tutPage = 0;
      renderTutPage();
    } else {
      $('#rules-title').textContent = 'Rules of the Temple';
      const bodyEl = $('#rules-body');
      bodyEl.innerHTML = body(false);
      bodyEl.classList.remove('tut-page');
      const dots = $('#rules-dots'); if (dots) dots.style.display = 'none';
      $('#rules-close').textContent = 'Got It';
    }
    veil.classList.add('show');
    // Pause a live local match while reading (NetMatch is server-driven).
    const c = PS.activeController;
    if (opts.pause && c && c.engine && !c.matchOver) { c.paused = true; pausedMatch = c; }
  }

  function advance() {
    if (tutorialMode && tutPage < TUT_PAGES.length - 1) { tutPage++; renderTutPage(); return; }
    close();
  }

  function close() {
    tutorialMode = false;
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
    wire('#rules-close', advance);
    wire('#rules-btn', () => open({ pause: true }));
    wire('#howto-btn', () => { setActive(null, 'Pharaoh Slap', 0); open({ tutorial: true }); });
    const veil = $('#rules-veil');
    if (veil) {
      veil.addEventListener('click', (e) => { if (e.target === veil && !tutorialMode) close(); });
      // swipe between tutorial pages
      let sx = null;
      veil.addEventListener('touchstart', (e) => { sx = e.touches && e.touches[0] ? e.touches[0].clientX : null; }, { passive: true });
      veil.addEventListener('touchend', (e) => {
        if (sx == null || !tutorialMode) { sx = null; return; }
        const ex = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : sx;
        const dx = ex - sx; sx = null;
        if (Math.abs(dx) < 42) return;
        if (dx < 0 && tutPage < TUT_PAGES.length - 1) { tutPage++; renderTutPage(); }
        else if (dx > 0 && tutPage > 0) { tutPage--; renderTutPage(); }
      }, { passive: true });
    }
  }
  boot();

  PS.RULES = { setActive, open, close, needsTutorial, openTutorial };
})(window.PS);
