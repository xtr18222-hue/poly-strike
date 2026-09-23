'use strict';
/* Dump the full pivot->mesh tree of one fitted weapon with per-mesh visibility
   and world Y, to see exactly which pivot the still-visible spare/bullets are. */
globalThis.self = globalThis;
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
const THREE_ANY = Object.assign(Object.create(THREE), {
  GLTFLoader, FBXLoader, SkeletonUtils: { clone: skeletonClone },
});
globalThis.THREE = THREE_ANY;
const fs = await import('node:fs');
const code = fs.readFileSync('C:/Users/xtr18/Projects/poly-strike/assets.js', 'utf8');
const sandbox = { THREE: THREE_ANY, console, setTimeout, clearTimeout, location: { pathname: '/index.html' } };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
const src = code.replace("})(typeof window !== 'undefined' ? window : globalThis);", '})(global);');
const PolyAsset = new Function('global', 'window', src + '\nreturn global.PolyAsset;')(sandbox, sandbox);
PolyAsset.bind(THREE_ANY);
await PolyAsset.loadAll('file://C:/Users/xtr18/Projects/poly-strike/');

const key = process.argv[2] || 'akm';
const w = PolyAsset.weapon(key);
w.updateMatrixWorld(true);
console.log(key + '  mag=' + (w.userData.mag ? w.userData.mag.name : 'null'));
// Body box excluding the magazine pivot's own meshes.
const inMag = new Set();
if (w.userData.mag) w.userData.mag.traverse(o => { if (o.isMesh) inMag.add(o); });
const body = new THREE.Box3();
w.traverse(o => {
  if (!o.isMesh || !o.visible || inMag.has(o)) return;
  const b = new THREE.Box3().setFromObject(o);
  if (!b.isEmpty()) body.union(b);
});
console.log('  body.y[' + +body.min.y.toFixed(3) + ',' + +body.max.y.toFixed(3) + ']');
w.traverse(o => {
  if (!o.isMesh) return;
  const cb = new THREE.Box3().setFromObject(o);
  if (cb.isEmpty()) return;
  const dy = Math.max(body.min.y - cb.max.y, cb.min.y - body.max.y, 0);
  const dx = Math.max(body.min.x - cb.max.x, cb.min.x - body.max.x, 0);
  // Only report parts that are below or clear of the body: magazine, spare,
  // loose rounds. Skip the receiver internals.
  if (dy < 0.004 && dx < 0.004) return;
  console.log('  ' + (o.visible ? 'V ' : 'H ') + o.name
    + (inMag.has(o) ? ' [MAG]' : '')
    + '  parent=' + (o.parent && o.parent.name)
    + '  y[' + +cb.min.y.toFixed(3) + ',' + +cb.max.y.toFixed(3) + ']'
    + '  dy=' + +dy.toFixed(3) + ' dx=' + +dx.toFixed(3));
});
