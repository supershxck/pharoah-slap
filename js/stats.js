/* ============================================================================
   Pharaoh Slap — STATS (match history, tracking & visualization)
   Logs every finished match locally (last 60), renders summary tiles and
   hand-drawn canvas charts. Works for guests and accounts alike.
   ========================================================================== */
window.PS = window.PS || {};
(function (PS) {
  'use strict';
  const { $, el } = PS;
  const LOG_KEY = 'ps_match_log';
  const MAX_LOG = 60;

  function load() {
    try { const a = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
  }
  function save(a) { try { localStorage.setItem(LOG_KEY, JSON.stringify(a.slice(-MAX_LOG))); } catch {} }

  // Called from COSMO.recordMatch for every finished match (local or online).
  function record(r) {
    const a = load();
    a.push({
      ts: Date.now(),
      won: !!r.won,
      slaps: r.slaps | 0,
      falseSlaps: r.falseSlaps | 0,
      cards: r.cards | 0,
      duration: r.duration | 0,
    });
    save(a);
  }

  /* ---- drawing helpers ----------------------------------------------------- */
  function css(name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }
  function makeChart(w, h) {
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr; c.height = h * dpr;
    c.style.cssText = 'width:100%;max-width:' + w + 'px;height:' + h + 'px';
    const x = c.getContext('2d');
    if (x) x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, x, w, h };
  }

  // Results: one bar per game, height = slaps landed, gold = win / red = loss.
  function chartResults(games) {
    const { c, x, w, h } = makeChart(320, 96);
    if (!x) return c;
    const gold = css('--gold-1', '#f6cf6b'), red = '#d8472e';
    const data = games.slice(-30);
    const maxS = Math.max(1, ...data.map((g) => g.slaps));
    const bw = Math.min(14, (w - 8) / Math.max(1, data.length) - 3);
    data.forEach((g, i) => {
      const bh = 8 + (g.slaps / maxS) * (h - 22);
      const bx = 4 + i * (bw + 3);
      x.fillStyle = g.won ? gold : red;
      x.globalAlpha = g.won ? 0.95 : 0.7;
      x.beginPath();
      x.roundRect ? x.roundRect(bx, h - bh - 4, bw, bh, 3) : x.rect(bx, h - bh - 4, bw, bh);
      x.fill();
    });
    x.globalAlpha = 1;
    return c;
  }

  // Duration trend: a sparkline of game length.
  function chartDurations(games) {
    const { c, x, w, h } = makeChart(320, 76);
    if (!x) return c;
    const gold = css('--gold-1', '#f6cf6b');
    const data = games.slice(-30).map((g) => g.duration).filter((d) => d > 0);
    if (data.length < 2) {
      x.fillStyle = 'rgba(255,255,255,.35)';
      x.font = '12px sans-serif';
      x.fillText('Play a few more games…', 10, h / 2);
      return c;
    }
    const maxD = Math.max(...data), minD = Math.min(...data);
    const px = (i) => 6 + (i / (data.length - 1)) * (w - 12);
    const py = (d) => h - 10 - ((d - minD) / Math.max(1, maxD - minD)) * (h - 24);
    x.strokeStyle = gold; x.lineWidth = 2; x.lineJoin = 'round';
    x.beginPath();
    data.forEach((d, i) => (i ? x.lineTo(px(i), py(d)) : x.moveTo(px(i), py(d))));
    x.stroke();
    x.fillStyle = gold;
    data.forEach((d, i) => { x.beginPath(); x.arc(px(i), py(d), 2.2, 0, Math.PI * 2); x.fill(); });
    return c;
  }

  // Slap accuracy donut: clean slaps vs false slaps.
  function chartAccuracy(clean, missed) {
    const { c, x, w, h } = makeChart(120, 120);
    if (!x) return c;
    const gold = css('--gold-1', '#f6cf6b');
    const total = Math.max(1, clean + missed);
    const frac = clean / total;
    const cx = w / 2, cy = h / 2, R = 46;
    x.lineWidth = 13;
    x.strokeStyle = 'rgba(216,71,46,.55)';
    x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = gold;
    x.beginPath(); x.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); x.stroke();
    x.fillStyle = gold;
    x.font = '700 22px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(Math.round(frac * 100) + '%', cx, cy);
    return c;
  }

  /* ---- render --------------------------------------------------------------*/
  const fmtTime = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

  function tile(label, value, sub) {
    const t = el('div', 'stat-tile frame');
    t.innerHTML = '<div class="st-v gold-text">' + value + '</div>' +
      '<div class="st-l">' + label + '</div>' + (sub ? '<div class="st-s">' + sub + '</div>' : '');
    return t;
  }

  function render() {
    const bodyEl = $('#stats-body');
    if (!bodyEl) return;
    bodyEl.innerHTML = '';
    const games = load();
    const C = PS.COSMO ? PS.COSMO.state : null;

    // lifetime numbers prefer the server/guest economy totals; log fills gaps
    const total = C ? C.games : games.length;
    const wins = C ? C.wins : games.filter((g) => g.won).length;
    const slaps = C ? C.slapsLanded : games.reduce((s, g) => s + g.slaps, 0);
    const falseSlaps = games.reduce((s, g) => s + g.falseSlaps, 0);
    const wonGames = games.filter((g) => g.won && g.duration > 0);
    const best = wonGames.length ? Math.min(...wonGames.map((g) => g.duration)) : 0;
    const avg = games.length ? Math.round(games.reduce((s, g) => s + g.duration, 0) / games.length) : 0;

    const tiles = el('div', 'stat-tiles');
    tiles.appendChild(tile('Games', total));
    tiles.appendChild(tile('Win Rate', total ? Math.round(wins / total * 100) + '%' : '—', wins + ' won'));
    tiles.appendChild(tile('Slaps Landed', slaps));
    tiles.appendChild(tile('Fastest Win', best ? fmtTime(best) : '—'));
    tiles.appendChild(tile('Avg Game', avg ? fmtTime(avg) : '—'));
    tiles.appendChild(tile('Level', C ? C.level : 1, C ? (C.xp + ' xp') : ''));
    bodyEl.appendChild(tiles);

    const sect = (t) => bodyEl.appendChild(el('div', 'coll-head', t));

    sect('Recent Games — slaps per game');
    const ch1 = el('div', 'stat-chart'); ch1.appendChild(chartResults(games)); bodyEl.appendChild(ch1);
    const legend = el('div', 'stat-legend');
    legend.innerHTML = '<span class="lg-win">■ won</span> <span class="lg-loss">■ lost</span>';
    bodyEl.appendChild(legend);

    sect('Slap Accuracy');
    const accWrap = el('div', 'stat-acc');
    accWrap.appendChild(chartAccuracy(slaps, falseSlaps));
    const accTxt = el('div', 'stat-acc-txt');
    accTxt.innerHTML = '<b class="gold-text">' + slaps + '</b> clean slaps<br><b style="color:#f06a3a">' + falseSlaps + '</b> false slaps';
    accWrap.appendChild(accTxt);
    bodyEl.appendChild(accWrap);

    sect('Game Length Trend');
    const ch2 = el('div', 'stat-chart'); ch2.appendChild(chartDurations(games)); bodyEl.appendChild(ch2);

    if (!games.length) {
      bodyEl.appendChild(el('div', 'stat-empty', 'No games logged yet — play a duel and return.'));
    }
  }

  PS.STATS = { record, render, load };
})(window.PS);
