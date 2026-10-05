// Verify the three new FPS rigs load in three.js, report clip names, and
// confirm the arms' fitted size lands near the shipped AKM rig's.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const THREE = await import('three');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');

const RIG_LEN = { 'fps-l96': 1.18, 'fps-deagle': 0.27, 'fps-knife': 0.28 };

for (const name of Object.keys(RIG_LEN)) {
  const path = `C:/Users/xtr18/Projects/poly-strike/assets/models/${name}.glb`;
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const loader = new GLTFLoader();
  const g = await new Promise((res, rej) => loader.parse(ab, '', res, rej));
  const scene = g.scene;
  const clips = (g.animations || []).map(a => a.name);
  // weapon mesh: the OBJECT keeps its name; the mesh *data* block may be
  // renamed by the exporter, so look up by node name, not mesh name.
  const key = name.replace('fps-','');
  let gun = scene.getObjectByName(`${key}_model`);
  if (!gun) {
    for (const c of scene.children) {
      if (c.name === `${key}_model`) { gun = c; break; }
    }
  }
  if (!gun) { console.log(name, 'NO WEAPON MESH'); continue; }
  const box = new THREE.Box3().setFromObject(gun);
  const size = box.getSize(new THREE.Vector3());
  const long = Math.max(size.x, size.y, size.z);
  const fit = RIG_LEN[name] / long;
  // arms
  const arms = scene.getObjectByName('ArmModel');
  let armsLong = 0;
  if (arms) {
    const ab2 = new THREE.Box3().setFromObject(arms);
    const asz = ab2.getSize(new THREE.Vector3());
    armsLong = Math.max(asz.x, asz.y, asz.z) * fit;
  }
  console.log(`${name}: clips=${JSON.stringify(clips)}`);
  console.log(`   weapon world span=${size.x.toFixed(3)},${size.y.toFixed(3)},${size.z.toFixed(3)} long=${long.toFixed(3)} -> RIG_LEN=${RIG_LEN[name]}m, fit=${fit.toFixed(4)}`);
  console.log(`   ARMS after fit = ${armsLong.toFixed(3)} m (shipped AKM = 2.947 m)`);
  // bone names check for the grip markers the game's fitRig expects
  const arm = scene.getObjectByName('Armature');
  if (arm && arm.isBone !== undefined && arm.skeleton) {
    const bn = arm.skeleton.bones.map(b => b.name);
    console.log(`   has Hand.L: ${bn.includes('Hand.L')}  has Hand.R.001: ${bn.includes('Hand.R.001')}`);
  }
}
