'use strict';
/* Trainer-mode switching system + iron-sight alignment tests.
 * Uses the vendored THREE r149 and a window stub, matching tests/visuals.cjs. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const THREE = require(path.join(ROOT, 'vendor', 'three.min.js'));
global.window = global.window || global;
const PolyVisual = require(path.join(ROOT, 'visuals.js'));
const CORE = require(path.join(ROOT, 'core.js'));

// Sight alignment: compare the highest point of the front post/bead against the
// rear notch aperture, the way a real sight picture lines up.
function sightTop(g, role) {
  let best = -Infinity;
  g.traverse(o => {
    if (!o.userData || o.userData.sight !== role) return;
    const bb = new THREE.Box3().setFromObject(o);
    if (bb.max.y > best) best = bb.max.y;
  });
  return best;
}

test('trainer: training match starts in static pop-up mode', function () {
  const C = CORE.forMap('training');
  const m = C.createTrainingMatch();
  assert.equal(m.mode, 'static', 'default range mode is static targets');
  assert.equal(m.training, true);
  for (const b of m.bots) {
    assert.equal(b.speed, 0, 'static targets do not walk');
    assert.ok(b.cool >= 999, 'static targets never shoot back');
  }
});

test('trainer: toggleMode flips static <-> active and rearms the bots', function () {
  const C = CORE.forMap('training');
  const m = C.createTrainingMatch();
  assert.equal(m.toggleMode(), 'active');
  assert.equal(m.mode, 'active');
  for (const b of m.bots) {
    assert.ok(b.speed > 0, 'active bots move');
    assert.ok(b.cool < 999, 'active bots have a real fire cooldown');
  }
  assert.equal(m.toggleMode(), 'static');
  assert.equal(m.mode, 'static');
  for (const b of m.bots) {
    assert.equal(b.speed, 0, 'flipping back re-freezes the targets');
    assert.equal(b.cool, 999);
  }
});

test('trainer: active mode runs the hostile AI step (bots hunt the player)', function () {
  const C = CORE.forMap('training');
  const m = C.createTrainingMatch();
  const rng = C.mulberry32(7);
  m.phase = 'live';
  m.toggleMode(); // -> active
  const sense = { px: C.MAP.spawnPlayer.x, pz: C.MAP.spawnPlayer.z,
    bots: m.bots.map(b => ({ los: true, dist: 5 })) };
  for (let i = 0; i < 30; i++) m.step(0.1, rng, sense);
  // After a few seconds of live AI at close range, the player must have taken
  // damage: the bots are actually shooting, not standing idle.
  assert.ok(m.hp < 100, 'active training bots deal damage, hp=' + m.hp.toFixed(1));
});

test('trainer: static mode never damages the player', function () {
  const C = CORE.forMap('training');
  const m = C.createTrainingMatch();
  const rng = C.mulberry32(7);
  m.phase = 'live';
  const sense = { px: C.MAP.spawnPlayer.x, pz: C.MAP.spawnPlayer.z,
    bots: m.bots.map(b => ({ los: true, dist: 1 })) };
  for (let i = 0; i < 60; i++) m.step(0.1, rng, sense);
  assert.equal(m.hp, 100, 'static pop-up targets never shoot back');
});

test('trainer: switch box mesh is present in the arena and raycastable', function () {
  const scene = new THREE.Scene();
  const C = CORE.forMap('training');
  const arena = PolyVisual.buildArena(THREE, scene, C, 'medium');
  const sw = arena.hitMeshes.find(h => h.userData.switchMesh);
  assert.ok(sw, 'switch cap registered as a hit mesh');
  const group = scene.getObjectByName('training-switch');
  assert.ok(group, 'switch group exists in the scene');
  // The switch sits beside the lane, clear of the target pads.
  assert.ok(Math.abs(sw.getWorldPosition(new THREE.Vector3()).z - 26) < 1);
  assert.ok(sw.getWorldPosition(new THREE.Vector3()).y > 1);
  arena.dispose();
});

test('ragdoll fall state is gone from the bot sync path', function () {
  const src = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf-8');
  assert.ok(!src.includes('userData.fall'), 'no fall/tip-over state remains');
  assert.ok(!/function onKill/.test(src), 'the mission kill bridge is gone');
});
test('store, crates and missions are fully purged', function () {
  const src = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf-8');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf-8');
  for (const sym of ['openCase','rollCase','saveCrates','refreshCaseCount','CASE_ITEMS',
                     'MISSIONS','progressMissions','renderMissions','missionState',
                     'weaponSkins','applySkin','ownedSkins'])
    assert.ok(!src.includes(sym), 'game.js no longer defines ' + sym);
  for (const id of ['storePanel','storeButton','caseStrip','caseMarker','caseResult',
                    'missionList','missionClock','skinSelect','charSkinSelect'])
    assert.ok(!html.includes('id="' + id + '"'), 'index.html no longer has #' + id);
  for (const rule of ['#caseReel','#caseStrip','#caseMarker','#caseResult','.citem','.mission','.mbar'])
    assert.ok(!css.includes(rule), 'style.css no longer styles ' + rule);
});
test('announcer voice toggle is wired in options', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  const src = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf-8');
  const audio = fs.readFileSync(path.join(ROOT, 'audio.js'), 'utf-8');
  assert.ok(html.includes('id="announcerVoice"'), 'options has the voice select');
  assert.ok(src.includes('setVoicePack'), 'game binds the pack switch');
  assert.ok(audio.includes('voicePack'), 'audio exposes the pack state');
});

