'use strict';
// Node test suite for the deterministic simulation core (POLY_CORE).
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const C = require(path.join(__dirname, '..', 'core.js'));

/* ---------- 1. Weapon arsenal ---------- */
test('arsenal contains the seven weapons with consistent stats', () => {
  // The new asset suite: 7 weapons (5 primaries, Deagle, bayonet melee).
  assert.deepEqual(Object.keys(C.WEAPONS).sort(), ['akm','bayonet','deagle','hecate','l96','mosin','mx']);
  for (const [k, w] of Object.entries(C.WEAPONS)) {
    assert.equal(w.key, k, 'weapon key matches');
    assert.equal(typeof w.name, 'string');
    if (k !== 'bayonet') {
      assert.ok(w.mag > 0 && w.reserve > 0, `${k} has ammo`);
      assert.ok(w.damage > 0 && w.reloadTime > 0);
      assert.equal(typeof w.auto, 'boolean');
    }
  }
  assert.equal(C.WEAPONS.l96.damage >= 100, true, 'L96 one-shot body damage');
  assert.equal(C.WEAPONS.akm.auto, true, 'AKM is automatic');
  assert.equal(C.WEAPONS.deagle.auto, false, 'Deagle is semi-auto');
  assert.equal(C.WEAPONS.l96.zoomFov < 40, true, 'L96 has scope zoom');
  assert.equal(C.WEAPONS.mx.zoomFov, null, 'MX is unscoped (iron sights only)');
  assert.equal(C.WEAPONS.mx.ads, true, 'MX uses ADS like the AKM');
});

/* ---------- 2. Spray pattern ---------- */
test('spray pattern is deterministic and shaped like an AK climb', () => {
  const a = C.buildSprayPattern(1234, 30);
  const b = C.buildSprayPattern(1234, 30);
  assert.deepEqual(a, b, 'same seed -> identical pattern');
  assert.equal(a.length, 30);
  const c = C.buildSprayPattern(99, 30);
  assert.notDeepEqual(a, c, 'different seed -> different pattern');
  const sum = (arr, f) => arr.reduce((s, p) => s + f(p), 0);
  // vertical climb dominates the first 8 shots, flattens afterwards
  assert.ok(sum(a.slice(0, 8), p => p.up) > sum(a.slice(12, 20), p => p.up) * 1.5);
  for (const p of a) {
    assert.ok(Number.isFinite(p.up) && Number.isFinite(p.side));
    assert.ok(Math.abs(p.up) <= 2.2 && Math.abs(p.side) <= 2.2);
  }
});

/* ---------- 3. Spread model ---------- */
test('spread model: crouch tightens, movement loosens, AWP unscoped is wild', () => {
  const rng = C.mulberry32(7);
  const acc = (fn, n = 400) => { let s = 0; for (let i = 0; i < n; i++) { const v = fn(); s += Math.hypot(v.yaw, v.pitch); } return s / n; };
  const stand = acc(() => C.pickSpread('akm', 0, false, false, false, rng));
  const crouch = acc(() => C.pickSpread('akm', 0, true, false, false, rng));
  const moving = acc(() => C.pickSpread('akm', 1, false, false, false, rng));
  const air = acc(() => C.pickSpread('akm', 0, false, true, false, rng));
  assert.ok(crouch < stand, 'crouched spread < standing');
  assert.ok(moving > stand, 'moving spread > standing');
  assert.ok(air > moving, 'airborne spread is worst');
  const scoped = acc(() => C.pickSpread('l96', 0, false, false, true, rng));
  // A scoped rifle fired from the hip: its base spread is wide by design.
  const noscope = acc(() => C.pickSpread('l96', 0, false, false, false, rng));
  // The L96's hipfire base is 4.5x its scoped spread, so an unscoped sniper
  // is genuinely wild rather than merely loose.
  assert.ok(noscope > scoped * 4, 'sniper noscope is wildly inaccurate');
  const knife = acc(() => C.pickSpread('bayonet', 1, false, true, false, rng));
  assert.equal(knife, 0, 'knife has no spread');
});

/* ---------- 4. Collision ---------- */
test('circle collision resolves overlaps, slides along walls, clamps bounds', () => {
  const solids = [{ x: 0, z: 0, w: 4, d: 4 }]; // centered box 4x4
  // far away -> unchanged
  let p = C.collideCircle({ x: 10, z: 10 }, 0.4, solids, C.MAP.bounds);
  assert.deepEqual(p, { x: 10, z: 10 });
  // overlapping from +x -> pushed out to box edge + radius
  p = C.collideCircle({ x: 1.9, z: 0 }, 0.4, solids, C.MAP.bounds);
  assert.ok(Math.abs(p.x - 2.4) < 1e-6 && Math.abs(p.z) < 1e-6, 'pushed to +x face');
  // slide: moving diagonally into a wall keeps tangential motion
  p = C.collideCircle({ x: 3.5, z: 3.5 }, 0.4, solids, C.MAP.bounds);
  assert.ok(p.x > 2.3 && p.z > 2.3, 'corner resolves to outside both faces');
  // deep inside -> ejected to nearest face
  p = C.collideCircle({ x: 0, z: 0 }, 0.4, solids, C.MAP.bounds);
  assert.ok(Math.max(Math.abs(p.x), Math.abs(p.z)) >= 2.4 - 1e-6);
  // bounds clamp
  p = C.collideCircle({ x: 999, z: -999 }, 0.4, [], C.MAP.bounds);
  assert.ok(p.x <= C.MAP.bounds.hx - 0.4 && p.z >= -(C.MAP.bounds.hz) + 0.4);
});

