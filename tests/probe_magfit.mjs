'use strict';
/* Mesh-precise seating: min distance from each magazine mesh to the nearest
   body mesh. A box union can report "touches" while the magazine visually
   hangs clear of the mag well, so this measures actual surface proximity. */
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

// Closest distance between two axis-aligned boxes (0 if they overlap).
const boxGap = (a, b) => {
  const dx = Math.max(a.min.x - b.max.x, b.min.x - a.max.x, 0);
  const dy = Math.max(a.min.y - b.max.y, b.min.y - a.max.y, 0);
  const dz = Math.max(a.min.z - b.max.z, b.min.z - a.max.z, 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

for (const k of ['akm', 'hecate', 'deagle', 'l96']) {
  const w = PolyAsset.weapon(k);
  w.updateMatrixWorld(true);
  const mag = w.userData.mag;
  if (!mag) { console.log(k + ': no magazine'); continue; }
  const inMag = new Set();
  mag.traverse(o => { if (o.isMesh) inMag.add(o); });
  const bodyMeshes = [];
  w.traverse(o => {
    if (!o.isMesh || !o.visible || inMag.has(o)) return;
    bodyMeshes.push({ o, box: new THREE.Box3().setFromObject(o) });
  });
  console.log('\n' + k + '  mag=' + mag.name + '  body meshes=' + bodyMeshes.length);
  const geom = new THREE.BoxGeometry(1, 1, 1);
  mag.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    const mb = new THREE.Box3().setFromObject(o);
    let best = Infinity, bestName = null;
    for (const b of bodyMeshes) {
      const g = boxGap(mb, b.box);
      if (g < best) { best = g; bestName = b.o.name; }
    }
    // Flag only the TOP of the magazine: that is the face that must meet the
    // mag well. Lower faces curve away on a banana mag by design.
    const flag = (mb.max.y < 0 ? '   ' : ' * ');
    console.log(flag + JSON.stringify({
      mesh: o.name, topY: +mb.max.y.toFixed(4),
      nearestBodyMesh: bestName, gap: +best.toFixed(5),
    }));
  });
  geom.dispose();
}
