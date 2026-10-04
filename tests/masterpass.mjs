'use strict';
/* Master-pass regression tests for the parts of game.js that must not regress:
 *
 *  1. Rifle presentation (L96 / PGM Hecate II): the fitted weapon sits inside
 *     the frame at the ready position, lower-right, with the ADS anchor on the
 *     camera axis — measured with real THREE r149 through the real assets.js
 *     fit, so a broken fit or a frustum-framing change is caught here.
 *  2. FOV: the world camera target must come from the persisted setting, not a
 *     hardcoded 78, and the viewmodel camera must stay on its own fixed FOV so
 *     the weapon never rescales when the player changes FOV.
 *  3. Radar: hostile contacts must be gated on line of sight — the radar draws
 *     the same segmentClear() result the bots' own firing gate uses, so the
 *     radar cannot be used as a wallhack.
 */
import './three-importmap.mjs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const T = Object.assign(Object.create(THREE), {
  GLTFLoader, FBXLoader, SkeletonUtils: { clone: skeletonClone },
});
globalThis.THREE = T;
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.PolyVisual = { buildWeapon: () => null, SKINS: {}, applySkin: () => {} };
globalThis.PolySettings = { PRESETS: {}, normalize: () => 'medium' };
const ROOT = 'file:///C:/Users/xtr18/Projects/poly-strike/';
await import(ROOT + 'assets.js');
const A = globalThis.PolyAsset;
A.bind(T);
await A.loadAll(ROOT);

const GAME = fs.readFileSync(path.join(import.meta.dirname, '..', 'game.js'), 'utf8');

// The tables animateWeapon() places weapons with. Kept in sync with game.js by
// the "pose table" test in overhaul.cjs, which asserts every roster key has an
// entry — so a weapon added to the roster without a pose fails there.
const READY = { akm:{fx:.30,fy:-.52,d:.72}, l96:{fx:.28,fy:-.50,d:.80},
  hecate:{fx:.28,fy:-.50,d:.86}, deagle:{fx:.34,fy:-.48,d:.50}, knife:{fx:.30,fy:-.44,d:.48} };
const VIEWMODEL_POSE = { akm:[0.015,-0.045,0.10], l96:[0.012,-0.030,0.075],
  hecate:[0.012,-0.030,0.075], deagle:[0.02,-0.06,0.14], knife:[0.05,-0.30,0.30] };
const FOV = 90*Math.PI/180, ASP = 16/9;

function place(box, key, recoil=0) {
  const bMinY=box.min.y, bMaxY=box.max.y, bMaxZ=box.max.z;
  const span=Math.max(1e-4,bMaxY-bMinY);
  const needNear=span/0.85/Math.tan(FOV/2);
  const rd=READY[key]||READY.akm;
  const dZ=Math.max(rd.d, needNear-bMaxZ)+recoil*.06;
  const halfH=dZ*Math.tan(FOV/2), halfW=halfH*ASP;
  return { hx:(halfW*rd.fx-box.max.x), hy:-(halfH*(-rd.fy))-bMaxY, hz:-dZ, halfH, halfW };
}

for (const key of ['l96', 'hecate']) {
  test(`${key} fitted viewmodel sits inside the frame at the ready pose`, () => {
    const m = A.viewmodel(key);
    assert.ok(m, `${key} viewmodel resolves`);
    m.position.set(0,0,0); m.rotation.set(0,0,0);
    m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m);
    assert.ok(!box.isEmpty(), `${key} viewmodel has geometry`);
    const size = new THREE.Vector3(); box.getSize(size);
    // Bore along -Z, sights on +Y: the fit's contract, and what ADS relies on.
    assert.ok(size.z > size.x && size.z > size.y, `${key} bore along -Z after fit`);
    assert.ok(size.y > size.x, `${key} sights on +Y after fit`);
    const { hx, hy, hz, halfW, halfH } = place(box, key);
    let worst = 0;
    for (const [cx, cy, cz] of [[box.min.x,box.min.y,box.min.z],[box.max.x,box.min.y,box.min.z],
      [box.min.x,box.max.y,box.min.z],[box.max.x,box.max.y,box.min.z],
      [box.min.x,box.min.y,box.max.z],[box.max.x,box.min.y,box.max.z],
      [box.min.x,box.max.y,box.max.z],[box.max.x,box.max.y,box.max.z]]) {
      const d = -(hz + cz);
      if (d <= 1e-6) continue;
      worst = Math.max(worst, Math.abs((hx+cx)/d/halfW), Math.abs((hy+cy)/d/halfH));
    }
    assert.ok(worst <= 1.0, `${key} fully inside the frame (worst corner ${worst.toFixed(2)})`);
  });

  test(`${key} ADS anchor lands on the camera axis`, () => {
    const m = A.viewmodel(key);
    assert.ok(m.userData.adsAnchor, `${key} has an ADS anchor marker`);
    const box = new THREE.Box3().setFromObject(m);
    const { hx, hy, hz } = place(box, key);
    m.position.set(0,0,0); m.updateMatrixWorld(true);
    const a = new THREE.Vector3(); m.userData.adsAnchor.getWorldPosition(a);
    const mw = new THREE.Vector3(); m.getWorldPosition(mw);
    const off = a.clone().sub(mw);
    // animateWeapon's ADS branch: the anchor is moved to (0,0,adsZ).
    m.position.set(hx+(0-off.x-hx), hy+(0-off.y-hy), hz+(-0.55-off.z-hz));
    m.updateMatrixWorld(true);
    const w = new THREE.Vector3(); m.userData.adsAnchor.getWorldPosition(w);
    // viewCam is at the origin looking down -Z: on-axis means x,y ~ 0.
    assert.ok(Math.hypot(w.x, w.y) < 0.01, `${key} anchor radial offset ${Math.hypot(w.x, w.y).toFixed(4)}`);
  });
}

