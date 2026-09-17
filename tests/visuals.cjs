'use strict';
/* ============================================================================
 * Node tests for visuals.js (procedural Three.js visuals).
 * Run: node --test tests/visuals.cjs
 * Uses the vendored THREE r149 and a minimal global.window stub; asserts the
 * module contract, collider coverage, and finite geometry on every mesh.
 * ==========================================================================*/
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const THREE = require(path.join(ROOT, 'vendor', 'three.min.js'));
const CORE = require(path.join(ROOT, 'core.js'));

// The visuals module attaches to window.PolyVisual in the browser; give Node
// a window stub so the classic-IIFE module loads, then grab the export.
global.window = global.window || global;
const PolyVisual = require(path.join(ROOT, 'visuals.js'));

/* ------------------------------------------------------------- helpers --- */
function allMeshes(obj) {
  const out = [];
  obj.traverse(function (o) { if (o.isMesh) out.push(o); });
  return out;
}

// Every BufferGeometry position must be finite; also check object positions.
function assertFinite(obj, label) {
  if (obj.updateMatrixWorld) obj.updateMatrixWorld(true); // render-loop equivalent
  const meshes = allMeshes(obj);
  assert.ok(meshes.length > 0, label + ': has meshes');
  meshes.forEach(function (m, i) {
    const tag = label + ' mesh#' + i;
    assert.ok(m.geometry, tag + ': has geometry');
    const pos = m.geometry.getAttribute('position');
    assert.ok(pos, tag + ': has position attribute');
    for (let k = 0; k < pos.array.length; k++) {
      if (!Number.isFinite(pos.array[k])) {
        assert.fail(tag + ': non-finite vertex component at [' + k + '] = ' + pos.array[k]);
      }
    }
    for (const [name, attr] of Object.entries(m.geometry.attributes)) {
      for (const value of attr.array) assert.ok(Number.isFinite(value), tag + ': finite ' + name);
    }
    m.updateWorldMatrix(true, false);
    for (const value of m.matrixWorld.elements) assert.ok(Number.isFinite(value), tag + ': finite transform');
    const p = m.position;
    for (const c of ['x', 'y', 'z']) {
      assert.ok(Number.isFinite(p[c]), tag + ': finite position.' + c);
    }
  });
  return meshes;
}

function fakeScene() {
  const scene = new THREE.Scene();
  return scene;
}

/* ------------------------------------------------------------------ API -- */
test('PolyVisual exposes the agreed contract', function () {
  assert.equal(typeof PolyVisual.buildArena, 'function', 'buildArena');
  assert.equal(typeof PolyVisual.buildBot, 'function', 'buildBot');
  assert.equal(typeof PolyVisual.buildWeapon, 'function', 'buildWeapon');
  assert.equal(global.window.PolyVisual, PolyVisual, 'classic window attachment');
});

test('buildWeapon rejects unknown keys', function () {
  for (const key of ['nope', 'constructor', 'toString', '__proto__']) {
    assert.throws(function () { PolyVisual.buildWeapon(THREE, key); }, /unknown weapon/);
  }
});

/* --------------------------------------------------------------- ARENA -- */
test('buildArena: builds colliders for every MAP solid + 4 perimeter walls', function () {
  const scene = new THREE.Scene();
  const res = PolyVisual.buildArena(THREE, scene, CORE);
  assert.ok(Array.isArray(res.hitMeshes), 'hitMeshes is an array');
  // one hit mesh per MAP solid
  assert.equal(res.hitMeshes.length, CORE.MAP.solids.length + 4,
    'one collider per solid (' + CORE.MAP.solids.length + ') + 4 perimeter, got ' + res.hitMeshes.length);
  // each collider is a Mesh with a solid record and finite geometry
  res.hitMeshes.forEach(function (m, i) {
    assert.ok(m.isMesh, 'hitMesh#' + i + ' is a Mesh');
    const s = m.userData.solid;
    assert.ok(s && typeof s.x === 'number' && s.w > 0 && s.d > 0 && s.h > 0,
      'hitMesh#' + i + ' carries solid dims');
  });
  // every MAP solid is represented at the right XZ center
  for (const s of CORE.MAP.solids) {
    const found = res.hitMeshes.some(function (m) {
      const u = m.userData.solid;
      return Math.abs(u.x - s.x) < 1e-6 && Math.abs(u.z - s.z) < 1e-6 &&
        Math.abs(u.w - s.w) < 1e-6 && Math.abs(u.d - s.d) < 1e-6;
    });
    assert.ok(found, 'collider exists for solid at (' + s.x + ',' + s.z + ')');
  }
});

