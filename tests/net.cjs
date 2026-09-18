'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),{EventEmitter}=require('node:events');
// PeerJS is browser-only: controllable event boundary, not a simulated WebRTC test.
function harness(){
 const peers=[],timers=new Map();let ti=0;
 class Peer extends EventEmitter{constructor(id,opts){super();this.id=id;this.opts=opts;peers.push(this);}destroy(){this.destroyed=true;}connect(id,opts){this.out=new Conn(id);this.out.opts=opts;return this.out;}}
 class Conn extends EventEmitter{constructor(id='guest'){super();this.peer=id;this.open=false;this.sent=[];}send(x){this.sent.push(JSON.parse(JSON.stringify(x)));}close(){this.open=false;this.closed=true;this.emit('close');}start(){this.open=true;this.emit('open');}}
 const root={Peer,console,crypto:require('node:crypto').webcrypto,setTimeout:(f,ms)=>{timers.set(++ti,{f,ms});return ti;},clearTimeout:id=>timers.delete(id),setInterval:(f,ms)=>{timers.set(++ti,{f,ms,interval:true});return ti;},clearInterval:id=>timers.delete(id),Date};root.window=root;vm.runInNewContext(fs.readFileSync(require.resolve('../net.js'),'utf8'),root);
 const status=[],ready=[],data=[],closed=[];const n=root.PolyNet.create({onStatus:x=>status.push(x),onReady:x=>ready.push(x),onData:x=>data.push(x),onClose:x=>closed.push(x)});
 return {n,peers,Conn,status,ready,data,closed,timers,fire:ms=>{for(const [id,t]of [...timers])if(t.ms===ms){if(!t.interval)timers.delete(id);t.f();}}};
}
function live(){const h=harness();h.n.host('desert');const p=h.peers[0];p.emit('open',p.id);const c=new h.Conn();p.emit('connection',c);c.start();c.emit('data',{ps:2,kind:'hello'});c.emit('data',{ps:2,kind:'ack'});return {...h,c};}
test('RTT echoes only a bounded token and measures using local time',()=>{
 const h=live();assert.equal(h.n.ping,null);h.fire(5000);const ping=h.c.sent.at(-1);assert.equal(ping.kind,'ping');assert.ok(Number.isSafeInteger(ping.token));
 h.c.emit('data',{ps:2,kind:'pong',token:ping.token+1});assert.equal(h.n.ping,null);
 h.c.emit('data',{ps:2,kind:'pong',token:ping.token,at:999999999});assert.ok(h.n.ping>=0&&h.n.ping<1000);
 h.c.emit('data',{ps:2,kind:'ping',token:17,at:-999});assert.deepEqual(h.c.sent.at(-1),{ps:2,kind:'pong',token:17});
 h.n.close();assert.equal(h.n.ping,null);
});
test('online actions and rematch packets remain bounded',()=>{
 const h=live();for(const type of ['drop','pickup','rematch','rematchStatus','rematchStart'])assert.equal(h.n.send({type,matchId:1,round:1,id:'drop-1'}),true);
 assert.equal(h.n.send({type:'pickup',id:'x'.repeat(20000)}),false);
});
function onlinePair(){
 const C=require('../core.js'),D=require('../duel.js'),ends=[],queue=[],ready=[[],[]];
 for(let i=0;i<2;i++){
  const root={window:null,location:{search:'?test=1'},URLSearchParams,POLY_CORE:C,PolyDuel:D,PolyNet:{create(cb){ends[i]={cb};return {connected:true,ping:12,role:i===0?'host':'guest',host(){},join(){},code:'ps2-testcode',send(packet){queue.push([1-i,JSON.parse(JSON.stringify(packet))]);return true;},close(){}};}}};root.window=root;
  vm.runInNewContext(fs.readFileSync(require.resolve('../online.js'),'utf8'),root);
  const online=root.PolyOnline.create(C,{ready:x=>ready[i].push(x)});ends[i].online=online;
 }
 const flush=()=>{while(queue.length){const [i,p]=queue.shift();ends[i].cb.onData(p);}};
 ends[1].cb.onReady({role:'guest',mapId:'desert'});ends[0].cb.onReady({role:'host',mapId:'desert'});flush();
 return {h:ends[0].online,g:ends[1].online,ends,queue,ready,flush};
}
test('rematch requires both consent and host map; stale events cannot cross matches',()=>{
 const {h,g,ends,ready,flush}=onlinePair();assert.equal(h.requestRematch('urban'),false);h.test.win();flush();
 assert.equal(g.requestRematch('industrial'),true);flush();assert.equal(h.state.phase,'matchover');
 assert.equal(h.rematchStatus.guest,true);assert.equal(h.requestRematch('urban'),true);flush();
 assert.equal(ready[0].length,2);assert.equal(ready[1].length,2);assert.equal(ready[1][1].mapId,'urban');assert.equal(g.state.mapId,'urban');assert.equal(g.state.round,1);assert.equal(g.state.events.length,0);assert.equal(g.state.players[0].primaryLocked,false);
 ends[1].cb.onData({type:'snapshot',matchId:1,state:{...g.state,phase:'matchover'}});assert.equal(g.state.phase,'buy');
 assert.equal(h.connected,true);assert.equal(h.ping,12);
 h.test.fixture();flush();const before=h.state.players[1].x;
 ends[0].cb.onData({type:'input',matchId:1,round:h.state.round,state:{...h.state.players[1],x:before+.1}});
 h.step(.06);flush();assert.equal(h.state.players[1].x,before);
 ends[0].cb.onData({type:'drop',matchId:2,round:h.state.round-1});h.step(.06);assert.equal(h.state.players[1].dropped,false);
 h.test.win();flush();h.requestRematch('rotate');flush();assert.equal(h.state.phase,'matchover');g.requestRematch();flush();assert.equal(g.state.mapId,'desert');assert.equal(g.state.round,1);
});
test('guest never treats remote status as its own consent',()=>{
 const {h,g,ends,flush}=onlinePair();h.test.win();flush();
 ends[1].cb.onData({type:'rematchStatus',matchId:1,host:true,guest:true,nextMapId:'urban'});
 ends[1].cb.onData({type:'rematchStart',matchId:1,nextMatchId:2,mapId:'urban'});
 assert.equal(g.state.phase,'matchover');assert.equal(g.state.mapId,'desert');
});
test('online drop and pickup are host validated',()=>{
 const {h,g,flush}=onlinePair();h.test.fixture();flush();assert.equal(h.drop(),true);flush();h.step(.06);flush();const item=g.state.drops[0];
 assert.ok(item);g.pickup(item.id);flush();assert.equal(h.state.drops.length,1);assert.equal(h.pickup(item.id),true);h.step(.06);flush();assert.equal(g.state.drops.length,0);
});
test('heartbeat responds, silent connection expires and flood is bounded',()=>{
 const h=live();h.c.emit('data',{ps:2,kind:'ping'});assert.equal(h.c.sent.at(-1).kind,'pong');h.fire(30000);assert.equal(h.n.connected,false);assert.equal(h.timers.size,0);
 const f=live();for(let i=0;i<260;i++)f.c.emit('data',{ps:2,kind:'data',payload:{type:'input'}});assert.equal(f.n.connected,false);assert.ok(f.data.length<=240);
});
test('signaling and handshake timeouts, error explanations, reconnect cleanup',()=>{
 const h=harness();h.n.host('desert');h.fire(15000);assert.equal(h.peers[0].destroyed,true);assert.match(h.closed[0],/signaling|network/i);
 h.n.join('abcd1234');const p=h.peers[1];p.emit('open');h.fire(20000);assert.equal(p.destroyed,true);assert.match(h.closed[1],/timed out/i);
 h.n.host('urban');h.peers[2].emit('error',{type:'unavailable-id'});assert.match(h.closed[2],/already|another/i);
 h.n.host('industrial');const old=h.peers[3];h.n.host('desert');old.emit('error',{type:'network'});assert.equal(h.peers[4].destroyed,undefined);h.n.close();assert.equal(h.timers.size,0);
});
test('bounded JSON packets roundtrip detached; invalid values never delivered',()=>{
 const h=live(),p={type:'input',state:{x:1,y:1.7,z:2,yaw:0,pitch:0}};
 assert.equal(h.n.send(p),true);assert.equal(h.c.sent.at(-1).kind,'data');h.c.emit('data',h.c.sent.at(-1));assert.equal(h.data[0].state.x,1);p.state.x=9;assert.equal(h.data[0].state.x,1);
 for(const bad of [{type:'input',x:NaN},{type:'input',s:'x'.repeat(20000)},{type:'input',x:()=>0},JSON.parse('{"type":"input","__proto__":{"polluted":true}}'),{type:'admin'}, {type:'input',a:Array(2000).fill(0)}])assert.equal(h.n.send(bad),false);
 const cyclic={type:'input'};cyclic.self=cyclic;assert.equal(h.n.send(cyclic),false);
 h.c.emit('data',{ps:2,kind:'data',payload:{type:'input',x:Infinity}});assert.equal(h.data.length,1);assert.equal(h.n.connected,false);
});
test('host accepts one guest hello, chooses map, waits accept ack before ready',()=>{
 const h=harness();assert.equal(h.n.host('urban'),true);const p=h.peers[0];assert.match(p.id,/^ps2-[a-z0-9]{8}$/);assert.equal(p.opts.host,undefined);p.emit('open',p.id);assert.equal(h.n.code,p.id);assert.equal(h.ready.length,0);
 const c=new h.Conn();p.emit('connection',c);c.start();assert.equal(h.ready.length,0);c.emit('data',{ps:2,kind:'hello'});assert.equal(c.sent[0].kind,'accept');assert.equal(c.sent[0].mapId,'urban');assert.equal(h.ready.length,0);c.emit('data',{ps:2,kind:'ack'});assert.equal(h.n.connected,true);assert.equal(h.ready[0].role,'host');
 const extra=new h.Conn();p.emit('connection',extra);extra.start();assert.equal(extra.closed,true);assert.equal(h.n.connected,true);h.n.close();assert.equal(p.destroyed,true);assert.equal(c.closed,true);assert.equal(h.closed.length,1);assert.equal(h.timers.size,0);
});
test('guest hello and host map acceptance become ready, loss closes once',()=>{
 const h=harness();assert.equal(h.n.join('AB12CD34'),true);const p=h.peers[0];p.emit('open',p.id);const c=p.out;assert.equal(c.peer,'ps2-ab12cd34');c.start();assert.equal(c.sent[0].kind,'hello');c.emit('data',{ps:2,kind:'accept',mapId:'foundry',code:'ps2-ab12cd34'});assert.equal(h.n.connected,true);assert.equal(h.ready[0].mapId,'foundry');assert.equal(c.sent[1].kind,'ack');c.emit('close');c.emit('close');assert.equal(h.closed.length,1);assert.equal(h.n.connected,false);assert.equal(h.timers.size,0);
});
test('creating net is offline; invalid inputs do not allocate Peer; close is idempotent',()=>{
 const h=harness();assert.equal(h.peers.length,0);assert.equal(h.n.connected,false);assert.equal(h.n.send({type:'input'}),false);
 assert.equal(h.n.join('bad'),false);assert.equal(h.n.host('../bad'),false);assert.equal(h.peers.length,0);h.n.close();h.n.close();assert.equal(h.closed.length,0);
});
