const test=require('node:test'),assert=require('node:assert/strict'),C=require('../core.js');
test('Deagle kills full-health bot with two body shots at every map distance',()=>{for(const dist of [0,10,50,110]){const m=C.createMatch();m.phase='live';assert.equal(m.playerShot('deagle',0,'body',dist).killed,false);assert.equal(m.playerShot('deagle',0,'body',dist).killed,true);}});
test('Deagle one headshot kills full-health bot at every map distance',()=>{for(const dist of [0,50,110]){const m=C.createMatch();m.phase='live';assert.equal(m.playerShot('deagle',0,'head',dist).killed,true);}});

test('scoreboard stats persist across rounds and damage records shooter',()=>{const m=C.createMatch();m.phase='live';m.playerShot('awp',0,'head',1);assert.equal(m.bots[0].deaths,1);m.enemyShot(999,1);assert.equal(m.deaths,1);assert.equal(m.bots[1].kills,1);assert.equal(m.lastAttacker,1);m.resetRound();assert.equal(m.bots[0].deaths,1);assert.equal(m.deaths,1);});
