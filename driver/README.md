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
(arrêts et commandes du jour), `/franchisee/tour-dispatch-status`.

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

Lecture native `BarcodeDetector` (Chrome Android) : aucune librairie, donc rien
à charger d'un CDN et rien à maintenir hors ligne. Sur un téléphone sans cette
API, la saisie du numéro prend le relais — et la case à cocher, avec motif
obligatoire, reste le dernier recours. **Aucun « tout cocher », nulle part.**

## Développement local

```bash
python3 -m http.server 8080          # à la racine du dépôt
ln -s ../_ds driver/_ds && ln -s ../img driver/img   # non versionnés : le
                                     # déploiement copie les vrais dossiers
# → http://localhost:8080/driver/?api=https://<hôte>/webshop/api
```

## Déploiement

`.github/workflows/deploy.yml` assemble `driver/` + `_ds/` + `img/` et rsync
vers `<parent de DEPLOY_DIR>/driver` (par défaut
`/var/www/html/webshop/driver`), puis vérifie depuis le serveur que la page,
le manifest, les icônes et le service worker répondent — et que `sw.js` est
bien servi en JavaScript, sans quoi le navigateur refuse de l'enregistrer et
l'application perd l'hors-ligne en silence.
