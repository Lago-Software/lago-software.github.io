# Modèles métier de Lago

Un fichier par métier : `parc-trampoline.json`, `laser-game.json`, `coiffeur.json`, `restaurant.json`.
Chaque fichier est lisible et modifiable à la main. Les prix sont en euros ; Lago les convertit en centimes.

## Ce que contient un modèle

- `id`, `label`, `resume` : identifiant, nom affiché, phrase de présentation.
- `version` : à augmenter à chaque changement. Les nouveaux clients partent toujours de la dernière version ; les clients existants ne sont jamais modifiés d'office (ils peuvent appliquer la nouvelle version dans Paramètres › Mon métier, en choisissant « Ajouter » pour garder leurs données).
- `products` : les produits de la caisse. Champs : `name`, `cat` (park, bar, event, gestion), `scat` (sous-catégorie, doit exister dans `settings.subs`), `price` (€), `tva` (0, 2.1, 5.5, 10 ou 20), `dur` (minutes), `jumper` (compte comme personne dans l'affluence), `art` (illustration), `event`, `guests`.
- `settings` : noms des catégories (`catNames`), sous-catégories (`subs`), capacité, équipe minimum, horaires, fond de caisse, fidélité, réservation en ligne, messages, menus masqués (`onglets_masques`, `modules_masques`), échéances désactivées, vocabulaire (`vocabulaire`, `textes`) et illustrations (`illustrations`).

Les couleurs ne font pas partie des modèles : Lago garde sa charte.

## Demander une modification à Claude

Exemples : « ajoute une coupe homme à 25 euros au modèle coiffeur », « passe le menu du restaurant à 12 € ».
Claude modifie le fichier, augmente `version`, lance `python3 mktpl.py` (validation), reconstruit Lago, rejoue les tests, puis publie.

## Contrôles automatiques (`mktpl.py`)

Identifiants uniques, catégories connues, TVA autorisées, sous-catégories déclarées, illustrations existantes, vocabulaire reconnu, horaires bien formés. Un modèle invalide empêche la construction de Lago.

Les taux de TVA des modèles sont indicatifs : à faire valider par le comptable du client.
