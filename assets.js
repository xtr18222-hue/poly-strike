'use strict';
/* ============================================================================
 * POLY-STRIKE asset pipeline.
 *
 * Legacy POLY-STRIKE built every mesh from Three.js primitives at runtime.
 * The Field Operations overhaul replaces that with real GLB/FBX assets from
 * the poly-strike-assets repository. This module owns loading them.
 *
 * Contract (unchanged from the procedural build, so game.js needs no edits):
 *   PolyAsset.loadAll()                       -> Promise<void>
 *   PolyAsset.weapon(key)                     -> THREE.Group | null
 *     userData.muzzle  Object3D at the barrel tip (muzzle flash anchor)
 *     userData.hands   [Object3D] viewmodel hands (may be empty)
 *   PolyAsset.soldier()                       -> THREE.Group | null (skinned)
 *   PolyAsset.weaponDef(key)                  -> balance definition
 *   PolyAsset.WEAPON_KEYS                     -> [key]
 *
 * Weapons point down -Z (muzzle at tip), origin at the grip, exactly like the
 * procedural models. Each GLB exports at Blender units, not metres, so every
 * model carries an explicit scale + orientation fix in WEAPON_ASSETS below.
 * ========================================================================== */
(function (global) {
  'use strict';

  const log = (...a) => console.log('%c[assets]', 'color:#5b8de0', ...a);

  /* ------------------------------------------------------------- tables --- */
  // key -> { file, scale, rot:[x,y,z] (deg), stats overrides }
  // scale is chosen so the longest axis lands near the real weapon length in
  // metres; the loader also auto-normalises as a safety net.
  const WEAPON_ASSETS = {
    akm: {
      file: 'low-poly_akm.glb',
      length: 0.90, rot: [0, 0, 90],
    },
    deagle: {
      file: 'low-poly_desert_eagle_xix.glb',
      length: 0.27, rot: [0, 0, 90],
    },
    l96: {
      file: 'low-poly_l96_a1_precision_marksman.glb',
      length: 1.18, rot: [0, 0, 90],
    },
    mosin: {
      file: 'low-poly_mosin_nagant_189130.glb',
      length: 1.23, rot: [0, 0, 90],
    },
    mx: {
      file: 'low-poly_mx-8054.glb',
      length: 0.75, rot: [0, 0, 90],
    },
    hecate: {
      file: 'low-poly_pgm_hecate_ii.glb',
      length: 1.30, rot: [0, 0, 90],
    },
    bayonet: {
      file: 'low-poly_fa-03_bayonet.glb',
      length: 0.30, rot: [0, 0, 90],
    },
  };

  // First-person rigs: arms + weapon + clips already bound. Used for the
  // viewmodel when available; falls back to weapon + separate hands.
  const FPS_RIGS = {
    akm: 'fps-Fps Rig AKM.glb',
    deagle: 'fps-Rigged Glock.glb',
  };

  // Game balance for the new suite. Firearm identity maps to the old slots so
  // the inventory code keeps working: primary / secondary / melee.

  const ROSTER = ['akm', 'l96', 'mosin', 'mx', 'hecate', 'deagle', 'bayonet'];
  // Mirror of PolyCore's keys; loadAll prefers POLY_CORE directly when present.
  const WEAPON_KEYS = ROSTER.slice();

  const SOLDIER_FILE = 'Soldier by madtrollstudio - UL46oXeZYK.glb';

  // Mixamo clips for the test maps' animated bots. FBX, so they load through
  // FBXLoader and each carry their own skeleton. The Soldier GLB is a static
  // mesh with no bones, so a clip cannot be retargeted onto it — the clip's
  // own skinned rig is what the bot displays.
  const CLIP_FILES = {
    idle:   'anims/idle.fbx',
    walk:   'anims/walk forward.fbx',
    run:    'anims/run forward.fbx',
    sprint: 'anims/sprint forward.fbx',
    crouch: 'anims/idle crouching.fbx',
    lay:    'male_laying_pose.fbx',
    slide:  'running_slide.fbx',
    jump:   'anims/jump loop.fbx',
  };

  // Authored arena geometry. Loaded eagerly in loadAll() so buildArena() can
  // read them synchronously at deploy time.
  const MAP_MODELS = {
    'theking1322_range.glb': 'theking1322_range.glb',
    'map-depot.glb': 'map-depot.glb',
  };

  /* ------------------------------------------------------------ loader ---- */
  let THREE = null;
  let gltf = null;
  let fbx = null;
  let started = false;

  // resolved assets, keyed by weapon key
  const weapons = new Map();
  const rigs = new Map();
  const clips = new Map();   // Mixamo FBX clips for the test map's animated bots
  const mapModels = new Map();   // authored arena GLBs, keyed by filename
  let soldierGLB = null;
  // The packs export one clip per FBX; loaded lazily on first use.
  const clipPacks = new Map();
  let mixer = null;

  function needThree() {
    if (!THREE) throw new Error('PolyAsset: THREE not bound. Call PolyAsset.bind(THREE) first.');
    return THREE;
  }

  // bind() is idempotent. The ES-module shim in index.html attaches the
  // GLB loaders to window.THREE after this classic script parses, so ready()
  // rebinds once they are present.
  function bind(t) {
    THREE = t || global.THREE || null;
    if (THREE && !global.THREE) global.THREE = THREE;
  }

  // Classic-script addons pollute global.THREE; module imports need a fetch.
  // Prefer whichever is already present so we never load the loader twice.
  function getLoaders() {
    if (gltf && fbx) return { gltf, fbx };
    if (global.THREE && global.THREE.GLTFLoader && global.THREE.FBXLoader) {
      gltf = new global.THREE.GLTFLoader();
      fbx = new global.THREE.FBXLoader();
      return { gltf, fbx };
    }
    throw new Error('PolyAsset: GLTFLoader/FBXLoader not available — load vendor addons before loadAll()');
  }

  const loadGLB = (url) => new Promise((res, rej) => {
    getLoaders();
    gltf.load(url, res, undefined, rej);
  });

  const loadFBX = (url) => new Promise((res, rej) => {
    getLoaders();
    fbx.load(url, res, undefined, rej);
  });

  // Soldier clones must be re-centred like weapons: the raw export origin sits
  // ~16m off the rig, so a bot at waypoint (0,12) renders its mesh elsewhere
  // and the hit ray lands on empty air. Wrap the clone in a pivot and offset
  // that pivot by the rig's own bounding-box centre.
  //
  // The GLB is fine as exported: a single mesh with a uniform 100x node scale
  // and the upright rotation baked onto the node, giving a 1.93m rig in world
  // space. Do not bake that scale into the geometry — the local 0.01m bounds
  // are exactly what the centring math below expects.
  function cloneSoldier() {
    if (!soldierGLB) return null;
    const g = cloneGLB(soldierGLB, true);
    if (!g) return null;
    const T = needThree();
    const pivot = new T.Group();
    pivot.add(g);
    const box = new T.Box3().setFromObject(pivot);
    if (box.isEmpty()) return pivot;
    const c = new T.Vector3(); box.getCenter(c);
    g.position.x -= c.x;
    g.position.z -= c.z;
    g.position.y -= box.min.y;
    pivot.updateMatrixWorld(true);
    return pivot;
  }

  // SkeletonUtils.clone() is only needed for skinned meshes — it rebuilds the
  // skeleton/bone graph so clones do not share bind pose. Weapons are plain
  // meshes (the probe confirmed zero bones on all seven), so a deep clone is
  // correct and far cheaper. Passing a non-skinned root into SkeletonUtils
  // walks it expecting bones and throws on source.clone() internals.
  //
  // src may be either a GLTF result ({scene, animations}) or a bare Group
  // (fitted weapons are stored unwrapped); normalize first.
  function sceneOf(src) { return src && (src.scene || src); }

  // Relink the detachable-part handles after a clone. Object3D.copy() deep
  // JSON-clones userData, which silently drops the live Object3D references
  // (root.userData.mag) and their basePos/baseRot caches, so the reload
  // animation then crashed reading .copy() off undefined. Walk the clone in
  // lockstep with the source and restore the real cloned node.
  const NAME_HINTS = { mag: /^mag$/, bolt: /bolt|slide|charging/i };
  function relinkParts(cloneRoot, srcRoot) {
    if (!cloneRoot || !srcRoot) return;
    const byName = new Map();
    cloneRoot.traverse(o => { if (o.name) byName.set(o.name, o); });
    for (const [field, re] of Object.entries(NAME_HINTS)) {
      let ref = null;
      srcRoot.traverse(o => { if (!ref && re.test(o.name || '')) ref = o; });
      if (!ref) continue;
      const twin = byName.get(ref.name);
      if (!twin) continue;
      cloneRoot.userData[field] = twin;
      twin.userData.basePos = twin.position.clone();
      twin.userData.baseRot = twin.rotation.clone();
    }
    // The muzzle anchor is an empty child added at fit time; re-find it too.
    const muzzle = byName.get('muzzle');
    if (muzzle) cloneRoot.userData.muzzle = muzzle;
  }

  function cloneGLB(src, skinned) {
    const scene = sceneOf(src);
    if (!scene) return null;
    if (skinned) {
      const utils = global.THREE && global.THREE.SkeletonUtils;
      if (utils && typeof utils.clone === 'function') {
        const clone = utils.clone(scene);
        if (src.animations) clone.animations = src.animations.map(a => a.clone());
        relinkParts(clone, scene);
        return clone;
      }
    }
    const plain = scene.clone(true);
    if (src.animations) plain.animations = src.animations.map(a => a.clone());
    relinkParts(plain, scene);
    return plain;
  }

  /* ------------------------------------------------------ model fitting --- */
  // Normalise an asset to weapon space: muzzle at -Z, grip at origin, longest
  // axis scaled to `target` metres. Reports what it did so the table above can
  // be corrected without guessing.
  function fitWeapon(group, def, key) {
    const T = needThree();
    const root = new T.Group();
    const inner = new T.Group();
    root.add(inner);
    inner.add(group);

    // Bounding box of the raw asset tells us the export scale and orientation.
    const box = new T.Box3().setFromObject(group);
    const size = new T.Vector3();
    box.getSize(size);
    const long = Math.max(size.x, size.y, size.z);

    // Orientation: the longest axis must become -Z (forward). Euler applied to
    // the inner pivot so the exported node transforms stay intact.
    const axis = size.x >= size.y && size.x >= size.z ? 'x' : (size.y >= size.z ? 'y' : 'z');
    const fix = { x: 0, y: 0, z: 0 };
    if (axis === 'x') fix.z = -90;                 // long axis along X -> rotate to Z
    else if (axis === 'y') fix.x = 90;             // vertical export -> tip forward
    if (def.rot) { fix.x += def.rot[0]; fix.y += def.rot[1]; fix.z += def.rot[2]; }
    inner.rotation.set(T.MathUtils.degToRad(fix.x), T.MathUtils.degToRad(fix.y), T.MathUtils.degToRad(fix.z));

    // Scale to real-world length. Blender-unit exports come out ~8-18x too big.
    const scale = long > 0 ? def.length / long : 1;
    root.scale.setScalar(scale);

    // Recompute the fitted box and centre the grip at the origin: translate so
    // the back of the receiver sits at z=0 and the barrel points to -Z.
    root.updateMatrixWorld(true);
    const fitted = new T.Box3().setFromObject(root);
    const fs = new T.Vector3();
    fitted.getSize(fs);
    const centre = new T.Vector3();
    fitted.getCenter(centre);
    inner.position.x -= centre.x;
    inner.position.y -= centre.y;
    // Grip at origin: keep the rear of the weapon near z=0.
    inner.position.z -= fitted.min.z;

    // Muzzle anchor at the barrel tip.
    root.updateMatrixWorld(true);
    const tip = new T.Object3D();
    tip.name = 'muzzle';
    const again = new T.Box3().setFromObject(root);
    tip.position.set(again.min.x + fs.x / 2, again.min.y + fs.y / 2, again.min.z);
    root.add(tip);
    root.userData.muzzle = tip;

    root.userData.hands = []; // rigs carry their own arms; standalone weapons have none

    // Detachable parts. The GLBs were re-exported from Blender with magazines,
    // loose rounds and attachments grouped under named pivot nodes ("mag",
    // "rounds", "attachment"); those pivots are what the reload animation and
    // the magazine-drop effect drive. The muzzle and bolt are looked up by
    // their original names when the rig carries them.
    const find = (re) => {
      let hit = null;
      root.traverse((o) => { if (!hit && re.test(o.name || '')) hit = o; });
      return hit;
    };
    const mag = find(/^mag$/);
    if (mag) {
      root.userData.mag = mag;
      mag.userData.basePos = mag.position.clone();
      mag.userData.baseRot = mag.rotation.clone();
    }
    // The bolt/slide only exists on some rigs; missing parts are skipped.
    const bolt = find(/bolt|slide|charging/i);
    if (bolt) {
      root.userData.bolt = bolt;
      bolt.userData.basePos = bolt.position.clone();
      bolt.userData.baseRot = bolt.rotation.clone();
    }

    root.userData.fit = {
      exportLong: +long.toFixed(4), scale: +scale.toFixed(5),
      axis, dim: [+fs.x.toFixed(4), +fs.y.toFixed(4), +fs.z.toFixed(4)],
    };
    return root;
  }

  /* ------------------------------------------------------------ loading --- */
  async function loadWeapon(key, base) {
    const def = WEAPON_ASSETS[key];
    if (!def) throw new Error('PolyAsset: unknown weapon ' + key);
    const g = await loadGLB(base + 'assets/models/' + def.file);
    const root = fitWeapon(g.scene, def, key);
    root.name = 'weapon:' + key;
    return root;
  }

  async function loadAll(base) {
    if (started) return;
    started = true;
    base = base || (global.location ? global.location.pathname.replace(/[^/]*$/, '') : './');
    const report = [];

    // Roster comes from PolyCore so the simulation and the asset loader can
    // never disagree about which weapons exist.
    const roster = (global.POLY_CORE && Object.keys(global.POLY_CORE.WEAPONS)) || ROSTER;
    for (const key of roster) {
      try {
        const w = await loadWeapon(key, base);
        weapons.set(key, w);
        report.push(key + ' ok ' + JSON.stringify(w.userData.fit));
      } catch (e) {
        console.error('[assets] weapon failed', key, e.message);
        report.push(key + ' FAIL ' + e.message);
      }
    }

    try {
      soldierGLB = await loadGLB(base + 'assets/models/' + SOLDIER_FILE);
      report.push('soldier ok');
    } catch (e) { console.error('[assets] soldier failed', e.message); report.push('soldier FAIL ' + e.message); }

    // Mixamo animation clips for the test map's animated bots. These are FBX,
    // so they go through FBXLoader; failures are non-fatal (the bots simply
    // fall back to the static soldier pose).
    for (const [key, file] of Object.entries(CLIP_FILES)) {
      try {
        const clip = await loadFBX(base + 'assets/models/' + file);
        clips.set(key, clip);
        report.push('clip:' + key + ' ok ' + (clip.animations ? clip.animations.length : 0) + ' clips');
      } catch (e) { console.error('[assets] clip failed', key, e.message); report.push('clip:' + key + ' FAIL ' + e.message); }
    }

    // Authored arena GLBs for the 116791 test maps, loaded eagerly so
    // buildArena() can read them synchronously at deploy time.
    for (const file of Object.keys(MAP_MODELS)) {
      try {
        const g = await loadGLB(base + 'assets/models/' + file);
        mapModels.set(file, g);
        report.push('map:' + file + ' ok');
      } catch (e) { console.error('[assets] map model failed', file, e.message); report.push('map:' + file + ' FAIL ' + e.message); }
    }

    for (const [key, file] of Object.entries(FPS_RIGS)) {
      try {
        const g = await loadGLB(base + 'assets/models/' + file);
        rigs.set(key, g);
        report.push('rig:' + key + ' ok clips=' + (g.animations ? g.animations.length : 0));
      } catch (e) { console.error('[assets] rig failed', key, e.message); report.push('rig:' + key + ' FAIL ' + e.message); }
    }

    log(report.join('\n            '));
  }

  /* ------------------------------------------------------------ access --- */
  function weapon(key) {
    const w = weapons.get(key);
    if (!w) return null;
    // Cloned so callers can animate without disturbing the cached original.
    return cloneGLB(w, false);
  }

  // Balance stats live in PolyCore.WEAPONS (single source of truth); assets.js
  // owns only the model file + fit transform.
  function weaponDef(key) {
    const core = globalThis.POLY_CORE;
    return (core && core.WEAPONS && core.WEAPONS[key]) || null;
  }
  function hasWeapon(key) { return weapons.has(key); }

  function rig(key) {
    const r = rigs.get(key);
    return r ? cloneGLB(r, true) : null;
  }

  function soldier() { return cloneSoldier(); }

  // Mixamo FBX for a named animation (see CLIP_FILES), or null if it failed
  // to load. The Soldier GLB is a static mesh with zero bones, so the clip
  // cannot be retargeted onto it; instead we return the clip's own skinned
  // rig root, which the bot group displays directly. Scale is normalised to
  // metres (Mixamo exports in centimetres) and the rig is re-centred so its
  // feet sit on the bot's spawn point.
  function clipRig(key) {
    const src = clips.get(key);
    if (!src) return null;
    const rig = cloneGLB(src, true);
    // Mixamo FBX is in cm; the Soldier is ~1.9m, so match that height.
    const box = new THREE.Box3().setFromObject(rig);
    const size = box.getSize(new THREE.Vector3());
    const s = size.y > 0 ? 1.9 / size.y : 1;
    rig.scale.setScalar(s);
    // Feet on the ground, centred on the origin the bot group expects.
    const after = new THREE.Box3().setFromObject(rig);
    const c = after.getCenter(new THREE.Vector3());
    rig.position.x -= c.x; rig.position.z -= c.z;
    rig.position.y -= after.min.y;
    rig.name = 'clip:' + key;
    return rig;
  }

  // The AnimationClip for a named animation, for callers that already have a
  // skinned rig of their own.
  function clip(key) {
    const c = clips.get(key);
    if (!c || !c.animations || !c.animations.length) return null;
    return c.animations[0];
  }

  // Cached authored arena GLB, or null if it has not loaded (yet / ever).
  function gltfFor(file) {
    return mapModels.get(file) || null;
  }

  function progress() {
    return { weapons: [...weapons.keys()], rigs: [...rigs.keys()], soldier: !!soldierGLB,
      clips: [...clips.keys()], mapModels: [...mapModels.keys()] };
  }

  // Auto-boot: bind to the global THREE, then load everything. ready()
  // resolves once, and weapon()/soldier() return null until it does so the
  // game can render the menu while the GLBs stream in.
  let readyP = null;
  function ready() {
    if (!readyP) {
      readyP = (async () => {
        try {
          // The GLB loaders are attached by an ES-module shim in index.html,
          // which resolves after this classic script parses. Poll for it so
          // loadAll never runs before GLTFLoader exists.
          for (let i = 0; i < 200; i++) {
            if (global.THREE && global.THREE.GLTFLoader && global.THREE.FBXLoader) break;
            await new Promise(r => setTimeout(r, 60));
          }
          bind();
          await loadAll();
        } catch (e) {
          // A failed asset must not take the whole game down: the caller can
          // still play with whatever did load.
          console.error('PolyAsset: asset load failed', e);
        }
      })();
    }
    return readyP;
  }

  global.PolyAsset = {
    bind, loadAll, ready, weapon, rig, soldier, clip, clipRig, gltfFor, weaponDef, hasWeapon, progress,
    WEAPON_KEYS, ROSTER,
  };
})(typeof window !== 'undefined' ? window : globalThis);
