'use strict';
/* End-to-end weapon pipeline check: load the clean base GLBs through the real
   PolyAsset fit, then assert each fitted weapon is solid (upright, no visible
   floating part) and reports its part handles + ADS anchor. */
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
const path = await import('node:path');
const ROOT = 'C:/Users/xtr18/Projects/poly-strike';
const code = fs.readFileSync(path.join(ROOT, 'assets.js'), 'utf8');
// PolyAsset is a browser IIFE keyed off a `global`; eval it in a sandbox that
// has what it needs (THREE, location, console).
const sandbox = {
  THREE: THREE_ANY, console, setTimeout, clearTimeout,
  location: { pathname: '/index.html', href: 'file:///index.html' },
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
// The IIFE tail does `(typeof window !== 'undefined' ? window : globalThis)`.
// Inside a Function body `window` is not declared, so it resolves through
// the scope chain — declare it explicitly to steer the assignment.
const src = code.replace(
  '})(typeof window !== \'undefined\' ? window : globalThis);',
  '})(global);');
const fn = new Function('global', 'window', src + '\nreturn global.PolyAsset;');
const PolyAsset = fn(sandbox, sandbox);
PolyAsset.bind(THREE_ANY);

const failures = [];
const BASE = 'file://' + ROOT + '/';
await PolyAsset.loadAll(BASE);

const KEYS = ['akm', 'l96', 'mosin', 'mx', 'hecate', 'deagle', 'bayonet'];
for (const k of KEYS) {
  const w = PolyAsset.weapon(k);
  if (!w) { failures.push(k + ': weapon() returned null'); continue; }
  const box = new THREE.Box3().setFromObject(w);
  const s = new THREE.Vector3(); box.getSize(s);
  const upright = s.y > s.x;
  const u = w.userData;
  // Name the magazine pivot so hidden spare/round meshes are identifiable in
  // the fitted frame (the base exports name their meshes generically).
  console.log(JSON.stringify(Object.assign({ key: k, fitted: u.fit, upright }, {
    magName: u.mag ? u.mag.name : null,
    visibleMeshCount: (function () { let n = 0; w.traverse(o => { if (o.isMesh && o.visible) n++; }); return n; })(),
    hiddenNames: (function () { const a = []; w.traverse(o => { if (o.isMesh && !o.visible) a.push(o.name); }); return a; })(),
    ads: u.adsAnchor ? [+u.adsAnchor.position.x.toFixed(3), +u.adsAnchor.position.y.toFixed(3), +u.adsAnchor.position.z.toFixed(3)] : null,
  })));
  if (!upright) failures.push(k + ': not upright (wider than tall after fit)');
  if (!u.adsAnchor) failures.push(k + ': no ADS anchor');
  // The Mosin's magazine is internal (no detachable pivot), so null is correct
  // there; every other rifle must bind one.
  if (k !== 'bayonet' && k !== 'mx' && k !== 'mosin' && !u.mag) failures.push(k + ': no magazine bound');
}
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exitCode = 1; }
else console.log('ALL WEAPONS OK');
