# Pied de mail (« stopper ») — gabarit et variables

`stopper-2a.html` est le bloc HTML ajouté en bas des e-mails partant de la
boutique : promo du moment, logo, coordonnées, deux boutons d'appel. Tableaux
imbriqués et styles en ligne — c'est ce que les clients de messagerie savent
rendre, pas un choix esthétique.

Toutes les valeurs sont des `{{VARIABLE}}`. **Aucune n'est écrite en dur**, et
c'est le point : le même gabarit sert toutes les boutiques du réseau.

## Qui rend ce fichier

Deux lecteurs, un seul fichier :

- **la console** le charge pour l'**aperçu** de l'écran Mail › Signature ;
- **le serveur** doit le rendre à l'**envoi**, avec `mail_render()` (dépôt
  WebShop, `php-api/lib.php`) — qui utilise déjà la même syntaxe `{{ }}`.

Si le serveur en garde une copie, c'est **celle-ci** qu'il faut copier. Deux
gabarits qui divergent, c'est un aperçu qui ment sur ce que le client reçoit.

## D'où vient chaque valeur

| Origine | Variables | Pourquoi |
| --- | --- | --- |
| **Serveur** (`/franchisee/me`) | `LOGO_ALT` · `ADDRESS` | L'enseigne et l'adresse d'une boutique ne se retapent pas dans un mail : elles sont déjà en base, et une adresse recopiée à la main est une adresse qui se périme. |
| **Boutique** (écran Signature, mémorisé par boutique) | `TAGLINE` · `BASELINE` · `PHONE_LABEL` · `PHONE` · `VAT_LABEL` · `VAT` · `IBAN` · `LOGO_URL` · `PROMO_BADGE` · `PROMO_IMAGE_URL` · `PROMO_IMAGE_ALT` · `CTA1_LABEL` · `CTA1_URL` · `CTA2_LABEL` · `CTA2_URL` | Propres à chaque franchisé — un IBAN, un numéro de TVA et une promo ne se partagent pas. |
| **Gabarit** (constantes de la console) | `COLOR_*` · `BLOCK_WIDTH` · `IMAGE_COL_WIDTH` · `FONT_STACK` · `LOGO_WIDTH` | Mise en forme, pas donnée métier. Reprises de la charte L'Atelier. |

**Rien n'est prérempli.** Une valeur d'exemple saisie par défaut deviendrait un
enregistrement au premier enregistrement — c'est ainsi qu'une raison sociale
fictive s'est retrouvée en production (voir `MIGRATION_NOTES.md`). Les champs
partent vides, avec une consigne de format, et l'écran refuse de déclarer la
signature prête tant qu'une variable manque : un mail qui part avec
`{{IBAN}}` visible est pire qu'un mail sans pied de page.

## Exemple de valeurs (Gosselies — Max & Sandra)

Fourni comme **exemple**, pas comme valeur par défaut : aucun code ne le lit.

```json
{
  "LOGO_URL": "https://www.latelierby.be/media/signature/logo-max-sandra.png",
  "PROMO_IMAGE_URL": "https://www.latelierby.be/media/signature/promo-du-moment.jpg",
  "PROMO_IMAGE_ALT": "Promotion du moment",
  "PROMO_BADGE": "Promo du moment",
  "TAGLINE": "Sucré - Salé - À emporter",
  "BASELINE": "Fraîcheur, qualité et savoir-faire artisanal.",
  "PHONE_LABEL": "Tél",  "PHONE": "071/21 80 01",
  "VAT_LABEL": "TVA",    "VAT": "BE 0794645378",
  "IBAN": "BE60 0689 4713 1770",
  "CTA1_LABEL": "Webshop",                     "CTA1_URL": "https://www.latelierby.be",
  "CTA2_LABEL": "Commande bureaux à livrer",   "CTA2_URL": "https://www.latelierby.be/bureaux"
}
```

## Images

`LOGO_URL` et `PROMO_IMAGE_URL` sont des **URL absolues et publiques** : un
client de messagerie ne voit pas le réseau interne. Une image jointe en pièce
jointe ou servie derrière une authentification s'affichera cassée chez le
destinataire, et l'expéditeur ne le saura jamais.
