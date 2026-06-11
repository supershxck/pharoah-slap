/* ============================================================================
   Pharaoh Slap — SETTINGS (player-facing: table background, expert mode, pace)
   Free table colors for everyone; pack-unlocked halls appear once owned.
   ========================================================================== */
window.PS = window.PS || {};
(function (PS) {
  'use strict';
  const { $, el } = PS;

  // Free for all players. Pack drops (kind 'table' in the catalog) join below.
  const FREE_TABLES = [
    { value: 'green', name: 'Original Green', sw: 'linear-gradient(160deg,#0c3a26,#0a2e1e)' },
    { value: 'red',   name: 'Crimson',        sw: 'linear-gradient(160deg,#4a1212,#2e0a0a)' },
    { value: 'blue',  name: 'Lapis',          sw: 'linear-gradient(160deg,#0b1233,#080a1c)' },
  ];
  const PACK_TABLES = [
    { id: 'table_gold',   value: 'gold',   name: 'Gilded Hall', sw: 'linear-gradient(160deg,#3d2c0a,#241804)' },
    { id: 'table_duatbg', value: 'duatbg', name: 'Duat Void',   sw: 'linear-gradient(160deg,#1c0e38,#0c0618)' },
  ];

  function owned(id) {
    return !!(PS.COSMO && PS.COSMO.state.owned.has(id));
  }

  function tableChip(t, locked) {
    const c = el('div', 'set-table' + (locked ? ' locked' : '') +
      (PS.tweaks.tableTheme === t.value && !locked ? ' on' : ''));
    const sw = el('div', 'set-sw'); sw.style.background = t.sw;
    c.appendChild(sw);
    c.appendChild(el('div', 'set-tname', t.name + (locked ? ' 🔒' : '')));
    if (!locked) c.onclick = () => { PS.setTweak('tableTheme', t.value); render(); PS.toast(t.name); };
    else c.onclick = () => PS.toast('Found in packs — keep playing!');
    return c;
  }

  function toggleRow(label, desc, key) {
    const row = el('div', 'set-row');
    const meta = el('div', 'set-meta');
    meta.appendChild(el('div', 'set-lbl', label));
    meta.appendChild(el('div', 'set-desc', desc));
    row.appendChild(meta);
    const sw = el('button', 'set-toggle' + (PS.tweaks[key] ? ' on' : ''));
    sw.setAttribute('aria-pressed', PS.tweaks[key] ? 'true' : 'false');
    sw.innerHTML = '<i></i>';
    sw.onclick = () => { PS.setTweak(key, !PS.tweaks[key]); render(); };
    row.appendChild(sw);
    return row;
  }

  function segRow(label, key, opts) {
    const row = el('div', 'set-row col');
    row.appendChild(el('div', 'set-lbl', label));
    const track = el('div', 'set-seg');
    opts.forEach((o) => {
      const b = el('button', PS.tweaks[key] === o.value ? 'sel' : '', o.label);
      b.onclick = () => { PS.setTweak(key, o.value); render(); };
      track.appendChild(b);
    });
    row.appendChild(track);
    return row;
  }

  function render() {
    const bodyEl = $('#settings-body');
    if (!bodyEl) return;
    bodyEl.innerHTML = '';

    bodyEl.appendChild(el('div', 'coll-head', 'Table Background'));
    const grid = el('div', 'set-tables');
    FREE_TABLES.forEach((t) => grid.appendChild(tableChip(t, false)));
    PACK_TABLES.forEach((t) => grid.appendChild(tableChip(t, !owned(t.id))));
    bodyEl.appendChild(grid);

    bodyEl.appendChild(el('div', 'coll-head', 'Gameplay'));
    bodyEl.appendChild(toggleRow('Sound', 'Card flips, slap thumps, coin payouts', 'sound'));
    bodyEl.appendChild(toggleRow('Expert Mode', 'Simplified table, no pile glow — read the cards yourself', 'expertUI'));
    bodyEl.appendChild(segRow('Game speed', 'gameSpeed', [
      { value: 'chill', label: 'Chill' }, { value: 'normal', label: 'Normal' },
      { value: 'fast', label: 'Fast' }, { value: 'blitz', label: 'Blitz' },
    ]));
    bodyEl.appendChild(segRow('Bot skill', 'difficulty', [
      { value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' },
    ]));

    // account management (deletion is an app-store requirement)
    if (PS.AUTH && PS.AUTH.getUser()) {
      bodyEl.appendChild(el('div', 'coll-head', 'Account'));
      const del = el('button', 'btn ghost danger', 'Delete My Account');
      let armed = false;
      del.onclick = async () => {
        if (!armed) {
          armed = true;
          del.textContent = 'Tap again to erase everything — forever';
          del.classList.add('armed');
          setTimeout(() => { armed = false; del.textContent = 'Delete My Account'; del.classList.remove('armed'); }, 4000);
          return;
        }
        try {
          const { ok } = await PS.AUTH.api('/api/account', { method: 'DELETE' });
          if (ok) { PS.toast('Account erased. The sands forget.'); PS.AUTH.logout(); return; }
          PS.toast('Could not delete — try again');
        } catch (e) { PS.toast('Network error'); }
      };
      bodyEl.appendChild(del);
    }
  }

  PS.SETTINGS = { render };
})(window.PS);
