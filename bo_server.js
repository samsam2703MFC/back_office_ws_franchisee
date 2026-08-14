// Data layer for the back office.
// Every domain table is read by the pages via window.BOServer.table(name), and
// comes from the API (hydrate) — there is NO seed and NO fallback: a table the
// server does not serve is empty, and the screen shows nothing rather than
// something invented. Local edits (BOServer.save) are kept in localStorage until
// the server acknowledges them.
(function(){
  var LS = 'ws_bo_store_v9';   // v9 : purge go-live — invalide les caches locaux du seed de démo
  // Le store local appartient à UNE boutique, et le dit. Sans cette marque,
  // ouvrir la console sur ?shop=3 affichait les clients, les tournées et les
  // bureaux de la boutique 2 — ceux que localStorage avait gardés — sous le
  // nom et l'id de la 3 : hydrate() ne remplace les tables que s'il TOURNE
  // (jeton présent, API joignable) et le boot ne l'attend que 4 s. Un store
  // d'une autre portée est donc jeté, jamais affiché. Les éditions locales non
  // encore acquittées partent avec lui : elles concernent l'autre boutique, et
  // les garder les aurait poussées dans celle-ci au prochain enregistrement.
  var LS_SCOPE = 'ws_bo_store_shop';
  // GO-LIVE : plus AUCUNE donnée de démonstration. Les tables partent vides
  // et sont remplies exclusivement par l'API (/franchisee/*). Seules restent
  // les CONFIGS par défaut (params, gabarits d'emails, libellés de coûts).
  var SEED = {
    "kpis": [],
    "shops": [],
    "catalog": [],
    "vouchers": [],
    "pricing_rules": [],
    "params": [
      {cle:'bo_show_source',type:'bool',def:false},
      {cle:'bo_show_help',type:'bool',def:false},
      {cle:'admin.schema_reports',type:'bool',def:true},
      {cle:'webshop.enabled',type:'bool',def:true},
      {cle:'nav.icon_back',type:'text',val:'arrow-left'},
      {cle:'delivery.enabled',type:'bool',def:true},
      // Audit go-live : plus de cut-off 17:00 ni d'URL d'aide inventés en
      // seed — order.cutoff_default vient de ws_param (API) ou est absent,
      // et l'écran l'affiche absent. brand.support_url pointait vers un site
      // qui n'existe pas (le canal réel est aide@latelierby.be).
    ],
    "email_templates": [
      {cle:'order_confirm',langue:'FR',sujet:'Votre commande {{commande_ref}} est confirmée'},
      {cle:'order_ready',langue:'FR',sujet:'Votre commande est prête'},
      {cle:'invoice',langue:'FR',sujet:'Facture {{commande_ref}}'},
      {cle:'office_onboarding',langue:'FR',sujet:'Bienvenue — votre compte {{bureau}}'},
      {cle:'office_reject',langue:'FR',sujet:'Votre demande de rattachement'},
    ],
    "users": [],
    "audit": [],
    "fr_alertes": [],
    "fr_live_drivers": [],
    "fr_clients": [],
    "fr_incidents": [],
    "fr_rentabilite": [],
    "ws_tour_availability": [],
    "ws_tour_closures": [],
    "ws_delivery_fee_rules": [],
    "ws_franchisor_catchment": [],
    "b2b_clients": [],
    "ws_tours": [],
    "ws_delivery_zones": [],
    "ws_office_delivery_sites": [],
    "ws_offices": [],
    "ws_delivery_site_department": [],
    "b2b_client_company_department": [],
    "ws_office_delivery_settings": [],
    "ws_product_availability": [],
    "ws_slots": [],
    "ws_office_emails": [],
    "ws_calendar_rules": [],
    "ws_pricing_rules_local": [],
    "ws_vouchers_local": [],
    "fr_vouchers": [],
    "fr_shop_availability": [],
    "ws_shop_exceptions": [],
    "ws_payment_methods": [],
    "fr_tdb_tournees": [],
    "fr_tdb_tree": [],
    "fr_prep_points": [],
    "fr_prep_lines": [],
    "fr_tour_dispatch": [],
    "fr_drivers": [],
    "fr_erp_portions": [],
    "fr_live_eta": [],
    "fr_live_table": [],
    "fr_renta_kpis": [],
    /* VIDE, comme toutes les autres. Les cinq lignes de l'écran (libellé,
       unité, pas de saisie) décrivent l'INTERFACE et vivent dans index.html ;
       les VALEURS vivent en base (ws_param cost_*). Ce qui restait ici était un
       seed portant des dates d'effet inventées (« 01/06/2026 ») — jamais
       affichées, mais exactement le genre de donnée fabriquée que la purge
       go-live devait emporter. */
    "fr_cout_params": [],
    "fr_validations": [],
    "fr_dispo_cats": [],
    "fr_stock_catalog": [],
    "fr_join_requests": [],
    "fr_assortiment": [],
  };
  var DB = null;
  function scopeNow(){ try { return String(((typeof window !== 'undefined' && window.__FR) || {}).shop || ''); } catch(e){ return ''; } }
  function read(){
    try {
      // Marque absente = provenance inconnue (store d'avant cette version) :
      // traitée comme une autre portée dès qu'une boutique est demandée.
      if ((localStorage.getItem(LS_SCOPE) || '') !== scopeNow()) {
        localStorage.removeItem(LS); localStorage.removeItem(LS_SCOPE); return null;
      }
      var r = localStorage.getItem(LS); if (r) return JSON.parse(r);
    } catch(e){}
    return null;
  }
  function persist(){ try { localStorage.setItem(LS, JSON.stringify(DB)); localStorage.setItem(LS_SCOPE, scopeNow()); } catch(e){} return DB; }
  function ensure(){ if (DB) return DB; DB = read() || {}; return DB; }
  // Écritures serveur : chaque BOServer.save(table) est poussé vers l'API.
  // Tables à mapping propre → écrites dans les vraies tables ; les autres →
  // journal serveur ws_bo_store (état du BO persisté côté serveur, plus
  // seulement localStorage). Best-effort : hors-ligne/401 ⇒ localStorage seul.
  // Écritures EN VOL : chaque POST /franchisee/save est suivi jusqu'à sa
  // réponse. flush() permet d'ATTENDRE que tout soit commité côté serveur
  // avant un refetch — sinon le GET gagne la course et écrase l'état local
  // (toggle « Validé » qui « ne marche pas », site supprimé qui « revient »).
  var PENDING = [];
  // ── Erreurs de chargement/écriture : AFFICHÉES, jamais avalées. ──
  // Règle go-live : soit la vraie donnée charge, soit l'écran dit « erreur —
  // please debug ». loadErrors est lu par le bandeau d'erreur (index.html).
  var ERRORS = [];
  function noteError(kind, detail){
    ERRORS.push({ kind: kind, detail: detail, at: new Date().toISOString() });
    try { if (typeof window !== 'undefined' && window.__BO_RENDER_ERRORS) window.__BO_RENDER_ERRORS(ERRORS); } catch(e){}
  }
  // En-têtes d'authentification : jeton admin ERP, sinon jeton de session
  // tablette (PIN). Sans ce second cas, une tablette ne pouvait charger AUCUNE
  // donnée — /franchisee/* n'acceptait que le jeton admin.
  function frAuth(fr){
    if (fr && fr.token)    return { 'X-Admin-Token': fr.token };
    if (fr && fr.pinToken) return { 'X-Pin-Token': fr.pinToken };
    return {};
  }
  function frHasAuth(fr){ return !!(fr && (fr.token || fr.pinToken)); }

  function syncSave(n, rows){
    try {
      var fr = (typeof window !== 'undefined' && window.__FR) || {};
      if (!fr.base || !frHasAuth(fr)) {
        // AVANT : écriture silencieusement ignorée (l'utilisateur croyait
        // enregistrer). Maintenant : erreur visible, rien de fantôme.
        noteError('ecriture', 'Écriture « ' + n + ' » NON envoyée — ' +
          (!fr.base ? 'API non configurée' : 'aucune session (jeton admin ou PIN tablette)'));
        return Promise.resolve();
      }
      var p = fetch(fr.base + '/franchisee/save' + (fr.shop ? ('?shop=' + encodeURIComponent(fr.shop)) : ''), {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, frAuth(fr)),
        credentials: 'omit',
        body: JSON.stringify({ table: n, rows: rows })
      }).then(function(r){
        if (!r.ok) noteError('ecriture', 'Écriture « ' + n + ' » refusée (HTTP ' + r.status + (r.status === 401 ? ' — session invalide' : r.status === 403 ? ' — section non autorisée pour ce compte' : '') + ')');
        return r;
      }).catch(function(e){ noteError('ecriture', 'Écriture « ' + n + ' » KO (réseau) : ' + (e && e.message || e)); });
      PENDING.push(p);
      var drop = function(){ var i = PENDING.indexOf(p); if (i >= 0) PENDING.splice(i, 1); };
      p.then(drop, drop);
      return p;
    } catch(e){ return Promise.resolve(); }
  }
  window.BOServer = {
    table: function(n){ var db = ensure(); return db[n] ? JSON.parse(JSON.stringify(db[n])) : []; },
    all: function(){ return JSON.parse(JSON.stringify(ensure())); },
    getParam: function(key, dflt){ var db = ensure(); var rows = db.params || []; for (var i=0;i<rows.length;i++){ if (rows[i].cle===key){ var r=rows[i]; return (r.val!==undefined ? r.val : (r.def!==undefined ? r.def : dflt)); } } return dflt; },
    setParam: function(key, val){ ensure(); var rows = DB.params || (DB.params = []); var found=false; for (var i=0;i<rows.length;i++){ if (rows[i].cle===key){ rows[i].val=val; found=true; } } if (!found) rows.push({cle:key, type:'bool', val:val}); syncSave('params', rows); return persist(); },
    save: function(n, rows){ ensure(); DB[n] = JSON.parse(JSON.stringify(rows)); syncSave(n, DB[n]); return persist(); },
    // Attend la fin de TOUTES les écritures serveur en vol (POST /save) —
    // à appeler avant tout refetch GET pour ne jamais lire un état périmé.
    flush: function(){ return Promise.all(PENDING.slice()).then(function(){ return true; }, function(){ return true; }); },
    // Mise à jour LOCALE seulement (pas de syncSave) : utilisée pour refléter
    // en mémoire une donnée déjà écrite côté serveur (ex. office créé par le
    // toggle « livraison au bureau » — GET refetché puis injecté ici).
    refresh: function(n, rows){ ensure(); if (Array.isArray(rows)) DB[n] = JSON.parse(JSON.stringify(rows)); return persist(); },
    // RE-HYDRATATION CIBLÉE du catalogue : la console doit être le reflet du
    // BO marque sans rechargement de page — l'incident du 14/08 s'est vu en
    // comparant deux écrans dont l'un lisait des données du matin. On ne
    // re-télécharge que les tables du catalogue (assortiment, stock, dispo),
    // pas les cinquante routes du boot. Rend true si un contenu a CHANGÉ,
    // pour que l'appelant ne re-rende pas l'écran pour rien.
    rehydrateCatalogue: function(){
      var fr = (typeof window !== 'undefined' && window.__FR) || {};
      if (!fr.base || !frHasAuth(fr)) return Promise.resolve(false);
      ensure();
      var qs = fr.shop ? ('?shop=' + encodeURIComponent(fr.shop)) : '';
      var headers = frAuth(fr);
      var CIBLES = { fr_assortiment:'fr-assortiment', fr_stock_catalog:'fr-stock-catalog', fr_dispo_cats:'fr-dispo-cats' };
      var changed = false;
      var jobs = Object.keys(CIBLES).map(function(key){
        return fetch(fr.base + '/franchisee/' + CIBLES[key] + qs, { headers: headers, credentials: 'omit' })
          .then(function(r){ if (!r.ok) return null; return r.json(); })
          .then(function(data){
            if (!Array.isArray(data)) return;
            if (JSON.stringify(DB[key]) !== JSON.stringify(data)) { DB[key] = data; changed = true; }
          })
          // Panne réseau PASSAGÈRE : on garde les données affichées et on
          // retentera au tick suivant — le bandeau d'erreur reste réservé au
          // chargement initial, sinon il sonnerait à chaque micro-coupure.
          .catch(function(){});
      });
      return Promise.all(jobs).then(function(){ return changed; });
    },
    reset: function(){ DB = JSON.parse(JSON.stringify(SEED)); return persist(); },
    // Erreurs de chargement/écriture accumulées (bandeau index.html).
    loadErrors: ERRORS,
    // Charge la vraie donnée depuis l'API PHP (/franchisee/*) EN MÉMOIRE.
    // RÈGLE GO-LIVE (« vraies données ou bug ») : la réponse API fait foi MÊME
    // VIDE pour toutes les tables métier ; une table en échec (401/500/réseau)
    // est VIDÉE et l'échec est AFFICHÉ (« error please debug ») — plus jamais
    // de « garde le seed » silencieux ni de données périmées du localStorage
    // présentées comme vraies. À appeler AVANT le boot du runtime.
    hydrate: function(){
      var fr = (typeof window !== 'undefined' && window.__FR) || {};
      if (!fr.base) {
        noteError('fatal', 'API non configurée (window.__FR.base absent) — aucun chargement possible.');
        return Promise.resolve(false);
      }
      if (!frHasAuth(fr)) {
        // PAS une erreur : c'est l'état normal d'une tablette au démarrage.
        // L'interface affiche le pavé PIN, et l'hydratation repart après la
        // connexion (rechargement). Un bandeau « ERREUR — PLEASE DEBUG » ici
        // affolait pour un écran de connexion parfaitement attendu.
        return Promise.resolve(false);
      }
      ensure();
      if (!fr.base) return Promise.resolve(false);
      var MAP = {
        fr_clients:'fr-clients', fr_incidents:'fr-incidents', fr_alertes:'fr-alertes',
        fr_orders:'fr-orders',
        fr_rentabilite:'fr-rentabilite', fr_live_drivers:'fr-live-drivers',
        ws_tours:'ws-tours', ws_delivery_zones:'ws-delivery-zones',
        ws_tour_postcodes:'ws-tour-postcodes', catchment_postcodes:'catchment-postcodes',
        ws_office_delivery_sites:'ws-office-delivery-sites', ws_offices:'ws-offices',
        ws_office_emails:'ws-office-emails', b2b_client_company_department:'b2b-departments',
        b2b_clients:'b2b-clients',
        ws_tour_availability:'ws-tour-availability', ws_tour_closures:'ws-tour-closures',
        ws_calendar_rules:'ws-calendar-rules', ws_slots:'ws-slots',
        ws_vouchers_local:'ws-vouchers-local', fr_vouchers:'fr-vouchers', fr_shop_availability:'fr-shop-availability', ws_pricing_rules_local:'ws-pricing-rules-local',
        ws_shop_exceptions:'ws-shop-exceptions', ws_payment_methods:'ws-payment-methods',
        ws_product_availability:'ws-product-availability',
        ws_office_delivery_settings:'ws-office-delivery-settings',
        ws_delivery_fee_rules:'ws-delivery-fee-rules',
        ws_franchisor_catchment:'ws-franchisor-catchment',
        params:'params', users:'users',
        fr_tdb_tournees:'fr-tdb-tournees', fr_tdb_tree:'fr-tdb-tree',
        fr_prep_points:'fr-prep-points', fr_prep_lines:'fr-prep-lines',
        fr_tour_dispatch:'tour-dispatch-status', fr_drivers:'drivers',
        fr_erp_portions:'erp-portion-rules',
        fr_live_eta:'fr-live-eta', fr_live_table:'fr-live-table',
        fr_renta_kpis:'fr-renta-kpis', fr_renta_evolution:'fr-renta-evolution', fr_cout_params:'fr-cout-params',
        fr_validations:'fr-validations', fr_dispo_cats:'fr-dispo-cats',
        fr_stock_catalog:'fr-stock-catalog', fr_join_requests:'fr-join-requests',
        fr_assortiment:'fr-assortiment',
        fr_orders:'fr-orders', fr_net_stats:'fr-net-stats', fr_capacity:'fr-capacity'
      };
      var headers = frAuth(fr);
      var qs = fr.shop ? ('?shop=' + encodeURIComponent(fr.shop)) : '';
      // Tables dont l'écriture est TYPÉE (vraie table MySQL) : l'overlay
      // bo-store (copie potentiellement périmée) ne s'applique pas à elles.
      var TYPED = { ws_tours:1, ws_delivery_zones:1, ws_tour_postcodes:1,
        ws_office_delivery_sites:1, ws_offices:1,
        ws_tour_closures:1, ws_tour_availability:1, ws_franchisor_catchment:1,
        catchment_postcodes:1, b2b_client_company_department:1, params:1,
        b2b_clients:1, fr_assortiment:1,
        // Le CATALOGUE est calculé par le serveur à chaque appel (ws_products
        // × stock du jour) : une copie bo-store est par définition périmée, et
        // c'est exactement ce qui s'est vu le 14/08 — le BO marque et le
        // webshop d'accord entre eux, la console franchisé affichant autre
        // chose. fr_assortiment était déjà protégé ; stock et dispo ne
        // l'étaient pas.
        fr_stock_catalog:1, fr_dispo_cats:1, fr_erp_portions:1,
        fr_orders:1, fr_net_stats:1, fr_capacity:1, fr_vouchers:1, fr_shop_availability:1 };
      // CONFIGS d'écran (libellés/gabarits, pas des données métier) : une
      // réponse API vide ne les écrase pas — ce sont des textes d'interface.
      /* CONFIG protégeait fr_cout_params d'être écrasé par une réponse API
         vide. La table étant désormais vide des deux côtés, il n'y a plus
         rien à protéger — et garder une exception vide invite à y remettre
         un jour une valeur métier, ce que le constat 1.7 reprochait. */
      var CONFIG = {};
      var failed = [];
      // Tables dont la route PHP n'existe PAS ENCORE. On continue de l'appeler
      // — le jour où elle est écrite, l'écran se remplit sans toucher au front
      // — mais son 404 n'alimente pas le bandeau d'erreur : ce n'est pas une
      // panne, c'est un chantier connu, et un bandeau permanent finit par ne
      // plus être lu. Toute AUTRE erreur sur ces tables reste signalée, et un
      // 404 sur n'importe quelle autre table reste une panne.
      var ROUTES_A_ECRIRE = { users: 1, fr_renta_evolution: 1 };
      var jobs = Object.keys(MAP).map(function(key){
        var url = fr.base + '/franchisee/' + MAP[key] + qs;
        return fetch(url, { headers: headers, credentials: 'omit' })
          .then(function(r){
            if (!r.ok) {
              if (!(r.status === 404 && ROUTES_A_ECRIRE[key])) failed.push(key + ' (HTTP ' + r.status + ')');
              DB[key] = []; return null;
            }
            /* TABLE ABSENTE ≠ TABLE VIDE. Les deux rendaient `[]`, donc une
               migration oubliée ressemblait exactement à une base vide, et
               l'écran ne pouvait pas le dire. Le serveur nomme désormais les
               tables manquantes dans X-Tables-Absentes ; on le remonte au
               bandeau d'erreur, seul endroit où quelqu'un le lira. */
            var abs = r.headers.get('X-Tables-Absentes');
            if (abs) noteError('chargement', 'Table absente en base : ' + abs +
              ' (écran « ' + key + ' » vide pour cette raison, pas parce qu’il n’y a rien)');
            return r.json().then(function(data){
              // La réponse API fait foi, MÊME VIDE (sauf configs d'écran) :
              // aucune donnée locale/périmée ne se substitue à la base.
              if (Array.isArray(data) && (data.length || !CONFIG[key])) DB[key] = data;
              return null;
            });
          })
          .catch(function(){ failed.push(key + ' (réseau/JSON)'); DB[key] = []; });
      });
      return Promise.all(jobs).then(function(){
        // Overlay des éditions BO persistées côté serveur (ws_bo_store) :
        // priorité aux tables éditées via l'UI dont l'écriture n'est pas
        // (encore) typée vers une vraie table.
        return fetch(fr.base + '/franchisee/bo-store' + qs, { headers: headers, credentials: 'omit' })
          .then(function(r){
            if (!r.ok) { failed.push('bo-store (HTTP ' + r.status + ')'); return null; }
            return r.json();
          })
          .then(function(store){
            if (store && typeof store === 'object' && !Array.isArray(store)) {
              // Les tables TYPÉES viennent de la vraie table MySQL : l'overlay
              // bo-store (copie d'anciens enregistrements UI) ne doit pas les
              // écraser — c'est lui qui faisait « réapparaître » des sites.
              Object.keys(store).forEach(function(k){ if (Array.isArray(store[k]) && !TYPED[k]) DB[k] = store[k]; });
            }
            return true;
          })
          .catch(function(){ failed.push('bo-store (réseau)'); return true; })
          .then(function(){
            if (failed.length) {
              var auth = failed.join(' ').indexOf('HTTP 401') >= 0;
              noteError('chargement', failed.length + ' chargement(s) en échec — please debug : ' + failed.join(', ') +
                (auth ? '  ⇒ HTTP 401 = jeton admin invalide/absent : rouvrez le BO avec ?shop=…&token=<jeton admin>.' : ''));
            }
            return !failed.length;
          });
      });
    }
  };
})();
