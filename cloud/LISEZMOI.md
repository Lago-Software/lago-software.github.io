# Lago Cloud : inscription libre-service, options payantes, commission

Un petit serveur (Cloudflare Worker, offre gratuite suffisante pour démarrer) qui fait trois choses :

1. **Inscription** : le site (`telecharger.html`) appelle `POST /v1/signup`. Le serveur crée l'espace du client dans une base Firebase commune (chemin secret `c/<22 caractères>`), génère un jeton propriétaire et renvoie le lien `#cloud=…` qui ouvre Lago déjà configuré (métier choisi, produits importés).
2. **Options** : l'appli appelle `POST /v1/checkout` (abonnement Stripe), `POST /v1/portal` (gérer/résilier). Stripe prévient `POST /v1/stripe/webhook` : le serveur recalcule les droits et écrit `_ent/c/<id>`, que l'appli lit. Paiement réussi = option active ; abonnement résilié ou impayé = option coupée.
3. **Paiement en ligne avec commission de 2 %** : Stripe Connect (comptes « Standard »). `POST /v1/connect/start` ouvre l'inscription Stripe du client ; `POST /v1/pay/session` crée la page de paiement sur **son** compte avec `application_fee_amount` = 2 % ; le webhook « comptes connectés » écrit `_pay/c/<id>/<code>` et l'appli marque la réservation payée.

Prix des options et commission : en haut de `worker.js` (`OPTIONS`, `PACK`, `COMMISSION_BPS`) et dans `LAGO_PRIX` de `app.js`. Tests : `node --test cloud/test.mjs` (15 tests, Stripe et Firebase simulés).

## Mise en place (une seule fois, environ 15 minutes)

### A. Base Firebase commune
1. console.firebase.google.com › « Ajouter un projet » `lago-cloud` (Analytics : non).
2. Realtime Database › créer en Europe, mode verrouillé › onglet **Règles** › coller `cloud/rules.json` › Publier.
3. Paramètres du projet › **Comptes de service** › « Générer une clé privée » : fichier JSON (secret `FB_SA`).

### B. Stripe
1. dashboard.stripe.com › **Connect** › « Commencer » (plateforme ; comptes Standard).
2. Développeurs › Clés API › clé secrète (`sk_live_…`, ou `sk_test_…` pour essayer) : secret `STRIPE_KEY`.
3. Développeurs › Webhooks › **deux** points de terminaison vers `https://lago-cloud.<compte>.workers.dev/v1/stripe/webhook` :
   - « Événements de votre compte » : `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` → secret `STRIPE_WHSEC`.
   - « Événements des comptes connectés » : `checkout.session.completed` → secret `STRIPE_WHSEC_CONNECT`.
4. Paramètres › Facturation › **Portail client** : activer (annulation d'abonnement autorisée).
5. Paramètres › Taxes : activer Stripe Tax si vous voulez que la TVA soit calculée sur les abonnements (prix affichés hors taxes).

### C. Cloudflare
```
npm i -g wrangler && wrangler login
cd cloud
# éditer wrangler.toml (FB_URL, WORKER_URL)
wrangler secret put STRIPE_KEY ; wrangler secret put STRIPE_WHSEC ; wrangler secret put STRIPE_WHSEC_CONNECT
wrangler secret put FB_SA        # coller le contenu du fichier JSON
wrangler deploy
```
Facultatif : Turnstile (`TURNSTILE_SECRET`) et un espace KV `RL` (5 inscriptions par heure et par adresse IP).

### D. Brancher le site
Mettre l’adresse du Worker dans `LAGO_CLOUD` (début de `lago.js`). L'appli n'a rien à configurer : le lien d'inscription renvoyé par le Worker contient déjà son adresse (`w`). Tant que `LAGO_CLOUD` est vide, le site propose la demande par e-mail.
L'adresse du Worker doit se terminer par `.workers.dev` ou `.lago-caisse.fr` (liste blanche de la page de paiement client : `payer.html`, variable `WURL`, et sa balise CSP `connect-src`). Autre domaine : modifier ces deux endroits (et `app.js`, `reserver.html`).
`ALLOW_ORIGINS` doit contenir `https://lago-software.github.io` (retours de paiement) et `https://lago-caisse.fr` (inscription).

## Sécurité : ce qu'il faut savoir
- Le jeton propriétaire est stocké sous forme d'empreinte (SHA-256). Il reste sur l'appareil qui a ouvert le lien d'inscription ; il n'est pas dans les liens d'équipe. Seul lui peut acheter une option, ouvrir la facturation ou connecter Stripe.
- Les droits d'options sont lus par l'appli, qui s'adapte. Le code de l'appli étant public, un développeur pourrait contourner l'affichage des options **locales** (cast, QR, wallet, recherche IA, exports) ; les paiements, eux, passent obligatoirement par ce serveur.
- Les espaces partagent un même projet Firebase (isolés par un chemin secret et la règle `_r`). Pour une isolation totale, garder le modèle « un projet Firebase par client » (console propriétaire) comme option haut de gamme.
- Quotas Firebase gratuit (Spark) : 100 connexions simultanées, 1 Go. Passer au forfait Blaze avant de lancer largement.
