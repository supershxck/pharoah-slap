/* ============================================================================
   Pharaoh Slap — AUTH (accounts veil, JWT/localStorage, routing)
   Ported from v6.2 and adapted to v7's PS module + screen router.
   Talks to the REST API in auth.js on the server (/api/register|login|me).
   ========================================================================== */
window.PS = window.PS || {};
(function (PS) {
  'use strict';
  const { $ } = PS;
  const TOKEN_KEY = 'ps_token';

  let currentUser = null;     // null = guest / not signed in
  let mode = 'login';         // 'login' | 'register'

  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
  const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

  async function api(pathName, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const tok = getToken();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    const res = await fetch(pathName, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data };
  }

  const getUser = () => currentUser;
  const setUserData = (u) => { if (u) { currentUser = u; applyUser(u); } };

  // Mirror the signed-in identity onto the home/profile surfaces.
  function applyUser(u) {
    if (!u) return;
    PS.USER = u;
    PS.PROFILE.name = u.username || PS.PROFILE.name;
    if (PS.COSMO) PS.COSMO.syncFromUser(u);   // xp/level/packs/cosmetics
  }

  function setMode(m) {
    mode = m;
    $('#tab-login').classList.toggle('sel', m === 'login');
    $('#tab-register').classList.toggle('sel', m === 'register');
    $('#auth-submit').textContent = m === 'register' ? 'Claim Your Name' : 'Enter the Temple';
    $('#auth-pass').setAttribute('autocomplete', m === 'register' ? 'new-password' : 'current-password');
    showErr('');
  }
  function showErr(msg) { $('#auth-err').textContent = msg || ''; }

  // Where to send the player once authenticated.
  function routeAfterAuth() {
    const u = currentUser;
    if (u && !u.tutorialPath && PS.WEIGHING) { PS.WEIGHING.start(u); return; }
    enterApp();
  }

  function enterApp() {
    if (currentUser) applyUser(currentUser);
    PS.renderHome();
    PS.showScreen('home');
  }

  async function submit() {
    const username = $('#auth-user').value.trim();
    const passcode = $('#auth-pass').value;
    if (!username || !passcode) { showErr('Enter a name and passcode.'); return; }
    const btn = $('#auth-submit');
    btn.disabled = true; showErr('');
    try {
      const route = mode === 'register' ? '/api/register' : '/api/login';
      const { ok, data } = await api(route, { method: 'POST', body: { username, passcode } });
      if (!ok) { showErr(data.message || data.error || 'Something went wrong.'); btn.disabled = false; return; }
      setToken(data.token);
      currentUser = data.user;
      applyUser(currentUser);
      $('#auth-pass').value = '';
      routeAfterAuth();
    } catch (e) {
      showErr('Network error — is the server awake?');
    } finally {
      btn.disabled = false;
    }
  }

  // Invoked by The Weighing once a path has been assigned → drop onto the ladder.
  function completeWeighing(updatedUser) {
    if (updatedUser) { currentUser = updatedUser; applyUser(currentUser); }
    enterApp();
    if (PS.LADDER) PS.LADDER.open();
  }

  function logout() {
    setToken(null);
    currentUser = null;
    PS.PROFILE.name = 'Wanderer';
    if (PS.COSMO) PS.COSMO.loadGuest();   // back to the guest-local economy
    $('#auth-user').value = '';
    $('#auth-pass').value = '';
    setMode('login');
    PS.showScreen('auth');
  }

  // Skip accounts entirely and play locally vs AI (keeps v7 usable offline).
  function playGuest() {
    currentUser = null;
    enterApp();
  }

  async function boot() {
    $('#tab-login').onclick = () => setMode('login');
    $('#tab-register').onclick = () => setMode('register');
    $('#auth-submit').onclick = submit;
    const guest = $('#auth-guest');
    if (guest) guest.onclick = playGuest;
    $('#auth-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    $('#auth-user').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#auth-pass').focus(); });
    setMode('login');

    // Auto-login if a stored token still validates.
    if (getToken()) {
      try {
        const { ok, data } = await api('/api/me');
        if (ok && data.user) { currentUser = data.user; applyUser(currentUser); routeAfterAuth(); return; }
      } catch (e) { /* server asleep/offline — fall through to the veil */ }
      setToken(null);
    }
    PS.showScreen('auth');
    const uf = $('#auth-user'); if (uf) uf.focus();
  }

  PS.AUTH = { boot, getUser, setUserData, getToken, api, logout, routeAfterAuth, completeWeighing, enterApp };
})(window.PS);
