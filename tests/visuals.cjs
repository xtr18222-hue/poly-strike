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

test('buildArena: decor budget under 400 environment meshes; scene populated', function () {
  const scene = new THREE.Scene();
  PolyVisual.buildArena(THREE, scene, CORE);
  const meshes = allMeshes(scene);
  assert.ok(meshes.length < 400, 'environment mesh count < 400 (got ' + meshes.length + ')');
  assert.ok(meshes.length > 100, 'scene is actually decorated (got ' + meshes.length + ')');
  assert.ok(scene.children.length > 20, 'scene has many top-level objects');
});

test('buildArena: all geometry finite, no DOM needed (canvas fallback)', function () {
  // no document global is defined here, so canvas textures must be skipped
  const scene = new THREE.Scene();
  const res = PolyVisual.buildArena(THREE, scene, CORE);
  assertFinite(scene, 'arena');
  assert.ok(res.hitMeshes.every(function (m) { return m.isMesh; }), 'all hitMeshes are Meshes');
});

test('buildArena: floor sits below y=0, site signs exist near A and B', function () {
  const scene = new THREE.Scene();
  PolyVisual.buildArena(THREE, scene, CORE);
  // floor slab top must be at y<=0 so entities stand on it
  let floorTop = Infinity;
  scene.traverse(function (o) {
    if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry' &&
      o.position.y === -0.25 && Math.abs(o.scale.x - 1) < 0.01) {
      floorTop = Math.min(floorTop, o.position.y + 0.25);
    }
  });
  assert.ok(floorTop <= 0.001, 'floor top at y<=0 (got ' + floorTop + ')');
  // signs: planes with teal/blue materials near site A/B centers
  const sites = [];
  scene.traverse(function (o) {
    if (o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry' &&
      o.parent && Math.abs(o.parent.position.y - 6.2) < 0.01) {
      sites.push({ x: o.parent.position.x, z: o.parent.position.z });
    }
  });
  assert.ok(sites.some(function (p) { return Math.hypot(p.x - 24, p.z + 19.6) < 0.01; }), 'A sign near (24,-19.6)');
  assert.ok(sites.some(function (p) { return Math.hypot(p.x + 24, p.z - 19.6) < 0.01; }), 'B sign near (-24,19.6)');
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

test('weapons: glove hands present with cuff accents', function () {
  for (const key of ['ak47', 'awp', 'deagle', 'knife']) {
    const w = PolyVisual.buildWeapon(THREE, key);
    const gloveMeshes = allMeshes(w).filter(function (m) {
      return m.material && m.material.color &&
        (m.material.color.getHex() === 0x37474f || m.material.color.getHex() === 0xb01426);
    });
    assert.ok(gloveMeshes.length >= 4, key + ': gloves w/ teal cuffs present');
  }
});

test('arena: canvas painters execute, generate A/B signs and square pads', function () {
  const previous = global.document;
  const labels = [], rectangles = [];
  const gradient = { addColorStop() {} };
  global.document = { createElement(tag) {
    assert.equal(tag, 'canvas');
    return { width: 0, height: 0, getContext() {
      return {
        createLinearGradient() { return gradient; },
        createRadialGradient() { return gradient; },
        fillRect() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, setLineDash() {},
        strokeRect(x, y, w, h) { rectangles.push([x, y, w, h]); },
        fillText(text) { labels.push(text); },
      };
    } };
  } };
  try {
    const scene = new THREE.Scene();
    PolyVisual.buildArena(THREE, scene, CORE);
    assert.ok(scene.background.isTexture, 'canvas sky background');
    assert.deepEqual(labels.sort(), ['A', 'A', 'B', 'B']);
    for (const r of rectangles.slice(0, 2)) assert.ok(Math.abs(r[2] - r[3]) < 1e-6, 'site pad stays square');
    const planes = allMeshes(scene).filter(m => m.geometry.type === 'PlaneGeometry');
    assert.equal(planes.length, 3, 'paint overlay plus two site signs');
    assert.ok(planes.every(m => m.material.map && m.material.map.isCanvasTexture));
    assert.ok(allMeshes(scene).length < 400);
    assertFinite(scene, 'canvas arena');
  } finally {
    if (previous === undefined) delete global.document;
    else global.document = previous;
  }
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

test('weapons: red-black finish and geometric skin details on every model', function () {
  for (const key of ['ak47', 'awp', 'deagle', 'knife']) {
    const w = PolyVisual.buildWeapon(THREE, key);
    const meshes = allMeshes(w);
    assert.ok(meshes.some(m => m.material.color.getHex() === 0xc51632), key + ': crimson finish');
    assert.ok(meshes.some(m => m.material.color.getHex() === 0x17191f), key + ': graphite finish');
    assert.ok(meshes.filter(m => m.name === 'skin-inlay').length >= 6, key + ': procedural inlays');
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
