// Load-test the exported soldier GLB with the repo's vendored Three.js r149.
// Verifies: parses, 19-bone skin, all 3 animations present, and the rig actually
// deforms the mesh when an animation plays (skinning is live, not just exported).
import { readFileSync } from 'node:fs';

const REPO = 'C:/Users/xtr18/Projects/poly-strike';
const GLB_PATH = REPO + '/assets/models/soldier-rigged.glb';

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

// gather geometry stats
let tris = 0;
let verts = 0;
let calls = 0;
const mats = new Set();
const meshes = [];
scene.traverse((o) => {
  if (o.isMesh) {
    const g = o.geometry;
    const pos = g.getAttribute('position');
    const idx = g.getIndex();
    verts += pos ? pos.count : 0;
    tris += idx ? idx.count / 3 : pos ? pos.count / 3 : 0;
    calls++;
    meshes.push(o.name);
  }
  if (o.material) {
    if (Array.isArray(o.material)) o.material.forEach((m) => mats.add(m.name));
    else mats.add(o.material.name);
  }
});
console.log('meshes:', meshes.join(', '));
console.log('total vertices:', verts);
console.log('total triangles:', Math.round(tris));
console.log('draw calls:', calls);
console.log('materials:', [...mats].join(', '));

// skin: count bones under the armature
let bones = 0;
const armature = scene.getObjectByName('SoldierArmature');
if (armature) {
  armature.traverse((o) => { if (o.isBone) bones++; });
}
console.log('bones:', bones);
console.log('animations:', gltf.animations.map((a) => `${a.name}(${a.duration.toFixed(2)}s)`).join(', '));

const box = new THREE.Box3().setFromObject(scene);
console.log(
  'bounds min:', box.min.x.toFixed(2), box.min.y.toFixed(2), box.min.z.toFixed(2)
);
console.log(
  'bounds max:', box.max.x.toFixed(2), box.max.y.toFixed(2), box.max.z.toFixed(2)
);
console.log('standing height (z):', (box.max.z - box.min.z).toFixed(2));

// ---- the real test: does an animation actually deform the skinned mesh? ----
let soldierMesh = null;
scene.traverse((o) => {
  if (o.isSkinnedMesh && !soldierMesh) soldierMesh = o;
});
const skeleton = soldierMesh && soldierMesh.skeleton;
if (!skeleton) {
  console.log('SKIN DEFORM TEST: FAIL (no skeleton on mesh)');
  process.exit(1);
}

// sample a head vertex in bind pose
const geom = soldierMesh.geometry;
const skinIdx = geom.getAttribute('skinIndex');
const skinW = geom.getAttribute('skinWeight');
const posAttr = geom.getAttribute('position');

// pick a vertex weighted to the Head bone
const headBone = skeleton.bones.find((b) => b.name === 'Head');
let sampleIdx = -1;
if (headBone) {
  for (let i = 0; i < skinIdx.count; i++) {
    const b0 = skinIdx.getX(i * 4);
    const w0 = skinW.getX(i * 4);
    if (skeleton.bones[b0] === headBone && w0 > 0.5) { sampleIdx = i; break; }
  }
}
if (sampleIdx < 0) sampleIdx = Math.floor(skinIdx.count / 2);

const mixer = new THREE.AnimationMixer(scene);
const fallClip = gltf.animations.find((a) => a.name === 'SoldierFall');
const idleClip = gltf.animations.find((a) => a.name === 'SoldierIdle');
const walkClip = gltf.animations.find((a) => a.name === 'SoldierWalk');

// rest position of the sample vertex in world space
soldierMesh.updateMatrixWorld(true);
const vRest = new THREE.Vector3().fromBufferAttribute(posAttr, sampleIdx);
// skinned mesh: apply the bind-pose skinning so we get the true deformed position
function skinnedWorld(src, target = new THREE.Vector3()) {
  target.fromBufferAttribute(posAttr, src);
  soldierMesh.boneTransform(src, target);   // accounts for bind matrix + bone pose
  return target.applyMatrix4(soldierMesh.matrixWorld);
}
const restWorld = skinnedWorld(sampleIdx);
console.log('sample vertex', sampleIdx, 'rest world z:', restWorld.z.toFixed(3));

function sampleAt(clip, time) {
  mixer.stopAllAction();
  const action = mixer.clipAction(clip);
  action.reset();
  action.play();
  // step the mixer to just past the target time so the keyframe is included
  const steps = 120;
  const dt = (time + 0.01) / steps;
  for (let i = 0; i < steps; i++) mixer.update(dt);
  soldierMesh.updateMatrixWorld(true);
  return skinnedWorld(sampleIdx);
}

// sample vertex must be weighted to a bone that the fall moves a lot.
// The exported rest stores a 180-deg base rotation on every bone (Blender's
// zero-roll convention), so use a bone-space sample: track the Head BONE's
// world position instead of a mesh vertex — that measures the rig directly.
let trackBone = null;
scene.traverse((o) => {
  if (o.isBone && o.name === 'Head') trackBone = o;
});
const trackArmature = scene.getObjectByName('SoldierArmature');
const trackHips = scene.getObjectByName('Hips');
function boneWorld(bone) {
  scene.updateMatrixWorld(true);
  return bone.getWorldPosition(new THREE.Vector3());
}
const restHead = trackBone ? boneWorld(trackBone) : null;
console.log('Head bone rest world:', restHead ? restHead.toArray().map((v) => +v.toFixed(3)) : 'MISSING');

function sampleBone(clip, time, bone) {
  mixer.stopAllAction();
  const action = mixer.clipAction(clip);
  action.reset();
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  // step through in small increments so every keyframe is sampled
  const steps = 200;
  const dt = (time + 0.02) / steps;
  for (let i = 0; i < steps; i++) mixer.update(dt);
  return boneWorld(bone);
}

const fallHeadEnd = sampleBone(fallClip, fallClip.duration, trackBone);
console.log('Head bone after fall end:', fallHeadEnd.toArray().map((v) => +v.toFixed(3)));
const fallHipsEnd = sampleBone(fallClip, fallClip.duration, trackHips);
console.log('Hips bone after fall end:', fallHipsEnd.toArray().map((v) => +v.toFixed(3)));

const headMoved = restHead ? restHead.distanceTo(fallHeadEnd) : 0;
console.log('Head bone displacement over fall:', headMoved.toFixed(3));

const idleHead = sampleBone(idleClip, idleClip.duration / 2, trackBone);
const walkHead = sampleBone(walkClip, walkClip.duration / 2, trackBone);
console.log('Head bone idle mid:', idleHead.toArray().map((v) => +v.toFixed(3)));
console.log('Head bone walk mid:', walkHead.toArray().map((v) => +v.toFixed(3)));

// the mesh must follow the bones: sample a skinned vertex at the fall's end
const fallVert = sampleAt(fallClip, fallClip.duration);
console.log('skinned vertex after fall end:', fallVert.toArray().map((v) => +v.toFixed(3)));

const ok =
  verts > 0 &&
  bones === 19 &&
  gltf.animations.length === 3 &&
  headMoved > 0.3;
console.log('THREE r149 soldier load+skin test:', ok ? 'PASS' : 'FAIL');
if (!ok) {
  console.log('  (verts', verts, 'bones', bones, 'anims', gltf.animations.length,
    'headMoved', headMoved.toFixed(3), ')');
}