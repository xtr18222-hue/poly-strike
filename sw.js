const CACHE = 'poly-strike-v15-assets';
const FILES=['./','./index.html','./style.css','./vendor/three.min.js','./maps.js','./core.js','./assets.js','./visuals.js','./audio.js','./settings.js','./vendor/peerjs.min.js','./net.js','./duel.js','./online.js','./game.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('poly-strike-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(hit=>hit||fetch(e.request)));});
