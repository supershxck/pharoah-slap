/* ============================================================================
   Pharaoh Slap — STORE (premium bundles, $2.99 each)
   Renders the treasury, previews bundle contents, and drives checkout through
   the server's payment seam (/api/store/checkout). Until a payment provider
   is wired, the server answers 501 and we show a friendly notice — or grants
   instantly when the server runs with DEV_FREE_PURCHASES=1.
   ========================================================================== */
window.PS = window.PS || {};
(function (PS) {
  'use strict';
  const { $, el } = PS;

  // Mirror of the server STORE (ids must match auth.js)
  const PACKS = [
    { id: 'pack_royal',     name: 'Royal Treasury',    price: '$2.99', tagline: 'Gold for the worthy',
      items: ['skin_pharaoh', 'charm_cartouche', 'fx_crowns'] },
    { id: 'pack_duat',      name: 'Night of the Duat', price: '$2.99', tagline: 'What waits below',
      items: ['skin_anubisn', 'table_necro', 'fx_souls'] },
    { id: 'pack_celestial', name: 'Celestial Bundle',  price: '$2.99', tagline: 'The sky, purchased',
      items: ['skin_stars', 'play_nova', 'charm_moon'] },
  ];
  const KIND_LABEL = { skin: 'Card Back', fx: 'Slap Effect', play: 'Charged Play', table: 'Table', charm: 'Card Charm' };

  function catalogItem(id) {
    return (PS.COSMO && PS.COSMO.CATALOG.find((c) => c.id === id)) || { id, name: id, kind: '?', glyph: '?' };
  }
  const ownedAll = (p) => PS.COSMO && p.items.every((id) => PS.COSMO.state.owned.has(id));

  async function buy(pack, btn) {
    if (!PS.AUTH || !PS.AUTH.getUser()) { PS.toast('Sign in to make purchases'); return; }
    btn.disabled = true;
    try {
      const { ok, status, data } = await PS.AUTH.api('/api/store/checkout', { method: 'POST', body: { packId: pack.id } });
      if (ok && data.granted) {
        if (data.user) { PS.AUTH.setUserData(data.user); PS.COSMO.syncFromUser(data.user); }
        PS.toast('\u{1F451} ' + pack.name + ' is yours!');
        if (PS.SFX) PS.SFX.fanfare();
        const scr = $('#screen-store'); if (scr && PS.confetti) PS.confetti(scr, 70);
        render();
        return;
      }
      if (status === 501) PS.toast(data.message || 'Purchases open at launch — stay tuned');
      else PS.toast(data.message || 'Purchase failed');
    } catch (e) {
      PS.toast('Network error — try again');
    } finally {
      btn.disabled = false;
    }
  }

  function packCard(p) {
    const card = el('div', 'store-pack frame' + (ownedAll(p) ? ' owned' : ''));
    card.innerHTML = '<div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>';
    card.appendChild(el('div', 'sp-name gold-text', p.name));
    card.appendChild(el('div', 'sp-tag', p.tagline));
    const tray = el('div', 'sp-items');
    p.items.forEach((id) => {
      const c = catalogItem(id);
      const t = el('div', 'sp-item');
      if (c.kind === 'skin') t.appendChild(PS.makeBack(c.value, 46));
      else t.appendChild(el('div', 'fx-tile', c.glyph || '?'));
      t.appendChild(el('div', 'sp-iname', c.name));
      t.appendChild(el('div', 'sp-ikind', KIND_LABEL[c.kind] || c.kind));
      tray.appendChild(t);
    });
    card.appendChild(tray);
    const btn = el('button', 'btn ' + (ownedAll(p) ? 'ghost' : 'fire'), ownedAll(p) ? 'Owned' : p.price);
    btn.disabled = ownedAll(p);
    if (!ownedAll(p)) btn.onclick = () => buy(p, btn);
    card.appendChild(btn);
    return card;
  }

  function render() {
    const bodyEl = $('#store-body');
    if (!bodyEl) return;
    bodyEl.innerHTML = '';
    bodyEl.appendChild(el('div', 'store-note', 'Exclusive treasures — never found in free packs. One purchase, yours forever.'));
    PACKS.forEach((p) => bodyEl.appendChild(packCard(p)));
    if (!PS.AUTH || !PS.AUTH.getUser()) {
      bodyEl.appendChild(el('div', 'store-note dim', 'Sign in with a free account to purchase.'));
    }
  }

  PS.STORE = { render, PACKS };
})(window.PS);
