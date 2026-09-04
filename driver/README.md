# PWA chauffeur — `/webshop/driver`

Application téléphone des chauffeurs : prendre sa tournée, valider le
chargement au QR, suivre la feuille de route, naviguer, remettre les colis,
envoyer le SMS d'arrivée, rentrer au dépôt avec sa note et ses étoiles.
Installable (manifest + service worker), utilisable hors réseau pour la
lecture de la tournée.

Maquettes d'origine et note de conception : `../docs/driver-pwa/`.

## Connexion — session PIN, jamais le jeton admin

Le chauffeur se connecte avec **sa boutique + son PIN à 4 chiffres**
(`POST /bo/pin-login` → `X-Pin-Token`, 12 h). C'est le compte tablette déjà en
place (`bo_users`), borné **par le serveur** à sa boutique et à ses sections.

Le jeton admin ERP est réseau : il ouvre toutes les boutiques et n'a rien à
faire sur le téléphone d'un chauffeur. Il n'est jamais utilisé ici.

### Mode test — sans profil chauffeur (provisoire)

Tant qu'aucun compte PIN n'existe, l'app s'ouvre avec le jeton admin dans
l'adresse :

```
https://<hôte>/webshop/driver/?shop=<id>&token=<jeton admin>
```

Ce que fait l'application dans ce mode, et pourquoi :

- elle **retire le jeton de l'adresse** dès qu'elle l'a lu (historique, logs
  serveur, lien recopié) et le garde sur l'appareil ;
- elle **exige `?shop=`** : le jeton admin est réseau, donc sans portée le bloc
  `/franchisee/*` rend les tournées de **toutes** les boutiques. Sans elle,
  l'app refuse d'afficher quoi que ce soit au lieu de montrer le réseau ;
- elle **l'affiche en permanence** (« Mode test — jeton admin réseau sur ce
  téléphone »), avec un bouton pour l'oublier ;
- elle **demande le nom du chauffeur** : il n'y a pas de session pour le
  donner, et c'est lui qui part sur la prise de tournée et la position.

C'est un dépannage, pas une cible : ce jeton ouvre les marges, les coûts et
les réglages réseau. Dès qu'un profil chauffeur existe, retire-le du téléphone
(bouton « Oublier le jeton admin ») et connecte-toi au PIN.

**Sections à donner au profil « chauffeur »** (console marque → profils) :
`tournees` (tournées, prise de tournée), `tdb` (contenu des tournées du jour),
`prep` (colis), `suivi` (lecture du direct). Sans elles, l'API répond 403 et
l'écran le dit.

## Ce qui part au serveur, aujourd'hui

| Geste | Endpoint | Effet |
| --- | --- | --- |
| Prendre la tournée | `POST /franchisee/tour-dispatch` | le nom du chauffeur s'affiche sur la tournée dans la console |
| En route | `POST /franchisee/driver-position` | position dans `ws_tour_tracking` → carte **Livraison du jour** |

Lectures : `/franchisee/me`, `/franchisee/ws-tours`, `/franchisee/fr-tdb-tree`
(arrêts et commandes du jour), `/franchisee/tour-dispatch-status`, et
`/franchisee/ws-office-delivery-sites`.

**Deux sources d'arrêts, dans cet ordre.** `fr-tdb-tree` donne les arrêts ET
les colis du jour, mais dépend de la section `tdb` : refusée, l'écran restait
sans aucun bureau alors que la tournée était prise. Les **sites de livraison**
(section `sites`) prennent alors le relais et donnent la route — bureau,
adresse, étage, contact — avec la mention « colis non servis » et la raison.
Une feuille de route sans compte de colis vaut mieux que pas de feuille de
route ; ce qui manque est dit, jamais comblé.

**La coque est servie RÉSEAU D'ABORD** (html, js, css), cache en secours hors
ligne, et la page se recharge une fois quand un nouveau service worker prend
la main. Le « cache d'abord » a fait tourner un téléphone sur la version de la
veille pendant qu'on croyait tester la nouvelle.

## Ce qui reste sur le téléphone, faute d'endpoint

Scans de colis (chargement et remise), note du chauffeur, étoiles, incidents,
kilométrage. L'écran **« Ce que le dépôt reçoit »** le dit noir sur blanc :
rien ne laisse croire que le dépôt les voit.

À écrire côté API pour fermer la boucle :

```
POST /franchisee/driver-scan    { tourId, ref, phase:"load"|"deliver", at, why? }
POST /franchisee/driver-stop    { tourId, stop, event:"arrive"|"incident", at, detail? }
POST /franchisee/driver-close   { tourId, km0, km1, note, rating, tags[] }
POST /franchisee/driver-sms     { tourId, stop, to, body }        (envoi tracé)
```

