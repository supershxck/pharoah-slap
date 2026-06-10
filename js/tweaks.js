/* ============================================================================
   Pharaoh Slap — Tweaks (vanilla host-protocol panel)
   ========================================================================== */
window.PS = window.PS || {};
(function (PS) {
  'use strict';

  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "theme": "gold",
    "deckSkin": "tiedye",
    "players": 2,
    "gameSpeed": "normal",
    "difficulty": "medium"
  }/*EDITMODE-END*/;

  const THEMES = {
    gold:   { accent: '#e2ab3c', glow: 'rgba(242,200,90,.55)', hi: '#ffe9a8', g1: '#f6cf6b', g2: '#e2ab3c', g3: '#b6801f', deep: '#5e3d0e' },
    jewel:  { accent: '#34c8c0', glow: 'rgba(52,200,192,.5)',  hi: '#bff7f2', g1: '#5fe0d8', g2: '#34c8c0', g3: '#1c8f89', deep: '#0c4b47' },
    royal:  { accent: '#8a5ad8', glow: 'rgba(138,90,216,.5)',  hi: '#e2cffb', g1: '#b48cf0', g2: '#8a5ad8', g3: '#5d36a3', deep: '#2e1a55' },
    blood:  { accent: '#d8472e', glow: 'rgba(216,71,46,.5)',   hi: '#ffd0bf', g1: '#f06a3a', g2: '#d8472e', g3: '#9c2a18', deep: '#4a0f08' },
  };

  PS.tweaks = Object.assign({}, TWEAK_DEFAULTS);

  PS.applyTheme = function () {
    const th = THEMES[PS.tweaks.theme] || THEMES.gold;
    const r = document.documentElement.style;
    r.setProperty('--accent', th.accent);
    r.setProperty('--accent-glow', th.glow);
    r.setProperty('--gold-hi', th.hi);
    r.setProperty('--gold-1', th.g1);
    r.setProperty('--gold-2', th.g2);
    r.setProperty('--gold-3', th.g3);
    r.setProperty('--gold-deep', th.deep);
    r.setProperty('--hero-grad', 'linear-gradient(180deg,' + th.hi + ' 0%,' + th.g1 + ' 38%,' + th.g2 + ' 62%,' + th.g3 + ' 100%)');
  };

  function applyAll() {
    PS.applyTheme();
    if (PS.currentScreen && PS.currentScreen() === 'home' && PS.renderHome) PS.renderHome();
  }

  /* ---- Panel UI ---------------------------------------------------------- */
  let panel = null;
  function setTweak(key, val) {
    PS.tweaks[key] = val;
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [key]: val } }, '*');
    applyAll();
    renderPanel();
  }

  function seg(label, key, opts) {
    const row = PS.el('div', 'twk-row');
    row.innerHTML = '<div class="twk-lbl"><span>' + label + '</span></div>';
    const track = PS.el('div', 'twk-seg');
    opts.forEach(o => {
      const v = typeof o === 'object' ? o.value : o;
      const l = typeof o === 'object' ? o.label : o;
      const b = PS.el('button', '', l);
      if (PS.tweaks[key] === v) b.style.cssText = 'background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);border-radius:6px';
      b.onclick = () => setTweak(key, v);
      track.appendChild(b);
    });
    row.appendChild(track);
    return row;
  }

  function renderPanel() {
    if (!panel) return;
    const body = panel.querySelector('.twk-body');
    body.innerHTML = '';
    const sect = (t) => { const s = PS.el('div', 'twk-sect', t); body.appendChild(s); };

    sect('Table');
    body.appendChild(seg('Players', 'players', [{value:2,label:'2'},{value:3,label:'3'},{value:4,label:'4'}]));
    body.appendChild(seg('Bot skill', 'difficulty', [{value:'easy',label:'Easy'},{value:'medium',label:'Medium'},{value:'hard',label:'Hard'}]));
    body.appendChild(seg('Game speed', 'gameSpeed', [{value:'chill',label:'Chill'},{value:'normal',label:'Normal'},{value:'fast',label:'Fast'},{value:'blitz',label:'Blitz'}]));

    sect('Look');
    // theme color chips
    const trow = PS.el('div', 'twk-row');
    trow.innerHTML = '<div class="twk-lbl"><span>Theme</span></div>';
    const chips = PS.el('div', 'twk-chips');
    [['gold','#e2ab3c'],['jewel','#34c8c0'],['royal','#8a5ad8'],['blood','#d8472e']].forEach(([name,col]) => {
      const c = PS.el('button', 'twk-chip');
      c.style.background = col;
      c.title = name;
      if (PS.tweaks.theme === name) c.dataset.on = '1';
      c.onclick = () => setTweak('theme', name);
      chips.appendChild(c);
    });
    trow.appendChild(chips);
    body.appendChild(trow);
    body.appendChild(seg('Card backs', 'deckSkin', [{value:'tiedye',label:'Tie-Dye'},{value:'egypt',label:'Lapis'}]));

    sect('Match');
    const newBtn = PS.el('button', 'twk-btn', 'Start new duel');
    newBtn.style.width = '100%';
    newBtn.onclick = () => { PS.startMatch(); };
    body.appendChild(newBtn);
  }

  function buildPanel() {
    panel = PS.el('div', 'twk-panel');
    panel.setAttribute('data-omelette-chrome', '');
    panel.innerHTML = '<div class="twk-hd"><b>Tweaks</b><button class="twk-x" aria-label="Close">\u2715</button></div><div class="twk-body"></div>';
    document.body.appendChild(panel);
    panel.querySelector('.twk-x').onclick = () => { panel.style.display = 'none'; window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*'); };
    // drag
    const hd = panel.querySelector('.twk-hd');
    hd.onmousedown = (e) => {
      if (e.target.classList.contains('twk-x')) return;
      const r = panel.getBoundingClientRect();
      const sx = e.clientX, sy = e.clientY;
      const sr = window.innerWidth - r.right, sb = window.innerHeight - r.bottom;
      const mv = (ev) => { panel.style.right = Math.max(8, sr - (ev.clientX - sx)) + 'px'; panel.style.bottom = Math.max(8, sb - (ev.clientY - sy)) + 'px'; };
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    };
    renderPanel();
  }

  // host protocol
  window.addEventListener('message', (e) => {
    const ty = e && e.data && e.data.type;
    if (ty === '__activate_edit_mode') { if (!panel) buildPanel(); panel.style.display = 'flex'; renderPanel(); }
    else if (ty === '__deactivate_edit_mode') { if (panel) panel.style.display = 'none'; }
  });

  PS.initTweaks = function () {
    applyAll();
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
  };

})(window.PS);
