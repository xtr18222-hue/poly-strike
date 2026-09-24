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
  // key -> { file, length (metres), rot (deg, composed after the auto axis fix) }
  // Every model in this pack exports with the barrel along +X and the sights up
  // (+Y), so the auto axis guess (rotate -90 around Z) is already correct and
  // rot is [0,0,0]. Length is the real weapon length; the loader scales the
  // longest fitted axis to match.
  const WEAPON_ASSETS = {
    akm: {
      file: 'low-poly_akm.glb',
      length: 0.90, rot: [0, 0, 0], flip: 1,
    },
    deagle: {
      file: 'low-poly_desert_eagle_xix.glb',
      length: 0.27, rot: [0, 0, 0], flip: 1,
    },
    l96: {
      file: 'low-poly_l96_a1_precision_marksman.glb',
      length: 1.18, rot: [0, 0, 0], flip: 1,
    },
    hecate: {
      file: 'low-poly_pgm_hecate_ii.glb',
      length: 1.30, rot: [0, 0, 0], flip: 1,
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

  // Strict roster: AKM, L96 A1, PGM Hecate II and the Desert Eagle. The
  // Mosin and both knives were removed from the loadout, so the loader never
  // builds them.
  const ROSTER = ['akm', 'l96', 'hecate', 'deagle'];
  // Mirror of PolyCore's keys; loadAll prefers POLY_CORE directly when present.
  const WEAPON_KEYS = ROSTER.slice();

  const SOLDIER_RIG_FILE = 'anims/Soldier by madtrollstudio - UL46oXeZYK.fbx';
  const SOLDIER_FILE = 'Soldier by madtrollstudio - UL46oXeZYK.glb';

  // Mixamo clips for the test maps' animated bots. FBX, so they load through
  // FBXLoader and each carry their own skeleton. The Soldier GLB is a static
  // mesh with no bones, so a clip cannot be retargeted onto it — the clip's
  // own skinned rig is what the bot displays.
  // The Pro Rifle Pack (see assets/models/anims). Every clip the test maps
  // reference must be registered here or the bot silently falls back to the
  // static soldier pose. Kept as a superset so spawn tables can pick freely.
  const CLIP_FILES = {
    idle:   'anims/idle.fbx',
    idleAim:'anims/idle aiming.fbx',
    walk:   'anims/walk forward.fbx',
    walkLeft:'anims/walk left.fbx',
    walkRight:'anims/walk right.fbx',
    walkBack:'anims/walk backward.fbx',
    run:    'anims/run forward.fbx',
    runLeft:'anims/run left.fbx',
    runRight:'anims/run right.fbx',
    runBack:'anims/run backward.fbx',
    sprint: 'anims/sprint forward.fbx',
    sprintLeft:'anims/sprint left.fbx',
    sprintRight:'anims/sprint right.fbx',
    crouch: 'anims/idle crouching.fbx',
    crouchAim:'anims/idle crouching aiming.fbx',
    crouchWalk:'anims/walk crouching forward.fbx',
    crouchWalkLeft:'anims/walk crouching left.fbx',
    crouchWalkRight:'anims/walk crouching right.fbx',
    turnLeft:'anims/turn 90 left.fbx',
    turnRight:'anims/turn 90 right.fbx',
    crouchTurnLeft:'anims/crouching turn 90 left.fbx',
    crouchTurnRight:'anims/crouching turn 90 right.fbx',
    jumpUp: 'anims/jump up.fbx',
    jump:   'anims/jump loop.fbx',
    jumpDown:'anims/jump down.fbx',
    deathFront:'anims/death from the front.fbx',
    deathBack:'anims/death from the back.fbx',
    deathRight:'anims/death from right.fbx',
    deathFrontHead:'anims/death from front headshot.fbx',
    deathBackHead:'anims/death from back headshot.fbx',
    deathCrouchHead:'anims/death crouching headshot front.fbx',
    lay:    'anims/death from the back.fbx',
    slide:  'anims/jump down.fbx',
  };

  // Authored arena geometry. Loaded eagerly in loadAll() so buildArena() can
  // read them synchronously at deploy time. The code-gated test maps were
  // removed; no standard map ships authored geometry, so nothing is loaded
  // here and MAP_MODELS stays empty.
  const MAP_MODELS = {};

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
  let soldierRigGLB = null;    // skinned Soldier FBX (Pro Rifle Pack character mesh)
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

  // Match the detachable-part handles to a fresh clone. Object3D.clone()
  // deep-JSON-clones userData, which drops the live Object3D references
  // (root.userData.mag) and their basePos/baseRot caches, so the reload
  // animation then crashed reading .copy() off undefined. Walk the clone in
  // lockstep with the source and restore the real cloned node.
  const NAME_HINTS = { mag: /^mag/, bolt: /^bolt|slide|charging/i, scope: /^scope/, stock: /stock/, adsAnchor: /^adsAnchor/ };
  function relinkParts(cloneRoot, srcRoot) {
    if (!cloneRoot || !srcRoot) return;
    // Prefer the pivot fitWeapon bound on the original: it is already the
    // correct part, chosen by verticalness, and copying it across keeps the
    // reload animating the right magazine. Only fall back to re-picking if the
    // source lost its binding (old cached asset).
    const byName = new Map();
    cloneRoot.traverse(o => { if (o.name) byName.set(o.name, o); });
    for (const field of Object.keys(NAME_HINTS)) {
      const ref = srcRoot.userData[field];
      if (!ref) continue;
      const twin = byName.get(ref.name);
      if (!twin) continue;
      cloneRoot.userData[field] = twin;
      // basePos/baseRot were straightened at fit time; copy those, since the
      // clone's own local transform is already identical but its userData is
      // not carried by Object3D.clone().
      twin.userData.basePos = twin.position.clone();
      twin.userData.baseRot = twin.rotation.clone();
    }
    const muzzle = byName.get('muzzle');
    if (muzzle) cloneRoot.userData.muzzle = muzzle;
  }

  function cloneGLB(src, skinned) {
    const scene = sceneOf(src);
    if (!scene) return null;
    let clone;
    if (skinned) {
      const utils = global.THREE && global.THREE.SkeletonUtils;
      if (utils && typeof utils.clone === 'function') {
        clone = utils.clone(scene);
      }
    }
    if (!clone) clone = scene.clone(true);
    // Object3D.clone() copies only position/scale, so the fitted orientation on
    // the inner pivot (and the per-part straightening done at fit time) were
    // discarded and every cloned weapon rendered sideways / with canted mags.
    // Propagate only the transforms fitWeapon owns: the top-level pivot chain.
    // Copying every node by name would re-apply the source's baked cants over
    // the straightened clone.
    const copyPivot = (srcNode, dstNode) => {
      if (!srcNode || !dstNode) return;
      dstNode.position.copy(srcNode.position);
      dstNode.quaternion.copy(srcNode.quaternion);
      dstNode.rotation.copy(srcNode.rotation);
      dstNode.scale.copy(srcNode.scale);
      dstNode.visible = srcNode.visible;
    };
    copyPivot(scene, clone);
    for (let i = 0; i < scene.children.length && i < clone.children.length; i++)
      copyPivot(scene.children[i], clone.children[i]);
    // The fit's world-space placement lives on the ROOT group (it recentres
    // the gun and butts the receiver's rear face against z=0), but clone()
    // only reproduces the inner scene, so every cloned weapon lost that
    // placement and parts spread far off the long axis (the AKM's magazine,
    // grip and compensator) ended up nine units from the muzzle. The clone IS
    // the root for the caller, so the root transform must land on it.
    copyPivot(src, clone);
    // Anchors added after the fit (muzzle / adsAnchor / fitBox) are children
    // of root, not of the inner scene, so a plain clone never carries them.
    // Rebuild them on the clone from the source's own fitted box so callers
    // that read userData.muzzle or userData.fitBox still get the truth.
    if (src.userData && src.userData.muzzle) {
      if (!clone.children.some(c => c.name === 'muzzle')) {
        const tip = new T.Object3D(); tip.name = 'muzzle';
        const tb = new T.Box3().setFromObject(clone);
        if (!tb.isEmpty()) {
          const tc = new T.Vector3(); tb.getCenter(tc);
          tip.position.set(tc.x, tc.y, tb.min.z);
        }
        clone.add(tip);
        clone.userData.muzzle = tip;
      }
    }
    if (src.userData && src.userData.adsAnchor && !clone.userData.adsAnchor) {
      const anchor = new T.Object3D(); anchor.name = 'adsAnchor';
      anchor.position.copy(src.userData.adsAnchor.position);
      clone.add(anchor);
      clone.userData.adsAnchor = anchor;
    }
    if (src.userData && src.userData.fitBox) clone.userData.fitBox = src.userData.fitBox.clone();
    // Per-part visibility set by assembleParts (hidden spare magazines and
    // loose rounds) is not carried by clone(); propagate it by name so the
    // clone hides the same floating parts the original hid.
    const visByName = new Map();
    scene.traverse(o => { if (o.name) visByName.set(o.name, o.visible); });
    clone.traverse(c => { if (c.name && visByName.has(c.name)) c.visible = visByName.get(c.name); });
    if (src.animations) clone.animations = src.animations.map(a => a.clone());
    relinkParts(clone, scene);
    return clone;
  }

  /* ------------------------------------------------------ model fitting --- */
  // Fit an asset to weapon space: muzzle at -Z, grip near the origin, longest
  // axis scaled to `target` metres. Reports what it did so the table above can
  // be corrected without guessing.
  //
  // Two pivot groups are used deliberately. The exported node transforms must
  // stay intact (the mag/bolt pivots are named nodes the reload animation
  // drives), so orientation goes on `inner` and the grip-centring translation
  // goes on `inner` too — both in the *pre-rotation* frame. Applying the
  // centre offset after the rotation would move the grip sideways instead of
  // along the barrel, and reading box.min/max in the same frame as the
  // translation is what makes the rear of the receiver land at z=0.
  // The base models export every part already seated (each pivot's box
  // intersects the receiver's), so no vertex-level re-seating is needed. What
  // they do carry is loose rounds and spare/empty magazines as extra pivots
  // that float clear of the gun — hide those, keep the loaded magazine.
  //
  // Per-part visibility propagates through cloneGLB's visByName map, and the
  // names below are anchored by tests/overhaul.cjs.
  const hidePart = (root, node) => {
    if (!node) return;
    node.traverse(o => { if (o.isMesh) o.visible = false; });
  };
  // A pivot is a floating spare if its box does not touch the receiver.
  function receiverBox(root) {
    const T = needThree();
    const bb = new T.Box3();
    root.traverse(o => {
      if (/mag|rounds|bullet|cartridge|case|scope|clip|stock|grip/.test(o.name || '')) return;
      const b = new T.Box3().setFromObject(o);
      if (!b.isEmpty()) bb.union(b);
    });
    return bb;
  }
  // Loose bullets / cartridges are the parts the brief calls out to strip.
  // A bare-cartridge name (76239_11, 762x51_mag_1, 50bmg_1) is a loose round;
  // an empty magazine shell keeps the word "mag" and is handled below.
  const LOOSE_ROUND = /^rounds|bullet|cartridge|50_bmg|\d+mm\dc?ase|762\d*_*\d*$/;
  // The loaded magazine vs the empty spare differ by mesh count on every
  // model: the loaded one carries its rounds as extra meshes (3 vs 1 on the
  // AKM, 3 vs 2 on the Deagle), so mesh count picks the one the player is
  // actually holding without trusting "empty" in the name.
  // Mosin's magazine is internal (fixed): its pivot is named for the bare
  // cartridge ("76254_0") rather than for the word "mag", so it will never
  // match the magazine picker. It is loaded through the top of the receiver,
  // not dropped out, so the reload has no magazine to animate.
  const INTERNAL_MAG = /76254_0|76254_case_1|internal_mag/i;
  function pickMag(root) {
    let internal = false;
    root.traverse(o => { if (INTERNAL_MAG.test(o.name || '')) internal = true; });
    if (internal) return null;
    const cands = [];
    root.traverse(o => {
      if (o.isMesh || !o.name || !/mag/i.test(o.name)) return;
      if (/release|well|catch/.test(o.name)) return;   // a catch, not a magazine
      let n = 0; o.traverse(x => { if (x.isMesh) n++; });
      if (n) cands.push({ o, n });
    });
    if (!cands.length) return null;
    // The clean base models ship exactly ONE seated magazine, and "empty" is
    // not a reliable discriminator on them — the AKM's seated mag is literally
    // named ak_30rnd_empty_steel_mag_14. When only one magazine pivot exists it
    // is the magazine the player is holding; only break ties by mesh count
    // where a loaded mag and a spare both ship (the L96's 762x51_mag_1 vs
    // magrel_10, one mesh each — prefer the one that is not the spare).
    if (cands.length === 1) return cands[0].o;
    return cands.sort((a, b) => b.n - a.n)[0].o;
  }
  function assembleParts(root) {
    const T = needThree();
    root.updateMatrixWorld(true);
    // Bind the loaded magazine first so the hide loops below can keep it.
    // The Mosin has no detachable magazine (it is internal), so pickMag
    // returns null there and the reload simply has nothing to animate.
    const loaded = pickMag(root);
    if (loaded) {
      root.userData.mag = loaded;
      loaded.userData.basePos = loaded.position.clone();
      loaded.userData.baseRot = loaded.rotation.clone();
    }
    // Hide every loose-round pivot; those are the parts the brief calls out
    // to strip (they render as bullets floating beside the gun).
    root.traverse(o => {
      if (o.isMesh || !o.name) return;
      if (!LOOSE_ROUND.test(o.name)) return;
      hidePart(root, o);
    });
    // Every OTHER magazine pivot is the empty spare the player is not
    // holding — hide it so only one magazine renders.
    root.traverse(o => {
      if (o.isMesh || !o.name) return;
      if (!/mag/i.test(o.name)) return;
      if (o === root.userData.mag) return;
      if (/release|well|catch/.test(o.name)) return;
      let meshes = 0; o.traverse(x => { if (x.isMesh) meshes++; });
      if (!meshes) return;
      hidePart(root, o);
    });
    // Record rest poses for the parts the reload animation drives.
    for (const field of ['mag', 'scope', 'stock', 'bolt']) {
      const p = root.userData[field];
      if (!p) continue;
      p.userData.basePos = p.position.clone();
      p.userData.baseRot = p.rotation.clone();
    }
    // The ADS anchor: an empty Object3D placed on the optical axis. game.js
    // lerps the viewmodel group toward this point so the eye lands on the
    // sight instead of the bore centre. Scoped rifles use the scope glass;
    // iron-sight weapons use the rear sight post.
    const anchor = new T.Object3D();
    anchor.name = 'adsAnchor';
    const sight = root.userData.scope || root.userData.aim || null;
    if (sight) {
      const sb = new T.Box3().setFromObject(sight);
      if (!sb.isEmpty()) {
        const sc = new T.Vector3(); sb.getCenter(sc);
        // The scope glass sits above and usually to one side of the bore, but
        // the eye looks down the optical axis, not the glass centre. Place the
        // anchor at the glass's height on the weapon's own fitted centre-line:
        // X from the fitted box centre (the axis the bore lies on), Y at the
        // glass, Z at the glass so the eye lands on the optic, not beside it.
        const fb2 = new T.Box3().setFromObject(root);
        if (!fb2.isEmpty()) {
          const fc2 = new T.Vector3(); fb2.getCenter(fc2);
          anchor.position.set(fc2.x, sc.y, sc.z);
        } else anchor.position.copy(sc);
      }
    }
    if (anchor.position.lengthSq() === 0) {
      // Fall back to the fitted box top-centre: the sights sit above the bore.
      const fb = new T.Box3().setFromObject(root);
      if (!fb.isEmpty()) {
        const fc = new T.Vector3(); fb.getCenter(fc);
        anchor.position.set(fc.x, fb.max.y, fc.z);
      }
    }
    root.add(anchor);
    root.userData.adsAnchor = anchor;
  }

  function fitWeapon(group, def, key) {
    const T = needThree();
    const root = new T.Group();
    const inner = new T.Group();
    root.add(inner);
    inner.add(group);

  // --- Orientation -------------------------------------------------------
    // All assets export with the long axis on +X, sights on +Y, thin in Z, but
    // the muzzle end differs per model. The old code applied a roll about the
    // forward axis (fix.z = -90), which maps +X -> -Y: the barrel pointed DOWN
    // and the sights ended up sideways (a rifle lying on its side). A roll
    // about the bore never fixes that — it only spins around the wrong axis.
    // Build the target basis instead: muzzle -> -Z (forward), up -> +Y,
    // width -> +X (to the player's right). Determinant-1 and orthogonal, so no
    // shear or flip, and the weapon always sits level and faces forward.
    const box = new T.Box3().setFromObject(group);
    const size = new T.Vector3();
    box.getSize(size);
    const long = Math.max(size.x, size.y, size.z);
    const axis = size.x >= size.y && size.x >= size.z ? 'x' : (size.y >= size.z ? 'y' : 'z');

    // Asset forward: the signed direction the muzzle points along the long
    // axis. The old table hardcoded this per file, which silently inverted any
    // export whose barrel runs the other way — the L96 and Hecate both shipped
    // with the muzzle at -X, so a blanket +X pointed them at the player and
    // the rifle vanished behind the camera. Measure it instead: the muzzle
    // pivot is named on every clean export, so take the sign of its offset
    // from the stock. Falling back to def.flip keeps the table as a manual
    // override for a model without named parts.
    const MUZZLE_WORDS = /muzzle|barrel|compensator|brake/i;
    const STOCK_WORDS = /stock|butt|pistol_grip|grip/i;
    let muzzleC = null, stockC = null, muzzleNode = null;
    group.traverse(o => {
      if (!o.name || o.isMesh) return;
      if (!muzzleC && MUZZLE_WORDS.test(o.name)) {
        const bb = new T.Box3().setFromObject(o);
        if (!bb.isEmpty()) { muzzleC = bb.getCenter(new T.Vector3()); muzzleNode = o; }
      }
      if (!stockC && STOCK_WORDS.test(o.name)) {
        const bb = new T.Box3().setFromObject(o);
        if (!bb.isEmpty()) stockC = bb.getCenter(new T.Vector3());
      }
    });
    let dirSign = def.flip === -1 ? -1 : 1;
    if (muzzleC && stockC) {
      const a = axis === 'x' ? 'x' : axis === 'y' ? 'y' : 'z';
      const sep = muzzleC[a] - stockC[a];
      if (Math.abs(sep) > 1e-6) dirSign = sep > 0 ? 1 : -1;
    }
    const assetFwd = { x: new T.Vector3(dirSign, 0, 0),
                       y: new T.Vector3(0, dirSign, 0),
                       z: new T.Vector3(0, 0, dirSign) }[axis];
    const assetUp = new T.Vector3(0, 1, 0);   // sights up on every asset measured
    const assetRgt = new T.Vector3().crossVectors(assetUp, assetFwd).normalize();
    // Guard against a degenerate (collinear) pair.
    if (!isFinite(assetRgt.x) || assetRgt.lengthSq() < 1e-6) assetRgt.set(1, 0, 0);
    const assetUp2 = new T.Vector3().crossVectors(assetFwd, assetRgt).normalize();

    // Target basis: -Z forward, +Y up, +X right. All three measured asset axes
    // are mutually perpendicular, so a single quaternion built from two basis
    // vectors via setFromUnitVectors pairs carries the full rotation with no
    // matrix intermediate. Applying them in sequence (asset up -> view up,
    // then asset forward -> view forward about that up) avoids the
    // column-normalisation path in setFromRotationMatrix, which silently
    // produced a degenerate identity-ish quaternion when handed to a matrix
    // whose columns were unit-length but not exactly orthonormal.
    const tgtFwd = new T.Vector3(0, 0, -1);
    const tgtUp = new T.Vector3(0, 1, 0);
    const q = new T.Quaternion();
    q.setFromUnitVectors(assetUp2.clone().normalize(), tgtUp);
    // After that, the bore sits somewhere in the XZ plane; yaw it onto -Z
    // about the now-correct +Y axis.
    const fwdAfter = assetFwd.clone().applyQuaternion(q);
    const yawFix = new T.Quaternion().setFromUnitVectors(fwdAfter.clone().normalize(), tgtFwd);
    q.premultiply(yawFix);
    // Write the fit as an EULER, not just a quaternion. Object3D.clone() copies
    // position and scale only, so a quaternion-only orientation was discarded
    // on every cloned weapon and it rendered sideways. Euler/rotation is also
    // not copied by clone(), but cloneGLB propagates it explicitly, and keeping
    // both in sync means the cached original and every clone agree.
    inner.quaternion.copy(q);
    inner.rotation.setFromQuaternion(q);
    inner.updateMatrix();
    if (def.rot) inner.rotateOnAxis(new T.Vector3(1, 0, 0), T.MathUtils.degToRad(def.rot[0]));
    if (def.rot) inner.rotateOnAxis(new T.Vector3(0, 1, 0), T.MathUtils.degToRad(def.rot[1]));
    if (def.rot) inner.rotateOnAxis(new T.Vector3(0, 0, 1), T.MathUtils.degToRad(def.rot[2]));
    inner.updateMatrix();

    // Self-check, AFTER the orientation is committed: the quaternion chain is
    // built from basis vectors, and a degenerate pairing (assetUp parallel to
    // assetFwd, or a box whose long axis is not the bore) can leave the barrel
    // pointing at +Z — behind the camera, where the weapon is invisible.
    // Verify against the real muzzle pivot and flip 180 deg about up if it
    // missed. This must run after the quaternion write above, or the write
    // silently discards the correction.
    if (muzzleNode) {
      root.updateMatrixWorld(true);
      const mw = new T.Vector3();
      muzzleNode.getWorldPosition(mw);
      if (mw.z > 0.05) {
        const half = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI);
        inner.quaternion.premultiply(half);
        inner.rotation.setFromQuaternion(inner.quaternion);
        inner.updateMatrix();
      }
    }

    // Scale to real-world length. Blender-unit exports come out ~8-18x too big.
    const scale = long > 0 ? def.length / long : 1;
    root.scale.setScalar(scale);

    // Recompute the fitted box and centre the grip at the origin: translate so
    // the back of the receiver sits at z=0 and the barrel points to -Z.
    // The offset is applied in the PRE-rotation frame on the same pivot as the
    // rotation, so it travels with it: the rear of the weapon lands on z=0
    // along the barrel instead of being shunted sideways.
    // Normalise the placement in WORLD space. root has no parent yet, so its
    // world frame IS the frame the caller sees; translating root.position by a
    // world-space box offset is therefore frame-safe. The previous code
    // subtracted a post-rotation box z from inner.position (the pre-rotation
    // pivot), which mixed frames and left some guns entirely behind the
    // camera: the L96 sat at z in [0, 1.18] and was invisible.
    const place = () => {
      root.updateMatrixWorld(true);
      const fitted = new T.Box3().setFromObject(root);
      if (fitted.isEmpty()) return null;
      const fs = new T.Vector3(); fitted.getSize(fs);
      const c = new T.Vector3(); fitted.getCenter(c);
      // Bake the placement into the GEOMETRY, not into root.position. The
      // viewmodel animation re-sets position every frame to place the gun in
      // the camera frame, so a placement held in root.position is discarded
      // the moment a weapon is equipped — the AKM then sat with its receiver
      // 0.37m behind the pivot and the frustum solver measured the wrong near
      // face. Folding the offset into the child transforms makes the fitted
      // box intrinsic to the model.
      root.position.x -= c.x;
      root.position.y -= c.y;
      // Rear of the weapon at z=0, barrel to -Z: the whole gun then sits in
      // front of the camera whatever its internal pivot layout.
      root.position.z -= fitted.max.z;
      root.updateMatrixWorld(true);
      const shift = root.position.toArray();
      // Only the DIRECT children: `inner` is root's child and carries the
      // whole gun, so traversing deeper would add the shift to inner and again
      // to every child of inner, moving the weapon by twice the offset.
      // The shift is measured in WORLD units but child.position is in root's
      // LOCAL frame, which root.scale compresses (the AKM's 0.1006 fit scale
      // turned a -0.3717 offset into -0.0374). Divide through so the box lands
      // where the measurement says it should.
      const inv = scale > 0 ? 1 / scale : 1;
      for (const child of root.children) {
        child.position.x += shift[0] * inv; child.position.y += shift[1] * inv; child.position.z += shift[2] * inv;
      }
      root.position.set(0, 0, 0);
      root.updateMatrixWorld(true);
      return fs;
    };
    const fs = place();

    // Muzzle anchor at the barrel tip. The bore now runs along -Z with the
    // receiver centred on the origin, so the tip is simply min.z at the fitted
    // centre in X/Y — never a box corner.
    root.updateMatrixWorld(true);
    const tip = new T.Object3D();
    tip.name = 'muzzle';
    const again = new T.Box3().setFromObject(root);
    const ac = new T.Vector3(); again.getCenter(ac);
    tip.position.set(ac.x, ac.y, again.min.z);
    root.add(tip);
    root.userData.muzzle = tip;
    // Kept so the stock can be butted up against the receiver's rear face.
    root.userData.fitBox = again.clone();

    root.userData.hands = []; // rigs carry their own arms; standalone weapons have none

    // Detachable parts. The clean base GLBs name their pivots semantically
    // (akm_receiver_3, ak_30rnd_steel_mag_15, hawke_endurance__9, ...), so the
    // part handles resolve by name + shape rather than the separation-pass
    // "mag_Object_19" renaming the previous pipeline depended on. Only
    // top-level pivots are candidates: a nested lookup would grab an
    // attachment's own magazine and move the wrong mesh.
    const meshCount = (o) => { let n = 0; o.traverse(x => { if (x.isMesh) n++; }); return n; };
    // A real magazine hangs straight down from the receiver; an empty spare
    // (or a detached mag) floats with its long axis sideways or forward.
    // Verticalness of the long axis is the discriminator, with volume
    // breaking ties (a mag-release catch is also vertical but tiny).
    const worldLongAxis = (o) => {
      const bb = new T.Box3().setFromObject(o);
      const s = bb.getSize(new T.Vector3());
      if (!isFinite(s.x) || s.lengthSq() < 1e-8) return null;
      const q = new T.Quaternion();
      o.getWorldQuaternion(q);
      let li = 0;
      if (s.y > s.x && s.y > s.z) li = 1;
      else if (s.z > s.x && s.z > s.y) li = 2;
      const v = [new T.Vector3(1, 0, 0), new T.Vector3(0, 1, 0), new T.Vector3(0, 0, 1)][li];
      v.applyQuaternion(q);
      return { axis: v, vol: s.x * s.y * s.z };
    };
    const pickPart = (re, vertical) => {
      const hits = [];
      root.traverse(o => { if (re.test(o.name || '') && o !== root) hits.push(o); });
      if (!hits.length) return null;
      if (!vertical) {
        // Heaviest pivot for bolt/scope: the largest is the real part.
        return hits.sort((a, b) => meshCount(b) - meshCount(a))[0];
      }
      return hits.map(o => {
        const la = worldLongAxis(o);
        return { o, vert: la ? Math.abs(la.axis.y) : 0, vol: la ? la.vol : 0 };
      }).sort((a, b) => (b.vert - a.vert) || (b.vol - a.vol))[0].o;
    };
    const bindPart = (field, re, vertical) => {
      const p = pickPart(re, vertical);
      if (!p) return;
      root.userData[field] = p;
      p.userData.basePos = p.position.clone();
      p.userData.baseRot = p.rotation.clone();
    };
    // The magazine is picked by mesh count in assembleParts (the loaded mag
    // carries its rounds as extra meshes; the empty spare does not), so only
    // bolt/scope/sight/stock are bound here.
    bindPart('bolt', /^bolt/);           // heaviest is the bolt
    // The clean exports have no baked cants, but the reload resets each part
    // to baseRot/basePos, so record the rest pose the model shipped with.
    const straighten = (o) => {
      if (!o) return;
      o.userData.baseRot = o.rotation.clone();
    };
    straighten(root.userData.mag);
    straighten(root.userData.bolt);
    // Scoped rifles keep their glass as its own pivot so ADS can align to it.
    // The clean exports name their optic after the real scope model
    // (hawke_endurance__9 on the L96) rather than "scope", so match the known
    // optic brands and any pivot carrying a lens-shaped mesh.
    const scope = pickPart(/scope|optic|hawke|endurance|vortex|leupold|nightforce|nilkon|zeiss|swaro/i);
    if (scope) { root.userData.scope = scope; scope.userData.basePos = scope.position.clone(); }
    straighten(root.userData.scope);
    // Iron-sight rifles expose their rear sight as a separate pivot on a few
    // exports; prefer it for the ADS anchor when no scope is present.
    root.userData.aim = pickPart(/sight|rear/) || null;
    // The stock is a fixed part of the body on the clean models: keep a handle
    // only where the export gives it its own pivot.
    const stock = pickPart(/stock/, false);
    if (stock) {
      root.userData.stock = stock;
      stock.userData.basePos = stock.position.clone();
      stock.userData.baseRot = stock.rotation.clone();
    }

    root.userData.fit = {
      exportLong: +long.toFixed(4), scale: +scale.toFixed(5),
      axis, dim: [+fs.x.toFixed(4), +fs.y.toFixed(4), +fs.z.toFixed(4)],
    };
    assembleParts(root);
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
            console.error('[assets] weapon failed', key, e.stack || e.message);
            report.push(key + ' FAIL ' + e.message);
      }
    }

    try {
      soldierGLB = await loadGLB(base + 'assets/models/' + SOLDIER_FILE);
      report.push('soldier ok');
    } catch (e) { console.error('[assets] soldier failed', e.message); report.push('soldier FAIL ' + e.message); }

    // The skinned Soldier. The per-clip FBXs in the Pro Rifle Pack carry only
    // the animation (Geometry: 0), so a clip's own rig renders nothing; the
    // character mesh lives here, on the same mixamorig skeleton the clips
    // target. Bots are built from this and driven by the pack's clips.
    try {
      soldierRigGLB = await loadFBX(base + 'assets/models/' + SOLDIER_RIG_FILE);
      report.push('soldierRig ok ' + (soldierRigGLB.animations ? soldierRigGLB.animations.length : 0) + ' clips');
    } catch (e) { console.error('[assets] soldierRig failed', e.message); report.push('soldierRig FAIL ' + e.message); }

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

    // Standard arenas use procedural geometry, so MAP_MODELS is empty and no
    // arena GLB is fetched. The loop is kept so buildArena()'s synchronous
    // lookup contract still holds if an arena ever ships authored geometry.
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

  // A skinned Soldier rig the Pro Rifle Pack clips can drive. Mixamo exports
  // in centimetres; 0.01 puts the figure into metres, and TARGET_H then
  // normalises the standing height to the player's own 1.7m so bots match the
  // human operator instead of towering over them. The clip FBXs are
  // animation-only, so this is the body every bot actually wears.
  const TARGET_H = 1.7;   // player eye height; bots match the operator
  function soldierRig() {
    if (!soldierRigGLB) return null;
    const rig = cloneGLB(soldierRigGLB, true);
    if (!rig) return null;
    rig.scale.setScalar(0.01);
    rig.updateMatrixWorld(true);
    // Inverse-bind matrices must be computed AFTER the rig scale has been
    // applied. Baking them before leaves them at Mixamo's centimetre scale
    // while the bones end up in metres; the mismatch cancels the skinning
    // and the whole figure collapses into a small block.
    rig.traverse(n => { if (n.isSkinnedMesh && n.skeleton) n.skeleton.calculateInverses(); });
    rig.updateMatrixWorld(true);
    // Normalise the standing height to the player's. The Soldier ships at
    // 1.92m in metres, which reads as a giant next to the 1.7m operator.
    // skinnedBox is measured AFTER the inverse recompute above so the bound is
    // real, and the uniform scale keeps the rig's proportions intact.
    const box0 = skinnedBox(rig);
    const h0 = box0.getSize(new (needThree()).Vector3()).y;
    if (h0 > 0 && isFinite(h0)) rig.scale.setScalar(rig.scale.x * (TARGET_H / h0));
    rig.updateMatrixWorld(true);
    const box = skinnedBox(rig);
    if (!box.isEmpty() && isFinite(box.min.y)) {
      rig.position.y -= box.min.y;
      const c = box.getCenter(new (needThree()).Vector3());
      rig.position.x -= c.x; rig.position.z -= c.z;
    }
    rig.name = 'soldierRig';
    return rig;
  }

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
    if (!rig) return null;
    // Mixamo FBX is in cm; normalise the standing figure to the player's
    // height so the clip-rig fallback matches the 1.7m Soldier rig.
    // Skinned meshes only bound correctly once the skeleton has been updated,
    // and Box3.setFromObject on a SkeletonUtils clone of a bound rig can hand
    // back NaN (the bone matrices are still identity), which would silently
    // poison position/scale with NaN and vanish the bot. Guard both.
    rig.updateMatrixWorld(true);
    const box = skinnedBox(rig);
    const size = box.getSize(new THREE.Vector3());
    const s = size.y > 0 && isFinite(size.y) ? 1.7 / size.y : 0.01;
    rig.scale.setScalar(s);
    // Feet on the ground, centred on the origin the bot group expects.
    rig.updateMatrixWorld(true);
    const after = skinnedBox(rig);
    if (after.isEmpty() || !isFinite(after.min.y)) return rig;
    const c = after.getCenter(new THREE.Vector3());
    rig.position.x -= c.x; rig.position.z -= c.z;
    rig.position.y -= after.min.y;
    rig.name = 'clip:' + key;
    return rig;
  }

  // Bounding box of the character only. The rig may already carry a bot weapon
  // in its hand bone (armBot), and that weapon is fitted to a ~0.1 scale, so
  // letting it into the box inflates the bounds and mis-scales the whole rig.
  // Walk the meshes but skip anything under a bot-weapon pivot.
  function skinnedBox(root) {
    const T = THREE || global.THREE;
    const box = new T.Box3();
    root.updateMatrixWorld(true);
    root.traverse(n => { if (n.isSkinnedMesh && n.skeleton) n.skeleton.calculateInverses(); });
    root.traverse(n => {
      if (!n.isMesh) return;
      for (let p = n.parent; p && p !== root; p = p.parent) {
        if (p.userData && p.userData.botWeapon) return;
      }
      n.updateMatrixWorld(true);
      const gb = new T.Box3().setFromObject(n);
      if (!gb.isEmpty() && isFinite(gb.min.x)) box.union(gb);
    });
    return box;
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
    bind, loadAll, ready, weapon, rig, soldier, soldierRig, clip, clipRig, gltfFor, weaponDef, hasWeapon, progress,
    WEAPON_KEYS, ROSTER,
  };
})(typeof window !== 'undefined' ? window : globalThis);
