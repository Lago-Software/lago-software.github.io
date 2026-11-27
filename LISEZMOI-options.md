# Options, verrous et compteur d'appareils

Lago est **gratuit**. Rien n'est verrouillé tant que `"enforce"` vaut `false` dans `plans.json`, et rien ne l'est jamais
hors des espaces créés en libre-service (ceux-ci achètent leurs options via le serveur décrit dans `cloud/LISEZMOI.md`).

## Choisir ce qui est payant (`plans.json`, sans nouvelle version)
1. `"gates"` : pour chaque fonction à verrouiller, écrire `"clé": "option"` avec une option du serveur
   (`cast`, `qr`, `wallet`, `ia`, `multi`, `export`, `support`, ou `pack`).
2. Passer `"enforce"` à `true` : tous les Lago le prennent en compte à leur prochain lancement.

    {
      "enforce": true,
      "gates": { "blk:stats_cat": "export", "act:planpdf": "export", "tab:ptv": "cast" }
    }

| Clé | Ce qu'elle verrouille |
|---|---|
| `tab:<onglet>` | Un onglet entier. Gestion : `produits` `inventaire` `cadeaux` `promos` `rapports` `caisse` `qr` `cse`. Clients : `fiches` `fidelite` `mailing` `carnets`. Planning clients : `apercu` `resas` `web` `horaires` `qweekle` `events` `deroule` `devis` `bracelets` `entrees`. Planning staff : `equipe` `sjour` `monplan` `echanges` `conges`. Contrôle : `visuel` `mensuel` `maint` `incident` `docs`. Réglages : `pwal` `pweb` `ppay` `ptv` `pmail` `pteam` … |
| `blk:stats_cat` | Les cartes « Ventes par catégorie » |
| `act:<bouton>` | Un bouton précis, par ex. `act:m_pdf` (PDF de maintenance), `act:planpdf` (PDF du planning), `act:dv_pdf` / `act:ev_pdf` (devis, événements), `act:mp_pdf`, `act:wv_pdf`, `act:gc_pdf`, `act:qpdf`, `act:docpdf`, `act:cn_regpdf` |
| `cloud` | L'équipe synchronisée entre plusieurs appareils |

Un client qui clique sur une fonction verrouillée voit une explication et le bouton « Voir l'option ». Rien n'est supprimé :
ses données restent là et tout se débloque dès que l'option est active. Le verrou côté appli n'est qu'un frein : le code est public.

## Compteur d'appareils (console propriétaire)
Chaque appareil qui ouvre Lago envoie **une seule ligne anonyme** (identifiant aléatoire, date, version, ordinateur/iPhone/Android,
version Simple ou Complet) dans **votre base Firebase de console**. Aucun nom, aucune donnée de vente.
1. Dans la console, la carte « Téléchargements » affiche l'adresse à copier dans `plans.json` (`"stats"`) et, au besoin, les règles à publier une fois dans Firebase.
2. Tant que `"stats"` est vide, rien n'est envoyé.

## Version Simple / Complet
Les nouvelles installations démarrent en version **Simple** (caisse, produits, clients, rapports). L'administrateur change en un clic dans
Paramètres → Personnaliser (« Version du logiciel »), ou ajuste module par module (« Menus et fonctions » : version « Personnalisé »).
Les installations existantes restent en version Complet.
