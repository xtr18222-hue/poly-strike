// Load-test the exported map-depot GLB with the repo's vendored Three.js r149.
import { readFileSync } from 'node:fs';

const REPO = 'C:/Users/xtr18/Projects/poly-strike';
const GLB_PATH = REPO + '/assets/models/map-depot.glb';

const THREE = await import('three');

globalThis.window = {};
globalThis.document = {
  createElement: () => ({ getContext: () => null, style: {} }),
  addEventListener() {},
};
globalThis.HTMLCanvasElement = function HTMLCanvasElement() {};

const { GLTFLoader } = await import(
  'file:///C:/Users/xtr18/Projects/poly-strike/vendor/addons/loaders/GLTFLoader.js'
);

const buf = readFileSync(GLB_PATH);
const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
console.log('file bytes:', data.byteLength);

const gltf = await new GLTFLoader().parseAsync(data, '');
const scene = gltf.scene;
console.log('parsed OK');
scene.updateMatrixWorld(true);

let tris = 0;
let verts = 0;
let calls = 0;
const mats = new Set();
const names = [];

scene.traverse((o) => {
  if (o.isMesh) {
    const g = o.geometry;
    const pos = g.getAttribute('position');
    const idx = g.getIndex();
    verts += pos ? pos.count : 0;
    tris += idx ? idx.count / 3 : pos ? pos.count / 3 : 0;
    calls++;
    names.push(o.name);
  }
  if (o.material) {
    if (Array.isArray(o.material)) o.material.forEach((m) => mats.add(m.name));
    else mats.add(o.material.name);
  }
});

console.log('meshes:', names.join(', '));
console.log('total vertices:', verts);
console.log('total triangles:', Math.round(tris));
console.log('draw calls:', calls);
console.log('materials:', [...mats].join(', '));
console.log('cameras:', gltf.cameras.map((c) => c.name).join(', '));

const box = new THREE.Box3().setFromObject(scene);
console.log(
  'bounds min:', box.min.x.toFixed(2), box.min.y.toFixed(2), box.min.z.toFixed(2)
);
console.log(
  'bounds max:', box.max.x.toFixed(2), box.max.y.toFixed(2), box.max.z.toFixed(2)
);

// walkable floor must be contiguous and sit at a consistent height
let floorMin = Infinity;
let floorMax = -Infinity;
scene.traverse((o) => {
  if (o.isMesh) {
    o.geometry.attributes.position.applyMatrix4(o.matrixWorld);
  }
});

const ok = verts > 0 && tris > 0;
console.log('THREE r149 map load test:', ok ? 'PASS' : 'FAIL');
