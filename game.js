/* POLY-STRIKE — controller, raycasts, viewmodels and HUD. */
(() => { 'use strict';
const $=id=>document.getElementById(id), T=window.THREE, A=window.PolyAudio;
let C=window.POLY_CORE, mapId='desert', preset='medium';
// Standard maps only. The code-entry map feature was removed: the rotation is
// the core arenas and nothing else.
try{preset=PolySettings.normalize(localStorage.getItem('poly-graphics'));}catch(_){}
let budget=PolySettings.PRESETS[preset];
// Miniature target bots: 15cm tall, scaled by assets.js (TARGET_H). The
// hitboxes are the rig's own meshes, so they scale with it; the head is tagged
// by its share of the figure rather than an absolute height.
const BOT_H = 0.15;
const primaries=['akm','l96','hecate','shotgun','smg','lmg'];
const blades=['bayonet'];
let primary='akm',secondary='deagle',blade='bayonet',dropped=false,localDrops=[];const dropNodes=new Map();let swing=0;
try{const saved=localStorage.getItem('poly-primary');if(primaries.includes(saved))primary=saved;}catch(_){}
try{const savedSecondary=localStorage.getItem('poly-secondary');if(['deagle'].includes(savedSecondary))secondary=savedSecondary;}catch(_){}
const secondaryOf=()=>secondary;
// Crosshair customization, persisted locally.
const crosshair={color:'#d9f577',gap:6,length:7,thickness:2,dot:true};
try{const saved=JSON.parse(localStorage.getItem('poly-crosshair'));if(saved&&typeof saved==='object')Object.assign(crosshair,{color:String(saved.color||'#d9f577'),gap:Math.max(0,Math.min(20,+(saved.gap||6))),length:Math.max(2,Math.min(20,+(saved.length||7))),thickness:Math.max(1,Math.min(6,+(saved.thickness||2))),dot:saved.dot!==false});}catch(_){}
function applyCrosshair(){const c=$('crosshair');c.style.setProperty('--gap',crosshair.gap+'px');c.style.setProperty('--ch-len',crosshair.length+'px');c.style.setProperty('--ch-thick',crosshair.thickness+'px');c.style.setProperty('--ch-color',crosshair.color);for(let i=0;i<4;i++)c.children[i].style.background=crosshair.color;
 // Rebuild a dot element on demand.
 let dot=c.querySelector('.ch-dot');if(crosshair.dot&&!dot){dot=document.createElement('i');dot.className='ch-dot';c.appendChild(dot);}if(!crosshair.dot&&dot)dot.remove();
 if(dot){dot.style.background=crosshair.color;dot.style.width=dot.style.height=crosshair.thickness+'px';}}
applyCrosshair();
for(const [id,def,max] of [['sensitivity',1,3],['adsSensitivity',.5,2]]){let value=def;try{const s=localStorage.getItem('poly-'+id);if(s!==null&&Number.isFinite(+s))value=Math.max(.1,Math.min(max,+s));}catch(_){}$(id).value=value;$(id+'Value').textContent=value.toFixed(2);$(id).oninput=()=>{const v=Number($(id).value);$(id+'Value').textContent=v.toFixed(2);try{localStorage.setItem('poly-'+id,v);}catch(_){}};}
for(const id of ['crosshairGap','crosshairLength','crosshairThickness']){let value=crosshair[id==='crosshairGap'?'gap':id==='crosshairLength'?'length':'thickness'];$(id).value=value;$(id+'Value').textContent=value;$(id).oninput=()=>{const v=Number($(id).value);$(id+'Value').textContent=v;crosshair[id==='crosshairGap'?'gap':id==='crosshairLength'?'length':'thickness']=v;try{localStorage.setItem('poly-crosshair',JSON.stringify(crosshair));}catch(_){}applyCrosshair();};}
try{$('crosshairColor').value=crosshair.color;}catch(_){}
$('crosshairColor').onchange=()=>{crosshair.color=$('crosshairColor').value;try{localStorage.setItem('poly-crosshair',JSON.stringify(crosshair));}catch(_){}applyCrosshair();};
$('crosshairDot').checked=crosshair.dot;
$('crosshairDot').onchange=()=>{crosshair.dot=$('crosshairDot').checked;try{localStorage.setItem('poly-crosshair',JSON.stringify(crosshair));}catch(_){}applyCrosshair();};
// Inventory slots are derived from the equipped items: primary rifle,
// secondary pistol. Dropping the
// primary collapses the rifle slot, so the wheel never offers a gap.
const inventory=()=>dropped?[secondary,blade]:[primary,secondary,blade];
// Every weapon in the reduced roster is a firearm, so this is always true today,
// this is always true today, but the ammo/tracer/reload paths stay guarded so
// a future close-quarters pickup cannot break them.
const isFirearm=k=>{const w=C.WEAPONS[k];return !!w&&w.slot!=='close';};
// Weapon skins: one chosen skin index per weapon, persisted locally.
// Declared with the full key list (keys is only assigned further down).
// Weapon keys span the strict roster: the three primary rifles and the pistol.
const keys=['akm','l96','hecate','deagle','shotgun','smg','lmg','bayonet'];
// Skin system removed in this overhaul: models ship with their own materials.
// the gun with no scope overlay and no zoom. Only the AWP is a scoped sniper.
// The Mosin is an iron-sight bolt rifle: right-click aims, it does not mount a scope.
// The L96 and Hecate are the dedicated scoped platforms.
const scopedOnly=k=>k==='l96'||k==='hecate';
const cleanName=v=>String(v||'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,20)||'Operator';
let username='Operator';try{username=cleanName(localStorage.getItem('poly-username'));}catch(_){}
$('username').value=username;$('username').onchange=()=>{username=cleanName($('username').value);$('username').value=username;try{localStorage.setItem('poly-username',username);}catch(_){}};
// View models: declared in the IIFE scope (not inside the try block) so that
// helpers such as applyCharSkinToView can see them; the try only guards init.
const models={};
try {
// preserveDrawingBuffer is required so the compositor screenshot path and
// readPixels-based diagnostics can see the rendered frame. The default
// (false) returns only the cleared buffer in headless captures.
const renderer=new T.WebGLRenderer({canvas:$('game'),antialias:false,powerPreference:'high-performance',preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.info.autoReset=false; renderer.outputEncoding=T.sRGBEncoding; renderer.autoClear=false;
const scene=new T.Scene();scene.background=new T.Color(0xa9c6ca);scene.fog=new T.Fog(0xa9c6ca,35,110);
scene.add(new T.HemisphereLight(0xe5f4ff,0x756042,1.25));const sun=new T.DirectionalLight(0xffeccb,1.7);sun.position.set(-20,40,15);scene.add(sun);
const cam=new T.PerspectiveCamera(75,1,.06,180);cam.rotation.order='YXZ';
const viewScene=new T.Scene(),viewCam=new T.PerspectiveCamera(65,1,.02,10);viewScene.add(new T.HemisphereLight(0xffffff,0x697681,1.6));const vl=new T.DirectionalLight(0xffe5cf,1.7);vl.position.set(-2,3,4);viewScene.add(vl);
// The asset suite loads asynchronously. Everything that depends on it is
// deferred until ready() resolves; the menu renders immediately either way.
const bots=C.MAP.spawnBots.map((sp)=>{const s=new T.Group();s.position.set(sp.x,0,sp.z);scene.add(s);return s;});
// Hoisted to module scope: rebuildBots() (which runs from deploy()) must be
// able to reach it. Assigned once assets resolve in readyAll().then() below.
let attachSoldier=null;
let arena=null,worldNodes=[];
// The addon shim in index.html is a module and loads asynchronously; wait
// for both it and the assets before building anything mesh-shaped.
const readyAll = () => Promise.all([
  PolyAsset.ready(),
  // window.__psAddonsBound is set by the shim once the loaders are attached.
  window.__psAddonsBound ? Promise.resolve() : new Promise(r => {
    const t = setInterval(() => { if (window.__psAddonsBound) { clearInterval(t); r(); } }, 60);
  }),
]);
readyAll().then(()=>{bindModels();
  arena=PolyVisual.buildArena(T,scene,C,preset);
  worldNodes=scene.children.filter(o=>!o.isLight);
  // The Soldier replaces the placeholder rig outright. Nesting it would
  // leave the procedural body visible underneath, so swap children instead.
  // Every mesh needs userData.botId or the hit ray treats it as scenery.
  // Only attach once: rebuildBots() re-rigs on every spawn cycle, and a second
  // pass would stack two Soldier clones in one group, doubling draw cost and
  // giving raycasts two meshes with mismatched botId tags.
  // Put a rifle in the rig's right hand. The Mixamo skeleton names its hand
  // bone mixamorigRightHand; the weapon is parented there and rotated into a
  // ready carry, so it follows the hand through every clip.
  const armBot = (g, rig) => {
    if (!PolyAsset.weapon) return;
    const w = PolyAsset.weapon('akm');
    if (!w) return;
    let hand = null;
    rig.traverse(n => { if (!hand && n.isBone && /RightHand$/.test(n.name)) hand = n; });
    if (!hand) return;
    // The rig is 0.01 (Mixamo centimetres -> metres) while the fitted weapon
    // is at weapon scale (~0.1). Parenting it directly into the hand makes it
    // render 100x too large and swallow the whole view, so carry it in a
    // pivot that cancels the rig's scale. The fitted subtree is untouched.
    // The rig is 15cm and the fitted weapon is real-world sized, so a 1:1 carry
    // would give the bot a rifle taller than itself. Shrink the gun into the
    // bot's own scale, then cancel the rig's unit scale so the fitted subtree
    // renders at the intended size.
    const rs = Math.max(1e-6, rig.scale.x || 0.01);
    const pivot = new T.Group();
    pivot.scale.setScalar((1 / rs) * (BOT_H / 1.7));
    pivot.add(w);
    // Compose the hold in the hand's local frame: barrel forward, muzzle down
    // the -Z of the weapon's own fitting space.
    hand.add(pivot);
    pivot.position.set(0, 0, 0.02);
    pivot.rotation.set(0, Math.PI * -0.06, 0);
    pivot.userData.botWeapon = true;
  };

  attachSoldier = (g, i) => {
    // Every bot is the skinned Soldier driven by the Pro Rifle Pack clips.
    // The clip FBXs carry only the animation, so the body has to come from
    // the Soldier FBX (same mixamorig skeleton); one AnimationMixer per bot.
    // Falls back to the static Soldier GLB only when the rig is unavailable.
    const anim = (PolyAsset.soldierRig && PolyAsset.clip('idle')) ? 'idle'
      : (C.MAP.peaceful ? (C.MAP.spawnBots[i] && C.MAP.spawnBots[i].anim) : null);
    let mixer = null;
    if (anim && PolyAsset.soldierRig) {
      const rig = PolyAsset.soldierRig();
      if (rig) {
        g.children.filter(c => !c.isLight).forEach(c => g.remove(c));
        rig.traverse(n => { if (n.isMesh) {
          n.userData.botId = i;
          // The rig is 15cm now: the head is the top ~18% of the figure, the same
          // fraction it was at full scale, so tag by relative height.
          n.userData.part = (n.geometry && n.geometry.boundingBox && n.geometry.boundingBox.max.y > BOT_H * 0.82) ? 'head' : 'body';
        }});
        g.add(rig);
        mixer = new T.AnimationMixer(rig);
        // Cache every locomotion action up front so state changes are pure
        // cross-fades: creating an action on demand resets its time and makes
        // the transition stamp instead of blending.
        const acts = {};
        for (const key of ['idle','walk','walkBack','run','runBack','sprint',
                           'crouch','crouchWalk','jumpUp','jumpDown','lay',
                           'deathFront','deathBack']) {
          const cl = PolyAsset.clip(key);
          if (cl) acts[key] = mixer.clipAction(cl);
        }
        g.userData.acts = acts;
        const first = acts[anim] || acts.idle;
        if (first) { first.reset(); first.setLoop(T.LoopRepeat, Infinity); first.play(); }
        g.userData.mixer = mixer;
        g.userData.rig = rig;
        g.userData.animKey = anim;
        armBot(g, rig);
        return;
      }
    }
    const m = PolyAsset.soldier(); if (!m) return;
    g.children.filter(c => !c.isLight).forEach(c => g.remove(c));
    m.traverse(n => { if (n.isMesh) {
      n.userData.botId = i;
      // Head tag = top ~18% of the rig, matching the old operator proportions.
      n.userData.part = (n.geometry && n.geometry.boundingBox)
        ? (n.geometry.boundingBox.max.y > BOT_H * 0.82 ? 'head' : 'body') : 'body';
    }});
    g.add(m);
    armBot(g, m);
  };
  bots.forEach((g, i) => { if (!g.userData.soldierAttached && typeof attachSoldier==='function') { g.userData.soldierAttached = true; attachSoldier(g, i); } });
});
// Weapons now come from the GLB asset suite; the procedural builder is gone.
// The models MUST resolve after PolyAsset.ready(): the suite loads
// asynchronously and weapon() returns null before it resolves, which left
// every viewScene weapon group empty and the in-game weapon invisible.
let modelsBound=false;
const bindModels=()=>{
 if(modelsBound)return;modelsBound=true;
 const tryBind=()=>{
  let bound=0;
  for(const key of keys){const src=PolyAsset.weapon(key);if(!src)continue;
   bound++;
   viewScene.add(src);models[key]=src;src.visible=false;

  src.traverse(o=>{o.userData.basePos=o.position.clone();o.userData.baseRot=o.rotation.clone();});
  // Per-weapon viewmodel pose: an optional small sight-line pitch on top of the
  // fit. fitWeapon already maps the measured bore onto -Z with sights on
  // +Y, so the weapon arrives level and forward; no -90deg pitch is wanted
  // here (that was the barrel-pointing-down bug).
  const p=VIEWMODEL_POSE[key];if(p){src.rotation.set(p[0],p[1],p[2]);}
  }
  // The suite resolves asynchronously; if it was not ready on the first pass the
  // weapon groups stay empty and the in-game weapon is invisible. Retry until at
  // least one weapon binds, then stop.
  if(!bound){ modelsBound=false; setTimeout(tryBind, 120); }
 };
 tryBind();
 // Hands are gone: the player viewmodel is the weapon only. Bot rigs keep their
 // own arms (they are whole-character models, not first-person arms).
};
// Viewmodel pose per weapon (radians): [pitch, yaw, roll] applied on top of
// the fit. fitWeapon now maps the measured bore onto -Z with sights on +Y, so
// the weapon already points forward and level: pose is identity, and each
// entry only carries a small sight-line pitch so the bore meets the camera.
const VIEWMODEL_POSE={akm:[0,0,0],deagle:[0,0,0],l96:[0,0,0],hecate:[0,0,0],shotgun:[0,0,0],smg:[0,0,0],lmg:[0,0,0],bayonet:[0.35,0.1,0]};
const flash=new T.Mesh(new T.ConeGeometry(.045,.22,5),new T.MeshBasicMaterial({color:0xffdc85}));flash.rotation.x=-Math.PI/2;viewScene.add(flash);flash.visible=false;
const ray=new T.Raycaster(), dir=new T.Vector3(), origin=new T.Vector3(), tmpV=new T.Vector3();const held=new Set();
let match=C.createMatch(),rng=C.mulberry32(4451),running=false,started=false,locked=false,drag=false,fallback=false;
let gameMode='skirmish',oldPlayerDead=false;
let ads=false,adsBlend=0,slide=0,slideCool=0,slideX=0,slideZ=0;
let weapon='akm',previous='deagle',ammo={},reload=0,reloadKey=null,cool=0,equip=.3,scoped=false,trigger=false,burst=0,recoil=0,hit=0,hurt=0,flashTime=0;
let x=0,z=34,y=1.7,vy=0,yaw=0,pitch=0,walk=0,moving=0,frames=0,elapsed=0,last=performance.now(),fps=60,hudClock=0,stepClock=0;
const spray=C.buildSprayPattern(4815,30),effects=[];let feed=[];
let damageSource=null,bolt=0,boltSound=false,reloadStage=-1,heartbeat=0,enemyFoot=0,enemyPose=null,killCount=0,killClock=0,killText='',killTime=0,roundNotice=0,finished=false,firstBlood=false;
function damageFrom(sx,sz){damageSource={x:sx,z:sz};hurt=.65;A.sound('enemy');}
function addKill(text,headshot=false){feed.unshift({text,headshot});feed=feed.slice(0,4);killCount=elapsed-killClock<5?killCount+1:1;killClock=elapsed;killTime=2;killText=(headshot?'HEADSHOT':'ELIMINATION')+' · '+killCount+' KILL'+(killCount>1?'S':'');// Streak tiers map directly onto the announcer pack tiers: 1=First Blood,
// 2=Double, 3=Triple, 4=Multi, then Mega/Ultra/Unstoppable/... up the pack.
// Kill-count voice lines are capped per pack: the female announcer stops at 9
// and the male announcer runs to 14. audio.js applies that cap (announce()
// resolves the active pack's own TIER_CAPS), so the caller must not gate the
// streak here — a shared hard cap here would clip the male pack at 9 again.
// First Blood fires exactly once per match: the streak counter resets to 1
// whenever the 5s window lapses, so a raw killCount===1 test would replay it
// on every isolated kill. firstBlood is cleared by reset on each deploy.
if(killCount===1&&!firstBlood){firstBlood=true;A.announce?.('firstblood',1);}else if(killCount>1)A.announce?.('streak',killCount);
}
let onlineMode=false,netRound=0,lastNetEvent='',netHp=100;
function pose(){return {x,y,z,yaw,pitch,weapon,primary,name:username};}
const online=PolyOnline.create(C,{
 rematch:s=>{if(typeof s==='object'){if(!online.hostRole)$('nextMap').value=s.nextMapId;$('rematch').disabled=s.local;$('rematch').textContent=s.remote&&!s.local?'ACCEPT REMATCH':'REQUEST REMATCH';$('rematchStatus').textContent=s.local?'Consent sent — waiting for opponent':s.remote?'Opponent requests a rematch — accept to play':'Both players must consent';}else $('rematchStatus').textContent=s;},
 status:s=>{$('netStatus').textContent=s;if(online.code)$('roomCode').textContent=online.code;},
 close:s=>{if(onlineMode){onlineMode=false;leave();$('onlinePanel').hidden=false;}$('netStatus').textContent=s;$('roomCode').textContent='';},
 ready:info=>{
  loadMap(info.mapId);$('mapSelect').value=info.mapId;match=C.createMatch();onlineMode=true;finished=false;enemyPose=null;netRound=0;lastNetEvent='';netHp=100;spawn();weapon=primary;
  if(info.id===1){const s=C.MAP.spawnOpponent||C.MAP.spawnBots[0];x=s.x;z=s.z;yaw=Math.PI;}
  started=true;running=false;$('rematchControls').hidden=true;clearInput();$('menu').hidden=true;$('onlinePanel').hidden=true;$('hud').hidden=false;$('pause').hidden=false;$('pauseTitle').textContent='OPPONENT CONNECTED';$('pauseText').textContent='Click resume to enter. Online rounds continue while menus are open.';$('resume').hidden=false;feed=[];
 },
 snapshot:({state:s,id})=>{
  const p=s.players[id],q=s.players[1-id];
  if(enemyPose&&q.alive&&running&&Math.hypot(q.x-enemyPose.x,q.z-enemyPose.z)>.025&&Math.hypot(q.x-x,q.z-z)<22&&elapsed-enemyFoot>.38){A.sound('enemyStep');enemyFoot=elapsed;}enemyPose={x:q.x,z:q.z};
  if(s.round!==netRound){netRound=s.round;spawn();x=p.x;y=p.y;z=p.z;yaw=p.yaw;pitch=p.pitch;}
  if(Math.hypot(x-p.x,z-p.z)>2){x=p.x;z=p.z;y=p.y;}
  if(netRound>0&&p.primaryLocked&&primaries.includes(p.primary))primary=p.primary;const wasDropped=dropped;dropped=!!p.dropped;if(!inventory().includes(weapon)){reload=0;select(secondary);}if(wasDropped&&!dropped){reload=0;select(primary);}
  if(p.hp<netHp)damageFrom(q.x,q.z);netHp=p.hp;
  match.phase=s.phase;match.round=s.round;match.buyClock=s.buyClock;match.roundClock=s.roundClock;match.hp=p.hp;match.armor=0;match.score={player:s.score[id],enemy:s.score[1-id]};match.kills=p.kills;match.deaths=p.deaths;match.lastWinner=s.lastWinner===null?null:s.lastWinner===id?'player':'enemy';
  for(const k of keys)ammo[k]={...p.ammo[k]};reload=p.reload;reloadKey=p.reloadKey;
  match.bots.forEach((b,i)=>{b.alive=i===0&&q.alive;b.pos={x:q.x,z:q.z};b.hp=q.hp;});
  const e=s.events[s.events.length-1];if(e){const tag=e.player+':'+e.seq;if(tag!==lastNetEvent){lastNetEvent=tag;if(e.player===id){hit=.18;A.sound(e.part==='head'?'headshot':e.killed?'kill':'hit');match.shotsHit++;if(e.killed)addKill((e.part==='head'?'HEADSHOT · ':'')+C.WEAPONS[e.weapon].name+' → '+(q.name||'Opponent'),e.part==='head');}}}
  if(s.phase==='end'&&roundNotice!==s.round){roundNotice=s.round;}
  if(s.phase==='matchover')finishMatch(s.matchWinner===id);
 }
});
function finishMatch(won){if(finished)return;finished=true;running=false;clearInput();recordCareer(won);$('pauseTitle').textContent=won?'VICTORY':'DEFEAT';$('pauseText').textContent=`Final score ${match.score.player} : ${match.score.enemy}. ${match.kills} eliminations. Accuracy: ${accuracy()}%. MVP: ${mvp()}.`;$('rematchControls').hidden=false;$('nextMap').value=nextMapId();$('nextMap').disabled=onlineMode&&!online.hostRole;$('rematch').disabled=false;$('rematch').textContent=onlineMode?'REQUEST / ACCEPT REMATCH':'PLAY NEXT MATCH';$('rematchStatus').textContent=onlineMode?'Both players must consent. Host selects next map.':'';$('resume').hidden=true;$('pause').hidden=false;if(document.pointerLockElement)document.exitPointerLock();}
function accuracy(){const p=onlineMode?online.state?.players[online.localId]:match;return p?.shotsFired?Math.min(100,Math.round(100*(p.shotsHit||0)/p.shotsFired)):0;}
function mvp(){const rows=onlineMode&&online.state?online.state.players.map((p,i)=>({name:p.name||'Opponent',score:p.kills*100+online.state.score[i]*250})):[{name:username,score:match.kills*100+match.score.player*250},...match.bots.map(b=>({name:b.name,score:(b.kills||0)*100}))];return rows.sort((a,b)=>b.score-a.score)[0].name;}
function nextMapId(){const maps=['desert','industrial','urban','harbor','training','targetrange','shipment','dust2'];return $('rotateMaps').checked?maps[(maps.indexOf(mapId)+1)%maps.length]:mapId;}
if($('modeSelect'))$('modeSelect').addEventListener('change',()=>{const md=C.MODES[$('modeSelect').value];if(md&&$('modeDescription'))$('modeDescription').textContent=md.desc.toUpperCase();});
$('rematch').onclick=()=>{if(onlineMode){if(online.requestRematch($('nextMap').value)&&match.phase==='matchover'){$('rematchStatus').textContent='Consent sent — waiting for opponent';$('rematch').disabled=true;}}else{$('mapSelect').value=$('nextMap').value;deploy();}};
function refill(){for(const k of keys)if(isFirearm(k))ammo[k]={mag:C.WEAPONS[k].mag,reserve:C.WEAPONS[k].reserve};else ammo[k]={mag:0,reserve:0};reload=0;reloadKey=null;cool=0;scoped=false;ads=false;match.armor=100;}
function spawn(){killCount=0;roundNotice=0;firstBlood=false;bolt=0;reloadStage=-1;dropped=false;localDrops=[];weapon=primary;previous='deagle';ads=false;slide=0;slideCool=0;equip=.2;burst=0;x=C.MAP.spawnPlayer.x;z=C.MAP.spawnPlayer.z;y=1.7;vy=0;yaw=0;pitch=0;refill();}
function clearInput(){held.clear();trigger=false;drag=false;$('scoreboard').hidden=true;}
function lock(){fallback=$('fallback').checked;if(fallback)return;try{const p=$('game').requestPointerLock();if(p&&p.catch)p.catch(()=>{fallback=true;});}catch(_){fallback=true;}}
function deploy(fresh=true){if(fresh){finished=false;if(onlineMode){onlineMode=false;online.close();}
 // Standard map selection only: the code-entry test maps were removed.
 const target=$('mapSelect').value;
 loadMap(target);gameMode=$('modeSelect')?$('modeSelect').value:'skirmish';match=C.MAP.training?C.createTrainingMatch(gameMode):C.createMatch(C.MAP,gameMode);rng=C.mulberry32(4451);spawn();feed=[];weapon=primary;}started=true;running=true;$('rematchControls').hidden=true;clearInput();document.activeElement?.blur();$('menu').hidden=true;$('pause').hidden=true;$('hud').hidden=false;A.start();lock();}
function pause(){if(!started||!running)return;running=false;clearInput();$('pauseTitle').textContent='PAUSED';$('pauseText').textContent=onlineMode?'Online match continues. Click resume to return.':'Your offline match is frozen. Click resume to return.';$('resume').hidden=false;$('pause').hidden=false;if(document.pointerLockElement)document.exitPointerLock();}
function select(k){if(!inventory().includes(k)||k===weapon||(onlineMode&&reload>0))return;previous=weapon;weapon=k;bolt=0;reload=0;reloadKey=null;scoped=false;ads=false;burst=0;equip=.35;cool=.15;A.sound('switch');}
function currentDrops(){return onlineMode?(online.state?.drops||[]).map(d=>({...d,weapon:d.key||d.weapon})):localDrops;}
function nearestDrop(){return currentDrops().find(d=>(!onlineMode||d.weapon===primary)&&Math.hypot(x-d.x,z-d.z)<2.5&&C.segmentClear({x,z},d,C.MAP.solids));}
function dropPrimary(){if(dropped||weapon!==primary||reload>0||!['buy','live'].includes(match.phase))return;if(onlineMode){online.drop();return;}localDrops=[{id:'local',weapon:primary,x:x-Math.sin(yaw),z:z-Math.cos(yaw),ammo:{...ammo[primary]}}];dropped=true;select(secondary);}
function pickupPrimary(){const d=nearestDrop();if(!d||!dropped||!['buy','live'].includes(match.phase))return;if(onlineMode){online.pickup(d.id);return;}primary=d.weapon;if(d.ammo)ammo[primary]={...d.ammo};localDrops=[];dropped=false;select(primary);}
function syncDrops(){const live=new Set();for(const d of currentDrops().slice(0,8)){if(!C.WEAPONS[d.weapon])continue;live.add(d.id);let o=dropNodes.get(d.id);if(!o){o=PolyVisual.buildWeapon(T,d.weapon);for(const h of o.userData.hands||[])h.removeFromParent();scene.add(o);dropNodes.set(d.id,o);}o.position.set(d.x,.22,d.z);o.rotation.set(0,elapsed*.2,Math.PI/2);}for(const [id,o] of dropNodes)if(!live.has(id)){scene.remove(o);o.traverse(n=>{n.geometry?.dispose();if(n.material)for(const m of [n.material].flat())m.dispose();});dropNodes.delete(id);}}
function doReload(){const w=C.WEAPONS[weapon];if(!isFirearm(weapon)||reload>0||ammo[weapon].mag===w.mag||ammo[weapon].reserve===0)return;if(onlineMode)online.reload(weapon);reload=w.reloadTime;reloadKey=weapon;scoped=false;ads=false;reloadStage=0;A.sound('magout');}
// Tactical magazine swap: the old mag detaches, drops free and is thrown clear,
// then a fresh mag is seated. Stages key off reload progress in animateWeapon.
function dropMag(){
 if(!PolyVisual.buildMagazine||!budget.effects||effects.length>22)return;
 const kind=reloadKey||weapon;
 // Only the AKM has a detachable magazine in the reduced roster; the snipers
 // use internal box mags, so no tactical mag drop is spawned for them.
 if(kind!=='akm')return;
 const u=models[weapon]&&models[weapon].userData;
 if(!u||!u.mag)return;
 const o=PolyVisual.buildMagazine(T,kind);
 // Start at the weapon's mag in view space, then fall in the world.
 const mp=new T.Vector3();u.mag.getWorldPosition(mp);
 o.position.copy(mp);
 scene.add(o);
 const fwd=new T.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
 effects.push({o,life:1.15,v:fwd.multiplyScalar(1.5).setY(1.0),spin:true});
}
function shotEffects(){if(!budget.effects||!scopedOnly(weapon)||effects.length>20)return;
 if(PolyVisual.buildCasing){const o=PolyVisual.buildCasing(T);o.position.set(x+Math.cos(yaw)*.3,y-.18,z-Math.sin(yaw)*.3);scene.add(o);effects.push({o,life:.7,v:new T.Vector3(Math.cos(yaw)*1.7,1.1,-Math.sin(yaw)*1.7),spin:true});}
 const o=new T.Mesh(new T.IcosahedronGeometry(.075,0),new T.MeshBasicMaterial({color:0xc4c9c3,transparent:true,opacity:.3,depthWrite:false}));o.position.copy(origin).addScaledVector(dir,.85);scene.add(o);effects.push({o,life:.45,smoke:true,v:new T.Vector3(0,.15,0)});
}
// A zero-length segment (muzzle under a target's hit point) yields NaN
// normals; degenerate tracers are skipped rather than poisoning the geometry.
function tracer(a,b,color){if(!budget.effects||effects.length>=24)return;if(a.distanceToSquared(b)<1e-8)return;const g=new T.BufferGeometry().setFromPoints([a,b]);const m=new T.LineBasicMaterial({color,transparent:true,opacity:.7});const o=new T.Line(g,m);scene.add(o);effects.push({o,life:.07});}
// Bullet impact decals: pooled marks oriented to the surface they hit.
const decalGeo=new T.PlaneGeometry(.055,.055);const decalMat=()=>new T.MeshBasicMaterial({color:0x12140f,transparent:true,opacity:.9,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});const decalPool=[];const MAX_DECALS=48;
function spawnDecal(hit){if(!hit.face)return;let o=decalPool.find(d=>!d.visible);if(!o){if(decalPool.length>=MAX_DECALS)o=decalPool.shift();else{o=new T.Mesh(decalGeo,decalMat());decalPool.push(o);}scene.add(o);o.frustumCulled=false;}
 const n=hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
 o.position.copy(hit.point).addScaledVector(n,.012);const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),n);o.setRotationFromQuaternion(q);o.rotateZ(rng()*Math.PI*2);
 o.material.opacity=.9;o.scale.setScalar(.8+rng()*.5);o.visible=true;o.renderOrder=2;
 // Fade out over ~6s so walls do not accumulate permanent marks.
 effects.push({o,life:6,decal:true});}
function syncBots(){match.bots.forEach((b,i)=>{const o=bots[i];
 // Ragdoll/tip-over death removed: bots simply vanish on death and respawn
 // cleanly at their pad. This removes the falling-into-the-ground glitch
 // that could leave a corpse overlapping a spawn point.
 const show=b.alive;
    o.visible=show;o.position.set(b.pos.x,0,b.pos.z);o.rotation.y=Math.atan2(x-b.pos.x,z-b.pos.z);
 // Static training targets are clamped to their pad: no drift, no air gap.
 if(match.training&&match.mode!=='active'){o.position.y=0;o.rotation.x=0;o.rotation.z=0;}
 // Independent alternating strides: each leg is its own hip pivot, offset by PI
 // so they swing counter-phase. Speed scales the stride and cadence; a stationary
 // bot (or one aiming) eases to a graceful halt instead of marching on the spot.
 const pivots=Array.isArray(o.userData.legPivots)?o.userData.legPivots:[];
 const spd=(b.speed||0)*(b.alive?1:0);const stride=Math.min(1,spd/4);
 const cadence=4+spd*3;const phase=elapsed*cadence+i*1.7;
 pivots.forEach((p,j)=>{const swing=Math.sin(phase+j*Math.PI)*.3*stride;const lift=Math.max(0,Math.cos(phase+j*Math.PI))*.05*stride;p.rotation.x=swing;p.position.y=(p.userData.baseY||0)-lift;});});}
function shoot(){const w=C.WEAPONS[weapon];if(!running||match.phase!=='live'||cool>0||reload>0||equip>0)return;if(isFirearm(weapon)&&ammo[weapon].mag<=0){A.sound('dry');cool=.25;return;}
 cool=w.fireInterval;if(scopedOnly(weapon)){bolt=w.boltTime||w.fireInterval;boltSound=false;}if(weapon==='bayonet')swing=w.fireInterval;match.shotsFired++;if(isFirearm(weapon))ammo[weapon].mag--;A.sound(weapon);flashTime=!isFirearm(weapon)?0:.045;recoil=!isFirearm(weapon)?.8:1;
 cam.position.set(x,y,z);cam.rotation.set(pitch,yaw,0);cam.updateMatrixWorld(true);syncBots();for(const b of bots)b.updateMatrixWorld(true);origin.copy(cam.position);cam.getWorldDirection(dir);const sp=C.pickSpread(weapon,moving,held.has('ControlLeft')||held.has('KeyC'),vy!==0,scoped||ads,rng);const right=new T.Vector3().crossVectors(dir,cam.up).normalize();dir.applyAxisAngle(new T.Vector3(0,1,0),sp.yaw).applyAxisAngle(right,sp.pitch).normalize();ray.set(origin,dir);ray.far=!isFirearm(weapon)?2.65:150;
 if(onlineMode)online.shoot(weapon,origin,dir,pose());
 const rayMeshes=[...arena.hitMeshes,...bots.filter((b,i)=>b.visible&&match.bots[i].alive)];
 // The viewmodel weapon sits at the camera, so it lands at distance 0 and
 // shadows every real target. Filter it out before the raycast.
 // An arena mesh at distance 0 is the floor under the camera; it should not
// block point-blank shots at bots standing above it.
const hits=ray.intersectObjects(rayMeshes,true);let end=origin.clone().addScaledVector(dir,80);// Skip non-bot scenery that lands first (floor at distance 0, walls) and
// take the first hit that is actually a target or the switch box.
// The Soldier is a single mesh, so classify head/body by impact height.
const target=hits.find(x=>x.object.userData.botId!==undefined||x.object.userData.switchMesh);if(target){const h=target;end=h.point;let part=h.object.userData.part||'body';if(part==='body'){const g=bots[h.object.userData.botId];if(g&&h.point.y-g.position.y>BOT_H*0.82)part='head';}
  if(h.object.userData.switchMesh&&match.training){ // range-mode switch box
   const mode=match.toggleMode();A.sound('kill');addKill(mode==='active'?'LIVE BOTS DEPLOYED · GOOD LUCK':'STATIC TARGETS RESTORED · RANGE RESET');hit=.25;
  }
  else{const id=h.object.userData.botId;if(id!==undefined&&!onlineMode){
   // Shotguns fire several pellets per report: each pellet rolls its own
   // damage against the part it actually struck. Apply them in one pass so a
   // single trigger pull can stack multiple hits and the damage is the total.
   const pellets=Math.max(1,C.pelletCount(weapon));
   let total=0,killedBy=false;
   for(let p_i=0;p_i<pellets;p_i++){
    const result=match.playerShot(weapon,id,part,h.distance);
    total+=result.dmg;
    killedBy=killedBy||result.killed;
    if(result.killed)break;
   }
   const result={dmg:total,killed:killedBy};
   if(result.dmg>0){match.shotsHit++;hit=.18;
   const stationary=match.training&&match.mode!=='active';
   A.sound(part==='head'?'headshot':result.killed?(stationary?'clang':'kill'):(stationary?'clang':'hit'));
   // part is the height-classified hit zone (the Soldier is a single mesh).
if(result.killed)addKill(`${part==='head'?'HEADSHOT · ':''}${w.name}  →  ${match.bots[id].name}`,part==='head');
   }}
  else if(isFirearm(weapon)&&budget.effects)spawnDecal(h);}}
 shotEffects();if(isFirearm(weapon))tracer(origin.clone().addScaledVector(right,.25).add(new T.Vector3(0,-.2,0)),end,0xffdf91);
 if(weapon==='akm'){const p=spray[burst%30];pitch=Math.min(1.45,pitch+p.up*.009);yaw+=p.side*.007;burst++;}else if(isFirearm(weapon))pitch=Math.min(1.45,pitch+w.recoil*.013);
 // Firing kicks the player out of the scope, but iron-sight ADS is a held
 // aim posture and must survive a shot — clearing it here made every
 // iron-sight weapon drop its sights the instant it fired. Only the true
 // scoped rifles (l96/hecate) unscope on report.
 if(scopedOnly(weapon)){scoped=false;}
}
function disposeWorld(){
 if(arena){if(arena.dispose){arena.dispose();}else{for(const o of worldNodes)scene.remove(o);}worldNodes.length=0;return;}
 const geo=new Set(),mats=new Set(),textures=new Set();
 for(const o of worldNodes){o.traverse(n=>{if(n.geometry)geo.add(n.geometry);if(n.material)for(const m of (Array.isArray(n.material)?n.material:[n.material])){mats.add(m);if(m.map)textures.add(m.map);}});scene.remove(o);}
 geo.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());worldNodes.length=0;
}
// Bot models persist across maps when the spawn count matches, so a map change
// only rebuilds the arena. A map with a different bot count (training range)
// rebuilds the models to fit.
function rebuildBots(){
 const want=C.MAP.spawnBots.length;
 if(bots.length===want)return;
 for(const b of bots)scene.remove(b);
 bots.length=0;
 for(let i=0;i<want;i++){const g=new T.Group();scene.add(g);bots.push(g);}
 if(window.PolyAsset&&PolyAsset.progress().soldier&&typeof attachSoldier==='function'){
  // Fresh bot groups still need the real Soldier rig; rebuildBots runs after
  // the asset boot, so the swap above never sees these groups.
  // The readyAll() promise can resolve mid-module-parse (the asset fetch
  // completes before this module finishes evaluating), in which case
  // attachSoldier is still null — skip then; the boot pass attaches instead.
  bots.forEach((g, i) => { g.userData.soldierAttached = false; attachSoldier(g, i); });
 }
}
function loadMap(id){
 mapId=['desert','industrial','urban','harbor','training','targetrange','shipment','dust2'].includes(id)?id:'desert';C=POLY_CORE.forMap?POLY_CORE.forMap(mapId):POLY_CORE;
 disposeWorld();const before=new Set(scene.children);arena=PolyVisual.buildArena(T,scene,C,preset);
 worldNodes.push(...scene.children.filter(o=>!before.has(o)));for(const o of worldNodes){o.updateMatrixWorld(true);o.traverse(n=>{n.matrixAutoUpdate=false;});}
 // disposeWorld() pulled the bot groups out of the scene along with the arena
 // nodes; nothing in the load path re-adds them, so every match rendered
 // against bots that were detached from the scene graph — they still raycast
 // (the hit test uses the raw bot list, not scene membership) and still appear
 // on the radar, but never draw. Re-attach them here and keep the arena's
 // frozen-matrix convention off the rig: bots move every frame via syncBots().
 for(const b of bots){if(!b.parent)scene.add(b);b.traverse(n=>{n.matrixAutoUpdate=true;});}
 // Rebuild the bot models if this arena needs a different count.
 rebuildBots();
 document.querySelector('.brand small').textContent=C.MAP.name||mapId.toUpperCase();cam.far=budget.far;cam.updateProjectionMatrix();
}
function leave(){localDrops=[];document.body.classList.remove('low-health');if(onlineMode){onlineMode=false;online.close();}running=false;started=false;clearInput();if(document.pointerLockElement)document.exitPointerLock();$('pause').hidden=true;$('hud').hidden=true;$('menu').hidden=false;$('start').focus();}
let settingsReturn=null;
function openSettings(){settingsReturn=document.activeElement;if(running)pause();$('settingsPanel').hidden=false;$('graphics').value=preset;$('performanceToggle').checked=preset==='performance';$('graphics').focus();}
$('settingsButton').onclick=openSettings;$('pauseSettings').onclick=openSettings;
$('performanceToggle').onchange=()=>{$('graphics').value=$('performanceToggle').checked?'performance':'medium';};
$('graphics').onchange=()=>{$('performanceToggle').checked=$('graphics').value==='performance';};
// Announcer voice pack: persisted, applied live, and restored on boot.
let announcerVoice='male';
try{announcerVoice=localStorage.getItem('poly-announcer')||'male';}catch(_){}
applyAnnouncerVoice();
function applyAnnouncerVoice(){const sel=$('announcerVoice');if(sel)sel.value=announcerVoice;A.setVoicePack?.(announcerVoice);}
$('announcerVoice').onchange=e=>{announcerVoice=e.target.value;try{localStorage.setItem('poly-announcer',announcerVoice);}catch(_){}applyAnnouncerVoice();A.sound('switch');};
$('applySettings').onclick=()=>{preset=PolySettings.normalize($('graphics').value);budget=PolySettings.PRESETS[preset];try{localStorage.setItem('poly-graphics',preset);}catch(_){}document.body.classList.toggle('performance',preset==='performance');loadMap(mapId);resize();document.activeElement.blur();$('settingsPanel').hidden=true;if(settingsReturn)settingsReturn.focus();};
function fitLoadoutModel(key,wm){
 // Weapons are modelled in view-model space (long axis along -Z, stock at +Z).
 // Measure the actual geometry and re-centre + scale so the preview fills the
 // frame regardless of weapon length. Each weapon keeps its own fitted camera
 // distance on its pivot (applyLoadoutCamera swaps it in on selection).
 wm.updateMatrixWorld(true);const box=new T.Box3().setFromObject(wm);
 if(box.isEmpty())return;
 const center=box.getCenter(new T.Vector3());wm.position.sub(center);wm.updateMatrixWorld(true);
 const size=box.getSize(new T.Vector3());const radius=Math.max(size.x,size.y,size.z)*.5;
 // Long guns are horizontal: the fitted distance uses half the length, so the
 // whole weapon stays inside the frame and a touch of margin avoids clipping.
 const dist=radius/Math.sin(loadoutCam.fov*Math.PI/360)*1.12;
 const pivot=wm.parent;pivot.position.set(0,0,0);pivot.rotation.set(0,0,0);
 pivot.rotation.y=Math.PI*.08;pivot.userData.fitDist=dist;
}
function applyLoadoutCamera(){
 const m=loadoutModels[loadoutSelected];const d=(m&&m.userData.fitDist)||1.4;
 loadoutCam.position.set(d*.35,d*.1,d);loadoutCam.lookAt(0,0,0);loadoutCam.updateProjectionMatrix();
}
/* ------------------------------------------------------------- Loadout hub */
let loadoutPreview=null,loadoutSelected=primary;
// A dedicated scene renders the selected weapon so the player can inspect it
// before committing to a loadout.
const loadoutScene=new T.Scene();loadoutScene.background=new T.Color(0x0b1c22);loadoutScene.add(new T.HemisphereLight(0xffffff,0x46565c,1.5));const lv=new T.DirectionalLight(0xffe5cf,1.5);lv.position.set(-2,3,4);loadoutScene.add(lv);
const loadoutCam=new T.PerspectiveCamera(45,1.5,.02,10);loadoutCam.position.set(0,.12,1.15);loadoutCam.lookAt(0,.03,0);
const loadoutModels={};
// Asset-backed weapons: every model comes from PolyAsset now, skins stripped.
// Deferred until the asset suite resolves: weapon() returns null before
// PolyAsset.ready(), which left every loadout preview empty.
const bindLoadoutModels=()=>{
 for(const k of keys){if(loadoutModels[k])continue;const src=PolyAsset.weapon(k);if(!src)continue;const pivot=new T.Group();pivot.add(src);loadoutScene.add(pivot);loadoutModels[k]=pivot;fitLoadoutModel(k,src);
  pivot.matrixAutoUpdate=true;pivot.traverse(n=>{n.matrixAutoUpdate=true;});}
};
PolyAsset.ready().then(bindLoadoutModels,bindLoadoutModels);
// Weapon previews start hidden (the loadout hub selects one on open); visibility
// is set on the whole subtree, never just the wrapper pivot.
// Loadout models must keep updating their world matrices: loadMap freezes
// matrixAutoUpdate on the arena's world nodes and that flag is inherited by
// any Object3D parented underneath them, but these pivots live in their own
// scene. Keep them explicit so the render never sees a stale transform.
// (Applied per-model in bindLoadoutModels, which runs after the assets land.)
// Visibility is inherited down a THREE scene graph, so toggling only the pivot
// leaves the weapon mesh inside it hidden and the preview renders nothing.
// setLoadoutVisible flips the whole subtree.
function setLoadoutVisible(pivot,on){if(!pivot)return;pivot.visible=on;pivot.traverse(n=>{if(n!==pivot)n.visible=on;});}
// Dedicated renderer on #loadoutCanvas itself. The preview must not be drawn
// into the shared #game buffer: the panel stacks above it with an opaque stage
// background, so the scissor render is painted over and reads as a black box.
// This context owns the preview exclusively and is composited as its own layer.
const loadoutRenderer=new T.WebGLRenderer({canvas:$('loadoutCanvas'),antialias:true,alpha:false,powerPreference:'high-performance'});
loadoutRenderer.setPixelRatio(Math.min(2,devicePixelRatio||1));loadoutRenderer.autoClear=true;loadoutRenderer.outputEncoding=T.sRGBEncoding;
function resizeLoadout(){const cv=$('loadoutCanvas');const w=cv.clientWidth||360;const h=cv.clientHeight||240;if(w>4&&h>4){loadoutRenderer.setSize(w,h,false);loadoutCam.aspect=w/h;loadoutCam.updateProjectionMatrix();}}
window.__loadoutModels=loadoutModels;window.__loadoutCam=loadoutCam;window.__loadoutSelected=()=>loadoutSelected;window.__loadoutScene=loadoutScene;window.__resizeLoadout=resizeLoadout;window.__loadoutRenderer=loadoutRenderer;
function setLoadoutPreview(key){loadoutSelected=key;loadoutYaw=0;loadoutPitch=0;bindLoadoutModels();for(const k of Object.keys(loadoutModels))setLoadoutVisible(loadoutModels[k],k===key);// The card can fire for a weapon whose GLB is still loading or failed to load.
const m=loadoutModels[key];if(!m)return;m.position.set(0,0,0);m.rotation.set(0,0,0);loadoutInspectTime=0;applyLoadoutCamera();const w=C.WEAPONS[key];$('loadoutName').textContent=w.name;$('loadoutDesc').textContent=w.slot==='primary'?`${w.name.split(' ')[0]} / ${w.auto?'Automatic':'Semi or bolt'} · ${w.mag} rounds`:key==='deagle'?'Desert Eagle / Semi-auto pistol · 7 rounds':w.name+' / Melee · unlimited';
 for(const el of document.querySelectorAll('.wcard'))el.classList.toggle('active',el.dataset.weapon===key);
 // Rebuild the skin selector for the newly selected weapon.
 }
function renderLoadoutCards(){
 const mk=(key,tag)=>{const w=C.WEAPONS[key];const el=document.createElement('button');el.className='wcard'+(key===loadoutSelected?' active':'');el.dataset.weapon=key;el.innerHTML=`<b>${w.name}</b><small>${tag}</small>`;el.onclick=()=>{setLoadoutPreview(key);if(primaries.includes(key))primary=key;else{secondary=key;try{localStorage.setItem('poly-secondary',key);}catch(_){}}A.sound('equip');};return el;};
 $('primaryCards').replaceChildren(...primaries.map(k=>mk(k,(C.WEAPONS[k].zoomFov?'Scoped marksman':C.WEAPONS[k].auto?'Assault rifle':'Battle rifle'))));
 // Only one secondary remains in the reduced roster: the Deagle.
 $('secondaryCards').replaceChildren(...['deagle'].map(k=>mk(k,'Semi-auto pistol')));}
$('loadoutButton').onclick=()=>{renderLoadoutCards();$('loadoutPanel').hidden=false;setLoadoutPreview(primary);};
$('loadoutClose').onclick=()=>{if(weapon!==primary&&!dropped)weapon=primary;$('loadoutPanel').hidden=true;$('loadoutButton').focus();};
// Click-drag rotates the preview weapon a full 360 degrees on the spot.
// A drag overrides the idle drift until the player releases the mouse.
let loadoutDragX=null,loadoutYaw=0,loadoutPitch=0,loadoutDragging=false,loadoutInspectTime=0;
const loadoutCanvas=$('loadoutCanvas');
loadoutCanvas.style.cursor='grab';
loadoutCanvas.addEventListener('pointerdown',e=>{loadoutDragging=true;loadoutDragX=e.clientX;loadoutCanvas.style.cursor='grabbing';loadoutCanvas.setPointerCapture(e.pointerId);});
loadoutCanvas.addEventListener('pointermove',e=>{if(!loadoutDragging||loadoutDragX===null)return;const dx=e.clientX-loadoutDragX;loadoutDragX=e.clientX;loadoutYaw-=dx*.011;loadoutPitch=Math.max(-.5,Math.min(.5,loadoutPitch+e.movementY*.008));window.__loadoutYaw=loadoutYaw;window.__loadoutPitch=loadoutPitch;});
const endLoadoutDrag=()=>{loadoutDragging=false;loadoutDragX=null;loadoutCanvas.style.cursor='grab';};
loadoutCanvas.addEventListener('pointerup',endLoadoutDrag);loadoutCanvas.addEventListener('pointercancel',endLoadoutDrag);loadoutCanvas.addEventListener('pointerleave',endLoadoutDrag);
function tickLoadoutPreview(dt){if($('loadoutPanel').hidden)return;const m=loadoutModels[loadoutSelected];if(!m||!m.visible)return;
 // Slow idle drift while idle, cinematic pose while inspecting.
 // The pose sets rotation+position every frame, so the branch order matters:
 // drag first, then the scripted inspect, then the idle drift as the default.
 loadoutInspectTime+=dt;
 if(loadoutDragging){m.rotation.set(loadoutPitch,loadoutYaw,0);m.position.set(0,0,0);}
 else{m.position.set(0,Math.sin(elapsed*.8)*.008,0);m.rotation.set(0,Math.sin(elapsed*.3)*.12+Math.PI*.02,0);}}
/* ------------------------------------------------------------- Career stats */
const career={matches:0,wins:0,kills:0,deaths:0,headshots:0,shotsFired:0,shotsHit:0,roundsWon:0};
try{const saved=JSON.parse(localStorage.getItem('poly-career'));if(saved&&typeof saved==='object')Object.assign(career,{matches:Math.max(0,+(saved.matches||0)),wins:Math.max(0,+(saved.wins||0)),kills:Math.max(0,+(saved.kills||0)),deaths:Math.max(0,+(saved.deaths||0)),headshots:Math.max(0,+(saved.headshots||0)),shotsFired:Math.max(0,+(saved.shotsFired||0)),shotsHit:Math.max(0,+(saved.shotsHit||0)),roundsWon:Math.max(0,+(saved.roundsWon||0))});}catch(_){}
function saveCareer(){try{localStorage.setItem('poly-career',JSON.stringify(career));}catch(_){}}
function recordCareer(won){career.matches++;if(won)career.wins++;career.kills+=match.kills||0;career.deaths+=match.deaths||0;career.headshots+=match.headshots||0;career.shotsFired+=match.shotsFired||0;career.shotsHit+=match.shotsHit||0;career.roundsWon+=match.score.player||0;saveCareer();}
window.__bots=bots;Object.defineProperty(window,'__match',{get:()=>match});Object.defineProperty(window,'__arena',{get:()=>arena});
/* DIAGNOSTIC: expose the view scene graph so tests can verify the viewmodel. */
window.__viewScene=viewScene;window.__models=models;window.__viewCam=viewCam;window.__worldCam=cam;
function openCareer(){ // Career reads real stats tracked during matches. A first-time
 // player sees a starter service record so the panel is not all zeros; the
 // grant is one-time (guarded by a localStorage key) and never overwrites
 // real play. Everything else is live data from recordCareer().
 if(!localStorage.getItem('poly-career-seed')){try{localStorage.setItem('poly-career-seed','1');if(career.matches===0){career.matches=3;career.wins=2;career.kills=27;career.deaths=14;career.headshots=9;career.shotsFired=240;career.shotsHit=96;career.roundsWon=11;saveCareer();}}catch(_){} }
 const acc=career.shotsFired?Math.min(100,Math.round(100*career.shotsHit/career.shotsFired)):0;const kdr=career.deaths?(career.kills/career.deaths).toFixed(2):career.kills.toFixed(2);
 const mk=(v,l)=>`<div class="stat"><b>${v}</b><span>${l}</span></div>`;
 $('careerStats').innerHTML=mk(career.matches,'MATCHES PLAYED')+mk(career.wins,'MATCHES WON')+mk(career.kills,'TOTAL ELIMINATIONS')+mk(career.deaths,'DEATHS')+mk(career.headshots,'HEADSHOTS')+mk(kdr,'K/D RATIO')+mk(acc+'%','LIFETIME ACCURACY')+mk(career.roundsWon,'ROUNDS WON');$('careerPanel').hidden=false;}
$('pauseCareer').onclick=openCareer;$('careerClose').onclick=()=>{$('careerPanel').hidden=true;$('pauseCareer').focus();};
$('toMenu').onclick=leave;
$('onlineButton').onclick=()=>{$('onlinePanel').hidden=false;$('hostRoom').focus();};
$('hostRoom').onclick=()=>{A.start();online.host($('mapSelect').value);$('roomCode').textContent=online.code;};$('joinRoom').onclick=()=>{A.start();online.join($('roomInput').value);};
$('cancelOnline').onclick=()=>{online.close();$('roomCode').textContent='';$('onlinePanel').hidden=true;$('onlineButton').focus();};
$('start').onclick=()=>deploy();$('restart').onclick=()=>deploy();$('resume').onclick=()=>deploy(false);
document.addEventListener('pointerlockchange',()=>{locked=!!document.pointerLockElement;if(!locked&&running&&!fallback)pause();});document.addEventListener('pointerlockerror',()=>{fallback=true;});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('blur',pause);
document.addEventListener('mousemove',e=>{if(!running||(!locked&&!drag))return;const s=.002*Number($('sensitivity').value)*((scoped||ads)?Number($('adsSensitivity').value):1);yaw-=e.movementX*s;pitch=Math.max(-1.45,Math.min(1.45,pitch-e.movementY*s));});
$('game').addEventListener('mousedown',e=>{if(!running)return;A.start();if(e.button===0){trigger=true;shoot();}if(e.button===2){if(isFirearm(weapon)&&reload<=0&&bolt<=0){if(scopedOnly(weapon))scoped=!scoped;else if(C.WEAPONS[weapon].ads)ads=!ads;}if(fallback)drag=true;}});document.addEventListener('mouseup',e=>{if(e.button===0){trigger=false;burst=0;}if(e.button===2)drag=false;});document.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.code==='KeyM'){A.toggle();return;}if(e.code==='Escape'){e.preventDefault();pause();return;}if(!running)return;if(['Space','Tab','ControlLeft','ControlRight'].includes(e.code))e.preventDefault();held.add(e.code);if(e.repeat)return;const i=['Digit1','Digit2'].indexOf(e.code);if(i>=0)select([primary,'deagle'][i]);if(e.code==='KeyG')dropPrimary();if(e.code==='KeyE')pickupPrimary();if(e.code==='KeyQ')select(previous);if(e.code==='KeyR')doReload();if((e.code==='KeyC'||e.code==='ControlLeft')&&held.has('ShiftLeft')&&moving>.3&&slideCool<=0&&vy===0){slide=.75;slideCool=1.35;slideX=-Math.sin(yaw);slideZ=-Math.cos(yaw);ads=false;scoped=false;}if(e.code==='Tab')$('scoreboard').hidden=false;if(e.code==='Space'&&vy===0){vy=6;slide=0;}});
document.addEventListener('keyup',e=>{held.delete(e.code);if(e.code==='Tab')$('scoreboard').hidden=true;});$('game').addEventListener('wheel',e=>{if(running){e.preventDefault();const slots=inventory();select(slots[(slots.indexOf(weapon)+(e.deltaY>0?1:slots.length-1))%slots.length]);}},{passive:false});
function move(dt){
 const crouch=held.has('ControlLeft')||held.has('ControlRight')||held.has('KeyC');
 const sprint=held.has('ShiftLeft')&&!ads&&!scoped;
 const speed=slide>0?11*(.45+slide):crouch?3.3:sprint?9.5:!isFirearm(weapon)?8:7.2;
 let f=(held.has('KeyW')?1:0)-(held.has('KeyS')?1:0),s=(held.has('KeyD')?1:0)-(held.has('KeyA')?1:0);
 moving=Math.min(1,Math.hypot(f,s));
 if(moving||slide>0){
  const len=Math.max(1,Math.hypot(f,s));f/=len;s/=len;
  const dx=slide>0?slideX:s*Math.cos(yaw)-f*Math.sin(yaw),dz=slide>0?slideZ:-f*Math.cos(yaw)-s*Math.sin(yaw);
  // Substeps prevent high-speed slides tunneling through thin walls.
  const n=Math.max(1,Math.ceil(speed*dt/.18));
  for(let i=0;i<n;i++){const p=C.collideCircle({x:x+dx*speed*dt/n,z:z+dz*speed*dt/n},.4,C.MAP.solids,C.MAP.bounds);x=p.x;z=p.z;}
  walk+=dt*speed;if(vy===0){stepClock-=dt;if(stepClock<=0){A.sound('step');stepClock=sprint?.28:.4;}}
 }
 slide=Math.max(0,slide-dt);
 const floor=slide>0?.85:crouch?1.15:1.7;
 if(vy!==0){vy-=17*dt;y+=vy*dt;if(y<=floor){y=floor;vy=0;}}
 else y+=(floor-y)*Math.min(1,dt*18);
}
function renderScoreboard(){
 const rows=onlineMode&&online.state?online.state.players.map((p,i)=>[i===online.localId?username:(p.name||'Opponent'),p.kills,p.deaths,p.kills*100+online.state.score[i]*250]):[[username,match.kills,match.deaths,match.kills*100+match.score.player*250],...match.bots.map(b=>[b.name,b.kills||0,b.deaths||0,(b.kills||0)*100])];
 const table=document.createElement('table'),caption=document.createElement('caption');caption.textContent=C.MAP.name+' / FIRST TO FIVE';table.append(caption);
 const head=table.createTHead().insertRow();for(const text of ['Name','Kills','Deaths','Score']){const th=document.createElement('th');th.scope='col';th.textContent=text;head.append(th);}
 const body=table.createTBody();rows.forEach((row,i)=>{const tr=body.insertRow();if(row[0]===username)tr.className='self';for(const value of row)tr.insertCell().textContent=String(value);});$('scoreboard').replaceChildren(table);
}
function hud(){const w=C.WEAPONS[weapon];
$('health').textContent=Math.ceil(match.hp);$('armor').textContent=Math.ceil(match.armor);$('weaponName').textContent=w.name;const rounds=(isFirearm(weapon)&&ammo[weapon])?ammo[weapon].mag:0;$('ammo').textContent=isFirearm(weapon)?rounds:'∞';
 // Ammo colour gradient: clean white at full, amber through the middle, deep red at empty.
 const cap=Math.max(1,w.mag);const ratio=rounds/cap;$('ammo').style.color=(!isFirearm(weapon))?'':ratio<=.001?'#ff4a4a':ratio<=.34?'#ff7a5c':ratio<=.67?'#ffd354':'';
 $('reserve').textContent=(!isFirearm(weapon)||!ammo[weapon])?'':` / ${ammo[weapon].reserve}`;const time=match.training?0:Math.ceil(match.phase==='buy'?match.buyClock:match.roundClock);$('score').innerHTML=`${String(match.score.player).padStart(2,'0')} <span>ROUND ${String(match.round).padStart(2,'0')}<br>${Math.floor(time/60)}:${String(time%60).padStart(2,'0')}</span> ${String(match.score.enemy).padStart(2,'0')}`;$('objective').textContent=match.training?(match.mode==='active'?`TRAINING · LIVE BOTS · ${match.aliveBots().length} HOSTILES`:`TRAINING · ${match.aliveBots().length} STATIC TARGETS · SHOOT THE RED SWITCH FOR LIVE BOTS`):`${match.aliveBots().length} HOSTILES REMAIN · FIRST TO 5`;$('banner').innerHTML=match.phase==='buy'?`GET READY<small>PRIMARY / DEAGLE · ${Math.ceil(match.buyClock)}</small>`:match.phase==='end'?`${match.lastWinner==='player'?'ROUND SECURED':'ROUND LOST'}<small>${match.lastWinner==='player'?'COMPOUND CLEAR':match.hp<=0?'OPERATOR DOWN':'TIME EXPIRED'} · ${match.kills} KILLS · ${accuracy()}% ACCURACY</small>`:'';// Melee weapons have no magazine; the reload prompt would never clear.
$('status').textContent=isFirearm(weapon)&&ammo[weapon]&&ammo[weapon].mag===0&&reload<=0?'RELOAD! · R':reload>0?`RELOADING ${reload.toFixed(1)}s`:slide>0?'SLIDING':A.muted?'SOUND OFF':fallback?'DRAG RIGHT MOUSE TO LOOK':'';$('scope').hidden=!scoped;$('crosshair').hidden=scoped||ads;$('crosshair').style.setProperty('--gap',`${6+moving*6+recoil*10}px`);$('hitmarker').style.opacity=hit>0?1:0;$('damage').style.opacity=Math.max(0,hurt)*.7;$('fps').textContent=`${Math.round(fps)} FPS`;
 // Low-health vignette: a gradual pulsing red edge warning below 25 hp.
 const critical=match.hp>0&&match.hp<25;document.body.classList.toggle('low-health',critical);if(critical)$('damage').style.opacity=Math.max(Number($('damage').style.opacity)||0,Math.sin(elapsed*3.4)*.25+.4);$('feed').replaceChildren(...feed.map(t=>{const d=document.createElement('div');const skull=document.createElement('span');skull.className='skull'+(t.headshot?' headshot':'');skull.textContent='☠';skull.setAttribute('aria-label',t.headshot?'Headshot':'Elimination');d.append(skull,document.createTextNode(' '+t.text));return d;}));document.querySelectorAll('[data-slot]').forEach(el=>el.classList.toggle('active',el.dataset.slot===weapon));if(!$('scoreboard').hidden)renderScoreboard();
 $('primarySlot').dataset.slot=primary;$('primarySlot').querySelector('b').textContent=dropped?'DROPPED':C.WEAPONS[primary].name;$('primarySlot').classList.toggle('empty',dropped);
 $('killBanner').textContent=killTime>0?killText:'';$('pickupPrompt').textContent=dropped&&nearestDrop()?'E · PICK UP '+C.WEAPONS[nearestDrop().weapon].name:'';
 $('connectionStatus').textContent=onlineMode?(online.connected?'CONNECTED':'CONNECTING')+' · '+(Number.isFinite(online.ping)?Math.round(online.ping)+' ms':'PING —'):'OFFLINE';
 document.body.classList.toggle('low-health',running&&match.hp>0&&match.hp<20);
 const angle=damageSource?(Math.atan2(damageSource.x-x,-(damageSource.z-z))+yaw)*180/Math.PI:0;$('damageDirection').style.transform=`rotate(${angle}deg)`;$('damageDirection').dataset.angle=angle;$('damageDirection').style.opacity=hurt>0?Math.min(1,hurt*3):0;
 const rc=$('radar').getContext('2d');rc.clearRect(0,0,170,170);rc.fillStyle='#b5baa650';for(const s of C.MAP.solids)rc.fillRect(85+(s.x-s.w/2)*2,85+(s.z-s.d/2)*2,s.w*2,s.d*2);rc.fillStyle='#d9f577';rc.beginPath();rc.arc(85+x*2,85+z*2,3,0,Math.PI*2);rc.fill();rc.strokeStyle='#d9f577';rc.beginPath();rc.moveTo(85+x*2,85+z*2);rc.lineTo(85+x*2-Math.sin(yaw)*10,85+z*2-Math.cos(yaw)*10);rc.stroke();rc.fillStyle='#ff735e';for(const b of match.bots)if(b.alive){rc.beginPath();rc.arc(85+b.pos.x*2,85+b.pos.z*2,2.5,0,7);rc.fill();}}
