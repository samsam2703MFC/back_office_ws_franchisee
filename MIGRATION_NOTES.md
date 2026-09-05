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
  header `X-Admin-Token`, portée `?shop=<slug|id>`. **Aucun repli** : réponse
  non-2xx / non-tableau / absente ⇒ la table est **vide**.
- Timeout de boot 4 s : l'app démarre toujours, même API morte — elle démarre
  alors vide, ce qui est l'information juste.
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
| contexte | `/franchisee/me` | boutique de la portée — **`atelierbydb_shops`** |

### La boutique : `atelierbydb_shops`, et rien d'autre

L'**identité** de la boutique (enseigne, adresse, ville, code postal) vit dans
**`atelierbydb_shops`**. Elle était tenue en double — la table d'un côté, des
paramètres `ws_param` `shop.*` de l'autre — et les deux pouvaient se
contredire : la fiche affichait l'adresse saisie dans `ws_param`, les tournées
partaient de celle de la table. Le doublon est supprimé ; `ws_param` ne porte
plus aucune information de boutique.

Les **horaires** n'y sont pas : ils appartiennent à `fr_shop_availability`
(section suivante). La fiche boutique les affiche en lecture et renvoie vers
« Disponibilité & créneaux » — un horaire, un seul formulaire.

**Lecture** — `GET /franchisee/me?shop=<id>` rend la ligne :

```json
{"shop":{"id":2,"name":"…","address":"…","city":"…","cp":"1070",
         "lat":50.83,"lng":4.31,"geoSource":"address","geoReason":null}}
```

#### Aucun repli : la position vient de l'API, ou de nulle part

