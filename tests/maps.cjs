'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

test('four selectable maps expose bound simulation contexts', () => {
  assert.ok(C.MAPS, 'map registry exists');
  assert.deepEqual(Object.keys(C.MAPS).sort(), ['desert', 'harbor', 'industrial', 'training', 'urban']);
  assert.equal(C.MAP, C.MAPS.desert, 'legacy default stays desert');
  for (const id of Object.keys(C.MAPS)) {
    const ctx = C.forMap(id);
    assert.equal(ctx.MAP, C.MAPS[id]);
    assert.equal(ctx.MAP.id, id);
    assert.equal(ctx.MAP.theme, id);
    assert.ok(ctx.MAP.name.length > 0);
    for (const key of Object.keys(C)) assert.ok(key in ctx, `shared API ${key}`);
    assert.equal(ctx.pickSpread, C.pickSpread);
    assert.equal(ctx.collideCircle, C.collideCircle);
    const {createMatch, nearestNav} = ctx;
    const m = createMatch();
    assert.deepEqual(m.bots.map(b => b.pos), ctx.MAP.spawnBots);
    for (const b of m.bots) assert.equal(b.node, nearestNav(b.pos));
  }
  assert.throws(() => C.forMap('missing'), /unknown map/i);
});

test('classic scripts expose the same map API without Node or DOM', () => {
  const vm = require('node:vm'), fs = require('node:fs');
  const sandbox = {};
  vm.createContext(sandbox);
  for (const file of ['maps.js', 'core.js']) vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'), sandbox);
  assert.deepEqual(Object.keys(sandbox.POLY_CORE.MAPS), ['desert','industrial','urban','harbor','training']);
  assert.equal(sandbox.POLY_CORE.forMap('urban').createMatch().MAP.id,'urban');
});

test('30 seeded full-round bot traces remain collision-safe on every map', () => {
  for (const id of Object.keys(C.MAPS)) {
    const ctx = C.forMap(id), map = ctx.MAP;
    for (let seed=0; seed<30; seed++) {
      const m = ctx.createMatch(), rng = C.mulberry32(seed);
      m.phase='live';
      for (let frame=0; frame<1500; frame++) {
        const target = [map.spawnPlayer,map.spawnOpponent,...map.spawnBots][Math.floor(frame/200)%7];
        m.step(.05,rng,{px:target.x,pz:target.z});
        for (const b of m.bots) safe(map,b.pos,`${id} seed ${seed} frame ${frame} bot ${b.id}`);
      }
      assert.ok(m.navSearches <= 8, 'not per-frame BFS');
    }
  }
});

test('training range is a pressure-free target range', () => {
  const ctx = C.forMap('training'), m = ctx.createTrainingMatch();
  assert.equal(m.training, true);
  m.phase = 'live';
  const sense = { px: 0, pz: 34 };
  m.step(0.05, C.mulberry32(1), sense);
  assert.equal(m.phase, 'live');
  assert.equal(m.bots.every(b => b.speed === 0), true, 'targets are static');
  const shot = m.playerShot('akm', 0, 'head', 10);
  assert.equal(shot.killed, true, 'targets still take damage');
  for (let i = 0; i < 60; i++) m.step(0.05, C.mulberry32(i), sense);
  assert.equal(m.bots[0].alive, true, 'targets respawn');
  assert.ok(m.roundClock !== 90 || m.training, 'no round clock pressure');
});

test('reloads finish in the faster per-weapon times', () => {
  assert.equal(C.WEAPONS.akm.reloadTime, 1.35);
  assert.equal(C.WEAPONS.l96.reloadTime, 3.2);
  assert.equal(C.WEAPONS.deagle.reloadTime, 1.8);
});

test('AK and Deagle ADS tightens spread without removing movement penalties', () => {
  for (const key of ['akm', 'deagle']) {
    const spread = (move, crouch, air, ads) => Math.hypot(...Object.values(C.pickSpread(key, move, crouch, air, ads, () => .9)));
    const hip = spread(0,false,false,false), ads = spread(0,false,false,true);
    const moving = spread(1,false,false,true);
    assert.ok(ads < hip && ads > 0, key + ' ADS tightens');
    assert.ok(moving > ads, key + ' moving is not perfectly accurate');
    assert.ok(moving < spread(1,false,false,false), key + ' moving ADS still helps');
    assert.ok(spread(0,true,false,true) < ads, key + ' crouch helps');
    assert.ok(spread(0,false,true,true) > moving, key + ' airborne penalty remains');
  }
});

