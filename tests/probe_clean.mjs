'use strict';
/* Compare the clean Desktop base weapon GLBs against the in-repo copies and
   list every top-level pivot: name, mesh count, world bbox, and whether its
   long axis is vertical (a hung magazine) or not (a detached spare/round). */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const DESK = 'file:///C:/Users/xtr18/OneDrive/Desktop/my game/Guns/';
const PROJ = 'file:///C:/Users/xtr18/Projects/poly-strike/assets/models/';

const FILES = [
  'low-poly_akm.glb',
  'low-poly_desert_eagle_xix.glb',
  'low-poly_l96_a1_precision_marksman.glb',
  'low-poly_mosin_nagant_189130.glb',
  'low-poly_mx-8054.glb',
  'low-poly_pgm_hecate_ii.glb',
  'low-poly_fa-03_bayonet.glb',
];

const gltf = new GLTFLoader();
const load = (u) => new Promise((res, rej) => gltf.load(u, res, undefined, rej));

function meshCount(o) { let n = 0; o.traverse(x => { if (x.isMesh) n++; }); return n; }

function longAxis(o) {
  // world-space direction of the part's longest local axis
  const bb = new THREE.Box3().setFromObject(o);
  const s = new THREE.Vector3(); bb.getSize(s);
  if (s.lengthSq() < 1e-9) return null;
  const q = new THREE.Quaternion(); o.getWorldQuaternion(q);
  let li = 0;
  if (s.y >= s.x && s.y >= s.z) li = 1;
  else if (s.z >= s.x && s.z >= s.y) li = 2;
  const v = new THREE.Vector3(1, 0, 0).setComponent(li, 1);
  return { dir: v.applyQuaternion(q).round().toArray(), size: [+s.x.toFixed(3), +s.y.toFixed(3), +s.z.toFixed(3)] };
}

function dump(label, scene) {
  const rows = [];
  scene.traverse(o => {
    if (o.isMesh) return;               // only pivots/groups
    const mc = meshCount(o);
    if (mc === 0) return;               // skip structural empties
    const la = longAxis(o);
    const bb = new THREE.Box3().setFromObject(o);
    const c = new THREE.Vector3(); bb.getCenter(c);
    rows.push({
      name: o.name, meshes: mc,
      size: la ? la.size : null,
      long: la ? la.dir : null,
      centre: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)],
      childNames: o.children.map(c2 => c2.name).slice(0, 6),
    });
  });
  console.log('=== ' + label);
  for (const r of rows) console.log(JSON.stringify(r));
}

for (const f of FILES) {
  let a = null, b = null;
  try { a = await load(DESK + f); } catch (e) { console.log('=== ' + f + ' DESKTOP FAILED ' + e.message); }
  try { b = await load(PROJ + f); } catch (e) { console.log('=== ' + f + ' PROJECT FAILED ' + e.message); }
  if (a) { dump('DESKTOP ' + f, a.scene); }
  if (b) { dump('PROJECT ' + f, b.scene); }
  if (a && b) {
    // byte-identical? if not, the separation pass rewrote the repo copy
    const fa = await import('node:fs/promises').then(m => m.readFile('C:/Users/xtr18/OneDrive/Desktop/my game/Guns/' + f));
    const fb = await import('node:fs/promises').then(m => m.readFile('C:/Users/xtr18/Projects/poly-strike/assets/models/' + f));
    console.log('identical bytes:', fa.equals(fb), fa.length, fb.length);
  }
}
console.log('DONE');
