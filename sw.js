const V='lago-v117';
const CORE=['./','index.html','fonts/display-700.woff','fonts/body-400.woff','fonts/body-700.woff','app.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png','tiles/jump-1h.webp','tiles/accro-adulte.webp','tiles/accro-enfant.webp','tiles/boutique-accessoire.webp','tiles/boutique-pantalon.webp','tiles/boutique-t-shirt.webp','tiles/bowling-adulte.webp','tiles/bowling-enfant.webp','tiles/coiffure-coupe.webp','tiles/escalade-entree.webp','tiles/escalade-chaussons.webp','tiles/escape-4.webp','tiles/escape-6.webp','tiles/institut-manucure.webp','tiles/institut-visage.webp','tiles/karting-gp.webp','tiles/karting-10.webp','tiles/karting-junior.webp','tiles/laser-blaster.webp','tiles/laser-gilet.webp','tiles/laser-pack4.webp','tiles/laser-prive.webp','tiles/laser-30.webp','tiles/parc-entree.webp','tiles/parc-anniv.webp','tiles/jump-1h30.webp','tiles/laser-20.webp','tiles/barbe.webp','tiles/coupe-homme.webp','tiles/cafe-gourmand.webp','tiles/menu-jour.webp','tiles/t-shirt.webp','tiles/chaussettes.webp','tiles/gourde.webp','tiles/mini-sauteur.webp','tiles/anniversaire.webp','tiles/boisson.webp'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
/* Réseau d'abord pour l'appli (mises à jour automatiques), cache en secours hors connexion.
   Pour les fichiers de l'appli, on revalide TOUJOURS auprès du serveur (cache:'no-cache', très léger grâce à l'ETag) :
   un simple rafraîchissement de la page récupère donc la dernière version, sans attendre le cache du navigateur.
   Les adresses extérieures (base Firebase, etc.) ne sont jamais interceptées. */
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET')return;
  const same=u.origin===location.origin;
  if(same&&u.pathname.endsWith('/plans.json'))return; /* réglages des options : toujours depuis le réseau, jamais mis en cache (l'appli garde sa propre copie) */
  if(same&&u.pathname.startsWith('/site/'))return; /* les anciennes adresses /site/ redirigent vers lago-caisse.fr : on ne les intercepte pas */
  if(!(same||/^fonts\.(googleapis|gstatic)\.com$/.test(u.host)))return;
  const nav=r.mode==='navigate';
  const req=!same?r:nav?new Request(r.url,{cache:'no-cache',credentials:'same-origin'}):new Request(r,{cache:'no-cache'});
  e.respondWith(fetch(req).then(res=>{
    if(nav&&res.redirected)return fetch(r);
    if(res&&(res.ok||res.type==='opaque')){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp))}
    return res;
  }).catch(()=>caches.match(r,{ignoreSearch:true})));
});
/* Notifications sur le téléphone (Web Push) : le serveur envoie {t: titre, b: texte, u: page à ouvrir, g: étiquette}.
   On affiche TOUJOURS une notification (les téléphones l'exigent) ; le texte vient de Lago, jamais d'un tiers (message chiffré par notre serveur). */
self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{}}catch(_){try{d={b:e.data.text()}}catch(__){d={}}}
  if(!d||typeof d!=='object')d={};
  const o={body:String(d.b||'').slice(0,240),icon:'icons/icon-192.png',lang:'fr',data:{u:/^#[a-z0-9_/-]{0,40}$/.test(d.u||'')?d.u:''}};
  if(/^[A-Za-z0-9_-]{1,32}$/.test(d.g||'')){o.tag=d.g;o.renotify=true}
  e.waitUntil(self.registration.showNotification(String(d.t||'Lago').slice(0,80),o));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const u=(e.notification.data&&e.notification.data.u)||'';
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{
    const c=cs.find(x=>'focus' in x);
    if(c){if(u)try{c.postMessage({lagoGo:u})}catch(_){}return c.focus()}
    return self.clients.openWindow('./'+u);
  }));
});
