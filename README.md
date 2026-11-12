# Lago

Logiciel de gestion pour parcs de loisirs (planning clients, planning staff, échanges de shifts, contrôles, clients, caisse, chat d'équipe).

Application web installable (PWA), un seul fichier `index.html`, sans dépendance.
Les données sont partagées en direct entre les appareils via Firebase Realtime Database (configurée dans Paramètres › Studio › Équipe connectée).

Mise en ligne : GitHub Pages publie automatiquement ce dépôt à chaque modification de `main` (dossier racine, pas de build) sur https://lago-software.github.io/

## Mises à jour

L'appli installée se met à jour toute seule : elle compare son numéro de version à celui de `sw.js` au démarrage, à chaque retour au premier plan et toutes les 10 minutes. Si rien n'est en cours (ticket vide, aucune fenêtre ouverte), elle se recharge sans rien perdre ; sinon une bannière propose « Mettre à jour ». « Mon compte » permet aussi de lancer la vérification à la main, et on peut tirer l'écran vers le bas pour actualiser.

Un simple rafraîchissement de la page (ou la réouverture de l'appli) charge toujours la dernière version : `sw.js` revalide les fichiers auprès du serveur à chaque chargement, sans attendre le cache du navigateur.

Pour publier une version : changer `LAGO_V` dans `index.html` et `V` dans `sw.js` (même numéro), puis pousser sur `main`.

## Propriété et licence

© 2026 — Tous droits réservés. Logiciel propriétaire : voir [LICENSE](LICENSE). Ce dépôt est public uniquement pour l'hébergement sur GitHub Pages ; sa visibilité ne donne aucun droit de réutilisation, de copie ni de modification.

Conformité de la caisse : le module « Conformité » (Paramètres › Conformité) met en œuvre les exigences de l'article 286 I 3° bis du CGI (inaltérabilité, sécurisation, conservation, archivage). Il ne remplace pas l'attestation individuelle de l'éditeur, que le titulaire doit signer lui-même après relecture avec son expert-comptable.
