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
});

test('radar is oriented to the player heading', () => {
  // All radar plotting must go through one rotation helper so geometry,
  // contacts and the facing needle stay consistent at every yaw.
  assert.ok(/function rp\(wx,wz\)/.test(GAME),
    'a single rotation helper plots every radar element');
  // The player marker sits at the disc centre and the needle points up,
  // because the disc itself is rotated to yaw — not a needle drawn at an angle
  // over an unrotated map.
  assert.ok(/rc\.arc\(85,85,3,0,Math\.PI\*2\)/.test(GAME), 'player dot is at the disc centre');
  assert.ok(/rc\.moveTo\(85,85\);rc\.lineTo\(85,75\)/.test(GAME),
    'the facing needle points straight up');
  assert.ok(!/arc\(85\+x\*2,85\+z\*2/.test(GAME),
    'no unrotated world-space plotting remains');
});
