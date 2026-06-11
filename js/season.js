/* ============================================================================
   Pharaoh Slap — SEASON (the pass ladder: 30 tiers, free + pass tracks)
   State lives server-side (/api/season); guests see a sign-in invitation.
   Pass purchase rides the same checkout seam as the Treasury (pack_season1).
   ========================================================================== */
window.PS = window.PS || {};
(function (PS) {
  'use strict';
  const { $, el } = PS;

  let S = null;   // latest season state from the server

  function catalogItem(id) {
    return (PS.COSMO && PS.COSMO.CATALOG.find((c) => c.id === id)) || { id, name: id, glyph: '?' };
  }
  function rewardLabel(g) {
    if (!g) return null;
    const bits = [];
    if (g.packs) bits.push('\u{1F381} ' + g.packs + ' pack' + (g.packs > 1 ? 's' : ''));
    if (g.item) { const c = catalogItem(g.item); bits.push((c.glyph || '✦') + ' ' + c.name); }
    if (g.title) bits.push('\u{1F3F7} "' + g.title + '"');
    return bits.join(' · ');
  }

  async function refresh() {
    if (!PS.AUTH || !PS.AUTH.getUser()) { S = null; render(); return; }
    try {
      const { ok, data } = await PS.AUTH.api('/api/season');
      if (ok && data.season) { S = data.season; PS._seasonState = S; }
    } catch (e) { /* offline — show what we have */ }
    render();
  }

  async function claim(tier, btn) {
    btn.disabled = true;
    try {
      const { ok, data } = await PS.AUTH.api('/api/season/claim', { method: 'POST', body: { tier } });
      if (ok) {
        if (data.user) {
          PS.AUTH.setUserData(data.user);
          if (PS.COSMO) PS.COSMO.syncFromUser(data.user);
          if (data.user.season) { S = data.user.season; PS._seasonState = S; }
        }
        const got = data.gained || {};
        PS.toast('Tier ' + tier + ' claimed' + (got.packs ? ' — +' + got.packs + ' packs' : '') + '!');
        if (PS.SFX) PS.SFX.coins(7);
        render();
        return;
      }
      PS.toast(data.message || data.error || 'Could not claim');
    } catch (e) { PS.toast('Network error'); }
    btn.disabled = false;
  }

  async function buyPass(btn) {
    btn.disabled = true;
    try {
      const { ok, status, data } = await PS.AUTH.api('/api/store/checkout', { method: 'POST', body: { packId: 'pack_season1' } });
      if (ok && data.granted) {
        if (data.user) {
          PS.AUTH.setUserData(data.user);
          if (data.user.season) { S = data.user.season; PS._seasonState = S; }
        }
        PS.toast('\u{1F30A} The Pass is yours — every tier now pays');
        if (PS.SFX) PS.SFX.fanfare();
        const scr = $('#screen-season'); if (scr && PS.confetti) PS.confetti(scr, 70);
        render();
        return;
      }
      PS.toast(status === 501 ? (data.message || 'Purchases open at launch') : (data.message || 'Purchase failed'));
    } catch (e) { PS.toast('Network error'); }
    btn.disabled = false;
  }

  function render() {
    const bodyEl = $('#season-body');
    if (!bodyEl) return;
    bodyEl.innerHTML = '';

    if (!PS.AUTH || !PS.AUTH.getUser()) {
      bodyEl.appendChild(el('div', 'store-note', 'The season ladder remembers its climbers. Sign in with a free account to begin.'));
      return;
    }
    if (!S) { bodyEl.appendChild(el('div', 'store-note', 'Consulting the flood records…')); return; }

    // countdown
    const endsEl = $('#season-ends');
    if (endsEl) {
      const days = Math.max(0, Math.ceil((new Date(S.endsAt) - Date.now()) / 86400000));
      endsEl.textContent = S.tagline + ' · ' + days + ' days left';
    }

    // progress header
    const head = el('div', 'season-head frame');
    const into = S.xp - S.tier * S.xpPerTier;
    head.innerHTML =
      '<div class="sh-tier gold-text">Tier ' + S.tier + '<span class="sh-max"> / ' + S.tiers + '</span></div>' +
      '<div class="sh-bar"><i style="width:' + Math.min(100, Math.round(into / S.xpPerTier * 100)) + '%"></i></div>' +
      '<div class="sh-xp">' + (S.tier >= S.tiers ? 'Ladder complete — glory eternal' : into + ' / ' + S.xpPerTier + ' XP to tier ' + (S.tier + 1)) + '</div>';
    bodyEl.appendChild(head);

    // pass upsell / badge
    if (!S.pass) {
      const buy = el('button', 'btn fire', '\u{1F30A} Get the Pass — $4.99');
      buy.onclick = () => buyPass(buy);
      bodyEl.appendChild(buy);
    } else {
      bodyEl.appendChild(el('div', 'store-note', '\u{1F30A} Pass active — every tier pays out'));
    }

    // claim-all when several tiers wait
    const claimable = [];
    for (let t = 1; t <= S.tiers; t++) {
      const r = S.rewards[t] || {};
      if ((r.free || r.pass) && t <= S.tier && !S.claimed.includes(t)) claimable.push(t);
    }
    if (claimable.length > 1) {
      const all = el('button', 'btn emerald', 'Claim All (' + claimable.length + ')');
      all.onclick = async () => {
        all.disabled = true;
        for (const t of claimable) {
          try { await PS.AUTH.api('/api/season/claim', { method: 'POST', body: { tier: t } }); } catch (e) {}
        }
        PS.toast(claimable.length + ' tiers claimed');
        if (PS.SFX) PS.SFX.coins(10);
        refresh();
      };
      bodyEl.appendChild(all);
    }

    // tier track
    const track = el('div', 'season-track');
    for (let t = 1; t <= S.tiers; t++) {
      const r = S.rewards[t] || {};
      if (!r.free && !r.pass) continue;   // quiet tiers stay off the list
      const reached = t <= S.tier;
      const claimed = S.claimed.includes(t);
      const row = el('div', 'season-row' + (claimed ? ' claimed' : reached ? ' ready' : ' locked'));
      const freeL = rewardLabel(r.free), passL = rewardLabel(r.pass);
      row.innerHTML =
        '<div class="sr-tier">' + t + '</div>' +
        '<div class="sr-rewards">' +
          (freeL ? '<div class="sr-free">' + freeL + '</div>' : '') +
          (passL ? '<div class="sr-pass' + (S.pass ? '' : ' locked') + '">\u{1F511} ' + passL + '</div>' : '') +
        '</div>';
      const act = el('div', 'sr-act');
      if (claimed) act.textContent = '✓';
      else if (reached) {
        const b = el('button', 'btn emerald sr-btn', 'Claim');
        b.onclick = () => claim(t, b);
        act.appendChild(b);
      } else act.textContent = '\u{1F512}';
      row.appendChild(act);
      track.appendChild(row);
    }
    bodyEl.appendChild(track);
  }

  function open() { render(); refresh(); }

  PS.SEASON = { open, refresh, render };
})(window.PS);
