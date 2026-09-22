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
    mosin: {
      file: 'low-poly_mosin_nagant_189130.glb',
      length: 1.23, rot: [0, 0, 0], flip: 1,
    },
    mx: {
      file: 'low-poly_mx-8054.glb',
      length: 0.75, rot: [0, 0, 0], flip: -1,
    },
    hecate: {
      file: 'low-poly_pgm_hecate_ii.glb',
      length: 1.30, rot: [0, 0, 0], flip: -1,
    },
    bayonet: {
      file: 'low-poly_fa-03_bayonet.glb',
      length: 0.30, rot: [0, 0, 0], flip: 1,
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
  // The Blender separation pass names pivots by kind with the source mesh
  // suffix attached ("mag_Object_19"), so match by prefix, not exact name.
  const NAME_HINTS = { mag: /^mag/, bolt: /^bolt|slide|charging/i };
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
    // Per-part visibility set by hideExtras (spare magazines, loose rounds) is
    // not carried by clone(); propagate it by name so the clone hides the same
    // floating parts the original hid.
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
  // Close the gap the separation pass opened between the stock/magazine and the
  // receiver. The stock pivot's children are offset far from the pivot itself
  // (~2.8 units in local space) and the separation pass broke the pivot's hold
  // on its meshes, so neither part's bounding box nor the pivot's position can
  // be trusted: measure the contact vertices directly and push each mesh in
  // its own local space. Guarded, so a model whose parts do not line up this
  // way is left untouched rather than broken.
  function seatParts(root, T) {
    for (const partName of ['stock', 'mag']) {
      const part = root.userData[partName];
      if (!part) continue;
      root.updateMatrixWorld(true);
      const partMeshes = new Set();
      part.traverse(o => { if (o.isMesh) partMeshes.add(o); });

      // The contact point on the receiver, along the fitted bore (z) and up (y).
      // -Z is forward, so the receiver's rear face is the LARGEST z.
      let recZ = -Infinity, recY = Infinity, haveZ = false, haveY = false;
      const pb = new T.Box3().setFromObject(part);
      const pc = new T.Vector3(); pb.getCenter(pc);
      root.traverse(o => {
        if (!o.isMesh || !o.visible || partMeshes.has(o)) return;
        if (/mag|rounds|stock|scope|grip/.test(o.name || '')) return;
        const b = new T.Box3().setFromObject(o);
        if (!isFinite(b.min.y)) return;
        if (partName === 'mag') {
          // the magazine hangs under the receiver, so only parts near it in z count
          const c = new T.Vector3(); b.getCenter(c);
          if (Math.abs(c.z - pc.z) > 0.12) return;
          if (b.min.y < recY) { recY = b.min.y; haveY = true; }
        } else {
          if (!haveZ || b.max.z > recZ) { recZ = b.max.z; haveZ = true; }
        }
      });

      // The part's contact vertex, in world space.
      let pZ = partName === 'stock' ? Infinity : -Infinity;
      let measuring = partName === 'stock' ? haveZ : haveY;
      if (!measuring) continue;
      part.traverse(o => {
        if (!o.isMesh || !o.geometry) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const v = new T.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          if (partName === 'stock') { if (v.z < pZ) pZ = v.z; }
          else { if (v.y > pZ) pZ = v.y; }
        }
      });
      if (!isFinite(pZ)) continue;

      const target = partName === 'stock' ? recZ : recY;
      const axis = partName === 'stock' ? 'z' : 'y';
      const d = target - pZ - 0.004;   // small tolerance so faces do not z-fight
      if (Math.abs(d) > 0.15) continue; // a bigger jump means the proxy is wrong here

      // The pivot does not drive its meshes, so push each mesh in local space.
      const worldDelta = new T.Vector3();
      worldDelta[axis] = d;
      part.traverse(o => {
        if (!o.isMesh) return;
        const parent = o.parent;
        const inv = new T.Matrix4();
        if (parent) inv.copy(parent.matrixWorld).invert();
        o.position.add(worldDelta.clone().applyMatrix4(inv));
      });
      part.userData.basePos = part.position.clone();
    }
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

    // Asset forward: the axis the muzzle points along. Measured per model
    // (probes/probe_slice.mjs): AKM/Deagle/L96/Mosin/Bayonet muzzle at +X,
    // Hecate and MX at -X. A def.flip lets the table correct either case.
    const assetFwd = { x: new T.Vector3(def.flip === -1 ? -1 : 1, 0, 0),
                       y: new T.Vector3(0, def.flip === -1 ? -1 : 1, 0),
                       z: new T.Vector3(0, 0, def.flip === -1 ? -1 : 1) }[axis];
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

    // Scale to real-world length. Blender-unit exports come out ~8-18x too big.
    const scale = long > 0 ? def.length / long : 1;
    root.scale.setScalar(scale);

    // Recompute the fitted box and centre the grip at the origin: translate so
    // the back of the receiver sits at z=0 and the barrel points to -Z.
    // The offset is applied in the PRE-rotation frame on the same pivot as the
    // rotation, so it travels with it: the rear of the weapon lands on z=0
    // along the barrel instead of being shunted sideways.
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

    // Detachable parts. The GLBs are re-exported from Blender with magazines,
    // loose rounds, bolt and scope grouped under named pivot nodes ("mag*",
    // "rounds*", "bolt*", "scope*"); those pivots are what the reload animation
    // and the magazine-drop effect drive. Only top-level pivots are candidates:
    // a nested lookup would grab an attachment's own magazine and move the
    // wrong mesh. When several pivots of one kind exist, the heaviest (most
    // meshes) wins — the primary magazine over a spare.
    const meshCount = (o) => { let n = 0; o.traverse(x => { if (x.isMesh) n++; }); return n; };
    // A real magazine hangs straight down from the receiver; a spare that the
    // separation pass detached floats with its long axis sideways or forward.
    // Verticalness of the long axis is therefore the discriminator, with
    // volume breaking ties (a mag-release catch is also vertical but tiny).
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
    bindPart('mag', /^mag/, true);       // verticalness picks the real magazine
    bindPart('bolt', /^bolt/);           // heaviest is the bolt
    // The separation pass baked cants into the kept parts (the AKM magazine
    // carries a 60deg roll). Those are world-relative editing rotations, not
    // articulation, so clear them BEFORE the inner orientation is composed and
    // the part hangs straight down from the receiver.
    const straighten = (o) => {
      if (!o) return;
      o.rotation.set(0, 0, 0);
      o.quaternion.identity();
      o.userData.baseRot = o.rotation.clone();
    };
    straighten(root.userData.mag);
    straighten(root.userData.bolt);
    // Note: the stock/mag seating runs after the fit box is final (below).
    // Loose rounds and spare magazines are detached on the models; hide every
    // pivot of those kinds except the one bound above, or the spares float in
    // space far off the receiver (a mag pivot can sit 0.45m past the muzzle).
    const hideExtras = (re, keep) => {
      root.traverse(o => {
        if (o === root || o === keep || !re.test(o.name || '')) return;
        // Hide pivots with real geometry; keep structural empties alone so the
        // node graph the reload reads is untouched.
        let meshes = 0;
        o.traverse(x => { if (x.isMesh) meshes++; });
        if (!meshes) return;
        o.traverse(x => { if (x.isMesh) x.visible = false; });
      });
    };
    hideExtras(/^mag/, root.userData.mag);
    // Every rounds_ pivot is a detached loose bullet; the reload only drives
    // the magazine, so there is no "real" rounds pivot to keep - hide them all.
    hideExtras(/^rounds/, null);
    // Scoped rifles keep their glass as its own pivot so ADS stays aligned.
    const scope = pickPart(/^scope/);
    if (scope) { root.userData.scope = scope; scope.userData.basePos = scope.position.clone(); }
    straighten(root.userData.scope);

    // The separation pass detached the stock on several models (the AKM stock
    // folds backwards and *under* the receiver). A real stock extends rearward
    // from the receiver along the bore, so neutralise that pivot instead of
    // hiding a part the weapon needs.
    const stock = pickPart(/^stock/, false);
    if (stock) {
      root.userData.stock = stock;
      stock.userData.basePos = stock.position.clone();
      // Only clear the separation-pass cant; the pivot's children are offset
      // from it, so re-seating by bounding box measures in the unfitted frame
      // and misaligns the whole model. Instead, close the visible gaps to the
      // receiver in world space after the fit is applied (see below).
      stock.rotation.set(0, 0, 0);
      stock.quaternion.identity();
      stock.userData.baseRot = stock.rotation.clone();
    }

    root.userData.fit = {
      exportLong: +long.toFixed(4), scale: +scale.toFixed(5),
      axis, dim: [+fs.x.toFixed(4), +fs.y.toFixed(4), +fs.z.toFixed(4)],
    };
    seatParts(root, T);
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
