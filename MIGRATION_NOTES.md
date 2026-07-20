# MIGRATION_NOTES — `backoffice_franchisee` → vraie DB

Comment la Console franchisé est branchée sur la vraie base, et ce qu'il faut
côté serveur pour l'activer. **Aucun changement de design / UX / logique de
rendu** : seule la *source* de la donnée passe du seed (`data.json`) à l'API PHP
partagée. Miroir strict de `back_office_ws_franchisor`.

## Architecture du câblage

```
back_office_ws_franchisee (front)              webshop/php-api (backend, MÊME base que webshop + franchisor)
  api-config.js → window.__FR {base,token,shop}   GET <base>/franchisee/kpis
  bo_data.js    → BOData.hydrate(DB) ────────────▶     …/orders · …/stock · …/incidents · …/tours …
     fetch <base>/franchisee/<seg>?shop=<slug>          (X-Admin-Token), repli seed par dataset
  app.js        → moteur de rendu (inchangé) lit DB.datasets hydraté
```

- **base** = same-origin `<origin>/webshop/api` (dérivée en retirant
  `/backoffice_franchisee` du path). Sur `*.github.io` ou API injoignable →
  **mode seed** (`data.json`).
- **token** = `localStorage['adminToken']` (partagé par origine avec l'admin
  webshop / le franchisor). Override 1re connexion : `?token=<jeton>`.
- **portée** = `?shop=<slug|id>` (le franchisé est mono-boutique ; mémorisé dans
  `localStorage['franchiseeShop']`). Absente → réseau. Override test : `?api=<url>`.
- **repli** : tout dataset en erreur / 401 / vide **garde son seed** → le rendu
  ne casse jamais. Vérifié end-to-end (Playwright) : sans API → seed ; avec API →
  données réelles.

## Endpoints ajoutés (`php-api/index.php`, gardés `require_admin()`)

Bloc `/franchisee/*` (jeton `X-Admin-Token`, `?shop=<slug|id>` optionnel).
Réutilise le SQL déjà écrit dans `php-api/bo/routes.php` (routes `/bo/franchisee/*`),
reshapé aux datasets du front.

| dataset (front) | Endpoint | Source (tables réelles) |
| --- | --- | --- |
| `kpis` | `GET /franchisee/kpis` | agrégat `ws_orders` (+ `ws_product_stock`) |
| `orders` | `GET /franchisee/orders` | `ws_orders` (+ `ws_customers`, `ws_offices`) |
| `prep` | `GET /franchisee/prep` | dérivé `ws_orders` × `ws_tours` × `ws_delivery_zones` |
| `suivi` | `GET /franchisee/suivi` | `ws_tours` + `ws_tour_tracking` |
| `stock` | `GET /franchisee/stock` | `ws_product_stock` (+ `ws_products`, `ws_categories`) |
| `b2b` | `GET /franchisee/b2b` | `ws_office_join_requests` |
| `incidents` | `GET /franchisee/incidents` | `ws_incidents` |
| `capacite` | `GET /franchisee/capacite` | `ws_tours` vs `ws_orders` (`max_items`) |
| `couts` | `GET /franchisee/couts` | `ws_orders` × `ws_param` (`cost_*`) |
| `tours` | `GET /franchisee/tours` | `ws_tours` + `ws_delivery_zones` + `ws_tour_tracking` |
| `fermetures` | `GET /franchisee/fermetures` | `ws_tour_closures` + `ws_tours` |
| `bureaux` | `GET /franchisee/bureaux` | `ws_offices` (+ `ws_office_delivery_sites`) |
| `sites` | `GET /franchisee/sites` | `ws_office_delivery_sites` + `ws_offices` |
| `emails` | `GET /franchisee/emails` | `ws_email_templates` |
| `frais` / `zones` | `GET /franchisee/frais` · `…/zones` | `ws_delivery_zones` |
| `creneaux` | `GET /franchisee/creneaux` | `ws_slots` |
| `calendarRules` | `GET /franchisee/calendar-rules` | `ws_calendar_rules` |
| `pricing` | `GET /franchisee/pricing` | `ws_pricing_rules` (boutique + réseau) |
| `vouchers` | `GET /franchisee/vouchers` | `ws_vouchers` (boutique + réseau) |
| `assortiment` | `GET /franchisee/assortiment` | `ws_products` (+ `ws_product_shops`) |
| `dispoCat` | `GET /franchisee/dispo-cat` | `ws_categories` (+ compte `ws_products`) |
| `dispoProd` | `GET /franchisee/dispo-prod` | `ws_products` |
| `paiements` | `GET /franchisee/paiements` | `ws_param` (`pay.*`) |
| `remiseWebshop` | `GET /franchisee/remise-webshop` | `ws_param` (`webshop.*`) |
| `shopParams` | `GET /franchisee/shop-params` | `ws_param` (`shop.*`) |
| `bureauParams` | `GET /franchisee/bureau-params` | `ws_param` (`office.*`) |
| `coutTemps` | `GET /franchisee/cout-temps` | `ws_param` (`tour.*`, `cost.*`) |
| *(session)* | `GET /franchisee/me` | `shops` (libellé console + portée) |

