/* ============================================================================
 * fb-api.js — Client API + gate d'authentification pour le back-office.
 *
 * Câble la SPA sur les endpoints /bo/<role>/… de l'API Franchise Buddy :
 *   - fetch avec credentials:'include'  (cookie de session HttpOnly du BO) ;
 *   - header X-CSRF-Token sur toute mutation (jeton renvoyé au login) ;
 *   - 401 → redirection vers le login DU BON back-office ;
 *   - gate : masque l'app tant que la session n'est pas confirmée.
 *
 * Dépend de app/config.js (window.FB_CONFIG = { role, apiBase, appUrl }).
 * Sur la page de login, définir `window.FB_GATE = false` AVANT ce script.
 * ========================================================================== */
(function () {
  var cfg = window.FB_CONFIG || {};
  var ROLE = cfg.role;
  var qs = new URLSearchParams(location.search);

  // Base API : ?api=… (test) > localStorage.FB_API_BASE > config.apiBase > '' (même origine).
  var apiOverride = qs.get('api');
  if (apiOverride === null) apiOverride = localStorage.getItem('FB_API_BASE');
  var API = ((apiOverride != null ? apiOverride : (cfg.apiBase || '')) + '').replace(/\/+$/, '');
  var BASE = API + '/bo/' + ROLE;
  var CSRF_KEY = 'FB_CSRF_' + ROLE;
  var carry = apiOverride != null ? ('?api=' + encodeURIComponent(apiOverride)) : '';

  function getCsrf() { return sessionStorage.getItem(CSRF_KEY) || ''; }
  function setCsrf(t) { if (t) sessionStorage.setItem(CSRF_KEY, t); }

  function toLogin() { location.replace('login.html' + carry); }
  function toApp()   { location.replace((cfg.appUrl || 'index.html') + carry); }

  async function req(method, path, body) {
    var headers = { 'Accept': 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && method !== 'HEAD') headers['X-CSRF-Token'] = getCsrf();
    var res;
    try {
      res = await fetch(BASE + path, {
        method: method,
        credentials: 'include',            // ← envoie le cookie de session du BO
        headers: headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      var ne = new Error('Réseau indisponible'); ne.network = true; throw ne;
    }
    // 401 sur une route protégée ⇒ session perdue ⇒ login du bon BO.
    // On exclut /me (utilisé par le gate) et /login (erreur affichée en place).
    if (res.status === 401 && path !== '/me' && path !== '/login') { toLogin(); throw new Error('unauthorized'); }
    var data = null; try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      var err = new Error((data && data.error) || ('HTTP ' + res.status));
      err.status = res.status; err.data = data; throw err;
    }
    return data;
  }

  var FB = {
    role: ROLE,
    apiBase: API,
    base: BASE,
    user: null,
    scope: null,
    getCsrf: getCsrf,
    toLogin: toLogin,

    /** Session courante (identité + portée). Ne redirige pas (utilisé par le gate). */
    async me() {
      var d = await req('GET', '/me');
      setCsrf(d && d.csrf);
      FB.user = d && d.user;
      FB.scope = d && d.user && d.user.shops || null;
      return d;
    },
    async login(email, password) {
      var d = await req('POST', '/login', { email: email, password: password });
      setCsrf(d && d.csrf);
      FB.user = d && d.user;
      return d;
    },
    async logout() {
      try { await req('POST', '/logout'); } catch (e) { /* on efface localement de toute façon */ }
      sessionStorage.removeItem(CSRF_KEY);
      toLogin();
    },
    get: function (path) { return req('GET', path); },
    post: function (path, body) { return req('POST', path, body); },
  };
  window.FB = FB;

  // Déconnexion via URL : …?logout=1
  if (qs.get('logout') === '1') { FB.logout(); return; }

  /* ── Gate : sur la page applicative, on masque le corps tant que la session
     n'est pas confirmée ; sinon on redirige vers le login du BO. ── */
  if (window.FB_GATE !== false) {
    var st = document.createElement('style');
    st.textContent = 'html.fb-gating body{visibility:hidden!important}';
    document.head.appendChild(st);
    document.documentElement.classList.add('fb-gating');
    FB.me()
      .then(function () { document.documentElement.classList.remove('fb-gating'); })
      .catch(function () { toLogin(); });
  }
})();
