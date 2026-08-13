# Flux à tester en live, avant déploiement

Cette liste est un **go / no-go**. Elle ne remplace pas le protocole complet de
`AUDIT_ET_PROTOCOLE.md` (§ 2), qui balaie tout ; elle retient les flux dont
l'échec doit **arrêter** la mise en production.

## La règle qui prime sur toutes les autres

> **Tester sur le serveur, jamais seulement en local.**

Le déploiement ne reproduit pas l'arborescence du dépôt : `php-api/` part dans
`<racine>/api/`, `dist/` dans `<racine>/`. Un chemin juste en local peut être
faux en production. C'est exactement ce qui est arrivé à l'affiche
d'invitation : elle lisait `../public/fonts/`, dossier qui n'existe que dans le
dépôt. En local, Gotham s'affichait ; en production, l'affiche sortait en
Helvetica — et **rien ne le signalait**, parce que le repli était silencieux.

D'où les deux corollaires :

- **Un repli silencieux est un défaut**, même quand il « marche ». Tout repli
  doit laisser une trace lisible (marqueur dans la page, motif dans la réponse)
  qu'une sonde puisse vérifier.
- **Un écran vide n'est un succès que si la base est vide.** Après chaque
  écriture, **recharger** : c'est le rechargement qui distingue une écriture
  réelle d'un affichage local.

---

## Étape 0 — Automatique, avant de toucher un écran

| # | Contrôle | Commande / lieu | Bloquant si |
| --- | --- | --- | --- |
| A1 | Méthodes appelées non définies | bloc `python3` de `CLAUDE.md` | une seule méthode manquante (incident nº 1 : console blanche) |
| A2 | Syntaxe des blocs de script | `node --check` sur les 3 blocs | erreur |
| A3 | Miroir `index.html` ↔ `.dc.html` | `diff` : un seul écart, le bloc de boot | plus d'un écart |
| A4 | Aperçu = facturation | `node php-api/tests/totaux_test.cjs` | < 400/400 |
| A5 | QR décodable | `php php-api/tests/qr_test.php` | un échec |
| A6 | Gabarit d'e-mail | `php php-api/tests/mail_render_test.php` | un échec |
| A7 | Promos cumulatives | `php php-api/tests/promo_cumulative_test.php` | un échec |
| A8 | **Sonde serveur** | Actions → *Vérifier les endpoints* (champ `shop`) | un 500, ou un 404 hors `ROUTES_A_ECRIRE` |

**A8 se lit après le déploiement aussi** — c'est le seul contrôle qui interroge
la vraie base et le vrai serveur.

---

## Étape 1 — Ce qui casse le plus souvent (à jouer en premier)

| # | Flux | Geste | Ce qui prouve le succès |
| --- | --- | --- | --- |
| L1 | La console s'affiche | Ouvrir la console, `Ctrl+Shift+R` | Barre de navigation complète, aucun bandeau d'erreur permanent |
| L2 | Le serveur a le dernier code | Sonde A8, section « Page servie » | Tous les marqueurs `présent` |
| L3 | Portée boutique | Sonde A8, en-tête | `Portée : boutique <id>` — sans elle, le rapport est trompeur |
| L4 | Les écritures survivent | Modifier une fiche, **recharger** | La valeur est toujours là |

---

## Étape 2 — Webshop (le client paie ici)

| # | Flux | Geste | Ce qui prouve le succès |
| --- | --- | --- | --- |
| W1 | Catalogue | Ouvrir la boutique | Les produits viennent de l'assortiment, pas d'un seed |
| W2 | Panier | Ajouter, modifier, retirer | Totaux cohérents à chaque étape |
| W3 | **Aperçu = facture** | Noter le total avant paiement, comparer à la confirmation | **Les deux montants sont identiques** |
| W4 | Code promo | Appliquer un code réel | La remise annoncée est celle facturée |
| W5 | Cross-selling | Déclencher une offre liée | L'offre correspond au paramétrage marque |
| W6 | Frais de livraison | Franco / sous franco | La cascade site → bureau → tournée → boutique donne le même montant qu'à la commande |
| W7 | Créneau | Choisir un créneau | Seuls les créneaux réellement ouverts sont proposés |
| W8 | Commande invité | Aller jusqu'au bout | La commande existe côté console |
| W9 | Livraison bureau | Compte lié → créneau → tournée | Le bureau et la tournée sont ceux du compte |

---

## Étape 3 — Lien magique et affiche (nouveau, donc fragile)

