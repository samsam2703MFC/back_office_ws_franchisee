# Répartition du travail entre sessions Claude

Deux sessions Claude travaillent sur les consoles L'Atelier By. Elles ne se
voient pas : chacune découvre le travail de l'autre au moment de fusionner,
c'est-à-dire trop tard. Ça a déjà coûté cher.

## La règle

| Dépôt | Session responsable |
| --- | --- |
| **`back_office_ws_franchisee`** (ce dépôt) | **la session « franchisé »** |
| `back_office_ws_franchisor` | la session « marque » |

**Une session ne modifie que son dépôt.** Si tu as besoin d'un changement dans
l'autre, ne l'écris pas : décris-le à l'utilisateur, qui le portera à la session
concernée. Un même écran vaut mieux implanté une fois dans le bon dépôt que
deux fois dans les deux.

Cette répartition suit ce que chaque session a réellement construit, pas une
préférence. Elle se change en éditant ce tableau — dans les **deux** dépôts.

> **Note du 14/08/2026 — exception ponctuelle demandée explicitement par
> l'utilisateur :** la session « franchisé » a écrit le panneau « Run
> d'impression — cut-off delivery (réseau) » du tableau de bord de la console
> marque (branche `claude/cutoff-print-run-network` de
> `back_office_ws_franchisor`), puis, le même jour et sur la même branche, la
> carte « Directives de réponse — avis Google » de l'écran Avis de la console
> marque (méthodes `rgEnsure`/`rgLoad`/`rgSave`/`rgDel`). La répartition
> ci-dessus reste inchangée pour tout le reste.

## Pourquoi

Trois incidents en une seule journée, tous dus au travail en parallèle :

1. **Le rendu de cette console a été cassé en production.** Une fusion a gardé
   les appels à `assign()`, `curRoute()` et `geoPoints()` en perdant leurs
   définitions. `renderVals` levait `this.assign is not a function` à chaque
   rendu : barre de navigation à moitié vide, aucun écran affiché.
2. **Deux écrans « Avis clients » ont été écrits en parallèle** pour la console
   marque. L'un a été jeté.
3. **Des données de démonstration supprimées sont revenues** par une résolution
   de conflit — une raison sociale fictive dans un formulaire, une date figée
   au tableau de bord.

## Avant de fusionner, dans n'importe quel dépôt

```bash
# Aucune méthode appelée ne doit être absente : c'est l'incident nº 1.
python3 - <<'EOF'
import re
s=open('index.html',encoding='utf-8').read()
c=s[s.index('<script type="text/x-dc"'):]
called=set(re.findall(r'this\.([a-zA-Z_][A-Za-z0-9_]*)\(', c))
defined=set(re.findall(r'^\s{2}([a-zA-Z_][A-Za-z0-9_]*)\s*\(', c, re.M))
fields=set(re.findall(r'^\s{2}([a-zA-Z_][A-Za-z0-9_]*)\s*=', c, re.M))
dyn=set(re.findall(r'this\.(_[A-Za-z0-9_]*)\s*=', c))
print('appelées non définies :', sorted(called-defined-fields-dyn-{'setState','setStyle'}) or 'aucune')
EOF
```

Puis, toujours : `node --check` sur les trois blocs de script, et un parcours
des écrans au navigateur — API absente **et** API présente.

## Règles de fond de ce dépôt

- **Aucune donnée inventée, aucun repli.** Pas de seed, pas de valeur par
  défaut qui ressemble à une donnée. Une table que le serveur ne sert pas est
  vide, et l'écran le montre. Voir `MIGRATION_NOTES.md`.
- **Le bandeau d'erreur doit rester crédible.** Il annonce les échecs de
  chargement ; une route connue comme non écrite est déclarée dans
  `ROUTES_A_ECRIRE` (`bo_server.js`) pour que son 404 ne le déclenche pas. Une
  alerte permanente n'est plus lue.
- **La portée boutique est décidée par le serveur.** Le jeton admin de cette
  installation est réseau (`/franchisee/me` rend `shop: null`) : un endpoint qui
  se contenterait de lire l'id reçu laisserait un franchisé lire une autre
  boutique.
- **`index.html` et `back_office_ws_franchisee.dc.html` restent identiques**,
  au bloc de boot près. Toute modification de l'un se reporte sur l'autre.

## Diagnostic

`.github/workflows/check-endpoints.yml` (onglet Actions → Run workflow)
interroge depuis le serveur les endpoints `/franchisee/*` et la page servie.
Il distingue une route absente (404) d'une route protégée (401/403), et le
serveur qui n'a pas le dernier code d'un navigateur qui garde l'ancienne page.
Un champ permet de saisir la boutique à sonder : sans portée, les endpoints qui
l'exigent rendent `[]` et un rapport sans elle est trompeur.