Et deux lignes de réglage serveur : ajouter `driver-position` (et les nouveaux
`driver-*`) à `bo_endpoint_section()` — sinon une session PIN reçoit 403 alors
que le jeton admin passe.

## Le QR

- **Bon de livraison (ERP)** — un bon par tournée. L'application n'interprète
  rien : elle compare le texte lu aux tournées du jour servies par l'API. Si
  l'ERP y met le nom ou le numéro de la tournée, le scan ouvre la bonne ;
  sinon le chauffeur choisit dans la liste (rien n'est deviné).
- **Étiquette de colis** — le code doit porter la **référence de commande**
  (`order_ref`), celle que l'API sert déjà dans `fr-tdb-tree`. C'est le seul
  point d'impression à ajouter côté préparation.

### Le lecteur : deux décodeurs, et un préalable

1. **`BarcodeDetector`**, natif, quand le navigateur l'a (Chrome Android) ;
2. **`vendor/jsqr.js`** (jsQR 1.4.0, Apache-2.0, embarqué) partout ailleurs.

Le second n'est pas un luxe : `BarcodeDetector` **n'existe ni sur iPhone
(Safari) ni sous Firefox**. Sans lui, l'appareil photo ne s'allumait tout
simplement pas sur ces téléphones. Il est vendu avec l'application, jamais
chargé d'un CDN — le scan doit marcher dans un sous-sol sans réseau.

**Préalable : HTTPS.** Aucun navigateur ne donne la caméra à une page servie en
`http://` (sauf `localhost`). Si la PWA est ouverte en clair, l'écran le dit
mot pour mot au lieu de laisser chercher : « La caméra exige HTTPS… ». Les
autres refus sont nommés de la même façon (permission refusée, aucune caméra,
caméra occupée par une autre application).

La **saisie du numéro de bon a été retirée** : le bon se scanne, et si le QR ne
passe pas, la tournée se choisit dans la liste juste dessous — une liste de ce
que le serveur sert vaut mieux qu'un numéro tapé de mémoire. Pour les **colis**,
la saisie du numéro et la case à cocher (motif obligatoire) restent le dernier
recours. **Aucun « tout cocher », nulle part.**

## Développement local

```bash
python3 -m http.server 8080          # à la racine du dépôt
ln -s ../_ds driver/_ds && ln -s ../img driver/img   # non versionnés : le
                                     # déploiement copie les vrais dossiers
# → http://localhost:8080/driver/?api=https://<hôte>/webshop/api
```

## Ce qui en fait une PWA complète

| Pièce | Où | Pourquoi |
| --- | --- | --- |
| `manifest.webmanifest` | nom, `id`, `scope`, `start_url`, `display: standalone`, langue, catégories | l'app s'ouvre en plein écran, sans barre d'adresse |
| **Icônes** | `icon-192`, `icon-512` (`any`) + `icon-maskable-512` (`maskable`) | Android rogne l'icône **en cercle** : le mot-symbole seul était coupé. L'icône maskable garde tout dans les 80 % centraux |
| **Captures** | `shot-1`, `shot-2` (`form_factor: narrow`) | la boîte d'installation Android montre l'app avant de l'installer |
| **Raccourcis** | « Ma tournée du jour », « Ce que le dépôt reçoit » | appui long sur l'icône |
| **Service worker** | `sw.js` — coque réseau d'abord, cache en secours, **repli de navigation** hors ligne | une tournée reste lisible dans un sous-sol ; l'API n'est JAMAIS servie du cache |
| **Bouton d'installation** | écran de connexion + « Ce que le dépôt reçoit » | Android : `beforeinstallprompt` déclenché depuis l'app ; iOS : la marche à suivre écrite (Partager → Sur l'écran d'accueil), pas un bouton mort |
| **Numéro de version** | « Ce que le dépôt reçoit » | savoir d'un coup d'œil si le téléphone tourne la version déployée |
| **Mise à jour** | nouvelle version prise sans attendre, page rechargée une fois | plus de téléphone figé sur la veille |

**Préalable non négociable : HTTPS.** Sans lui, pas de service worker, pas
d'installation, et pas de caméra. En `http://`, l'app tourne mais reste une
page web ordinaire — et elle le dit.

## Déploiement

`.github/workflows/deploy.yml` assemble `driver/` + `_ds/` + `img/` et rsync
vers `<parent de DEPLOY_DIR>/driver` (par défaut
`/var/www/html/webshop/driver`), puis vérifie depuis le serveur que la page,
le manifest, les icônes et le service worker répondent — et que `sw.js` est
bien servi en JavaScript, sans quoi le navigateur refuse de l'enregistrer et
l'application perd l'hors-ligne en silence.
