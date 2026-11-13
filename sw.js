const V='lago-v74';
const CORE=['./','index.html','fonts/display-700.woff','fonts/body-400.woff','fonts/body-700.woff','app.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
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
  if(!(same||/^fonts\.(googleapis|gstatic)\.com$/.test(u.host)))return;
  const nav=r.mode==='navigate';
  const req=!same?r:nav?new Request(r.url,{cache:'no-cache',credentials:'same-origin'}):new Request(r,{cache:'no-cache'});
  e.respondWith(fetch(req).then(res=>{
    if(nav&&res.redirected)return fetch(r);
    if(res&&(res.ok||res.type==='opaque')){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp))}
    return res;
  }).catch(()=>caches.match(r,{ignoreSearch:true})));
});
