# « Bien démarrer » — le guide du franchisé, et comment le tenir à jour

L'écran **Bien démarrer** (`#onboarding`, section « Aide » du menu) est
l'onboarding des franchisés : comment le webshop travaille pour leurs clients,
comment se déroule leur journée dans la console, quels outils ils ont pour
développer leur activité, quelles applications l'accompagnent (application
chauffeur, tablette Kitchen, boutique en ligne), et **ce qui change à chaque
version**. Il est écrit avec la typo et le CSS de la marque (`_ds/…/global.css` :
Vank pour les titres, Gotham pour le texte, Playwrite pour le mot d'accueil,
rouge de marque, beige, abricot pour la pastille « Nouveau »).

Il vit dans `index.html` (et son miroir `back_office_ws_franchisee.dc.html`),
comme tous les écrans : même navigation, même recherche profonde, même adresse
par section.

## Ce qu'il fait

| Situation | Comportement |
| --- | --- |
| Première ouverture sur un navigateur (aucune version du guide vue, aucune adresse de section) | la console s'ouvre sur le guide ; « Commencer » mène au tableau de bord |
| Adresse explicite (`#tournees`, lien collé, favori) | l'adresse est respectée, le guide ne s'impose pas |
| Nouvelle version du guide publiée | l'entrée « Bien démarrer » du menu porte la pastille **Nouveau** jusqu'à ce que le guide soit ouvert ; il ne se rouvre pas de force |
| Ouverture du guide | la version courante est notée dans `localStorage` (`ws_bo_onb_seen`) ; la pastille s'éteint |
| Recherche « nouveautés », « guide », « aide », « webshop »… | les chapitres sont dans la recherche profonde, avec leur onglet |

La **liste de mise en route** (chapitre Démarrer) est **constatée** sur les
tables que le serveur sert pour la boutique en portée — fiche boutique
(`/franchisee/me`), `fr_shop_availability`, `ws_payment_methods`, `ws_tours`,
`ws_office_delivery_sites`, `ws_offices` (statut `validated`), coûts
`ws_param cost_*`. Une table vide vaut « à faire », jamais un « ✓ » supposé ;
sans portée, la carte le dit au lieu de coter (règle du dépôt : aucune donnée
inventée).

Les adresses de l'application chauffeur et de la boutique en ligne sont
**calculées** sur l'hôte servi (même règle qu'`api-config.js`) : rien n'est
écrit en dur.

## Publier une nouvelle version du guide

Tout est dans le script de la page, dans le bloc `BIEN DÉMARRER` de la classe
`Component` (cherchez `ONB_VERSION`). Trois gestes, **dans les deux fichiers**
(`index.html` et `back_office_ws_franchisee.dc.html`, identiques au bloc de boot
près) :

1. **Monter la version** : `ONB_VERSION` (format `AAAA.MM.JJ`, la date de
   publication) et `ONB_DATE` (`JJ/MM/AAAA`, affichée).
2. **Ajouter une note en tête d'`ONB_NOTES`** : `{version, date, titre, points}`.
   Les points disent **ce qui change pour le franchisé**, pas comment c'est
   fait (les sujets des commits sont une bonne base : ils sont déjà écrits
   ainsi). La note en tête est encadrée en rouge à l'écran.
3. **Retoucher les chapitres** que la version change, dans `onbChapters()` :
   un chapitre = `{k, label, cards}` ; une carte = `{titre, sub, steps, map,
   note}` ; une étape = `{t, d, s, tab, grp, act, href, goLabel}` où `s` est
   l'écran (`state.screen`), `tab` l'onglet à ouvrir (`['promoTab','bons']`),
   `act` une action (`'ob'` = wizard bureau, `'profile'` = compte), `href` un
   lien externe. Un écran nouveau se décrit là où il s'insère dans la journée
   ou dans les outils, pas seulement dans la note.

Puis, comme pour tout changement de la page : le contrôle « méthodes appelées
non définies » de `CLAUDE.md`, `node --check` sur les blocs de script, un
parcours au navigateur — et, au déploiement, le cache-buster `?v=` des
`<script>`/`<link>` d'`index.html` pour que les navigateurs prennent la
nouvelle page (le guide le rappelle au franchisé : `Ctrl+Maj+R`).

La pastille « Nouveau » n'a besoin d'aucun geste : elle compare `ONB_VERSION` à
la dernière version ouverte sur le navigateur.

## Ce qui n'y est pas, et pourquoi

- **Pas de captures d'écran** : les écrans changent à chaque version et le
  dossier `docs/landing/` n'est pas déployé. Chaque étape ouvre l'écran réel
  (« Ouvrir → »), ce qui vaut mieux qu'une image datée.
- **Pas de contenu traduit** : les libellés de menu du guide existent en
  FR/NL/EN/PL/DE (`T.navGuide`), le corps du guide est en français, comme le
  reste des écrans.
- **Pas de données d'exemple** : les adresses, la boutique en portée et l'état
  de la mise en route viennent de la page servie et de l'API.
