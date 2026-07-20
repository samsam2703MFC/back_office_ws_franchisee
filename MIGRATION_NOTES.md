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

**En attente (endpoint renvoie `[]` → seed conservé, à câbler quand la source
existera)** : `ws_delivery_fee_rules` (barème en cascade), `ws_franchisor_catchment`
(zone de chalandise marque), `ws_product_availability` (règles produit).

## Reste en dur DANS la maquette (backlog dé-hardcoding)

L'export contient encore des littéraux en JSX (hors BOServer) : données du
Tableau de bord (`tdbRaw`, tournées du jour), coûts par défaut (`state.couts`),
positions de la carte, listes de préparation. Les sortir vers des tables
BOServer (puis vers l'API) = incrément suivant, écran par écran — même
démarche que la PHASE B du franchisor.

## Vérifié (Playwright)

- Rendu seed complet (aucune erreur JS), navigation Paramétrage → Clients B2B →
  Bureaux & sites.
- Hydratation de bout en bout : client servi par l'API affiché à l'écran,
  seed remplacé ; 25 endpoints appelés ; API morte ⇒ seed intact.