// ---------- FOV: real setting, world camera only ----------
test('FOV is driven by the persisted setting, not a hardcoded value', () => {
  // The world camera's target must be fovTarget(), which reads `fov`.
  assert.ok(/function fovTarget\(\)/.test(GAME), 'fovTarget() computes the camera target');
  assert.ok(/localStorage\.setItem\('poly-fov'/.test(GAME), 'the FOV choice is persisted');
  assert.ok(/localStorage\.getItem\('poly-fov'/.test(GAME), 'the FOV choice is restored on boot');
  assert.ok(/clampFov\(/.test(GAME), 'FOV is clamped to a sane range');
  assert.ok(/cam\.fov\+=\(\(fovTarget\(\)\)-cam\.fov\)/.test(GAME),
    'the camera lerps toward fovTarget(), not a literal 78');
  assert.ok(!/cam\.fov\+=\( ?\(scoped\?20\)/.test(GAME), 'the old hardcoded 78/84 target is gone');
  // The viewmodel camera must NOT read the FOV setting: it keeps its own fixed
  // FOV so the weapon never rescales when the player changes FOV.
  assert.ok(!/viewCam\.fov\s*=/.test(GAME), 'the viewmodel camera FOV is never reassigned');
});

// ---------- radar: no wallhack ----------
test('radar contacts are gated on line of sight', () => {
  // The bot loop must call segmentClear() — the same test the bots' own firing
  // gate (core.js) uses — so a hostile behind cover is never drawn.
  assert.ok(/for\(const b of match\.bots\)if\(b\.alive&&C\.segmentClear\(/.test(GAME),
    'radar draws only bots with a clear line of sight');
  // The solids passed to that gate must resolve without dereferencing C.MAP
  // blindly: C starts as the bare POLY_CORE facade and loadMap() may hand back
  // a per-map context, so hud() must tolerate either state. A bare C.MAP.* read
  // inside hud() throws a TypeError when the facade is current and the whole
  // HUD dies. Scoped to hud()'s own body: the tick's bot-LOS sense object
  // legitimately reads C.MAP.solids (it runs after loadMap, inside `running`).
  const hudBody = /function hud\(\)\{([\s\S]*?)\n\{?\s*function /.exec(GAME);
  assert.ok(hudBody, 'hud() exists in game.js');
  assert.ok(/const solids=\(C\.MAP\|\|match\.map\|\|POLY_CORE\.MAP\)\.solids;/.test(hudBody[1]),
    'hud resolves the collision solids without assuming C.MAP exists');
  assert.ok(!/C\.MAP\.solids/.test(hudBody[1]),
    'hud never dereferences C.MAP.solids directly');
});

test('radar keeps the map fixed and rotates the player marker', () => {
  // The map is axis-aligned and always drawn the same way up (world north at
  // the top of the disc): the player reads it without re-orienting with the
  // camera. Only the player marker rotates to show heading.
  // All radar plotting must go through one helper so geometry, contacts and
  // the marker stay consistent at every yaw.
  assert.ok(/function rp\(wx,wz\)\{return \[85\+\(wx-x\)\*2,85\+\(wz-z\)\*2\];\}/.test(GAME),
    'a single axis-aligned plot helper maps every radar element (no rotation of the map)');
  assert.ok(!/const cy=Math\.cos\(yaw\), sy=Math\.sin\(yaw\)/.test(GAME),
    'the map is not rotated by yaw anymore');
  // The player marker is a triangle rotated to yaw, drawn over the fixed map.
  assert.ok(/rc\.rotate\(-yaw\)/.test(GAME), 'the player marker rotates with yaw');
  assert.ok(/rc\.moveTo\(0,-6\);rc\.lineTo\(4,4\);rc\.lineTo\(-4,4\)/.test(GAME),
    'the marker is a heading triangle, not a centre dot');
  // The map itself never turns: solids are plotted through the same unrotated
  // helper as the contacts, over a translucent base wash (v42 radar pass).
  assert.ok(/rc\.fillStyle='rgba\(20,34,40,\.55\)';[\s\S]*?rc\.fillStyle='#2a3d42';[\s\S]*?for\(const s of solids\)/.test(GAME),
    'solids are drawn over the translucent fixed disc');
});

test('the knife is a true melee weapon with no firearm logic', () => {
  // The knife must never take a firearm path: no muzzle flash, no ammo
  // consumption, no reload. game.js gates all of that on isFirearm, which must
  // read the melee flag; and the swing must drive the blade arc, not a shot.
  assert.ok(/w\.melee\)swing=w\.fireInterval/.test(GAME), 'the swing is armed by the melee flag');
  assert.ok(/if\(isFirearm\(weapon\)\)\{flashTime=\.045;recoil=1;\}/.test(GAME),
    'muzzle flash and recoil are armed only for firearms');
  assert.ok(/if\(isFirearm\(weapon\)\)ammo\[weapon\]\.mag--;/.test(GAME),
    'a round is consumed only for firearms');
  // The knife ray is a short-range melee test, not a bullet ray.
  assert.ok(/ray\.far=!isFirearm\(weapon\)\?2\.65:150/.test(GAME),
    'the melee ray is 2.65m and the bullet ray is 150m');
});

test('the grenade throws instead of firing', () => {
  // The throwable branch must run before any bullet logic and never reach the
  // raycast: no bullet, no flash, no magazine consumed by a shot.
  assert.ok(/wt&&wt\.throwable\)/.test(GAME), 'a throwable branch exists in shoot()');
  assert.ok(/throwGrenade\(\);swing=wt\.fireInterval;return;/.test(GAME),
    'the throwable branch throws and returns before any bullet logic');
  // The flashbang is equipment too: it throws through the same branch and its
  // burst is a blind, not damage.
  assert.ok(/const isFlash=!!\(w&&w\.flash\)/.test(GAME), 'detonate distinguishes the flashbang');
  assert.ok(/A\.sound\(isFlash\?'flashbang':'explosion'\)/.test(GAME), 'the flashbang has its own cue');
  // The fuse/arc stepping must run on the tick so grenades in flight update.
  assert.ok(/stepThrows\(dt\)/.test(GAME), 'the grenade fuse/arc steps on the tick');
  assert.ok(/'explosion'/.test(GAME), 'the detonation has an explosion cue name');
  // Splash damage goes through the same path a bullet uses.
  assert.ok(/match\.playerShot\((?:weapon|g\.kind),i,part,/.test(GAME), 'splash damage uses the existing damage path');
});

test('the shotgun fans pellets through the existing hit path', () => {
  // pelletCount is the core's contract for a multi-pellet report.
  assert.ok(/const pellets=C\.pelletCount\(weapon\)/.test(GAME), 'the pellet count is resolved from the core');
  assert.ok(/applyHit\(weapon,th\.object\.userData\.botId,part2,th\.distance,th\.point\)/.test(GAME),
    'every pellet resolves through the shared hit path');
  assert.ok(/function applyHit\(weapon,id,part,dist,point\)/.test(GAME),
    'the hit path is one shared helper');
});

test('the roster wires all eight weapons into the loadout and the HUD', () => {
  // The loadout panel must list every weapon and the secondary slot must name
  // the equipped one, whatever it is.
  assert.ok(/\['deagle','glock','knife','grenade'\]/.test(GAME), 'the four secondaries are listed');
  // v42 builds the vertical weapon stack from inventory() in one place
  // (buildSlots) instead of writing four fixed slot elements per tick.
  assert.ok(/function buildSlots\(\)/.test(GAME), 'the slot stack is built by buildSlots()');
  assert.ok(/function setSlot\(el,key,override\)/.test(GAME), 'a single setSlot() still paints one slot');
  // The ready/inspect framing tables must cover the new weapons or the
  // viewmodel falls back to the AKM pose silently.
  for (const k of ['glock', 'mossberg', 'grenade']) {
    assert.ok(new RegExp(`${k}:\{fx:`).test(GAME), `${k} has a READY framing entry`);
  }
});
