/* UI/network adapter. The host owns health, ammunition and round results. */
window.PolyOnline = {
 create(C,callbacks){
  let duel=null,localId=0,current=null,active=false,clock=0,seq=0,net;
  const emit=(name,data)=>{if(callbacks[name])callbacks[name](data);};
  function adopt(s){
   if(!s||!['buy','live','end','matchover'].includes(s.phase)||!Array.isArray(s.players)||s.players.length!==2||!Array.isArray(s.score)||s.score.length!==2)return;
   if(!['round','buyClock','roundClock','endClock','time'].every(k=>Number.isFinite(s[k]))||!s.score.every(n=>Number.isInteger(n)&&n>=0&&n<=5)||!Array.isArray(s.events)||s.events.length>12||!s.events.every(e=>e&&[0,1].includes(e.player)&&Number.isSafeInteger(e.seq)&&Object.hasOwn(C.WEAPONS,e.weapon)))return;
   if(!s.players.every(p=>p&&['x','y','z','yaw','pitch','hp'].every(k=>Number.isFinite(p[k]))&&p.ammo&&Object.keys(C.WEAPONS).every(k=>p.ammo[k]&&Number.isFinite(p.ammo[k].mag)&&Number.isFinite(p.ammo[k].reserve))))return;
   current=s;emit('snapshot',{state:s,id:localId});
  }
  net=PolyNet.create({
   onStatus:s=>emit('status',s),
   onClose:s=>{active=false;duel=null;current=null;emit('close',s);},
   onReady:info=>{
    if(!Object.hasOwn(POLY_CORE.MAPS,info.mapId)){net.close('Map/version mismatch. Reload both browsers.');return;}
    C=POLY_CORE.forMap(info.mapId);localId=info.role==='host'?0:1;active=true;clock=0;seq=0;
    if(localId===0)duel=PolyDuel.create(C.MAP,C);
    emit('ready',{...info,id:localId});
    if(duel){adopt(duel.snapshot());net.send({type:'snapshot',state:current});}
   },
   onData:p=>{
    if(!active)return;
    if(duel){
     if(p.type==='input')duel.move(1,p.state);
     if(p.type==='reload')duel.reload(1,p.weapon);
     if(p.type==='shot'){duel.move(1,p.pose);duel.shoot(1,p.shot);}
    }else if(p.type==='snapshot')adopt(p.state);
   }
  });
  return {
   host:id=>net.host(id),join:code=>net.join(code),close:()=>net.close(),
   get active(){return active;},get hostRole(){return localId===0;},get code(){return net.code;},get state(){return current;},get localId(){return localId;},
   step(dt,pose){
    if(!active)return;clock+=dt;
    if(duel){duel.step(dt);if(pose)duel.move(0,pose);}
    if(clock>=.05){clock%=.05;if(duel){adopt(duel.snapshot());net.send({type:'snapshot',state:current});}else if(pose)net.send({type:'input',state:pose});}
   },
   shoot(weapon,origin,dir,pose){
    if(!active)return;const shot={weapon,origin:{x:origin.x,y:origin.y,z:origin.z},dir:{x:dir.x,y:dir.y,z:dir.z},seq:seq++};
    if(duel){duel.move(0,pose);duel.shoot(0,shot);adopt(duel.snapshot());}
    else net.send({type:'shot',shot,pose});
   },
   reload(weapon){if(!active)return;if(duel)duel.reload(0,weapon);else net.send({type:'reload',weapon});},
   ...(new URLSearchParams(location.search).has('test')?{test:{fixture(){if(!duel)return;duel.state.phase='live';duel.state.roundClock=90;for(let i=0;i<2;i++)Object.assign(duel.state.players[i],{x:0,z:20-i*6,y:1.7,yaw:i?Math.PI:0,pitch:0,hp:100,alive:true});duel.state.round++;adopt(duel.snapshot());net.send({type:'snapshot',state:current});},win(){if(!duel)return;duel.state.score[0]=5;duel.state.phase='matchover';duel.state.matchWinner=0;adopt(duel.snapshot());net.send({type:'snapshot',state:current});}}}:{})
  };
 }
};
