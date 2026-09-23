'use strict';
/* Definitive seating check in the FITTED frame using semantic PIVOT names
   (the clean exports keep pivot names like akm_receiver_3 while their meshes
   are generic Object_N). Measures the gap between the loaded magazine pivot
   and the receiver pivot, and flags any still-visible loose-round pivot. */
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

const V = new THREE.Vector3();
const boxOf = (o) => new THREE.Box3().setFromObject(o);
const gap = (a, b) => {
  const dx = Math.max(a.min.x - b.max.x, b.min.x - a.max.x, 0);
  const dy = Math.max(a.min.y - b.max.y, b.min.y - a.max.y, 0);
  const dz = Math.max(a.min.z - b.max.z, b.min.z - a.max.z, 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

for (const k of ['akm', 'hecate', 'deagle', 'l96', 'mosin']) {
  const w = PolyAsset.weapon(k);
  w.updateMatrixWorld(true);
  const pivots = [];
  w.traverse(o => {
    if (o.isMesh || !o.name || o.name.startsWith('weapon:') || o === w) return;
    let n = 0; o.traverse(x => { if (x.isMesh) n++; });
    if (n) pivots.push(o);
  });
  const mag = w.userData.mag;
  // The body is every visible mesh that is not inside the magazine pivot:
  // receiver, barrel, grip, stock and handguard are one solid assembly, so
  // their union is what the magazine must seat against.
  const inMag = new Set();
  if (mag) mag.traverse(o => { if (o.isMesh) inMag.add(o); });
  const body = new THREE.Box3();
  w.traverse(o => {
    if (!o.isMesh || !o.visible || inMag.has(o)) return;
    const b = new THREE.Box3().setFromObject(o);
    if (!b.isEmpty()) body.union(b);
  });
  console.log('\n' + k + '  body.y[' + +body.min.y.toFixed(4) + ',' + +body.max.y.toFixed(4) + ']  mag=' + (mag ? mag.name : 'null'));
  if (mag) {
    const mb = boxOf(mag);
    console.log('   mag.y[' + +mb.min.y.toFixed(4) + ',' + +mb.max.y.toFixed(4) + ']  GAP(body,mag)='
      + gap(body, mb).toFixed(5) + '  touches=' + body.intersectsBox(mb));
  }
  for (const p of pivots) {
    if (p === mag) continue;
    let vis = 0; p.traverse(x => { if (x.isMesh && x.visible) vis++; });
    if (!vis) continue;
    const g = gap(body, boxOf(p));
    if (g > 0.01) console.log('   FLOATING ' + p.name + ' gap=' + g.toFixed(4) + ' visible=' + vis);
  }
}
