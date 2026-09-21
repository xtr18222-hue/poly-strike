'use strict';
/* Scratch: report the structure of the new game assets (Node ESM). */
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const ASSETS = 'file:///C:/Users/xtr18/OneDrive/Desktop/my game/';
const PROJ = 'file:///C:/Users/xtr18/Projects/poly-strike/assets/models/';

function boxOf(o) {
  const b = new THREE.Box3().setFromObject(o);
  if (b.isEmpty()) return 'empty';
  const s = new THREE.Vector3(); b.getSize(s);
  const c = new THREE.Vector3(); b.getCenter(c);
  return { size: [+s.x.toFixed(3), +s.y.toFixed(3), +s.z.toFixed(3)], center: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)] };
}
function summarize(name, root, anims) {
  let meshes = 0, skinned = 0, bones = 0, mats = new Set();
  root.traverse(o => {
    if (o.isMesh) { meshes++; mats.add(o.material.name || '(unnamed)'); }
    if (o.isBone) bones++;
    if (o.isSkinnedMesh) skinned++;
  });
  console.log('---', name);
  console.log('  meshes', meshes, 'skinned', skinned, 'bones', bones, 'materials', [...mats].slice(0, 8));
  console.log('  bbox', boxOf(root));
  if (anims && anims.length) console.log('  animations', anims.map(a => a.name + ':' + a.duration.toFixed(2) + 's'));
}

const gltf = new GLTFLoader();
const fbx = new FBXLoader();
const files = [
  ['map Ga47MW6Mgr', ASSETS + 'fps_tps map by theking1322 - Ga47MW6Mgr.glb', 'gltf'],
  ['Male Laying Pose', ASSETS + 'Male Laying Pose.fbx', 'fbx'],
  ['Running Slide', ASSETS + 'Running Slide.fbx', 'fbx'],
];
for (const [name, file, kind] of files) {
  try {
    const g = kind === 'gltf'
      ? await new Promise((res, rej) => gltf.load(file, res, undefined, rej))
      : await new Promise((res, rej) => fbx.load(file, res, undefined, rej));
    summarize(name, g.scene || g, g.animations);
  } catch (e) { console.log('---', name, 'FAILED', e.message); }
}
for (const f of ['Soldier by madtrollstudio - UL46oXeZYK.glb', 'low-poly_akm.glb', 'fps-Fps Rig AKM.glb', 'fps-Rigged Glock.glb', 'low_polly_target_range.glb']) {
  try {
    const g = await new Promise((res, rej) => gltf.load(PROJ + f, res, undefined, rej));
    summarize('PROJECT ' + f, g.scene, g.animations);
  } catch (e) { console.log('--- PROJECT ' + f, 'FAILED', e.message); }
}
console.log('DONE');