test('buildArena: arena raycaster actually hits the mid building + perimeter', function () {
  const scene = new THREE.Scene();
  const res = PolyVisual.buildArena(THREE, scene, CORE);
  scene.updateMatrixWorld(true); // what the renderer does each frame
  const rc = new THREE.Raycaster();
  // vertical ray through the mid building center must hit its collider
  const mid = CORE.MAP.solids[0];
  rc.set(new THREE.Vector3(mid.x, 50, mid.z), new THREE.Vector3(0, -1, 0));
  let hits = rc.intersectObjects(res.hitMeshes, false);
  assert.ok(hits.length > 0, 'downward ray hits mid building collider');
  assert.ok(hits[0].point.y <= mid.h + 1e-6 && hits[0].point.y >= -0.01, 'hit on top face');
  // horizontal ray at chest height toward the north perimeter wall
  rc.set(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, 0, -1));
  hits = rc.intersectObjects(res.hitMeshes, false);
  assert.ok(hits.length > 0, 'northward ray hits perimeter wall');
  assert.ok(hits[0].point.z <= -37, 'perimeter hit beyond playfield edge (z=' + hits[0].point.z.toFixed(2) + ')');
});

test('buildArena: merged environment budget, presets and disposal', function () {
  for (const theme of ['desert','industrial','urban']) {
    const counts=[];
    for (const preset of ['performance','medium','high']) {
      const scene=new THREE.Scene(), map=JSON.parse(JSON.stringify(CORE.MAP)); map.theme=theme;
      const before=JSON.stringify(map), res=PolyVisual.buildArena(THREE,scene,{MAP:map},preset);
      const meshes=allMeshes(scene).filter(m=>m.visible);
      assert.ok(meshes.length<40, 'environment <40 draws');
      assert.equal(res.stats.drawCalls,meshes.length);
      counts.push(res.stats.triangles);
      for(const m of meshes) {
        assert.ok(preset==='performance'?m.material.isMeshBasicMaterial:m.material.isMeshLambertMaterial);
        assert.equal(m.material.map,null);
      }
      for(const m of res.hitMeshes) {
        assert.equal(m.visible,false);
        const s=m.userData.solid, b=new THREE.Box3().setFromObject(m);
        assert.ok(Math.abs(b.max.y-s.h)<1e-5);
        assert.ok(Math.abs(b.min.x-(s.x-s.w/2))<1e-5);
        assert.ok(Math.abs(b.max.z-(s.z+s.d/2))<1e-5);
        const ray=new THREE.Raycaster(new THREE.Vector3(s.x,50,s.z),new THREE.Vector3(0,-1,0));
        assert.ok(ray.intersectObject(m,false).length);
      }
      assert.equal(JSON.stringify(map),before);
      assertFinite(scene,theme+'/'+preset);
      const resources=new Set(); allMeshes(res.root).forEach(m=>{resources.add(m.geometry);resources.add(m.material);});
      let disposals=0; resources.forEach(r=>r.addEventListener('dispose',()=>disposals++));
      res.dispose();res.dispose();assert.equal(disposals,resources.size);assert.equal(res.root.parent,null);
    }
    assert.ok(counts[0]<counts[1]&&counts[1]<counts[2]);
  }
});

test('arena: merged cargo details and clouds never add playable obstacles', function () {
  for(const id of ['desert','industrial','urban'])for(const preset of ['performance','medium','high']) {
    const C=CORE.forMap(id),scene=new THREE.Scene(),a=PolyVisual.buildArena(THREE,scene,C,preset);
    const decor=a.root.getObjectByName('batch-decor'),cloud=a.root.getObjectByName('batch-cloud');
    if(preset==='performance'){assert.ok(!decor&&!cloud);a.dispose();continue;}
    assert.ok(decor&&cloud,'one merged batch each for cargo details and clouds');
    assert.equal(decor.material.polygonOffset,true,'flush wall accents avoid z-fighting');
    assert.ok(decor.material.polygonOffsetFactor<0);
    const p=decor.geometry.attributes.position;
    for(let i=0;i<p.count;i++)assert.ok(C.MAP.solids.some(s=>Math.abs(p.getX(i)-s.x)<=s.w/2+.001&&Math.abs(p.getZ(i)-s.z)<=s.d/2+.001),'detail stays inside solid footprint');
    const cp=cloud.geometry.attributes.position;assert.ok(cp.count/3<=600,'lightweight clouds');
    for(let i=0;i<cp.count;i++)assert.ok(Math.abs(cp.getX(i))>C.MAP.bounds.hx||Math.abs(cp.getZ(i))>C.MAP.bounds.hz,'clouds outside bounds');
    for(let i=0;i<5;i++)scene.add(PolyVisual.buildBot(THREE,i));
    for(const key of PolyVisual.WEAPON_KEYS){const w=PolyVisual.buildWeapon(THREE,key);scene.add(w);assert.ok(allMeshes(scene).filter(m=>m.visible).length<180);scene.remove(w);}
    a.dispose();
  }
});

