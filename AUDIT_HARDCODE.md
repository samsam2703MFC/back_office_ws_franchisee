# AUDIT_HARDCODE — `backoffice_franchisee`

> Étape 1 (cartographie + audit). **Aucun refactor appliqué à ce stade.**
> À valider avant câblage data-layer (étape 3).
> URL cible : `http://185.180.206.46/webshop/backoffice_franchisee`.

## 0. Constat central

Le back-office franchisé **n'est pas** data-driven au sens du franchiseur.

- `app.js` est un **moteur de rendu générique sans donnée métier** (bien) : icônes,
  cellules, formulaires, toggles — tout est piloté par une config.
- **MAIS 100 % des données sont figées dans `data.json` statique** (73 Ko) : KPIs,
  commandes, stock, tournées, bureaux B2B, incidents, frais, zones, créneaux, bons,
  assortiment, paiements, paramètres, **et l'utilisateur/la date d'en-tête**.
- **Aucune** hydratation, **aucun** `api-config.js`, **aucun** jeton, **aucun**
  `fetch` vers l'API réelle. `boot()` fait `fetch('./data.json')` — point.

À l'inverse, le **franchiseur** (`back_office_ws_franchisor`) hydrate la vraie base
avant le boot : `api-config.js` → `window.__FR {base, token}`, puis
`BOServer.hydrate()` fait `fetch(<base>/franchisor/<table>)` avec `X-Admin-Token` et
**repli seed par table**. C'est ce pattern qu'il faut reproduire ici.

> **Le câblage = introduire la même couche « serveur » (seed = `data.json`
> actuel) qui hydrate depuis l'API réelle, SANS toucher au moteur de rendu ni au
> design.** Chaque écran nomme déjà sa table cible (badge mono affiché sous le
> titre) — ce ne sont donc pas des devinettes.

## 1. Ce qui existe déjà côté serveur (WebShop `php-api`)

Deux générations d'API cohabitent dans `php-api` :

| Génération | Préfixe | Garde / jeton | Utilisé par |
| --- | --- | --- | --- |
| **G1 (legacy)** | `/franchisor/*` (dans `index.php`) | `require_admin()` → header **`X-Admin-Token`** | le **front franchiseur déployé** (via `?token=…`) |
| **G2 (isolée)** | `/bo/<role>/*` (dans `bo/routes.php`) | `require_bo()` → **session cookie HMAC** par BO (+ Bearer de secours) | non branché depuis un front à ce jour |

**Bonne nouvelle** : `bo/routes.php` contient déjà, en SQL réel et scopé aux
boutiques du franchisé (`bo_user_shops`), les routes d'**exploitation** :
`/bo/franchisee/{dashboard, orders, tours, stock, catalog, b2b, incidents, live,
rentability, rentability-tree, dashboard-tree, shops, scope}`.

En revanche **aucune** route `/franchisee/*` n'existe en **G1** (jeton admin), et
les écrans de **paramétrage** (horaires, frais, zones, créneaux, bons, assortiment,
paiements, params…) n'ont pas encore de route back-office franchisé dédiée —
plusieurs correspondent toutefois à des endpoints **publics `?shopId=`** existants.

## 2. Audit du hardcode — écran par écran

Toutes les données ci-dessous vivent **en dur dans `data.json`** (dataset nommé).
« Table réelle » = table effectivement présente dans `backend/schema` /
`php-api/migrations` (le badge du design est parfois un nom idéalisé).
« Endpoint » = route déjà disponible, ou **[à ajouter]**.

### 2a. Exploitation

| Écran | dataset(s) | Badge design | Table réelle | Endpoint |
| --- | --- | --- | --- | --- |
| Tableau de bord (`tdb`) | `kpis`, `orders` | — / (commandes) | agrégat `ws_orders` | `/bo/franchisee/dashboard` + `…/orders` ✅ |
| Préparation (`prep`) | `prep` | `ws_prep_lists` | dérivé `ws_orders` (par tournée/zone) | **[à ajouter]** `/franchisee/prep` |
| Livraison du jour (`suivi`) | `suivi` | `ws_tour_runs (live)` | `ws_tours` + `ws_tour_tracking` | `/bo/franchisee/live` ✅ |
| Stock du jour (`stockJour`) | `stock` | `ws_stock` | `ws_product_stock` | `/bo/franchisee/stock` ✅ |
| Demandes B2B (`demandesB2B`) | `b2b` | `ws_office_requests` | `ws_office_join_requests` | `/bo/franchisee/b2b` ✅ |
| Incidents & litiges (`incidents`) | `incidents` | `bo_incidents` | `ws_incidents` | `/bo/franchisee/incidents` ✅ |

