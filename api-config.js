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
   • Portée boutique (le franchisé est mono-boutique) : ?shop=<slug|id>,
     mémorisée (localStorage 'franchiseeShop'). Réseau si absente.
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

  var shop = '';
  try { shop = localStorage.getItem('franchiseeShop') || ''; } catch (e) {}

  // Overrides explicites par query (tests / première connexion).
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('api'))   base  = q.get('api');
    if (q.get('token')) { token = q.get('token'); try { localStorage.setItem('adminToken', token); } catch (e) {}
      // Le jeton ne doit pas rester dans l'URL (historique navigateur, logs
      // serveur, copier-coller de lien) : on le retire une fois mémorisé.
      try { q.delete('token'); var qs = q.toString();
        history.replaceState({}, '', location.pathname + (qs ? '?' + qs : '') + location.hash); } catch (e) {}
    }
    if (q.get('shop'))  { shop  = q.get('shop');  try { localStorage.setItem('franchiseeShop', shop); } catch (e) {} }
  } catch (e) {}

  // Session TABLETTE (PIN) : jeton opaque de 12 h posé par /bo/pin-login. Il
  // remplace le jeton admin quand celui-ci est absent — sans lui, la couche
  // données n'envoyait aucune authentification et la tablette n'affichait que
  // des écrans vides (l'API /franchisee/* refusait tout).
  // La boutique de la session fait foi : le serveur ignore le ?shop= d'une
  // session PIN, on aligne donc l'interface dessus.
  var pinToken = '', pinShop = '';
  try {
    var ps = JSON.parse(localStorage.getItem('boPinSession') || 'null');
    if (ps && ps.token) { pinToken = ps.token; if (ps.shopId) pinShop = String(ps.shopId); }
  } catch (e) {}
  if (!token && pinShop) shop = pinShop;

  window.__FR = { base: base, token: token, shop: shop, pinToken: pinToken };

  /* En-têtes d'authentification, source UNIQUE pour tous les appels du BO.
     Jeton admin ERP s'il existe, sinon jeton de session tablette (PIN). Les
     appels écrivaient chacun leur en-tête « X-Admin-Token » en dur : sur une
     tablette (sans jeton admin), ils partaient donc sans authentification et
     l'API refusait tout. */
  window.FRH = function (extra) {
    var fr = window.__FR || {};
    var h = extra ? Object.assign({}, extra) : {};
    if (fr.token)         h['X-Admin-Token'] = fr.token;
    else if (fr.pinToken) h['X-Pin-Token']   = fr.pinToken;
    return h;
  };
})();
