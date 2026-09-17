'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../core.js');
const arena=(solids=[])=>({id:'test',bounds:{hx:38,hz:38},solids,spawnPlayer:{x:0,z:10},opponent:{x:0,z:0}});
const create=(map=arena())=>require('../duel.js').create(map,C);
const advance=(d,seconds)=>{for(let t=0;t<seconds-1e-8;t+=.05)d.step(Math.min(.05,seconds-t));};
const shot=(weapon='ak47',seq=1)=>({weapon,origin:{x:0,y:1.7,z:10},dir:{x:0,y:-.07,z:-1},seq});
test('sprint and slide fit 14m/s host budget and low eye height',()=>{const d=create();advance(d,5.1);assert.equal(d.move(0,{x:0,z:7.3,y:.85,yaw:0,pitch:0}),true);advance(d,.1);assert.equal(d.move(0,{x:0,z:6,y:.85,yaw:0,pitch:0}),true);});
test('five eliminations end match, respawn refills, tied timeout draws',()=>{
 const d=create();for(let i=0;i<5;i++){advance(d,5.1);assert.equal(d.state.phase,'live');assert.equal(d.shoot(0,shot('awp',i)).killed,true);assert.equal(d.state.phase,'end');assert.equal(d.state.score[0],i+1);advance(d,4.1);}
 assert.equal(d.state.phase,'matchover');assert.equal(d.state.matchWinner,0);assert.equal(d.shoot(0,shot('awp',9)).accepted,false);
 const tie=create();advance(tie,95.1);assert.equal(tie.state.phase,'end');assert.equal(tie.state.lastWinner,null);assert.deepEqual(tie.state.score,[0,0]);advance(tie,4.1);assert.equal(tie.state.round,2);
});
test('magazine empties, timed reload consumes reserve and blocks fire',()=>{
 const d=create();advance(d,5.1);const miss={...shot('deagle'),dir:{x:1,y:0,z:0}};
 for(let i=0;i<7;i++){assert.equal(d.shoot(0,{...miss,seq:i}).accepted,true);advance(d,.26);}
 assert.equal(d.shoot(0,{...miss,seq:8}).accepted,false);assert.equal(d.reload(0,'deagle'),true);
 assert.equal(d.shoot(0,{...miss,seq:9}).accepted,false);advance(d,2.21);
 assert.equal(d.state.players[0].ammo.deagle.mag,7);assert.equal(d.state.players[0].ammo.deagle.reserve,28);
 assert.equal(d.reload(0,'deagle'),false);assert.equal(d.shoot(0,{...miss,seq:10}).accepted,true);
});
test('movement uses host time budget, sweeps walls, bounds height and ignores hp',()=>{
 const d=create();advance(d,5.1);const p=d.state.players[0];
 assert.equal(d.move(0,{x:0,z:9.7,y:1.7,yaw:0,pitch:0,hp:999}),true);assert.equal(p.hp,100);
 assert.equal(d.move(0,{x:0,z:-20,y:1.7,yaw:0,pitch:0}),false);
 assert.equal(d.move(0,{x:NaN,z:9,y:1.7,yaw:0,pitch:0}),false);
 assert.equal(d.move(0,{x:0,z:9,y:100,yaw:0,pitch:0}),false);
 for(let i=0;i<100;i++)d.move(0,{x:p.x+.1,z:p.z,y:p.y,yaw:0,pitch:0});assert.ok(p.x<3);
 const w=create(arena([{x:0,z:9,w:4,d:.1,h:3}]));advance(w,5.1);
 assert.equal(w.move(0,{x:0,z:8.5,y:1.7,yaw:0,pitch:0}),false);
 advance(d,1);assert.equal(d.move(0,{x:p.x+.5,z:p.z,y:1.7,yaw:2,pitch:.1,weapon:'knife'}),true);assert.equal(p.weapon,'knife');
});
test('solid LOS and knife range prevent damage; spoofed/invalid origins rejected',()=>{
 const d=create(arena([{x:0,z:5,w:4,d:1,h:3}]));advance(d,5.1);assert.equal(d.shoot(0,shot()).dmg,0);
 const k=create();advance(k,5.1);assert.equal(k.shoot(0,shot('knife')).dmg,0);
 assert.equal(k.shoot(0,{...shot(),origin:{x:0,y:1.7,z:1}}).accepted,false);
 assert.equal(k.shoot(0,{...shot(),dir:{x:NaN,y:0,z:-1}}).accepted,false);
});
test('host computes body damage, rejects repeat sequence and fire cooldown',()=>{
 const d=create();assert.equal(d.shoot(0,shot()).accepted,false);advance(d,5.1);
 const hit=d.shoot(0,shot());assert.equal(hit.accepted,true);assert.ok(hit.dmg>30&&hit.dmg<36);assert.equal(hit.target,1);assert.ok(d.state.players[1].hp<70);
 assert.equal(d.shoot(0,shot('ak47',2)).accepted,false);advance(d,.11);assert.equal(d.shoot(0,shot('ak47',1)).accepted,false);
 assert.equal(d.shoot(0,shot('ak47',3)).accepted,true);assert.equal(d.state.players[0].ammo.ak47.mag,28);
});
test('duel starts at map spawns, buys then goes live, snapshots are detached',()=>{
 const d=create();assert.equal(d.state.phase,'buy');assert.equal(d.state.players[1].z,0);
 assert.equal(d.state.players[0].y,1.7);advance(d,5.1);assert.equal(d.state.phase,'live');
 const s=d.snapshot();assert.deepEqual(JSON.parse(JSON.stringify(s)),s);s.players[0].hp=0;assert.equal(d.state.players[0].hp,100);
});
