# MIGRATION_NOTES — Console franchisé (app DC)

> Implémentation native de la maquette Claude Design
> `back_office_ws_franchisee.dc.html` (remplace l'ancienne app `app.js` +
> `data.json`), câblée sur l'API PHP du WebShop. Miroir de la démarche
> franchisor.

## Chaîne de données

```
index.html
  └─ api-config.js          → window.__FR { base, token, shop }
  └─ bo_server.js           → seed + BOServer.hydrate()  (AVANT le boot)
  └─ support.js (runtime DC)→ rend le composant, qui lit BOServer.table(...)
```

- `hydrate()` : 1 `fetch` par table vers `<base>/franchisee/<endpoint>`,
  header `X-Admin-Token`, portée `?shop=<slug|id>`. Repli **par table** sur le
  seed (réponse non-2xx / non-tableau / vide ⇒ la table garde son seed).
- Timeout de boot 4 s : l'app démarre toujours, même API morte.
- Les écritures de l'app (formulaires, onboarding B2B, suppressions —
  `BOServer.save`) restent locales (`localStorage`, clé `ws_bo_store_v8`).
  Au rechargement, la donnée serveur fait foi. **Écritures serveur = prochain
  incrément** (mêmes endpoints en POST/PUT).

## Endpoints (php-api WebShop, bloc `/franchisee/*`, lecture, `require_admin`)

| Table du design | Endpoint | Source réelle |
| --- | --- | --- |
| kpis | `/franchisee/kpis` | agrégats `ws_orders` + `ws_product_stock` (couleurs CSS brutes) |
| fr_clients | `/franchisee/fr-clients` | `ws_offices` + `ws_office_delivery_sites` (points) ; plafond/encours/remise ERP absents → valeurs neutres |
| fr_incidents | `/franchisee/fr-incidents` | `ws_incidents` (shape fiche) |
| fr_alertes | `/franchisee/fr-alertes` | dérivées des incidents ouverts |
| fr_rentabilite | `/franchisee/fr-rentabilite` | `ws_tours` › `ws_offices` › CA `ws_orders`, coûts = `ws_param cost_*` |
| fr_live_drivers | `/franchisee/fr-live-drivers` | `ws_tour_tracking` |
| ws_tours | `/franchisee/ws-tours` | `ws_tours` + fenêtres `ws_tour_availability` + tracking ; forfait/décharge dérivés `ws_param` |
| ws_delivery_zones | `/franchisee/ws-delivery-zones` | `ws_delivery_zones` (cp/franco descriptifs absents → « — ») |
| ws_office_delivery_sites | `/franchisee/ws-office-delivery-sites` | table réelle complète |
| ws_offices | `/franchisee/ws-offices` | table réelle |
| ws_office_emails | `/franchisee/ws-office-emails` | contacts `ws_offices.email` |
| b2b_client_company_department | `/franchisee/b2b-departments` | table ERP si synchronisée, sinon `[]` |
| ws_tour_availability | `/franchisee/ws-tour-availability` | table réelle (agrégée par tournée) |
| ws_tour_closures | `/franchisee/ws-tour-closures` | table réelle |
| ws_calendar_rules | `/franchisee/ws-calendar-rules` | table réelle |
| ws_slots | `/franchisee/ws-slots` | table réelle |
| ws_vouchers_local | `/franchisee/ws-vouchers-local` | `ws_vouchers` (loc = shop_id non nul) |
| ws_pricing_rules_local | `/franchisee/ws-pricing-rules-local` | `ws_pricing_rules` |
| ws_shop_exceptions | `/franchisee/ws-shop-exceptions` | table réelle |
| ws_payment_methods | `/franchisee/ws-payment-methods` | `allowed_methods()` par profil (guest/registered/company) — nécessite `?shop` |
| ws_office_delivery_settings | `/franchisee/ws-office-delivery-settings` | `ws_offices` + `ws_tours` + cut-offs `ws_tour_availability` |
| params | `/franchisee/params` | `ws_param` |
| contexte | `/franchisee/me` | boutique de la portée |

**Migration `0012_franchisee_config_tables.sql` (repo WebShop)** crée les
tables manquantes et câble les 3 derniers endpoints : `ws_delivery_fee_rules`
(barème en cascade), `ws_franchisor_catchment` (zone de chalandise, valeurs
initiales insérées), `ws_product_availability_rules` (règles produit) +
`b2b_client_company_department` (cible de la synchro ERP). Avant que la
migration soit jouée sur le serveur, ces endpoints renvoient `[]` (repli seed).

## Dé-hardcoding (PHASE B) — fait

Les 12 littéraux JSX métier sont sortis vers des tables BOServer, hydratées
depuis l'API : `fr_tdb_tournees`, `fr_tdb_tree` (TDB), `fr_prep_points`
(préparation), `fr_live_eta`, `fr_live_table` (suivi), `fr_renta_kpis`,
`fr_cout_params` (rentabilité — valeurs `state.couts` initialisées depuis les
paramètres `cost_*`), `fr_validations` (ws_offices pending), `fr_dispo_cats`
(ws_categories), `fr_stock_catalog` (ws_product_stock), `fr_join_requests`
(ws_office_join_requests), `fr_assortiment` (ws_products × ws_product_shops).
Sans source serveur (→ seed) : `fr_live_eta` (ETA télémétrie), `fr_renta_kpis`
(analytique consolidée), `fr_cout_params` (libellés). Restent en dur : UI pure
(`groupsDef` nav, `stockBadges` filtres, positions par défaut de la carte).

## Écritures serveur — fait

- `BOServer.save(table)` → `POST /franchisee/save` : mapping typé vers les
  vraies tables pour `ws_franchisor_catchment`, `b2b_client_company_department`,
  `ws_tour_closures` (remplacement intégral) ; les autres tables sont
  persistées en JSON dans `ws_bo_store` (migration 0014), par boutique, et
  réappliquées par `hydrate()` en overlay (priorité aux éditions utilisateur).
- Onboarding B2B (wizard) → `POST /franchisee/onboard-office` : création réelle
  `ws_offices` + `ws_office_delivery_sites` + départements (+ voucher si
  `ws_vouchers` est une table de base — c'est une vue ERP en prod, donc différé).
- Best-effort : hors-ligne/sans jeton ⇒ localStorage seul, comme avant.

## Vérifié (Playwright)

- Rendu seed complet (aucune erreur JS), navigation Paramétrage → Clients B2B →
  Bureaux & sites.
- Hydratation de bout en bout : client servi par l'API affiché à l'écran,
  seed remplacé ; 25 endpoints appelés ; API morte ⇒ seed intact.