| # | Flux | Geste | Ce qui prouve le succès |
| --- | --- | --- | --- |
| I1 | Émission | Fiche bureau → émettre le lien | URL longue **et** code court affichés |
| I2 | Lien e-mail | Ouvrir `?i=<jeton>` | Bandeau pré-lié : bureau, site, boutique |
| I3 | Lien affiche | Ouvrir `?c=inv_…` | Même page, mêmes valeurs |
| I4 | **Affiche à la charte** | Ouvrir l'affiche depuis la console | Titre en **Vank**, texte en **Gotham** — pas Helvetica. Vérifier `<meta name="polices">` dans la source : il doit lister `Vank:400 Gotham:400 Gotham:600`, **pas** `aucune` |
| I5 | Affiche sur une page | Aperçu d'impression, bureau aux 12 conditions | **1 page A4**, pied en bas |
| I6 | QR imprimé | Imprimer, scanner à 60 cm | Lecture immédiate, mène au formulaire |
| I7 | E-mail | Envoyer au contact | Reçu, bouton cliquable, PDF joint lisible |
| I8 | Révocation | Révoquer puis rouvrir le lien | Refus **motivé** (410), pas une page blanche |
| I9 | Domaine imposé | E-mail hors domaine | Refus côté front **et** serveur |
| I10 | Portée | Demander l'affiche d'un bureau d'une autre boutique | Refus (404) |

---

## Étape 4 — Console franchisé

| # | Flux | Geste | Ce qui prouve le succès |
| --- | --- | --- | --- |
| P1 | Wizard bureau B2B | Les 6 étapes | Chaque étape refuse d'avancer si un champ requis manque |
| P2 | Départements | Ajouter, supprimer, **recharger** | Persistant, pas de 409 |
| P3 | **Contacts e-mail** | Ajouter un rôle « Facturation », **recharger** | Persistant. Le contact de la fiche n'a pas de croix. **Aucun 500** |
| P4 | Sites de livraison | Rattacher un site à une société | Le site devient livrable |
| P5 | Bons | Créer un bon ciblé, recharger | Retrouvé |
| P6 | Tournées | Ouvrir le constructeur | Le tracé part de la position réelle de la boutique |
| P7 | Livraison du jour | Ouvrir | Les ETA sont mesurées, ou **absentes** — jamais inventées |
| P8 | Stock | Alerte stock bas | Regroupement par catégorie, modale détaillée |

---

## Étape 5 — Transverse, sur les trois surfaces

| # | Contrôle | Ce qui prouve le succès |
| --- | --- | --- |
| T1 | Aucune donnée inventée | Pas de « — » qui remplace une valeur, pas de date figée, pas de raison sociale fictive |
| T2 | Bandeau d'erreur crédible | Il n'apparaît que sur un vrai échec ; une route connue non écrite est dans `ROUTES_A_ECRIRE` |
| T3 | Cloisonnement | Un franchisé ne voit que sa boutique — bureaux, clients, carnet d'adresses |
| T4 | Rechargement | Ce qui s'affiche vient de la base |
| T5 | Console vs serveur | Un écran vide est expliqué par la sonde, pas supposé |

---

## Étape 6 — Après le déploiement

1. Relancer la **sonde A8** : c'est elle qui voit la vraie base et le vrai serveur.
2. `Ctrl+Shift+R` sur les deux consoles.
3. Rejouer **W3** (aperçu = facture) et **I4** (affiche à la charte) — les deux
   défauts qui ne se voient pas sans les regarder exprès.

---

## Rouge connu (à ne pas confondre avec une régression)

| Constat | Effet à l'écran | Sonde |
| --- | --- | --- |
| Coûts absents de `ws_param` | Rentabilité : « Coûts non paramétrés » | `⚠ coûts ABSENTS` |
| Tournée « Wavre & LLN SUD » sans heure de départ | Aucune ETA publiée pour elle | `⚠ tournées SANS heure de départ` |
| 2 sites sans société rattachée | Choisissables sans effet | `⚠ 2 SANS societe rattachee` |
| `users`, `fr-renta-evolution` | 404 | déclarés dans `ROUTES_A_ECRIRE` |

---

## Ce qui manque encore à l'automatisation

Un test de bout en bout de la commande (**W3**, aperçu = facture) joué contre le
serveur réel. `totaux_test.cjs` compare les deux formules ; il ne prouve pas que
la commande enregistrée porte ce montant.
