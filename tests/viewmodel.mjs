'use strict';
/* First-person viewmodel regression tests: the fitted arm rig is the viewmodel
 * (arms + gun at the authored grip), the hands actually hold the fitted gun,
 * and the framing stays weapon-led so ADS still lands on the sight.
 *
 * assets.js is a browser IIFE; this drives it through the same shim the probe
 * scripts use, with real THREE r149 so the fit math is exercised exactly as it
 * is in the browser.
 *
 * Asset facts these tests are built on (verified by probe against the loaded
 * GLBs, not assumed):
 *  - `fps-Fps Rig AKM.glb` holds AKM_model with skinned arms (ArmModel) and
 *    clips Armature|Idle / Armature|Reload / Armature|Shoot. Hand bones are
 *    HandL and HandR001.
 *  - `fps-Rigged Glock.glb` has NO arm bones and NO clips (only the gun's own
 *    Slide/Trigger/Magazine/Barrel/SlideCatch nodes), so it cannot supply
 *    first-person hands. The Desert Eagle therefore keeps its weapon-only
 *    viewmodel. The Glock-with-arms rig is `fps-Fps Rig.glb` (Glock19). */
import './three-importmap.mjs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import test from 'node:test';
import assert from 'node:assert/strict';

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

test('viewmodel() resolves the fitted rig for a weapon that has one', () => {
  const vm = A.viewmodel('akm');
  assert.ok(vm, 'akm viewmodel resolves');
  assert.equal(vm.userData.isRig, true, 'the AKM viewmodel is its arm rig');
  assert.ok(vm.userData.weaponMesh, 'the rig viewmodel exposes its weapon mesh');
  assert.equal(vm.userData.weaponMesh.name, 'AKM_model', 'weapon mesh is the rig own gun');
  assert.ok(vm.userData.grip instanceof THREE.Vector3, 'grip offset recorded');
  assert.ok(A.isRigged('akm'), 'isRigged agrees');
});

test('viewmodel() falls back to the weapon alone when no usable rig exists', () => {
  // The Desert Eagle's rig file (`fps-Rigged Glock.glb`) has no arm bones and
  // no clips, so it is not a hands source and the weapon-only model is used.
  const vm = A.viewmodel('deagle');
  assert.ok(vm, 'deagle viewmodel resolves');
  assert.notEqual(vm.userData.isRig, true, 'no usable rig: weapon-only viewmodel');
  assert.equal(A.isRigged('deagle'), false, 'isRigged agrees');
  assert.ok(!vm.userData.weaponMesh, 'no weaponMesh field on a bare weapon');
  // L96 has no rig entry at all, so it must still resolve a plain weapon.
  const l96 = A.viewmodel('l96');
  assert.ok(l96, 'l96 viewmodel resolves');
  assert.notEqual(l96.userData.isRig, true, 'l96 is weapon-only');
});

test('the rig viewmodel clones independently', () => {
  const a = A.viewmodel('akm');
  const b = A.viewmodel('akm');
  a.position.x = 5;
  a.updateMatrixWorld(true); b.updateMatrixWorld(true);
  const ba = new THREE.Box3().setFromObject(a);
  const bb = new THREE.Box3().setFromObject(b);
  assert.notEqual(ba.min.x, bb.min.x, 'moving one clone does not move the other');
});

test('the rig viewmodel does not hold its hands off the gun', () => {
  const vm = A.viewmodel('akm');
  vm.position.set(0, 0, 0);
  vm.rotation.set(0, 0, 0);
  vm.updateMatrixWorld(true);
  const wmesh = vm.userData.weaponMesh;
  const wb = new THREE.Box3().setFromObject(wmesh);
  assert.ok(!wb.isEmpty(), 'weapon mesh has geometry');
  // The fitted gun runs along -Z (bore forward, sights up). Both hands must sit
  // ON the fitted gun: a hand floating clear of the receiver is the symptom the
  // rig integration exists to remove. 0.05m is roughly a finger's thickness, so
  // a hand at the edge of the receiver still counts as holding it.
  for (const bn of ['HandL', 'HandR001']) {
    const o = vm.getObjectByName(bn);
    assert.ok(o, `${bn} bone present`);
    const v = new THREE.Vector3(); o.getWorldPosition(v);
    const near = wb.clampPoint(v, new THREE.Vector3());
    const gap = v.distanceTo(near);
    assert.ok(gap < 0.05, `${bn} holds the fitted gun (gap ${gap.toFixed(3)}m < 0.05)`);
  }
});

