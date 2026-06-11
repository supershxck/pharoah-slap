/* ============================================================================
   Pharaoh Slap — VFX (ambient canvas layer, tension model, special effects)
   One devicePixelRatio-aware canvas behind the screens. Game events feed a
   tension meter that drives ember density, glow, color heat and table tremor.
   Gracefully no-ops without canvas support (headless, ancient browsers).
   ========================================================================== */
window.PS = window.PS || {};
(function (PS) {
  'use strict';

  const GOLD = [246, 207, 107], BLUE = [88, 140, 255], RED = [255, 110, 64],
        TEAL = [82, 220, 210], VIOLET = [180, 120, 255], WHITE = [255, 244, 220];
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;

  let canvas = null, ctx = null, phone = null;
  let W = 0, H = 0, DPR = 1;
  let mode = null;            // null | 'home' | 'table'
  let raf = 0, lastT = 0;
  let tension = 0;            // 0..1 — the rising heat of the duel
  let shakeLvl = 0;           // 0,1,2 applied as CSS class on .phone
  let parts = [];             // live particles
  const MAX_PARTS = 220;
  let reduced = false;

  function boot() {
    try {
      phone = document.querySelector('.phone');
      if (!phone) return;
      canvas = document.createElement('canvas');
      canvas.id = 'vfx';
      canvas.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none;width:100%;height:100%';
      const env = phone.querySelector('.env');
      env ? env.after(canvas) : phone.prepend(canvas);
      ctx = canvas.getContext('2d');
      if (!ctx) { canvas.remove(); canvas = null; return; }
      try { reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch {}
      resize();
      window.addEventListener('resize', resize);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
    } catch (e) { ctx = null; }
  }
  function resize() {
    if (!canvas || !phone) return;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = phone.clientWidth; H = phone.clientHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
  }

  /* ---- particle helpers ---------------------------------------------------- */
  function push(p) { if (parts.length < MAX_PARTS) parts.push(p); }
  function spawnSparks(x, y, n, col, speed, up) {
    for (let i = 0; i < n; i++) {
      const a = up ? rnd(-Math.PI * 0.85, -Math.PI * 0.15) : rnd(0, TAU);
      const v = rnd(speed * 0.4, speed);
      push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        g: 140, life: rnd(0.4, 0.9), t: 0, r: rnd(1, 2.4), col });
    }
  }
  function spawnRing(x, y, col, maxR, width) {
    push({ k: 'ring', x, y, t: 0, life: 0.7, maxR: maxR || 90, w: width || 2.5, col });
  }
  function spawnEmber(heat) {
    const col = heat > 0.66 ? RED : heat > 0.33 ? GOLD : BLUE;
    push({ k: 'ember', x: rnd(0, W), y: H + 8, vx: rnd(-8, 8), vy: rnd(-26, -60) * (0.7 + heat),
      life: rnd(2.5, 5), t: 0, r: rnd(0.8, 2.2), col, flick: rnd(2, 6) });
  }
  function spawnMote() {
    push({ k: 'mote', x: rnd(0, W), y: rnd(0, H), vx: rnd(-4, 4), vy: rnd(-7, -2),
      life: rnd(4, 8), t: 0, r: rnd(0.6, 1.6), col: Math.random() < 0.7 ? GOLD : TEAL });
  }
  // Falling crimson hieroglyphs — the temple wall come loose.
  const CARNELIAN = [216, 71, 46];
  function spawnGlyph() {
    const glyphs = PS.GLYPHS || ['☥'];
    const size = rnd(14, 30);
    push({ k: 'glyph', ch: glyphs[Math.floor(Math.random() * glyphs.length)],
      x: rnd(8, W - 8), y: -size, vx: rnd(-5, 5), vy: rnd(22, 52) * (size / 22),
      size, life: (H + size * 2) / (rnd(22, 52) * (size / 22)) + 1,
      t: 0, sway: rnd(0.4, 1.4), ph: rnd(0, TAU) });
  }
  function spawnBolt(x1, y1, x2, y2, col) {
    const pts = [[x1, y1]];
    const seg = 7;
    for (let i = 1; i < seg; i++) {
      const t = i / seg;
      pts.push([lerp(x1, x2, t) + rnd(-16, 16), lerp(y1, y2, t) + rnd(-10, 10)]);
    }
    pts.push([x2, y2]);
    push({ k: 'bolt', pts, t: 0, life: 0.22, col: col || WHITE });
  }
  function flash(col, a) { push({ k: 'flash', t: 0, life: 0.3, col, a: a || 0.22 }); }

  const pileXY = () => [W / 2, H * 0.46];

  /* ---- public events ------------------------------------------------------- */
  function addTension(x) { tension = Math.max(0, Math.min(1, tension + x)); }

  function cardPlayed(mine) {
    if (!ctx || mode !== 'table') return;
    const [x, y] = pileXY();
    addTension(0.035);
    spawnRing(x, y, mine ? GOLD : BLUE, 70 + tension * 50, 2);
    spawnSparks(x, y, 4 + Math.round(tension * 8), mine ? GOLD : BLUE, 80, false);
  }
  function slapOpen() {
    if (!ctx || mode !== 'table') return;
    const [x, y] = pileXY();
    addTension(0.16);
    flash(GOLD, 0.1);
    spawnSparks(x, y, 18, WHITE, 200, true);
    spawnRing(x, y, WHITE, 130, 3.5);
  }
  function faceChallenge() {
    if (!ctx || mode !== 'table') return;
    addTension(0.12);
    for (let i = 0; i < 8; i++) spawnEmber(1);
    spawnRing(...pileXY(), RED, 110, 3);
  }
  function pileWon(mine) {
    if (!ctx || mode !== 'table') return;
    const [x, y] = pileXY();
    spawnRing(x, y, mine ? GOLD : RED, 170, 4);
    spawnSparks(x, y, 26, mine ? GOLD : RED, 240, false);
    // the payout — coins leap from the pile and rain back down
    const AMBER = [232, 178, 60];
    for (let i = 0; i < (mine ? 14 : 7); i++) {
      const a = rnd(-Math.PI * 0.8, -Math.PI * 0.2);
      const v = rnd(140, 300);
      push({ k: 'coin', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        g: 520, life: rnd(0.8, 1.3), t: 0, r: rnd(2.2, 3.8),
        col: Math.random() < 0.6 ? GOLD : AMBER });
    }
    flash(mine ? GOLD : RED, 0.16);
    tension = Math.max(0.12, tension - 0.35);   // release, but never fully cold
  }
  function falseSlap() {
    if (!ctx || mode !== 'table') return;
    spawnSparks(...pileXY(), 10, [120, 120, 140], 90, false);
  }

  // Charged play specials — 'basic' is everyone's; the rest are rare drops.
  const SPECIALS = {
    basic(x, y) {
      spawnRing(x, y, GOLD, 120, 3);
      spawnSparks(x, y, 16, GOLD, 180, false);
      flash(GOLD, 0.08);
    },
    comet(x, y) {
      flash(GOLD, 0.14);
      for (let i = 0; i < 14; i++)
        push({ k: 'spark', x: x - 140 + i * 10, y: y - 170 + i * 11, vx: 220, vy: 180,
          g: 0, life: 0.5, t: i * 0.014, r: 3 - i * 0.12, col: i < 4 ? WHITE : GOLD });
      spawnRing(x, y, GOLD, 150, 4);
      spawnSparks(x, y, 24, GOLD, 260, false);
    },
    storm(x, y) {
      flash(BLUE, 0.3);
      spawnBolt(rnd(20, W - 20), 0, x, y, WHITE);
      spawnBolt(rnd(20, W - 20), 0, x, y, BLUE);
      spawnSparks(x, y, 30, BLUE, 280, false);
      spawnRing(x, y, BLUE, 160, 4);
    },
    tide(x, y) {
      flash(TEAL, 0.22);
      for (let i = 0; i < 26; i++) {
        push({ k: 'spark', x: -20, y: y - 80 + Math.random() * 160, vx: 380 + Math.random() * 160,
          vy: Math.sin(i) * 30, g: 0, life: 0.7, t: i * 0.012, r: 2 + Math.random() * 2.4,
          col: i % 3 ? TEAL : WHITE });
      }
      spawnRing(x, y, TEAL, 150, 4);
    },
    nova(x, y) {
      flash(WHITE, 0.4);
      spawnRing(x, y, WHITE, 200, 5);
      spawnRing(x, y, GOLD, 150, 4);
      spawnSparks(x, y, 40, WHITE, 320, false);
      spawnSparks(x, y, 20, VIOLET, 220, false);
    },
    sands(x, y) {
      flash([216, 180, 110], 0.14);
      for (let i = 0; i < 40; i++) {
        const a = rnd(0, TAU), r0 = rnd(30, 130);
        push({ k: 'swirl', x, y, a, r: r0, va: rnd(2.4, 4.2), vr: -rnd(40, 90),
          life: rnd(0.6, 1.1), t: 0, rad: rnd(0.8, 2), col: [216, 180, 110] });
      }
    },
  };
  function special(name) {
    if (!ctx || !SPECIALS[name]) return;
    addTension(0.22);
    SPECIALS[name](...pileXY());
  }

  /* ---- the loop ------------------------------------------------------------ */
  function setMode(m) {
    mode = m;
    if (m === null) { tension = 0; setShake(0); }
    if (m === 'table') tension = Math.max(tension, 0.08);
    kick();
  }
  function reset() { tension = 0; parts = []; setShake(0); }
  function kick() { if (ctx && mode && !raf) { lastT = 0; raf = requestAnimationFrame(tick); } }
  function setShake(lvl) {
    if (reduced) lvl = 0;
    if (lvl === shakeLvl || !phone) return;
    phone.classList.remove('tremor1', 'tremor2');
    if (lvl > 0) phone.classList.add('tremor' + lvl);
    shakeLvl = lvl;
  }

  function tick(ts) {
    raf = 0;
    if (!ctx || !mode) { if (ctx) ctx.clearRect(0, 0, W * DPR, H * DPR); return; }
    if (!lastT) lastT = ts;
    const dt = Math.min(0.05, (ts - lastT) / 1000); lastT = ts;

    // tension decay + tremor thresholds
    if (mode === 'table') {
      tension = Math.max(0, tension - dt * 0.025);
      setShake(tension > 0.82 ? 2 : tension > 0.55 ? 1 : 0);
    } else setShake(0);

    // ambient spawns
    if (mode === 'table') {
      const rate = 1 + tension * 9;                       // embers/sec
      if (Math.random() < rate * dt) spawnEmber(tension);
      if (tension > 0.8 && Math.random() < dt * 2) {      // stray sparks fly
        spawnSparks(rnd(W * 0.2, W * 0.8), rnd(H * 0.3, H * 0.6), 5, RED, 150, true);
      }
    } else if (mode === 'home') {
      if (Math.random() < dt * 3) spawnMote();
      if (Math.random() < dt * 1.1) spawnGlyph();
    } else if (mode === 'auth') {
      if (Math.random() < dt * 2.2) spawnGlyph();
    }

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // falling glyphs draw in normal blend so the red stays deep, not neon
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.k !== 'glyph') continue;
      p.t += dt;
      p.x += (p.vx + Math.sin(ts / 900 + p.ph) * p.sway * 6) * dt;
      p.y += p.vy * dt;
      if (p.y > H + p.size * 2 || p.t >= p.life) { parts.splice(i, 1); continue; }
      const fadeIn = Math.min(1, p.t * 2.5);
      const a = 0.34 * fadeIn;
      ctx.font = p.size + 'px "Noto Sans Egyptian Hieroglyphs", serif';
      ctx.fillStyle = 'rgba(' + CARNELIAN[0] + ',' + CARNELIAN[1] + ',' + CARNELIAN[2] + ',' + a.toFixed(3) + ')';
      ctx.fillText(p.ch, p.x, p.y);
    }

    if (mode === 'auth') { raf = requestAnimationFrame(tick); return; } // rain only

    // breathing glow behind the pile / hero — heat shifts gold → carnelian
    const [gx, gy] = mode === 'table' ? pileXY() : [W / 2, H * 0.55];
    const heat = mode === 'table' ? tension : 0.18 + 0.06 * Math.sin(ts / 1400);
    const col = [
      Math.round(lerp(GOLD[0], RED[0], heat)),
      Math.round(lerp(GOLD[1], RED[1], heat)),
      Math.round(lerp(GOLD[2], RED[2], heat)),
    ];
    const pulse = 1 + 0.06 * Math.sin(ts / (mode === 'table' ? lerp(900, 280, heat) : 1600));
    const R = (mode === 'table' ? lerp(110, 230, heat) : 150) * pulse;
    const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, R);
    grad.addColorStop(0, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (mode === 'table' ? 0.05 + heat * 0.20 : 0.07) + ')');
    grad.addColorStop(1, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0)');
    ctx.fillStyle = grad;
    ctx.fillRect(gx - R, gy - R, R * 2, R * 2);

    // particles (additive)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.k === 'glyph') continue;   // already drawn (normal blend)
      p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      const k = p.t / p.life, fade = 1 - k;
      const c = p.col || GOLD;
      if (p.k === 'spark' || p.k === 'ember' || p.k === 'mote' || p.k === 'coin') {
        if (p.t > 0) {
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.k === 'spark' || p.k === 'coin') p.vy += (p.g || 0) * dt;
        }
        let a = fade;
        if (p.k === 'ember') a *= 0.5 + 0.5 * Math.sin(p.t * p.flick * TAU);
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a * 0.9).toFixed(3) + ')';
        ctx.arc(p.x, p.y, p.r * (p.k === 'spark' ? fade : 1), 0, TAU);
        ctx.fill();
      } else if (p.k === 'swirl') {
        p.a += p.va * dt; p.r += p.vr * dt;
        const sx = p.x + Math.cos(p.a) * Math.max(0, p.r), sy = p.y + Math.sin(p.a) * Math.max(0, p.r) * 0.6;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (fade * 0.8).toFixed(3) + ')';
        ctx.arc(sx, sy, p.rad, 0, TAU);
        ctx.fill();
      } else if (p.k === 'ring') {
        const r = p.maxR * (1 - fade * fade);
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (fade * 0.7).toFixed(3) + ')';
        ctx.lineWidth = p.w * fade;
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.stroke();
      } else if (p.k === 'bolt') {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + fade.toFixed(3) + ')';
        ctx.lineWidth = 2.2 * fade + 0.6;
        p.pts.forEach((pt, j) => j ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1]));
        ctx.stroke();
      } else if (p.k === 'flash') {
        ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (p.a * fade).toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    raf = requestAnimationFrame(tick);
  }

  PS.VFX = {
    boot, setMode, reset, addTension,
    cardPlayed, slapOpen, faceChallenge, pileWon, falseSlap, special,
    get tension() { return tension; },
  };
})(window.PS);
