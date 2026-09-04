# L'application réelle, écran par écran

Captures de `../../driver/` (le code déployé), prises par un navigateur pilotant
la vraie application : l'API est jouée par un serveur de test qui rend les mêmes
formes que `/franchisee/*`, et tout ce qui s'affiche est calculé par le code —
arrêts, colis, compteurs, textes d'erreur. Rien n'est dessiné à la main.

Le jeu d'essai est dans le dossier de session (deux tournées, trois arrêts,
cinq colis) ; il ne vit pas dans le dépôt et ne part jamais en production, où
seule l'API remplit les écrans.