test('the rig viewmodel keeps the fitted bore forward so ADS still works', () => {
  // The framing in game.js derives the ADS anchor and the inspect box from the
  // fitted frame, so a rig must leave the gun in the same fitted orientation as
  // the weapon-only viewmodel, not re-pose it.
  const rig = A.viewmodel('akm');
  const bare = A.viewmodel('deagle');
  for (const m of [rig, bare]) {
    m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.updateMatrixWorld(true);
  }
  const rg = new THREE.Box3().setFromObject(rig.userData.weaponMesh);
  const bg = new THREE.Box3().setFromObject(bare);
  // Bore forward = the box is far deeper in Z than wide in X, and sights up =
  // the box's +Y face is above the origin, not below.
  for (const [name, b] of [['rig', rg], ['bare', bg]]) {
    const span = b.max.clone().sub(b.min);
    assert.ok(span.z > span.x * 4, `${name}: bore runs along Z (z=${span.z.toFixed(3)}, x=${span.x.toFixed(3)})`);
    assert.ok(b.max.y > 0, `${name}: sights sit above the fitted origin (+Y)`);
    assert.ok(b.min.z < 0, `${name}: muzzle is forward of the fitted origin (-Z)`);
  }
});

test('the rig viewmodel carries its own idle/reload/shoot clips', () => {
  // The FPS pack names its clips `Armature|Idle` etc.; rigClip() must resolve
  // the bare name against the armature-prefixed one.
  const idle = A.rigClip('akm', 'idle');
  assert.ok(idle, 'akm idle clip resolves');
  assert.equal(idle.name, 'Armature|Idle', 'resolved the armature clip');
  assert.ok(A.rigClip('akm', 'reload'), 'akm reload clip resolves');
  assert.ok(A.rigClip('akm', 'shoot'), 'akm shoot clip resolves');
  assert.equal(A.rigClip('deagle', 'idle'), null, 'no clips on a weapon-only viewmodel');
  assert.equal(A.rigClip('l96', 'idle'), null, 'no rig entry for l96');
});

test('the rig viewmodel builds a mixer the viewmodel can drive', () => {
  const vm = A.viewmodel('akm');
  assert.ok(vm.userData.mixer, 'an AnimationMixer is created for the rig viewmodel');
  assert.ok(vm.userData.acts, 'clip actions are pre-created');
  assert.ok(vm.userData.acts.idle, 'idle action exists');
  assert.ok(vm.userData.acts.reload, 'reload action exists');
  assert.ok(vm.userData.acts.shoot, 'shoot action exists');
});

test('the rig viewmodel does not swallow the gun in arm geometry', () => {
  // If the arms covered the whole fitted gun the view would read as hidden hands
  // rather than a held weapon: the gun must extend forward of the arm box.
  const vm = A.viewmodel('akm');
  vm.position.set(0, 0, 0); vm.rotation.set(0, 0, 0); vm.updateMatrixWorld(true);
  const wb = new THREE.Box3().setFromObject(vm.userData.weaponMesh);
  const arms = vm.getObjectByName('ArmModel');
  assert.ok(arms, 'the arm mesh is present');
  const ab = new THREE.Box3().setFromObject(arms);
  assert.ok(wb.min.z < ab.min.z, 'the muzzle reaches forward of the arms');
  assert.ok(wb.intersectsBox(ab), 'the arms touch the gun (they hold it)');
});

test('the rig clips never drift the weapon off the camera frame', () => {
  // animateWeapon owns the viewmodel position, so a clip that moved the rig's
  // root would drag the gun off the camera frame. The clips animate only the
  // arm bones: running a full reload cycle must leave the fitted weapon box
  // exactly where it started.
  const vm = A.viewmodel('akm');
  vm.position.set(0, 0, 0); vm.rotation.set(0, 0, 0); vm.updateMatrixWorld(true);
  const wmesh = vm.userData.weaponMesh;
  const before = new THREE.Box3().setFromObject(wmesh);
  const posBefore = vm.position.clone();
  const mx = vm.userData.mixer, acts = vm.userData.acts;
  assert.ok(mx && acts, 'mixer and actions exist');
  // Cycle every state the game drives, over a full reload + several shots.
  acts.reload.reset(); acts.reload.play();
  for (let i = 0; i < 300; i++) mx.update(1 / 60);
  acts.reload.stop();
  acts.shoot.reset(); acts.shoot.play();
  for (let i = 0; i < 120; i++) mx.update(1 / 60);
  acts.shoot.stop();
  acts.idle.reset(); acts.idle.play();
  for (let i = 0; i < 240; i++) mx.update(1 / 60);
  vm.updateMatrixWorld(true);
  const after = new THREE.Box3().setFromObject(wmesh);
  const drift = after.min.clone().sub(before.min);
  const driftMax = new THREE.Box3().setFromObject(wmesh).max.clone().sub(before.max);
  assert.ok(drift.length() < 1e-3, `weapon box min did not drift (drift ${drift.length().toFixed(4)})`);
  assert.ok(driftMax.length() < 1e-3, `weapon box max did not drift (drift ${driftMax.length().toFixed(4)})`);
  assert.ok(vm.position.distanceTo(posBefore) < 1e-6, 'the rig root did not move');
});