test('arena: copied source disposal never releases live raycast geometry', function () {
  const original=THREE.BufferGeometry.prototype.dispose, disposed=new Set();
  THREE.BufferGeometry.prototype.dispose=function(){disposed.add(this);original.call(this);};
  let arena;
  try {arena=PolyVisual.buildArena(THREE,new THREE.Scene(),CORE,'medium');}
  finally {THREE.BufferGeometry.prototype.dispose=original;}
  assert.ok(disposed.size>30);
  for(const mesh of arena.hitMeshes)assert.ok(!disposed.has(mesh.geometry));
  arena.dispose();
});

test('arena: actual map contexts retain every collider and fit total scene budget', function () {
  for(const id of ['desert','industrial','urban']) {
    const C=CORE.forMap(id),scene=new THREE.Scene(),arena=PolyVisual.buildArena(THREE,scene,C,'performance');
    assert.equal(arena.hitMeshes.length,C.MAP.solids.length+4);
    for(let i=0;i<5;i++)scene.add(PolyVisual.buildBot(THREE,i));
    scene.add(PolyVisual.buildWeapon(THREE,'awp'));
    assert.ok(allMeshes(scene).filter(m=>m.visible).length<180);
    arena.dispose();
  }
});

test('weapons: no crimson overlays', function () {
  for (const key of PolyVisual.WEAPON_KEYS) {
    const meshes=allMeshes(PolyVisual.buildWeapon(THREE,key));
    assert.ok(!meshes.some(m=>m.name==='skin-inlay'));
    assert.ok(!meshes.some(m=>[0xc51632,0xff3851,0xb01426].includes(m.material.color.getHex())));
  }
});

test('bots: faceted helmet and plated silhouette', function () {
  const bot=PolyVisual.buildBot(THREE,3);
  assert.ok(bot.getObjectByName('helmet-shell'));
  assert.ok(bot.getObjectByName('plate-carrier'));
});

test('buildArena: all geometry finite, no DOM needed (canvas fallback)', function () {
  // no document global is defined here, so canvas textures must be skipped
  const scene = new THREE.Scene();
  const res = PolyVisual.buildArena(THREE, scene, CORE);
  assertFinite(scene, 'arena');
  assert.ok(res.hitMeshes.every(function (m) { return m.isMesh; }), 'all hitMeshes are Meshes');
});

test('buildArena: merged floor below zero and geometric site markers', function () {
  const scene=new THREE.Scene(),res=PolyVisual.buildArena(THREE,scene,CORE);
  assert.ok(new THREE.Box3().setFromObject(res.root.getObjectByName('arena-floor')).max.y<=.001);
  for(const letter of ['A','B'])assert.ok(res.root.getObjectByName('site-'+letter));
});

