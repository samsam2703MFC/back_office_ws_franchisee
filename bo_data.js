/* ==========================================================================
   bo_data.js — couche d'accès à la donnée de la Console franchisé.

   Miroir de bo_server.js (franchisor) : le SEED est le data.json chargé par
   app.js ; hydrate() remplace CHAQUE dataset par la vraie donnée de l'API PHP
   (/franchisee/*, X-Admin-Token), avec repli seed par dataset — toute table
   absente / requête vide / 401 garde son seed, donc le rendu ne casse jamais.

   Ne persiste rien (pas de cache périmé). À appeler AVANT le 1er render.
   Aucune donnée métier ici : uniquement le mapping dataset → endpoint.
   ========================================================================== */
(function () {
  // dataset (data.json) → segment d'endpoint sous <base>/franchisee/
  var MAP = {
    kpis: 'kpis', orders: 'orders', prep: 'prep', suivi: 'suivi', stock: 'stock',
    b2b: 'b2b', incidents: 'incidents', capacite: 'capacite', couts: 'couts',
    tours: 'tours', fermetures: 'fermetures', bureaux: 'bureaux', sites: 'sites',
    emails: 'emails', frais: 'frais', zones: 'zones', creneaux: 'creneaux',
    calendarRules: 'calendar-rules', pricing: 'pricing', vouchers: 'vouchers',
    assortiment: 'assortiment', dispoCat: 'dispo-cat', dispoProd: 'dispo-prod',
    paiements: 'paiements', remiseWebshop: 'remise-webshop', shopParams: 'shop-params',
    bureauParams: 'bureau-params', coutTemps: 'cout-temps'
    // Non mappés (restent sur seed, cf. MIGRATION_NOTES « en attente ») :
    //   kpisCap, kpisRenta, horaires, joursExcept, reglesBoutique
  };

  function frDate() {
    // Date runtime (remplace la date figée du seed) au format « jeu. 17 juil. 2026 ».
    try {
      var s = new Date().toLocaleDateString('fr-BE',
        { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      return s.charAt(0).toUpperCase() + s.slice(1);
    } catch (e) { return null; }
  }

  window.BOData = {
    /* Hydrate DB.datasets (et DB.brand) depuis l'API. Renvoie une Promise. */
    hydrate: function (DB) {
      // La date d'en-tête n'est jamais figée : toujours la date runtime.
      var d = frDate(); if (d && DB && DB.brand) DB.brand.date = d;

      var fr = (typeof window !== 'undefined' && window.__FR) || {};
      if (!fr.base || !DB || !DB.datasets) return Promise.resolve(false);

      var headers = fr.token ? { 'X-Admin-Token': fr.token } : {};
      var qs = fr.shop ? ('?shop=' + encodeURIComponent(fr.shop)) : '';
      var get = function (seg) {
        return fetch(fr.base + '/franchisee/' + seg + qs, { headers: headers, credentials: 'omit' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .catch(function () { return null; });
      };

      var jobs = Object.keys(MAP).map(function (name) {
        if (!(name in DB.datasets)) return Promise.resolve();
        return get(MAP[name]).then(function (data) {
          // Repli seed : on n'écrase QUE si l'API renvoie une liste non vide.
          if (Array.isArray(data) && data.length) DB.datasets[name] = data;
        });
      });

      // Contexte session : libellé console + portée boutique (best-effort).
      jobs.push(get('me').then(function (me) {
        if (me && me.consoleLabel && DB.brand) DB.brand.consoleLabel = me.consoleLabel;
      }));

      return Promise.all(jobs).then(function () { return true; });
    }
  };
})();
