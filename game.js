/* POLY-STRIKE — controller, raycasts, viewmodels and HUD. */
(() => { 'use strict';
const $=id=>document.getElementById(id), T=window.THREE, A=window.PolyAudio;
let C=window.POLY_CORE, mapId='desert', preset='medium';
try{preset=PolySettings.normalize(localStorage.getItem('poly-graphics'));}catch(_){}
let budget=PolySettings.PRESETS[preset];
const primaries=['ak47','awp','kar98'];let primary='ak47',secondary='deagle',dropped=false,localDrops=[];const dropNodes=new Map();
try{const saved=localStorage.getItem('poly-primary');if(primaries.includes(saved))primary=saved;}catch(_){}
try{const savedSecondary=localStorage.getItem('poly-secondary');if(['deagle','knife'].includes(savedSecondary))secondary=savedSecondary;}catch(_){}
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
const inventory=()=>dropped?[secondary==='deagle'?'deagle':'knife',secondary==='deagle'?'knife':'deagle']:[primary,secondary==='deagle'?'deagle':'knife',secondary==='deagle'?'knife':'deagle'];
// Iron-sight weapons (AK, Kar98k, Deagle) use the ADS state: right-click raises
// the gun with no scope overlay and no zoom. Only the AWP is a scoped sniper.
const scopedOnly=k=>k==='awp';
const cleanName=v=>String(v||'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,20)||'Operator';
let username='Operator';try{username=cleanName(localStorage.getItem('poly-username'));}catch(_){}
$('username').value=username;$('username').onchange=()=>{username=cleanName($('username').value);$('username').value=username;try{localStorage.setItem('poly-username',username);}catch(_){}};
try {
const renderer=new T.WebGLRenderer({canvas:$('game'),antialias:false,powerPreference:'high-performance'});
renderer.setPixelRatio(1);renderer.info.autoReset=false; renderer.outputEncoding=T.sRGBEncoding; renderer.autoClear=false;
const scene=new T.Scene();scene.background=new T.Color(0xa9c6ca);scene.fog=new T.Fog(0xa9c6ca,35,110);
scene.add(new T.HemisphereLight(0xe5f4ff,0x756042,1.25));const sun=new T.DirectionalLight(0xffeccb,1.7);sun.position.set(-20,40,15);scene.add(sun);
const cam=new T.PerspectiveCamera(75,1,.06,180);cam.rotation.order='YXZ';
const viewScene=new T.Scene(),viewCam=new T.PerspectiveCamera(65,1,.02,10);viewScene.add(new T.HemisphereLight(0xffffff,0x697681,1.6));const vl=new T.DirectionalLight(0xffe5cf,1.7);vl.position.set(-2,3,4);viewScene.add(vl);
let arena=PolyVisual.buildArena(T,scene,C,preset);const worldNodes=scene.children.filter(o=>!o.isLight);const bots=C.MAP.spawnBots.map((_,i)=>{const b=PolyVisual.buildBot(T,i);scene.add(b);return b;});
const keys=Object.keys(C.WEAPONS),models={};for(const key of keys){models[key]=PolyVisual.buildWeapon(T,key);viewScene.add(models[key]);models[key].visible=false;models[key].traverse(o=>{o.userData.basePos=o.position.clone();o.userData.baseRot=o.rotation.clone();});}
const handRoots={};for(const k of keys){const h=new T.Group();handRoots[k]=h;for(const hand of models[k].userData.hands||[])h.add(hand);viewScene.add(h);}
const flash=new T.Mesh(new T.ConeGeometry(.045,.22,5),new T.MeshBasicMaterial({color:0xffdc85}));flash.rotation.x=-Math.PI/2;viewScene.add(flash);flash.visible=false;
const ray=new T.Raycaster(), dir=new T.Vector3(), origin=new T.Vector3();const held=new Set();
let match=C.createMatch(),rng=C.mulberry32(4451),running=false,started=false,locked=false,drag=false,fallback=false;
let ads=false,adsBlend=0,slide=0,slideCool=0,slideX=0,slideZ=0,inspectVariant=1;
let weapon='ak47',previous='knife',ammo={},reload=0,reloadKey=null,cool=0,equip=.3,inspect=0,scoped=false,trigger=false,burst=0,recoil=0,hit=0,hurt=0,flashTime=0;
let x=0,z=34,y=1.7,vy=0,yaw=0,pitch=0,walk=0,moving=0,frames=0,elapsed=0,last=performance.now(),fps=60,hudClock=0,stepClock=0;
const spray=C.buildSprayPattern(4815,30),effects=[];let feed=[];
let damageSource=null,inspectRest=null,inspectFade=0,lastInspectPose=null,bolt=0,boltSound=false,reloadStage=-1,heartbeat=0,enemyFoot=0,enemyPose=null,killCount=0,killClock=0,killText='',killTime=0,roundNotice=0,finished=false;
function cancelInspect(){if(inspect>0){inspectRest=lastInspectPose?{...lastInspectPose}:null;if(inspectRest)for(const k of ['rx','ry','rz','handleA','handleB','blade'])inspectRest[k]=Math.atan2(Math.sin(inspectRest[k]||0),Math.cos(inspectRest[k]||0));inspectFade=.1;inspect=0;}}
function damageFrom(sx,sz){damageSource={x:sx,z:sz};hurt=.65;A.sound('enemy');}
function addKill(text,headshot=false){feed.unshift({text,headshot});feed=feed.slice(0,4);killCount=elapsed-killClock<5?killCount+1:1;killClock=elapsed;killTime=2;killText=(headshot?'HEADSHOT':'ELIMINATION')+' · '+killCount+' KILL'+(killCount>1?'S':'');if(killCount>1)A.announce?.(killCount===2?'double':killCount===3?'triple':'multi');}
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
  if(netRound>0&&p.primaryLocked&&primaries.includes(p.primary))primary=p.primary;const wasDropped=dropped;dropped=!!p.dropped;if(!inventory().includes(weapon)){reload=0;select('deagle');}if(wasDropped&&!dropped){reload=0;select(primary);}
  if(p.hp<netHp)damageFrom(q.x,q.z);netHp=p.hp;
  match.phase=s.phase;match.round=s.round;match.buyClock=s.buyClock;match.roundClock=s.roundClock;match.hp=p.hp;match.armor=0;match.score={player:s.score[id],enemy:s.score[1-id]};match.kills=p.kills;match.deaths=p.deaths;match.lastWinner=s.lastWinner===null?null:s.lastWinner===id?'player':'enemy';
  for(const k of keys)ammo[k]={...p.ammo[k]};reload=p.reload;reloadKey=p.reloadKey;
  match.bots.forEach((b,i)=>{b.alive=i===0&&q.alive;b.pos={x:q.x,z:q.z};b.hp=q.hp;});
  const e=s.events[s.events.length-1];if(e){const tag=e.player+':'+e.seq;if(tag!==lastNetEvent){lastNetEvent=tag;if(e.player===id){hit=.18;A.sound(e.part==='head'?'headshot':e.killed?'kill':'hit');match.shotsHit++;if(e.killed)addKill((e.part==='head'?'HEADSHOT · ':'')+C.WEAPONS[e.weapon].name+' → '+(q.name||'Opponent'),e.part==='head');}}}
  if(s.phase==='end'&&roundNotice!==s.round){roundNotice=s.round;if(s.lastWinner===id)A.announce?.('clutch');}
  if(s.phase==='matchover')finishMatch(s.matchWinner===id);
 }
});
function finishMatch(won){if(finished)return;finished=true;running=false;clearInput();recordCareer(won);$('pauseTitle').textContent=won?'VICTORY':'DEFEAT';$('pauseText').textContent=`Final score ${match.score.player} : ${match.score.enemy}. ${match.kills} eliminations. Accuracy: ${accuracy()}%. MVP: ${mvp()}.`;$('rematchControls').hidden=false;$('nextMap').value=nextMapId();$('nextMap').disabled=onlineMode&&!online.hostRole;$('rematch').disabled=false;$('rematch').textContent=onlineMode?'REQUEST / ACCEPT REMATCH':'PLAY NEXT MATCH';$('rematchStatus').textContent=onlineMode?'Both players must consent. Host selects next map.':'';$('resume').hidden=true;$('pause').hidden=false;if(document.pointerLockElement)document.exitPointerLock();}
function accuracy(){const p=onlineMode?online.state?.players[online.localId]:match;return p?.shotsFired?Math.min(100,Math.round(100*(p.shotsHit||0)/p.shotsFired)):0;}
function mvp(){const rows=onlineMode&&online.state?online.state.players.map((p,i)=>({name:p.name||'Opponent',score:p.kills*100+online.state.score[i]*250})):[{name:username,score:match.kills*100+match.score.player*250},...match.bots.map(b=>({name:b.name,score:(b.kills||0)*100}))];return rows.sort((a,b)=>b.score-a.score)[0].name;}
function nextMapId(){const maps=['desert','industrial','urban'];return $('rotateMaps').checked?maps[(maps.indexOf(mapId)+1)%maps.length]:mapId;}
$('rematch').onclick=()=>{if(onlineMode){if(online.requestRematch($('nextMap').value)&&match.phase==='matchover'){$('rematchStatus').textContent='Consent sent — waiting for opponent';$('rematch').disabled=true;}}else{$('mapSelect').value=$('nextMap').value;deploy();}};
function refill(){for(const k of keys)ammo[k]={mag:C.WEAPONS[k].mag,reserve:C.WEAPONS[k].reserve};reload=0;reloadKey=null;cool=0;scoped=false;ads=false;match.armor=100;}
function spawn(){killCount=0;roundNotice=0;inspectFade=0;inspectRest=null;bolt=0;reloadStage=-1;dropped=false;localDrops=[];weapon=primary;previous='knife';ads=false;slide=0;slideCool=0;equip=.2;burst=0;inspect=0;x=C.MAP.spawnPlayer.x;z=C.MAP.spawnPlayer.z;y=1.7;vy=0;yaw=0;pitch=0;refill();}
function clearInput(){held.clear();trigger=false;drag=false;$('scoreboard').hidden=true;}
function lock(){fallback=$('fallback').checked;if(fallback)return;try{const p=$('game').requestPointerLock();if(p&&p.catch)p.catch(()=>{fallback=true;});}catch(_){fallback=true;}}
function deploy(fresh=true){if(fresh){finished=false;if(onlineMode){onlineMode=false;online.close();}loadMap($('mapSelect').value);match=C.MAP.training?C.createTrainingMatch():C.createMatch();rng=C.mulberry32(4451);spawn();feed=[];weapon=primary;}started=true;running=true;$('rematchControls').hidden=true;clearInput();document.activeElement?.blur();$('menu').hidden=true;$('pause').hidden=true;$('hud').hidden=false;A.start();lock();}
function pause(){if(!started||!running)return;running=false;clearInput();$('pauseTitle').textContent='PAUSED';$('pauseText').textContent=onlineMode?'Online match continues. Click resume to return.':'Your offline match is frozen. Click resume to return.';$('resume').hidden=false;$('pause').hidden=false;if(document.pointerLockElement)document.exitPointerLock();}
function select(k){if(!inventory().includes(k)||k===weapon||(onlineMode&&reload>0))return;previous=weapon;weapon=k;bolt=0;inspectFade=0;inspectRest=null;reload=0;reloadKey=null;scoped=false;ads=false;burst=0;inspect=0;equip=.35;cool=.15;A.sound('switch');}
function currentDrops(){return onlineMode?(online.state?.drops||[]).map(d=>({...d,weapon:d.key||d.weapon})):localDrops;}
function nearestDrop(){return currentDrops().find(d=>(!onlineMode||d.weapon===primary)&&Math.hypot(x-d.x,z-d.z)<2.5&&C.segmentClear({x,z},d,C.MAP.solids));}
function dropPrimary(){if(dropped||weapon!==primary||reload>0||!['buy','live'].includes(match.phase))return;if(onlineMode){online.drop();return;}localDrops=[{id:'local',weapon:primary,x:x-Math.sin(yaw),z:z-Math.cos(yaw),ammo:{...ammo[primary]}}];dropped=true;select('deagle');}
function pickupPrimary(){const d=nearestDrop();if(!d||!dropped||!['buy','live'].includes(match.phase))return;if(onlineMode){online.pickup(d.id);return;}primary=d.weapon;if(d.ammo)ammo[primary]={...d.ammo};localDrops=[];dropped=false;select(primary);}
function syncDrops(){const live=new Set();for(const d of currentDrops().slice(0,8)){if(!C.WEAPONS[d.weapon])continue;live.add(d.id);let o=dropNodes.get(d.id);if(!o){o=PolyVisual.buildWeapon(T,d.weapon);for(const h of o.userData.hands||[])h.removeFromParent();scene.add(o);dropNodes.set(d.id,o);}o.position.set(d.x,.22,d.z);o.rotation.set(0,elapsed*.2,Math.PI/2);}for(const [id,o] of dropNodes)if(!live.has(id)){scene.remove(o);o.traverse(n=>{n.geometry?.dispose();if(n.material)for(const m of [n.material].flat())m.dispose();});dropNodes.delete(id);}}
function doReload(){const w=C.WEAPONS[weapon];if(weapon==='knife'||reload>0||ammo[weapon].mag===w.mag||ammo[weapon].reserve===0)return;if(onlineMode)online.reload(weapon);reload=w.reloadTime;reloadKey=weapon;scoped=false;ads=false;cancelInspect();reloadStage=0;A.sound('magout');}
// Tactical magazine swap: the old mag detaches, drops free and is thrown clear,
// then a fresh mag is seated. Stages key off reload progress in animateWeapon.
function dropMag(){
 if(!PolyVisual.buildMagazine||!budget.effects||effects.length>22)return;
 const kind=reloadKey||weapon;
 if(kind==='knife'||kind==='awp')return;
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
function tracer(a,b,color){if(!budget.effects||effects.length>=24)return;const g=new T.BufferGeometry().setFromPoints([a,b]);const m=new T.LineBasicMaterial({color,transparent:true,opacity:.7});const o=new T.Line(g,m);scene.add(o);effects.push({o,life:.07});}
// Bullet impact decals: pooled marks oriented to the surface they hit.
const decalGeo=new T.PlaneGeometry(.055,.055);const decalMat=()=>new T.MeshBasicMaterial({color:0x12140f,transparent:true,opacity:.9,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});const decalPool=[];const MAX_DECALS=48;
function spawnDecal(hit){if(!hit.face)return;let o=decalPool.find(d=>!d.visible);if(!o){if(decalPool.length>=MAX_DECALS)o=decalPool.shift();else{o=new T.Mesh(decalGeo,decalMat());decalPool.push(o);}scene.add(o);o.frustumCulled=false;}
 const n=hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
 o.position.copy(hit.point).addScaledVector(n,.012);const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),n);o.setRotationFromQuaternion(q);o.rotateZ(rng()*Math.PI*2);
 o.material.opacity=.9;o.scale.setScalar(.8+rng()*.5);o.visible=true;o.renderOrder=2;
 // Fade out over ~6s so walls do not accumulate permanent marks.
 effects.push({o,life:6,decal:true});}
