/* ============================================================================
   Pharaoh Slap — The Weighing (3-trial onboarding)
   Ported from v6.2. Produces { slapSpeed, memoryScore, priorExperience },
   POSTs to /api/onboarding; the server assigns the (hidden) path.
   ========================================================================== */
window.PS = window.PS || {};
(function (PS) {
  'use strict';
  const { $ } = PS;

  const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const SUITS = [
    { s: '♠', c: 'black' }, { s: '♣', c: 'black' },
    { s: '♥', c: 'red' },   { s: '♦', c: 'red' },
  ];
  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rnd(arr.length)];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  const stage = () => $('#weigh-stage');
  let timers = [];
  let keyHandler = null;
  const result = {};
  const after = (ms, fn) => timers.push(setTimeout(fn, ms));
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  function setHead(eyebrow, title, sub) {
    $('#weigh-eyebrow').textContent = eyebrow;
    $('#weigh-title').textContent = title;
    $('#weigh-sub').textContent = sub;
  }
  function setDots(i) { [0, 1, 2].forEach((d) => $('#weigh-dot' + d).classList.toggle('on', d <= i)); }
  function cardEl(rank, suit, faceDown) {
    const d = document.createElement('div');
    d.className = 'wcard ' + (faceDown ? 'down' : suit.c);
    d.textContent = faceDown ? '' : rank + suit.s;
    return d;
  }

  /* ── Trial I — Instinct (the Feel Test) ─────────────────────────────────── */
  function trialInstinct() {
    setDots(0);
    setHead('Trial I', 'Instinct', 'A pile falls. Trust your hand.');
    stage().innerHTML = '';
    const pile = document.createElement('div'); pile.className = 'weigh-pile';
    const zone = document.createElement('div'); zone.className = 'weigh-slapzone'; zone.textContent = '…';
    stage().append(pile, zone);

    const a = pick(RANKS);
    let b = pick(RANKS); while (b === a) b = pick(RANKS);
    const dbl = pick(RANKS);
    const deal = [
      { r: a, s: pick(SUITS) }, { r: b, s: pick(SUITS) },
      { r: dbl, s: pick(SUITS) }, { r: dbl, s: pick(SUITS) }, // completes the double
    ];

    let armed = false, doubleAt = 0, done = false;
    const finish = (token) => {
      if (done) return; done = true;
      clearTimers();
      if (keyHandler) window.removeEventListener('keydown', keyHandler);
      keyHandler = null;
      zone.removeEventListener('click', onSlap);
      result.slapSpeed = token;
      after(260, trialMemory);
    };
    const onSlap = () => {
      if (!armed) return; // pre-double strikes ignored
      const dt = performance.now() - doubleAt;
      finish(dt < 600 ? 'instinctive' : dt < 1500 ? 'cautious' : 'observant');
    };
    keyHandler = (e) => { if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); onSlap(); } };
    window.addEventListener('keydown', keyHandler);
    zone.addEventListener('click', onSlap);

    deal.forEach((c, i) => {
      after(i * 620, () => {
        const el = cardEl(c.r, c.s, false);
        el.style.transform = 'translateX(' + ((i - 1.5) * 14) + 'px) rotate(' + ((i - 1.5) * 3) + 'deg)';
        pile.appendChild(el);
        if (i === deal.length - 1) {
          doubleAt = performance.now(); armed = true;
          zone.classList.add('armed'); zone.textContent = '▲ strike ▲';
          after(2500, () => finish('observant'));
        }
      });
    });
  }

  /* ── Trial II — Memory ──────────────────────────────────────────────────── */
  function trialMemory() {
    setDots(1);
    setHead('Trial II', 'Memory', 'Watch closely…');
    stage().innerHTML = '';
    const pile = document.createElement('div'); pile.className = 'weigh-pile';
    stage().append(pile);

    const distinct = shuffle(RANKS.slice()).slice(0, 4);
    const dup = pick(distinct);
    const seq = shuffle(distinct.concat([dup])).map((r) => ({ r, s: pick(SUITS) }));

    seq.forEach((c, i) => { after(i * 760, () => { pile.innerHTML = ''; pile.appendChild(cardEl(c.r, c.s, false)); }); });
    const tEnd = seq.length * 760;
    after(tEnd, () => { pile.innerHTML = ''; pile.appendChild(cardEl('', null, true)); });
    after(tEnd + 520, () => askMemory(distinct, dup));
  }

  function askMemory(distinct, dup) {
    setHead('Trial II', 'Memory', 'Which value appeared twice?');
    stage().innerHTML = '';
    const choices = document.createElement('div'); choices.className = 'weigh-choices';
    const asked = performance.now();
    shuffle(distinct.slice()).forEach((r) => {
      const b = document.createElement('button'); b.className = 'weigh-choice'; b.textContent = r;
      b.onclick = () => {
        const dt = performance.now() - asked;
        const correct = r === dup;
        result.memoryScore = !correct ? 'needs_reinforcement' : (dt < 4000 ? 'strong' : 'average');
        trialExperience();
      };
      choices.appendChild(b);
    });
    stage().appendChild(choices);
  }

  /* ── Trial III — Experience ─────────────────────────────────────────────── */
  function trialExperience() {
    setDots(2);
    setHead('Trial III', 'Experience', 'Have you played a card slap game before?');
    stage().innerHTML = '';
    const choices = document.createElement('div'); choices.className = 'weigh-choices';
    [['Yes', 'yes'], ['No', 'no'], ['Something like it', 'something_like_it']].forEach(([label, val]) => {
      const b = document.createElement('button'); b.className = 'weigh-choice'; b.textContent = label;
      b.onclick = () => { result.priorExperience = val; finishWeighing(); };
      choices.appendChild(b);
    });
    stage().appendChild(choices);
  }

  /* ── Submit ─────────────────────────────────────────────────────────────── */
  async function finishWeighing() {
    setHead('', 'Anubis weighs your soul…', '');
    stage().innerHTML = '';
    let updated = null;
    for (let attempt = 0; attempt < 2 && !updated; attempt++) {
      try {
        const { ok, data } = await PS.AUTH.api('/api/onboarding', {
          method: 'POST',
          body: { slapSpeed: result.slapSpeed, memoryScore: result.memoryScore, priorExperience: result.priorExperience },
        });
        if (ok && data.user) updated = data.user;
      } catch (e) { /* retry once */ }
    }
    setHead('', 'The scales settle.', '');
    after(850, () => PS.AUTH.completeWeighing(updated));
  }

  function start() {
    Object.keys(result).forEach((k) => delete result[k]);
    clearTimers();
    PS.showScreen('weighing');
    setHead('The Weighing', 'Three trials await', 'Answer with instinct.');
    setDots(-1);
    after(900, trialInstinct);
  }

  PS.WEIGHING = { start };
})(window.PS);
