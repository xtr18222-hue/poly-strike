/* Trusted-host casual duel adapter. No client health, ammunition or reload trust. */
window.PolyOnline = {
 create(C,callbacks={}){
  let duel=null,localId=0,current=null,active=false,clock=0,seq=0,net,matchId=1,mapId='',consent=[false,false],nextMapId='';
  const emit=(name,data)=>{if(callbacks[name])callbacks[name](data);};
  const primary=k=>['ak47','awp','kar98'].includes(k);
  const status=()=>({host:consent[0],guest:consent[1],local:consent[localId],remote:consent[1-localId],nextMapId:nextMapId||mapId});
  const send=p=>net.send({...p,matchId});
  function adopt(s){
   if(!s||s.mapId!==mapId||!['buy','live','end','matchover'].includes(s.phase)||!Array.isArray(s.players)||s.players.length!==2||!Array.isArray(s.score)||s.score.length!==2)return false;
   if(!['round','buyClock','roundClock','endClock','time'].every(k=>Number.isFinite(s[k])&&s[k]>=0)||!s.score.every(n=>Number.isInteger(n)&&n>=0&&n<=5)||!Array.isArray(s.events)||s.events.length>12||!s.events.every(e=>e&&[0,1].includes(e.player)&&Number.isSafeInteger(e.seq)&&Object.hasOwn(C.WEAPONS,e.weapon)))return false;
   if(!s.players.every(p=>p&&['x','y','z','yaw','pitch','hp'].every(k=>Number.isFinite(p[k]))&&p.hp>=0&&p.hp<=100&&primary(p.primary)&&typeof p.dropped==='boolean'&&['shotsFired','shotsHit'].every(k=>Number.isSafeInteger(p[k])&&p[k]>=0)&&p.shotsHit<=p.shotsFired&&(p.name===undefined||typeof p.name==='string'&&p.name.length<=20)&&p.ammo&&Object.keys(C.WEAPONS).every(k=>p.ammo[k]&&Number.isInteger(p.ammo[k].mag)&&p.ammo[k].mag>=0&&p.ammo[k].mag<=C.WEAPONS[k].mag&&Number.isInteger(p.ammo[k].reserve)&&p.ammo[k].reserve>=0&&p.ammo[k].reserve<=C.WEAPONS[k].reserve)))return false;
   if(!Array.isArray(s.drops)||s.drops.length>8||!s.drops.every(d=>d&&typeof d.id==='string'&&/^drop-\d{1,12}$/.test(d.id)&&primary(d.key)&&['x','z'].every(k=>Number.isFinite(d[k])&&Math.abs(d[k])<10000)&&Number.isInteger(d.mag)&&d.mag>=0&&d.mag<=C.WEAPONS[d.key].mag&&Number.isInteger(d.reserve)&&d.reserve>=0&&d.reserve<=C.WEAPONS[d.key].reserve))return false;
   if(current&&(s.round<current.round||s.time<current.time))return false;
   current=s;emit('snapshot',{state:s,id:localId});return true;
  }
  function publish(){if(duel){adopt(duel.snapshot());send({type:'snapshot',state:current});}}
  function begin(id,rematch=false){
   C=POLY_CORE.forMap(id);mapId=id;current=null;clock=0;seq=0;consent=[false,false];nextMapId=id;
   duel=localId===0?PolyDuel.create(C.MAP,C):null;
   emit('ready',{role:localId===0?'host':'guest',mapId:id,code:net.code,id:localId,rematch,matchId});emit('rematch',status());
   publish();
  }
  function rematchUpdate(){
   send({type:'rematchStatus',host:consent[0],guest:consent[1],nextMapId});emit('rematch',status());
   if(consent[0]&&consent[1]){const id=nextMapId;send({type:'rematchStart',nextMatchId:matchId+1,mapId:id});matchId++;begin(id,true);}
  }
  function action(type,extra={}){if(!active||!current)return false;if(duel){const ok=type==='drop'?duel.drop(0):type==='pickup'?duel.pickup(0,extra.id):duel.reload(0,extra.weapon);publish();return ok;}return send({type,...extra,round:current.round});}
  net=PolyNet.create({
   onStatus:s=>emit('status',s),
   onClose:s=>{active=false;duel=null;current=null;consent=[false,false];emit('close',s);},
   onReady:info=>{
    if(!Object.hasOwn(POLY_CORE.MAPS,info.mapId)){net.close('Map/version mismatch. Reload both browsers.');return;}
    localId=info.role==='host'?0:1;active=true;matchId=1;begin(info.mapId);
   },
   onData:p=>{
    if(!active||!p||p.matchId!==matchId)return;
    if(duel){
     if(p.type==='rematch'){if(duel.state.phase==='matchover'&&!consent[1]){consent[1]=true;rematchUpdate();}return;}
     if(p.round!==duel.state.round)return;
     if(p.type==='input')duel.move(1,p.state);
     if(p.type==='reload')duel.reload(1,p.weapon);
     if(p.type==='drop')duel.drop(1);
     if(p.type==='pickup'&&typeof p.id==='string'&&p.id.length<=32)duel.pickup(1,p.id);
     if(p.type==='shot'){duel.move(1,p.pose);duel.shoot(1,p.shot);}
    }else{
     if(p.type==='snapshot')adopt(p.state);
     if(p.type==='rematchStatus'&&current?.phase==='matchover'&&typeof p.host==='boolean'&&typeof p.guest==='boolean'&&Object.hasOwn(POLY_CORE.MAPS,p.nextMapId)){consent=[p.host,consent[1]];nextMapId=p.nextMapId;emit('rematch',status());}
     if(p.type==='rematchStart'&&current?.phase==='matchover'&&consent[1]&&p.nextMatchId===matchId+1&&Object.hasOwn(POLY_CORE.MAPS,p.mapId)){matchId=p.nextMatchId;begin(p.mapId,true);}
    }
   }
  });
  return {
   host:id=>net.host(id),join:code=>net.join(code),close:()=>net.close(),
   get active(){return active;},get connected(){return net.connected;},get ping(){return net.ping;},get rematchStatus(){return status();},get hostRole(){return localId===0;},get code(){return net.code;},get state(){return current;},get localId(){return localId;},
   step(dt,pose){
    if(!active||!Number.isFinite(dt)||dt<=0)return;clock+=Math.min(dt,.25);
    if(duel){duel.step(dt);if(pose)duel.move(0,pose);}
    if(clock>=.05){clock%=.05;if(duel)publish();else if(pose&&current)send({type:'input',state:pose,round:current.round});}
   },
   shoot(weapon,origin,dir,pose){
    if(!active||!current||!origin||!dir)return false;const shot={weapon,origin:{x:origin.x,y:origin.y,z:origin.z},dir:{x:dir.x,y:dir.y,z:dir.z},seq:seq++};
    if(duel){duel.move(0,pose);const result=duel.shoot(0,shot);publish();return result.accepted;}
    return send({type:'shot',shot,pose,round:current.round});
   },
   reload:weapon=>action('reload',{weapon}),drop:()=>action('drop'),pickup:id=>typeof id==='string'&&id.length<=32?action('pickup',{id}):false,
   requestRematch(id){
    if(!active||current?.phase!=='matchover'||consent[localId])return false;
    if(localId===0){const ids=Object.keys(POLY_CORE.MAPS);nextMapId=id==='rotate'?ids[(ids.indexOf(mapId)+1)%ids.length]:id||mapId;if(!Object.hasOwn(POLY_CORE.MAPS,nextMapId))return false;consent[0]=true;rematchUpdate();}
    else{consent[1]=true;send({type:'rematch'});emit('rematch',status());}return true;
   },
   ...(new URLSearchParams(location.search).has('test')?{test:{fixture(){if(!duel)return;duel.state.phase='live';duel.state.roundClock=90;duel.state.events=[];duel.state.drops=[];for(let i=0;i<2;i++)Object.assign(duel.state.players[i],{x:0,z:20-i*6,y:1.7,yaw:i?Math.PI:0,pitch:0,hp:100,alive:true,dropped:false});duel.state.round++;publish();},win(){if(!duel)return;duel.state.score[0]=5;duel.state.phase='matchover';duel.state.matchWinner=0;publish();}}}:{})
  };
 }
};