/* ---------- 5. Line of sight ---------- */
test('segmentClear blocked by walls, clear in the open', () => {
  const solids = [{ x: 0, z: 0, w: 2, d: 2 }];
  assert.equal(C.segmentClear({ x: -5, z: 0 }, { x: 5, z: 0 }, solids), false, 'through box');
  assert.equal(C.segmentClear({ x: -5, z: 5 }, { x: 5, z: 5 }, solids), true, 'over the top');
  assert.equal(C.segmentClear({ x: 0, z: -5 }, { x: 0, z: 5 }, solids), false);
  assert.equal(C.segmentClear({ x: -5, z: 1.5 }, { x: 5, z: 1.5 }, solids), true, 'grazing edge misses');
});

/* ---------- 6. Nav connectivity ---------- */
test('nav graph is connected from the player spawn (BFS)', () => {
  const g = C.buildNavGraph(C.MAP.nav, C.MAP.solids);
  const start = C.nearestNav(C.MAP.spawnPlayer);
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const v = q.pop();
    for (const u of g[v]) if (!seen.has(u)) { seen.add(u); q.push(u); }
  }
  assert.equal(seen.size, C.MAP.nav.length, 'every nav point reachable');
  // every bot spawn sits near some nav point
  for (const s of C.MAP.spawnBots) assert.ok(C.nearestNav(s) >= 0);
});

/* ---------- 7. Match / round flow ---------- */
function stepToLive(m, rng) { for (let i = 0; i < 400 && m.phase === 'buy'; i++) m.step(0.1, rng); assert.equal(m.phase, 'live'); }
test('round flow: buy freeze -> live; killing all bots wins the round', () => {
  const rng = C.mulberry32(1);
  const m = C.createMatch();
  assert.equal(m.phase, 'buy');
  assert.equal(m.score.player, 0); assert.equal(m.score.enemy, 0);
  stepToLive(m, rng);
  const before = m.round;
  for (const b of m.bots) m.playerShot('akm', b.id, 'head', 10);
  m.step(0.1, rng); // flush
  assert.equal(m.phase, 'end', 'round ends when all bots die');
  assert.equal(m.lastWinner, 'player');
  for (let i = 0; i < 60 && m.phase !== 'buy'; i++) m.step(0.1, rng);
  assert.equal(m.round, before + 1, 'next round starts');
});
test('player death loses the round; timer expiry loses the round', () => {
  {
    const rng = C.mulberry32(2);
    const m = C.createMatch(); stepToLive(m, rng);
    m.enemyShot(8); // lethal burst damage xN
    while (m.hp > 0) m.enemyShot(10);
    assert.equal(m.hp, 0);
    m.step(0.1, rng);
    assert.equal(m.phase, 'end');
    assert.equal(m.lastWinner, 'enemy');
  }
  {
    const rng = C.mulberry32(3);
    const m = C.createMatch(); stepToLive(m, rng);
    m.roundClock = 0.01; m.step(0.1, rng);
    assert.equal(m.phase, 'end');
    assert.equal(m.lastWinner, 'enemy', 'timeout favours defenders (bots)');
  }
});
test('match ends at five round wins', () => {
  const rng = C.mulberry32(4);
  const m = C.createMatch();
  m.score.player = 4; m.score.enemy = 4;
  stepToLive(m, rng);
  for (const b of m.bots) m.playerShot('l96', b.id, 'body', 5);
  m.step(0.1, rng);
  assert.equal(m.phase, 'end');
  for (let i = 0; i < 60 && m.phase !== 'matchover'; i++) m.step(0.1, rng);
  assert.equal(m.phase, 'matchover');
  assert.equal(m.matchWinner, 'player');
  const m2 = C.createMatch(); m2.score.enemy = 5;
  assert.equal(m2.matchWinner, 'enemy');
});

