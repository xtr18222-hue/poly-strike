import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// FBXLoader references `window`; Node needs the stub.
globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ getContext: () => null }), createElementNS: (ns, name) => fakeImg() };
function fakeImg(){ const o={ addEventListener(t,f){ if(t==='load') o._f=f; }, removeEventListener(){}, get width(){return 4}, get height(){return 4} }; setTimeout(()=>o._f && o._f.call(o),0); return o; }
globalThis.self = globalThis;
globalThis.Image = class { set src(v){} addEventListener(){} removeEventListener(){} get width(){return 4} get height(){return 4} };

const gltf = new GLTFLoader();
const fbx = new FBXLoader();

function boxOf(o) {
  const b = new THREE.Box3().setFromObject(o);
  if (b.isEmpty()) return 'empty';
  const s = new THREE.Vector3(); b.getSize(s);
  const c = new THREE.Vector3(); b.getCenter(c);
  return { size: [+s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2)], center: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)] };
}
function summarize(name, root, anims) {
  let meshes = 0, skinned = 0, bones = 0, mats = new Set();
  root.traverse(o => {
    if (o.isMesh) { meshes++; mats.add(o.material.name || '(unnamed)'); }
    if (o.isBone) bones++;
    if (o.isSkinnedMesh) skinned++;
  });
  console.log('---', name);
  console.log('  meshes', meshes, 'skinned', skinned, 'bones', bones, 'materials', [...mats].slice(0, 12));
  console.log('  bbox', boxOf(root));
  if (anims && anims.length) console.log('  animations', anims.map(a => a.name + ':' + a.duration.toFixed(2) + 's'));
  console.log('  children', root.children.slice(0, 14).map(c => c.name || c.type));
}

const MAP = 'file:///C:/Users/xtr18/OneDrive/Desktop/my game/';
const PROJ = 'file:///C:/Users/xtr18/Projects/poly-strike/assets/models/';

for (const [name, file, kind] of [
  ['Soldier GLB', PROJ + 'Soldier by madtrollstudio - UL46oXeZYK.glb', 'gltf'],
  ['Male Laying Pose', MAP + 'Male Laying Pose.fbx', 'fbx'],
  ['Running Slide', MAP + 'Running Slide.fbx', 'fbx'],
]) {
  try {
    const g = kind === 'gltf'
      ? await new Promise((res, rej) => gltf.load(file, res, undefined, rej))
      : await new Promise((res, rej) => fbx.load(file, res, undefined, rej));
    summarize(name, g.scene || g, g.animations);
  } catch (e) { console.log('---', name, 'FAILED', e.message); }
}
console.log('DONE');
