/* POLY-STRIKE — controller, raycasts, viewmodels and HUD. */
(() => { 'use strict';
const $=id=>document.getElementById(id), T=window.THREE, A=window.PolyAudio;
let C=window.POLY_CORE, mapId='desert', preset='medium';
try{preset=PolySettings.normalize(localStorage.getItem('poly-graphics'));}catch(_){}
let budget=PolySettings.PRESETS[preset];
try {
const renderer=new T.WebGLRenderer({canvas:$('game'),antialias:false,powerPreference:'high-performance'});
renderer.setPixelRatio(1);renderer.info.autoReset=false; renderer.outputEncoding=T.sRGBEncoding; renderer.autoClear=false;
const scene=new T.Scene();scene.background=new T.Color(0xa9c6ca);scene.fog=new T.Fog(0xa9c6ca,35,110);
scene.add(new T.HemisphereLight(0xe5f4ff,0x756042,1.25));const sun=new T.DirectionalLight(0xffeccb,1.7);sun.position.set(-20,40,15);scene.add(sun);
const cam=new T.PerspectiveCamera(75,1,.06,180);cam.rotation.order='YXZ';
const viewScene=new T.Scene(),viewCam=new T.PerspectiveCamera(65,1,.02,10);viewScene.add(new T.HemisphereLight(0xffffff,0x697681,1.6));const vl=new T.DirectionalLight(0xffe5cf,1.7);vl.position.set(-2,3,4);viewScene.add(vl);
let arena=PolyVisual.buildArena(T,scene,C,preset);const worldNodes=scene.children.filter(o=>!o.isLight);const bots=C.MAP.spawnBots.map((_,i)=>{const b=PolyVisual.buildBot(T,i);scene.add(b);return b;});
const keys=Object.keys(C.WEAPONS),models={};for(const key of keys){models[key]=PolyVisual.buildWeapon(T,key);viewScene.add(models[key]);models[key].visible=false;models[key].traverse(o=>{o.userData.basePos=o.position.clone();o.userData.baseRot=o.rotation.clone();});}
const flash=new T.Mesh(new T.ConeGeometry(.045,.22,5),new T.MeshBasicMaterial({color:0xffdc85}));flash.rotation.x=-Math.PI/2;viewScene.add(flash);flash.visible=false;
const ray=new T.Raycaster(), dir=new T.Vector3(), origin=new T.Vector3();const held=new Set();
let match=C.createMatch(),rng=C.mulberry32(4451),running=false,started=false,locked=false,drag=false,fallback=false;
let ads=false,adsBlend=0,slide=0,slideCool=0,slideX=0,slideZ=0,inspectVariant=1;
let weapon='ak47',previous='knife',ammo={},reload=0,reloadKey=null,cool=0,equip=.3,inspect=0,scoped=false,trigger=false,burst=0,recoil=0,hit=0,hurt=0,flashTime=0;
let x=0,z=34,y=1.7,vy=0,yaw=0,pitch=0,walk=0,moving=0,frames=0,elapsed=0,last=performance.now(),fps=60,hudClock=0,stepClock=0;
const spray=C.buildSprayPattern(4815,30),effects=[];let feed=[];
let onlineMode=false,netRound=0,lastNetEvent='',netHp=100;
function pose(){return {x,y,z,yaw,pitch,weapon};}
const online=PolyOnline.create(C,{
 status:s=>{$('netStatus').textContent=s;if(online.code)$('roomCode').textContent=online.code;},
 close:s=>{if(onlineMode){onlineMode=false;leave();$('onlinePanel').hidden=false;}$('netStatus').textContent=s;$('roomCode').textContent='';},
 ready:info=>{
  loadMap(info.mapId);$('mapSelect').value=info.mapId;match=C.createMatch();onlineMode=true;netRound=0;lastNetEvent='';netHp=100;spawn();weapon='ak47';
  if(info.id===1){const s=C.MAP.spawnOpponent||C.MAP.spawnBots[0];x=s.x;z=s.z;yaw=Math.PI;}
  started=true;running=false;clearInput();$('menu').hidden=true;$('onlinePanel').hidden=true;$('hud').hidden=false;$('pause').hidden=false;$('pauseTitle').textContent='OPPONENT CONNECTED';$('pauseText').textContent='Click resume to enter. Online rounds continue while menus are open.';$('resume').hidden=false;feed=[];
 },
 snapshot:({state:s,id})=>{
  const p=s.players[id],q=s.players[1-id];
  if(s.round!==netRound){netRound=s.round;spawn();x=p.x;y=p.y;z=p.z;yaw=p.yaw;pitch=p.pitch;}
  if(Math.hypot(x-p.x,z-p.z)>2){x=p.x;z=p.z;y=p.y;}
  if(p.hp<netHp){hurt=.65;A.sound('enemy');}netHp=p.hp;
  match.phase=s.phase;match.round=s.round;match.buyClock=s.buyClock;match.roundClock=s.roundClock;match.hp=p.hp;match.armor=0;match.score={player:s.score[id],enemy:s.score[1-id]};match.kills=p.kills;match.lastWinner=s.lastWinner===null?null:s.lastWinner===id?'player':'enemy';
  for(const k of keys)ammo[k]={...p.ammo[k]};reload=p.reload;reloadKey=p.reloadKey;
  match.bots.forEach((b,i)=>{b.alive=i===0&&q.alive;b.pos={x:q.x,z:q.z};b.hp=q.hp;});
  const e=s.events[s.events.length-1];if(e){const tag=e.player+':'+e.seq;if(tag!==lastNetEvent){lastNetEvent=tag;if(e.player===id){hit=.18;A.sound(e.killed?'kill':'hit');match.shotsHit++;if(e.killed)feed=[C.WEAPONS[e.weapon].name+' → OPPONENT'];}}}
  if(s.phase==='matchover')finishMatch(s.matchWinner===id);
 }
});
function finishMatch(won){running=false;clearInput();$('pauseTitle').textContent=won?'VICTORY':'DEFEAT';$('pauseText').textContent=`Final score ${match.score.player} : ${match.score.enemy}. ${match.kills} eliminations.`;$('resume').hidden=true;$('pause').hidden=false;if(document.pointerLockElement)document.exitPointerLock();}
function refill(){for(const k of keys)ammo[k]={mag:C.WEAPONS[k].mag,reserve:C.WEAPONS[k].reserve};reload=0;reloadKey=null;cool=0;scoped=false;ads=false;match.armor=100;}
function spawn(){ads=false;slide=0;slideCool=0;equip=.2;burst=0;inspect=0;x=C.MAP.spawnPlayer.x;z=C.MAP.spawnPlayer.z;y=1.7;vy=0;yaw=0;pitch=0;refill();}
function clearInput(){held.clear();trigger=false;drag=false;$('scoreboard').hidden=true;}
function lock(){fallback=$('fallback').checked;if(fallback)return;try{const p=$('game').requestPointerLock();if(p&&p.catch)p.catch(()=>{fallback=true;});}catch(_){fallback=true;}}
function deploy(fresh=true){if(fresh){if(onlineMode){onlineMode=false;online.close();}loadMap($('mapSelect').value);match=C.createMatch();rng=C.mulberry32(4451);spawn();feed=[];weapon='ak47';}started=true;running=true;clearInput();$('menu').hidden=true;$('pause').hidden=true;$('hud').hidden=false;A.start();lock();}
function pause(){if(!started||!running)return;running=false;clearInput();$('pauseTitle').textContent='PAUSED';$('pauseText').textContent=onlineMode?'Online match continues. Click resume to return.':'Your offline match is frozen. Click resume to return.';$('resume').hidden=false;$('pause').hidden=false;if(document.pointerLockElement)document.exitPointerLock();}
function select(k){if(k===weapon||(onlineMode&&reload>0))return;previous=weapon;weapon=k;reload=0;reloadKey=null;scoped=false;ads=false;burst=0;inspect=0;equip=.2;cool=.15;A.sound('equip');}
function doReload(){const w=C.WEAPONS[weapon];if(weapon==='knife'||reload>0||ammo[weapon].mag===w.mag||ammo[weapon].reserve===0)return;if(onlineMode)online.reload(weapon);reload=w.reloadTime;reloadKey=weapon;scoped=false;ads=false;inspect=0;A.sound('reload');}
function tracer(a,b,color){if(!budget.effects)return;const g=new T.BufferGeometry().setFromPoints([a,b]);const m=new T.LineBasicMaterial({color,transparent:true,opacity:.7});const o=new T.Line(g,m);scene.add(o);effects.push({o,life:.07});}
function syncBots(){match.bots.forEach((b,i)=>{const o=bots[i];o.visible=b.alive;o.position.set(b.pos.x,0,b.pos.z);o.rotation.y=Math.atan2(x-b.pos.x,z-b.pos.z);const legs=Array.isArray(o.userData.legs)?o.userData.legs:o.userData.legs?[o.userData.legs]:[];legs.forEach((l,j)=>{l.rotation.x=Math.sin(elapsed*8+i+j*Math.PI)*.28;});});}
function shoot(){const w=C.WEAPONS[weapon];if(!running||match.phase!=='live'||cool>0||reload>0||equip>0)return;if(weapon!=='knife'&&ammo[weapon].mag<=0){doReload();return;}
 cool=w.fireInterval;inspect=0;match.shotsFired++;if(weapon!=='knife')ammo[weapon].mag--;A.sound(weapon);flashTime=weapon==='knife'?0:.045;recoil=weapon==='knife'?.8:1;
 cam.position.set(x,y,z);cam.rotation.set(pitch,yaw,0);cam.updateMatrixWorld(true);syncBots();for(const b of bots)b.updateMatrixWorld(true);origin.copy(cam.position);cam.getWorldDirection(dir);const sp=C.pickSpread(weapon,moving,held.has('ControlLeft')||held.has('KeyC'),vy!==0,scoped||ads,rng);dir.applyAxisAngle(new T.Vector3(0,1,0),sp.yaw);const right=new T.Vector3().crossVectors(dir,cam.up).normalize();dir.applyAxisAngle(right,sp.pitch).normalize();ray.set(origin,dir);ray.far=weapon==='knife'?2.65:150;
 if(onlineMode)online.shoot(weapon,origin,dir,pose());
 const hits=ray.intersectObjects([...arena.hitMeshes,...bots.filter((b,i)=>b.visible&&match.bots[i].alive)],true);let end=origin.clone().addScaledVector(dir,80);if(hits.length){const h=hits[0];end=h.point;const id=h.object.userData.botId;if(id!==undefined&&!onlineMode){const result=match.playerShot(weapon,id,h.object.userData.part||'body',h.distance);if(result.dmg>0){match.shotsHit++;hit=.18;A.sound(result.killed?'kill':'hit');if(result.killed){feed.unshift(`${h.object.userData.part==='head'?'HEADSHOT · ':''}${w.name}  →  ${match.bots[id].name}`);feed=feed.slice(0,4);}}}}
 if(weapon!=='knife')tracer(origin.clone().addScaledVector(right,.25).add(new T.Vector3(0,-.2,0)),end,0xffdf91);
 if(weapon==='ak47'){const p=spray[burst%30];pitch=Math.min(1.45,pitch+p.up*.009);yaw+=p.side*.007;burst++;}else if(weapon!=='knife')pitch=Math.min(1.45,pitch+w.recoil*.013);
 if(weapon==='awp'){scoped=false;ads=false;}
}
function disposeWorld(){
 if(arena.dispose){arena.dispose();for(const o of worldNodes)scene.remove(o);worldNodes.length=0;return;}
 const geo=new Set(),mats=new Set(),textures=new Set();
 for(const o of worldNodes){o.traverse(n=>{if(n.geometry)geo.add(n.geometry);if(n.material)for(const m of (Array.isArray(n.material)?n.material:[n.material])){mats.add(m);if(m.map)textures.add(m.map);}});scene.remove(o);}
 geo.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());worldNodes.length=0;
}
function loadMap(id){
 mapId=['desert','industrial','urban'].includes(id)?id:'desert';C=POLY_CORE.forMap?POLY_CORE.forMap(mapId):POLY_CORE;
 disposeWorld();const before=new Set(scene.children);arena=PolyVisual.buildArena(T,scene,C,preset);
 worldNodes.push(...scene.children.filter(o=>!before.has(o)));for(const o of worldNodes){o.updateMatrixWorld(true);o.traverse(n=>{n.matrixAutoUpdate=false;});}
 document.querySelector('.brand small').textContent=C.MAP.name||mapId.toUpperCase();cam.far=budget.far;cam.updateProjectionMatrix();
}
function leave(){if(onlineMode){onlineMode=false;online.close();}running=false;started=false;clearInput();if(document.pointerLockElement)document.exitPointerLock();$('pause').hidden=true;$('hud').hidden=true;$('menu').hidden=false;$('start').focus();}
let settingsReturn=null;
function openSettings(){settingsReturn=document.activeElement;if(running)pause();$('settingsPanel').hidden=false;$('graphics').value=preset;$('performanceToggle').checked=preset==='performance';$('graphics').focus();}
$('settingsButton').onclick=openSettings;$('pauseSettings').onclick=openSettings;
$('performanceToggle').onchange=()=>{$('graphics').value=$('performanceToggle').checked?'performance':'medium';};
$('graphics').onchange=()=>{$('performanceToggle').checked=$('graphics').value==='performance';};
$('applySettings').onclick=()=>{preset=PolySettings.normalize($('graphics').value);budget=PolySettings.PRESETS[preset];try{localStorage.setItem('poly-graphics',preset);}catch(_){}document.body.classList.toggle('performance',preset==='performance');loadMap(mapId);resize();document.activeElement.blur();$('settingsPanel').hidden=true;if(settingsReturn)settingsReturn.focus();};
$('toMenu').onclick=leave;
$('onlineButton').onclick=()=>{$('onlinePanel').hidden=false;$('hostRoom').focus();};
$('hostRoom').onclick=()=>{A.start();online.host($('mapSelect').value);$('roomCode').textContent=online.code;};$('joinRoom').onclick=()=>{A.start();online.join($('roomInput').value);};
$('cancelOnline').onclick=()=>{online.close();$('roomCode').textContent='';$('onlinePanel').hidden=true;$('onlineButton').focus();};
$('start').onclick=()=>deploy();$('restart').onclick=()=>deploy();$('resume').onclick=()=>deploy(false);
document.addEventListener('pointerlockchange',()=>{locked=!!document.pointerLockElement;if(!locked&&running&&!fallback)pause();});document.addEventListener('pointerlockerror',()=>{fallback=true;});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});window.addEventListener('blur',pause);
document.addEventListener('mousemove',e=>{if(!running||(!locked&&!drag))return;const s=.002*Number($('sensitivity').value)*(scoped?.32:1);yaw-=e.movementX*s;pitch=Math.max(-1.45,Math.min(1.45,pitch-e.movementY*s));});
$('game').addEventListener('mousedown',e=>{if(!running)return;A.start();if(e.button===0){trigger=true;shoot();}if(e.button===2){if(weapon!=='knife'&&reload<=0){if(weapon==='awp')scoped=!scoped;else ads=!ads;A.sound('scope');}if(fallback)drag=true;}});document.addEventListener('mouseup',e=>{if(e.button===0){trigger=false;burst=0;}if(e.button===2)drag=false;});document.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('keydown',e=>{if(e.code==='KeyM'){A.toggle();return;}if(e.code==='Escape'){e.preventDefault();pause();return;}if(!running)return;if(['Space','Tab','ControlLeft','ControlRight'].includes(e.code))e.preventDefault();held.add(e.code);if(e.repeat)return;const i=['Digit1','Digit2','Digit3','Digit4'].indexOf(e.code);if(i>=0)select(keys[i]);if(e.code==='KeyQ')select(previous);if(e.code==='KeyR')doReload();if(e.code==='KeyF'&&reload<=0){inspect=weapon==='knife'?1.5:1.1;if(weapon==='knife')inspectVariant=(inspectVariant+1)%2;ads=false;scoped=false;}if((e.code==='KeyC'||e.code==='ControlLeft')&&held.has('ShiftLeft')&&moving>.3&&slideCool<=0&&vy===0){slide=.75;slideCool=1.35;slideX=-Math.sin(yaw);slideZ=-Math.cos(yaw);ads=false;scoped=false;}if(e.code==='Tab')$('scoreboard').hidden=false;if(e.code==='Space'&&vy===0){vy=6;slide=0;}});
document.addEventListener('keyup',e=>{held.delete(e.code);if(e.code==='Tab')$('scoreboard').hidden=true;});$('game').addEventListener('wheel',e=>{if(running){e.preventDefault();select(keys[(keys.indexOf(weapon)+(e.deltaY>0?1:3))%4]);}},{passive:false});
function move(dt){
 const crouch=held.has('ControlLeft')||held.has('ControlRight')||held.has('KeyC');
 const sprint=held.has('ShiftLeft')&&!ads&&!scoped;
 const speed=slide>0?11*(.45+slide):crouch?3.3:sprint?9.5:weapon==='knife'?8:7.2;
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
function hud(){const w=C.WEAPONS[weapon];$('health').textContent=Math.ceil(match.hp);$('armor').textContent=Math.ceil(match.armor);$('weaponName').textContent=w.name;$('ammo').textContent=weapon==='knife'?'∞':ammo[weapon].mag;$('reserve').textContent=weapon==='knife'?'':` / ${ammo[weapon].reserve}`;const time=Math.ceil(match.phase==='buy'?match.buyClock:match.roundClock);$('score').innerHTML=`${String(match.score.player).padStart(2,'0')} <span>ROUND ${String(match.round).padStart(2,'0')}<br>${Math.floor(time/60)}:${String(time%60).padStart(2,'0')}</span> ${String(match.score.enemy).padStart(2,'0')}`;$('objective').textContent=`${match.aliveBots().length} HOSTILES REMAIN · FIRST TO 5`;$('banner').innerHTML=match.phase==='buy'?`GET READY<small>ALL WEAPONS EQUIPPED · ${Math.ceil(match.buyClock)}</small>`:match.phase==='end'?`${match.lastWinner==='player'?'ROUND SECURED':'ROUND LOST'}<small>${match.lastWinner==='player'?'COMPOUND CLEAR':match.hp<=0?'OPERATOR DOWN':'TIME EXPIRED'}</small>`:'';$('status').textContent=reload>0?`RELOADING ${reload.toFixed(1)}s`:slide>0?'SLIDING':inspect>0?`INSPECT ${inspectVariant+1}/2`:A.muted?'SOUND OFF':fallback?'DRAG RIGHT MOUSE TO LOOK':'';$('scope').hidden=!scoped;$('crosshair').hidden=scoped||ads;$('crosshair').style.setProperty('--gap',`${6+moving*6+recoil*10}px`);$('hitmarker').style.opacity=hit>0?1:0;$('damage').style.opacity=Math.max(0,hurt)*.7;$('fps').textContent=`${Math.round(fps)} FPS`;$('feed').replaceChildren(...feed.map(t=>{const d=document.createElement('div');d.textContent=t;return d;}));document.querySelectorAll('[data-slot]').forEach(el=>el.classList.toggle('active',el.dataset.slot===weapon));$('scoreboard').innerHTML=`OPERATION ${mapId.toUpperCase()}<br><br>YOU ${match.score.player} : ${match.score.enemy} HOSTILES<br>KILLS ${match.kills} · HEADSHOTS ${match.headshots}<br>ACCURACY ${match.shotsFired?Math.round(match.shotsHit/match.shotsFired*100):0}%<br><small>First to five rounds · Hold TAB</small>`;
 const rc=$('radar').getContext('2d');rc.clearRect(0,0,170,170);rc.fillStyle='#b5baa650';for(const s of C.MAP.solids)rc.fillRect(85+(s.x-s.w/2)*2,85+(s.z-s.d/2)*2,s.w*2,s.d*2);rc.fillStyle='#d9f577';rc.beginPath();rc.arc(85+x*2,85+z*2,3,0,Math.PI*2);rc.fill();rc.strokeStyle='#d9f577';rc.beginPath();rc.moveTo(85+x*2,85+z*2);rc.lineTo(85+x*2-Math.sin(yaw)*10,85+z*2-Math.cos(yaw)*10);rc.stroke();rc.fillStyle='#ff735e';for(const b of match.bots)if(b.alive&&C.segmentClear({x,z},b.pos,C.MAP.solids)){rc.beginPath();rc.arc(85+b.pos.x*2,85+b.pos.z*2,2.5,0,7);rc.fill();}}
function animateWeapon(dt){
 for(const k of keys)models[k].visible=k===weapon&&!scoped;
 const m=models[weapon],u=m.userData;adsBlend+=(Number(ads)-adsBlend)*Math.min(1,dt*18);
 m.position.set(.32*(1-adsBlend)+Math.sin(walk*1.7)*.006*moving*(1-adsBlend),-.3*(1-adsBlend)-.09*adsBlend-equip*.5,-.65+recoil*.06);
 m.rotation.set(recoil*.09,0,0);
 if(reload>0){const progress=1-reload/C.WEAPONS[weapon].reloadTime;m.rotation.z=-Math.sin(progress*Math.PI)*.55;m.rotation.x=-Math.sin(progress*Math.PI)*.2;if(u.mag)u.mag.position.y=u.mag.userData.basePos.y-Math.sin(progress*Math.PI)*.3;}
 else if(u.mag)u.mag.position.copy(u.mag.userData.basePos);
 if(u.bolt)u.bolt.position.z=u.bolt.userData.basePos.z+recoil*.05;
 if(inspect>0&&weapon!=='knife'){m.rotation.z=Math.sin(inspect*4)*.25;m.rotation.y=Math.sin(inspect*2)*.5;m.position.x=.15;}
 if(weapon==='knife'){
  const t=inspect>0?Math.min(1,1-inspect/1.5):0,ease=t*t*(3-2*t),wave=Math.sin(t*Math.PI);
  // Exactly two repeatable inspect variants; both end at the resting pose.
  const angle=inspect>0?ease*Math.PI*2:0;
  if(u.handleA)u.handleA.rotation.x=u.handleA.userData.baseRot.x+(inspectVariant===0?angle:-angle);
  if(u.handleB)u.handleB.rotation.x=u.handleB.userData.baseRot.x+(inspectVariant===0?-angle:angle*2);
  if(u.blade)u.blade.rotation.z=u.blade.userData.baseRot.z+(inspectVariant===0?wave*.45:wave*-.65);
  m.rotation.z+=recoil*1.2+(inspectVariant===1?wave*Math.PI*2:wave*.2);m.position.x-=wave*.08;
 }
 flash.visible=flashTime>0&&!scoped&&budget.effects;
 if(flash.visible&&u.muzzle){m.updateMatrixWorld(true);u.muzzle.getWorldPosition(flash.position);flash.scale.setScalar(.8+rng()*.5);}
}
function tick(now){requestAnimationFrame(tick);const rawDt=Math.max(.001,(now-last)/1000),dt=Math.min(.04,rawDt);last=now;frames++;elapsed+=dt;fps+=(1/rawDt-fps)*.03;
 if(onlineMode)online.step(dt,running?pose():null);
 if(running){const oldPhase=match.phase,oldRound=match.round,oldHp=match.hp;if(match.phase==='buy'||match.phase==='live')move(dt);if(!onlineMode){const sense={px:x,pz:z,bots:match.bots.map(b=>({los:C.segmentClear({x,z},b.pos,C.MAP.solids),dist:Math.hypot(x-b.pos.x,z-b.pos.z)}))};match.step(dt,rng,sense);}if(match.round!==oldRound)spawn();if(match.hp<oldHp){hurt=.65;A.sound('enemy');const b=match.bots.find(b=>b.alive&&C.segmentClear({x,z},b.pos,C.MAP.solids));if(b)tracer(new T.Vector3(b.pos.x,1.3,b.pos.z),new T.Vector3(x,y,z),0xff735e);}if(oldPhase!=='matchover'&&match.phase==='matchover'){running=false;clearInput();$('pauseTitle').textContent=match.matchWinner==='player'?'VICTORY':'DEFEAT';$('pauseText').textContent=`Final score ${match.score.player} : ${match.score.enemy}. ${match.kills} eliminations.`;$('resume').hidden=true;$('pause').hidden=false;if(document.pointerLockElement)document.exitPointerLock();}
 cool=Math.max(0,cool-dt);slideCool=Math.max(0,slideCool-dt);equip=Math.max(0,equip-dt);inspect=Math.max(0,inspect-dt);recoil=Math.max(0,recoil-dt*6);hit=Math.max(0,hit-dt);hurt=Math.max(0,hurt-dt*2);flashTime=Math.max(0,flashTime-dt);if(reload>0&&!onlineMode){reload-=dt;if(reload<=0&&reloadKey){const a=ammo[reloadKey],n=Math.min(C.WEAPONS[reloadKey].mag-a.mag,a.reserve);a.mag+=n;a.reserve-=n;reloadKey=null;A.sound('reload');}}if(trigger&&C.WEAPONS[weapon].auto)shoot();cam.position.set(x,y,z);cam.rotation.set(pitch,yaw,0);cam.fov+=( (scoped?20:ads?52:slide>0?84:78)-cam.fov)*Math.min(1,dt*18);cam.updateProjectionMatrix();}
 if(!started){cam.position.set(27+Math.sin(elapsed*.08)*5,17,30);cam.lookAt(0,0,-3);}
 syncBots();animateWeapon(dt);for(let i=effects.length-1;i>=0;i--){effects[i].life-=dt;if(effects[i].life<=0){const o=effects[i].o;scene.remove(o);o.geometry.dispose();o.material.dispose();effects.splice(i,1);}}
 renderer.info.reset();renderer.clear();renderer.render(scene,cam);if(started){renderer.clearDepth();renderer.render(viewScene,viewCam);}hudClock-=dt;if(hudClock<=0&&started){hud();hudClock=1/budget.hudHz;}}
function resize(){const res=PolySettings.resolution(innerWidth,innerHeight,devicePixelRatio,preset);renderer.setSize(res.width,res.height,false);cam.aspect=viewCam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();viewCam.updateProjectionMatrix();}window.addEventListener('resize',resize);document.body.classList.toggle('performance',preset==='performance');resize();refill();requestAnimationFrame(tick);
window.Game=Object.freeze({state:()=>({running,online:onlineMode,role:onlineMode?(online.hostRole?'host':'guest'):null,room:online.code,locked,fallback,frames,x,z,y,yaw,pitch,weapon,scoped,ads,slide,inspectVariant,preset,map:mapId,pixels:renderer.domElement.width*renderer.domElement.height,reload,inspect,ammo:JSON.parse(JSON.stringify(ammo)),phase:match.phase,hp:match.hp,score:{...match.score},kills:match.kills,alive:match.aliveBots().length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,audio:A.ready}),...(new URLSearchParams(location.search).has('test')?{test:{online:online.test,place:(px,pz)=>{x=px;z=pz;},aim:(id)=>{const b=match.bots[id];yaw=Math.atan2(x-b.pos.x,z-b.pos.z);pitch=Math.atan2(1.5-y,Math.hypot(x-b.pos.x,z-b.pos.z));},fixture:(mode,targetHp=100)=>{match.phase='live';match.roundClock=90;if(mode==='target'){x=0;z=20;y=1.7;yaw=0;pitch=0;match.bots.forEach((b,i)=>{b.alive=i===0;b.pos={x:i===0?0:30,z:i===0?14:-30};b.hp=targetHp;b.speed=0;b.cool=999;});syncBots();}if(mode==='loss')match.enemyShot(999);if(mode==='win'){match.bots.forEach(b=>{b.alive=false;});match.endRound('player');}if(mode==='match'){match.score.player=4;match.endRound('player');}}}}:{})});
if('serviceWorker'in navigator&&/^https?:$/.test(location.protocol))navigator.serviceWorker.register('./sw.js').catch(()=>{});
} catch(e){$('error').hidden=false;$('errorText').textContent=e.message;console.error(e);}
})();
