# Licences Lago — mise en route (une seule fois, environ 20 minutes)

Ce petit service gratuit (Cloudflare) fait le lien entre **Stripe** et **Lago** :
quand un client paie une option, Lago la débloque tout seul. Il ne garde ni carte ni mot de passe.

## 1. Stripe
1. Dans Stripe, créez un **produit par option** (ex. « Premium »), prix **récurrent mensuel**.
2. Pour chaque prix, créez un **lien de paiement** (Payment Link). Dans « Après le paiement », choisissez
   « Rediriger vers votre site » et mettez : `https://lago-software.github.io/?premium=ok`
3. Notez l'**identifiant de prix** de chaque option (`price_…`) et l'adresse du lien de paiement (`https://buy.stripe.com/…`).
4. Activez le **portail client** (Paramètres → Facturation → Portail client) et notez son lien : les clients y gèrent ou arrêtent leur abonnement.

## 2. Cloudflare
1. cloudflare.com → Workers & Pages → **Create** → Worker. Collez le contenu de `worker.js`, puis **Deploy**.
2. Stockage → **KV** → créez un espace nommé `LIC`. Dans le Worker : Settings → Bindings → **KV namespace** → nom `LIC`.
3. Settings → Variables and Secrets :
   - **Variable** `PRICES` : `{"price_XXXX":"premium"}` (vos identifiants de prix → nom de l'option).
   - **Secret** `ADMIN` : un mot de passe long de votre choix.
   - **Secret** `STRIPE_WHSEC` : à remplir à l'étape suivante.

## 3. Relier Stripe
1. Stripe → Développeurs → **Webhooks** → Ajouter une destination, adresse `https://VOTRE-WORKER.workers.dev/stripe`,
   événements : `checkout.session.completed` et `invoice.paid`.
2. Copiez le **secret de signature** (`whsec_…`) dans le secret `STRIPE_WHSEC` du Worker.

## 4. Créer la clé de signature (une seule fois)
Dans un terminal (ou n'importe quel outil d'envoi de requête) :

    curl -X POST https://VOTRE-WORKER.workers.dev/admin/setup -H "Authorization: Bearer VOTRE_ADMIN"

La réponse contient la **clé publique** (`pub`). Elle ne sert qu'à vérifier les licences ; la clé privée ne quitte jamais Cloudflare.

## 5. Brancher Lago
Donnez-moi (ou modifiez dans `plans.json`) : l'adresse du Worker (`api`), la clé publique (`pub`), le lien de paiement et le lien du portail de chaque option.
Tant que `"enforce": false`, **tout reste gratuit** : vous préparez tranquillement, puis vous passez à `true` le jour J, sans nouvelle version.

## Offrir une option (essai, partenaire, vous-même)
    curl -X POST https://VOTRE-WORKER.workers.dev/admin/grant -H "Authorization: Bearer VOTRE_ADMIN" \
         -d '{"cid":"IDENTIFIANT_DU_CLIENT","opt":"premium","days":365}'

L'identifiant du client s'affiche dans Lago : Paramètres → Abonnement.

## Coûts
Cloudflare Workers et KV : gratuits jusqu'à 100 000 appels par jour. Stripe : ses frais habituels par paiement.

---

# Choisir ce qui est payant (plans.json)

Lago est **gratuit**. Tant que `"enforce": false`, rien n'est verrouillé. Quand vous êtes prêt :

1. Décrivez chaque option dans `options` (nom, prix affiché, description, liste de fonctions, lien de paiement, lien du portail).
2. Dans `gates`, écrivez ce qui est verrouillé : `"clé": "nom de l'option"`.
3. Passez `"enforce"` à `true`. Aucune nouvelle version à publier : tous les Lago le prennent en compte à leur prochain lancement.

Exemple (modèle Hiboutik : statistiques et cloud en option « Premium ») :

    "gates": {
      "tab:rapports": "premium",
      "blk:stats_cat": "premium",
      "cloud": "premium"
    }

## Les clés disponibles
| Clé | Ce qu'elle verrouille |
|---|---|
| `tab:<onglet>` | Un onglet entier. Gestion : `produits` `inventaire` `cadeaux` `promos` `rapports` `caisse` `qr` `cse`. Clients : `fiches` `fidelite` `mailing` `carnets`. Planning clients : `apercu` `resas` `web` `horaires` `qweekle` `events` `deroule` `devis` `bracelets` `entrees`. Planning staff : `equipe` `sjour` `monplan` `echanges` `conges`. Contrôle : `visuel` `mensuel` `maint` `incident` `docs`. Réglages : `pwal` (carte wallet) `pweb` (réservation en ligne) `ppay` (paiement en ligne) `ptv` (écran TV) `pmail` `pteam` … |
| `blk:stats_cat` | Les cartes « Ventes par catégorie » |
| `act:<bouton>` | Un bouton précis, par ex. `act:m_pdf` (PDF de maintenance), `act:planpdf` (PDF du planning), `act:dv_pdf` / `act:ev_pdf` (devis, événements), `act:mp_pdf`, `act:wv_pdf`, `act:gc_pdf`, `act:qpdf`, `act:docpdf`, `act:cn_regpdf` |
| `cloud` | L'équipe synchronisée entre plusieurs appareils |

Un client qui clique sur une fonction verrouillée voit une explication et le bouton « Voir l'option ». Rien n'est supprimé : ses données restent là, et tout se débloque dès que l'option est active.

---

# Compteur d'appareils (console propriétaire)

Chaque appareil qui ouvre Lago envoie **une seule ligne anonyme** (identifiant aléatoire, date, version, ordinateur/iPhone/Android, version Simple ou Complet) dans **votre base Firebase de console**. Aucun nom, aucune donnée de vente.
1. Dans la console, la carte « Téléchargements » affiche l'adresse à copier dans `plans.json` (`"stats"`) et, au besoin, les règles à publier une fois dans Firebase.
2. Tant que `"stats"` est vide, rien n'est envoyé.
