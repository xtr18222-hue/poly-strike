// Load-test the exported shooting-range GLB with the repo's vendored Three.js r149.
// Runs under Node with an import map pointing "three" at the vendored build.
import { readFileSync } from 'node:fs';

const REPO = 'C:/Users/xtr18/Projects/poly-strike';
const GLB_PATH = REPO + '/assets/models/shooting-range.glb';

const THREE = await import('three');

// minimal DOM stubs so GLTFLoader can run headless
globalThis.window = {};
globalThis.document = {
  createElement: () => ({ getContext: () => null, style: {} }),
  addEventListener() {},
};
globalThis.HTMLCanvasElement = function HTMLCanvasElement() {};

const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');

const buf = readFileSync(GLB_PATH);
const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
console.log('file bytes:', data.byteLength);

const loader = new GLTFLoader();
const gltf = await loader.parseAsync(data, '');

const scene = gltf.scene;
console.log('parsed OK');
console.log('root children:', scene.children.length);
// THREE r149 gives every instance its own Object3D; the mesh list below shows
// the merged-mesh children created per material group.
scene.updateMatrixWorld(true);

let totalTris = 0;
let totalVerts = 0;
let drawCalls = 0;
const mats = new Set();
const meshNames = [];

scene.traverse((o) => {
  if (o.isMesh) {
    const g = o.geometry;
    const pos = g.getAttribute('position');
    const idx = g.getIndex();
    totalVerts += pos ? pos.count : 0;
    totalTris += idx ? idx.count / 3 : pos ? pos.count / 3 : 0;
    drawCalls++;
    meshNames.push(o.name);
  }
  if (o.material) {
    if (Array.isArray(o.material)) o.material.forEach((m) => mats.add(m.name));
    else mats.add(o.material.name);
  }
});

console.log('meshes:', meshNames.join(', '));
console.log('total vertices:', totalVerts);
console.log('total triangles:', Math.round(totalTris));
console.log('draw calls:', drawCalls);
console.log('materials used:', [...mats].join(', '));
console.log('animations:', gltf.animations.map((a) => a.name).join(', '));
gltf.animations.forEach((a) => {
  console.log(`  ${a.name}: duration ${a.duration.toFixed(2)}s, ${a.tracks.length} tracks`);
});
console.log('cameras:', gltf.cameras.length, gltf.cameras.map((c) => c.name).join(', '));

const box = new THREE.Box3().setFromObject(scene);
console.log(
  'bounds min:',
  box.min.x.toFixed(2), box.min.y.toFixed(2), box.min.z.toFixed(2)
);
console.log(
  'bounds max:',
  box.max.x.toFixed(2), box.max.y.toFixed(2), box.max.z.toFixed(2)
);

// play one fall animation and confirm the target actually tips over.
// The root Target_N Object3D carries the node rotation (not the merged mesh
// children), so locate the root node directly.
const mixer = new THREE.AnimationMixer(scene);
const clip = THREE.AnimationClip.findByName(gltf.animations, 'TargetFall_3');
const action = mixer.clipAction(clip);
action.play();
mixer.setTime(0.0);    // standing
const up0 = new THREE.Vector3(0, 0, 1).applyQuaternion(
  scene.getObjectByName('Target_3').quaternion
);
console.log('  t=0.00s up:', up0.x.toFixed(2), up0.y.toFixed(2), up0.z.toFixed(2));

mixer.setTime(1.4);    // mid-fall (frame ~34 of 1..44)
const upMid = new THREE.Vector3(0, 0, 1).applyQuaternion(
  scene.getObjectByName('Target_3').quaternion
);
console.log('  t=1.40s up:', upMid.x.toFixed(2), upMid.y.toFixed(2), upMid.z.toFixed(2));

mixer.setTime(1.82);   // landed (frame ~44)
const t3 = scene.getObjectByName('Target_3');
const up = new THREE.Vector3(0, 0, 1).applyQuaternion(t3.quaternion);
console.log('Target_3 node found:', t3 ? t3.name : null);
console.log(
  'Target_3 up-vector when landed:',
  up.x.toFixed(2), up.y.toFixed(2), up.z.toFixed(2),
  '(should be tipped, not [0,0,1])'
);
const tipped = up.z < 0.9 && upMid.z < 1.0;
console.log('target tips over when hit:', tipped);
console.log('THREE r149 load test:', tipped ? 'PASS' : 'FAIL');
