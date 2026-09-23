'use strict';
/* Decide hide/keep for every top-level pivot on the CLEAN base models.
   Reports each pivot's world bbox, distance from the weapon body (the
   heaviest mesh), and whether it intersects the body. Needs a `self` shim
   because the Hecate GLB embeds a PNG texture. */
globalThis.self = globalThis;
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const PROJ = 'file:///C:/Users/xtr18/Projects/poly-strike/assets/models/';
const FILES = [
  'low-poly_akm.glb',
  'low-poly_desert_eagle_xix.glb',
  'low-poly_l96_a1_precision_marksman.glb',
  'low-poly_mosin_nagant_189130.glb',
  'low-poly_pgm_hecate_ii.glb',
  'low-poly_mx-8054.glb',
  'low-poly_fa-03_bayonet.glb',
];
const gltf = new GLTFLoader();
const load = (u) => new Promise((res, rej) => gltf.load(u, res, undefined, rej));

function meshCount(o) { let n = 0; o.traverse(x => { if (x.isMesh) n++; }); return n; }

for (const f of FILES) {
  let g;
  try { g = await load(PROJ + f); } catch (e) { console.log('=== ' + f + ' FAILED ' + e.message); continue; }
  const root = g.scene;
  // The body = the largest single mesh by volume (the receiver / stock block).
  let body = null, bodyVol = -1;
  root.traverse(o => {
    if (!o.isMesh) return;
    const b = new THREE.Box3().setFromObject(o);
    if (b.isEmpty()) return;
    const s = new THREE.Vector3(); b.getSize(s);
    const v = s.x * s.y * s.z;
    if (v > bodyVol) { bodyVol = v; body = o; }
  });
  const bodyBox = body ? new THREE.Box3().setFromObject(body) : null;
  console.log('=== ' + f + (body ? '  body=' + body.name + ' vol=' + bodyVol.toFixed(3) : '  no body'));
  const rows = [];
  root.traverse(o => {
    if (o.isMesh) return;
    if (meshCount(o) === 0) return;
    // Keep a pivot if it is a direct child of GLTF_SceneRootNode (the part level).
    if (!o.parent || o.parent.name !== 'GLTF_SceneRootNode') return;
    const b = new THREE.Box3().setFromObject(o);
    if (b.isEmpty()) return;
    const s = new THREE.Vector3(); b.getSize(s);
    const c = new THREE.Vector3(); b.getCenter(c);
    let d = 0, hits = false;
    if (bodyBox) {
      const cl = new THREE.Vector3().copy(c);
      cl.x = Math.max(bodyBox.min.x, Math.min(bodyBox.max.x, cl.x));
      cl.y = Math.max(bodyBox.min.y, Math.min(bodyBox.max.y, cl.y));
      cl.z = Math.max(bodyBox.min.z, Math.min(bodyBox.max.z, cl.z));
      d = c.distanceTo(cl);
      hits = d < 0.001 || b.intersectsBox(bodyBox);
    }
    rows.push({ name: o.name, meshes: meshCount(o), vol: +(s.x * s.y * s.z).toFixed(4), size: [+s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2)], centre: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)], dist: +d.toFixed(2), touching: hits });
  });
  rows.sort((a, b2) => b2.vol - a.vol);
  for (const r of rows) console.log(JSON.stringify(r));
}
console.log('DONE');