/* ----------------------------------------------------------------- BOT -- */
test('buildBot: group with botId, tagged head/body/legs meshes, legs pivot', function () {
  for (const id of [0, 3]) {
    const bot = PolyVisual.buildBot(THREE, id);
    assert.ok(bot.isObject3D, 'bot ' + id + ' is an Object3D/Group');
    assert.equal(bot.userData.botId, id);
    const meshes = allMeshes(bot);
    assert.ok(meshes.length >= 10, 'bot has detailed meshes');
    const parts = { head: 0, body: 0, legs: 0 };
    meshes.forEach(function (m) {
      assert.equal(m.userData.botId, id, 'every mesh carries botId');
      const p = m.userData.part;
      assert.ok(p === 'head' || p === 'body' || p === 'legs', 'part tag valid: ' + p);
      parts[p]++;
    });
    assert.ok(parts.head > 0, 'has head meshes');
    assert.ok(parts.body > 0, 'has body meshes');
    assert.ok(parts.legs > 0, 'has legs meshes');
    // legs pivot group is registered and contains the leg meshes
    const legs = bot.userData.legs;
    assert.ok(legs && legs.isObject3D, 'userData.legs is a pivot Object3D');
    const legMeshes = allMeshes(legs);
    assert.ok(legMeshes.length >= 6, 'legs pivot contains leg meshes');
    // bot is ~1.8m tall, feet at y=0
    const bb = new THREE.Box3().setFromObject(bot);
    assert.ok(bb.max.y > 1.6 && bb.max.y < 2.1, 'bot height ~1.8m (got ' + bb.max.y.toFixed(2) + ')');
    assert.ok(bb.min.y > -0.05, 'feet at ground level');
    // head hitbox is near the top
    const heads = meshes.filter(function (m) { return m.userData.part === 'head'; });
    let maxY = -Infinity;
    heads.forEach(function (m) {
      m.updateWorldMatrix(true, false);
      const b = new THREE.Box3().setFromObject(m);
      maxY = Math.max(maxY, b.max.y);
    });
    assert.ok(maxY > 1.7, 'head meshes near top of the rig');
    assertFinite(bot, 'bot ' + id);
  }
});

test('bots: chamfered armor, boots and visor keep the original draw budget', function () {
  const bot=PolyVisual.buildBot(THREE,1);
  for(const name of ['plate-carrier','boot-left','boot-right','visor']) {
    const m=bot.getObjectByName(name);assert.ok(m,name);
    const n=m.geometry.attributes.normal;let angled=false;
    for(let i=0;i<n.count;i++)if(Math.abs(n.getX(i))>.1&&Math.abs(n.getY(i))>.1)angled=true;
    assert.ok(angled,name+' has bevel normals');
  }
  assert.ok(allMeshes(bot).length<=24);
});

test('buildBot: two bots are independent groups', function () {
  const a = PolyVisual.buildBot(THREE, 1);
  const b = PolyVisual.buildBot(THREE, 1);
  assert.notEqual(a, b, 'distinct instances');
  assert.equal(a.userData.botId, b.userData.botId, 'same botId');
  b.position.set(5, 0, 5);
  assert.equal(a.position.x, 0, 'moving one does not move the other');
});

/* -------------------------------------------------------------- WEAPONS -- */
function weaponCommon(key, expectLen, userDataKeys) {
  return function () {
    const w = PolyVisual.buildWeapon(THREE, key);
    assert.ok(w.isObject3D, key + ': returns a Group');
    assert.equal(w.userData.key, key);
    for (const k of userDataKeys) {
      assert.ok(w.userData[k], key + ': userData.' + k + ' present');
    }
    // muzzle must be a bare Object3D anchored down -Z (barrel tip)
    if (userDataKeys.includes('muzzle')) {
      const mz = w.userData.muzzle;
      assert.ok(mz && mz.isObject3D, 'muzzle is an Object3D');
      assert.ok(!(muzIsMesh(mz)), 'muzzle is not a Mesh');
      assert.ok(mz.position.z < 0, 'muzzle sits down -Z (z=' + mz.position.z + ')');
    }
    // size envelope
    const bb = new THREE.Box3().setFromObject(w);
    const len = bb.max.z - bb.min.z;
    assert.ok(Math.abs(len - expectLen) < 0.35,
      key + ': length ~' + expectLen + 'm (got ' + len.toFixed(2) + ')');
    assert.ok(bb.max.x - bb.min.x < 0.4, key + ': narrow profile');
    // all geometry finite
    assertFinite(w, key);
    // pivots are functional: rotating them keeps the group consistent
    if (w.userData.mag) { w.userData.mag.rotation.x = 1.2; w.userData.mag.rotation.x = 0; }
    if (w.userData.bolt) { w.userData.bolt.position.z += 0.05; w.userData.bolt.position.z -= 0.05; }
  };
}
function muzIsMesh(o) { return o.isMesh === true; }