function syncBots(){match.bots.forEach((b,i)=>{const o=bots[i];o.visible=b.alive;o.position.set(b.pos.x,0,b.pos.z);o.rotation.y=Math.atan2(x-b.pos.x,z-b.pos.z);const legs=Array.isArray(o.userData.legs)?o.userData.legs:o.userData.legs?[o.userData.legs]:[];legs.forEach((l,j)=>{l.rotation.x=Math.sin(elapsed*8+i+j*Math.PI)*.28;});});}
function shoot(){const w=C.WEAPONS[weapon];if(running)cancelInspect();if(!running||match.phase!=='live'||cool>0||reload>0||equip>0)return;cancelInspect();if(weapon!=='knife'&&ammo[weapon].mag<=0){A.sound('dry');cool=.25;return;}
 cool=w.fireInterval;if(scopedOnly(weapon)){bolt=w.boltTime||w.fireInterval;boltSound=false;}match.shotsFired++;if(weapon!=='knife')ammo[weapon].mag--;A.sound(weapon);flashTime=weapon==='knife'?0:.045;recoil=weapon==='knife'?.8:1;
 cam.position.set(x,y,z);cam.rotation.set(pitch,yaw,0);cam.updateMatrixWorld(true);syncBots();for(const b of bots)b.updateMatrixWorld(true);origin.copy(cam.position);cam.getWorldDirection(dir);const sp=C.pickSpread(weapon,moving,held.has('ControlLeft')||held.has('KeyC'),vy!==0,scoped||ads,rng);dir.applyAxisAngle(new T.Vector3(0,1,0),sp.yaw);const right=new T.Vector3().crossVectors(dir,cam.up).normalize();dir.applyAxisAngle(right,sp.pitch).normalize();ray.set(origin,dir);ray.far=weapon==='knife'?2.65:150;
 if(onlineMode)online.shoot(weapon,origin,dir,pose());
 const hits=ray.intersectObjects([...arena.hitMeshes,...bots.filter((b,i)=>b.visible&&match.bots[i].alive)],true);let end=origin.clone().addScaledVector(dir,80);if(hits.length){const h=hits[0];end=h.point;const id=h.object.userData.botId;if(id!==undefined&&!onlineMode){const result=match.playerShot(weapon,id,h.object.userData.part||'body',h.distance);if(result.dmg>0){match.shotsHit++;hit=.18;A.sound(h.object.userData.part==='head'?'headshot':result.killed?'kill':'hit');if(result.killed)addKill(`${h.object.userData.part==='head'?'HEADSHOT · ':''}${w.name}  →  ${match.bots[id].name}`,h.object.userData.part==='head');}}
  else if(weapon!=='knife'&&budget.effects)spawnDecal(h);}
 shotEffects();if(weapon!=='knife')tracer(origin.clone().addScaledVector(right,.25).add(new T.Vector3(0,-.2,0)),end,0xffdf91);
 if(weapon==='ak47'){const p=spray[burst%30];pitch=Math.min(1.45,pitch+p.up*.009);yaw+=p.side*.007;burst++;}else if(weapon!=='knife')pitch=Math.min(1.45,pitch+w.recoil*.013);
 if(scopedOnly(weapon)){scoped=false;ads=false;}
}
function disposeWorld(){
 if(arena.dispose){arena.dispose();for(const o of worldNodes)scene.remove(o);worldNodes.length=0;return;}
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
 for(let i=0;i<want;i++){const b=PolyVisual.buildBot(T,i);scene.add(b);bots.push(b);}
}
function loadMap(id){
 mapId=['desert','industrial','urban','training'].includes(id)?id:'desert';C=POLY_CORE.forMap?POLY_CORE.forMap(mapId):POLY_CORE;
 disposeWorld();const before=new Set(scene.children);arena=PolyVisual.buildArena(T,scene,C,preset);
 worldNodes.push(...scene.children.filter(o=>!before.has(o)));for(const o of worldNodes){o.updateMatrixWorld(true);o.traverse(n=>{n.matrixAutoUpdate=false;});}
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
$('applySettings').onclick=()=>{preset=PolySettings.normalize($('graphics').value);budget=PolySettings.PRESETS[preset];try{localStorage.setItem('poly-graphics',preset);}catch(_){}document.body.classList.toggle('performance',preset==='performance');loadMap(mapId);resize();document.activeElement.blur();$('settingsPanel').hidden=true;if(settingsReturn)settingsReturn.focus();};
/* ------------------------------------------------------------- Loadout hub */
let loadoutPreview=null,loadoutInspectTime=0,loadoutInspectVar=0,loadoutSelected=primary;
// A dedicated scene renders the selected weapon so the player can inspect it
// before committing to a loadout.
const loadoutScene=new T.Scene();loadoutScene.background=new T.Color(0x0b1c22);loadoutScene.add(new T.HemisphereLight(0xffffff,0x46565c,1.5));const lv=new T.DirectionalLight(0xffe5cf,1.5);lv.position.set(-2,3,4);loadoutScene.add(lv);
const loadoutCam=new T.PerspectiveCamera(45,1.5,.02,10);loadoutCam.position.set(0,.12,1.15);loadoutCam.lookAt(0,.03,0);
const loadoutModels={};for(const k of ['ak47','awp','kar98','deagle','knife']){loadoutModels[k]=PolyVisual.buildWeapon(T,k);loadoutModels[k].visible=false;loadoutScene.add(loadoutModels[k]);}
function setLoadoutPreview(key){loadoutSelected=key;for(const k of Object.keys(loadoutModels))loadoutModels[k].visible=k===key;const m=loadoutModels[key];m.position.set(0,0,0);m.rotation.set(0,0,0);loadoutInspectTime=0;const w=C.WEAPONS[key];$('loadoutName').textContent=w.name;$('loadoutDesc').textContent=w.slot==='primary'?`${w.name.split(' ')[0]} / ${w.auto?'Automatic':'Semi or bolt'} · ${w.mag} rounds`:key==='deagle'?'Desert Eagle / Semi-auto pistol · 7 rounds':'Butterfly Knife / Melee · unlimited';
 for(const el of document.querySelectorAll('.wcard'))el.classList.toggle('active',el.dataset.weapon===key);}
function renderLoadoutCards(){
 const mk=(key,tag)=>{const w=C.WEAPONS[key];const el=document.createElement('button');el.className='wcard'+(key===loadoutSelected?' active':'');el.dataset.weapon=key;el.innerHTML=`<b>${w.name}</b><small>${tag}</small>`;el.onclick=()=>{setLoadoutPreview(key);if(primaries.includes(key))primary=key;else secondary=key;try{localStorage.setItem(primaries.includes(key)?'poly-primary':'poly-secondary',key);}catch(_){}A.sound('equip');};return el;};
 $('primaryCards').replaceChildren(...primaries.map(k=>mk(k,k==='ak47'?'Assault rifle':k==='awp'?'Heavy sniper':'Bolt-action rifle')));
 $('secondaryCards').replaceChildren(...['deagle','knife'].map(k=>mk(k,k==='deagle'?'Semi-auto pistol':'Melee / two flip variants')));}
$('loadoutButton').onclick=()=>{renderLoadoutCards();$('loadoutPanel').hidden=false;setLoadoutPreview(primary);};
$('loadoutClose').onclick=()=>{if(weapon!==primary&&!dropped)weapon=primary;$('loadoutPanel').hidden=true;$('loadoutButton').focus();};
$('loadoutInspect').onclick=()=>{loadoutInspectTime=PolyInspection.durations[loadoutSelected];loadoutInspectVar=(loadoutInspectVar+1)%2;A.sound('magout');};
function tickLoadoutPreview(dt){if($('loadoutPanel').hidden)return;const m=loadoutModels[loadoutSelected];if(!m||!m.visible)return;
 // Slow idle drift while idle, cinematic pose while inspecting.
 if(loadoutInspectTime>0){loadoutInspectTime=Math.max(0,loadoutInspectTime-dt);const p=PolyInspection.pose(loadoutSelected,1-loadoutInspectTime/PolyInspection.durations[loadoutSelected],loadoutInspectVar);m.position.set(p.dx,p.dy,p.dz);m.rotation.set(p.rx,p.ry,p.rz);if(loadoutSelected==='knife'&&m.userData.handleA){m.userData.handleA.rotation.x=(m.userData.handleA.userData.baseRot?.x||0)+p.handleA;m.userData.handleB.rotation.x=(m.userData.handleB.userData.baseRot?.x||0)+p.handleB;m.userData.blade.rotation.z=(m.userData.blade.userData.baseRot?.z||0)+p.blade;}}
 else{m.position.set(0,Math.sin(elapsed*.8)*.008,0);m.rotation.set(0,Math.sin(elapsed*.3)*.12+Math.PI*.02,0);}}
/* ------------------------------------------------------------- Career stats */
const career={matches:0,wins:0,kills:0,deaths:0,headshots:0,shotsFired:0,shotsHit:0,roundsWon:0};
try{const saved=JSON.parse(localStorage.getItem('poly-career'));if(saved&&typeof saved==='object')Object.assign(career,{matches:Math.max(0,+(saved.matches||0)),wins:Math.max(0,+(saved.wins||0)),kills:Math.max(0,+(saved.kills||0)),deaths:Math.max(0,+(saved.deaths||0)),headshots:Math.max(0,+(saved.headshots||0)),shotsFired:Math.max(0,+(saved.shotsFired||0)),shotsHit:Math.max(0,+(saved.shotsHit||0)),roundsWon:Math.max(0,+(saved.roundsWon||0))});}catch(_){}
function saveCareer(){try{localStorage.setItem('poly-career',JSON.stringify(career));}catch(_){}}
function recordCareer(won){career.matches++;if(won)career.wins++;career.kills+=match.kills||0;career.deaths+=match.deaths||0;career.headshots+=match.headshots||0;career.shotsFired+=match.shotsFired||0;career.shotsHit+=match.shotsHit||0;career.roundsWon+=match.score.player||0;saveCareer();}
function openCareer(){const acc=career.shotsFired?Math.min(100,Math.round(100*career.shotsHit/career.shotsFired)):0;const kdr=career.deaths?(career.kills/career.deaths).toFixed(2):career.kills.toFixed(2);
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
$('game').addEventListener('mousedown',e=>{if(!running)return;A.start();if(e.button===0){trigger=true;shoot();}if(e.button===2){if(weapon!=='knife'&&reload<=0&&bolt<=0){if(scopedOnly(weapon))scoped=!scoped;else ads=!ads;A.sound('scope');}if(fallback)drag=true;}});document.addEventListener('mouseup',e=>{if(e.button===0){trigger=false;burst=0;}if(e.button===2)drag=false;});document.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.code==='KeyM'){A.toggle();return;}if(e.code==='Escape'){e.preventDefault();pause();return;}if(!running)return;if(['Space','Tab','ControlLeft','ControlRight'].includes(e.code))e.preventDefault();held.add(e.code);if(['KeyW','KeyA','KeyS','KeyD','Space'].includes(e.code))cancelInspect();if(e.repeat)return;const i=['Digit1','Digit2','Digit3'].indexOf(e.code);if(i>=0)select([primary,'deagle','knife'][i]);if(e.code==='KeyG')dropPrimary();if(e.code==='KeyE')pickupPrimary();if(e.code==='KeyQ')select(previous);if(e.code==='KeyR')doReload();if(e.code==='KeyF'&&reload<=0&&!moving){inspectFade=0;inspectRest=null;inspect=PolyInspection.durations[weapon];if(weapon==='knife')inspectVariant=(inspectVariant+1)%2;ads=false;scoped=false;}if((e.code==='KeyC'||e.code==='ControlLeft')&&held.has('ShiftLeft')&&moving>.3&&slideCool<=0&&vy===0){slide=.75;slideCool=1.35;slideX=-Math.sin(yaw);slideZ=-Math.cos(yaw);ads=false;scoped=false;}if(e.code==='Tab')$('scoreboard').hidden=false;if(e.code==='Space'&&vy===0){vy=6;slide=0;}});
document.addEventListener('keyup',e=>{held.delete(e.code);if(e.code==='Tab')$('scoreboard').hidden=true;});$('game').addEventListener('wheel',e=>{if(running){e.preventDefault();const slots=inventory();select(slots[(slots.indexOf(weapon)+(e.deltaY>0?1:slots.length-1))%slots.length]);}},{passive:false});
function move(dt){
 const crouch=held.has('ControlLeft')||held.has('ControlRight')||held.has('KeyC');
 const sprint=held.has('ShiftLeft')&&!ads&&!scoped;
 const speed=slide>0?11*(.45+slide):crouch?3.3:sprint?9.5:weapon==='knife'?8:7.2;
 let f=(held.has('KeyW')?1:0)-(held.has('KeyS')?1:0),s=(held.has('KeyD')?1:0)-(held.has('KeyA')?1:0);
 moving=Math.min(1,Math.hypot(f,s));
 if(moving||slide>0){cancelInspect();
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
$('health').textContent=Math.ceil(match.hp);$('armor').textContent=Math.ceil(match.armor);$('weaponName').textContent=w.name;const rounds=weapon==='knife'?0:ammo[weapon].mag;$('ammo').textContent=weapon==='knife'?'∞':rounds;
 // Ammo colour gradient: clean white at full, amber through the middle, deep red at empty.
 const cap=Math.max(1,w.mag);const ratio=rounds/cap;$('ammo').style.color=weapon==='knife'?'':ratio<=.001?'#ff4a4a':ratio<=.34?'#ff7a5c':ratio<=.67?'#ffd354':'';
 $('reserve').textContent=weapon==='knife'?'':` / ${ammo[weapon].reserve}`;const time=match.training?0:Math.ceil(match.phase==='buy'?match.buyClock:match.roundClock);$('score').innerHTML=`${String(match.score.player).padStart(2,'0')} <span>ROUND ${String(match.round).padStart(2,'0')}<br>${Math.floor(time/60)}:${String(time%60).padStart(2,'0')}</span> ${String(match.score.enemy).padStart(2,'0')}`;$('objective').textContent=match.training?`TRAINING · ${match.aliveBots().length} TARGETS READY`:`${match.aliveBots().length} HOSTILES REMAIN · FIRST TO 5`;$('banner').innerHTML=match.phase==='buy'?`GET READY<small>PRIMARY / DEAGLE / KNIFE · ${Math.ceil(match.buyClock)}</small>`:match.phase==='end'?`${match.lastWinner==='player'?'CLUTCH · ROUND SECURED':'ROUND LOST'}<small>${match.lastWinner==='player'?'COMPOUND CLEAR':match.hp<=0?'OPERATOR DOWN':'TIME EXPIRED'} · ${match.kills} KILLS · ${accuracy()}% ACCURACY</small>`:'';$('status').textContent=weapon!=='knife'&&ammo[weapon].mag===0&&reload<=0?'RELOAD! · R':reload>0?`RELOADING ${reload.toFixed(1)}s`:slide>0?'SLIDING':inspect>0?`INSPECT ${inspectVariant+1}/2`:A.muted?'SOUND OFF':fallback?'DRAG RIGHT MOUSE TO LOOK':'';$('scope').hidden=!scoped;$('crosshair').hidden=scoped||ads;$('crosshair').style.setProperty('--gap',`${6+moving*6+recoil*10}px`);$('hitmarker').style.opacity=hit>0?1:0;$('damage').style.opacity=Math.max(0,hurt)*.7;$('fps').textContent=`${Math.round(fps)} FPS`;
 // Low-health vignette: a gradual pulsing red edge warning below 25 hp.
 const critical=match.hp>0&&match.hp<25;document.body.classList.toggle('low-health',critical);if(critical)$('damage').style.opacity=Math.max(Number($('damage').style.opacity)||0,Math.sin(elapsed*3.4)*.25+.4);$('feed').replaceChildren(...feed.map(t=>{const d=document.createElement('div');const skull=document.createElement('span');skull.className='skull'+(t.headshot?' headshot':'');skull.textContent='☠';skull.setAttribute('aria-label',t.headshot?'Headshot':'Elimination');d.append(skull,document.createTextNode(' '+t.text));return d;}));document.querySelectorAll('[data-slot]').forEach(el=>el.classList.toggle('active',el.dataset.slot===weapon));if(!$('scoreboard').hidden)renderScoreboard();
 $('primarySlot').dataset.slot=primary;$('primarySlot').querySelector('b').textContent=dropped?'DROPPED':C.WEAPONS[primary].name;$('primarySlot').classList.toggle('empty',dropped);
 $('killBanner').textContent=killTime>0?killText:'';$('pickupPrompt').textContent=dropped&&nearestDrop()?'E · PICK UP '+C.WEAPONS[nearestDrop().weapon].name:'';
 $('connectionStatus').textContent=onlineMode?(online.connected?'CONNECTED':'CONNECTING')+' · '+(Number.isFinite(online.ping)?Math.round(online.ping)+' ms':'PING —'):'OFFLINE';
 document.body.classList.toggle('low-health',running&&match.hp>0&&match.hp<20);
 const angle=damageSource?(Math.atan2(damageSource.x-x,-(damageSource.z-z))+yaw)*180/Math.PI:0;$('damageDirection').style.transform=`rotate(${angle}deg)`;$('damageDirection').dataset.angle=angle;$('damageDirection').style.opacity=hurt>0?Math.min(1,hurt*3):0;
 const rc=$('radar').getContext('2d');rc.clearRect(0,0,170,170);rc.fillStyle='#b5baa650';for(const s of C.MAP.solids)rc.fillRect(85+(s.x-s.w/2)*2,85+(s.z-s.d/2)*2,s.w*2,s.d*2);rc.fillStyle='#d9f577';rc.beginPath();rc.arc(85+x*2,85+z*2,3,0,Math.PI*2);rc.fill();rc.strokeStyle='#d9f577';rc.beginPath();rc.moveTo(85+x*2,85+z*2);rc.lineTo(85+x*2-Math.sin(yaw)*10,85+z*2-Math.cos(yaw)*10);rc.stroke();rc.fillStyle='#ff735e';for(const b of match.bots)if(b.alive){rc.beginPath();rc.arc(85+b.pos.x*2,85+b.pos.z*2,2.5,0,7);rc.fill();}}
function animateWeapon(dt){
 for(const k of keys)models[k].visible=k===weapon&&!scoped;
 const m=models[weapon],u=m.userData;adsBlend+=(Number(ads)-adsBlend)*Math.min(1,dt*18);
 m.position.set(.32*(1-adsBlend)+Math.sin(walk*1.7)*.006*moving*(1-adsBlend),-.3*(1-adsBlend)-.09*adsBlend-equip*.5,-.65+recoil*.06);
 m.rotation.set(recoil*.09,0,0);
 if(reload>0){const w=C.WEAPONS[weapon],progress=1-reload/w.reloadTime;
  // Three-stage tactical swap: drop the old mag (0-.25), hold open (.25-.55),
  // seat the fresh mag (.55-1). The old mag is thrown as a world effect once.
  if(progress>=.25&&reloadStage<1){reloadStage=1;dropMag();A.sound('magin');}
  if(progress>=.55&&reloadStage<2)reloadStage=2;
  const mOut=progress<.25?progress/.25:progress<.55?1:Math.max(0,1-(progress-.55)/.2);
  m.rotation.z=-Math.sin(progress*Math.PI)*.55;m.rotation.x=-Math.sin(progress*Math.PI)*.2;
  if(u.mag){u.mag.position.copy(u.mag.userData.basePos);u.mag.position.y-=mOut*.3;}}
 else if(u.mag)u.mag.position.copy(u.mag.userData.basePos);
 if(u.bolt){const duration=C.WEAPONS[weapon].boltTime||C.WEAPONS[weapon].fireInterval;const t=bolt>0?1-bolt/duration:0;u.bolt.position.z=u.bolt.userData.basePos.z+Math.sin(Math.PI*t)*.11;u.bolt.rotation.z=u.bolt.userData.baseRot.z-Math.sin(Math.PI*t)*.55;}
 // Hands are siblings of the weapon, never carried through an airborne spin.
 for(const k of keys){const h=handRoots[k];h.visible=models[k].visible;h.position.copy(models[k].position);h.rotation.copy(models[k].rotation);}
 let ip=PolyInspection.pose(weapon,inspect>0?1-inspect/PolyInspection.durations[weapon]:0,inspectVariant);if(inspect<=0&&inspectFade>0&&inspectRest){const f=inspectFade/.1;ip=Object.fromEntries(Object.entries(inspectRest).map(([k,v])=>[k,v*f]));}lastInspectPose={...ip};inspectFade=Math.max(0,inspectFade-dt);if(u.mag){u.mag.position.x=u.mag.userData.basePos.x+(ip.magX||0);u.mag.position.y=u.mag.userData.basePos.y+(ip.magY||0);u.mag.position.z=u.mag.userData.basePos.z+(ip.magZ||0);u.mag.rotation.copy(u.mag.userData.baseRot);u.mag.rotation.z+=ip.magR||0;}
 m.position.add(new T.Vector3(ip.dx,ip.dy,ip.dz));m.rotation.x+=ip.rx;m.rotation.y+=ip.ry;m.rotation.z+=ip.rz;
 if(weapon==='knife'){
  if(u.handleA)u.handleA.rotation.x=u.handleA.userData.baseRot.x+ip.handleA;
  if(u.handleB)u.handleB.rotation.x=u.handleB.userData.baseRot.x+ip.handleB;
  if(u.blade)u.blade.rotation.z=u.blade.userData.baseRot.z+ip.blade;
  m.rotation.z+=recoil*1.2;
 }
 flash.visible=flashTime>0&&!scoped&&budget.effects;
 if(flash.visible&&u.muzzle){m.updateMatrixWorld(true);u.muzzle.getWorldPosition(flash.position);flash.scale.setScalar(.8+rng()*.5);}
}
function tick(now){requestAnimationFrame(tick);const rawDt=Math.max(.001,(now-last)/1000),dt=Math.min(.04,rawDt);last=now;frames++;elapsed+=dt;fps+=(1/rawDt-fps)*.03;
 if(onlineMode)online.step(dt,pose());
 if(running){const oldPhase=match.phase,oldRound=match.round,oldHp=match.hp;if(match.phase==='buy'||match.phase==='live')move(dt);if(!onlineMode){const sense={px:x,pz:z,bots:match.bots.map(b=>({los:C.segmentClear({x,z},b.pos,C.MAP.solids),dist:Math.hypot(x-b.pos.x,z-b.pos.z)}))};match.step(dt,rng,sense);}if(match.round!==oldRound)spawn();if(match.hp<oldHp){const b=match.bots[match.lastAttacker];if(b)damageFrom(b.pos.x,b.pos.z);if(b)tracer(new T.Vector3(b.pos.x,1.3,b.pos.z),new T.Vector3(x,y,z),0xff735e);}if(oldPhase!=='matchover'&&match.phase==='matchover')finishMatch(match.matchWinner==='player');if(match.training){syncBots();}else if(match.phase==='end'&&roundNotice!==match.round){roundNotice=match.round;if(match.lastWinner==='player')A.announce?.('clutch');}
 killTime=Math.max(0,killTime-dt);heartbeat-=dt;if(match.hp>0&&match.hp<20&&heartbeat<=0){A.sound('heartbeat');heartbeat=.85;}if(bolt>0){bolt=Math.max(0,bolt-dt);if(!boltSound&&bolt<(C.WEAPONS[weapon].boltTime||C.WEAPONS[weapon].fireInterval)*.7){A.sound('bolt');boltSound=true;}}cool=Math.max(0,cool-dt);slideCool=Math.max(0,slideCool-dt);equip=Math.max(0,equip-dt);inspect=Math.max(0,inspect-dt);recoil=Math.max(0,recoil-dt*6);hit=Math.max(0,hit-dt);hurt=Math.max(0,hurt-dt*2);flashTime=Math.max(0,flashTime-dt);if(reload>0&&!onlineMode){reload-=dt;if(reload<=0&&reloadKey){const a=ammo[reloadKey],n=Math.min(C.WEAPONS[reloadKey].mag-a.mag,a.reserve);a.mag+=n;a.reserve-=n;reloadKey=null;A.sound('reload');}}if(trigger&&C.WEAPONS[weapon].auto)shoot();cam.position.set(x,y,z);cam.rotation.set(pitch+(budget.effects?Math.sin(elapsed*91)*recoil*.0018:0),yaw+(budget.effects?Math.sin(elapsed*73)*recoil*.001:0),0);cam.fov+=( (scoped?(C.WEAPONS[weapon].zoomFov||20):ads?52:slide>0?84:78)-cam.fov)*Math.min(1,dt*18);cam.updateProjectionMatrix();}
 if(!started){cam.position.set(27+Math.sin(elapsed*.08)*5,17,30);cam.lookAt(0,0,-3);}
 syncBots();syncDrops();animateWeapon(dt);for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;if(e.v){e.o.position.addScaledVector(e.v,dt);if(e.spin){e.v.y-=4*dt;e.o.rotation.x+=dt*8;}if(e.smoke){e.o.scale.multiplyScalar(1+dt*2);e.o.material.opacity=Math.max(0,e.life*.6);}}if(e.decal){e.o.material.opacity=Math.max(0,e.life/6*.9);}if(e.life<=0){const o=e.o;scene.remove(o);if(decalPool.includes(o))o.visible=false;else o.traverse(n=>{n.geometry?.dispose();if(n.material)for(const m of [n.material].flat())m.dispose();});effects.splice(i,1);}}
 renderer.info.reset();renderer.clear();renderer.render(scene,cam);if(started){renderer.clearDepth();renderer.render(viewScene,viewCam);}
 // Loadout hub: render the preview weapon into a scissor region of the panel.
 if(!$('loadoutPanel').hidden){tickLoadoutPreview(dt);const cv=$('loadoutCanvas');const r=cv.getBoundingClientRect();if(r.width>4&&r.height>4){const dpr=PolySettings.resolution(innerWidth,innerHeight,devicePixelRatio,preset).dpr||1;renderer.setScissorTest(true);renderer.setViewport(0,0,r.width,r.height);renderer.setScissor(0,0,r.width,r.height);loadoutCam.aspect=r.width/r.height;loadoutCam.updateProjectionMatrix();renderer.render(loadoutScene,loadoutCam);renderer.setScissorTest(false);}}
 hudClock-=dt;if(hudClock<=0&&started){hud();hudClock=1/budget.hudHz;}}
