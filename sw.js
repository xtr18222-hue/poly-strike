// POLY-STRIKE service worker. Caches the shell plus the exact icon set the UI
// references: assets/cs2/ ships ~450 glyphs but the registry in assets/icons.js
// only names the ones the HUD and menus actually draw, so only those are
// precached (the full directory would bloat the install by megabytes).
const CACHE = 'poly-strike-v42-ui';
const ICONS = ['ak47','awp','g3sg1','nova','deagle','glock','knife','hegrenade','flashbang',
  'health','armor','helmet','kevlar','bullet','kill_headshot',
  'home','news','settings','power','play','loadout','inventory','bot','back','cancel',
  'pause','resumegame','online','timer','muted','unmuted','warning','crosshair'];
const FILES=['./','./index.html','./style.css','./vendor/three.min.js','./maps.js','./core.js',
  './assets.js','./visuals.js','./audio.js','./settings.js','./vendor/peerjs.min.js','./net.js',
  './duel.js','./online.js','./game.js','./assets/icons.js']
  .concat(ICONS.map(f=>'./assets/cs2/'+f+'.svg'));
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('poly-strike-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(hit=>hit||fetch(e.request)));});