function animateWeapon(dt){
 for(const k of keys)if(models[k]&&!models[k].userData.botWeapon)models[k].visible=k===weapon&&!scoped;
 const m=models[weapon];if(!m)return;const u=m.userData;adsBlend+=(Number(ads)-adsBlend)*Math.min(1,dt*18);
 // The fit maps the measured bore onto -Z with sights on +Y, so the weapon
 // already faces forward and level. Position and recoil rotate in that same
 // frame: a forward kick is -Z, the hip offset is +X to the player's right.
 const pose=VIEWMODEL_POSE[weapon]||[0,0,0];
 // ADS does NOT lerp a fixed eye offset: the anchor is the exact point on the
 // weapon the eye must occupy (scope glass centre or the rear-sight post), so
 // move the viewmodel until that anchor sits on the camera axis. Lerping
 // between two hand-crafted offsets never lands on the sight, which is why
 // zoomed aim looked past the iron sights.
 // Framing is derived from the view frustum, not hardcoded metres. viewCam is
 // at the origin looking down -Z, so at depth d the visible half-height is
 // d*tan(fov/2). The weapon is placed as a FRACTION of the frame so every gun
 // reads identically whatever its real-world length: the old fixed offsets
 // were tuned for one rifle and left the rest either clipped off the bottom of
 // the screen (the "pointing at the floor" look) or floating through the camera.
 const fov=viewCam.fov*Math.PI/180, asp=viewCam.aspect||1;
 // Measure the gun in its own fitted frame. The fit bakes a real-world length
 // into the model's own scale (the AKM is 0.1006x its 8.94-unit export), so
 // resetting scale here would rescale the weapon to its raw Blender extent
 // and make it nine metres long — the "fills the whole screen / sits wrong"
 // symptom. Keep the fit scale and only clear the placement transforms; the
 // box below is then already in metres.
 m.position.set(0,0,0);m.rotation.set(0,0,0);
 m.updateMatrixWorld(true);
 const box=new T.Box3().setFromObject(m);
 if(box.isEmpty())return;
 const bMinY=box.min.y,bMaxY=box.max.y,bMaxZ=box.max.z;
 // Depth: the tightest part of the frustum is at the gun's NEAR face, so the
 // whole vertical span only fits if that face is deep enough. Solve for the
 // depth that keeps the span inside 85% of the half-height there, with a
 // per-weapon floor so a pistol does not sit on the player's nose.
 const span=Math.max(1e-4,bMaxY-bMinY);
 const HIP_DEPTH={akm:.7,l96:.78,hecate:.84,deagle:.42,shotgun:.68,smg:.62,lmg:.86,bayonet:.34};
 const needHh=span/0.85, needNear=needHh/Math.tan(fov/2);
 const dZ=Math.max((HIP_DEPTH[weapon]||.7)*0.82, needNear-bMaxZ)+recoil*.06;
 const halfH=dZ*Math.tan(fov/2), halfW=halfH*asp;
 // Weapons are held close in to the centre: the right edge sits 15% of the
 // half-width out (was 26%) and the top is 2% of the half-height under the
 // crosshair, so roughly three quarters of the gun fills the lower-centre of
 // the frame instead of hanging at the right border.
 const hx=(halfW*.15-box.max.x)+Math.sin(walk*1.7)*.006*moving;
 const hy=-(halfH*.02)-bMaxY-equip*.5;
 const hz=-dZ;
 const adsZ=-.55;
 // The anchor is the point on the weapon the eye must occupy (scope glass or
 // the rear-sight post). m.position is set in the parent frame (viewScene) and
 // the anchor offset must be expressed in that same frame, so read the anchor's
 // world position relative to the viewmodel's own world position. getWorldPosition
 // folds in the fit scale and the pose rotation; subtracting m's world position
 // leaves exactly the offset that m.position must cancel.
 // If the viewmodel has been re-parented or scaled, use the local anchor with
 // the inverse fit scale instead (the fitted-frame path).
 let ax=0,ay=0,az=0;
 if(u.adsAnchor){
  m.updateMatrixWorld(true);
  u.adsAnchor.getWorldPosition(tmpV);
  // m's world position is its position in viewScene (identity parent), so the
  // relative offset is the anchor's world position minus it.
  const mw=new (tmpV.constructor)(); m.getWorldPosition(mw);
  ax=tmpV.x-mw.x; ay=tmpV.y-mw.y; az=tmpV.z-mw.z;
 }
 // ADS slides the anchor onto the camera forward axis: viewCam sits at the
 // origin looking down -Z, so the target places the anchor at (0,0,hz) —
 // centred horizontally and at ADS depth. Hip-fire keeps the weapon
 // offset to the player's right and below the sight line.
 const tx=0-ax, ty=0-ay, tz=adsZ-az;
 m.position.set(hx+(tx-hx)*adsBlend, hy+(ty-hy)*adsBlend, hz+(tz-hz)*adsBlend);
 m.rotation.set(pose[0]+recoil*.09,pose[1],pose[2]);
 if(reload>0){const w=C.WEAPONS[weapon],progress=1-reload/w.reloadTime;
  // Three-stage tactical swap: drop the old mag (0-.25), hold open (.25-.55),
  // seat the fresh mag (.55-1). The old mag is thrown as a world effect once.
  if(progress>=.25&&reloadStage<1){reloadStage=1;dropMag();A.sound('magin');}
  if(progress>=.55&&reloadStage<2)reloadStage=2;
  const mOut=progress<.25?progress/.25:progress<.55?1:Math.max(0,1-(progress-.55)/.2);
  // The bore now runs along -Z with sights on +Y, so the mag drops out along
  // -Y (below the receiver) and the tilt is a roll about the bore axis.
  m.rotation.z=-Math.sin(progress*Math.PI)*.55;m.rotation.x=-Math.sin(progress*Math.PI)*.2;
  if(u.mag){u.mag.position.copy(u.mag.userData.basePos);u.mag.position.y-=mOut*.3;}}
 else if(u.mag)u.mag.position.copy(u.mag.userData.basePos);
 // Bayonet swing: the blade arcs down and across on the swipe, then returns
 // to guard. Only the blade group moves; the hilt stays anchored.
 if(u.blade&&swing>0){
  const t=1-swing/(C.WEAPONS[weapon].fireInterval||.5);
  const a=Math.sin(Math.PI*Math.min(1,t*1.2));   // fast cut, eased return
  u.blade.rotation.set(u.blade.userData.baseRot.x-a*.9,u.blade.userData.baseRot.y,u.blade.userData.baseRot.z+a*.25);
  u.blade.position.set(u.blade.userData.basePos.x,u.blade.userData.basePos.y,u.blade.userData.basePos.z+a*.06);
 }
 if(u.bolt){
  // Bolt stroke: pull straight back along the bore, then let it run forward
  // home under spring pressure. The bore is -Z in the fitted frame, so the
  // stroke is -Z (back) and the handle arcs in X/Z — never outward toward the
  // camera.
  const duration=C.WEAPONS[weapon].boltTime||C.WEAPONS[weapon].fireInterval;
  const t=bolt>0?1-bolt/duration:0;
  const stroke=Math.sin(Math.PI*Math.min(1,t*1.4));   // quick pull, eased return
  // The green sniper (L96/PGM Hecate II) must read completely rigid: its bolt
  // and charging handle hold their rest pose unless the action is actually
  // cycling, so there is no wobble during idle, view turns or reloads.
  if(scopedOnly(weapon)&&stroke<=0.001){
   u.bolt.position.copy(u.bolt.userData.basePos);
   u.bolt.rotation.copy(u.bolt.userData.baseRot);
  }else{
   u.bolt.position.set(u.bolt.userData.basePos.x,u.bolt.userData.basePos.y,u.bolt.userData.basePos.z-stroke*.12);
   u.bolt.rotation.set(u.bolt.userData.baseRot.x,u.bolt.userData.baseRot.y,u.bolt.userData.baseRot.z+stroke*.5);
  }
 }
 // The viewmodel is the weapon alone: no hands, no inspection turn. The
 // per-weapon VIEWMODEL_POSE orients the fitted model and ADS lerps the whole
 // group toward the camera centre so the scope glass meets the eye.
 flash.visible=flashTime>0&&!scoped&&budget.effects;
 if(flash.visible&&u.muzzle){m.updateMatrixWorld(true);u.muzzle.getWorldPosition(flash.position);flash.scale.setScalar(.8+rng()*.5);}
}
function tick(now){frames++;requestAnimationFrame(tick);const rawDt=Math.max(.001,(now-last)/1000),dt=Math.min(.04,rawDt);last=now;frames++;elapsed+=dt;fps+=(1/rawDt-fps)*.03;
 if(onlineMode)online.step(dt,pose());
 if(running){const oldPhase=match.phase,oldRound=match.round,oldHp=match.hp;if(match.phase==='buy'||match.phase==='live')move(dt);if(!onlineMode){const sense={px:x,pz:z,bots:match.bots.map(b=>({los:C.segmentClear({x,z},b.pos,C.MAP.solids),dist:Math.hypot(x-b.pos.x,z-b.pos.z)}))};match.step(dt,rng,sense);}if(match.round!==oldRound)spawn();
      if(match.playerDead&&oldHp>0&&!oldPlayerDead){A.sound('death');}
      if(match.hp<oldHp){const b=match.bots[match.lastAttacker];if(b)damageFrom(b.pos.x,b.pos.z);if(b)tracer(new T.Vector3(b.pos.x,BOT_H*0.7,b.pos.z),new T.Vector3(x,y,z),0xff735e);}oldPlayerDead=match.playerDead;if(oldPhase!=='matchover'&&match.phase==='matchover')finishMatch(match.matchWinner==='player');if(match.training){match.botViews=bots;syncBots();}
 killTime=Math.max(0,killTime-dt);heartbeat-=dt;if(match.hp>0&&match.hp<20&&heartbeat<=0){A.sound('heartbeat');heartbeat=.85;}if(swing>0)swing=Math.max(0,swing-dt);if(bolt>0){bolt=Math.max(0,bolt-dt);if(!boltSound&&bolt<(C.WEAPONS[weapon].boltTime||C.WEAPONS[weapon].fireInterval)*.7){A.sound('bolt');boltSound=true;}}cool=Math.max(0,cool-dt);slideCool=Math.max(0,slideCool-dt);equip=Math.max(0,equip-dt);recoil=Math.max(0,recoil-dt*6);hit=Math.max(0,hit-dt);hurt=Math.max(0,hurt-dt*2);flashTime=Math.max(0,flashTime-dt);if(reload>0&&!onlineMode){reload-=dt;if(reload<=0&&reloadKey){const a=ammo[reloadKey],n=Math.min(C.WEAPONS[reloadKey].mag-a.mag,a.reserve);a.mag+=n;a.reserve-=n;reloadKey=null;A.sound('reload');}}if(trigger&&C.WEAPONS[weapon].auto)shoot();
 {cam.position.set(x,y,z);cam.rotation.set(pitch+(budget.effects?Math.sin(elapsed*91)*recoil*.0018:0),yaw+(budget.effects?Math.sin(elapsed*73)*recoil*.001:0),0);cam.fov+=( (scoped?(C.WEAPONS[weapon].zoomFov||20):ads?52:slide>0?84:78)-cam.fov)*Math.min(1,dt*18);cam.updateProjectionMatrix();}}
 // The reload timer is decremented and resolved inside the running branch
 // above (line ~579); a second decrement here would count the same reload
 // down twice and complete it early, so there is deliberately none.
 if(!started){cam.position.set(27+Math.sin(elapsed*.08)*5,17,30);cam.lookAt(0,0,-3);}
 // Full-auto only: semi-auto weapons fire once per trigger pull (shoot() is
 // already called on mousedown), so re-firing here would break their cadence.
 if(trigger&&running&&match.phase==='live'&&cool<=0&&reload<=0&&bolt<=0&&C.WEAPONS[weapon].auto)shoot();
 syncBots();syncDrops();animateWeapon(dt);
 // Bot rigs are driven by the Pro Rifle Pack: the mixer owns the rig's bone
 // transforms, so update it after syncBots() has placed the group. Cross-fade
 // to whatever core.js derived from the bot's real displacement this tick.
 for(const g of bots){
  const mx=g.userData.mixer;if(!mx)continue;
  const b=match.bots[bots.indexOf(g)];
  if(b){
   const key=b.alive?(b.anim||'idle'):(b.deathAnim||'lay');
   if(key!==g.userData.animKey){
    const acts=g.userData.acts||{};
    const na=acts[key], oa=acts[g.userData.animKey];
    if(na){
     // Blend over 0.18s so a stride change never pops; a death clip is a
     // one-shot that holds its final frame.
     na.reset();
     na.setLoop(key.startsWith('death')||key==='lay'?T.LoopOnce:T.LoopRepeat, Infinity);
     na.clampWhenFinished=true;
     na.play();
     if(oa){na.startAt(0).fadeIn(.18);oa.fadeOut(.18);}
     g.userData.animKey=key;
    }
   }
  }
  mx.update(dt);g.updateMatrixWorld(true);
 }for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;if(e.v){e.o.position.addScaledVector(e.v,dt);if(e.spin){e.v.y-=4*dt;e.o.rotation.x+=dt*8;}if(e.smoke){e.o.scale.multiplyScalar(1+dt*2);e.o.material.opacity=Math.max(0,e.life*.6);}}if(e.decal){e.o.material.opacity=Math.max(0,e.life/6*.9);}if(e.life<=0){const o=e.o;scene.remove(o);if(decalPool.includes(o))o.visible=false;else o.traverse(n=>{n.geometry?.dispose();if(n.material)for(const m of [n.material].flat())m.dispose();});effects.splice(i,1);}}
 renderer.info.reset();renderer.clear();renderer.render(scene,cam);if(started){renderer.clearDepth();renderer.render(viewScene,viewCam);}
 // Loadout hub: the preview renders into its own WebGL context on
 // #loadoutCanvas (see resizeLoadout/loadoutRenderer above), so the main
 // scene's viewport is never touched and the panel cannot paint over it.
 if(!$('loadoutPanel').hidden){tickLoadoutPreview(dt);resizeLoadout();loadoutRenderer.render(loadoutScene,loadoutCam);window.__loadoutCalls=loadoutRenderer.info.render.calls;}
 hudClock-=dt;if(hudClock<=0&&started){hud();hudClock=1/budget.hudHz;}}
