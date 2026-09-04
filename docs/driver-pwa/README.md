# PWA Chauffeur — `/webshop/driver`

Maquettes à valider **avant** d'écrire une ligne d'application. Les sept écrans
sont dans `shots/` (`ecran-1.png` … `ecran-7.png`, planche complète
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
| 1 | **Prendre sa tournée** | scanne le **QR du bon de livraison**, choisit son véhicule, saisit le km de départ | prise de tournée (chauffeur, véhicule, km, heure) |
| 2 | **Chargement** | scanne le QR de chaque colis ; ce qui reste est listé par zone → bureau | un scan = un colis validé, avec l'heure |
| 3 | **Feuille de route** | lit le sens de livraison calculé par le dépôt | rien (lecture) |
| 4 | **En route** | ouvre Google Maps ou Waze, signale un aléa | position / aléa (accès fermé, absent, retard) |
| 5 | **Sur place** | scanne les colis remis, envoie le SMS d'arrivée | remise par colis + envoi SMS |
| 6 | **Retour dépôt** | km retour, note libre, étoiles **de la tournée**, puis enchaîne la suivante s'il en a une | clôture de tournée (km, note, ressenti, incidents) |
| 7 | **Fin de journée** | étoiles **de la journée**, récap de ses tournées, mot de fin | clôture de journée |

## Deux QR, deux rôles

- **Le QR de la tournée est imprimé sur le bon de livraison.** Le chauffeur le
  scanne : c'est à la fois son entrée dans l'application et le choix de sa
  tournée, en un geste, sans rien taper. Le QR porte la tournée, la date et la
  boutique — un bon de la veille ou d'une autre boutique est refusé, il n'ouvre
  rien.
- **Le QR du colis est sur l'étiquette de colis.** C'est lui qui sert au
  chargement (écran 2) et à la remise (écran 5).

## Un chauffeur, plusieurs tournées

Un chauffeur peut enchaîner plusieurs tournées dans la journée (Nord le matin,
Sud l'après-midi). Ce que ça change :

- L'écran 1 liste **ses** tournées du jour, dans l'ordre, avec celle qui est à
  faire maintenant et celles qui suivent. Le scan du bon reste le geste normal ;
  la liste est le secours quand le bon est abîmé.
- Le retour au dépôt (écran 6) **clôture une tournée**, pas la journée : il
  propose d'enchaîner la suivante, ou de s'arrêter là.
- Les **étoiles de la tournée** sont demandées à chaque retour ; les **étoiles
  de la journée** une seule fois, à la fin (écran 7), avec le récap des
  tournées faites.
- Une tournée déjà prise par un autre chauffeur n'est pas proposée, et son bon
  scanné une seconde fois le dit au lieu de la voler.

## Validation des colis : QR d'abord, case à cocher en secours

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
2. **Les deux QR à imprimer.** Aucun n'existe aujourd'hui :
   - le **QR de tournée** sur le **bon de livraison** (tournée + date +
     boutique). Ce bon n'est produit par aucun écran de cette console — à dire
     où il est imprimé (ERP ? un écran à écrire ici ?), c'est là que le QR
     s'ajoute ;
   - le **QR de colis** sur l'étiquette de colis (commande + n° de colis) —
     l'écran *Préparation* imprime des étiquettes, il faut y mettre ce code,
     sinon l'écran 2 n'a rien à lire.
3. **Le SMS.** Deux voies : (a) l'API l'envoie via un fournisseur — modèle
   paramétré dans la console, envoi tracé, c'est ce que montrent les maquettes ;
   (b) la PWA ouvre l'app SMS du téléphone pré-remplie (`sms:` URI) — gratuit et
   immédiat, mais non tracé et dépendant du chauffeur. (a) recommandé, (b) en
   repli hors-ligne.
4. **Endpoints à écrire côté API PHP** (ils n'existent pas ; ce dépôt ne les
   écrit pas) : `driver/login` (scan du bon → session), `driver/tours` (les
   tournées **du chauffeur**, du jour), `driver/tour/<id>`,
   `driver/tour/<id>/take`, `driver/scan` (chargement / remise),
   `driver/stop/<id>/arrive`, `driver/sms`, `driver/tour/<id>/close` (km, note,
   étoiles de la tournée), `driver/day/close` (étoiles de la journée),
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