### 2b. Analytique

| Écran | dataset(s) | Table réelle | Endpoint |
| --- | --- | --- | --- |
| Capacité · remplissage (`capacite`) | `kpisCap`, `capacite` | `ws_tours` + `ws_orders` (fill) | dérivé `/bo/franchisee/tours` ✅ (KPIs à agréger) |
| Rentabilité (`rentabilite`) | `kpisRenta`, `couts` | `ws_orders` + `ws_param` (`cost_*`) | `/bo/franchisee/rentability(+ -tree)` ✅ |

### 2c. Livraison (paramétrage)

| Écran | dataset | Badge design | Table réelle | Endpoint |
| --- | --- | --- | --- | --- |
| Tournées (`tournees`) | `tours` | `ws_tours · ws_tour_stops` | `ws_tours` (+ arrêts dérivés) | `/bo/franchisee/tours` ✅ |
| Horaires tournées (`horaires`) | `horaires` | `ws_tour_schedules` | `ws_tour_availability` (fenêtres/jours) | **[à ajouter]** `/franchisee/schedules` |
| Fermetures (`fermetures`) | `fermetures` | `ws_tour_closures` | `ws_tour_closures` | **[à ajouter]** `/franchisee/closures` |
| Bureaux B2B (`clients`) | `bureaux` | `ws_offices · bo_office_users` | `ws_offices` (+ clients liés) | public `/offices?shopId` ou **[à ajouter]** |
| Emails bureau (`emailsBureau`) | `emails` | `ws_email_templates` | `ws_email_templates` | `/franchisor/email-templates` (partagé) ✅ |
| Sites de livraison (`sites`) | `sites` | `ws_office_delivery_sites` | `ws_office_delivery_sites` | **[à ajouter]** `/franchisee/sites` |
| Param. par bureau (`bureauParams`) | `bureauParams` | `ws_office_params` | colonnes `ws_offices` / `ws_param` | **[à ajouter]** `/franchisee/office-params` |
| Frais de livraison (`frais`) | `frais` | `ws_delivery_fees` | `ws_delivery_zones` (franco/frais) | public `/delivery-zones` ✅ |
| Zones (`zones`) | `zones` | `ws_tour_zones` | `ws_delivery_zones` | public `/delivery-zones` ✅ |
| Coût-temps (`params`) | `coutTemps` | `ws_tour_costs` | `ws_param` (`cost_*`) | **[à ajouter]** `/franchisee/costs` (ou `/params`) |

### 2d. Horaires boutique

| Écran | dataset | Badge design | Table réelle | Endpoint |
| --- | --- | --- | --- | --- |
| Disponibilité boutique (`reglesBoutique`) | `reglesBoutique` | `ws_shop_hours` | `ws_tour_availability` / calendrier | public `/availability/*` ✅ |
| Règles calendrier (`calendarRules`) | `calendarRules` | `ws_calendar_rules` | `ws_calendar_rules` | public `/calendar/*` ✅ |
| Jours exceptionnels (`joursExcept`) | `joursExcept` | `ws_special_days` | `ws_calendar_rules` (exceptions) | public `/calendar/exceptions` ✅ |
| Créneaux (`creneaux`) | `creneaux` | `ws_slots` | `ws_slots` | public `/slots?shopId` ✅ |

### 2e. Promotions & bons

| Écran | dataset | Table réelle | Endpoint |
| --- | --- | --- | --- |
| Règles de prix (`pricingRules`) | `pricing` | `ws_pricing_rules` | `/franchisor/pricing-rules` (partagé) ✅ ou public `/pricing/*` |
| Bons / codes (`vouchers`) | `vouchers` | `ws_vouchers` | `/franchisor/vouchers` (partagé) ✅ |
| Remise webshop (`remiseWebshop`) | `remiseWebshop` | `ws_param` | `/franchisor/params` (partagé) ✅ |

### 2f. Assortiment & dispo

| Écran | dataset | Badge design | Table réelle | Endpoint |
| --- | --- | --- | --- | --- |
| Assortiment boutique (`assortiment`) | `assortiment` | `ws_products (boutique)` | `ws_products` + `ws_product_shops` | public `/catalog/products?shopId` ✅ |
| Dispo par catégorie (`dispoCat`) | `dispoCat` | `product_categories` | `ws_categories` | public `/catalog/categories?shopId` ✅ |
| Dispo par produit (`dispoProd`) | `dispoProd` | `ws_products` | `ws_products` | public `/catalog/products?shopId` ✅ |

### 2g. Paiements / Paramètres du shop

