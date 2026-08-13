/* =====================================================================
   api-config.js — résolution de l'API pour la Console franchisé
   =====================================================================
   Même convention que le WebShop et la Console marque (franchisor) :
   l'API PHP est servie en same-origin. Le franchisé vit à
   <origin>/webshop/backoffice_franchisee/  →  l'API partagée est à
   <origin>/webshop/api  (les MÊMES endpoints/base que le webshop, le
   franchisee et le franchisor : donnée partagée = source unique).

   • Sur *.github.io ou si l'API ne répond pas → mode démo (seed data.json).
   • Le jeton admin est partagé par origine (localStorage 'adminToken'),
     donc si l'admin s'est connecté au back-office webshop / franchisor,
     le franchisé le réutilise automatiquement.
   • Portée boutique (le franchisé est mono-boutique) : ?shop=<id>, un ID
     NUMÉRIQUE et lui seul, mémorisé (localStorage 'franchiseeShop'). Réseau si
     absent. La liste des id est servie par /shops (public).
   • Overrides de test :  ?api=<baseUrl>  et  ?token=<adminToken>.
   ===================================================================== */
(function () {
  var onGitHubPages = /\.github\.io$/i.test(location.hostname);

  // Base du webshop : on retire le segment /backoffice_franchisee/... pour
  // retomber sur .../webshop, puis on ajoute /api.
  var path = location.pathname;
  var m = path.match(/^(.*?)\/backoffice_franchisee(?:\/|$)/);
  var webshopBase = m ? m[1] : path.replace(/[^/]*$/, '').replace(/\/$/, '');
  var base = onGitHubPages ? null : (location.origin + webshopBase + '/api');

  var token = '';
  try { token = localStorage.getItem('adminToken') || ''; } catch (e) {}

  // Portée boutique : UN ID, et rien d'autre. Le slug était accepté puis résolu
  // en id par /franchisee/me : selon le chemin, la valeur mémorisée était
  // tantôt « anderlecht », tantôt « 2 », pour désigner la même boutique. Une
  // valeur mémorisée qui n'est pas un id est donc PURGÉE — la garder ferait
  // repartir la console en portée réseau à chaque ouverture, sans le dire.
  var isId = function (v) { return /^[0-9]+$/.test(String(v || '')); };
  var shop = '';
  try {
    shop = localStorage.getItem('franchiseeShop') || '';
    if (shop && !isId(shop)) {
      // Même prudence qu'au paramètre d'URL : la valeur mémorisée a pu être
      // écrite depuis une adresse mal formée et contenir un jeton.
      window.__SHOPPURGED = String(shop).replace(/(token|pin|secret|key|pass)[=:][^&\s]*/gi, '$1=***').slice(0, 24);
      shop = '';
      localStorage.removeItem('franchiseeShop');
    }
  } catch (e) {}

  // Overrides explicites par query (tests / première connexion).
  try {
    var q = new URLSearchParams(location.search);

    /* ── Séparateur fautif : réparé, pas deviné ──────────────────────────
       Vu deux fois en production : « ?shop=2?/token=… » au lieu de
       « ?shop=2&token=… ». Le second « ? » n'est pas un séparateur : TOUT ce
       qui suit devient la valeur de ?shop=, et la console repart sans portée
       NI session — écrans vides, cartes sans boutique, et le jeton affiché
       dans le bandeau tant qu'il n'était pas rédigé.

       Rien n'est inventé ici : l'id et le jeton sont l'un et l'autre écrits
       dans l'adresse, on se contente de les lire là où ils se trouvent. La
       réparation ne s'applique qu'à cette forme sans ambiguïté — des chiffres,
       puis un caractère de séparation d'URL. Un ?shop= non numérique reste
       refusé, comme avant : c'est le SLUG qu'on ne devine pas, pas une
       ponctuation mal placée.

       L'adresse de la barre est réécrite au passage (par le retrait du jeton,
       juste dessous) : un favori enregistré ensuite part d'une URL valide. */
    var brut = q.get('shop');
    var rep = brut && String(brut).match(/^([0-9]+)[?&\/]+(.+)$/);
    if (rep) {
      q.set('shop', rep[1]);
      try {
        var reste = new URLSearchParams(String(rep[2]).replace(/^\/+/, ''));
        reste.forEach(function (v, k) { if (!q.get(k)) q.set(k, v); });
      } catch (e) {}
      window.__SHOPFIXEDSEP = true;
    }

    if (q.get('api'))   base  = q.get('api');
    if (q.get('token')) { token = q.get('token'); try { localStorage.setItem('adminToken', token); } catch (e) {}
      // Le jeton ne doit pas rester dans l'URL (historique navigateur, logs
      // serveur, copier-coller de lien) : on le retire une fois mémorisé.
      try { q.delete('token'); var qs = q.toString();
        history.replaceState({}, '', location.pathname + (qs ? '?' + qs : '') + location.hash); } catch (e) {}
    }
    if (q.get('shop')) {
      var qs2 = q.get('shop');
      if (isId(qs2)) { shop = qs2; try { localStorage.setItem('franchiseeShop', shop); } catch (e) {} }
      // Un ?shop= non numérique n'est pas deviné : on le signale au lieu de
      // basculer en portée réseau comme si de rien n'était.
      //
      // La valeur est REDIGÉE avant d'être conservée. Vu en production : une
      // adresse écrite « ?shop=2?/token=<jeton> » — un second « ? » au lieu
      // d'un « & » — fait entrer le JETON ADMIN dans la valeur de ?shop=, et
      // ce texte finissait affiché en clair dans le bandeau de la carte. Un
      // message d'erreur ne doit jamais recopier ce qu'il a reçu.
      else {
        var vis = String(qs2).replace(/(token|pin|secret|key|pass)[=:][^&\s]*/gi, '$1=***');
        if (vis.length > 24) vis = vis.slice(0, 24) + '…';
        window.__SHOPBADPARAM = vis;
        // Séparateur fautif : la valeur commence par l'id, puis un caractère
        // d'URL. Le cas est assez fréquent pour mériter sa propre phrase — et
        // dans ce cas le jeton n'a pas été lu non plus, donc la console n'a ni
        // portée ni session.
        window.__SHOPBADSEP = /^[0-9]+[?\/&]/.test(String(qs2));
      }
    }
  } catch (e) {}

  window.__FR = { base: base, token: token, shop: shop };

  /* En-têtes d'authentification, source UNIQUE pour tous les appels du BO.
     Le mode tablette (session PIN) a été retiré : la tablette de comptoir
     tourne sous Kitchen, avec son propre appareil et son propre jeton. Ce
     back-office n'a donc plus qu'une identité, le jeton admin ERP. */
  window.FRH = function (extra) {
    var fr = window.__FR || {};
    var h = extra ? Object.assign({}, extra) : {};
    if (fr.token) h['X-Admin-Token'] = fr.token;
    return h;
  };
})();
