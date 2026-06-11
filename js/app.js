/* ============================================================================
   Pharaoh Slap — Bootstrap: victory screen, wiring, init
   ========================================================================== */
window.PS = window.PS || {};
(function (PS) {
  'use strict';
  const { $, el } = PS;

  /* ---- Victory ----------------------------------------------------------- */
  PS.showVictory = function (data) {
    const banner = $('#vic-banner');
    const youWon = data.youWon;
    banner.querySelector('.vw').textContent = youWon ? 'VICTORY!' : 'DEFEAT';
    banner.querySelector('.vw').className = 'vw hero-word';
    $('#vic-avatar').innerHTML = data.winner.avatar;
    $('#vic-name').textContent = data.winner.name;
    $('#vic-gg').textContent = youWon ? 'GG' : 'GG';

    const eng = data.winner; // winner player object
    $('#vic-slaps').textContent = '+' + data.slaps;
    $('#vic-cards').textContent = '+' + data.cards;
    const vc = $('#vic-collected');
    if (vc) vc.textContent = '+' + (data.collected || 0);
    const vt = $('#vic-time');
    if (vt) {
      const s = data.time || 0;
      vt.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }
    $('#vic-mode').textContent = youWon ? 'Slap Duel · Won' : 'Slap Duel · Lost';

    // reward fan
    const tray = $('#vic-rewards'); tray.innerHTML = '';
    const left = el('div', 'reward');
    left.appendChild(PS.makeCard({ rank: 13, suit: 'spades', red: false, label: 'K', glyph: '\u2660' }, 64));
    left.appendChild(el('div', 'rlab', 'Upgraded'));
    const mid = el('div', 'reward center');
    mid.appendChild(PS.makeBack(PS.tweaks.deckSkin, 88));
    mid.appendChild(el('div', 'rlab', 'Rare · Alt Art'));
    const right = el('div', 'reward');
    right.appendChild(PS.makeCard({ rank: 14, suit: 'hearts', red: true, label: 'A', glyph: '\u2665' }, 64));
    right.appendChild(el('div', 'rlab', 'Lvl Up'));
    tray.appendChild(left); tray.appendChild(mid); tray.appendChild(right);

    $('#vic-banner-word2').textContent = youWon ? 'Deck Upgrades Unlocked!' : 'Better luck next duel';

    PS.showScreen('victory');
    if (youWon) PS.confetti($('#screen-victory'), 80);
  };

  /* ---- Wire up ----------------------------------------------------------- */
  function wire() {
    // nav buttons (data-nav)
    document.body.addEventListener('click', (e) => {
      const navEl = e.target.closest('[data-nav]');
      if (navEl) { PS.showScreen(navEl.dataset.nav); }
      const modeEl = e.target.closest('.mode-btn');
      if (modeEl) {
        PS.$$('.mode-btn').forEach(m => m.classList.remove('sel'));
        modeEl.classList.add('sel');
      }
    });

    $('#find-btn').addEventListener('click', () => PS.startMatch());
    $('#btn-play').addEventListener('click', () => PS.matchPlayCard());
    $('#btn-slap').addEventListener('click', () => PS.matchSlap());
    // Rematch / home route back into the ladder when a god duel is in flight.
    $('#vic-rematch').addEventListener('click', () => {
      if (PS.LADDER && PS.LADDER.active) PS.LADDER.resumeAfterMatch(true);
      else PS.startMatch(PS._lastMatchOpts);   // replay the same rules
    });
    $('#vic-home').addEventListener('click', () => {
      if (PS.LADDER && PS.LADDER.active) PS.LADDER.resumeAfterMatch(false);
      else PS.showScreen('home');
    });
    $('#vic-share').addEventListener('click', () => PS.toast('Win shared to the temple!'));
    $('#pack-claim').addEventListener('click', () => {
      if (PS.COSMO) PS.COSMO.onPackButton();
      else PS.showScreen('home');
    });

    // Progression wiring
    const trials = $('#trials-btn');
    if (trials) trials.addEventListener('click', () => { if (PS.LADDER) PS.LADDER.open(); });
    const lback = $('#ladder-back');
    if (lback) lback.addEventListener('click', () => PS.showScreen('home'));
    const iback = $('#intro-back');
    if (iback) iback.addEventListener('click', () => { if (PS.LADDER) PS.LADDER.renderList(); });
    const ibegin = $('#intro-begin');
    if (ibegin) ibegin.addEventListener('click', () => { if (PS.LADDER) PS.LADDER.begin(PS.LADDER.currentGod); });
    const lout = $('#logout-btn');
    if (lout) lout.addEventListener('click', () => { if (PS.AUTH) PS.AUTH.logout(); else PS.showScreen('home'); });

    // Online / lobby wiring
    const wireClick = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', fn); };
    wireClick('#online-btn',   () => { if (PS.NET) PS.NET.openLobby(); });
    wireClick('#online-back',  () => { if (PS.NET) PS.NET.leave(); else PS.showScreen('home'); });
    wireClick('#net-create',   () => { if (PS.NET) PS.NET.createRoom(); });
    wireClick('#net-join',     () => { if (PS.NET) PS.NET.joinRoom(); });
    wireClick('#lobby-start',  () => { if (PS.NET) PS.NET.startGame(); });
    wireClick('#lobby-ready',  () => { if (PS.NET) PS.NET.toggleReady(); });
    wireClick('#lobby-leave',  () => { if (PS.NET) PS.NET.leave(); });

    // keyboard: A or Enter = play card, S or Space = slap
    window.addEventListener('keydown', (e) => {
      if (PS.currentScreen() !== 'table') return;
      if (e.repeat) return;
      const k = e.code;
      if (k === 'KeyS' || k === 'Space') { e.preventDefault(); PS.matchSlap(); }
      else if (k === 'KeyA' || k === 'Enter') { e.preventDefault(); PS.matchPlayCard(); }
    });

    // big slap target zone: tap pile to slap
    $('#pile').addEventListener('click', () => { if (PS.currentScreen() === 'table') PS.matchSlap(); });
  }

  PS.onScreen = function (id) {
    if (id === 'home') PS.renderHome();
    else if (id === 'profile') PS.renderProfile();
    else if (id === 'pack') PS.renderPack();
    else if (id === 'settings' && PS.SETTINGS) PS.SETTINGS.render();
    else if (id === 'stats' && PS.STATS) PS.STATS.render();
    else if (id === 'store' && PS.STORE) PS.STORE.render();
    // ambient canvas: glyph rain on auth, calm on home, duel-driven on table
    if (PS.VFX) {
      if (id === 'home') PS.VFX.setMode('home');
      else if (id === 'auth') PS.VFX.setMode('auth');
      else if (id !== 'table' && id !== 'slap') PS.VFX.setMode(null);
    }
  };

  function init() {
    PS.initTweaks();
    if (PS.VFX) PS.VFX.boot();
    PS.renderHome();
    wire();
    // AUTH decides the entry screen: auth veil → weighing → home.
    if (PS.AUTH) PS.AUTH.boot();
    else PS.showScreen('home');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(window.PS);