Les valeurs renvoyées collent aux **maps de pills / seuils du design** (ex.
`mode`→`Livraison/Retrait`, `statut` incident→`Ouvert/En cours/Résolu`,
`etat` stock→`OK/Bas/Rupture`), donc **aucune adaptation côté front**.

## Contexte runtime (ex-hardcode)

- `brand.date` : plus jamais figée → **date runtime** (`bo_data.js` → `frDate()`).
- `brand.consoleLabel` : hydratée depuis `/franchisee/me` (portée boutique).
- `brand.user` : reste au seed tant que l'auth `bo_users` n'est pas branchée
  (le jeton admin ne porte pas d'identité utilisateur — cf. « en attente »).

## Pour activer côté serveur (config uniquement, pas de code)

1. **Déployer le webshop** (push `main`) → les routes `/franchisee/*` deviennent
   disponibles sous `<origin>/webshop/api`.
2. **`admin_token`** configuré dans `php-api/config.php` (déjà requis par tout
   `/admin/*` et `/franchisor/*`). Le front l'envoie via `X-Admin-Token`.
3. **Déployer le franchisé** → il hydrate tout seul dès que l'API répond et qu'un
   jeton est présent (`localStorage['adminToken']`, ou `?token=…` la 1re fois),
   avec `?shop=<slug>` pour la portée boutique.

Le workflow `.github/workflows/deploy.yml` copie désormais `api-config.js` +
`bo_data.js` dans le bundle et vérifie leur `200` à l'URL cible.

## Cohérence cross-projets 🔗

`base` = **la même** `<origin>/webshop/api` pour le webshop, le franchisor et le
franchisee. Les données partagées (commandes/CA, catalogue, bons, prix, bureaux)
sortent des **mêmes tables** (`ws_orders`, `ws_products`, `ws_vouchers`,
`ws_pricing_rules`, `ws_offices`…). Pas de source divergente.

## Reste à faire / en attente (avec raison)

- **Écritures** : increment 1 = **lecture** (hydratation). Toggles / formulaires /
  CRUD persistent encore en local ; au rechargement, la donnée serveur fait foi.
  Les `POST/PUT franchisee` (persister toggles, CRUD bureaux/sites/horaires…)
  réutiliseront `X-Admin-Token` + CSRF — incrément suivant, comme le franchisor.
- **Datasets restés sur seed** (pas de table/endpoint dédié pour l'instant) :
  - `kpisCap`, `kpisRenta` — vignettes KPI d'entête Capacité/Rentabilité (agrégats
    à définir ; les tables `capacite`/`couts` de ces écrans SONT câblées).
  - `horaires` — nécessite l'agrégation des fenêtres `ws_tour_availability`
    (jours/départ/retour par tournée) ; endpoint à écrire.
  - `joursExcept` — pas de table `ws_special_days` ; à dériver des exceptions
    calendrier (`ws_calendar_rules` / `ws_tour_closures`).
  - `reglesBoutique` — horaires d'ouverture boutique : source composite
    (disponibilité/calendrier) à consolider.
  - `frais`, `zones` — `ws_delivery_zones` ne porte que `name/active` ; franco,
    frais, CP, véhicule vivent ailleurs (barème livraison) → renvoyés `—` en
    attendant l'endpoint barème dédié.
  - `creneaux.cap` — `ws_slots` ne stocke pas de capacité (→ `0`) ; capacité fine
    dans `ws_tour_availability.max_items`, à joindre.
- **Identité utilisateur** (`brand.user`) : disponible quand l'auth `bo_users`
  (session BO `/bo/franchisee/*`) sera branchée au front — le jeton admin réseau
  ne porte pas d'utilisateur.

## Vérification

- **Rendu** (Playwright, Chromium) : mode seed → 30 écrans OK, valeurs seed ;
  mode API simulée → KPIs/commandes/console hydratés depuis l'API. Aucune erreur
  bloquante ; les fetch en échec retombent proprement sur le seed.
- **Backend** : `php -l php-api/index.php` → aucune erreur de syntaxe.
- **Déploiement** : bundle `site/` inclut `api-config.js` + `bo_data.js` ; served
  à `/webshop/backoffice_franchisee`, base API dérivée = `/webshop/api`.
