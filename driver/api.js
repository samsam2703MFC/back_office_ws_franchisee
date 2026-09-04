/* =====================================================================
   api.js — accès API pour la PWA chauffeur (/webshop/driver)
   =====================================================================
   Même convention que la console franchisé : l'API PHP est servie en
   same-origin. La page vit à <origin>/webshop/driver/ → l'API partagée
   est à <origin>/webshop/api.

   IDENTITÉ : session PIN (bo_pin_session, 12 h), et elle seule. Le jeton
   admin ERP est RÉSEAU — il ouvre toutes les boutiques, il n'a rien à
   faire sur le téléphone d'un chauffeur. La session PIN est bornée par le
   serveur à SA boutique (le ?shop= de l'URL est ignoré) et à SES sections.

   AUCUN REPLI : une lecture qui échoue est une erreur affichée, jamais une
   donnée inventée ni une copie périmée présentée comme fraîche.
   ===================================================================== */
(function () {
  var LS_SES = 'drv_session';
  var LS_ADM = 'drv_admin_token';   // MODE TEST : jeton admin ERP (portée réseau)
  var LS_SHOP = 'drv_shop';         // portée boutique OBLIGATOIRE dans ce mode

  /* ── MODE TEST (« bypass ») ────────────────────────────────────────────
     Tant qu'aucun profil chauffeur n'existe, l'app s'ouvre avec le jeton
     admin passé dans l'URL :  /webshop/driver/?shop=<id>&token=<jeton>.

     Ce jeton est RÉSEAU : il ouvre toutes les boutiques, les marges et les
     réglages. Il n'a rien à faire durablement sur le téléphone d'un
     chauffeur — l'application le dit à l'écran tant qu'il est là, et sait
     l'oublier d'un bouton. Il est retiré de l'adresse dès qu'il est lu
     (historique, logs serveur, lien recopié).

     La PORTÉE BOUTIQUE est exigée dans ce mode : sans ?shop=, le bloc
     /franchisee/* rend le RÉSEAU — un chauffeur verrait les tournées des
     autres boutiques. L'application refuse de démarrer plutôt que de
     montrer ça. */
  (function readUrl() {
    try {
      var q = new URLSearchParams(location.search), dirty = false;
      if (q.get('token')) { localStorage.setItem(LS_ADM, q.get('token')); q.delete('token'); dirty = true; }
      var sh = q.get('shop');
      if (sh && /^[0-9]+$/.test(sh)) localStorage.setItem(LS_SHOP, sh);
      if (dirty) history.replaceState({}, '', location.pathname + (q.toString() ? '?' + q.toString() : '') + location.hash);
    } catch (e) {}
  })();
  function adminToken() { try { return localStorage.getItem(LS_ADM) || ''; } catch (e) { return ''; } }
  function adminShop() { try { return localStorage.getItem(LS_SHOP) || ''; } catch (e) { return ''; } }

  function apiBase() {
    try {
      var q = new URLSearchParams(location.search);
      if (q.get('api')) return q.get('api').replace(/\/$/, '');
    } catch (e) {}
    // .../webshop/driver/(index.html)  →  .../webshop/api
    var p = location.pathname;
    var m = p.match(/^(.*?)\/driver(?:\/|$)/);
    var prefix = m ? m[1] : p.replace(/[^/]*$/, '').replace(/\/$/, '');
    return location.origin + prefix + '/api';
  }

  function readSession() {
    try { var r = localStorage.getItem(LS_SES); return r ? JSON.parse(r) : null; } catch (e) { return null; }
  }
  function writeSession(s) {
    try { s ? localStorage.setItem(LS_SES, JSON.stringify(s)) : localStorage.removeItem(LS_SES); } catch (e) {}
  }

  function headers(extra) {
    var h = extra ? Object.assign({}, extra) : {};
    var adm = adminToken();
    if (adm) { h['X-Admin-Token'] = adm; return h; }   // mode test : le jeton admin prime
    var s = readSession();
    if (s && s.token) h['X-Pin-Token'] = s.token;
    return h;
  }
  /* La portée boutique n'est ajoutée QUE dans le mode test : une session PIN
     est déjà bornée par le serveur, qui ignore le ?shop= de l'URL. */
  function scoped(path) {
    if (!adminToken() || path.indexOf('/franchisee/') !== 0) return path;
    var sh = adminShop(); if (!sh) return path;
    return path + (path.indexOf('?') >= 0 ? '&' : '?') + 'shop=' + encodeURIComponent(sh);
  }

  /* Erreur PARLANTE : le code HTTP seul ne dit rien au chauffeur. 401 =
     session finie (12 h), 403 = section non autorisée sur le compte (c'est
     un réglage de profil, pas une panne), 404 = route absente du serveur. */
  function fail(status, path, body) {
    var srv = (body && (body.error || body.message)) || '';
    var msg;
    if (status === 401) msg = 'Session terminée — reconnecte-toi avec ton PIN.';
    else if (status === 403) msg = srv || ('Accès refusé pour ce compte (' + path + ').');
    else if (status === 404) msg = 'Route absente du serveur : ' + path;
    else if (status === 0) msg = 'Pas de réseau — ' + path;
    else msg = 'Erreur ' + status + (srv ? ' — ' + srv : '') + ' (' + path + ')';
    var e = new Error(msg); e.status = status; e.path = path; return e;
  }

  function req(method, path, body) {
    var url = apiBase() + scoped(path);
    var opt = { method: method, credentials: 'omit', headers: headers(body ? { 'Content-Type': 'application/json' } : null) };
    if (body) opt.body = JSON.stringify(body);
    return fetch(url, opt).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) {
          if (r.status === 401 && !adminToken()) { writeSession(null); }
          throw fail(r.status, path, j);
        }
        return j;
      });
    }, function () { throw fail(0, path, null); });
  }

  /* File d'attente des ÉCRITURES faites hors réseau. Elle ne sert qu'aux
     écritures dont le retard ne fausse rien (prise de tournée). La position
     n'y entre pas : rejouer une position d'il y a vingt minutes placerait le
     camion là où il n'est plus. */
  var LS_Q = 'drv_queue';
  function queue() { try { return JSON.parse(localStorage.getItem(LS_Q) || '[]'); } catch (e) { return []; } }
  function setQueue(q) { try { localStorage.setItem(LS_Q, JSON.stringify(q)); } catch (e) {} }
  function enqueue(path, body) { var q = queue(); q.push({ path: path, body: body, at: Date.now() }); setQueue(q); }
  function flush() {
    var q = queue(); if (!q.length) return Promise.resolve(0);
    var rest = [], done = 0;
    return q.reduce(function (chain, it) {
      return chain.then(function () {
        return req('POST', it.path, it.body).then(function () { done++; }, function (e) {
          if (e.status === 0) rest.push(it);   // réseau : on garde. Refus serveur : on jette, il ne passera jamais.
        });
      });
    }, Promise.resolve()).then(function () { setQueue(rest); return done; });
  }

  window.DRV = {
    base: apiBase,
    session: readSession,
    /* Mode test : présence du jeton admin, portée exigée, et sa sortie. */
    isAdmin: function () { return !!adminToken(); },
    adminShop: adminShop,
    clearAdmin: function () { try { localStorage.removeItem(LS_ADM); } catch (e) {} },
    /* Nom du chauffeur : donné par la session PIN, saisi à la main en mode
       test — il part sur la prise de tournée et la position, donc il ne peut
       pas être deviné. */
    driverName: function (v) {
      try { if (v != null) localStorage.setItem('drv_name', v); return localStorage.getItem('drv_name') || ''; }
      catch (e) { return ''; }
    },
    setSession: writeSession,
    get: function (path) { return req('GET', path, null); },
    post: function (path, body) { return req('POST', path, body); },
    postQueued: function (path, body) {
      return req('POST', path, body).catch(function (e) {
        if (e.status === 0) { enqueue(path, body); return { queued: true }; }
        throw e;
      });
    },
    queueSize: function () { return queue().length; },
    flush: flush,
    /* Connexion : boutique + PIN à 4 chiffres → session de 12 h. */
    login: function (shopId, pin) {
      return req('POST', '/bo/pin-login', { shopId: Number(shopId), pin: String(pin) }).then(function (j) {
        if (!j || !j.token) throw new Error('Réponse de connexion inattendue.');
        writeSession({ token: j.token, nom: j.nom || 'Chauffeur', shopId: j.shopId, sections: j.sections || [],
                       at: Date.now(), ttl: (j.expireDans || 43200) * 1000 });
        return j;
      });
    },
    logout: function () {
      var s = readSession(); writeSession(null);
      if (s && s.token) return fetch(apiBase() + '/bo/pin-logout', { method: 'POST', headers: { 'X-Pin-Token': s.token }, credentials: 'omit' }).catch(function () {});
      return Promise.resolve();
    },
    /* Liste publique des boutiques, pour ne pas faire taper un id de mémoire. */
    shops: function () {
      return fetch(apiBase() + '/shops', { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
    }
  };

  window.addEventListener('online', function () { flush(); });
})();