`geoSource` est décidé par le **serveur** : `address` / `manual` (exact) ou
`zip` (centroïde du code postal — signalé à l'écran). La page ne recalcule
rien : trois replis ont été retirés parce qu'aucun ne se distinguait d'une
vraie donnée une fois posé sur la carte —

| repli retiré | ce qu'il produisait |
| --- | --- |
| nom « Ma boutique » | une enseigne plausible pour une boutique non résolue |
| centroïde du CP recalculé dans la page | un pin « exact » à des kilomètres |
| position par défaut `50.85 / 4.35` | la boutique au centre de Bruxelles, tracés et ETA compris |

Sans `lat`/`lng` servis : **pas de pin**, un bandeau sur la carte portant le
`geoReason` du serveur, et **aucune ETA** — le premier trajet part de la
boutique, donc sans elle toutes les heures qui suivent seraient fausses.
L'écran « Livraison du jour » dit pourquoi il n'affiche pas de tournée au lieu
d'annoncer « aucune tournée assignée ». La vue initiale des cartes se centre
sur la boutique quand sa position est connue.

#### Le même principe, partout ailleurs

La règle vaut pour toute la console, pas seulement pour la boutique : **une
valeur que le serveur n'a pas servie ne se remplace pas**. Ce qui a été retiré
au-delà de `shops` —

| valeur | repli retiré | ce qu'il produisait |
| --- | --- | --- |
| position d'un **site de livraison** | `50.85 / 4.35` | des sites empilés au centre de Bruxelles, tracés et durées crédibles |
| position d'un **point de rentabilité** | `50.85 / 4.35` | même chose sur la carte de marge |
| **temps d'accès** d'un site | `10 min` | 10 minutes dans chaque ETA, affichées « 10 min » comme une mesure |
| **temps de dépôt** d'un bureau | `5 min` | idem, additionné à chaque arrêt |
| **heure de départ** d'une tournée | `08:00` | toutes les heures d'arrivée en découlaient |
| **capacité max** d'une tournée | `10` | une « surcapacité » annoncée sur un plafond que personne n'a fixé |
| **amplitude / décharge / trajet** | `240 / 18 / 12` | un dimensionnement de tournée jamais paramétré |
| **coûts** (prép., emballage, chargement, structure) | `26 / 0,42 / 24 / 38` | toute la rentabilité affichée reposait dessus |
| **véhicule / délai / service** d'une zone | `Standard / J+1 / 15` | des réglages de zone inventés |

Conséquences assumées : une **heure** n'est publiée que si tout ce qui la
détermine est connu (position boutique, position du site, temps d'accès, temps
de dépôt, heure de départ) — sinon « — » ; la **cascade de marge** est
remplacée par l'explication tant que les coûts ne sont pas paramétrés ; un site
sans coordonnées n'est pas dessiné et un bandeau le compte sur la carte.

**Écriture** — `POST /franchisee/shop-update?shop=<id>`

```json
{"shopId":2,"name":"…","address":"…","city":"…","zip":"1070"}   →   {"ok":true}
```

Une clé est **omise** quand la colonne n'est pas servie par `/me` **et** que le
champ est laissé vide : la console n'écrase pas d'une chaîne vide ce qu'elle ne
connaît pas. La portée reste décidée par le serveur — `shopId` est indicatif,
`?shop=` fait foi. Après un succès, la console relit `/franchisee/me` : la
fiche, le nav bar et le pin de départ des tournées repartent de la ligne
réellement écrite, sans rechargement. Un échec (404 route absente, 401, réseau)
est **affiché** et rien n'est reflété à l'écran — une valeur visible signifie
une valeur en base.

### Les horaires : `fr_shop_availability`, et rien d'autre

Jours ouverts, heures de début et de fin, durée de créneau, cut-off, délai et
capacité vivent dans **`fr_shop_availability`** (`ws_shop_availability`) —
c'est la source unique que le webshop lit pour fabriquer ses créneaux. Écran
« Disponibilité & créneaux » ; la fiche boutique les montre sans les éditer.

**Lecture** — `GET /franchisee/fr-shop-availability?shop=<id>`. La console
retient la ligne dont le `shop_id` est celui de la portée, pas la première
servie.

**Écriture** — `POST /franchisee/shop-availability?shop=<id>`

```json
{"shop_id":2,"collect_open_days":[1,2,3,4,5],
 "collect_hours_start":"07:30","collect_hours_end":"19:00",
 "collect_slot_duration_min":30,"collect_cutoff_hour":17,"collect_cutoff_minute":0,
 "collect_lead_hours":2,"collect_capacity_per_slot":12,"collect_enabled":1,
 "delivery_…": "idem"}   →   {"ok":true}
```

**Aucune valeur par défaut n'est écrite.** Le corps partait auparavant avec des
chiffres que personne n'avait saisis : durée de créneau vide ⇒ 60 min (120 en
livraison), capacité vide ⇒ 1, cut-off vide ⇒ minuit, et
`collect_enabled`/`delivery_enabled` forcés à `1` alors que l'écran n'a pas
d'interrupteur — on ouvrait la boutique au webshop en croyant régler des
horaires. Désormais : une clé vide que la base ne connaît pas n'est pas
envoyée ; un champ vidé par l'utilisateur l'est (`null` / `""`) pour effacer ;
une saisie non numérique est **refusée** avec son libellé, jamais convertie en
`0`. Les interrupteurs sont repris de la ligne servie. Après un succès, la
console relit `fr-shop-availability` ; le brouillon n'est effacé que si cette
relecture aboutit.

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
- Fiche boutique (modale Profil et écran « Paramètres du shop ») →
  `POST /franchisee/shop-update` : écriture réelle dans `atelierbydb_shops`,
  suivie d'une relecture de `/franchisee/me`. Avant, le formulaire n'avait
  aucune table cible : il annonçait « ✔ Enregistré » sans rien écrire, tandis
  que l'édition inline écrivait dans `ws_param`.