test('buildWeapon ak47: ~1m rifle, mag/bolt/muzzle pivots, -Z firing', weaponCommon('ak47', 1.0, ['mag', 'bolt', 'muzzle']));
test('buildWeapon awp: ~1.2m sniper, mag/bolt/muzzle + 3D scope', function () {
  const w = PolyVisual.buildWeapon(THREE, 'awp');
  for (const k of ['mag', 'bolt', 'scope', 'muzzle']) assert.ok(w.userData[k], 'awp userData.' + k);
  const bb = new THREE.Box3().setFromObject(w);
  const len = bb.max.z - bb.min.z;
  assert.ok(len > 0.95 && len < 1.45, 'awp length ~1.2m (got ' + len.toFixed(2) + ')');
  // 3D scope: cylinders (tube/bells/rings) + lens discs, above the receiver
  const scopeMeshes = allMeshes(w.userData.scope);
  assert.ok(scopeMeshes.length >= 8, 'scope is detailed (got ' + scopeMeshes.length + ' meshes)');
  const cyls = scopeMeshes.filter(function (m) { return m.geometry.type === 'CylinderGeometry'; });
  const discs = scopeMeshes.filter(function (m) { return m.geometry.type === 'CircleGeometry'; });
  assert.ok(cyls.length >= 5, 'scope tubes/rings are 3D cylinders');
  assert.ok(discs.length >= 2, 'scope has objective + ocular lenses');
  assert.ok(w.userData.scope.position.y > 0.08, 'scope mounted above bore');
  // lens faces forward: rotated to look down -Z
  const lens = discs[0];
  assert.ok(Math.abs(Math.abs(lens.rotation.y) - Math.PI) < 1e-6 || Math.abs(lens.rotation.y) < 1e-6,
    'lens disc oriented along the barrel axis');
  assertFinite(w, 'awp');
});
test('buildWeapon deagle: ~0.5m pistol, slide+mag+muzzle', weaponCommon('deagle', 0.5, ['mag', 'bolt', 'muzzle']));
test('buildWeapon knife: ~0.5m butterfly, pivoted handles + blade', function () {
  const w = PolyVisual.buildWeapon(THREE, 'knife');
  for (const k of ['blade', 'handleA', 'handleB']) assert.ok(w.userData[k], 'knife userData.' + k);
  const bb = new THREE.Box3().setFromObject(w);
  const len = Math.max(bb.max.z - bb.min.z, bb.max.x - bb.min.x, bb.max.y - bb.min.y);
  assert.ok(len > 0.2 && len < 0.7, 'knife overall ~0.5m scale (got ' + len.toFixed(2) + ')');
  // blade points down -Z: its bounding box extends forward, handles backward
  const bladeBB = new THREE.Box3().setFromObject(w.userData.blade);
  assert.ok(bladeBB.max.z < 0.05 && bladeBB.min.z < -0.15, 'blade extends down -Z');
  // butterfly pivots: rotating a handle about X swings it out of the blade plane
  for (const h of [w.userData.handleA, w.userData.handleB]) {
    const before = h.rotation.x;
    h.rotation.x = Math.PI / 2;      // half flip around the pivot pin
    h.updateWorldMatrix(true, false);
    const swung = new THREE.Box3().setFromObject(h);
    assert.ok(swung.max.y - swung.min.y > 0.1,
      'handle swings out of the blade plane (span=' + (swung.max.y - swung.min.y).toFixed(3) + ')');
    h.rotation.x = before;
  }
  // blade pivot group can swing
  w.userData.blade.rotation.x = 0.8;
  w.userData.blade.rotation.x = 0;
  assertFinite(w, 'knife');
});

test('knife: continuous tapered blade and machined handle channels', function () {
  const w=PolyVisual.buildWeapon(THREE,'knife'),blade=w.userData.blade;
  const steel=blade.getObjectByName('knife-blade');assert.ok(steel);
  const p=steel.geometry.attributes.position;
  const tip=[],heel=[];for(let i=0;i<p.count;i++){if(p.getZ(i)<-.2)tip.push(Math.abs(p.getX(i)));if(p.getZ(i)>-.04)heel.push(Math.abs(p.getX(i)));}
  assert.ok(tip.length&&heel.length&&Math.max(...tip)<Math.max(...heel));
  const n=steel.geometry.attributes.normal;
  for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i))>.002)assert.ok(p.getY(i)*n.getY(i)>0,'blade faces outward');
  assert.ok(!allMeshes(blade).some(m=>m.geometry.type==='ConeGeometry'));
  for(const h of [w.userData.handleA,w.userData.handleB])assert.ok(h.getObjectByName('handle-channel'));
  assert.ok(allMeshes(w).length<=20);assertFinite(w,'clean knife');
});

