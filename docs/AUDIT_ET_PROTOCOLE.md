# Audit « données vraies » + protocole de test — 13/08/2026

Trois surfaces, une seule question : **est-ce que ce que l'écran affiche vient
de la base, ou est-ce que le code l'a fabriqué ?** Puis : **comment le vérifier,
flux par flux.**

Périmètre : webshop (`/workspace/webshop`), console franchisé
(`back_office_ws_franchisee`), console marque (`back_office_ws_franchisor`) et
l'API PHP partagée (`php-api/index.php`).

Chaque constat porte son emplacement (`fichier:ligne`) : il se vérifie, il ne se
croit pas.

---

## 0. Ce qui est déjà propre

À dire d'abord, parce que cela fixe la référence : les trois couches de données
partent **vides** et se remplissent par l'API.

| Surface | Couche | État |
| --- | --- | --- |
| Console franchisé | `bo_server.js` — `SEED` | toutes les tables à `[]`, hydratation `/franchisee/*`, échec **affiché** |
| Console marque | `bo_server.js` — `SEED` | idem, hydratation `/franchisor/*` |
| Menus (marque) | `menu_seed.js` | vidé (`_categories: {}`), source = `/franchisor/menus` |
| Webshop | `W_PRODUCTS`, `W_CATEGORIES`, `W_ASSORTMENTS` | tableaux **vides** — le catalogue vient de `WSCatalog` |
| Commandes | `POST /orders` | prix **recalculés serveur** depuis l'ERP (`shop_product.portion_price`) ; le total posté par le navigateur n'est pas cru |

Le bandeau d'erreur des deux consoles est alimenté par les échecs réels
(chargement **et** écriture), et la sonde `check-endpoints` interroge les
endpoints depuis le serveur. C'est une base saine : les constats ci-dessous sont
des **restes**, pas un état général.

---

## 1. Constats — par gravité

### 1.1 ✅ CORRIGÉ (13/08) — Le total affiché au client n'est pas celui qui est facturé

`webshop-full-bundle.jsx:3601`

```js
onPlaced({ ...result, slot, payment, paymentLabel: payLabel, total });
```

`result` est la réponse du serveur — qui contient **son** total. `total`, écrit
après le spread, est celui calculé dans le navigateur : il **écrase** celui du
serveur. Or le serveur applique une remise que le front n'affiche jamais :

- `php-api/index.php:2205` lit `shops.discount_type` / `discount_value` et
  calcule `$webshopDisc` ;
- `php-api/index.php:2537` l'enregistre (`webshop_discount`) et en déduit
  `total` ;
- côté front, `const promo = 0;` (`webshop-full-bundle.jsx:1472` et `:3516`) :
  la ligne « Réduction Webshop · 5 % » existe (`:1559`, `:4261`) mais n'est
  **jamais** atteinte.

**Conséquence** — une boutique qui a une remise webshop facture moins que ce que
le client a vu, et la page de confirmation lui répète le montant d'avant remise.
L'écart est en faveur du client, ce qui le rend silencieux : personne ne le
signalera. Et l'affiche d'invitation, elle, **annonce** cette remise
(« Remise négociée 7 % »).

