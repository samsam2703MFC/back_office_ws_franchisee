// Data layer for the back office.
// Every domain table is read by the pages via window.BOServer.table(name), and
// comes from the API (hydrate) — there is NO seed and NO fallback: a table the
// server does not serve is empty, and the screen shows nothing rather than
// something invented. Local edits (BOServer.save) are kept in localStorage until
// the server acknowledges them.
(function(){
  var LS = 'ws_bo_store_v9';
  // Les versions précédentes du magasin local contenaient des données de
  // démonstration. On les efface une bonne fois : elles ne doivent jamais
  // pouvoir remonter dans l'écran d'un franchisé.
  try {
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var k = localStorage.key(i);
      if (k && k.indexOf('ws_bo_store') === 0 && k !== LS) localStorage.removeItem(k);
    }
  } catch(e){}
  var DB = null;
  function read(){ try { var r = localStorage.getItem(LS); if (r) return JSON.parse(r); } catch(e){} return null; }
  function persist(){ try { localStorage.setItem(LS, JSON.stringify(DB)); } catch(e){} return DB; }
  function ensure(){ if (DB) return DB; DB = read() || {}; return DB; }
  // Écritures serveur : chaque BOServer.save(table) est poussé vers l'API.
  // Tables à mapping propre → écrites dans les vraies tables ; les autres →
  // journal serveur ws_bo_store (état du BO persisté côté serveur, plus
  // seulement localStorage). Best-effort : hors-ligne/401 ⇒ localStorage seul.
  function syncSave(n, rows){
    try {
      var fr = (typeof window !== 'undefined' && window.__FR) || {};
      if (!fr.base || !fr.token) return;
      fetch(fr.base + '/franchisee/save' + (fr.shop ? ('?shop=' + encodeURIComponent(fr.shop)) : ''), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': fr.token },
        credentials: 'omit',
        body: JSON.stringify({ table: n, rows: rows })
      }).catch(function(){});
    } catch(e){}
  }
  window.BOServer = {
    table: function(n){ var db = ensure(); return db[n] ? JSON.parse(JSON.stringify(db[n])) : []; },
    all: function(){ return JSON.parse(JSON.stringify(ensure())); },
    getParam: function(key, dflt){ var db = ensure(); var rows = db.params || []; for (var i=0;i<rows.length;i++){ if (rows[i].cle===key){ var r=rows[i]; return (r.val!==undefined ? r.val : (r.def!==undefined ? r.def : dflt)); } } return dflt; },
    setParam: function(key, val){ ensure(); var rows = DB.params || (DB.params = []); var found=false; for (var i=0;i<rows.length;i++){ if (rows[i].cle===key){ rows[i].val=val; found=true; } } if (!found) rows.push({cle:key, type:'bool', val:val}); syncSave('params', rows); return persist(); },
    save: function(n, rows){ ensure(); DB[n] = JSON.parse(JSON.stringify(rows)); syncSave(n, DB[n]); return persist(); },
    reset: function(){ DB = {}; return persist(); },
    // Charge la vraie donnée depuis l'API PHP (/franchisee/*) EN MÉMOIRE.
    // AUCUN repli : une table absente, en erreur, 401 ou vide devient vide —
    // l'écran montre qu'il n'y a rien plutôt que d'inventer. Ne persiste pas
    // l'API dans localStorage (pas de cache périmé). À appeler AVANT le boot
    // du runtime.
    hydrate: function(){
      var fr = (typeof window !== 'undefined' && window.__FR) || {};
      ensure();
      if (!fr.base) return Promise.resolve(false);
      var MAP = {
        fr_clients:'fr-clients', fr_incidents:'fr-incidents', fr_alertes:'fr-alertes',
        fr_orders:'fr-orders',
        fr_rentabilite:'fr-rentabilite', fr_live_drivers:'fr-live-drivers',
        ws_tours:'ws-tours', ws_delivery_zones:'ws-delivery-zones',
        ws_office_delivery_sites:'ws-office-delivery-sites', ws_offices:'ws-offices',
        ws_office_emails:'ws-office-emails', b2b_client_company_department:'b2b-departments',
        ws_tour_availability:'ws-tour-availability', ws_tour_closures:'ws-tour-closures',
        ws_calendar_rules:'ws-calendar-rules', ws_slots:'ws-slots',
        ws_vouchers_local:'ws-vouchers-local', ws_pricing_rules_local:'ws-pricing-rules-local',
        ws_shop_exceptions:'ws-shop-exceptions', ws_payment_methods:'ws-payment-methods',
        ws_product_availability:'ws-product-availability',
        ws_office_delivery_settings:'ws-office-delivery-settings',
        ws_delivery_fee_rules:'ws-delivery-fee-rules',
        ws_franchisor_catchment:'ws-franchisor-catchment',
        params:'params', users:'users',
        fr_tdb_tournees:'fr-tdb-tournees', fr_tdb_tree:'fr-tdb-tree',
        fr_prep_points:'fr-prep-points', fr_live_eta:'fr-live-eta', fr_live_table:'fr-live-table',
        fr_renta_kpis:'fr-renta-kpis', fr_renta_evolution:'fr-renta-evolution', fr_cout_params:'fr-cout-params',
        fr_validations:'fr-validations', fr_dispo_cats:'fr-dispo-cats',
        fr_stock_catalog:'fr-stock-catalog', fr_join_requests:'fr-join-requests',
        fr_assortiment:'fr-assortiment',
        fr_capacite:'fr-capacite', fr_new_offices:'fr-new-offices', fr_net_stats:'fr-net-stats',
        ws_shop_hours:'ws-shop-hours'
      };
      var headers = fr.token ? { 'X-Admin-Token': fr.token } : {};
      var qs = fr.shop ? ('?shop=' + encodeURIComponent(fr.shop)) : '';
      var jobs = Object.keys(MAP).map(function(key){
        return fetch(fr.base + '/franchisee/' + MAP[key] + qs, { headers: headers, credentials: 'omit' })
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(data){ DB[key] = Array.isArray(data) ? data : []; })
          .catch(function(){ DB[key] = []; });   // pas de repli : la table est vide
      });
      return Promise.all(jobs).then(function(){
        // Overlay des éditions BO persistées côté serveur (ws_bo_store) :
        // priorité aux tables éditées via l'UI dont l'écriture n'est pas
        // (encore) typée vers une vraie table.
        return fetch(fr.base + '/franchisee/bo-store' + qs, { headers: headers, credentials: 'omit' })
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(store){
            if (store && typeof store === 'object' && !Array.isArray(store)) {
              Object.keys(store).forEach(function(k){ if (Array.isArray(store[k])) DB[k] = store[k]; });
            }
            return true;
          })
          .catch(function(){ return true; });
      });
    }
  };
})();
