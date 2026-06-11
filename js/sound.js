/* ============================================================================
   Pharaoh Slap — SFX (synthesized WebAudio, zero assets)
   Casino-warm: soft card ticks, deep slap thumps, coin cascades on payouts.
   Honors PS.tweaks.sound. Unlocks on first user gesture (mobile autoplay).
   ========================================================================== */
window.PS = window.PS || {};
(function (PS) {
  'use strict';

  let actx = null;
  function audio() {
    if (PS.tweaks && PS.tweaks.sound === false) return null;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch (e) { return null; }
  }
  // mobile: contexts start locked until a gesture
  try {
    const unlock = () => { audio(); };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  } catch (e) {}

  function env(g, t, att, dec, peak) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + att + dec);
  }
  function tone(a, freq, t, dur, type, peak, slideTo) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    o.connect(g); g.connect(a.destination);
    env(g, t, 0.004, dur, peak || 0.2);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(a, dur) {
    const n = Math.floor(a.sampleRate * dur);
    const b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = a.createBufferSource(); s.buffer = b; return s;
  }
  const vib = (p) => { try { if (PS.tweaks.sound !== false && navigator.vibrate) navigator.vibrate(p); } catch (e) {} };

  const SFX = {
    // soft felt-table card flip
    card() {
      const a = audio(); if (!a) return;
      const t = a.currentTime;
      const ns = noise(a, 0.05), hp = a.createBiquadFilter(), g = a.createGain();
      hp.type = 'bandpass'; hp.frequency.value = 2400; hp.Q.value = 0.8;
      ns.connect(hp); hp.connect(g); g.connect(a.destination);
      env(g, t, 0.002, 0.05, 0.10);
      ns.start(t); ns.stop(t + 0.07);
    },
    // tiny cue when a slap window opens (kept subtle — not a giveaway klaxon)
    cue() {
      const a = audio(); if (!a) return;
      tone(a, 1180, a.currentTime, 0.05, 'sine', 0.05);
    },
    // the slap itself — palm on stone
    slap() {
      const a = audio(); if (!a) return;
      const t = a.currentTime;
      const ns = noise(a, 0.16), lp = a.createBiquadFilter(), g = a.createGain();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1700, t);
      lp.frequency.exponentialRampToValueAtTime(160, t + 0.15);
      ns.connect(lp); lp.connect(g); g.connect(a.destination);
      env(g, t, 0.002, 0.15, 0.8);
      ns.start(t); ns.stop(t + 0.18);
      tone(a, 140, t, 0.16, 'sine', 0.6);
      tone(a, 65, t, 0.22, 'sine', 0.45);
      vib(30);
    },
    // casino payout: a cascade of little gold coins
    coins(n) {
      const a = audio(); if (!a) return;
      const t = a.currentTime;
      const count = Math.min(10, Math.max(3, n || 6));
      for (let i = 0; i < count; i++) {
        const f = 1500 + Math.random() * 1400;
        tone(a, f, t + 0.05 + i * 0.045 + Math.random() * 0.02, 0.09, 'triangle', 0.10);
        tone(a, f * 1.51, t + 0.05 + i * 0.045, 0.05, 'sine', 0.05);
      }
    },
    // your slap landed — thump + shimmer + coins
    win(big) {
      SFX.slap();
      const a = audio(); if (!a) return;
      const t = a.currentTime;
      [660, 880, 1108].forEach((f, i) => tone(a, f, t + 0.07 + i * 0.055, 0.22, 'triangle', 0.14));
      SFX.coins(big ? 10 : 6);
      vib([0, 35, 25, 55]);
    },
    // false slap — dull buzz, no drama
    bad() {
      const a = audio(); if (!a) return;
      const t = a.currentTime;
      tone(a, 200, t, 0.28, 'sawtooth', 0.22, 65);
      vib(60);
    },
    // a face card demands tribute — low temple drum
    tribute() {
      const a = audio(); if (!a) return;
      const t = a.currentTime;
      tone(a, 92, t, 0.3, 'sine', 0.5, 48);
      tone(a, 46, t + 0.02, 0.34, 'triangle', 0.3);
    },
    // drama meter just filled
    charge() {
      const a = audio(); if (!a) return;
      tone(a, 300, a.currentTime, 0.35, 'sine', 0.16, 1200);
    },
    // charged special landing
    boom() {
      const a = audio(); if (!a) return;
      const t = a.currentTime;
      const ns = noise(a, 0.5), lp = a.createBiquadFilter(), g = a.createGain();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(800, t);
      lp.frequency.exponentialRampToValueAtTime(60, t + 0.45);
      ns.connect(lp); lp.connect(g); g.connect(a.destination);
      env(g, t, 0.003, 0.5, 0.9);
      ns.start(t); ns.stop(t + 0.55);
      tone(a, 52, t, 0.45, 'sine', 0.7);
      for (let i = 0; i < 4; i++) tone(a, 500 + Math.random() * 1500, t + 0.03 + Math.random() * 0.15, 0.05, 'square', 0.06);
      vib([0, 40, 30, 70]);
    },
    // victory fanfare
    fanfare() {
      const a = audio(); if (!a) return;
      const t = a.currentTime;
      [523, 659, 784, 1047].forEach((f, i) => tone(a, f, t + i * 0.09, 0.4, 'triangle', 0.22));
      SFX.coins(10);
      vib([0, 40, 30, 70, 40]);
    },
    // soft UI click
    click() {
      const a = audio(); if (!a) return;
      tone(a, 520, a.currentTime, 0.04, 'square', 0.07);
    },
  };

  PS.SFX = SFX;
})(window.PS);