| Écran | dataset | Badge design | Table réelle | Endpoint |
| --- | --- | --- | --- | --- |
| Moyens de paiement (`paiements`) | `paiements` | `ws_payment_methods` | profils paiement / config `ws_param` | public `/payment-methods?shopId` ✅ |
| Coordonnées & branding (`shopParams`) | `shopParams` | `ws_param` | `ws_param` + `ws_shops` (coordonnées) | `/franchisor/params` + `/shops` ✅ |

### 2h. Contexte runtime en dur (à ne pas laisser figé)

| Fichier | Donnée en dur | Cible |
| --- | --- | --- |
| `data.json` → `brand.user` | « TL · Thomas Legrand · Gérant franchisé » | session `/bo/franchisee/me` (ou `/me`) |
| `data.json` → `brand.date` | « jeu. 17 juil. 2026 » | date runtime (`new Date`) |
| `data.json` → `brand.consoleLabel` | « Console franchisé · Uccle » | dérivé de la boutique en portée (scope) |

### 2i. Constantes UI pures — **restent en dur** (hors périmètre DB)

`theme`/`palette` (tokens couleurs), `nav` (libellés/icônes/ordre des écrans),
`screens[*].columns` (schémas de colonnes, largeurs, seuils de couleur, `statusMap`,
`pill` maps), `forms[*]` (définitions de formulaires), icônes SVG (`ICONS` dans
`app.js`), styles inline. Ce sont la **structure/présentation**, pas de la donnée
métier → aucun câblage.

## 3. Ce que sera le câblage (étape 3)

Reproduire **exactement** le pattern franchiseur :

1. **`api-config.js`** (nouveau) → `window.__FR = { base, token }`
   - `base` = same-origin `<origin>/webshop/api`, dérivée en retirant
     `/backoffice_franchisee` du path (repli `*.github.io` → mode seed).
   - `token` = `localStorage['adminToken']` (partagé par origine avec le
     franchiseur / l'admin webshop). Overrides de test : `?api=…&token=…`.
   - portée boutique : `?shop=<slug>` (ou dérivée du jeton) pour la Console
     franchisé, mono-boutique.
2. **Couche « serveur »** (nouveau, ex. `bo_data.js`) : `SEED = data.json`, une
   fonction `hydrate()` qui `fetch` chaque dataset depuis l'API réelle avec
   `X-Admin-Token` et **repli seed par dataset** (aucun écran ne casse jamais).
   Le moteur `app.js` lit la donnée hydratée au lieu du `data.json` brut — **le
   JSX/CSS/forms ne changent pas**.
3. **Endpoints** : réutiliser l'existant (`/bo/franchisee/*`, publics `?shopId=`,
   `/franchisor/*` partagés) et **ajouter** les routes manquantes marquées
   **[à ajouter]** ci-dessus (SQL déjà écrit pour l'essentiel dans `bo/routes.php`).
4. **Livrable** : `MIGRATION_NOTES.md` (endpoints ↔ datasets ↔ tables, jeton,
   déploiement) — comme le franchiseur.

## 4. Points à trancher AVANT câblage (⚠ ne rien deviner)

1. **Jeton / portée.** Le franchiseur déployé marche via `?token=…` (admin,
   réseau). Le franchisé est **mono-boutique** (« · Uccle »). → mécanisme retenu :
   même `X-Admin-Token` + `?shop=<slug>` (G1, mirroring franchiseur) **ou** la
   session isolée `/bo/franchisee/*` (G2, cookie). Cf. §5.
2. **Génération d'API.** Brancher sur **G1** (ajouter des `/franchisee/*` en
   `require_admin`, réutilisant le SQL de `bo/routes.php`) **ou** sur **G2**
   (`/bo/franchisee/*` déjà là pour l'exploitation, à compléter pour le
   paramétrage). Un seul choix pour rester cohérent.
3. **Écritures.** Comme le franchiseur, l'incrément 1 est en **lecture**
   (hydratation) ; toggles/formulaires/CRUD persistent d'abord en local, puis
   `POST/PUT` en incrément suivant. À confirmer si les écritures sont attendues
   dès maintenant.

## 5. Recommandation

**Mirror strict du franchiseur (G1, `X-Admin-Token`)** : c'est ce que dit le brief
(« même gestion du jeton d'accès ») et c'est ce qui marche à l'URL de référence
`?token=…`. On ajoute les `/franchisee/*` manquants en `require_admin` (réutilisant
le SQL `bo/routes.php`, network-scopé + `?shop=`), et le front franchisé reçoit
`api-config.js` + couche d'hydratation seed-fallback. Les écrans dont la table
n'existe pas encore (prep dérivé, office-params, tour-costs…) restent sur seed et
sont documentés « en attente » avec la raison — exactement comme le franchiseur.
