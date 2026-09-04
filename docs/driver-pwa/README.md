# PWA Chauffeur — `/webshop/driver`

Maquettes à valider **avant** d'écrire une ligne d'application. Les six écrans
sont dans `shots/` (`ecran-1.png` … `ecran-6.png`, planche complète
`planche.png`) et la source qui les produit est `mock.html` — ouvrez-la avec le
dépôt servi en HTTP :

```bash
python3 -m http.server 8080
# → http://localhost:8080/docs/driver-pwa/mock.html
```

Les contenus des maquettes sont des **exemples d'illustration**. L'application,
elle, suivra la règle du dépôt : aucune donnée inventée, aucun repli — ce que
l'API ne sert pas reste vide et l'écran le dit.

## Le parcours

| # | Écran | Ce que le chauffeur fait | Ce qui part au serveur |
| --- | --- | --- | --- |
| 1 | **Ma tournée** | choisit sa tournée du jour, son véhicule, saisit le km de départ | prise de tournée (chauffeur, véhicule, km, heure) |
| 2 | **Chargement** | scanne le QR de chaque colis ; ce qui reste est listé par zone → bureau | un scan = un colis validé, avec l'heure |
| 3 | **Feuille de route** | lit le sens de livraison calculé par le dépôt | rien (lecture) |
| 4 | **En route** | ouvre Google Maps ou Waze, signale un aléa | position / aléa (accès fermé, absent, retard) |
| 5 | **Sur place** | scanne les colis remis, envoie le SMS d'arrivée | remise par colis + envoi SMS |
| 6 | **Retour dépôt** | km retour, note libre, étoiles de la journée | clôture de tournée (km, note, ressenti, incidents) |

## Validation : QR d'abord, case à cocher en secours

La demande était « case à cocher **ou** QR — le QR est mieux », et surtout
« éviter le tout-cocher ». Les maquettes tranchent ainsi :

- **Le scan est le geste normal.** Scan continu : le chauffeur enchaîne les
  colis sans toucher l'écran, un bip par colis.
- **La liste montre ce qui reste**, groupée par zone puis par bureau/site, avec
  le compte réel (« 3 sur 4 »). Jamais l'inverse (une liste de ce qui est fait).
- **Une case = un colis**, disponible seulement quand le QR est illisible, et
  avec un motif obligatoire tracé au dépôt.
- **Aucun bouton « tout cocher »**, ni au chargement, ni à la remise. C'est le
  point qui fait la différence entre un chargement vérifié et un chargement
  supposé.
- Le bouton de sortie reste **inactif tant qu'il reste des colis** : on ne
  quitte pas l'écran par distraction, on le quitte parce que le compte y est.

## Ce qu'il faut décider avant de coder

1. **Session chauffeur.** Le jeton admin de cette installation est *réseau*
   (`/franchisee/me` rend `shop: null`) : il ne peut pas vivre sur le téléphone
   d'un chauffeur — il ouvrirait toutes les boutiques. Il faut une session
   chauffeur côté API (code + PIN → jeton limité à *sa* tournée du jour, portée
   boutique décidée par le serveur). **C'est le préalable bloquant.**
2. **Le QR sur l'étiquette.** Le scan suppose que l'étiquette imprimée par
   l'écran *Préparation* porte un identifiant de colis (commande + n° de colis).
   Aujourd'hui elle ne le porte pas : à ajouter côté impression, sinon l'écran 2
   n'a rien à lire.
3. **Le SMS.** Deux voies : (a) l'API l'envoie via un fournisseur — modèle
   paramétré dans la console, envoi tracé, c'est ce que montrent les maquettes ;
   (b) la PWA ouvre l'app SMS du téléphone pré-remplie (`sms:` URI) — gratuit et
   immédiat, mais non tracé et dépendant du chauffeur. (a) recommandé, (b) en
   repli hors-ligne.
4. **Endpoints à écrire côté API PHP** (ils n'existent pas ; ce dépôt ne les
   écrit pas) : `driver/login`, `driver/tours`, `driver/tour/<id>`,
   `driver/tour/<id>/take`, `driver/scan` (chargement / remise),
   `driver/stop/<id>/arrive`, `driver/sms`, `driver/tour/<id>/close`,
   `driver/incident`. Le suivi existant `ws_tour_tracking` (déjà lu par
   `fr-live-drivers`) reste la table de vérité de la tournée en cours.
5. **Déploiement.** Nouveau dossier `driver/` dans ce dépôt, déployé vers
   `/var/www/html/webshop/driver` par `deploy.yml` (second `rsync`), avec
   `manifest.json` + service worker : la feuille de route doit rester lisible
   dans un sous-sol sans réseau, et les scans faits hors-ligne repartent au
   retour du réseau.
6. **Navigation.** Liens profonds Google Maps / Waze — aucune clé API requise.
   L'ordre des arrêts reste calculé par le dépôt (l'assistant tournée existant),
   pas par le téléphone.
