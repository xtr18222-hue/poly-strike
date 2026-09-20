'use strict';
/* Fit probe: load each weapon GLB through assets.js and report the fitted
 * dimensions + muzzle position, so the scale table can be tuned against real
 * numbers instead of guesses. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import '../assets.js';

// The addon modules attach their classes to globalThis.THREE as an import side
// effect; PolyAsset looks them up there. The module namespace is frozen, so
// they cannot be assigned onto the import itself. SkeletonUtils exports `clone`
// directly rather than as a namespace.
globalThis.THREE = globalThis.THREE || {};
globalThis.THREE.GLTFLoader = GLTFLoader;
globalThis.THREE.FBXLoader = FBXLoader;
globalThis.THREE.SkeletonUtils = { clone: skeletonClone };

const out = { done: false, fits: {}, errors: [] };
window.__fitResult = out;

PolyAsset.bind(THREE);

(async () => {
  await PolyAsset.loadAll('../');
  for (const key of PolyAsset.WEAPON_KEYS) {
    const w = PolyAsset.weapon(key);
    if (!w) { out.fits[key] = { error: 'not loaded' }; continue; }
    const box = new THREE.Box3().setFromObject(w);
    const size = new THREE.Vector3();
    box.getSize(size);
    const mz = w.userData.muzzle ? w.userData.muzzle.position : null;
    out.fits[key] = {
      fit: w.userData.fit,
      dim: [+size.x.toFixed(4), +size.y.toFixed(4), +size.z.toFixed(4)],
      min: [+box.min.x.toFixed(4), +box.min.y.toFixed(4), +box.min.z.toFixed(4)],
      max: [+box.max.x.toFixed(4), +box.max.y.toFixed(4), +box.max.z.toFixed(4)],
      muzzle: mz ? [+mz.x.toFixed(4), +mz.y.toFixed(4), +mz.z.toFixed(4)] : null,
    };
    w.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
  const s = PolyAsset.soldier();
  if (s) {
    const box = new THREE.Box3().setFromObject(s);
    const size = new THREE.Vector3();
    box.getSize(size);
    out.soldier = { dim: [+size.x.toFixed(4), +size.y.toFixed(4), +size.z.toFixed(4)] };
  }
  out.progress = PolyAsset.progress();
  out.done = true;
  document.body.innerHTML = '<pre>' + JSON.stringify(out, null, 1) + '</pre>';
})().catch(e => {
  // A bare message is useless for a module-graph bug — keep the stack.
  out.errors.push(String(e && e.stack || e && e.message || e));
  out.done = true;
});