**Corrigé** (webshop `01125bb`) : une seule addition, `wsTotaux()`, miroir
littéral de celle du serveur — lue par le panier ET par le tunnel (qui, lui,
oubliait aussi l'offre croisée : le total remontait au passage au paiement). La
remise boutique s'affiche comme une ligne, et la confirmation montre le total
renvoyé par le serveur. `php-api/tests/totaux_test.cjs` fait tourner les deux
calculs l'un contre l'autre sur 400 paniers tirés au sort : 400/400 au centime.

### 1.2 ✅ CORRIGÉ (13/08) — La valeur d'un quart offert est une constante, pas un prix

`webshop-full-bundle.jsx:426` et `:1289`

```js
const quarterValue = (l.basePrice || 0) * 0.27;   // « a free quarter »
```

L'ERP porte le **vrai** prix de chaque portion, par boutique :
`shop_product_portion_price` (`php-api/index.php:152-165`). Et le serveur, lui,
valorise les unités offertes au prix réel de la ligne
(`php-api/index.php` — promo croisée : `$units[] = $l['unit']`).

**Conséquence** — pour tout produit dont le quart n'est pas à 27 % du prix
entier, l'économie annoncée au panier diffère de la remise facturée.

**Corrigé** (webshop `01125bb`) : `computeCrossPortionOffer()` est devenu le
miroir du serveur — une entrée par PIÈCE, valorisée au prix réel de la ligne,
`floor(nb / x) × y` offerts sous réserve du seuil, les moins chers d'abord. Le
`× 0.27` a disparu du chemin de l'argent. Il subsiste dans `computeOffer()`
(offres par produit), qui n'est atteint par aucune donnée : l'API ne renvoie
pas de champ `offer` — code dormant, à supprimer avec 1.5.

### 1.3 🟠 La conversion portion → unités est un global assumé

`webshop-full-bundle.jsx:406`

```js
const PORTION_UNITS = { quart: 1, demi: 2, entier: 4 };
// TODO[BACKEND]: varies by product type — 6-piece cake vs 4-piece tart
```

Le commentaire dit lui-même que la règle dépend du produit. Toute la
progression des offres « X achetés = Y offerts » compte avec ces trois nombres.

**Correctif** : exposer `portionUnits` par produit dans `/catalog/products`.

### 1.4 ✅ CORRIGÉ (13/08) — Contacts e-mail des bureaux : ce qu'on ajoute ne survit pas au rechargement

- écriture : `index.html:3065-3068` → `BOServer.save('ws_office_emails', …)` ;
- la table n'est **pas** dans la liste `TYPED` de `bo_server.js:233-238`, donc
  `POST /franchisee/save` la range dans l'overlay générique `ws_bo_store` ;
- lecture : `php-api/index.php:5250-5257` — la liste est **reconstruite** depuis
  `ws_offices.email`, avec le rôle forcé à `Principal`.

**Conséquence** — ajouter un contact « Livraison » ou « Facturation » semble
fonctionner, puis disparaît au rechargement suivant. Aucun e-mail ne partira
jamais vers ces adresses.

**Corrigé** : migration **0063** — une vraie table `ws_office_emails` (bureau,
adresse, rôle) et `POST /franchisee/office-email` qui écrit UNE ligne, bureau
résolu par son nom, borné à la boutique. `ws_offices.email` reste la fiche et
n'est pas recopié : l'API sert l'union des deux, chaque ligne marquée de son
origine — le contact de la fiche n'a donc pas de croix, il se corrige sur la
fiche.

Même défaut trouvé un cran plus loin, corrigé avec : le **personnel** saisi à
l'étape 6 du wizard n'était lu nulle part côté serveur (`staff` arrivait dans le
corps et n'allait dans aucune table) pendant que le journal annonçait
« N demande(s) d'adhésion ». Il entre désormais dans la même table avec le rôle
« Personnel » et reçoit le lien d'invitation quand la case est cochée.

### 1.5 ✅ CORRIGÉ (13/08) — Bons : une écriture fantôme subsistait dans le wizard

Deux restes, supprimés tous les deux :

- le wizard poussait le bon dans `ws_vouchers_local` (overlay) **alors que** le
  serveur crée déjà le vrai bon (`INSERT INTO ws_vouchers` dans
  `/franchisee/onboard-office`). La copie s'affichait à côté du vrai jusqu'au
  rechargement, puis disparaissait — un doublon, jamais une donnée ;
- le formulaire « Bon local » écrivait lui aussi dans l'overlay, avec quatre
  champs de texte libre, et n'était plus ouvert par aucun écran. **Supprimé.**

Les bons se créent par l'écran Bons, qui poste sur `/franchisee/voucher` et
atteint `ws_vouchers`. La fiche de provenance de l'écran, qui décrivait encore
le formulaire disparu, a été corrigée.

### 1.6 ✅ CORRIGÉ (13/08) — Des minutes d'exploitation inventées entrent dans les ETA

| Emplacement | Repli | Ce qu'il fabrique |
| --- | --- | --- |
| `index.html:3058` | `acc:+o.acc||6` | 6 min d'accès au site, si le champ est vide |
| `index.html:5025` | `acc:parseFloat(r.acc)||10` | 10 min dans le constructeur de tournées |
| `index.html:5688` | `acc:tpl.acc||'5'` | 5 min à l'assignation d'un bureau |
| `index.html:5176` | `service:…||15` | 15 min de service par zone |
| `index.html:5156` | `(rForm.start||'06:00')` | heure de départ d'une tournée |

Ces minutes ne sont pas de l'habillage : elles s'additionnent dans les heures
d'arrivée annoncées au client. Trois valeurs différentes (5, 6, 10) pour la même
grandeur montrent qu'aucune n'est une décision.

**Corrigé** — les deux remèdes, chacun là où il convient :

- **exigé** quand c'est une saisie : temps d'accès (étape 2 du wizard et
  formulaire Site), heure de départ d'une tournée, temps de service d'une zone.
  Le formulaire refuse et dit pourquoi ;
- **absent** quand la donnée n'existe pas : plus aucun `|| 6`, `|| 10`, `|| 5`,
  `|| 15`, `|| '06:00'` — ni côté console, ni côté API (quatre `?? 6` côté
  serveur, plus un `(float) NULL` qui rendait `0`, lu comme une mesure).
  Migration **0064** : la colonne `site_access_minutes` devient nullable, en
  conservant son type — sans quoi l'absence ne pouvait pas s'écrire.

La vignette d'un site sans mesure affiche « — accès » et non « ′ », qui se
lisait comme zéro minute. Le moteur d'ETA savait déjà s'arrêter : une tournée
dont un site n'a pas de temps d'accès ne publie aucune heure.

Traités en même temps, même défaut : la **capacité** (`|| 10`) et le **forfait**
(`45 €` pré-rempli à l'édition d'une tournée), et l'**effectif** d'un
département (`|| 5`), qui entrait en base comme un chiffre communiqué par le
client.

⚠️ **Les lignes déjà écrites ne sont pas touchées** : un 6 enregistré est
peut-être une vraie mesure. À revoir à la main, site par site.

### 1.7 ✅ CORRIGÉ (13/08) — Valeurs de configuration affichées mais absentes de la base

Côté franchisé, `CONFIG = { fr_cout_params:1 }` empêchait une réponse API vide
d'écraser un seed local. Ce seed portait des **dates d'effet inventées**
(`01/06/2026`…). Elles n'étaient pas affichées, mais c'est précisément la
donnée fabriquée que la purge go-live devait emporter — et l'exception `CONFIG`
invitait à en remettre.

Le seed est vidé et `CONFIG` neutralisé : les cinq lignes de l'écran (libellé,
unité, pas de saisie) décrivent l'**interface** et vivent dans `index.html` ;
les **valeurs** vivent en base (`ws_param cost_*`) et l'écran affiche
« non paramétré » quand elles manquent.

**Deux mensonges trouvés sur le même écran, retirés avec :**

- le bouton **« + Nouvelle version (date d'effet) »** ouvrait un formulaire
  visant `ws_cost_versions` — table qu'**aucune route ne sert** — et sans table
  cible : il n'écrivait **nulle part**. On remplissait cinq champs, on cliquait
  « Publier la version », rien ne se passait ;
- le sous-titre et l'infobulle promettaient un historique par date d'effet qui
  n'existe pas. Ils disent maintenant ce qui se passe réellement : la valeur est
  enregistrée dans `ws_param` à la saisie, et modifier change les calculs à
  venir.

**Reste à traiter dans la console marque** (autre session) : son `CONFIG` porte
`params` et `email_templates`, dont `order.cutoff_default: '17:00'` — un
paramètre métier affiché comme s'il était configuré.

### 1.8 🟡 Un reste de démonstration dans la console marque

`back_office_ws_franchisor/index.html:1704`

```js
const scopeOpts=[{value:'__all',label:'Réseau (14 boutiques)'},
                 {value:'bxl',label:'Bruxelles-Centre'},…];
```

Quatorze boutiques et trois noms fictifs. La variable **n'est utilisée nulle
part** (vérifié : une seule occurrence) — c'est du code mort, pas un écran
menteur. À supprimer pour que le fichier ne contienne plus une seule boutique
inventée. *(Dépôt de la session « marque ».)*

### 1.9 🟡 Trente routes rendent `[]` quand la table manque

`php-api/index.php` — 30 occurrences de `if (!$tblExists(…)) json_out([]);`

C'est la bonne règle (pas de repli), mais du point de vue de l'écran, « table
absente » et « aucune donnée » sont **indistinguables** : une migration oubliée
ressemble à une base vide. La sonde `check-endpoints` compense en partie
(colonnes et triggers contrôlés). À terme : renvoyer un `501` avec le nom de la
migration, comme le fait déjà `/franchisee/save`.

### 1.10 État des données de production (sonde du 13/08, boutique 2)

Constats de la sonde, à traiter comme des données manquantes et non comme des
bugs :

- **coûts absents de `ws_param`** (`cost_prep`, `cost_emb`, `cost_charg`,
  `cost_struct`) ⇒ écran Rentabilité sans cascade, marge par point non calculée ;
- **tournée « Wavre & LLN SUD » sans heure de départ** ⇒ aucune ETA publiée ;
- **1 site de livraison actif sans société rattachée** (`Asima sp z oo`) ⇒ le
  client peut le choisir sans effet ;
- `pdo_mysql` absent du PHP **CLI** du serveur ⇒ la synchro des photos produit
  ne tourne pas (l'API web, elle, a bien `pdo_mysql`).

---

### 1.11 ✅ CORRIGÉ (13/08) — L'overlay `ws_bo_store` : sept écrans qui affichaient autre chose que ce que le webshop appliquait

**Le mécanisme.** `BOServer.save(table)` poste sur `/franchisee/save`. Ce
endpoint n'écrit **réellement** que dix tables ; tout le reste tombait dans
`ws_bo_store`, un blob JSON par table. Au chargement, `bo_server.js` applique
cet overlay par-dessus les réponses de l'API — **sauf** pour les tables listées
dans `TYPED`.

D'où trois comportements, dont un seul est correct :

| Écriture typée ? | Dans `TYPED` ? | Résultat |
| --- | --- | --- |
| oui | oui | ✅ écrit et relu en base |
| non | oui | la réponse API écrase l'overlay ⇒ la saisie disparaît |
| non | non | l'overlay écrase l'affichage ⇒ **la console montrait la saisie, le webshop appliquait la vraie table** |

Le troisième cas était le pire : la donnée ne disparaissait pas, elle **mentait**.

**Les sept, tous corrigés** — une route par écriture, une ligne à la fois, la
portée décidée par le serveur, un refus motivé :

| Écran | Route | Ce qui a aussi été corrigé au passage |
| --- | --- | --- |
| Frais de livraison | `POST /franchisee/delivery-fee-rule` | montants saisis en **texte libre** (« ex. 150 € ou — ») ; la lecture ne rendait que du texte mis en forme, donc inéditable |
| Créneaux & délais | `POST /franchisee/calendar-rule` | « Lun–Ven », « 17:00 J-1 », « 24 h » en texte ; mode « Express midi » que la table ne connaît pas ; **jours décalés d'un rang** à l'affichage (indice 0-6 comparé à de l'ISO 1-7) |
| Créneaux | `POST /franchisee/slot` | « Plage horaire » recopiait le libellé, « Capacité max » figée à 0 — deux colonnes inexistantes |
| Jours exceptionnels | `POST /franchisee/shop-exception` | dates en texte « JJ/MM/AAAA » ; « Libellé » et « Détail » sortaient de la **même** colonne ; une plage devient une ligne par jour |
| Disponibilité produit | `POST /franchisee/product-availability` | la table `ws_product_availability` **n'existe pas** — l'exception saisie n'a jamais rien produit ; le vrai levier est `ws_product_shops` |
| Cross-selling local | `POST /franchisee/pricing-rule` | trois champs libres sans rapport avec `rule_type`/`x`/`y`/`threshold` ; une règle **réseau** est désormais refusée à l'édition |
| Bons locaux | — (supprimé) | formulaire mort + copie fantôme du wizard ; le vrai bon est créé serveur (`ws_vouchers`) |

Chaque route a été éprouvée contre une base MariaDB via l'API réellement
servie : écriture, relecture, refus motivés, cloisonnement par boutique. Pour
les frais, la requête **exacte du checkout** a été rejouée pour vérifier
qu'elle sélectionne bien la règle écrite par la console.

**Reste à surveiller.** Le découpage d'un créneau en sous-créneaux (les
pastilles 30 min) vit dans `S.flags`, jamais persisté : c'est un affichage, pas
un paramétrage. À traiter si l'on veut qu'il ait un effet.

### 1.12 ✅ La console marque n'a pas ce défaut

Vérifié : son `bo_server.js` (108 lignes) n'a **aucun** chemin vers
`/franchisee/save` ni vers l'overlay serveur. `BOServer.save()` n'y écrit que
le cache local, en **optimiste**, et la vraie écriture part sur une route
dédiée (`/franchisor/catchment`, `/franchisor/prospect`, `/franchisor/cross-sell`,
`/franchisor/bo-role`…), suivie d'une relecture API qui fait foi. C'est le
motif que la console franchisé rejoint écran par écran.

Rien à porter à la session marque sur ce point.

## 2. Protocole de test — tous les flux

### 2.0 Préparation

| Élément | Valeur |
| --- | --- |
| Webshop | `https://<hôte>/webshop/` |
| Console franchisé | `https://<hôte>/webshop/backoffice_franchisee/?token=<jeton admin>&shop=<id>` |
| Console marque | `https://<hôte>/webshop/backoffice_franchisor/?token=<jeton admin>` |
| API | `https://<hôte>/webshop/api` |
| Sonde serveur | GitHub → Actions → **Vérifier les endpoints /franchisee/** → *Run workflow* (champ `shop`) |

**Règle de lecture commune à tous les tests** : un écran vide n'est un succès
que si la base est vide. Après chaque écriture, **recharger la page** — c'est le
rechargement qui distingue une écriture réelle d'un affichage local.

Avant de commencer : `Ctrl+Shift+R` sur les deux consoles (la page n'a porté des
en-têtes de cache que récemment).

### 2.1 Webshop — client particulier (Click & Collect)

| # | Flux | Étapes | Attendu | Vérification |
| --- | --- | --- | --- | --- |
| W1 | Choix de boutique | Ouvrir le webshop sans mémoire (navigation privée) | Liste des boutiques réelles ; aucune boutique de démonstration | `GET /shops` |
| W2 | Catalogue | Parcourir catégories → produits | Uniquement les produits de l'assortiment de la boutique | `GET /catalog/products?shop=` |
| W3 | Produit indisponible | Produit désactivé côté marque ou hors assortiment | Absent, pas « rupture » | `ws_products.brand_whitelist`, `fr_assortiment` |
| W4 | Portions | Produit portionnable → choisir quart / demi | Prix **de la boutique** par portion | `shop_product_portion_price` |
| W5 | Panier & total | Ajouter 3 lignes | Sous-total = Σ prix ERP | comparer à `POST /orders` (cf. **1.1**) |
| W6 | Offre croisée X+Y | Atteindre le seuil | Économie affichée = économie facturée | **1.2** — écart attendu aujourd'hui |
| W7 | Créneau | Choisir jour + créneau | Créneaux du jour, cut-off respecté | `GET /slots?shop=&date=` |
| W8 | Cut-off dépassé | Choisir un créneau après l'heure limite | Refus **avec motif** | `GET /shop/cutoff` |
| W9 | Code promo | Saisir un code valide, puis un code expiré | Remise appliquée / refus motivé | `ws_vouchers`, `promotion_order_discount` |
| W10 | Commande invité | Aller jusqu'au paiement | Commande créée, référence réelle | `SELECT * FROM ws_orders ORDER BY id DESC LIMIT 1` |
| W11 | Total facturé | Comparer confirmation ↔ base | Doivent être **égaux** | `ws_orders.total` vs écran (cf. **1.1**) |
| W12 | Paiement immédiat | Choisir carte / Bancontact | Redirection Stripe, retour, statut payé | `ws_orders.payment_status` |
| W13 | Double soumission | Recliquer « Payer » | Une seule commande (clé d'idempotence) | `ws_orders.request_key` |

### 2.2 Webshop — client B2B (livraison bureau)

| # | Flux | Étapes | Attendu | Vérification |
| --- | --- | --- | --- | --- |
| B1 | Bascule livraison sans compte | Cliquer « Livraison bureau » déconnecté | Message qui dit **pourquoi** et mène à la connexion | — |
| B2 | Compte sans bureau | Se connecter avec un compte non rattaché | Motif explicite, pas de bascule muette | `client.office_id` |
| B3 | Recherche de bureau | Taper ≥ 2 caractères | Seuls les bureaux validés **avec site et tournée** | `GET /office-sites?q=` |
| B4 | Confidentialité | Ne rien taper | **Aucune** liste — les bureaux ne se parcourent pas | idem |
| B5 | Demande de rattachement | Choisir un bureau | Demande en `pending`, message d'attente | `ws_office_join_requests` |
| B6 | Livraison ouverte | Après validation franchisé | Créneaux de la tournée du bureau | `ws_tour_availability` |
| B7 | Frais & franco | Panier sous / au-dessus du franco | Frais appliqués puis offerts | `GET /delivery-fees/quote` = facture |
| B8 | Paiement différé | Commander sur compte entreprise | Commande en paiement différé, PO repris | `ws_orders.payment_type`, `po_number` |
| B9 | Cut-off bureau | Commander après l'heure limite de la tournée | Refus motivé | `ws_tour_availability.cutoff_time` |

### 2.3 Webshop — lien magique « Créer mon compte »

| # | Flux | Étapes | Attendu | Vérification |
| --- | --- | --- | --- | --- |
| I1 | Lien e-mail | Ouvrir `?i=<jeton>` | Bandeau pré-lié : bureau, site, boutique | `GET /inscription?i=` |
| I2 | Lien affiche | Ouvrir `?c=inv_…` (ou scanner le QR) | Même page, mêmes valeurs | `GET /inscription?c=` |
| I3 | QR imprimé | Ouvrir l'affiche, « Imprimer », scanner à 60 cm | Lecture immédiate | — |
| I3b | Affiche à la charte | Sur la page ouverte : Gotham (pas Helvetica), bandeau bordeaux, logo | `GET /franchisee/office-invite-poster` |
| I3c | Affiche sur **une** page | Aperçu d'impression d'un bureau aux 12 conditions | 1 page A4, pied en bas | — |
| I4 | Toute adresse acceptée | Saisir un e-mail d'un autre domaine que le contact | Inscription acceptée, compte `pending` à valider en console — plus aucun refus lié au domaine (exigence retirée du front ET du php-api le 14/08/2026, anciens jetons compris) | `POST /inscription` → 200 · `ws_office_join_requests` |
| I5 | Code PIN | 3 chiffres, 5 chiffres, ou des lettres | Refus motivé (« Code PIN : exactement 4 chiffres ») ; 4 chiffres ⇒ accepté | `POST /inscription` → 400 / 200 |
| I6 | Compte créé | Formulaire complet | Compte + demande `pending` | `client`, `ws_office_join_requests` |
| I7 | Non rattaché | Se connecter aussitôt | Click & collect ouvert, livraison bureau fermée **avec motif** | `client.office_id` NULL |
| I8 | E-mail déjà pris | Rejouer le même e-mail | Message + « Se connecter » | 409 `exists:true` |
| I9 | Lien révoqué | Révoquer puis rouvrir le lien | Carte « révoqué », **aucun formulaire** | 410 |
| I10 | Lien expiré | Jeton dont `expires_at` est passé | Carte « expiré » | 410 |
| I11 | Jeton falsifié | Modifier un caractère | « invalide ou incomplet » | 410 |
| I12 | Compteur | Créer 2 comptes avec le même lien | `uses = 2` sur la fiche bureau | `ws_office_invites.uses` |

### 2.4 Console franchisé — exploitation

| # | Flux | Attendu | Vérification |
| --- | --- | --- | --- |
| F1 | Tableau de bord | Chiffres du jour = base ; jamais de nombre sans commande | `GET /franchisee/fr-orders` |
| F2 | Préparation | Arbre tournée → site → bureau conforme | `fr-prep-lines` |
| F3 | Livraison du jour | Pin de la boutique **exact** (`geoSource=address`) | `GET /franchisee/me` |
| F4 | Stock du jour | Seuils et alertes = base | `fr-stock-catalog` |
| F5 | Demandes B2B | Rattachements + nouveaux bureaux, motif quand aucun bureau ne correspond | `fr-join-requests` |
| F6 | Incidents | Création → statut → clôture, persistants | `fr_incidents` |
| F7 | Rentabilité | « Coûts non paramétrés » tant que `ws_param` est vide (cf. **1.10**) | `ws_param` |
| F8 | Analyse géo | Clients réels seulement | `geo-clients` |

### 2.5 Console franchisé — paramétrage (le chemin des 4 étapes)

| # | Flux | Attendu | Vérification |
| --- | --- | --- | --- |
| P1 | Tournée : créer | Réapparaît après rechargement | `ws_tours` |
| P2 | Tournée : horaires | Jours, fenêtre, cut-off enregistrés | `ws_tour_availability` |
| P3 | Tournée sans heure de départ | Aucune ETA inventée, mention explicite | — |
| P4 | Fermeture ponctuelle | Une seule boutique touchée | `ws_tour_closures` |
| P5 | Site : créer | Persistant ; le formulaire **refuse** sans temps d'accès | `ws_office_delivery_sites` |
| P5b | Site sans mesure (ancien) | vignette « — accès » ; la tournée ne publie **aucune** heure d'arrivée | idem |
| P6 | Site → tournée | Rattachement persistant | idem |
| P7 | Bureau : onboarding 7 étapes | Bureau `pending`, client créé, départements écrits | `ws_offices`, `client`, `b2b_client_company_department` |
| P8 | Bureau : validation | Passe livrable | `ws_offices.active` |
| P9 | Bureau → site | Un bureau, un site, une tournée | `ws_office_delivery_sites` |
| P10 | Département : créer / renommer / supprimer | Persistant, **aucun bandeau d'erreur** | `POST /franchisee/b2b-department` |
| P11 | Département sans société | Refus qui nomme la société manquante | 409 |
| P12 | Contacts e-mail bureau | ajouter · supprimer · **recharger** : persistant ; le contact de la fiche n'a pas de croix | `ws_office_emails` |
| P12b | Personnel du wizard | étape 6 + case « adhésion » ⇒ contacts « Personnel » + invitations envoyées | `ws_office_emails`, journal |
| P13 | Lien d'invitation | Copier · envoyer · affiche · révoquer · ré-émettre | `ws_office_invites` |
| P14 | Bons | Créer un bon ciblé, le retrouver après rechargement | `ws_vouchers` |
| P15 | Zones & frais | Cascade site → bureau → tournée → boutique = celle du checkout | `ws_delivery_fee_rules` |
| P16 | Assortiment | Retirer un produit ⇒ absent du webshop | `fr_assortiment` |
| P17 | Portée boutique | Changer `?shop=` ⇒ **toutes** les listes changent | toutes |

### 2.6 Console marque

| # | Flux | Attendu | Vérification |
| --- | --- | --- | --- |
| M1 | Tableau de bord réseau | Agrégat réel, jamais de KPI de démonstration | `/franchisor/kpis` |
| M2 | Boutiques | Liste réelle | `/franchisor/shops` |
| M3 | Catalogue | Produits + catégories réels | `/franchisor/catalog` |
| M4 | Gouvernance produit | Retirer du catalogue réseau ⇒ disparaît du webshop **et** de l'assortiment franchisé | `ws_products.brand_whitelist` |
| M5 | Produit obligatoire | Le franchisé ne peut plus le retirer | `mandatory` |
| M6 | Prix de référence | Prix conseillé ≠ prix boutique (l'ERP fait foi) | `shop_product` |
| M7 | Menus & formules | Sous-catégories lues dans le catalogue | `/franchisor/menus` |
| M8 | Bons marque | Visibles en lecture seule côté franchisé | `ws_vouchers` |
| M9 | Cross-selling | Règle créée ⇒ proposée au panier | `ws_cross_sell_rule` |
| M10 | Zones de chalandise | CP → boutique cohérent avec l'aiguillage | `ws_franchisor_catchment` |
| M11 | Utilisateurs & rôles | Création, droits appliqués | `bo_users` |
| M12 | Journal d'audit | Les actions ci-dessus y figurent | `bo_audit` |

### 2.7 Tests transverses (à jouer sur les trois surfaces)

| # | Flux | Attendu |
| --- | --- | --- |
| T1 | **API coupée** (jeton retiré) | Bandeau d'erreur explicite ; **aucun** écran qui fait semblant |
| T2 | **Table vide** | Écran vide + phrase qui le dit ; jamais de valeur d'exemple |
| T3 | **Écriture refusée** | Motif affiché ; l'écran ne prétend pas avoir enregistré |
| T4 | **Rechargement après chaque écriture** | Ce qui s'affiche vient de la base |
| T5 | **Deux boutiques** | Aucune donnée de l'une visible dans l'autre |
| T6 | **Cache** | Après déploiement, `Ctrl+Shift+R` suffit à voir le changement |
| T7 | **Retour arrière navigateur** | Aucun état incohérent (panier, wizard) |
| T8 | **Mobile** | Webshop et page d'inscription utilisables à une main |

### 2.8 Ce qui est déjà automatisé

| Contrôle | Où | Ce qu'il couvre |
| --- | --- | --- |
| Sonde endpoints | `check-endpoints.yml` (franchisé) | ~50 routes, page servie, colonnes et triggers, position boutique, entonnoir des sites, lien magique |
| Vérification de déploiement | `deploy-sftp.yml` (webshop) | la page servie porte bien les derniers assets ; en-têtes de cache |
| Test QR | `php-api/tests/qr_test.php` | décodage réel (zbar) de l'URL d'invitation |
| Contrôle DC | `CLAUDE.md` | méthodes appelées non définies (incident nº 1) |

**Manque** : un test de bout en bout de la commande (W5 → W11), qui est
précisément le flux où le constat **1.1** se manifeste.

---

## 3. Où en est l'audit

**Traité le 13/08** — 1.1, 1.2, 1.4, 1.5, 1.6, 1.11 (les sept écrans de
l'overlay). Chaque correction est éprouvée contre une base réelle, et la sonde
`check-endpoints` vérifie sur le serveur les structures dont elles dépendent.

**Reste ouvert :**

| # | Constat | Dépôt | Pourquoi ce n'est pas fait |
| --- | --- | --- | --- |
| 1.3 | `PORTION_UNITS` est un global (`quart:1, demi:2, entier:4`) alors que la règle dépend du produit | `webshop` | Demande d'exposer `portionUnits` par produit dans `/catalog/products` — une décision de modèle, pas un correctif |
| 1.7 | Valeurs de configuration affichées mais absentes de la base | `webshop` + console | À trancher écran par écran : masquer, ou aller chercher la vraie source |
| 1.8 | Un reste de démonstration (`scopeOpts`) dans la console marque | `back_office_ws_franchisor` | **Autre session** — à porter, cette session ne modifie pas ce dépôt |
| 1.9 | Trente routes rendent `[]` quand la table manque | `webshop` | Un `[]` doit dire « table vide » ou « table absente », pas les deux |

**Couverture — ce que l'audit n'a PAS balayé.** Le travail a porté en
profondeur sur les chemins d'ÉCRITURE de la console franchisé et sur
l'arithmétique du webshop (1.1, 1.2). N'ont pas été audités au même niveau :

- le **webshop** hors tunnel de commande (catalogue, comptes, avis) ;
- la **console marque**, vérifiée seulement sur la question de l'overlay
  (constat 1.12) — pas sur l'exactitude de ses écrans ;
- l'**exactitude des calculs** en général : un écran correctement câblé peut
  calculer faux. L'audit dit d'où vient la donnée, pas si le résultat est juste.

