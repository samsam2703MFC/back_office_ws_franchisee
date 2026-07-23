// Server-simulation data layer for the back office.
// Every domain table lives here (seed), is persisted to localStorage (the DB),
// and is read by the pages via window.BOServer.table(name). No data is hardcoded in the UI.
(function(){
  var LS = 'ws_bo_store_v9';   // v9 : purge go-live — invalide les caches locaux du seed de démo
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
      {cle:'order.cutoff_default',type:'text',val:'17:00'},
      {cle:'brand.support_url',type:'text',val:'https://aide.latelierby.be'},
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
    "ws_shop_exceptions": [],
    "ws_payment_methods": [],
    "fr_tdb_tournees": [],
    "fr_tdb_tree": [],
    "fr_prep_points": [],
    "fr_prep_lines": [],
    "fr_tour_dispatch": [],
    "fr_drivers": [],
    "fr_live_eta": [],
    "fr_live_table": [],
    "fr_renta_kpis": [],
    "fr_cout_params": [
      {key:'prep',label:'Coût horaire préparation',effet:'01/06/2026',unit:'€/h',step:'0.5'},
      {key:'emb',label:'Coût emballage / colis',effet:'01/06/2026',unit:'€',step:'0.01'},
      {key:'carb',label:'Coût carburant / litre',effet:'01/07/2026',unit:'€/L',step:'0.01'},
      {key:'struct',label:'Coût structure / tournée',effet:'01/01/2026',unit:'€',step:'1'},
      {key:'charg',label:'Taux horaire chargement',effet:'01/06/2026',unit:'€/h',step:'0.5'},
    ],
    "fr_validations": [],
    "fr_dispo_cats": [],
    "fr_stock_catalog": [],
    "fr_join_requests": [],
    "fr_assortiment": [],
  };
  var DB = null;
  function read(){ try { var r = localStorage.getItem(LS); if (r) return JSON.parse(r); } catch(e){} return null; }
  function persist(){ try { localStorage.setItem(LS, JSON.stringify(DB)); } catch(e){} return DB; }
  function ensure(){ if (DB) return DB; DB = read(); if (!DB){ DB = JSON.parse(JSON.stringify(SEED)); } else { for (var k in SEED){ if (!(k in DB)) DB[k] = JSON.parse(JSON.stringify(SEED[k])); } } persist(); return DB; }
  // Écritures serveur : chaque BOServer.save(table) est poussé vers l'API.
  // Tables à mapping propre → écrites dans les vraies tables ; les autres →
  // journal serveur ws_bo_store (état du BO persisté côté serveur, plus
  // seulement localStorage). Best-effort : hors-ligne/401 ⇒ localStorage seul.
  // Écritures EN VOL : chaque POST /franchisee/save est suivi jusqu'à sa
  // réponse. flush() permet d'ATTENDRE que tout soit commité côté serveur
  // avant un refetch — sinon le GET gagne la course et écrase l'état local
  // (toggle « Validé » qui « ne marche pas », site supprimé qui « revient »).
  var PENDING = [];
  function syncSave(n, rows){
    try {
      var fr = (typeof window !== 'undefined' && window.__FR) || {};
      if (!fr.base || !fr.token) return Promise.resolve();
      var p = fetch(fr.base + '/franchisee/save' + (fr.shop ? ('?shop=' + encodeURIComponent(fr.shop)) : ''), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': fr.token },
        credentials: 'omit',
        body: JSON.stringify({ table: n, rows: rows })
      }).catch(function(){});
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
    reset: function(){ DB = JSON.parse(JSON.stringify(SEED)); return persist(); },
    // Charge la vraie donnée depuis l'API PHP (/franchisee/*) EN MÉMOIRE, avec
    // repli seed par table : toute table absente/erreur/401/vide garde le seed,
    // donc le rendu ne casse jamais. Ne persiste pas l'API dans localStorage
    // (pas de cache périmé). À appeler AVANT le boot du runtime.
    // Miroir strict de bo_server.js (franchisor) → hydrate().
    hydrate: function(){
      var fr = (typeof window !== 'undefined' && window.__FR) || {};
      if (!fr.base) return Promise.resolve(false);
      ensure();
      var MAP = {
        kpis:'kpis',
        fr_clients:'fr-clients', fr_incidents:'fr-incidents', fr_alertes:'fr-alertes',
        fr_rentabilite:'fr-rentabilite', fr_live_drivers:'fr-live-drivers',
        ws_tours:'ws-tours', ws_delivery_zones:'ws-delivery-zones',
        ws_tour_postcodes:'ws-tour-postcodes', catchment_postcodes:'catchment-postcodes',
        ws_office_delivery_sites:'ws-office-delivery-sites', ws_offices:'ws-offices',
        ws_office_emails:'ws-office-emails', b2b_client_company_department:'b2b-departments',
        b2b_clients:'b2b-clients',
        ws_tour_availability:'ws-tour-availability', ws_tour_closures:'ws-tour-closures',
        ws_calendar_rules:'ws-calendar-rules', ws_slots:'ws-slots',
        ws_vouchers_local:'ws-vouchers-local', ws_pricing_rules_local:'ws-pricing-rules-local',
        ws_shop_exceptions:'ws-shop-exceptions', ws_payment_methods:'ws-payment-methods',
        ws_product_availability:'ws-product-availability',
        ws_office_delivery_settings:'ws-office-delivery-settings',
        ws_delivery_fee_rules:'ws-delivery-fee-rules',
        ws_franchisor_catchment:'ws-franchisor-catchment',
        params:'params',
        fr_tdb_tournees:'fr-tdb-tournees', fr_tdb_tree:'fr-tdb-tree',
        fr_prep_points:'fr-prep-points', fr_prep_lines:'fr-prep-lines',
        fr_tour_dispatch:'tour-dispatch-status', fr_drivers:'drivers',
        fr_live_eta:'fr-live-eta', fr_live_table:'fr-live-table',
        fr_renta_kpis:'fr-renta-kpis', fr_cout_params:'fr-cout-params',
        fr_validations:'fr-validations', fr_dispo_cats:'fr-dispo-cats',
        fr_stock_catalog:'fr-stock-catalog', fr_join_requests:'fr-join-requests',
        fr_assortiment:'fr-assortiment',
        fr_orders:'fr-orders', fr_net_stats:'fr-net-stats', fr_capacity:'fr-capacity'
      };
      var headers = fr.token ? { 'X-Admin-Token': fr.token } : {};
      var qs = fr.shop ? ('?shop=' + encodeURIComponent(fr.shop)) : '';
      // Tables à écriture TYPÉE (vraie table MySQL derrière /franchisee/save) :
      // pour elles, la réponse API fait foi MÊME VIDE (une table vidée reste
      // vide — le seed de démo ne doit pas « ressusciter » de lignes), et
      // l'overlay bo-store (copie potentiellement périmée) ne s'applique pas.
      // NB : fr_clients reste HORS de ce set — son écran s'édite via bo-store
      // (pas de bloc typé aller-retour). ws_tour_availability y est ENTRÉE le
      // jour où son bloc typé PHP a été ajouté (upsert par tournée × jour).
      var TYPED = { ws_tours:1, ws_delivery_zones:1, ws_tour_postcodes:1,
        ws_office_delivery_sites:1, ws_offices:1,
        ws_tour_closures:1, ws_tour_availability:1, ws_franchisor_catchment:1,
        catchment_postcodes:1, b2b_client_company_department:1, params:1,
        b2b_clients:1, fr_assortiment:1,
        fr_orders:1, fr_net_stats:1, fr_capacity:1 };
      var jobs = Object.keys(MAP).map(function(key){
        return fetch(fr.base + '/franchisee/' + MAP[key] + qs, { headers: headers, credentials: 'omit' })
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(data){ if (Array.isArray(data) && (data.length || TYPED[key])) DB[key] = data; })
          .catch(function(){ /* garde le seed pour cette table */ });
      });
      return Promise.all(jobs).then(function(){
        // Overlay des éditions BO persistées côté serveur (ws_bo_store) :
        // priorité aux tables éditées via l'UI dont l'écriture n'est pas
        // (encore) typée vers une vraie table.
        return fetch(fr.base + '/franchisee/bo-store' + qs, { headers: headers, credentials: 'omit' })
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(store){
            if (store && typeof store === 'object' && !Array.isArray(store)) {
              // Les tables TYPÉES viennent de la vraie table MySQL : l'overlay
              // bo-store (copie d'anciens enregistrements UI) ne doit pas les
              // écraser — c'est lui qui faisait « réapparaître » des sites.
              Object.keys(store).forEach(function(k){ if (Array.isArray(store[k]) && !TYPED[k]) DB[k] = store[k]; });
            }
            return true;
          })
          .catch(function(){ return true; });
      });
    }
  };
})();