function resize(){const res=PolySettings.resolution(innerWidth,innerHeight,devicePixelRatio,preset);renderer.setSize(res.width,res.height,false);cam.aspect=viewCam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();viewCam.updateProjectionMatrix();}window.addEventListener('resize',resize);document.body.classList.toggle('performance',preset==='performance');resize();refill();requestAnimationFrame(tick);
window.Game=Object.freeze({state:()=>({running,online:onlineMode,role:onlineMode?(online.hostRole?'host':'guest'):null,room:online.code,locked,fallback,frames,x,z,y,yaw,pitch,weapon,primary,dropped,inventory:inventory(),drops:onlineMode?(online.state?.drops||[]):localDrops,scoped,ads,slide,inspectVariant,preset,map:mapId,pixels:renderer.domElement.width*renderer.domElement.height,reload,inspect,ammo:JSON.parse(JSON.stringify(ammo)),inspectFade,bolt,effects:effects.length,accuracy:accuracy(),phase:match.phase,hp:match.hp,score:{...match.score},kills:match.kills,alive:match.aliveBots().length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,audio:A.ready}),...(new URLSearchParams(location.search).has('test')?{test:{empty:()=>{ammo[weapon].mag=0;},lowHealth:()=>{match.hp=19;},kill:addKill,damageFrom,online:online.test,place:(px,pz)=>{x=px;z=pz;},aim:(id)=>{const b=match.bots[id];yaw=Math.atan2(x-b.pos.x,z-b.pos.z);pitch=Math.atan2(1.5-y,Math.hypot(x-b.pos.x,z-b.pos.z));},fixture:(mode,targetHp=100)=>{match.phase='live';match.roundClock=90;if(mode==='target'){x=0;z=20;y=1.7;yaw=0;pitch=0;match.bots.forEach((b,i)=>{b.alive=i===0;b.pos={x:i===0?0:30,z:i===0?14:-30};b.hp=targetHp;b.speed=0;b.cool=999;});syncBots();}if(mode==='loss')match.enemyShot(999);if(mode==='win'){match.bots.forEach(b=>{b.alive=false;});match.endRound('player');}if(mode==='match'){match.score.player=4;match.endRound('player');}}}}:{})});
if('serviceWorker'in navigator&&/^https?:$/.test(location.protocol))navigator.serviceWorker.register('./sw.js').catch(()=>{});
} catch(e){$('error').hidden=false;$('errorText').textContent=e.message;console.error(e);}
})();
