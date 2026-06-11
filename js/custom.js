/* ============================================================================
   Pharaoh Slap — CUSTOM MATCH (house rules, rebuilt for v8)
   Pick your slap rules, table size, pace and win target — then duel.
   Rematch keeps the same rules via PS._lastMatchOpts.
   ========================================================================== */
window.PS = window.PS || {};
(function (PS) {
  'use strict';
  const { $, el } = PS;

  const state = {
    double: true, sandwich: true, marriage: true, divorce: true,
    runs: false, topBottom: false,
    players: 2, difficulty: 'medium', gameSpeed: 'normal', slapTarget: 5,
  };

  const RULES = [
    { key: 'double',    name: 'Twins · Gemini' },
    { key: 'sandwich',  name: 'Orbit · 180' },
    { key: 'marriage',  name: 'Trine · Luminaries' },
    { key: 'divorce',   name: 'Void · Squared' },
    { key: 'runs',      name: 'Sequences' },
    { key: 'topBottom', name: 'Top & Bottom' },
  ];

  function ruleBtn(r) {
    const b = el('button', 'ho-rule' + (state[r.key] ? ' on' : ''), r.name);
    b.onclick = () => { state[r.key] = !state[r.key]; b.classList.toggle('on', state[r.key]); };
    return b;
  }
  function segRow(label, key, opts) {
    const row = el('div', 'set-row col');
    row.appendChild(el('div', 'set-lbl', label));
    const track = el('div', 'set-seg');
    opts.forEach((o) => {
      const b = el('button', state[key] === o.value ? 'sel' : '', o.label);
      b.onclick = () => {
        state[key] = o.value;
        track.querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
      };
      track.appendChild(b);
    });
    row.appendChild(track);
    return row;
  }

  function render() {
    const bodyEl = $('#custom-body');
    if (!bodyEl) return;
    bodyEl.innerHTML = '';
    bodyEl.appendChild(el('div', 'coll-head', 'Slappable Patterns'));
    const grid = el('div', 'ho-grid');
    RULES.forEach((r) => grid.appendChild(ruleBtn(r)));
    bodyEl.appendChild(grid);
    bodyEl.appendChild(el('div', 'coll-head', 'The Table'));
    bodyEl.appendChild(segRow('Opponents', 'players', [
      { value: 2, label: '1 bot' }, { value: 3, label: '2 bots' }, { value: 4, label: '3 bots' },
    ]));
    bodyEl.appendChild(segRow('Bot skill', 'difficulty', [
      { value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' },
    ]));
    bodyEl.appendChild(segRow('Speed', 'gameSpeed', [
      { value: 'chill', label: 'Chill' }, { value: 'normal', label: 'Normal' },
      { value: 'fast', label: 'Fast' }, { value: 'blitz', label: 'Blitz' },
    ]));
    bodyEl.appendChild(segRow('Win at', 'slapTarget', [
      { value: 3, label: '3 slaps' }, { value: 5, label: '5 slaps' }, { value: 8, label: '8 slaps' },
    ]));
    const start = el('button', 'btn fire', '⚔ Begin the Duel');
    start.style.marginTop = '6px';
    start.onclick = begin;
    bodyEl.appendChild(start);
  }

  function begin() {
    if (!state.double && !state.sandwich && !state.marriage && !state.divorce && !state.runs && !state.topBottom) {
      state.double = true;
      PS.toast('A table needs at least one pattern — Twins enabled');
      render();
      return;
    }
    PS.startMatch({
      players: state.players,
      slapOpts: {
        double: state.double, sandwich: state.sandwich,
        marriage: state.marriage, divorce: state.divorce,
        runs: state.runs, topBottom: state.topBottom,
      },
      difficulty: state.difficulty,
      gameSpeed: state.gameSpeed,
      slapTarget: state.slapTarget,
      label: 'Custom Match',
    });
  }

  function open() { render(); PS.showScreen('custom'); }

  (function wire() {
    const back = $('#custom-back');
    if (back) back.addEventListener('click', () => PS.showScreen('home'));
  })();

  PS.CUSTOM = { open, state };
})(window.PS);
