const test=require('node:test'),assert=require('node:assert/strict'),C=require('../core.js');
test('Kar98k has heavy damage, lethal headshots, five rounds and bolt-action pacing',()=>{for(const dist of [1,40,110]){const m=C.createMatch();m.phase='live';const body=m.playerShot('kar98',0,'body',dist);assert.ok(body.dmg>=85&&body.dmg<=130,`body damage ${body.dmg.toFixed(1)} in range at ${dist}m`);const head=m.playerShot('kar98',1,'head',dist);assert.equal(head.killed,true);}
assert.equal(C.WEAPONS.kar98.auto,false);assert.equal(C.WEAPONS.kar98.fireInterval,1.2);assert.equal(C.WEAPONS.kar98.reloadTime,2.4);assert.equal(C.WEAPONS.kar98.mag,5);});
test('solo round victory sets clutch only on final elimination and clears next round',()=>{const m=C.createMatch();m.phase='live';assert.equal(m.lastClutch,false);for(let i=0;i<m.bots.length;i++){m.playerShot('awp',i,'head',1);assert.equal(m.lastClutch,i===m.bots.length-1);}m.resetRound();assert.equal(m.lastClutch,false);});
test('lethal kill events preserve head flags and victim names',()=>{for(const part of ['head','body']){const m=C.createMatch();m.phase='live';m.playerShot('awp',0,part,1);assert.equal(m.events.at(-1).head,part==='head');assert.equal(m.events.at(-1).name,m.bots[0].name);}});

test('Kar98k headshot is a guaranteed kill at every range, body damage is variable and bounded',()=>{
 for(const dist of [0,10,50,110,200]){
  const m=C.createMatch();m.phase='live';
  const head=m.playerShot('kar98',0,'head',dist);
  assert.equal(head.killed,true,`headshot kills at ${dist}m`);
  assert.ok(head.dmg>100,`headshot exceeds 100hp at ${dist}m`);
  const body=C.createMatch();body.phase='live';
  const b=body.playerShot('kar98',1,'body',dist);
  assert.ok(b.dmg>70&&b.dmg<130,`body damage ${b.dmg.toFixed(1)} in tactical range at ${dist}m`);
  const leg=C.createMatch();leg.phase='live';
  const l=leg.playerShot('kar98',2,'legs',dist);
  assert.ok(l.dmg<100,`leg hit never one-shots at ${dist}m`);
 }
 // variable body outcome: some distances within a short span kill, some survive
 let kills=0,shots=0;
 for(let d=0;d<=2000;d+=7){const m=C.createMatch();m.phase='live';shots++;if(m.playerShot('kar98',0,'body',d/10).killed)kills++;}
 assert.ok(kills>0&&kills<shots,'Kar98k body shots are variable, never guaranteed nor never');
 assert.equal(C.WEAPONS.kar98.headMult>=2.4,true,'head multiplier supports guaranteed headshot kill');
 assert.equal(typeof C.shotDamage==='function',true,'shotDamage is exported');
 assert.equal(C.shotDamage('kar98','head',110),C.shotDamage('kar98','head',110),true,'shotDamage is deterministic');
 for(const part of ['head','body','legs'])assert.ok(C.shotDamage('kar98',part,50)>0);
 for(const part of ['head','body','legs'])assert.ok(C.shotDamage('ak47',part,50)>0);
});