test('weapons: all four keys build and are distinct', function () {
  const keys = ['ak47', 'awp', 'deagle', 'knife'];
  const built = keys.map(function (k) { return PolyVisual.buildWeapon(THREE, k); });
  built.forEach(function (w, i) { assert.equal(w.userData.kind, keys[i]); });
  assert.notEqual(built[0].uuid, built[1].uuid);
});

test('weapons: muzzle is at the visual barrel tip (beyond every other -Z mesh)', function () {
  for (const key of ['ak47', 'awp', 'deagle']) {
    const w = PolyVisual.buildWeapon(THREE, key);
    const mz = w.userData.muzzle;
    // setFromObject(mesh) updates the mesh but not its ancestor pivot;
    // update the full hierarchy before measuring scaled child meshes.
    w.updateMatrixWorld(true);
    // no weapon mesh should extend beyond the muzzle along -Z (tip anchoring)
    let minZ = Infinity;
    allMeshes(w).forEach(function (m) {
      const b = new THREE.Box3().setFromObject(m);
      minZ = Math.min(minZ, b.min.z);
    });
    assert.ok(Math.abs(mz.position.z - minZ) <= 0.02,
      key + ': muzzle near/behind the furthest barrel mesh (muzzle z=' + mz.position.z.toFixed(3) + ', min mesh z=' + minZ.toFixed(3) + ')');
  }
});

test('weapons: iron sights exist on the long guns', function () {
  for (const key of ['ak47', 'awp', 'deagle']) {
    const w = PolyVisual.buildWeapon(THREE, key);
    const sights = [];
    w.traverse(function (o) { if (o.userData && o.userData.sight) sights.push(o.userData.sight); });
    assert.ok(sights.includes('front') && sights.includes('rear'), key + ': front + rear sights tagged');
  }
});

test('weapons: exposed glove groups can be detached for independent spins', function () {
  for(const key of PolyVisual.WEAPON_KEYS) {
    const w=PolyVisual.buildWeapon(THREE,key), hands=w.userData.hands;
    assert.ok(Array.isArray(hands),key+' exposes hands');
    assert.equal(hands.length,key==='knife'?1:2);
    const scene=new THREE.Scene();scene.add(w);w.position.set(.32,-.3,-.65);
    scene.updateMatrixWorld(true);
    const positions=hands.map(h=>{assert.equal(h.parent,w);assert.ok(h.isGroup);return h.getWorldPosition(new THREE.Vector3());});
    hands.forEach(h=>scene.attach(h));w.rotation.set(1,2,3);scene.updateMatrixWorld(true);
    hands.forEach((h,i)=>assert.ok(h.getWorldPosition(new THREE.Vector3()).distanceTo(positions[i])<1e-9));
  }
});

test('deagle: beveled slab slide, barrel shelf, raked grip, sight posts', function () {
  for (const preset of ['performance', 'medium', 'high']) {
    const w = PolyVisual.buildWeapon(THREE, 'deagle', preset);
    const bb = new THREE.Box3().setFromObject(w);
    const bevels = [];
    w.traverse(o => { if (o.isMesh && o.geometry.type === 'BevelledBoxGeometry') bevels.push(o.geometry); });
    assert.ok(bevels.length >= 6, preset + ': bevelled prisms on slide/frame/grip/sights (got ' + bevels.length + ')');
    // grip: bevelled and raked back, clearly narrower than the old 0.034 slab
    const grip = bevels.find(b => b.userData.part === 'grip');
    assert.ok(grip, 'grip is a bevelled prism');
    assert.ok(grip.userData.width < 0.032, 'grip slimmer: ' + grip.userData.width.toFixed(4));
    assert.ok(Math.abs(grip.userData.rake - 0.32) < 1e-9, 'grip rake 0.32 rad');
    // barrel shelf under the slide, barrel nose flush with slide front
    const barrel = bevels.find(b => b.userData.part === 'barrel');
    assert.ok(barrel, 'hexagonal barrel under the slide');
    assert.ok(Math.abs(w.userData.muzzle.position.z-(-.18*1.4))<1e-9,'original muzzle anchor preserved');
    assert.ok(Math.abs(w.userData.muzzle.position.y-.03*1.4)<1e-9,'original bore height preserved');
    const barrelBounds=new THREE.Box3().setFromObject(w.getObjectByName('deagle-barrel'));
    assert.ok(Math.abs(barrelBounds.min.z-w.userData.muzzle.position.z)<.002,'barrel reaches muzzle');
    const normals=w.userData.bolt.children[0].geometry.attributes.normal;
    assert.ok(Array.from({length:normals.count},(_,i)=>Math.abs(normals.getX(i))>.1&&Math.abs(normals.getY(i))>.1).some(Boolean),'real chamfer normals');
    // slide must still be its own group (bolt-recoil pivot) with a bevelled slab
    assert.ok(w.userData.bolt && w.userData.bolt.isGroup && w.userData.bolt.type === 'Group');
    assert.ok(w.userData.bolt.children.some(c => c.geometry && c.geometry.type === 'BevelledBoxGeometry'));
    // sight posts stay tiny bevelled nubs tagged front/rear
    const sights = [];
    w.traverse(o => { if (o.userData && o.userData.sight) sights.push(o.userData.sight); });
    assert.ok(sights.includes('front') && sights.includes('rear'), 'front + rear sight posts');
    assert.ok(bb.max.z-bb.min.z<.65,'compact pistol envelope');
    const sightMeshes = [];
    w.traverse(o => { if (o.isMesh && o.userData.sight) sightMeshes.push(o.geometry); });
    assert.ok(sightMeshes.length === 2 && sightMeshes.every(g => g.type === 'BevelledBoxGeometry'), 'two bevelled sight nubs');
  }
});

