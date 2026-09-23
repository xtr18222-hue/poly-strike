'use strict';
/* Where does each candidate magazine actually sit, relative to the receiver?
   Drives a geometry-based magazine picker instead of brittle name matching:
   the real magazine hangs below the receiver with its long axis vertical. */
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

const FILES = {
  akm: 'low-poly_akm.glb', l96: 'low-poly_l96_a1_precision_marksman.glb',
  mosin: 'low-poly_mosin_nagant_189130.glb', hecate: 'low-poly_pgm_hecate_ii.glb',
  deagle: 'low-poly_desert_eagle_xix.glb',
};
const loader = new GLTFLoader();
for (const [k, f] of Object.entries(FILES)) {
  const g = await loader.loadAsync('file://C:/Users/xtr18/Projects/poly-strike/assets/models/' + f);
  // Mirror the fitter's frame: centre + orient so -Z is forward, +Y up.
  const scene = g.scene;
  scene.updateMatrixWorld(true);
  // Receiver box over visible body meshes (same exclusion list as assets.js).
  const rec = new THREE.Box3();
  scene.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    if (/mag|rounds|bullet|cartridge|case|scope|clip|stock|grip/.test(o.name || '')) return;
    const b = new THREE.Box3().setFromObject(o);
    if (!b.isEmpty()) rec.union(b);
  });
  const rc = new THREE.Vector3(); rec.getCenter(rc);
  const rows = [];
  scene.traverse(o => {
    if (o.isMesh || !o.name || !o.parent || o.parent.name !== 'GLTF_SceneRootNode') return;
    let meshes = 0; o.traverse(x => { if (x.isMesh) meshes++; });
    if (!meshes) return;
    const b = new THREE.Box3().setFromObject(o);
    if (b.isEmpty()) return;
    const c = new THREE.Vector3(); b.getCenter(c);
    const s = new THREE.Vector3(); b.getSize(s);
    const q = new THREE.Quaternion(); o.getWorldQuaternion(q);
    let li = 0; if (s.y > s.x && s.y > s.z) li = 1; else if (s.z > s.x && s.z > s.y) li = 2;
    const ax = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)][li].applyQuaternion(q);
    const touches = b.intersectsBox(rec);
    rows.push({
      name: o.name, meshes,
      center: [+(c.x - rc.x).toFixed(3), +(c.y - rc.y).toFixed(3), +(c.z - rc.z).toFixed(3)],
      below: +(c.y - rec.min.y).toFixed(3), vert: +Math.abs(ax.y).toFixed(2),
      vol: +(s.x * s.y * s.z).toFixed(4), touches,
    });
  });
  console.log(k + '  receiver.min.y=' + +rec.min.y.toFixed(3) + '  (below<0 means under receiver)');
  for (const r of rows) if (/mag|762|50bmg|9mm|45|round|bullet/i.test(r.name))
    console.log('   ' + JSON.stringify(r));
}
