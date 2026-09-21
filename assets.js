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

  /* ------------------------------------------------------------ loader ---- */
  let THREE = null;
  let gltf = null;
  let fbx = null;
  let started = false;

  // resolved assets, keyed by weapon key
  const weapons = new Map();
  const rigs = new Map();
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

  function cloneGLB(src, skinned) {
    const scene = sceneOf(src);
    if (!scene) return null;
    if (skinned) {
      const utils = global.THREE && global.THREE.SkeletonUtils;
      if (utils && typeof utils.clone === 'function') {
        const clone = utils.clone(scene);
        if (src.animations) clone.animations = src.animations.map(a => a.clone());
        return clone;
      }
    }
    const plain = scene.clone(true);
    if (src.animations) plain.animations = src.animations.map(a => a.clone());
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

  function progress() {
    return { weapons: [...weapons.keys()], rigs: [...rigs.keys()], soldier: !!soldierGLB };
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
    bind, loadAll, ready, weapon, rig, soldier, weaponDef, hasWeapon, progress,
    WEAPON_KEYS, ROSTER,
  };
})(typeof window !== 'undefined' ? window : globalThis);