function safe(map, p, message) {
  const resolved = C.collideCircle(p, 0.4, map.solids, map.bounds);
  assert.ok(Math.hypot(resolved.x - p.x, resolved.z - p.z) < 1e-8, message);
}

test('all arena navigation and spawn paths have full collision-safe connectivity', () => {
  const footprints = new Set();
  for (const [id, map] of Object.entries(C.MAPS)) {
    assert.equal(map.size, 76);
    assert.deepEqual(map.bounds, {hx:38, hz:38});
    assert.equal(map.spawnBots.length, 5);
    // Training is an open range: no round clock, no score pressure.
    assert.equal(!!map.training, id === 'training');
    footprints.add(JSON.stringify(map.solids));
    for (const s of map.solids) {
      assert.ok(['building', 'wall', 'crate'].includes(s.kind));
      for (const k of ['x','z','w','d','h']) assert.ok(Number.isFinite(s[k]));
      assert.ok(s.w > 0 && s.d > 0 && s.h > 0);
      assert.ok(Math.abs(s.x) + s.w/2 < 38 && Math.abs(s.z) + s.d/2 < 38);
    }
    const ctx = C.forMap(id), g = C.buildNavGraph(map.nav, map.solids);
    const seen = new Set([ctx.nearestNav(map.spawnPlayer)]), q = [...seen];
    for (let i=0; i<q.length; i++) for (const n of g[q[i]]) if (!seen.has(n)) { seen.add(n); q.push(n); }
    assert.equal(seen.size, map.nav.length, id + ' fully connected');
    const inflated = map.solids.map(s => ({...s, w:s.w+0.8, d:s.d+0.8}));
    for (const [i, point] of map.nav.entries()) {
      safe(map, point, id + ' nav clear');
      for (const n of g[i]) assert.ok(C.segmentClear(point, map.nav[n], inflated), id + ' edge clear');
    }
    const spawns = [map.spawnPlayer, ...map.spawnBots];
    assert.equal(new Set(spawns.map(p=>`${p.x},${p.z}`)).size, 6);
    for (const p of [...spawns, map.spawnOpponent]) {
      safe(map, p, id + ' spawn clear');
      assert.ok(C.segmentClear(p, map.nav[ctx.nearestNav(p)], inflated), id + ' spawn-to-nav clear');
    }
    assert.ok(Math.hypot(map.spawnPlayer.x-map.spawnOpponent.x, map.spawnPlayer.z-map.spawnOpponent.z)>50);
  }
  assert.equal(footprints.size, 5, 'topologies differ, not just materials');
});

test('map/context match arguments share cached graphs but not live match state', () => {
  for (const id of Object.keys(C.MAPS)) {
    const ctx = C.forMap(id), map = ctx.MAP;
    const a = ctx.createMatch(), b = C.createMatch(map), c = C.createMatch(ctx);
    assert.equal(a.MAP, map);
    assert.equal(a.navGraph, b.navGraph);
    assert.equal(a.navGraph, c.navGraph);
    assert.equal(ctx.NAVGRAPH, a.navGraph);
    assert.notEqual(a.navGraph, C.forMap(id === 'urban' ? 'desert' : 'urban').NAVGRAPH);
    assert.notEqual(a.bots, b.bots);
    a.bots[0].pos.x += 1; a.hp = 2;
    assert.deepEqual(b.bots.map(b=>b.pos), map.spawnBots);
    assert.equal(b.hp, 100);
    a.resetRound();
    assert.deepEqual(a.bots.map(b=>b.pos), map.spawnBots);
  }
});

test('BFS work is reused until the sensed player nav node changes', () => {
  const ctx = C.forMap('urban'), m = ctx.createMatch(), other = ctx.createMatch(), rng = C.mulberry32(8);
  m.phase = 'live'; other.phase = 'live';
  const p = ctx.MAP.spawnPlayer;
  m.step(.01,rng,{px:p.x,pz:p.z});
  assert.equal(m.navSearches,1);
  for (let i=0;i<100;i++) m.step(.01,rng,{px:p.x+.01,pz:p.z+.01});
  assert.equal(m.navSearches,1, 'sub-node movement does not rerun BFS');
  assert.equal(other.navSearches,0, 'search state is match-local');
  const q = ctx.MAP.spawnOpponent;
  m.step(.01,rng,{px:q.x,pz:q.z});
  assert.equal(m.navSearches,2);
  m.resetRound(); m.phase='live';
  m.step(.01,rng,{px:q.x,pz:q.z});
  assert.equal(m.navSearches,2, 'same node still valid after reset');
  m.step(.01,rng);
  assert.equal(m.navSearches,2, 'no target needs no BFS');
});
