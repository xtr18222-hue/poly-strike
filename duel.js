/* DOM-free authoritative 1v1 simulation. Player y is eye height. dt is seconds. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PolyDuel=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
 const finite=Number.isFinite;
 function create(map,C){
  map=map||C.MAP;
  const spawns=[map.spawnPlayer,map.opponent||map.spawnOpponent||map.spawnBots[0]];
  function player(s,id){return {id,name:'Operator '+(id+1),x:s.x,y:1.7,z:s.z,yaw:id?Math.PI:0,pitch:0,hp:100,alive:true,weapon:'ak47',ammo:Object.fromEntries(Object.entries(C.WEAPONS).map(([k,w])=>[k,{mag:w.mag,reserve:w.reserve}])),reload:0,reloadKey:null,kills:0,deaths:0};}
  const state={mapId:map.id||'sandline',phase:'buy',round:1,score:[0,0],buyClock:5,roundClock:90,endClock:0,time:0,lastWinner:null,matchWinner:null,players:spawns.map(player),events:[]};
  function step(dt){
   if(!finite(dt)||dt<=0)return;dt=Math.min(dt,.25);state.time+=dt;
   for(const p of state.players)if(p.reload>0){p.reload=Math.max(0,p.reload-dt);if(p.reload<1e-8){const a=p.ammo[p.reloadKey],w=C.WEAPONS[p.reloadKey],n=Math.min(w.mag-a.mag,a.reserve);a.mag+=n;a.reserve-=n;p.reload=0;p.reloadKey=null;}}
   if(state.phase==='buy'){state.buyClock=Math.max(0,state.buyClock-dt);if(state.buyClock<1e-8)state.phase='live';}
   else if(state.phase==='live'){state.roundClock=Math.max(0,state.roundClock-dt);if(state.roundClock<1e-8){const [a,b]=state.players;finish(a.hp===b.hp?null:a.hp>b.hp?0:1);}}
   else if(state.phase==='end'){state.endClock=Math.max(0,state.endClock-dt);if(state.endClock<1e-8){if(state.score.some(s=>s>=5)){state.phase='matchover';state.matchWinner=state.score[0]>=5?0:1;}else{state.phase='buy';state.round++;state.buyClock=5;state.roundClock=90;state.lastWinner=null;state.players=spawns.map((s,id)=>({...player(s,id),name:state.players[id].name,kills:state.players[id].kills,deaths:state.players[id].deaths}));nextFire.fill(0);movement.forEach(m=>{m.at=state.time;m.budget=1;m.vertical=1;});}}}
  }
  function finish(winner){if(state.phase!=='live')return;state.phase='end';state.endClock=4;state.lastWinner=winner;if(winner!==null)state.score[winner]++;}
  function reload(id,key){if((id!==0&&id!==1)||!Object.hasOwn(C.WEAPONS,key)||!['buy','live'].includes(state.phase))return false;const p=state.players[id],w=C.WEAPONS[key],a=p.ammo[key];if(!p.alive||p.reload>0||!w.mag||a.mag>=w.mag||a.reserve<=0)return false;p.reload=w.reloadTime;p.reloadKey=key;return true;}
  const nextFire=[0,0],lastSeq=[-1,-1];
  const vector=v=>v&&['x','y','z'].every(k=>finite(v[k])&&Math.abs(v[k])<10000);
  function rayBox(o,d,min,max,limit){let lo=0,hi=limit;for(const k of ['x','y','z']){if(Math.abs(d[k])<1e-9){if(o[k]<min[k]||o[k]>max[k])return null;}else{let a=(min[k]-o[k])/d[k],b=(max[k]-o[k])/d[k];if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return null;}}return lo;}
  function shoot(id,s){
   const p=state.players[id],w=s&&Object.hasOwn(C.WEAPONS,s.weapon)&&C.WEAPONS[s.weapon];
   const reject=()=>({accepted:false,dmg:0,killed:false,target:null});
   if((id!==0&&id!==1)||!p||!s||!w||state.phase!=='live'||!p.alive||p.reload>0||state.time+1e-8<nextFire[id]||!Number.isSafeInteger(s.seq)||s.seq<0||s.seq<=lastSeq[id]||!vector(s.origin)||!vector(s.dir))return reject();
   if(Math.hypot(s.origin.x-p.x,s.origin.y-p.y,s.origin.z-p.z)>.6)return reject();
   const len=Math.hypot(s.dir.x,s.dir.y,s.dir.z);if(len<.5||len>2)return reject();
   const a=p.ammo[s.weapon];if(w.mag&&a.mag<=0)return reject();
   lastSeq[id]=s.seq;nextFire[id]=state.time+w.fireInterval;p.weapon=s.weapon;if(w.mag)a.mag--;
   const q=state.players[1-id],dir={x:s.dir.x/len,y:s.dir.y/len,z:s.dir.z/len},o={x:p.x,y:p.y,z:p.z},base=Math.max(0,q.y-1.7),height=q.y<1.4?1.35:1.95;
   const distance=rayBox(o,dir,{x:q.x-.38,y:base,z:q.z-.38},{x:q.x+.38,y:base+height,z:q.z+.38},w.slot==='melee'?2.65:150);
   const result={accepted:true,dmg:0,killed:false,target:null,weapon:s.weapon,seq:s.seq};
   if(distance===null||!q.alive)return result;
   for(const b of map.solids){if(rayBox(o,dir,{x:b.x-b.w/2,y:0,z:b.z-b.d/2},{x:b.x+b.w/2,y:b.h||4,z:b.z+b.d/2},distance)!==null)return result;}
   if(o.y+dir.y*distance<0)return result;
   const end={x:o.x+dir.x*distance,z:o.z+dir.z*distance};
   if(Math.abs(end.x)>map.bounds.hx||Math.abs(end.z)>map.bounds.hz)return result;
   const y=o.y+dir.y*distance,part=y>base+height-.35?'head':y<base+.6?'legs':'body';
   result.dmg=w.damage*(part==='head'?w.headMult:part==='legs'?w.legMult:1)*Math.max(.4,1-distance*w.falloff);result.target=1-id;result.part=part;
   q.hp=Math.max(0,q.hp-result.dmg);result.killed=q.hp===0;q.alive=q.hp>0;
   if(result.killed){p.kills++;q.deaths++;finish(id);}state.events.push({type:'shot',player:id,...result});if(state.events.length>12)state.events.shift();return result;
  }
  // Token budgets accrue on host time, never client timestamps or packet count.
  const movement=[{at:0,budget:1,vertical:1},{at:0,budget:1,vertical:1}];
  const expanded=map.solids.map(s=>({...s,w:s.w+.8,d:s.d+.8}));
  function move(id,s){
   if((id!==0&&id!==1)||!s||!vector(s)||!finite(s.yaw)||!finite(s.pitch)||Math.abs(s.yaw)>1e6||Math.abs(s.pitch)>Math.PI/2||s.y<.8||s.y>3.1||!['buy','live'].includes(state.phase))return false;
   const p=state.players[id],m=movement[id];if(!p.alive)return false;
   const elapsed=state.time-m.at;m.at=state.time;m.budget=Math.min(2.8,m.budget+elapsed*14);m.vertical=Math.min(1.2,m.vertical+elapsed*8);
   const dist=Math.hypot(s.x-p.x,s.z-p.z),dy=Math.abs(s.y-p.y);if(dist>m.budget+1e-8||dy>m.vertical+1e-8)return false;
   const clamped=C.collideCircle(s,.4,map.solids,map.bounds);
   if(Math.hypot(clamped.x-s.x,clamped.z-s.z)>.001||!C.segmentClear(p,s,expanded))return false;
   m.budget-=dist;m.vertical-=dy;for(const k of ['x','y','z','yaw','pitch'])p[k]=s[k];
   if(typeof s.name==='string')p.name=s.name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,20)||'Operator';
   if(typeof s.weapon==='string'&&Object.hasOwn(C.WEAPONS,s.weapon))p.weapon=s.weapon;
   return true;
  }
  return {state,step,shoot,move,reload,snapshot:()=>JSON.parse(JSON.stringify(state))};
 }
 return {create};
});
