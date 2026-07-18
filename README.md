# back_office_ws_franchisee

Back-office **WebShop** de L'Atelier By — vue **Franchisé** (gérant d'un ou plusieurs
magasins). Implémentation de la composition Claude Design
`back_office_ws_franchisee.dc.html`.

L'application est une SPA React autonome pilotée par le runtime « dc »
(`support.js`) : le gabarit HTML (`<x-dc>…</x-dc>`) et la logique applicative
(`class Component extends DCLogic`) vivent dans un seul fichier, rendus côté
navigateur. Aucune étape de build n'est nécessaire.

## Écrans

**Exploitation**
- **Tableau de bord** — KPIs du jour, arbre commandes *tournée › zone › site › office › utilisateur*, vue liste des commandes avec avancement de statut.
- **Préparation** — impression étiquettes / listes de production, arbre *tournée › delivery site › office*.
- **Livraison du jour (Suivi live)** — chauffeurs en tournée + carte Leaflet.
- **Stock du jour** — saisie / ajustement des stocks.
- **Demandes B2B** — validation des demandes bureaux.
- **Incidents & litiges**.

**Analytique**
- **Capacité · remplissage** (calendrier), **Rentabilité**.

**Paramétrage** (sens livraison) — Tournées (constructeur glisser-déposer +
carte), Horaires, Fermetures ponctuelles, Bureaux (B2B), etc.

## Structure

```
index.html                          Point d'entrée (redirige vers la composition)
back_office_ws_franchisee.dc.html   Gabarit + logique + données (composition dc)
support.js                          Runtime dc (compile {{ }} / <sc-if> / <sc-for>, monte React)
vendor/                             Dépendances hébergées localement (aucun CDN requis)
  react.production.min.js           React 18.3.1 (UMD)
  react-dom.production.min.js       ReactDOM 18.3.1 (UMD)
  leaflet/                          Leaflet 1.9.4 (carte des tournées / suivi)
img/logo.png                        Logo L'Atelier By
_ds/l-atelier-by-8504a4e3…/         Design system L'Atelier By
  global.css                          tokens (couleurs, typo, espacements) + composants
  fonts/                              Gotham (UI), Vank (display), Playwrite DEVA (accent)
  _ds_manifest.json, _ds_bundle.js
```

### Dépendances

React, ReactDOM et Leaflet sont **hébergés localement** dans `vendor/` (chargés
avant `support.js`, qui saute alors le CDN). L'application ne dépend d'aucun CDN
externe. Seules les **tuiles cartographiques** proviennent d'OpenStreetMap
(`tile.openstreetmap.org`) au moment de l'affichage des cartes ; en l'absence
d'accès réseau à OSM, la carte s'affiche sans fond de plan mais conserve
marqueurs, tracés et contrôles.

## Lancer en local

Servir le dossier avec n'importe quel serveur statique :

```bash
python3 -m http.server 8000
# puis ouvrir http://127.0.0.1:8000/
```

Le rendu et les interactions (navigation, arbres repliables, avancement de
statut, constructeur de tournées, cartes) ont été vérifiés sous Chromium.

## Authentification (API Franchise Buddy)

La SPA est câblée sur le back-office **franchisé** (`/bo/franchisee/*`, guard
`franchisee` — cf. `php-api/bo/` du repo WebShop) :

- `app/config.js` — `role: 'franchisee'` + `apiBase` de l'API (`''` = même
  origine ; en test : `?api=http://127.0.0.1:8080`).
- `app/fb-api.js` — client `window.FB` : `fetch` avec `credentials:'include'`
  (cookie de session `fb_franchisee_session`), header `X-CSRF-Token` sur les
  mutations, **redirection 401 vers `login.html`**, et un **gate** qui masque
  l'app tant que la session n'est pas confirmée (`GET /bo/franchisee/me`).
- `login.html` — écran de connexion de marque (`POST /bo/franchisee/login`).
- Déconnexion : `window.FB.logout()` ou `…?logout=1`.

> Déploiement : héberger la SPA et l'API sur le **même site** (sous-domaines
> d'un même domaine) pour que le cookie `SameSite=Lax` circule.

Flux vérifié sous Chromium (mock API) : gate → login → app, appel de données
avec cookie, **401 croisé** vers le BO franchiseur refusé, logout → login.