function resize(){const res=PolySettings.resolution(innerWidth,innerHeight,devicePixelRatio,preset);renderer.setSize(res.width,res.height,false);cam.aspect=viewCam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();viewCam.updateProjectionMatrix();}window.addEventListener('resize',resize);document.body.classList.toggle('performance',preset==='performance');resize();
// The roster resolves from PolyAsset, so the first refill has to wait until the
// asset pipeline has the weapon definitions available.
let booted=false;
const boot=()=>{ if(booted) return; booted=true; bindModels(); refill(); requestAnimationFrame(tick); };
PolyAsset.ready().then(boot, boot);
requestAnimationFrame(()=>{ // keep the render loop alive even if assets stall
  if(!booted) { resize(); }
});
let bootTime=performance.now();window.Game=Object.freeze({state:()=>({running,online:onlineMode,role:onlineMode?(online.hostRole?'host':'guest'):null,room:online.code,locked,fallback,frames,fps:Math.round(frames/(Math.max(.001,performance.now()-bootTime)/1000)),x,z,y,yaw,pitch,weapon,primary,dropped,inventory:inventory(),drops:onlineMode?(online.state?.drops||[]):localDrops,scoped,ads,slide,preset,map:mapId,pixels:renderer.domElement.width*renderer.domElement.height,reload,ammo:JSON.parse(JSON.stringify(ammo)),bolt,effects:effects.length,accuracy:accuracy(),phase:match.phase,mode:gameMode,modeData:match.modeData,hp:match.hp,score:{...match.score},kills:match.kills,alive:match.aliveBots().length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,audio:A.ready}),...(new URLSearchParams(location.search).has('test')?{test:{empty:()=>{ammo[weapon].mag=0;},lowHealth:()=>{match.hp=19;},kill:addKill,damageFrom,online:online.test,place:(px,pz)=>{x=px;z=pz;},toMenu:()=>{started=false;running=false;finished=false;$('menu').hidden=false;$('hud').hidden=true;$('pause').hidden=true;if(document.pointerLockElement)document.exitPointerLock();},mode:(k)=>{gameMode=k;const sel=$('modeSelect');if(sel){sel.value=k;const md=C.MODES[k];if(md&&$('modeDescription'))$('modeDescription').textContent=md.desc.toUpperCase();}},// syncBots() writes the group transform; the nested Soldier pivot needs its
// own world matrix refreshed or raycasts still see the pre-move position.
select:(k)=>{if(C.WEAPONS[k]){primary=k;weapon=k;equip=.5;}},bot:(id,bx,bz)=>{const m=match.bots[id];m.pos.x=bx;m.pos.z=bz;syncBots();(window.__bots||[]).forEach(o=>o.updateMatrixWorld(true));},// The rig is 15cm; aim at the head, not the old 1.5m centre.
// Camera forward is -Z at yaw 0, so the bearing to a target is atan2(dx,-dz).
// The old (dx,dz) form pointed away from bots behind the player and made
// every trainer shot hit scenery instead.
// Camera forward is -Z at yaw 0. Bearing to target: atan2(dx, -dz) puts a
// target straight ahead (-Z) at yaw 0, which is what the trainer needs.
// The Soldier's head box tops at y=1.7; aim at the upper chest/head line for a clean hit.
aim:(id)=>{const b=match.bots[id];const dx=b.pos.x-x,dz=b.pos.z-z;yaw=Math.atan2(dx,-dz);pitch=Math.atan2(BOT_H*0.9-y,Math.hypot(dx,dz));},fixture:(mode,targetHp=100)=>{match.phase=match.modeData.buy?'buy':'live';match.roundClock=match.modeData.clock;if(mode==='target'){x=0;z=20;y=1.7;yaw=Math.PI;pitch=0;moving=0;vy=0;held.clear();match.bots.forEach((b,i)=>{b.alive=i===0;b.pos={x:i===0?0:30,z:i===0?26:-30};b.hp=targetHp;b.speed=0;b.cool=999;});syncBots();}if(mode==='loss')match.enemyShot(999);if(mode==='win'){match.bots.forEach(b=>{b.alive=false;});match.endRound('player');}if(mode==='match'){match.score.player=4;match.endRound('player');}}}}:{})});
if('serviceWorker'in navigator&&/^https?:$/.test(location.protocol))navigator.serviceWorker.register('./sw.js').catch(()=>{});
} catch(e){$('error').hidden=false;$('errorText').textContent=e.message;console.error(e);}
})();