/* ---------- 8. Economy ---------- */
test('economy: kill awards per weapon, win/loss bonuses, loss-streak cap', () => {
  const rng = C.mulberry32(5);
  const m = C.createMatch();
  assert.equal(m.money, C.ECON.start);
  const ak = C.WEAPONS.akm, awp = C.WEAPONS.l96, de = C.WEAPONS.deagle, kn = C.WEAPONS.bayonet;
  // Each award requires a fresh, alive target and a lethal hit.
  for (const w of [ak, awp, de, kn]) {
    const fresh = C.createMatch(); fresh.money = 0;
    while (fresh.bots[0].alive) fresh.playerShot(w.key, 0, 'body', 1);
    assert.equal(fresh.money, w.killAward);
    fresh.playerShot(w.key, 0, 'body', 1);
    assert.equal(fresh.money, w.killAward, 'dead targets never pay twice');
  }
  // loss streak escalation caps at ECON.lossMax
  m.money = 0; m.lossStreak = 0;
  m.loseRound();
  const first = m.money;
  m.loseRound(); m.loseRound(); m.loseRound(); m.loseRound();
  assert.ok(m.money > first, 'loss bonus grows');
  assert.ok(m.money <= (first + 4 * C.ECON.lossMax) + 1e-9, 'no payment above cap');
  // win resets streak
  m.winRound();
  assert.equal(m.lossStreak, 0);
  assert.ok(m.money >= C.ECON.winRound);
});
test('buy: prices, funds check, once per weapon type', () => {
  const m = C.createMatch();
  m.money = 5000;
  assert.equal(m.buy('akm'), true);
  assert.equal(m.money, 5000 - C.WEAPONS.akm.price);
  assert.equal(m.buy('akm'), false, 'cannot re-buy owned primary');
  assert.equal(m.money, 5000 - C.WEAPONS.akm.price);
  assert.equal(m.buy('l96'), false, 'primary slot occupied');
  assert.equal(m.buy('deagle'), false, 'starter Deagle already owned');
  m.owned.secondary = null;
  assert.equal(m.buy('deagle'), true);
  assert.equal(m.buy('armor'), true);
  assert.equal(m.armor, 100);
  m.money = 10;
  assert.equal(m.buy('armor'), false, 'insufficient funds');
});

/* ---------- 9. Damage model ---------- */
test('playerShot: headshot multiplier, falloff with distance, kill finalizes', () => {
  const m = C.createMatch();
  const b = m.bots[0];
  const ak = C.WEAPONS.akm;
  const near = m.playerShot('akm', b.id, 'body', 2);
  const far = m.playerShot('akm', b.id, 'body', 40);
  assert.ok(far.dmg < near.dmg, 'falloff reduces damage');
  const hs = m.playerShot('akm', b.id, 'head', 2);
  assert.ok(hs.dmg > near.dmg * 2, 'headshots hurt');
  // finish the bot
  while (b.alive) m.playerShot('l96', b.id, 'body', 10);
  assert.equal(b.alive, false);
  assert.equal(m.aliveBots().length, m.bots.length - 1);
  // shooting a dead bot is a miss
  const dead = m.playerShot('l96', b.id, 'head', 1);
  assert.equal(dead.dmg, 0);
  assert.equal(dead.killed, false);
});
test('enemyShot: armor soaks damage and depletes; dead stop at 0 hp', () => {
  const m = C.createMatch();
  m.armor = 100; m.hp = 100;
  const r = m.enemyShot(20);
  assert.ok(r.dmg > 0 && r.dmg <= 20);
  assert.ok(m.hp < 100, 'armor pen lets some damage through');
  assert.ok(m.armor < 100, 'armor absorbs');
  const hpLost = 100 - m.hp;
  const armorLost = 100 - m.armor;
  assert.ok(hpLost < armorLost, 'armor takes the brunt');
  m.armor = 0; m.hp = 5;
  const r2 = m.enemyShot(20);
  assert.ok(r2.dmg > 0);
  assert.ok(m.hp < 5);
});

test('30 seeded traces keep bots finite and outside obstacles', () => {
  for(let seed=0;seed<30;seed++){
    const m=C.createMatch(),r=C.mulberry32(seed); stepToLive(m,r);
    for(let i=0;i<100;i++) m.step(.05,r,{px:0,pz:34,bots:m.bots.map(()=>({los:false,dist:50}))});
    for(const b of m.bots){
      assert.ok(Number.isFinite(b.pos.x)&&Number.isFinite(b.pos.z));
      for(const s of C.MAP.solids) assert.ok(!(Math.abs(b.pos.x-s.x)<s.w/2 && Math.abs(b.pos.z-s.z)<s.d/2),'bot never inside wall');
    }
  }
});

/* ---------- 10. Determinism across seeds ---------- */
test('bot brain stepping is deterministic for a fixed seed', () => {
  const run = (seed) => {
    const rng = C.mulberry32(seed);
    const m = C.createMatch();
    stepToLive(m, rng);
    for (let i = 0; i < 120; i++) {
      m.step(0.05, rng, { los: i % 3 !== 0, dist: 12 });
    }
    return m.bots.map(b => [b.id, b.pos.x.toFixed(3), b.pos.z.toFixed(3), b.shots].join('|')).join(';');
  };
  assert.equal(run(31337), run(31337), 'same seed -> same bot trace');
  assert.notEqual(run(31337), run(4242), 'different seed -> different trace');
});
