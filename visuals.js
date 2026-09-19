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
  // Weapon skins: 3 distinct finishes per weapon. Each is a set of material
  // overrides keyed by the material cache name the builder used, so a skin can
  // recolour wood, steel and accents without rebuilding any geometry. The first
  // entry is always the default the models are built with.
  const SKINS = {
    ak47: [
      { name: 'Classic',   wood: 0x8a5a30, steel: 0x31363a, accent: 0x22262a },
      { name: 'Tactical',  wood: 0x2e3a2c, steel: 0x161a1c, accent: 0x3d4a3a },
      { name: 'Sunset',    wood: 0xb0531f, steel: 0x4a2f22, accent: 0xd9a13b },
      { name: 'Midnight',  wood: 0x1b2429, steel: 0x0e1214, accent: 0x2b3840 },
      { name: 'Jungle',    wood: 0x3f4a32, steel: 0x22271f, accent: 0x6f8a4a },
      { name: 'Crimson',   wood: 0x5a1f26, steel: 0x2a1416, accent: 0xc93b34 },
      { name: 'Golden',    wood: 0x6b4a1e, steel: 0x8a6a1f, accent: 0xe8c462 },
    ],
    awp: [
      { name: 'Issue',     wood: 0x4a5340, steel: 0x2b2f33, accent: 0x1b1e21 },
      { name: 'Frost',     wood: 0x8fa3b8, steel: 0xc3cdd6, accent: 0x6f8296 },
      { name: 'Dragon',    wood: 0x7a1f2b, steel: 0x2a1013, accent: 0xffcf3f },   // Legendary
      { name: 'Midnight',  wood: 0x161c20, steel: 0x0b0e10, accent: 0x2b3840 },
      { name: 'Highland',  wood: 0x4e5a3c, steel: 0x252b22, accent: 0x7d9a4f },
      { name: 'Ember',     wood: 0x4a2412, steel: 0x2a1a10, accent: 0xe07a2a },
      { name: 'Pearl',     wood: 0xa8b3b8, steel: 0x8a949a, accent: 0xdfe6ea },
    ],
    kar98: [
      { name: 'Natural',   wood: 0x8a5a30, steel: 0x31363a, accent: 0x4a5054 },
      { name: 'Storm',     wood: 0x39424a, steel: 0x23272b, accent: 0x6b7680 },
      { name: 'Golden',    wood: 0x6b4a1e, steel: 0x8a6a1f, accent: 0xd9b24a },
      { name: 'Midnight',  wood: 0x1b2429, steel: 0x0e1214, accent: 0x2b3840 },
      { name: 'Hunter',    wood: 0x4a3a24, steel: 0x26301f, accent: 0x6b7f45 },
      { name: 'Bloodline', wood: 0x5c2226, steel: 0x2a1618, accent: 0xb3362f },
      { name: 'Winter',    wood: 0x9aa5ad, steel: 0x6b7479, accent: 0xdfe6ea },
    ],
    deagle: [
      { name: 'Silver',    steel: 0x9aa3a8, accent: 0x6b7176 },
      { name: 'Bronze',    steel: 0x8a5a2b, accent: 0xc08a4a },
      { name: 'Graphite',  steel: 0x3a4046, accent: 0x1c2023 },
      { name: 'Midnight',  steel: 0x1c2023, accent: 0x3a4146 },
      { name: 'Ivory',     steel: 0xdfe4e6, accent: 0x9aa3a8 },
      { name: 'Inferno',   steel: 0x8e3a1f, accent: 0xe07a2a },
      { name: 'Gold',      steel: 0xc9a227, accent: 0x8a6a1f },
    ],
    knife: [
      { name: 'Chrome',    steel: 0xb8c0c5, accent: 0x37474f },
      { name: 'Crimson',   steel: 0x8e1f2b, accent: 0x3a0d12 },
      { name: 'Gold',      steel: 0xc9a227, accent: 0x6b4a1e },
      { name: 'Midnight',  steel: 0x1c2023, accent: 0x3a4146 },
      { name: 'Sapphire',  steel: 0x2b4a8a, accent: 0x16244a },
      { name: 'Emerald',   steel: 0x2f7a4a, accent: 0x123a26 },
      { name: 'White',     steel: 0xdfe4e6, accent: 0x8a949a },
    ],
  };
  // Character skins (player + bots share the rig): fabric, armour and boots.
  const CHAR_SKINS = [
    { name: 'Operator',  cloth: 0x3a4a55, clothD: 0x2b3840, armor: 0x4a5a25, boot: 0x1c2226 },
    { name: 'Desert',    cloth: 0x8a7448, clothD: 0x6b5a36, armor: 0x9a8a5a, boot: 0x4a3c28 },
    { name: 'Arctic',    cloth: 0xcfd8dc, clothD: 0xaeb9c0, armor: 0x8fa3b8, boot: 0x5a6670 },
  ];

  // Apply a weapon skin by recolouring the materials of a built model. The
  // materials are shared through the cache, so this clones any material it
  // recolours first, keeping other weapons on their own skin.
  function applySkin(THREE, group, key, skinIndex) {
    const list = SKINS[key];
    if (!list || !group) return false;
    const s = list[Math.max(0, Math.min(list.length - 1, skinIndex | 0))];
    const match = m => {
      const n = m.name || '';
      if (/wood/i.test(n)) return s.wood !== undefined ? s.wood : null;
      if (/ring|accent/i.test(n)) return s.accent !== undefined ? s.accent : null;
      if (/steel|slide|blade|edge|metal/i.test(n)) return s.steel !== undefined ? s.steel : null;
      return null;
    };
    let touched = 0;
    group.traverse(function (o) {
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function (m) {
        const hex = match(m);
        if (hex === null || hex === undefined) return;
        if (!m.userData.owned) { m = m.clone(); m.userData.owned = true; o.material = m; touched++; }
        m.color.setHex(hex);
      });
    });
    group.userData.skin = s.name;
    group.userData.skinIndex = skinIndex;
    return touched > 0;
  }

  // Character skin: recolour the cloth/armour materials of a built rig.
  function applyCharSkin(THREE, group, skinIndex) {
    const s = CHAR_SKINS[Math.max(0, Math.min(CHAR_SKINS.length - 1, skinIndex | 0))];
    if (!group) return false;
    let touched = 0;
    group.traverse(function (o) {
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function (m) {
        const n = m.name || '';
        let hex = null;
        if (/cloth/i.test(n) && !/d$/i.test(n)) hex = s.cloth;
        else if (/cloth/i.test(n)) hex = s.clothD;
        else if (/boot|glove/i.test(n)) hex = s.boot;
        else if (/armor|plate|vest/i.test(n)) hex = s.armor;
        if (hex === null) return;
        if (!m.userData.owned) { m = m.clone(); m.userData.owned = true; o.material = m; touched++; }
        m.color.setHex(hex);
      });
    });
    group.userData.charSkin = s.name;
    return touched > 0;
  }


  // Shared material cache: keeps shader programs low across the arena.
  function matCache() {
    const cache = Object.create(null);
    return function get(THREE, key, params) {
      if (cache[key]) return cache[key];
      const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.72, metalness: /Steel|Slide|Blade|Edge|Ring|metal/i.test(key) ? 0.65 : 0.08 }, params));
      m.name = key;
      cache[key] = m;
      return m;
    };
  }

  function box(THREE, material, w, h, d, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    return m;
  }

  // Octagonal cross-section: crisp machined bevels, one inexpensive prism.
  function bevelBox(THREE, material, w, h, d, x, y, z) {
    const b=Math.min(w,h)*.18, shape=new THREE.Shape();
    const points=[[-w/2+b,-h/2],[w/2-b,-h/2],[w/2,-h/2+b],[w/2,h/2-b],[w/2-b,h/2],[-w/2+b,h/2],[-w/2,h/2-b],[-w/2,-h/2+b]];
    points.forEach((p,i)=>i?shape.lineTo(...p):shape.moveTo(...p));shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:d,steps:1,bevelEnabled:false});
    geometry.translate(0,0,-d/2);geometry.type='BevelledBoxGeometry';
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);return mesh;
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
  // Copy world-space attributes into one non-indexed draw per material.
  // Keep collider source geometry alive: those invisible meshes still raycast.
  function mergeStatic(THREE, objects, root, preserve) {
    const buckets = new Map();
    for (const mesh of objects) {
      mesh.updateWorldMatrix(true, false);
      const copy = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      copy.applyMatrix4(mesh.matrixWorld);
      if (!buckets.has(mesh.material)) buckets.set(mesh.material, []);
      buckets.get(mesh.material).push(copy);
      if (!preserve.has(mesh)) { mesh.geometry.dispose(); mesh.removeFromParent(); }
      else mesh.visible = false;
    }
    let triangles = 0;
    for (const [material, copies] of buckets) {
      const geometry = new THREE.BufferGeometry();
      for (const name of ['position', 'normal']) {
        const size = copies.reduce((n, g) => n + g.attributes[name].array.length, 0);
        const data = new Float32Array(size); let offset = 0;
        for (const g of copies) { data.set(g.attributes[name].array, offset); offset += g.attributes[name].array.length; }
        geometry.setAttribute(name, new THREE.BufferAttribute(data, 3));
      }
      copies.forEach(g => g.dispose());
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      triangles += geometry.attributes.position.count / 3;
      const mesh = new THREE.Mesh(geometry, material); mesh.name = 'batch-' + material.name;
      root.add(mesh);
    }
    return { drawCalls: buckets.size, triangles, sourceMeshes: objects.length };
  }

  function buildArena(THREE, scene, C, preset = 'medium') {
    const map = C && C.MAP;
    if (!map || !Array.isArray(map.solids)) throw new Error('buildArena: C.MAP.solids missing');
    if (!['performance', 'medium', 'high'].includes(preset)) preset = 'medium';
    const performance = preset === 'performance', high = preset === 'high';
    const theme = ['desert', 'industrial', 'urban', 'training'].includes(map.theme) ? map.theme : 'desert';
    const palette = {
      desert: [0xd2b183,0xdcb98a,0xb8946a,0x8a5a33,0x2f8a86,0x395875,0xd8c9a8],
      industrial: [0x647076,0x9aa6a8,0x495860,0x426c73,0xe4b24e,0x34434c,0xa6b9bf],
      urban: [0x666d76,0xa5a6ad,0x727883,0x71716b,0xacc6d4,0x435c70,0xbac7d5],
      // Clean purpose-built range: green floor, white lanes, red accents.
      training: [0x4a6b5c,0x8fae9d,0x6b8f7a,0x39564a,0xd9534a,0x2b3a33,0xbfd8c8]
    }[theme];
    const root = new THREE.Group(); root.name = 'arena-' + theme; scene.add(root);
    const hitMeshes = [], objects = [], materials = [];
    const make = (name,color) => {
      const m = new (performance ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial)({color});
      m.name=name; materials.push(m); return m;
    };
    const floorMat=make('floor',palette[0]), wallMat=make('wall',palette[1]), trimMat=make('trim',palette[2]);
    const cargoMat=make('cargo',palette[3]), accent=make('accent',palette[4]), dark=make('window',palette[5]);
    const siteA=make('site-a',0x3c9b92), siteB=make('site-b',0x557db9);
    const hx=map.bounds && map.bounds.hx || 38, hz=map.bounds && map.bounds.hz || 38;
    const previousBackground=scene.background, previousFog=scene.fog;
    const background=new THREE.Color(palette[6]), fog=new THREE.Fog(palette[6],performance?48:65,high?175:125);
    scene.background=background; scene.fog=fog;
    let hasLight=false; scene.traverse(o=>{if(o.isLight)hasLight=true;});
    if(!hasLight&&!performance){
      root.add(new THREE.HemisphereLight(0xf0f5ff,0x6b6251,1.2));
      const sun=new THREE.DirectionalLight(0xfff0d8,1.1);sun.position.set(25,45,15);root.add(sun);
    }
    function add(material,w,h,d,x,y,z){const m=box(THREE,material,w,h,d,x,y,z);root.add(m);objects.push(m);return m;}
    add(floorMat,hx*2,.5,hz*2,0,-.25,0);
    function solid(s){
      const m=add(s.kind==='crate'?cargoMat:s.kind==='perimeter'?trimMat:wallMat,s.w,s.h,s.d,s.x,s.h/2,s.z);
      m.userData.solid={x:s.x,z:s.z,w:s.w,d:s.d,h:s.h,kind:s.kind};hitMeshes.push(m);
      if(performance)return;
      // Caps stay within the registered footprint; no decorative blockers in lanes.
      add(accent,s.w,.08,s.d,s.x,s.h-.04,s.z);
      if(s.kind==='building'){
        const rows=high?Math.max(2,Math.floor(s.h/2.6)):1, cols=Math.max(1,Math.floor(s.w/3));
        for(let row=0;row<rows;row++)for(let col=0;col<cols;col++)for(const side of [-1,1]){
          add(dark,Math.min(1.1,s.w/cols*.5),.85,.025,s.x-s.w/2+(col+.5)*s.w/cols,(row+1)*s.h/(rows+1),s.z+side*(s.d/2+.015));
        }
        add(trimMat,s.w,.28,s.d,s.x,s.h+.14,s.z);
        if(high){add(dark,Math.min(1.5,s.w*.4),.7,Math.min(1.2,s.d*.4),s.x,s.h+.63,s.z);}
      }else if(s.kind==='crate'){
        for(const side of [-1,1])add(trimMat,s.w,.14,.04,s.x,s.h*.5,s.z+side*(s.d/2+.015));
        if(high)for(let j=1;j<Math.floor(s.d);j+=2)for(const side of [-1,1])add(trimMat,.03,s.h-.1,.1,s.x+side*(s.w/2+.01),s.h/2,s.z-s.d/2+j);
      }
    }
    map.solids.forEach(solid);
    const t=1.5;
    [{x:0,z:hz+t/2,w:2*hx+2*t,d:t},{x:0,z:-hz-t/2,w:2*hx+2*t,d:t},
      {x:hx+t/2,z:0,w:t,d:2*hz},{x:-hx-t/2,z:0,w:t,d:2*hz}].forEach(s=>solid(Object.assign({h:5,kind:'perimeter'},s)));
    // Texture-free navigation markings, with simple geometric A/B glyphs.
    for(const [letter,x,z,material] of [['A',hx*.76,-hz*.76,siteA],['B',-hx*.76,hz*.76,siteB]]){
      const marker=new THREE.Object3D();marker.name='site-'+letter;marker.position.set(x,.025,z);root.add(marker);
      for(const side of [-1,1]){
        add(material,5,.018,.1,x,.014,z+side*2.5);add(material,.1,.018,5,x+side*2.5,.014,z);
      }
      // A has two rails and a crossbar; B has a spine and two squared bowls.
      add(material,.16,.02,1.7,x-.5,.025,z);
      add(material,.16,.02,1.7,x+.5,.025,z);
      add(material,1.15,.02,.16,x,.025,z);
      add(material,1.15,.02,.16,x,.025,z-.8);
      if(letter==='B')add(material,1.15,.02,.16,x,.025,z+.8);
    }
    if(!performance){
      for(let i=0;i<10;i++)add(accent,.15,.014,1.2,0,.01,-hz+3+i*(2*hz-6)/10);
      // Theme silhouettes are outside collision bounds, never in playable lanes.
      for(let i=0;i<(high?12:6);i++){
        const angle=i*Math.PI*2/(high?12:6),r=Math.hypot(hx,hz)+12;
        if(theme==='desert'){
          const m=new THREE.Mesh(new THREE.SphereGeometry(7+i%3,8,4),trimMat);m.position.set(Math.cos(angle)*r,-2,Math.sin(angle)*r);m.scale.y=.35;root.add(m);objects.push(m);
        }else if(theme==='training'){
          // Open range: keep the sight lines clear, only low distant hedgerows.
          const hh=2.5+(i%3)*1.5;
          add(trimMat,14,hh,3,Math.cos(angle)*r,hh/2,Math.sin(angle)*r);
        }else{
          const height=theme==='urban'?12+(i%4)*5:9+(i%3)*4;
          add(trimMat,theme==='urban'?8:3,height,theme==='urban'?8:3,Math.cos(angle)*r,height/2,Math.sin(angle)*r);
        }
      }
    }
    if(!performance){
      const decor=make('decor',theme==='desert'?0x82705b:theme==='training'?0x2b3a33:0x596569);
      decor.polygonOffset=true;decor.polygonOffsetFactor=-1;decor.polygonOffsetUnits=-1;
      // Training range paints lane stripes instead of crate clutter.
      if(theme==='training'){
        for(let lane=-2;lane<=2;lane++){
          add(accent,.18,.012,2*hz-8,lane*7,.014,0);
          add(siteA,.5,.02,.5,lane*7,.02,14);
          add(siteB,.5,.02,.5,lane*7,.02,2);
        }
      } else
      // Cargo sits on existing roofs/crates: no new collision footprint.
      for(const s of map.solids){
        if(s.kind==='crate'){
          const r=Math.min(.32,s.w*.15,s.d*.15),x=s.x-s.w*.22,z=s.z;
          const barrel=cyl(THREE,decor,r,r,.85,10,x,s.h+.425,z);root.add(barrel);objects.push(barrel);
          for(const y of [.12,.7]){
            const hoop=cyl(THREE,trimMat,r*1.04,r*1.04,.055,10,x,s.h+y,z);root.add(hoop);objects.push(hoop);
          }
          add(decor,Math.min(.8,s.w*.3),.6,Math.min(.8,s.d*.3),s.x+s.w*.22,s.h+.3,s.z);
          for(const side of [-1,1])add(decor,s.w*.9,.045,.035,s.x,s.h*.72,s.z+side*(s.d/2-.02));
        }else if(s.kind==='wall'){
          // Thin inset masonry courses stay on the solid surface.
          for(const y of [.28,.65])add(decor,s.w,.045,s.d,s.x,s.h*y,s.z);
        }
      }
      const cloudMat=make('cloud',0xe5e6df);
      // Twelve/eighteen low-poly ellipsoids, one static opaque draw, no updates.
      for(let i=0;i<(high?6:4);i++)for(let j=0;j<3;j++){
        const cloud=new THREE.Mesh(new THREE.SphereGeometry(1,6,3),cloudMat);
        cloud.position.set((i%2?1:-1)*(hx+20+j*3),22+i*2,-hz+12+i*13);
        cloud.scale.set(5+j,1.1+j*.25,2.5);root.add(cloud);objects.push(cloud);
      }
    }
    root.updateMatrixWorld(true);
    const stats=Object.assign(mergeStatic(THREE,objects,root,new Set(hitMeshes)),{theme,preset,colliders:hitMeshes.length});
    const floor=root.getObjectByName('batch-floor');if(floor)floor.name='arena-floor';
    scene.updateMatrixWorld(true);
    let disposed=false;
    // Prefer this idempotent teardown to generic traversal: owns batches AND hidden colliders.
    function dispose(){
      if(disposed)return;disposed=true;
      const geometries=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);});
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.removeFromParent();hitMeshes.length=0;
      if(scene.background===background)scene.background=previousBackground;
      if(scene.fog===fog)scene.fog=previousFog;
    }
    return {hitMeshes,root,stats,dispose};
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
    const mVisor = get(THREE, 'bVisor', { color: 0x42606b });   // cool smoked visor
    const mBoot = get(THREE, 'bBoot', { color: 0x2b2620 });
    const mGun = get(THREE, 'bGun', { color: 0x33302c });

    const root = new THREE.Group();
    root.userData.botId = id;
    root.userData.legs = null;

    // legs: each leg is its own pivot group at the hip so the strides can swing
    // independently and alternate. root.userData.legs is the container whose
    // children are the two hip pivots ([leftPivot, rightPivot]).
    const legs = new THREE.Group();
    legs.position.y = 0;
    const legPivots = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.13, 0.95, 0);
      pivot.name = side < 0 ? 'leg-left' : 'leg-right';
      pivot.userData.baseY = 0.95;
      legs.add(pivot);
      legPivots.push(pivot);
      const thigh = tagMesh(box(THREE, mCloth, 0.19, 0.48, 0.21, 0, -0.24, 0), id, 'legs');
      pivot.add(thigh);
      const shin = tagMesh(box(THREE, mClothD, 0.16, 0.44, 0.18, 0, -0.68, 0.01), id, 'legs');
      pivot.add(shin);
      const boot = tagMesh(bevelBox(THREE, mBoot, 0.18, 0.14, 0.3, 0, -0.92, 0.05), id, 'legs');
      boot.name = side < 0 ? 'boot-left' : 'boot-right';
      pivot.add(boot);
    }
    const hips = tagMesh(box(THREE, mClothD, 0.42, 0.16, 0.26, 0, 0.97, 0), id, 'legs');
    legs.add(hips);
    root.add(legs);
    root.userData.legs = legs;
    root.userData.legPivots = legPivots;

    // torso (body)
    const torso = tagMesh(box(THREE, mCloth, 0.5, 0.6, 0.3, 0, 1.28, 0), id, 'body');
    root.add(torso);
    const vest = tagMesh(bevelBox(THREE, mVest, 0.46, 0.4, 0.34, 0, 1.3, 0.02), id, 'body');
    vest.name = 'plate-carrier';
    // Narrow waist with broad armored shoulders, without extra draw calls.
    const vp = vest.geometry.attributes.position;
    for(let i=0;i<vp.count;i++)if(vp.getY(i)<0)vp.setX(i,vp.getX(i)*.78);
    vp.needsUpdate=true; vest.geometry.computeVertexNormals();
    root.add(vest);
    const pouch = tagMesh(box(THREE, mVest, 0.3, 0.12, 0.1, 0, 1.06, 0.16), id, 'body');
    pouch.material = mVisor; // cool fabric pouch
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
    rifle.add(tagMesh(box(THREE, mVisor, 0.05, 0.16, 0.08, 0, -0.1, 0.08), id, 'body')); // dark magazine
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
    const visor = tagMesh(bevelBox(THREE, mVisor, 0.28, 0.065, 0.29, 0, 0.2, 0), id, 'head');
    visor.name='visor';
    head.add(visor);
    const helmet = tagMesh(new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 4, 0, Math.PI*2, 0, Math.PI/2), mClothD), id, 'head');
    helmet.name = 'helmet-shell'; helmet.position.y = 0.23; helmet.scale.set(1, .75, 1.05);
    head.add(helmet);

    return root;
  }

  /* ============================================================== WEAPONS == */
  // Gloves: dark teal-gray glove with cuff, palm + fingers + thumb.
  function buildGlove(THREE, get) {
    const g = new THREE.Group();
    g.name = 'glove-hand';
    const mGlove = get(THREE, 'glove', { color: 0x37474f });
    const mCuff = get(THREE, 'cuff', { color: 0x52636c });   // slate cloth cuff
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
    const mTeal = get(THREE, 'akTeal', { color: 0x484c50, metalness: .75, roughness: .4 });

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
    const mTeal = get(THREE, 'awpTeal', { color: 0x555f4a });
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

    /* Raised 3D scope: tube + objective/ocular bells + rings + lens + turrets.
       The AWP is the one scoped weapon in the arsenal; the Kar98k stays
       unscoped with iron sights only. */
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
    for (const z of [-0.06, 0.05]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.006, 6, 16), mTeal);
      ring.position.z = z;
      ring.name = 'scope-clamp-ring';
      scope.add(ring);
    }
    scope.add(box(THREE, mSteel, 0.02, 0.05, 0.03, 0, -0.03, -0.06));       // front mount
    scope.add(box(THREE, mSteel, 0.02, 0.05, 0.03, 0, -0.03, 0.05));        // rear mount
    g.add(scope);

    // raised iron sights
    const fs = box(THREE, mSteel, 0.009, 0.026, 0.012, 0, 0.092, -0.6);
    fs.userData.sight = 'front';
    g.add(fs);
    g.add(box(THREE, mSteel, 0.004, 0.02, 0.004, 0, 0.104, -0.6));         // front bead
    const rs = box(THREE, mSteel, 0.026, 0.022, 0.014, 0, 0.092, 0.2);
    rs.userData.sight = 'rear';
    g.add(rs);
    // twin rear sight leaves with a centre notch
    for (const side of [-1, 1]) {
      g.add(box(THREE, mBodyD, 0.006, 0.014, 0.006, side * 0.01, 0.103, 0.2));
    }
    g.add(box(THREE, mBodyD, 0.028, 0.005, 0.004, 0, 0.106, 0.2));         // notch plate

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
    const mSlide = get(THREE, 'dgSlide', { color: 0xc4cbd1, metalness: 0.9, roughness: 0.25 });              // brushed steel
    const mFrame = get(THREE, 'dgFrame', { color: 0x3a3f45 });
    const mGrip = get(THREE, 'dgGrip', { color: 0x23262b });
    const mSteel = get(THREE, 'dgSteel', { color: 0x2a2a2e });
    const mTeal = get(THREE, 'dgTeal', { color: 0x2fa8a0 });
    const mGold = get(THREE, 'dgAcc', { color: 0x969fa7, metalness: .85, roughness: .3 });                 // blue accents

    // frame + slide
    g.add(bevelBox(THREE, mFrame, 0.034, 0.045, 0.2, 0, -0.012, -0.03));
    const slide = new THREE.Group();
    slide.position.set(0, 0.018, 0);
    slide.add(bevelBox(THREE, mSlide, 0.038, 0.042, 0.24, 0, 0, -0.05));
    // Fixed barrel shelf stays anchored while the slide cycles.
    const barrel=bevelBox(THREE,mSlide,.029,.028,.15,0,.03,-.105);
    barrel.name='deagle-barrel';barrel.geometry.userData={part:'barrel',noseZ:-.18};g.add(barrel);
    const bore=new THREE.Mesh(new THREE.CircleGeometry(.008,12),mSteel);
    bore.name='barrel-bore';bore.rotation.y=Math.PI;bore.position.set(0,.03,-.1801);g.add(bore);
    slide.add(box(THREE, mGold, 0.038, 0.006, 0.2, 0, -0.017, -0.05));      // slide serration line
    // sights on slide
    const fs = bevelBox(THREE, mSteel, 0.007, 0.012, 0.01, 0, 0.04, -0.155);
    fs.userData.sight = 'front';
    slide.add(fs);
    const rs = bevelBox(THREE, mSteel, 0.02, 0.01, 0.01, 0, 0.039, 0.06);
    rs.userData.sight = 'rear';
    slide.add(rs);
    g.add(slide);

    // grip (raked back) + mag inside (pivot for reload)
    const grip = bevelBox(THREE, mGrip, 0.031, 0.105, 0.05, 0, -0.07, 0.06);
    grip.rotation.x = 0.32;grip.name='deagle-grip';
    grip.geometry.userData={part:'grip',width:.031,rake:.32};
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
  /* --- Kar98k: completely rebuilt. Classic two-piece walnut stock, blued
   * steel, full-length stepped barrel, hooded front sight, tangent rear
   * sight, turned-down bolt handle and an internal box magazine. Unscoped. */
  function buildKar98(THREE, get) {
    const g = new THREE.Group();
    const mWood  = get(THREE, 'k98Wood',  { color: 0x8a5a30, roughness: 0.78 });   // walnut
    const mWoodD = get(THREE, 'k98WoodD', { color: 0x6b4322, roughness: 0.8 });    // darker grain
    const mSteel = get(THREE, 'k98Steel', { color: 0x31363a, metalness: 0.75, roughness: 0.32 });
    const mSteelD= get(THREE, 'k98SteelD',{ color: 0x22262a, metalness: 0.7, roughness: 0.38 });
    const mRing  = get(THREE, 'k98Ring',  { color: 0x4a5054, metalness: 0.85 });

    /* --- receiver + bolt body --- */
    const receiver = new THREE.Group();
    receiver.add(box(THREE, mSteel,  0.052, 0.072, 0.28, 0, 0.012, -0.01));        // receiver body
    receiver.add(box(THREE, mSteelD, 0.046, 0.02,  0.26, 0, 0.05,  -0.01));        // dust cover
    receiver.add(box(THREE, mSteelD, 0.05,  0.05,  0.05, 0, 0.008, 0.15));         // receiver ring
    g.add(receiver);

    /* --- one continuous barrel, stepped at the muzzle band. The barrel must
     * reach back into the receiver ring (z=-0.135) or it visibly detaches:
     * a 0.42 cylinder centred at z=-0.46 only spans -0.67..-0.25, leaving a
     * gap over the receiver. It is now one continuous taper from the ring. --- */
    g.add(zcyl(THREE, mSteel, 0.0115, 0.545, 12, 0, 0.03, -0.4025));               // main barrel (ring → muzzle step)
    g.add(zcyl(THREE, mSteelD, 0.013, 0.09, 12, 0, 0.03, -0.66));                  // muzzle step
    g.add(cyl(THREE, mRing, 0.016, 0.016, 0.014, 12, 0, 0.03, -0.71));             // muzzle crown

    /* --- hooded front sight: a tall, prominent post inside a protective hood.
     * The post is sharpened (triangular blade) and raised well above the barrel
     * so it is unambiguous to align with the rear notch during ADS. --- */
    const frontHood = new THREE.Group();
    frontHood.position.set(0, 0.058, -0.66);
    frontHood.add(box(THREE, mSteel, 0.022, 0.026, 0.026, 0, 0, 0));               // hood shell
    frontHood.add(box(THREE, mSteelD, 0.018, 0.022, 0.008, 0, 0.002, -0.011));     // hood rear cut
    const fpost = cyl(THREE, mRing, 0.0045, 0.0018, 0.034, 6, 0, 0.011, -0.003);
    fpost.userData.sight = 'front';
    frontHood.add(fpost);
    g.add(frontHood);

    /* --- tangent rear sight: raised V-notch on a ramp for a clear sight
     * picture. The notch is taller and thinner so the front post slots in. --- */
    const rearSight = new THREE.Group();
    rearSight.position.set(0, 0.046, -0.06);
    rearSight.add(box(THREE, mSteel, 0.032, 0.012, 0.04, 0, 0, 0));                // base
    rearSight.add(box(THREE, mSteelD, 0.028, 0.016, 0.006, 0, 0.014, -0.015));     // ramp
    for (const side of [-1, 1]) {                                                  // tangent leaves
      rearSight.add(box(THREE, mSteelD, 0.006, 0.022, 0.006, side * 0.012, 0.017, 0.009));
    }
    const rnotch = box(THREE, mRing, 0.02, 0.007, 0.006, 0, 0.028, 0.009);
    rnotch.userData.sight = 'rear';
    rearSight.add(rnotch);
    g.add(rearSight);

    /* --- turned-down bolt (right side, animates on fire/reload) --- */
    const bolt = new THREE.Group();
    bolt.position.set(0.028, 0.048, 0.015);
    bolt.add(zcyl(THREE, mSteel, 0.009, 0.1, 8, 0, 0, 0));                         // bolt body
    const handle = new THREE.Group();
    handle.position.set(0, 0, 0.058);
    handle.add(cyl(THREE, mSteelD, 0.005, 0.005, 0.03, 8, 0.011, 0, 0));           // turned arm
    handle.add(cyl(THREE, mRing, 0.008, 0.008, 0.018, 8, 0.011, -0.012, 0));       // knob
    handle.rotation.z = 0.42;
    bolt.add(handle);
    g.add(bolt);

    /* --- internal magazine (pivot at base, animates down during reload) --- */
    const mag = new THREE.Group();
    mag.position.set(0, -0.034, -0.035);
    mag.add(box(THREE, mSteelD, 0.034, 0.058, 0.064, 0, -0.029, 0));
    mag.add(box(THREE, mSteel,  0.036, 0.008, 0.066, 0, -0.06,  0));               // floorplate
    g.add(mag);

    /* --- two-piece stock: buttstock with comb and pistol grip --- */
    const stock = new THREE.Group();
    const butt = box(THREE, mWood, 0.044, 0.082, 0.2, 0, 0.0, 0.3);
    butt.rotation.x = -0.05;
    stock.add(butt);
    stock.add(box(THREE, mWoodD, 0.048, 0.062, 0.026, 0, 0.002, 0.415));           // butt plate
    stock.add(box(THREE, mWood, 0.02, 0.03, 0.1, 0, 0.012, 0.22));                 // comb
    g.add(stock);

    /* --- pistol grip, angled like the real rifle --- */
    const grip = box(THREE, mWoodD, 0.028, 0.088, 0.046, 0, -0.056, 0.088);
    grip.rotation.x = 0.34;
    g.add(grip);

    /* --- trigger + guard --- */
    g.add(box(THREE, mSteelD, 0.006, 0.024, 0.006, 0, -0.028, 0.044));
    const guard = new THREE.Group();
    guard.add(box(THREE, mSteelD, 0.006, 0.006, 0.088, 0, -0.044, 0.05));
    guard.children[0].userData.part = 'guard';
    g.add(guard);

    /* --- barrel band near the stock forend --- */
    g.add(box(THREE, mRing, 0.04, 0.014, 0.018, 0, 0.024, -0.02));

    /* --- sling bar (small detail on the underside) --- */
    g.add(cyl(THREE, mRing, 0.0035, 0.0035, 0.03, 6, 0, -0.058, 0.16));

    // hands
    const gloveR = buildGlove(THREE, get); gloveR.position.set(0, -0.052, 0.1);  gloveR.rotation.x = 0.5; g.add(gloveR);
    const gloveL = buildGlove(THREE, get); gloveL.position.set(-0.006, -0.04, -0.2); gloveL.rotation.x = 0.3; g.add(gloveL);

    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.03, -0.715); g.add(muzzle);
    g.userData = { kind: 'kar98', mag: mag, bolt: bolt, muzzle: muzzle, muzzleTip: muzzle.position.clone() };
    return g;
  }


  /* --- Butterfly knife: pivoted handles A/B + swinging blade -------------- */
  function buildKnife(THREE, get) {
    const g = new THREE.Group();
    const mBlade = get(THREE, 'kfBlade', { color: 0xd3e0ec, metalness: 0.95, roughness: 0.16 });              // satin steel
    const mEdge = get(THREE, 'kfEdge', { color: 0xeef2f4 });
    const mHandle = get(THREE, 'kfHandle', { color: 0x23262b });            // black handles
    const mTeal = get(THREE, 'kfTeal', { color: 0x2fa8a0 });
    const mBlue = get(THREE, 'kfBlue', { color: 0x2b6fb8 });

    // blade: flat stock tapering to a spear point, pivot at origin
    const blade = new THREE.Group();
    blade.position.set(0, 0, 0);
    // Single continuous spear profile, with a shallow central bevel ridge.
    const outline=[[-.013,-.015],[-.015,-.14],[0,-.21],[.015,-.14],[.013,-.015]];
    const vertices=[];
    for(const side of [-1,1])for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length];
      const tri=[[0,side*.003,-.09],[a[0],0,a[1]],[b[0],0,b[1]]];
      if(side>0)tri.reverse();tri.forEach(v=>vertices.push(...v));
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
    const stock=new THREE.Mesh(geometry,mBlade);stock.name='knife-blade';blade.add(stock);
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
    const channelA=bevelBox(THREE,mEdge,.017,.003,.105,0,.006,.089);channelA.name='handle-channel';handleA.add(channelA);
    g.add(handleA);

    const handleB = new THREE.Group();
    handleB.position.set(0, -0.014, 0.006);
    handleB.add(box(THREE, mHandle, 0.016, 0.01, 0.16, 0, 0, 0.088));
    handleB.add(box(THREE, mBlue, 0.018, 0.012, 0.02, 0, 0, 0.172));        // tail end
    handleB.add(cyl(THREE, mTeal, 0.005, 0.005, 0.02, 8, 0, 0, 0.03));
    handleB.children[handleB.children.length - 1].rotation.z = Math.PI / 2;
    handleB.add(cyl(THREE, mTeal, 0.005, 0.005, 0.02, 8, 0, 0, 0.14));
    handleB.children[handleB.children.length - 1].rotation.z = Math.PI / 2;
    const channelB=bevelBox(THREE,mEdge,.017,.003,.105,0,.006,.089);channelB.name='handle-channel';handleB.add(channelB);
    g.add(handleB);

    // grip hand wraps the lower handle
    const gloveR = buildGlove(THREE, get);
    gloveR.position.set(0, -0.016, 0.11);
    gloveR.rotation.x = 0.4;
    g.add(gloveR);

    g.userData = { kind: 'knife', blade: blade, handleA: handleA, handleB: handleB };
    return g;
  }

  /* --- Shell casing: brass box with a rim, pooled by the controller. ------
   * Carried by scene (not the view camera) so ejected brass arcs away from
   * the player. Caller disposes it through the shared effects pool. */
  function buildCasing(THREE) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xb08d3f, metalness: 0.8, roughness: 0.32 });
    const g = new THREE.Group();
    g.add(box(THREE, mat, 0.011, 0.011, 0.055, 0, 0, 0));        // case body
    g.add(box(THREE, mat, 0.0135, 0.0135, 0.008, 0, 0, 0.032));  // rim
    return g;
  }

  /* Dropped magazine for the tactical reload swap. Curved AK box mag with a
     visible round stack, or a straight pistol mag. Pooled by the caller. */
  function buildMagazine(THREE, kind) {
    const isPistol = kind === 'deagle';
    const mBody = new THREE.MeshStandardMaterial({ color: isPistol ? 0x3a3f45 : 0x6f5630, metalness: 0.4, roughness: 0.6 });
    const mSteel = new THREE.MeshStandardMaterial({ color: 0xb08d3f, metalness: 0.85, roughness: 0.3 });
    const g = new THREE.Group();
    g.name = 'dropped-mag';
    if (isPistol) {
      g.add(box(THREE, mBody, 0.026, 0.075, 0.04, 0, 0, 0));
      g.add(box(THREE, mSteel, 0.03, 0.012, 0.044, 0, -0.042, 0));   // basepad
    } else {
      // slight curve suggested by two angled boxes
      const lower = box(THREE, mBody, 0.032, 0.05, 0.055, 0, -0.018, 0.014);
      lower.rotation.x = 0.22;
      g.add(lower);
      g.add(box(THREE, mBody, 0.032, 0.045, 0.05, 0, 0.012, -0.012));
      g.add(box(THREE, mSteel, 0.034, 0.01, 0.058, 0, -0.048, 0.022)); // floorplate
      for (let i = 0; i < 3; i++) {                                   // visible rounds
        g.add(box(THREE, mSteel, 0.012, 0.014, 0.016, 0, 0.02 - i * 0.016, -0.004 - i * 0.008));
      }
    }
    return g;
  }

  const WEAPON_BUILDERS = { ak47: buildAK47, awp: buildAWP, kar98: buildKar98, deagle: buildDeagle, knife: buildKnife };

  // View model: fires down -Z, origin at the grip so the parent can place it
  // at (0.32, -0.3, -0.65) with a fixed 65 FOV camera.
  function buildWeapon(THREE, key) {
    const builder = Object.prototype.hasOwnProperty.call(WEAPON_BUILDERS, key) && WEAPON_BUILDERS[key];
    if (!builder) throw new Error('buildWeapon: unknown weapon "' + key + '"');
    const g = builder(THREE, matCache());
    // References only: the controller owns independent hand-layer attachment.
    g.userData.hands = g.children.filter(o => o.name === 'glove-hand');
    g.userData.key = key;
    g.userData.skin = 'Natural';
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
    applySkin: applySkin,
    applyCharSkin: applyCharSkin,
    SKINS: SKINS,
    CHAR_SKINS: CHAR_SKINS,
    buildCasing: buildCasing,
    buildMagazine: buildMagazine,
    WEAPON_KEYS: ['ak47', 'awp', 'kar98', 'deagle', 'knife'],
  };
});
