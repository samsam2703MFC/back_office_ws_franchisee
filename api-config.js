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

  window.__FR = { base: base, token: token, shop: shop };
})();