- Onboarding B2B (wizard) → `POST /franchisee/onboard-office` : création réelle
  `ws_offices` + `ws_office_delivery_sites` + départements (+ voucher si
  `ws_vouchers` est une table de base — c'est une vue ERP en prod, donc différé).
- Best-effort : hors-ligne/sans jeton ⇒ localStorage seul, comme avant.

## Vérifié (Playwright)

- Rendu seed complet (aucune erreur JS), navigation Paramétrage → Clients B2B →
  Bureaux & sites.
- Hydratation de bout en bout : client servi par l'API affiché à l'écran,
  seed remplacé ; 25 endpoints appelés ; API morte ⇒ seed intact.

## Recherche profonde (sidebar) — remplace « Retour à l'ERP »

Le lien de retour vers l'ERP en tête de nav cède la place à un champ de
recherche qui couvre **les menus, les sous-menus (onglets d'écran) et les
explications**.

- `searchDefs()` (à côté de `srcMeta`) déclare une entrée par écran ou par
  onglet réellement atteignable : `s` (écran), `tab` (`[clé d'état, valeur]`),
  `g` (chemin affiché), `grp` (groupe de nav à déplier), `meta` (clé `srcMeta`
  quand l'onglet a sa propre fiche), `k` (mots-clés métier que l'écran
  n'affiche pas : « carte », « rupture », « franco », « VIES »…).
- Le texte indexé est repris des tables existantes — `titles`, `subs` et
  `srcMeta` (origine des données + formule de calcul) : **un écran documenté
  une fois est cherchable, sans duplication de libellés**. La fiche générique
  de `srcMeta` (repli) est volontairement exclue de l'index, sinon elle fait
  remonter tous les écrans à la fois.
- Correspondance sans accents ni casse, **en début de mot** (« vies » trouve
  VIES, pas « servies ») ; tous les mots saisis doivent être trouvés ; le score
  privilégie le titre, puis les mots-clés, puis les explications. L'extrait
  affiché sous chaque résultat est la première explication qui contient
  réellement un des mots cherchés.
- Ouvrir un résultat pose l'écran, l'onglet, et déplie le groupe de nav
  correspondant. Clavier : ↑ ↓ pour parcourir, ⏎ pour ouvrir, Échap pour
  fermer.
- Ajouter un écran ⇒ ajouter une ligne dans `searchDefs()` (les libellés
  suivent `titles`/`subs`).

## Seed, maquette et fausses données — supprimés

Le module ne contient plus **aucune** donnée inventée, et plus aucun repli
dessus. Ce qui a été retiré :

- **`bo_server.js`** : les 45 tables de seed (355 lignes) sont supprimées,
  `SEED = {}`. `ensure()` ne recompose plus rien, `reset()` vide, et `hydrate()`
  écrit `[]` pour toute table que l'API ne sert pas — au lieu de garder le seed.
  La clé de stockage passe à `ws_bo_store_v9` et **les anciennes clés
  `ws_bo_store*` sont effacées au chargement** : le seed déjà persisté dans le
  navigateur d'un franchisé ne peut pas remonter.
- **Les données en dur de l'app** sont recalculées sur les vraies tables :
  `points()` (sites de livraison réels, géocodés par CP via `/geo/postcodes`,
  chiffrés par `fr_rentabilite`), `depot()` (la boutique de la portée, servie
  par `/franchisee/geo-clients`), `sitesData()` (zones par CP, arrêts par
  département), l'affectation site → tournée (`assign()`, lue sur
  `tournee_id`/`tour`), les listes déroulantes des formulaires, les trois
  analyses de rentabilité, le simulateur, la chaîne zone primaire/secondaire,
  les commandes du jour, le paiement différé, les tournées de l'onboarding,
  les statistiques réseau, la grille de remplissage, les jours d'ouverture,
  les demandes de nouveau bureau et les comptes utilisateurs.
- **L'identité affichée** (pastille et fiche profil) était une personne
  inventée : c'est désormais la boutique de la portée, ou « — ».
- **Les dates figées** (« jeudi 17 juillet 2026 », semaine « Lun 21 → Ven 25 »,
  `TODAY`) sont des dates réelles calculées à l'affichage.
- **Les deux graphes** de rentabilité : la cascade est construite sur le CA et
  les coûts réels (le détail par poste n'étant servi par aucune table, le coût
  de service reste en un bloc plutôt qu'une ventilation supposée) ; la courbe
  d'évolution vient de `fr_renta_evolution` et affiche « pas encore
  d'historique » à défaut.
- **Les valeurs préremplies** qui devenaient des enregistrements à
  l'enregistrement (franco « 250 € », remise « 10 % », enseigne et adresse du
  shop, noms de sociétés dans les `placeholder`) sont vides ou remplacées par
  une consigne de format.

Nouveaux endpoints attendus (tables vides tant qu'ils n'existent pas, sans
casse) : `fr-orders`, `users`, `fr-capacite`, `fr-new-offices`, `fr-net-stats`,
`ws-shop-hours`, `fr-renta-evolution`.

Restent en dur, et c'est voulu : l'UI pure (libellés de nav, filtres, titres et
sous-titres d'écran, textes d'aide) et les exemples de **format** dans les
`placeholder` (« ex. Lun–Ven », « ex. 1000 · 1020 »).

## Vérifié (Playwright) — après suppression du seed

- **API absente** : les 31 écrans parcourus, aucune erreur JS, tout est vide.
- **API présente** (fixture de test) : les tables sont hydratées et rendues —
  rentabilité 820 € de CA, 630 € de coûts, 190 € de marge, soit exactement les
  chiffres servis ; cut-off calculé sur `order.cutoff_default` ; identité et
  initiales prises sur la boutique servie.

## Écran « Avis clients »

Entrée de menu `Avis clients` (icône étoile) dans une section **Fidélité**,
écran `avis`.

- **Source** : `GET <base>/franchisee/reviews?shop=<id>`, en-tête
  `X-Admin-Token` comme le reste du module. Le chemin et le nom du paramètre
  de portée sont deux constantes en tête de classe (`REVIEWS_PATH`,
  `REVIEWS_SCOPE_PARAM`) : basculer vers `/admin/reviews?shopId=` est un
  changement d'une ligne.
- **Portée** : variante FRANCHISÉ — pas de sélecteur de boutique, la portée est
  toujours celle de la session. C'est le serveur qui doit la faire respecter :
  le jeton admin de cette installation est **réseau** (`/franchisee/me` rend
  `shop: null`), donc un endpoint qui se contenterait de lire l'id envoyé
  laisserait un franchisé lire une autre boutique.
- **Rendu** : 4 tuiles KPI (total · aimé · pas aimé · en attente), tableau des
  notes moyennes par produit trié en croissant — pastille rouge < 2,5, orange
  < 3,5, verte au-delà, plus 5 étoiles remplies à `round(note)` — et une carte
  par avis négatif (enseigne + date `AAAA-MM-JJ hh:mm`, une ligne par produit).
- **Pas de repli** : aucune donnée n'est déduite. Erreur serveur ⇒ bandeau qui
  distingue 401/403 (jeton), 404 (route absente) et le reste, avec le code
  HTTP. Tables vides ⇒ « Aucune note produit pour l'instant. » /
  « Aucun avis négatif 🎉 ».
- **i18n** : 22 clés, et l'allemand ajouté partout — la table complète compte
  38 clés en **FR / NL / EN / DE / PL**. Le sélecteur de langue, qui était
  calculé (`setLang`, `langStyles`) mais rendu nulle part, est posé en pied de
  barre latérale : sans lui `state.lang` ne quittait jamais `FR` et aucune
  traduction n'était atteignable.
  **Portée réelle de la traduction** : seules les chaînes passant par `tr()`
  suivent la langue. L'écran Avis est traduit de bout en bout ; le reste de la
  console garde environ 650 libellés écrits en dur dans le gabarit — le menu
  « Livraison du jour », par exemple, reste en français en DE. Traduire le
  module entier est un chantier à part.
- **Couleurs** : le design system n'a ni vert ni orange. Les trois états sont
  déclarés une fois en variables CSS (`--st-good` / `--st-warn` / `--st-bad`)
  dans le `<style>` du helmet ; les écrans n'écrivent plus d'hexadécimal.

## Lien d'invitation du personnel (« magic deep link »)

Le franchisé crée un bureau. Le bureau doit ensuite faire créer un compte à
chacun de ses collaborateurs. Le lien d'invitation supprime la saisie de
rattachement — **pas la validation**.

**Le serveur fait tout le travail** : `POST /franchisee/onboard-office` émet le
lien signé à chaque bureau créé et le renvoie dans `invite_url`, avec
`invite_expires_at` (date SQL) ou, s'il n'a rien pu émettre, `invite_reason`.
Il déduit lui-même le domaine e-mail imposé depuis `contactEmail`, sauf
messagerie grand public. Tout cela vit dans le dépôt **WebShop**
(`php-api/index.php`, migration `0062_office_invites.sql`).

Côté console, donc :

- **Aucune URL n'est fabriquée ici.** Une URL forgée par le navigateur serait
  une URL modifiable, et ses paramètres décident de qui facture. On affiche
  `invite_url` tel quel, dans une fenêtre avec bouton de copie ; sans lui, pas
  de fenêtre, et le message répète `invite_reason`.
- **Aucun interrupteur.** Le serveur émet le lien dans tous les cas ; une case
  à cocher n'éteindrait rien. Le récapitulatif ANNONCE ce qui va se passer.
- `OB_DOM_PUBLICS` est le **miroir exact** de `$grandPublic` côté serveur. Elle
  ne décide rien : elle sert à dire, avant validation, si le lien sera restreint
  à `@domaine` ou **émis sans restriction** — cas d'un contact en `gmail.com`,
  où n'importe quelle adresse pourra s'en servir. C'est précisément ce qu'il
  faut annoncer, pas taire.

**La page « Créer mon compte » n'est pas dans ce dépôt.** Elle vit dans WebShop
(`public/inscription.html`, servie à `<racine>/inscription?i=<jeton>`, appelant
`GET`/`POST <racine>/api/inscription`) : elle est autonome, sans script ni
police externes — une page ouverte depuis un e-mail, souvent sur un téléphone
derrière un filtre d'entreprise, ne peut pas dépendre d'un CDN. Une seconde
copie ici serait l'incident nº 2 du CLAUDE.md.

Ce qui reste vrai dans les deux dépôts : le compte créé entre en `pending` dans
`ws_office_join_requests` et n'achète rien avant que le franchisé l'ait validé
dans « Demandes de rattachement bureau ». Sans cela, quiconque reçoit le lien
transféré commanderait en paiement différé sur le compte de l'entreprise.
**Le lien fait gagner la saisie, pas le contrôle.**

## L'assistant est passé sous « Offices »

Il se lançait depuis **Clients B2B › Clients**, par un bouton
« + Nouveau client B2B ». Or il ne crée pas un client : il crée un **bureau**
— office, delivery site, départements, contact, conditions, vouchers, lien
d'invitation. Un client B2B, c'est la **personne** qui travaille dans ce
bureau, et elle ne se saisit pas ici : elle crée son compte depuis le lien
d'invitation, puis apparaît dans « Demandes de rattachement bureau ».

- **Offices** porte désormais deux boutons : *+ Onboarder un bureau*
  (l'assistant complet) et *+ Office seul* (la ligne `ws_offices` nue).
- **Clients** ne propose plus de créer un bureau : le bouton mène aux
  demandes de rattachement, par où les personnes arrivent réellement.
- L'assistant pose la ligne `ws_offices` en local (`refresh`, pas `save` : le
  serveur la crée déjà via `onboard-office`, un `save` en ferait deux) et
  atterrit sur Offices — le bureau créé s'y voit tout de suite, en attente.

## Vouchers : autant que nécessaire

L'étape « Webshop & voucher » n'acceptait qu'un bon, et en créait un **même
quand personne n'en avait demandé** : `BIENVENUE4821` naissait à chaque
bureau, partait dans le courrier et engageait la boutique sur une remise que
le franchisé n'avait pas choisie. La valeur par défaut « −10 % sur la première
commande » est retirée avec lui.

Désormais : une liste (libellé · code · valeur · validité), le code dérivé du
libellé s'il est laissé vide, et **aucun voucher si aucun n'est ajouté**. Le
brouillon rempli mais non ajouté est repris à la création plutôt que perdu en
silence. Le corps posté porte `vouchers[]` (liste complète) et garde
`voucher{}` = le premier, pour un serveur qui ne lirait que celui-là —
`null` si la liste est vide.

Côté serveur (dépôt WebShop) : `onboard-office` lit `vouchers[]` et les insère
tous, `vouchers_created` donne le compte.

## Le courrier de bienvenue est vraiment envoyé

Les deux interrupteurs du récapitulatif — « Envoyer l'e-mail récapitulatif au
contact » et « Envoyer les demandes d'adhésion » — **n'étaient pas postés**.
Le serveur n'en savait rien, n'envoyait rien, et le franchisé croyait le bureau
prévenu : il attendait une commande qui ne pouvait pas venir. Le corps de
`onboard-office` porte désormais `sendMail` et `sendAdhesion`.

Côté serveur (dépôt WebShop) : `mail_render()` + `send_html_mail()` dans
`lib.php`, gabarit `php-api/mail/bienvenue-bureau.html`, envoi au contact à la
création — **sur demande explicite seulement**. La réponse dit ce qui s'est
passé : `mail_sent`, `mail_to`, `mail_reason`.

La console le répète, courrier et lien **dans un seul message** : deux
`printJob` successifs ne laissent voir que le second, et l'avertissement sur le
courrier disparaissait derrière celui du lien.

## Écran « Stats réseau » — CA par boutique, Livraison et Webshop

L'écran ne portait que quatre vignettes génériques (`fr_net_stats` rendait des
paires `{k, v, sub}`, des libellés d'affichage plus qu'une donnée) et trois
boutons d'export **qui n'exportaient rien** : ils affichaient « Export généré »
et s'arrêtaient là. Les uns et les autres sont partis.

Il montre désormais une seule chose : le **chiffre d'affaires par boutique du
réseau**, en Livraison et en Webshop, sur la **semaine** ou le **mois**. Une
carte par boutique, classées sur la livraison, deux jauges par carte, la
boutique de la portée mise en évidence.

### Contrat attendu

`GET <base>/franchisee/fr-net-stats?shop=<id>` — en-tête `X-Admin-Token` comme
le reste du module. **Une ligne par boutique du réseau** :

```json
[{ "shop_id": 2, "shop_name": "Anderlecht",
   "livraison_semaine": 6180, "webshop_semaine": 2940,
   "livraison_mois": 25600,  "webshop_mois": 11340 }]
```

- Les montants sont des **nombres** (euros). `null` = non servi : affiché « — »,
  jamais remplacé par `0` — une absence n'est pas un chiffre d'affaires nul.
- Les alias camelCase (`livraisonSemaine`…) et `shopId` / `shopName` / `name`
  sont acceptés ; rien d'autre.
- Une ligne sans nom **ni** montant n'est pas rangée au classement : deux
  tirets à la place d'une boutique laisseraient croire à une boutique à zéro.
- La **fenêtre** (quelle semaine, quel mois) est celle de l'ERP. La console ne
  la recalcule pas et ne l'affiche donc pas : dater un agrégat qu'on n'a pas
  fait, c'est le genre de détail qui finit par être faux sans que personne ne
  le voie. Si la fenêtre doit être montrée, elle devra venir de l'endpoint.

### Deux mesures qui se recoupent — donc aucun total

Une commande porte un **mode** (Livraison / Retrait) *et* une **source**
(Webshop / comptoir) : une commande webshop peut très bien être une livraison.
Les additionner compterait deux fois le même euro. Il n'y a donc **pas de « CA
total » par carte**, le classement se fait sur la **livraison** seule, et les
deux totaux réseau restent séparés — l'écran le dit en toutes lettres sous les
totaux, pour que personne ne refasse l'addition à la main.

Un total auquel il manque une boutique est **sous-évalué** et rien ne le
dirait : les boutiques sans montant sur un canal sont comptées et signalées à
côté du total.

### Ce que l'écran dit quand il n'a rien

Deux absences distinctes, deux phrases distinctes — « rien à afficher » sur une
route qui a répondu envoie chercher la panne du mauvais côté :

- route muette : « GET /franchisee/fr-net-stats n'a rendu aucune ligne pour
  cette portée » ;
- mauvaise forme (l'ancienne, par exemple) : « L'ERP a rendu N ligne(s), mais
  aucune ne porte les champs attendus : … », les champs étant nommés.

### Couleurs

Bordeaux L'Atelier `#A82A3C` (Livraison) et bleu « source » `#3A6FB0`
(Webshop) — les teintes des pastilles Livraison / Webshop de l'écran
Commandes, d'un cran plus claires pour tenir la bande de clarté. Séparation
daltonisme ΔE 18,3 (deutan) / 25,0 (vision normale), contraste ≥ 3:1 sur le
blanc. Les deux jauges partagent **une seule échelle** — une référence par
canal aurait mis deux axes dans la même carte — et cette référence (le plus
haut montant du réseau sur la période) est écrite au-dessus de la grille.

### D'où viennent les chiffres : `shops/{id}/transactions`, sur l'ERP

Route lue dans le dépôt **WebShop** (`php-api/erp_alias.php`, `php-api/index.php`).
`/api/v1` **n'appartient pas au webshop** : c'est l'API de l'ERP *Franchise
Buddy*, un hôte tiers dont l'adresse vit dans `ws_param.erp_api_base`.

**Le navigateur ne peut pas l'appeler, et ne le pourra jamais.** Elle
s'authentifie au **Bearer**, et ce jeton est un secret de serveur :
`ws_param.erp_api_token`, ou une reconnexion consultant automatique
(`erp_auth_phone` / `erp_auth_password`, jeton de 30 min mis en cache dans
`sys_get_temp_dir()`). Le poser dans la console reviendrait à le distribuer à
chaque franchisé, avec la lecture de tout le réseau au bout. Le débat
« agréger dans le navigateur ou côté serveur » est donc tranché par
l'architecture, pas par le goût : **c'est le PHP qui agrège**, la console lit
`/franchisee/fr-net-stats` (contrat ci-dessus).

Bonne nouvelle : le client existe déjà et fait tout le travail —

```php
$tx = erp_get('shops/' . $shopId . '/transactions');   // php-api/erp_alias.php
```

`erp_get()` pose le Bearer, se reconnecte une fois sur 401, met en cache
`ttl` secondes, et journalise ses échecs dans `erp_notes()` — que `/catalog/*`
ressert déjà pour que le bandeau du webshop reste crédible. Il n'y a pas
d'authentification à réécrire.

### Ce qui manque encore : le nom des champs

Aucun code n'a jamais appelé cette route — ni dans WebShop, ni ici. Personne ne
connaît donc le nom du champ qui porte le montant, celui qui distingue une
livraison, ni ce que l'ERP compte comme chiffre d'affaires (TTC ou HTVA,
remboursements, commandes annulées). Les deviner reviendrait à inventer un
chiffre d'affaires, et **cela ne se verrait pas** : un mauvais nom de champ
rend `0`, pas une erreur.

`check-endpoints.yml` va les chercher, depuis le serveur, **par le client du
webshop** (`erp_get`) plutôt qu'en refaisant l'authentification en shell. Il
publie l'adresse ERP, le mode d'authentification, la forme de la racine et
**les noms de champs seuls** — jamais une valeur, jamais le jeton, et les clés
purement numériques sont écartées (un objet indexé par id de transaction en
aurait fait sortir la liste des ids). L'appel est fait avec `ttl = 0` : il ne
laisse rien dans le cache disque du webshop qui servirait ensuite de réponse à
un vrai visiteur.

Onglet Actions → « Vérifier les endpoints /franchisee/* » → Run workflow, en
saisissant l'id de boutique. Sortie attendue :

```
== ERP — transactions par boutique (source des Stats réseau) ==
  base : https://…/api/v1
  auth : reconnexion consultant automatique
  OK   shops/2/transactions
       racine : objet
       champs : channel created_at currency customer data delivery_mode
                email id meta name per_page reference shop_id status
                total_excl_vat total_incl_vat
```

Vérifié en local contre le VRAI `erp_alias.php` et un faux ERP : jeton posé,
jeton refusé (401), ERP injoignable, ERP non configuré — et aucun montant,
client, référence ni jeton dans la sortie.

## Un site est un ZONING, et il a plusieurs bureaux (assistant tournée)

Un **site n'est pas un bâtiment** : c'est une **zone économique** — un zoning,
un parc d'activité, un immeuble — où le camion s'arrête **une fois** pour
toutes les sociétés qui s'y trouvent, chacune à **son** adresse.

`ws_office_delivery_sites` porte une ligne par **couple (site, bureau)** :
l'onboarding d'un bureau (`POST /franchisee/onboard-office`, champ `adr`) y
écrit une ligne avec l'adresse de CE bureau et le nom du site où il se trouve.
Un zoning à trois sociétés y occupe donc trois lignes, **de même nom et
d'adresses distinctes**.

L'assistant tournée lisait ces lignes telles quelles. À l'écran : le même
zoning listé trois fois dans les arrêts, un menu déroulant qui n'acceptait
qu'**un** bureau par ligne, « 3 site(s) » pour une seule zone. Et dans l'ETA,
trois trajets, trois temps d'accès et trois temps de dépôt pour un seul arrêt ;
l'ordre d'arrêts proposé par Google s'écrivait sur ces doublons.

### Ce qui identifie un site : son nom

C'est le seul champ que ses lignes partagent — l'adresse, non. Les lignes de
même nom (sans accents ni casse) sont regroupées en **un arrêt** qui porte :

- `officeIds[]` — les sociétés desservies, ajoutées et retirées une par une ;
- `rowIds[]` / `rowByOffice{}` — les lignes de la table qui le composent ;
- `rowAdr{}` — **l'adresse propre de chaque ligne**, conservée telle quelle ;
- `adrDirty` — vrai seulement si l'adresse de l'arrêt a été **réécrite** à
  l'étape 2.

À défaut de nom, l'adresse sert de clé ; sans nom **ni** adresse, deux lignes
ne sont jamais fusionnées.

### Ce qui est réécrit, et ce qui ne l'est pas

À l'enregistrement, l'arrêt est **redéployé** en lignes : une par bureau, une
seule s'il n'en a aucun. Chaque bureau reprend la ligne qui le portait déjà —
mise à jour, pas suppression + création — **avec son adresse**. Écrire
l'adresse de référence de la zone sur toutes ses lignes remplacerait l'adresse
de livraison de chaque société par celle de sa voisine.

- **Bureau déjà rattaché** → sa ligne, son adresse, inchangées.
- **Bureau nouvellement rattaché** → une ligne neuve avec l'adresse que
  `ws_offices` lui connaît (sa vraie porte) ; si elle est inconnue, l'adresse
  de référence de la zone, qui situe au moins le bureau.
- **Adresse de l'arrêt réécrite à l'étape 2** (`adrDirty`) → elle se porte sur
  toutes les lignes du site. C'est un choix explicite, et l'étape 3 l'annonce.
- **Ligne qu'aucun bureau ne réclame plus** → `removeSites`. Annoncé aussi,
  avant l'enregistrement, jamais après.

**Le corps posté à `POST /franchisee/tour-wizard` garde exactement la forme que
le serveur connaît** (`sites[]` avec `id` et `officeId`) : il y a seulement
autant d'entrées que de couples. Aucun changement côté WebShop.

Autre conséquence voulue : le temps de dépôt d'un arrêt est la **somme** de
ceux de ses bureaux — le chauffeur qui livre trois sociétés dans la même zone
s'y arrête trois fois ; une zone sans bureau garde le standard réseau
(`DROP_STD`).

### Les trois écrans partagent enfin une clé : `siteKey()`

L'écran **Sites**, l'écran **Offices** (étape 3) et l'assistant tournée
groupaient chacun à leur façon — les deux premiers par **adresse**, l'assistant
par ligne. `siteKey(r)` est désormais la seule définition : le **nom** de la
zone, l'adresse à défaut, `''` quand la ligne n'a ni l'un ni l'autre (à
l'appelant de décider). `twSiteKey()` et le `bKey()` d'Offices s'y ramènent.

Sur l'écran **Sites**, une vignette = une zone. Elle porte les adresses de la
zone (la première, puis « +N autre(s) adresse(s) »), les temps d'accès
réellement saisis (« 6′ / 8′ » quand les lignes divergent, plutôt qu'une valeur
élue au hasard) et la **liste des sociétés desservies**, chacune à son adresse.
Rattacher une tournée, déplacer la zone par ⠿ et supprimer portent sur
**toutes** ses lignes. Sur l'écran **Offices**, une carte site = une zone, et le
sélecteur « → Assigner à un site » n'offre plus la même zone N fois.

### Deux bugs de fond corrigés au passage

**1. Écriture par indice sur une liste filtrée.** L'écran Sites travaille sur
`sitesActifs()` — filtré — mais écrivait dans la table brute avec l'indice de
la liste affichée (`tourSet`, `del`, `dndSite`, et `submitForm` via
`formIndex`). Un seul site **désactivé** plus haut dans la table décalait tout.
Reproduit au navigateur sur la version d'avant, avec un site désactivé en tête :
rattacher une tournée l'écrivait sur le site désactivé (la zone visée ne
bougeait pas), et supprimer « Parc de Gembloux » effaçait la ligne d'une
**autre** zone en laissant la cible en place. Tout passe désormais par
l'**identifiant** de ligne ; l'indice ne reste qu'en repli pour les tables sans
`id`.

**2. Renommer une zone la coupait en deux.** Le nom identifie le site : ne le
changer que sur la ligne éditée aurait fait deux arrêts d'un seul, avec les
sociétés réparties entre les deux. Le nom et la tournée se propagent donc à
toutes les lignes de la zone ; l'adresse, l'étage, le temps d'accès et la
société restent propres à la ligne.

### L'alerte « sites en double » ne crie plus au loup

Elle signalait **toute** répétition d'adresse. Or plusieurs lignes à la même
adresse sont la représentation normale de plusieurs sociétés dans un immeuble :
l'alerte envoyait « nettoyer » un paramétrage correct. Elle ne compte plus que
les vrais doublons — la **même société deux fois sur la même zone**, ou deux
lignes sans société.

### Ce qui n'a pas changé

`sitesData()` groupe toujours par **adresse** : c'est elle qui alimente les
cartes, la chronologie et les ETA de l'écran Tournées, où un bureau à plus de
60 m de son site devient déjà un arrêt à part entière (`tourPoints`). Le grain
y est donc « point de livraison », volontairement plus fin que la zone.

Vérifié au navigateur (API absente, tables `ws_*` posées à la main) : un zoning
à trois sociétés et trois adresses → 1 arrêt ; l'adresse propre de chaque
société affichée sous son nom ; rattachement d'une société qui a son adresse
(elle la garde) et d'une autre qui n'en a pas (repli sur la référence de la
zone) ; détachement ; et le corps réellement posté, ligne par ligne.