test('weapons: glove hands present with cuff accents', function () {
  for (const key of ['ak47', 'awp', 'deagle', 'knife']) {
    const w = PolyVisual.buildWeapon(THREE, key);
    const gloveMeshes = allMeshes(w).filter(function (m) {
      return m.material && m.material.color &&
        (m.material.color.getHex() === 0x37474f || m.material.color.getHex() === 0x52636c);
    });
    assert.ok(gloveMeshes.length >= 4, key + ': gloves w/ teal cuffs present');
  }
});

test('arena: no DOM or texture allocation in any preset', function () {
  const previous=global.document;let calls=0;
  global.document={createElement(){calls++;throw new Error('no canvas');}};
  try { for(const preset of ['performance','medium','high']) {
    const scene=new THREE.Scene(),res=PolyVisual.buildArena(THREE,scene,CORE,preset);
    assert.ok(scene.background.isColor);assert.equal(calls,0);res.dispose();
  } } finally { if(previous===undefined)delete global.document;else global.document=previous; }
});

test('arena: rectangular bounds produce correct perimeter ray hits', function () {
  const scene = new THREE.Scene();
  const result = PolyVisual.buildArena(THREE, scene, { MAP: { bounds: { hx: 20, hz: 45 }, solids: [] } });
  assert.equal(result.hitMeshes.length, 4);
  for (const [dx, dz, distance] of [[1, 0, 20], [-1, 0, 20], [0, 1, 45], [0, -1, 45]]) {
    const rc = new THREE.Raycaster(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(dx, 0, dz));
    const hits = rc.intersectObjects(result.hitMeshes, false);
    assert.ok(hits.length);
    assert.ok(Math.abs(hits[0].distance - distance) < 1e-6);
  }
});

test('weapons: wood, olive, silver and chrome materials', function () {
  const expected={ak47:['akWood',0x8a5a2b],awp:['awpBody',0x3d4a3f],deagle:['dgSlide',0xc4cbd1],knife:['kfBlade',0xd3e0ec]};
  for(const [key,[name,color]] of Object.entries(expected)) {
    const material=allMeshes(PolyVisual.buildWeapon(THREE,key)).find(m=>m.material.name===name).material;
    assert.equal(material.color.getHex(),color);
    if(key==='knife'||key==='deagle')assert.ok(material.metalness>=.8&&material.roughness<=.35);
  }
});

test('weapons: view-model placement sanity at (0.32,-0.3,-0.65)', function () {
  // after parent placement the muzzle should still be ahead of the camera at z<-0.8
  for (const key of ['ak47', 'awp']) {
    const w = PolyVisual.buildWeapon(THREE, key);
    w.position.set(0.32, -0.3, -0.65);
    const wp = new THREE.Vector3();
    w.userData.muzzle.getWorldPosition(wp);
    assert.ok(wp.z < -1.0, key + ': muzzle in front of camera (z=' + wp.z.toFixed(2) + ')');
  }
});
