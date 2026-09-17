'use strict';
/* ============================================================================
 * POLY-STRIKE procedural visuals.
 *
 * Classic IIFE. Browser: window.PolyVisual. Node tests: module.exports.
 * No DOM access outside guarded canvas-texture helpers, no network, no
 * external assets — everything is THREE primitives + canvas-painted textures.
 *
 *   PolyVisual.buildArena(THREE, scene, C) -> { hitMeshes: [Mesh...] }
 *   PolyVisual.buildBot(THREE, id)         -> THREE.Group
 *   PolyVisual.buildWeapon(THREE, key)     -> THREE.Group
 *
 * Weapons point down -Z (muzzle at tip), origin at the grip so the parent can
 * park the group at (0.32, -0.3, -0.65) in a fixed 65 FOV view scene.
 * Animation handles live on group.userData:
 *   mag / bolt / blade / handleA / handleB / muzzle (Object3D at barrel tip)
 * ==========================================================================*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.PolyVisual = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : this), function () {

  /* ------------------------------------------------------------ helpers -- */
  // Shared material cache: keeps shader programs low across the arena.
  function matCache() {
    const cache = Object.create(null);
    return function get(THREE, key, params) {
      if (cache[key]) return cache[key];
      const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.72, metalness: /Steel|Slide|Blade|Edge|Ring|metal/i.test(key) ? 0.65 : 0.08 }, params));
      cache[key] = m;
      return m;
    };
  }

  function box(THREE, material, w, h, d, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    return m;
  }

  function cyl(THREE, material, rTop, rBot, h, seg, x, y, z) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material);
    m.position.set(x, y, z);
    return m;
  }

  // Cylinder lying along Z (barrels, scope tubes).
  function zcyl(THREE, material, r, h, seg, x, y, z) {
    const m = cyl(THREE, material, r, r, h, seg, x, y, z);
    m.rotation.x = Math.PI / 2;
    return m;
  }

  // Guarded canvas texture: returns null (caller falls back to flat colors)
  // when there is no DOM, so the module stays testable in plain Node.
  function canvasTex(THREE, w, h, painter) {
    try {
      if (typeof document === 'undefined' || !document || typeof document.createElement !== 'function') return null;
      const cv = document.createElement('canvas');
      if (!cv) return null;
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      if (!ctx) return null;
      painter(ctx, w, h);
      const t = new THREE.CanvasTexture(cv);
      if (THREE.sRGBEncoding !== undefined && 'encoding' in t) t.encoding = THREE.sRGBEncoding;
      return t;
    } catch (e) {
      return null;
    }
  }

  function tagMesh(mesh, botId, part) {
    mesh.userData.botId = botId;
    if (part) mesh.userData.part = part;
    return mesh;
  }

  function everyMesh(group, fn) {
    group.traverse(function (o) { if (o.isMesh) fn(o); });
  }

  /* ================================================================ ARENA == */
  function buildArena(THREE, scene, C) {
    const get = matCache();
    const map = (C && C.MAP) || (typeof POLY_CORE !== 'undefined' && POLY_CORE.MAP);
    if (!map || !Array.isArray(map.solids)) throw new Error('buildArena: C.MAP.solids missing');
    const hx = (map.bounds && map.bounds.hx) || 38;
    const hz = (map.bounds && map.bounds.hz) || 38;

    const hitMeshes = [];

    // ---- materials -------------------------------------------------------
    const mSand = get(THREE, 'sand', { color: 0xdcb98a });           // sandstone
    const mSandDark = get(THREE, 'sandD', { color: 0xb8946a });
    const mFloor = get(THREE, 'floor', { color: 0xd2b183 });
    const mFloorAlt = get(THREE, 'floorAlt', { color: 0xc9a877 });
    const mTeal = get(THREE, 'teal', { color: 0x2fa8a0 });
    const mBlue = get(THREE, 'blue', { color: 0x2b6fb8 });
    const mMetal = get(THREE, 'metal', { color: 0x5a6a72 });
    const mWood = get(THREE, 'wood', { color: 0x8a5a33 });
    const mWoodDark = get(THREE, 'woodD', { color: 0x6b4324 });
    const mDark = get(THREE, 'dark', { color: 0x2e2822 });
    const mDune = get(THREE, 'dune', { color: 0xcfab7c });
    const mRock = get(THREE, 'rock', { color: 0x9c8768 });

    // ---- sky + fog -------------------------------------------------------
    const skyTex = canvasTex(THREE, 512, 512, function (ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#7fb4d8');
      g.addColorStop(0.55, '#d8c9a8');
      g.addColorStop(1, '#e8d2a4');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // sun glow
      const sg = ctx.createRadialGradient(w * 0.72, h * 0.3, 8, w * 0.72, h * 0.3, 120);
      sg.addColorStop(0, 'rgba(255,250,230,0.95)');
      sg.addColorStop(0.25, 'rgba(255,240,200,0.55)');
      sg.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, 0, w, h);
      // distant haze bands
      ctx.fillStyle = 'rgba(226,200,158,0.5)';
      ctx.fillRect(0, h * 0.62, w, h * 0.06);
      ctx.fillStyle = 'rgba(218,188,142,0.5)';
      ctx.fillRect(0, h * 0.7, w, h * 0.08);
    });
    try {
      if (skyTex) {
        scene.background = skyTex;
      } else {
        scene.background = new THREE.Color(0xd8c9a8); // flat fallback (no DOM canvas in tests)
      }
      if (THREE.Fog) scene.fog = new THREE.Fog(0xe2cda2, 55, 165);
    } catch (e) { /* background/fog are cosmetic */ }

    // ---- lights only if the scene has none -------------------------------
    let hasLight = false;
    scene.traverse(function (o) { if (o.isLight) hasLight = true; });
    if (!hasLight) {
      scene.add(new THREE.HemisphereLight(0xfff3dc, 0xb99a6d, 0.95));
      const sun = new THREE.DirectionalLight(0xffe9c4, 1.05);
      sun.position.set(34, 55, 18);
      scene.add(sun);
    }

    // ---- ground ----------------------------------------------------------
    const floor = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, 0.5, hz * 2), mFloor);
    floor.position.set(0, -0.25, 0);
    floor.receiveShadow = false;
    scene.add(floor);
    // sand patches for variation
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const px = Math.cos(a * 2.3) * (10 + (i % 3) * 9);
      const pz = Math.sin(a * 1.7) * (10 + ((i + 2) % 3) * 9);
      const patch = new THREE.Mesh(new THREE.BoxGeometry(7 + (i % 3) * 3, 0.06, 5 + (i % 2) * 3), mFloorAlt);
      patch.position.set(px, -0.025, pz);
      patch.rotation.y = a;
      scene.add(patch);
    }

    // ---- painted floor: lane markings + site pads (canvas, 1 draw) -------
    const marksTex = canvasTex(THREE, 1024, 1024, function (ctx, w, h) {
      const W2C = function (x, z) { return [(x + hx) / (hx * 2) * w, (z + hz) / (hz * 2) * h]; };
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';
      // mid dashed line (spawn to mid doors)
      ctx.strokeStyle = 'rgba(47,168,160,0.85)'; ctx.lineWidth = 7; ctx.setLineDash([26, 20]);
      ctx.beginPath();
      let p = W2C(0, 36), q = W2C(0, 6);
      ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      // lanes to A (NE) and B (SW)
      ctx.strokeStyle = 'rgba(43,111,184,0.8)'; ctx.lineWidth = 6;
      p = W2C(4, 2); q = W2C(22, -18);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      p = W2C(-4, 2); q = W2C(-22, 18);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      ctx.setLineDash([]);
      // site pads: translucent rectangles around A and B sites
      const pad = function (cx, cz, wWorld, dWorld, col) {
        const a = W2C(cx - wWorld / 2, cz - dWorld / 2), b = W2C(cx + wWorld / 2, cz + dWorld / 2);
        ctx.fillStyle = col;
        ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
        ctx.strokeStyle = col; ctx.lineWidth = 10;
        ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      };
      pad(24, -24, 14, 14, 'rgba(47,168,160,0.30)');
      pad(-24, 24, 14, 14, 'rgba(43,111,184,0.30)');
      // stenciled letters on the pads
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 150px monospace';
      ctx.fillStyle = 'rgba(20,60,60,0.65)';
      p = W2C(29, -29); ctx.fillText('A', p[0], p[1]);
      p = W2C(-29, 29); ctx.fillText('B', p[0], p[1]);
    });
    if (marksTex) {
      const marks = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2, hz * 2), new THREE.MeshBasicMaterial({
        map: marksTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
      }));
      marks.rotation.x = -Math.PI / 2;
      marks.position.y = 0.012;
      marks.renderOrder = 1;
      scene.add(marks);
    } else {
      // flat-color fallback: dashed lane strips (still cheap)
      const dash = function (x, z, len, across, m) {
        for (let i = 0; i < 8; i++) {
          const d = new THREE.Mesh(new THREE.BoxGeometry(across, 0.02, len / 16), m);
          d.position.set(x + (across ? 0 : 0), 0.02, z - len / 2 + (i * 2 + 1) * (len / 16));
          scene.add(d);
        }
      };
      dash(0, 21, 28, 0.22, mTeal);
      for (let i = 0; i < 8; i++) {
        const d = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 1.4), mBlue);
        d.position.set(4 + i * 2.4, 0.02, 2 - i * 2.4); scene.add(d);
        const e = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 1.4), mBlue);
        e.position.set(-4 - i * 2.4, 0.02, 2 + i * 2.4); scene.add(e);
      }
    }

    // ---- solids: buildings, walls, crates (raycast colliders) ------------
    const windowMat = get(THREE, 'win', { color: 0x1d2a30 });

    function buildBuilding(s) {
      const g = new THREE.Group();
      // main mass = collider
      const body = box(THREE, mSand, s.w, s.h, s.d, s.x, s.h / 2, s.z);
      body.userData.solid = { x: s.x, z: s.z, w: s.w, d: s.d, h: s.h, kind: s.kind };
      g.add(body); hitMeshes.push(body);
      // skirt + roof slab
      g.add(box(THREE, mSandDark, s.w + 0.5, 0.7, s.d + 0.5, s.x, 0.35, s.z));
      g.add(box(THREE, mSandDark, s.w + 0.6, 0.35, s.d + 0.4, s.x, s.h + 0.1, s.z));
      // parapet trims
      const pw = s.w / 2, pd = s.d / 2;
      g.add(box(THREE, mTeal, s.w + 0.3, 0.14, 0.14, s.x, s.h + 0.32, s.z - pd));
      g.add(box(THREE, mTeal, s.w + 0.3, 0.14, 0.14, s.x, s.h + 0.32, s.z + pd));
      g.add(box(THREE, mTeal, 0.14, 0.14, s.d + 0.3, s.x - pw, s.h + 0.32, s.z));
      g.add(box(THREE, mTeal, 0.14, 0.14, s.d + 0.14, s.x + pw, s.h + 0.32, s.z));
      // windows on the ±z faces (two rows)
      const rows = s.h > 4 ? 2 : 1;
      const cols = Math.max(2, Math.floor(s.w / 3));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wx = s.x - s.w / 2 + (c + 0.5) * (s.w / cols);
          const wy = s.h > 4 ? (r === 0 ? s.h * 0.32 : s.h * 0.7) : s.h * 0.45;
          const frame = box(THREE, mBlue, 1.1, 1.3, 0.12, wx, wy, s.z - pd - 0.02);
          g.add(frame);
          g.add(box(THREE, windowMat, 0.9, 1.1, 0.1, wx, wy, s.z - pd - 0.1));
          const frame2 = box(THREE, mBlue, 1.1, 1.3, 0.12, wx, wy, s.z + pd + 0.02);
          g.add(frame2);
          g.add(box(THREE, windowMat, 0.9, 1.1, 0.1, wx, wy, s.z + pd + 0.1));
        }
      }
      // awning over one face + roof box (AC unit)
      g.add(box(THREE, mTeal, s.w * 0.55, 0.12, 1.1, s.x, s.h * 0.62, s.z + pd + 0.55));
      g.add(box(THREE, mMetal, 1.4, 0.7, 1.2, s.x + s.w * 0.22, s.h + 0.6, s.z));
      g.add(cyl(THREE, mMetal, 0.03, 0.03, 2.2, 6, s.x - s.w * 0.3, s.h + 1.4, s.z));
      scene.add(g);
      return g;
    }

    function buildWall(s) {
      const g = new THREE.Group();
      const along = s.w >= s.d; // long axis
      const body = along
        ? box(THREE, mSand, s.w, s.h, s.d, s.x, s.h / 2, s.z)
        : box(THREE, mSand, s.w, s.h, s.d, s.x, s.h / 2, s.z);
      body.userData.solid = { x: s.x, z: s.z, w: s.w, d: s.d, h: s.h, kind: s.kind };
      g.add(body); hitMeshes.push(body);
      // teal cap line + dark base
      if (along) {
        g.add(box(THREE, mTeal, s.w + 0.2, 0.12, s.d + 0.2, s.x, s.h + 0.06, s.z));
        g.add(box(THREE, mSandDark, s.w, 0.5, s.d + 0.12, s.x, 0.25, s.z));
      } else {
        g.add(box(THREE, mTeal, s.w + 0.2, 0.12, s.d + 0.2, s.x, s.h + 0.06, s.z));
        g.add(box(THREE, mSandDark, s.w + 0.12, 0.5, s.d, s.x, 0.25, s.z));
      }
      scene.add(g);
      return g;
    }

    function buildCrate(s) {
      const g = new THREE.Group();
      const body = box(THREE, mWood, s.w, s.h, s.d, s.x, s.h / 2, s.z);
      body.userData.solid = { x: s.x, z: s.z, w: s.w, d: s.d, h: s.h, kind: s.kind };
      g.add(body); hitMeshes.push(body);
      // lid line + corner brackets + blue band
      g.add(box(THREE, mWoodDark, s.w + 0.06, 0.1, s.d + 0.06, s.x, s.h - 0.12, s.z));
      g.add(box(THREE, mBlue, s.w + 0.04, 0.22, s.d + 0.04, s.x, s.h * 0.55, s.z));
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.add(box(THREE, mWoodDark, 0.16, s.h + 0.05, 0.16, s.x + ox * (s.w / 2 - 0.1), s.h / 2, s.z + oz * (s.d / 2 - 0.1)));
      }
      scene.add(g);
      return g;
    }

    for (const s of map.solids) {
      if (s.kind === 'building') buildBuilding(s);
      else if (s.kind === 'crate') buildCrate(s);
      else buildWall(s);
    }

    // ---- perimeter walls + corner towers (colliders) ----------------------
    const wallH = 5, wallT = 1.5, wallLen = hx * 2 + wallT * 2;
    const perims = [
      { x: 0, z: hz + wallT / 2, w: wallLen, d: wallT },
      { x: 0, z: -hz - wallT / 2, w: wallLen, d: wallT },
      { x: hx + wallT / 2, z: 0, w: wallT, d: hz * 2 },
      { x: -hx - wallT / 2, z: 0, w: wallT, d: hz * 2 },
    ];
    for (const s of perims) {
      const body = box(THREE, mSandDark, s.w, wallH, s.d, s.x, wallH / 2, s.z);
      body.userData.solid = { x: s.x, z: s.z, w: s.w, d: s.d, h: wallH, kind: 'perimeter' };
      scene.add(body); hitMeshes.push(body);
      const along = s.w > s.d;
      scene.add(box(THREE, mTeal, along ? s.w : 0.3, 0.16, along ? 0.3 : s.d, s.x, wallH + 0.08, s.z));
      scene.add(box(THREE, mSand, along ? s.w : 0.5, 0.6, along ? 0.5 : s.d, s.x, wallH + 0.4, s.z));
    }
    for (const [tx, tz] of [[hx + 2, hz + 2], [-hx - 2, hz + 2], [hx + 2, -hz - 2], [-hx - 2, -hz - 2]]) {
      scene.add(box(THREE, mSand, 3.2, wallH + 2.2, 3.2, tx, (wallH + 2.2) / 2, tz));
      scene.add(box(THREE, mSandDark, 3.8, 0.5, 3.8, tx, wallH + 2.4, tz));
      scene.add(cyl(THREE, mTeal, 0.05, 0.05, 2.4, 6, tx, wallH + 3.8, tz)); // antenna
    }

    // ---- site A/B canvas signs (no external assets) -----------------------
    const siteSign = function (letter, x, z, ry) {
      const g = new THREE.Group();
      const tex = canvasTex(THREE, 256, 192, function (ctx, w, h) {
        ctx.fillStyle = '#123c3c'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#2fa8a0'; ctx.lineWidth = 14; ctx.strokeRect(10, 10, w - 20, h - 20);
        ctx.fillStyle = '#e8d9b0';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 150px monospace';
        ctx.fillText(letter, w / 2, h / 2 + 8);
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.7), new THREE.MeshBasicMaterial({
        map: tex || null, color: tex ? 0xffffff : (letter === 'A' ? 0x2fa8a0 : 0x2b6fb8), side: THREE.DoubleSide,
      }));
      plane.position.y = 2.4;
      g.add(plane);
      g.add(box(THREE, mMetal, 0.14, 2.6, 0.14, -1.4, 1.3, 0));
      g.add(box(THREE, mMetal, 0.14, 2.6, 0.14, 1.4, 1.3, 0));
      g.add(box(THREE, mDark, 4.2, 0.22, 0.3, 0, 3.85, 0));
      g.position.set(x, 6.2, z);
      g.rotation.y = ry;
      scene.add(g);
      return g;
    };
    siteSign('A', 24, -19.6, 0);       // faces spawn (plane default faces +z)
    siteSign('B', -24, 19.6, Math.PI); // faces spawn from B side

    // ---- atmosphere: barrels, ruins, rocks, dunes -------------------------
    function barrel(x, z, m) {
      const g = new THREE.Group();
      g.add(cyl(THREE, m, 0.5, 0.5, 1.2, 12, 0, 0.6, 0));
      g.add(cyl(THREE, mMetal, 0.54, 0.54, 0.12, 12, 0, 0.25, 0));
      g.add(cyl(THREE, mMetal, 0.54, 0.54, 0.12, 12, 0, 0.95, 0));
      g.position.set(x, 2, z); // on existing crate lids
      scene.add(g);
    }
    // All ground-level props stay inside core solid footprints; decorative
    // geometry must never introduce unregistered movement blockers.
    barrel(13, -28, mTeal); barrel(31, -12, mBlue);
    barrel(-13, 28, mTeal); barrel(-31, 12, mBlue);

    // broken colonnade near mid (desert ruin vibe)
    function ruin(x, z, rot) {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const h = 1.6 + (i % 2) * 0.9;
        g.add(cyl(THREE, mSandDark, 0.35, 0.42, h, 10, -1.2 + i * 1.2, h / 2, 0));
        g.add(box(THREE, mSand, 0.9, 0.25, 0.9, -1.2 + i * 1.2, h + 0.12, 0));
      }
      g.add(box(THREE, mTeal, 1.6, 0.18, 0.5, 0, 1.9, 0.9));
      g.position.set(x, 6.4, z); g.rotation.y = rot;
      scene.add(g);
    }
    ruin(-4.0, 0, Math.PI / 2); ruin(4.0, 0, Math.PI / 2);

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      const r = Math.hypot(hx, hz) + 8 + (i % 3) * 4;
      const rock = new THREE.Mesh(new THREE.BoxGeometry(1.2 + (i % 2), 0.9, 1.4), mRock);
      rock.position.set(Math.cos(a) * r, 0.4, Math.sin(a) * r);
      rock.rotation.y = a;
      scene.add(rock);
    }

    // dune ring outside the walls (decorative, not colliders)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      const r = 52 + (i % 3) * 7;
      const dune = new THREE.Mesh(new THREE.SphereGeometry(10 + (i % 3) * 4, 10, 6), mDune);
      dune.position.set(Math.cos(a) * r, -4.5, Math.sin(a) * r);
      dune.scale.y = 0.42;
      scene.add(dune);
    }

    scene.updateMatrixWorld(true); // colliders work even before first render
    return { hitMeshes: hitMeshes };
  }

  /* ================================================================== BOT == */
  // 1.8m enemy operator. All meshes carry userData.botId + a part tag so the
  // parent's raycaster can resolve head/body/legs hits. userData.legs is the
  // hip pivot group for walk animation; userData.arms the shoulder pivot.
  function buildBot(THREE, id) {
    const get = matCache();
    const mCloth = get(THREE, 'bCloth', { color: 0x7a6a4f });   // olive/sand fatigues
    const mClothD = get(THREE, 'bClothD', { color: 0x5d513c });
    const mVest = get(THREE, 'bVest', { color: 0x3a3f45 });
    const mTeal = get(THREE, 'bTeal', { color: 0x2fa8a0 });
    const mSkin = get(THREE, 'bSkin', { color: 0xc9986a });
    const mMask = get(THREE, 'bMask', { color: 0x23262b });
    const mVisor = get(THREE, 'bVisor', { color: 0xd0182e });   // red enemy accent
    const mBoot = get(THREE, 'bBoot', { color: 0x2b2620 });
    const mGun = get(THREE, 'bGun', { color: 0x33302c });

    const root = new THREE.Group();
    root.userData.botId = id;
    root.userData.legs = null;

    // legs (pivot at hips, y = 0.95)
    const legs = new THREE.Group();
    legs.position.y = 0.95;
    root.add(legs);
    for (const side of [-1, 1]) {
      const thigh = tagMesh(box(THREE, mCloth, 0.19, 0.48, 0.21, side * 0.13, -0.24, 0), id, 'legs');
      legs.add(thigh);
      const shin = tagMesh(box(THREE, mClothD, 0.16, 0.44, 0.18, side * 0.13, -0.68, 0.01), id, 'legs');
      legs.add(shin);
      const boot = tagMesh(box(THREE, mBoot, 0.18, 0.14, 0.3, side * 0.13, -0.92, 0.05), id, 'legs');
      legs.add(boot);
    }
    const hips = tagMesh(box(THREE, mClothD, 0.42, 0.16, 0.26, 0, 0.02, 0), id, 'legs');
    legs.add(hips);
    root.userData.legs = legs;

    // torso (body)
    const torso = tagMesh(box(THREE, mCloth, 0.5, 0.6, 0.3, 0, 1.28, 0), id, 'body');
    root.add(torso);
    const vest = tagMesh(box(THREE, mVest, 0.46, 0.4, 0.34, 0, 1.3, 0.02), id, 'body');
    root.add(vest);
    const pouch = tagMesh(box(THREE, mVest, 0.3, 0.12, 0.1, 0, 1.06, 0.16), id, 'body');
    pouch.material = mVisor; // red enemy accent pouch
    root.add(pouch);
    const belt = tagMesh(box(THREE, mMask, 0.52, 0.08, 0.32, 0, 0.99, 0), id, 'body');
    root.add(belt);

    // arms holding a rifle forward
    const arms = new THREE.Group();
    arms.position.y = 1.5;
    root.add(arms);
    root.userData.arms = arms;
    for (const side of [-1, 1]) {
      const upper = tagMesh(box(THREE, mCloth, 0.14, 0.34, 0.16, side * 0.32, -0.08, 0.04), id, 'body');
      upper.rotation.z = side * 0.5;
      arms.add(upper);
      const fore = tagMesh(box(THREE, mClothD, 0.12, 0.3, 0.14, side * 0.22, -0.3, 0.22), id, 'body');
      fore.rotation.x = 0.7;
      arms.add(fore);
      const glove = tagMesh(box(THREE, mBoot, 0.13, 0.13, 0.16, side * 0.18, -0.4, 0.4), id, 'body');
      arms.add(glove);
    }
    // rifle stub in hands
    const rifle = new THREE.Group();
    rifle.add(tagMesh(box(THREE, mGun, 0.06, 0.1, 0.62, 0, 0, 0.1), id, 'body'));
    rifle.add(tagMesh(zcyl(THREE, mGun, 0.02, 0.34, 8, 0, 0.01, -0.32), id, 'body'));
    rifle.add(tagMesh(box(THREE, mVisor, 0.05, 0.16, 0.08, 0, -0.1, 0.08), id, 'body')); // red mag
    rifle.position.set(0, -0.38, 0.42);
    arms.add(rifle);

    // head
    const head = new THREE.Group();
    head.position.y = 1.55;
    root.add(head);
    const skull = tagMesh(box(THREE, mMask, 0.26, 0.28, 0.27, 0, 0.12, 0), id, 'head');
    head.add(skull);
    const face = tagMesh(box(THREE, mSkin, 0.2, 0.1, 0.06, 0, 0.08, 0.13), id, 'head');
    head.add(face);
    const visor = tagMesh(box(THREE, mVisor, 0.28, 0.05, 0.29, 0, 0.2, 0), id, 'head');
    head.add(visor);
    const helmet = tagMesh(box(THREE, mClothD, 0.3, 0.08, 0.31, 0, 0.28, 0), id, 'head');
    head.add(helmet);

    return root;
  }

  /* ============================================================== WEAPONS == */
  // Gloves: dark teal-gray glove with cuff, palm + fingers + thumb.
  function buildGlove(THREE, get) {
    const g = new THREE.Group();
    const mGlove = get(THREE, 'glove', { color: 0x37474f });
    const mCuff = get(THREE, 'cuff', { color: 0xb01426 });   // red loadout cuff
    g.add(box(THREE, mGlove, 0.075, 0.035, 0.1, 0, 0, 0));                 // palm
    g.add(box(THREE, mGlove, 0.07, 0.028, 0.045, 0, -0.004, -0.066));      // fingers
    g.add(box(THREE, mGlove, 0.024, 0.026, 0.055, 0.045, 0.002, -0.02));   // thumb
    g.add(box(THREE, mCuff, 0.085, 0.05, 0.05, 0, -0.005, 0.07));          // cuff
    return g;
  }

  /* --- AK-47: wood furniture, curved mag, sliding bolt, iron sights ------- */
  function buildAK47(THREE, get) {
    const g = new THREE.Group();
    const mSteel = get(THREE, 'akSteel', { color: 0x3a3a3e });
    const mSteelD = get(THREE, 'akSteelD', { color: 0x24242a });
    const mWood = get(THREE, 'akWood', { color: 0x8a5a2b });
    const mWoodD = get(THREE, 'akWoodD', { color: 0x6e4426 });
    const mTeal = get(THREE, 'akTeal', { color: 0x2fa8a0 });

    // receiver
    g.add(box(THREE, mSteel, 0.058, 0.075, 0.3, 0, 0.02, -0.01));
    g.add(box(THREE, mSteelD, 0.05, 0.02, 0.28, 0, 0.055, -0.01));          // dust cover
    g.add(box(THREE, mTeal, 0.062, 0.012, 0.1, 0, 0.03, -0.14));            // teal selector accent

    // barrel + gas block + muzzle brake
    g.add(zcyl(THREE, mSteelD, 0.011, 0.34, 10, 0, 0.028, -0.4));
    g.add(box(THREE, mSteel, 0.024, 0.035, 0.06, 0, 0.045, -0.29));         // gas block
    g.add(zcyl(THREE, mSteel, 0.009, 0.16, 8, 0, 0.058, -0.3));             // gas tube
    const brake = zcyl(THREE, mSteelD, 0.017, 0.05, 10, 0, 0.028, -0.575);
    g.add(brake);
    g.add(zcyl(THREE, mTeal, 0.018, 0.012, 10, 0, 0.028, -0.59));           // teal muzzle ring

    // handguard (lower wood + upper wood)
    g.add(box(THREE, mWood, 0.05, 0.045, 0.16, 0, 0.005, -0.28));
    g.add(box(THREE, mWoodD, 0.042, 0.02, 0.16, 0, 0.048, -0.28));

    // stock
    const stock = box(THREE, mWood, 0.045, 0.08, 0.26, 0, -0.005, 0.29);
    stock.rotation.x = -0.06;
    g.add(stock);
    g.add(box(THREE, mSteelD, 0.05, 0.06, 0.03, 0, 0.0, 0.415));            // butt pad

    // grip + trigger
    const grip = box(THREE, mWoodD, 0.032, 0.09, 0.045, 0, -0.06, 0.1);
    grip.rotation.x = 0.35;
    g.add(grip);
    g.add(box(THREE, mSteelD, 0.008, 0.03, 0.008, 0, -0.028, 0.05));        // trigger
    g.add(box(THREE, mSteelD, 0.008, 0.008, 0.09, 0, -0.045, 0.05));        // guard bottom

    // iron sights: front post + rear notch
    const frontBase = box(THREE, mSteel, 0.014, 0.03, 0.02, 0, 0.052, -0.53);
    frontBase.userData.sight = 'front';
    g.add(frontBase);
    g.add(box(THREE, mTeal, 0.006, 0.014, 0.006, 0, 0.072, -0.53));
    const rearBase = box(THREE, mSteel, 0.03, 0.02, 0.03, 0, 0.075, -0.12);
    rearBase.userData.sight = 'rear';
    g.add(rearBase);
    g.add(box(THREE, mSteelD, 0.006, 0.016, 0.006, -0.012, 0.09, -0.12));
    g.add(box(THREE, mSteelD, 0.006, 0.016, 0.006, 0.012, 0.09, -0.12));

    // curved magazine (pivot at mag well for reload anim)
    const mag = new THREE.Group();
    mag.position.set(0, -0.035, -0.04);
    const segs = [
      { z: -0.02, y: -0.035, rx: 0.12 },
      { z: -0.055, y: -0.1, rx: 0.3 },
      { z: -0.07, y: -0.16, rx: 0.5 },
    ];
    for (const s of segs) {
      const b = box(THREE, mSteelD, 0.036, 0.075, 0.07, 0, s.y, s.z);
      b.rotation.x = s.rx;
      mag.add(b);
    }
    mag.add(box(THREE, mTeal, 0.04, 0.012, 0.075, 0, -0.2, -0.075));        // floor plate
    g.add(mag);

    // sliding bolt (right side of receiver)
    const bolt = new THREE.Group();
    bolt.position.set(0.034, 0.045, 0.02);
    const boltBody = box(THREE, mSteel, 0.014, 0.016, 0.07, 0, 0, 0);
    boltBody.userData.bolt = true;
    bolt.add(boltBody);
    bolt.add(box(THREE, mSteelD, 0.012, 0.01, 0.02, 0, 0, 0.04));           // bolt handle
    g.add(bolt);

    // hands: trigger glove right, support glove on handguard
    const gloveR = buildGlove(THREE, get);
    gloveR.position.set(0, -0.05, 0.12);
    gloveR.rotation.x = 0.5;
    g.add(gloveR);
    const gloveL = buildGlove(THREE, get);
    gloveL.position.set(-0.01, -0.04, -0.26);
    gloveL.rotation.x = 0.35;
    g.add(gloveL);

    // muzzle anchor at barrel tip
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.028, -0.6);
    g.add(muzzle);

    g.userData = {
      kind: 'ak47', mag: mag, bolt: bolt, muzzle: muzzle,
      muzzleTip: muzzle.position.clone(),
    };
    return g;
  }

  /* --- AWP: long barrel, 3D scope (rings + lens), bolt w/ handle ---------- */
  function buildAWP(THREE, get) {
    const g = new THREE.Group();
    const mBody = get(THREE, 'awpBody', { color: 0x3d4a3f });               // olive-green chassis
    const mBodyD = get(THREE, 'awpBodyD', { color: 0x2b352d });
    const mSteel = get(THREE, 'awpSteel', { color: 0x2c2c30 });
    const mRing = get(THREE, 'awpRing', { color: 0x22262a });
    const mTeal = get(THREE, 'awpTeal', { color: 0x2fa8a0 });
    const mLens = get(THREE, 'awpLens', { color: 0x0d3038 });               // dark teal glass

    // chassis / receiver
    g.add(box(THREE, mBody, 0.05, 0.08, 0.5, 0, 0, 0));
    g.add(box(THREE, mBodyD, 0.052, 0.02, 0.46, 0, 0.05, 0));               // top rail

    // long barrel + muzzle
    g.add(zcyl(THREE, mSteel, 0.014, 0.4, 10, 0, 0.02, -0.44));
    g.add(zcyl(THREE, mSteel, 0.02, 0.06, 10, 0, 0.02, -0.63));             // muzzle brake
    g.add(zcyl(THREE, mTeal, 0.021, 0.014, 10, 0, 0.02, -0.66));

    // stock w/ cheek riser + pad + thumbhole cut suggestion
    const stock = box(THREE, mBody, 0.048, 0.11, 0.3, 0, -0.01, 0.4);
    stock.rotation.x = -0.04;
    g.add(stock);
    g.add(box(THREE, mBodyD, 0.04, 0.04, 0.18, 0, 0.055, 0.36));            // cheek riser
    g.add(box(THREE, mSteel, 0.05, 0.13, 0.03, 0, -0.01, 0.555));           // recoil pad
    g.add(box(THREE, mTeal, 0.054, 0.014, 0.1, 0, -0.03, 0.42));            // teal inlay

    // 3D scope: tube + objective/ocular bells + two rings + lens + turrets
    const scope = new THREE.Group();
    scope.position.set(0, 0.105, -0.02);
    scope.add(zcyl(THREE, mRing, 0.028, 0.2, 12, 0, 0, 0));                 // main tube
    scope.add(zcyl(THREE, mRing, 0.04, 0.055, 12, 0, 0, -0.125));           // objective bell
    scope.add(zcyl(THREE, mRing, 0.034, 0.045, 12, 0, 0, 0.115));           // ocular
    scope.add(zcyl(THREE, mTeal, 0.030, 0.008, 12, 0, 0, -0.148));          // trim ring
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.032, 16), new THREE.MeshBasicMaterial({ color: 0x11333c }));
    lens.position.set(0, 0, -0.1505);
    lens.rotation.y = Math.PI;                                              // face forward (-Z)
    scope.add(lens);
    const eyeLens = new THREE.Mesh(new THREE.CircleGeometry(0.026, 16), new THREE.MeshBasicMaterial({ color: 0x0c2429 }));
    eyeLens.position.set(0, 0, 0.139);
    scope.add(eyeLens);
    scope.add(cyl(THREE, mRing, 0.014, 0.014, 0.03, 10, 0, 0.04, 0.02));    // elevation turret
    scope.add(cyl(THREE, mTeal, 0.012, 0.012, 0.024, 10, 0.032, 0, 0.02));  // windage turret
    // Separate raised scope clamp rings, not just a solid tube silhouette.
    for (const z of [-0.06, 0.05]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.006, 6, 16), mTeal);
      ring.position.z = z;
      ring.name = 'scope-clamp-ring';
      scope.add(ring);
    }
    scope.add(box(THREE, mSteel, 0.02, 0.05, 0.03, 0, -0.03, -0.06));       // front mount
    scope.add(box(THREE, mSteel, 0.02, 0.05, 0.03, 0, -0.03, 0.05));        // rear mount
    g.add(scope);

    // iron backup sights
    const fs = box(THREE, mSteel, 0.01, 0.02, 0.01, 0, 0.085, -0.6);
    fs.userData.sight = 'front';
    g.add(fs);
    const rs = box(THREE, mSteel, 0.024, 0.018, 0.012, 0, 0.085, 0.2);
    rs.userData.sight = 'rear';
    g.add(rs);

    // magazine
    const mag = new THREE.Group();
    mag.position.set(0, -0.045, -0.06);
    mag.add(box(THREE, mBodyD, 0.042, 0.07, 0.12, 0, -0.03, 0));
    mag.add(box(THREE, mTeal, 0.046, 0.012, 0.124, 0, -0.068, 0));
    g.add(mag);

    // bolt assembly w/ handle (cyclable for shots)
    const bolt = new THREE.Group();
    bolt.position.set(0.028, 0.055, 0.06);
    bolt.add(zcyl(THREE, mSteel, 0.01, 0.09, 8, 0, 0, 0));
    const handle = box(THREE, mSteel, 0.055, 0.012, 0.012, 0.03, -0.01, 0.01);
    handle.rotation.z = 0.2;
    bolt.add(handle);
    g.add(bolt);

    // trigger + guard
    g.add(box(THREE, mSteel, 0.008, 0.03, 0.008, 0, -0.05, 0.1));
    g.add(box(THREE, mBodyD, 0.01, 0.01, 0.1, 0, -0.068, 0.09));

    // hands: trigger glove + support glove at the fore-end
    const gloveR = buildGlove(THREE, get);
    gloveR.position.set(0, -0.06, 0.16);
    gloveR.rotation.x = 0.5;
    g.add(gloveR);
    const gloveL = buildGlove(THREE, get);
    gloveL.position.set(-0.005, -0.05, -0.2);
    gloveL.rotation.x = 0.3;
    g.add(gloveL);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.02, -0.67);
    g.add(muzzle);

    g.userData = {
      kind: 'awp', mag: mag, bolt: bolt, scope: scope, muzzle: muzzle,
      muzzleTip: muzzle.position.clone(),
    };
    return g;
  }

  /* --- Desert Eagle: slab slide, triangular barrel, boxy grip ------------- */
  function buildDeagle(THREE, get) {
    const g = new THREE.Group();
    const mSlide = get(THREE, 'dgSlide', { color: 0x6f6a5c });              // brushed steel
    const mFrame = get(THREE, 'dgFrame', { color: 0x3a3f45 });
    const mGrip = get(THREE, 'dgGrip', { color: 0x23262b });
    const mSteel = get(THREE, 'dgSteel', { color: 0x2a2a2e });
    const mTeal = get(THREE, 'dgTeal', { color: 0x2fa8a0 });
    const mGold = get(THREE, 'dgAcc', { color: 0x2b6fb8 });                 // blue accents

    // frame + slide
    g.add(box(THREE, mFrame, 0.032, 0.045, 0.2, 0, -0.012, -0.03));
    const slide = new THREE.Group();
    slide.position.set(0, 0.018, 0);
    slide.add(box(THREE, mSlide, 0.036, 0.036, 0.24, 0, 0, -0.05));
    // deagle triangular barrel top
    slide.add(box(THREE, mSlide, 0.026, 0.018, 0.14, 0, 0.024, -0.1));
    slide.add(box(THREE, mGold, 0.038, 0.006, 0.2, 0, -0.017, -0.05));      // slide serration line
    // sights on slide
    const fs = box(THREE, mGold, 0.007, 0.012, 0.01, 0, 0.04, -0.155);
    fs.userData.sight = 'front';
    slide.add(fs);
    const rs = box(THREE, mGold, 0.02, 0.01, 0.01, 0, 0.039, 0.06);
    rs.userData.sight = 'rear';
    slide.add(rs);
    g.add(slide);

    // grip (raked back) + mag inside (pivot for reload)
    const grip = box(THREE, mGrip, 0.034, 0.1, 0.05, 0, -0.07, 0.06);
    grip.rotation.x = 0.18;
    g.add(grip);
    const mag = new THREE.Group();
    mag.position.set(0, -0.06, 0.055);
    mag.rotation.x = 0.18;
    mag.add(box(THREE, mSlide, 0.026, 0.075, 0.04, 0, -0.02, 0));
    mag.add(box(THREE, mGold, 0.03, 0.012, 0.044, 0, -0.062, 0));           // basepad
    g.add(mag);

    // trigger + guard + hammer
    g.add(box(THREE, mGold, 0.008, 0.024, 0.007, 0, -0.038, 0.005));
    g.add(box(THREE, mFrame, 0.009, 0.008, 0.06, 0, -0.056, 0.0));
    const hammer = box(THREE, mSteel, 0.012, 0.02, 0.012, 0, 0.012, 0.085);
    hammer.rotation.x = -0.5;
    g.add(hammer);

    // hands: two-hand grip
    const gloveR = buildGlove(THREE, get);
    gloveR.position.set(0.005, -0.085, 0.085);
    gloveR.rotation.x = 0.55;
    g.add(gloveR);
    const gloveL = buildGlove(THREE, get);
    gloveL.position.set(-0.035, -0.075, 0.075);
    gloveL.rotation.set(0.55, 0.4, 0.5);
    g.add(gloveL);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.03, -0.18);
    g.add(muzzle);

    g.userData = { kind: 'deagle', mag: mag, bolt: slide, muzzle: muzzle, muzzleTip: muzzle.position.clone() };
    return g;
  }

  /* --- Butterfly knife: pivoted handles A/B + swinging blade -------------- */
  function buildKnife(THREE, get) {
    const g = new THREE.Group();
    const mBlade = get(THREE, 'kfBlade', { color: 0xc7ccd1 });              // satin steel
    const mEdge = get(THREE, 'kfEdge', { color: 0xeef2f4 });
    const mHandle = get(THREE, 'kfHandle', { color: 0x23262b });            // black handles
    const mTeal = get(THREE, 'kfTeal', { color: 0x2fa8a0 });
    const mBlue = get(THREE, 'kfBlue', { color: 0x2b6fb8 });

    // blade: flat stock tapering to a spear point, pivot at origin
    const blade = new THREE.Group();
    blade.position.set(0, 0, 0);
    const stock = box(THREE, mBlade, 0.03, 0.006, 0.15, 0, 0, -0.085);
    blade.add(stock);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0155, 0.05, 4), mBlade);
    tip.rotation.x = -Math.PI / 2;                                          // point down -Z
    tip.geometry.rotateY(Math.PI / 4);                                     // preserve -Z pointing axis
    tip.scale.set(1, 1, 0.2);                                               // flatten like a blade point
    tip.position.set(0, 0, -0.185);
    blade.add(tip);
    blade.add(box(THREE, mEdge, 0.006, 0.008, 0.14, 0.013, -0.001, -0.09)); // sharpened edge
    blade.add(box(THREE, mBlue, 0.012, 0.008, 0.02, 0, 0.006, -0.005));     // blue spine accent
    // pivot pins
    blade.add(cyl(THREE, mTeal, 0.006, 0.006, 0.036, 8, 0, 0, 0));
    blade.children[blade.children.length - 1].rotation.z = Math.PI / 2;
    g.add(blade);

    // two handles, both pivoting on X at the junction (butterfly flip anim)
    const handleA = new THREE.Group();
    handleA.position.set(0, 0.014, 0.006);
    handleA.add(box(THREE, mHandle, 0.016, 0.01, 0.16, 0, 0, 0.088));
    handleA.add(box(THREE, mTeal, 0.018, 0.012, 0.02, 0, 0, 0.172));        // latch end
    handleA.add(cyl(THREE, mBlue, 0.005, 0.005, 0.02, 8, 0, 0, 0.03));
    handleA.children[handleA.children.length - 1].rotation.z = Math.PI / 2;
    handleA.add(cyl(THREE, mBlue, 0.005, 0.005, 0.02, 8, 0, 0, 0.14));
    handleA.children[handleA.children.length - 1].rotation.z = Math.PI / 2;
    g.add(handleA);

    const handleB = new THREE.Group();
    handleB.position.set(0, -0.014, 0.006);
    handleB.add(box(THREE, mHandle, 0.016, 0.01, 0.16, 0, 0, 0.088));
    handleB.add(box(THREE, mBlue, 0.018, 0.012, 0.02, 0, 0, 0.172));        // tail end
    handleB.add(cyl(THREE, mTeal, 0.005, 0.005, 0.02, 8, 0, 0, 0.03));
    handleB.children[handleB.children.length - 1].rotation.z = Math.PI / 2;
    handleB.add(cyl(THREE, mTeal, 0.005, 0.005, 0.02, 8, 0, 0, 0.14));
    handleB.children[handleB.children.length - 1].rotation.z = Math.PI / 2;
    g.add(handleB);

    // grip hand wraps the lower handle
    const gloveR = buildGlove(THREE, get);
    gloveR.position.set(0, -0.016, 0.11);
    gloveR.rotation.x = 0.4;
    g.add(gloveR);

    g.userData = { kind: 'knife', blade: blade, handleA: handleA, handleB: handleB };
    return g;
  }

  const WEAPON_BUILDERS = { ak47: buildAK47, awp: buildAWP, deagle: buildDeagle, knife: buildKnife };

  // View model: fires down -Z, origin at the grip so the parent can place it
  // at (0.32, -0.3, -0.65) with a fixed 65 FOV camera.
  function buildWeapon(THREE, key) {
    const builder = Object.prototype.hasOwnProperty.call(WEAPON_BUILDERS, key) && WEAPON_BUILDERS[key];
    if (!builder) throw new Error('buildWeapon: unknown weapon "' + key + '"');
    const cached = matCache();
    // Crimson lacquer, graphite hardware and scarlet trim: one local skin
    // family across the arsenal. Glass and gloves retain their own materials.
    const redParts = new Set(['akWood', 'awpBody', 'dgSlide', 'kfBlade']);
    const darkParts = new Set(['akSteel', 'akSteelD', 'akWoodD', 'awpBodyD', 'awpSteel', 'awpRing', 'dgFrame', 'dgGrip', 'dgSteel', 'kfHandle']);
    const get = function (T, name, params) {
      const p = Object.assign({}, params);
      if (redParts.has(name)) p.color = 0xc51632;
      else if (darkParts.has(name)) p.color = 0x17191f;
      else if (/^(ak|awp|dg|kf).*(Teal|Blue|Acc)$/.test(name)) p.color = 0xff3851;
      return cached(T, name, p);
    };
    const g = builder(THREE, get);
    // Raised geometric inlays stay on the moving part, so inspect/reload
    // animations do not leave the finish floating in space.
    const ink = cached(THREE, 'skinInk', { color: 0x17191f });
    const scarlet = cached(THREE, 'skinScarlet', { color: 0xff3851 });
    const target = key === 'knife' ? g.userData.blade : key === 'deagle' ? g.userData.bolt : g;
    for (let i = 0; i < 6; i++) {
      let stripe;
      if (key === 'knife') {
        stripe = box(THREE, ink, 0.027, 0.0015, 0.005, 0, 0.0045, -0.03 - i * 0.019);
        stripe.rotation.y = 0.35;
      } else {
        const width = key === 'deagle' ? 0.038 : key === 'awp' ? 0.054 : 0.062;
        const height = key === 'deagle' ? 0.025 : 0.047;
        const start = key === 'deagle' ? -0.10 : -0.12;
        stripe = box(THREE, i % 2 ? ink : scarlet, width, height, 0.006, 0, key === 'ak47' ? 0.02 : 0, start + i * 0.023);
      }
      stripe.name = 'skin-inlay';
      target.add(stripe);
    }
    if (key === 'knife') {
      for (const handle of [g.userData.handleA, g.userData.handleB]) {
        for (let i = 0; i < 5; i++) {
          const slot = box(THREE, scarlet, 0.018, 0.012, 0.008, 0, 0, 0.045 + i * 0.021);
          slot.name = 'handle-inlay';
          handle.add(slot);
        }
      }
    }
    g.userData.key = key;
    g.userData.skin = 'Crimson / Graphite';
    // Pistol and knife have compact real-world proportions; enlarge just
    // these view models for legibility at the fixed view-camera placement.
    const size = key === 'deagle' ? 1.4 : key === 'knife' ? 1.2 : 1;
    if (size !== 1) {
      // Bake a uniform scale into the top-level transforms so exposed
      // animation pivots and muzzle.position retain group-local units.
      g.children.forEach(function (o) { o.position.multiplyScalar(size); o.scale.multiplyScalar(size); });
      if (g.userData.muzzle) g.userData.muzzleTip.copy(g.userData.muzzle.position);
    }
    return g;
  }

  return {
    buildArena: buildArena,
    buildBot: buildBot,
    buildWeapon: buildWeapon,
    WEAPON_KEYS: ['ak47', 'awp', 'deagle', 'knife'],
  };
});
