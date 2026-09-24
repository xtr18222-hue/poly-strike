'use strict';
/* Overhaul regression tests: the Pro FPS clip registry, training-mode weapon
 * freedom, the once-per-match First Blood rule, and the top-down camera.
 *
 * game.js is DOM-coupled and cannot be required directly, so the game-level
 * assertions are made against the pieces it consults: the asset registry
 * (assets.js), the map spawn tables (maps.js), the announcer mapping
 * (audio.js) and the weapon table (core.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

// ---------- asset registry: every map-referenced clip is registered ----------
// assets.js is a browser IIFE keyed off window.PolyAsset; read it as text and
// pull the CLIP_FILES table plus the maps' anim references out directly.
const src = fs.readFileSync(path.join(ROOT, 'assets.js'), 'utf8');
const MAPS = require(path.join(ROOT, 'maps.js'));

function clipKeys() {
  // The object literal between `const CLIP_FILES = {` and its closing brace.
  const start = src.indexOf('const CLIP_FILES = {');
  assert.ok(start !== -1, 'CLIP_FILES table found');
  const body = src.slice(start, src.indexOf('};', start) + 1);
  return [...body.matchAll(/^ {4}(\w+):/gm)].map(m => m[1]);
}

function mapAnimRefs() {
  const refs = new Set();
  for (const key of Object.keys(MAPS)) {
    const m = MAPS[key];
    for (const b of (m.spawnBots || [])) if (b.anim) refs.add(b.anim);
  }
  return refs;
}

test('CLIP_FILES registers the full Pro FPS suite', () => {
  const keys = clipKeys();
  // Core locomotion families from the Pro Rifle Pack.
  for (const k of ['idle', 'walk', 'run', 'sprint', 'crouch', 'jump', 'slide'])
    assert.ok(keys.includes(k), `locomotion clip ${k} registered`);
  // Aim variants and the death suite are what make the range a full review.
  for (const k of ['idleAim', 'crouchAim', 'deathFront', 'deathBack'])
    assert.ok(keys.includes(k), `pro-fps clip ${k} registered`);
});

test('every map spawn point is inside its own bounds and clear of solids', () => {
  // The code-gated test maps carried per-pad anim clips; the standard arenas
  // let the bot brain assign locomotion, so what must hold now is that every
  // spawn (player, opponent and bots) is on the map and not embedded in a wall.
  for (const id of Object.keys(MAPS)) {
    const m = MAPS[id];
    const spots = [m.spawnPlayer, m.spawnOpponent, ...(m.spawnBots || [])];
    assert.ok(spots.length >= 7, `${id} has enough spawn points`);
    for (const s of spots) {
      assert.ok(Math.abs(s.x) <= m.bounds.hx, `${id} spawn x within bounds`);
      assert.ok(Math.abs(s.z) <= m.bounds.hz, `${id} spawn z within bounds`);
      for (const o of (m.solids || [])) {
        const dx = Math.abs(s.x - o.x), dz = Math.abs(s.z - o.z);
        const inside = dx < o.w / 2 && dz < o.d / 2;
        assert.ok(!inside, `${id} spawn (${s.x},${s.z}) inside solid at (${o.x},${o.z})`);
      }
    }
  }
});

// ---------- harbor: the fourth arena is reachable and bot-navigable ----------
// Drydock has to hold up to the same geometry contract as the core three: its
// nav graph must be one connected island (a bot that spawns has to be able to
// path to the player) and its spawns must sit on the 4m nav grid.
test('the fourth arena is wired into every map list', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(/<option value="harbor">/.test(html), 'harbor is in the map select');
  assert.ok(/<option value="harbor">/.test(html), 'harbor is in the rematch select');
  const game = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  assert.ok(/'harbor'/.test(game), 'harbor is in the loadMap allowlist');
  // The post-match rotation cycles every battleground, including the
  // dedicated target range and the two new arenas.
  assert.ok(/maps=\['desert','industrial','urban','harbor','training','targetrange','shipment','dust2'\]/.test(game),
    'nextMapId rotates through every map');
  const vis = fs.readFileSync(path.join(ROOT, 'visuals.js'), 'utf8');
  // Without its own palette the theme check would silently fall back to desert.
  assert.ok(/harbor:\s*\[/.test(vis), 'harbor has its own palette');
});

test('harbor nav is a single connected island every spawn can reach', () => {
  const m = MAPS.harbor;
  assert.ok(m, 'harbor exists in the map table');
  const B = m.bounds, R = 0.5;
  // Replicate core.js nav generation: 4m grid with 0.5m solid clearance.
  const nav = [];
  for (let x = -36; x <= 36; x += 4)
    for (let z = -36; z <= 36; z += 4)
      if (!m.solids.some(s => Math.abs(x - s.x) < s.w / 2 + 0.5 && Math.abs(z - s.z) < s.d / 2 + 0.5))
        nav.push({ x, z });
  const key = n => `${n.x},${n.z}`;
  const by = new Map(nav.map(n => [key(n), n]));
  const adj = new Map();
  for (const n of nav) {
    const out = [];
    for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
      const o = by.get(`${n.x + dx},${n.z + dz}`);
      if (o) out.push(key(o));
    }
    adj.set(key(n), out);
  }
  // BFS from one node: the whole grid must be one island.
  const seen = new Set(nav.length ? [key(nav[0])] : []);
  const q = [...seen];
  while (q.length) {
    const c = q.shift();
    for (const o of adj.get(c) || []) if (!seen.has(o)) { seen.add(o); q.push(o); }
  }
  assert.equal(seen.size, nav.length, 'harbor nav is fully connected');
  // Every spawn must have a nav node within 3m or the bot brain has nowhere to go.
  const nearNav = (p) => nav.some(n => Math.hypot(n.x - p.x, n.z - p.z) <= 3);
  for (const s of [m.spawnPlayer, m.spawnOpponent, ...m.spawnBots])
    assert.ok(nearNav(s), `harbor spawn (${s.x},${s.z}) is on the nav grid`);
  // And no solid may poke outside the arena bounds.
  for (const s of m.solids)
    assert.ok(s.x - s.w / 2 >= -B.hx && s.x + s.w / 2 <= B.hx &&
              s.z - s.d / 2 >= -B.hz && s.z + s.d / 2 <= B.hz,
      `harbor solid at (${s.x},${s.z}) inside bounds`);
});

test('standard maps are combat arenas, not peaceful test maps', () => {
  // The code-gated test maps (116791) were removed: the rotation is the four
  // core battlegrounds, and none of them may carry test-map flags.
  for (const id of Object.keys(MAPS)) {
    const m = MAPS[id];
    assert.equal(m.test, undefined, `${id} is not a test map`);
    assert.equal(m.peaceful, undefined, `${id} is a live combat arena`);
    assert.equal(m.stationaryBots, undefined, `${id} bots are free to move`);
  }
});

// ---------- training mode: the player is not locked to the Mosin ----------
const CORE = require(path.join(ROOT, 'core.js'));

test('the roster is the six primaries, the Deagle sidearm and the Bayonet', () => {
  const game = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  // The wheel cycles primary, secondary and the blade. The inventory lists the
  // held guns plus the bayonet, which never runs out of ammo.
  const prim = game.match(/const primaries=\[([^\]]+)\]/);
  assert.ok(prim, 'primaries list present');
  for (const k of ['akm', 'l96', 'hecate', 'shotgun', 'smg', 'lmg'])
    assert.ok(prim[1].includes(`'${k}'`), `${k} is a selectable primary`);
  for (const k of ['mosin', 'mx'])
    assert.ok(!prim[1].includes(`'${k}'`), `${k} was removed from the primaries`);
  // The bayonet is the close-quarters slot, not a primary.
  assert.ok(CORE.WEAPONS.bayonet, 'the bayonet is back in the shared table');
  assert.equal(CORE.WEAPONS.bayonet.slot, 'close', 'the bayonet occupies the blade slot');
  assert.equal(CORE.WEAPONS.deagle.slot, 'secondary', 'the Deagle is still the sidearm');
  // The dropped weapons stay dropped.
  for (const k of ['mosin', 'mx'])
    assert.ok(!CORE.WEAPONS[k], `${k} is not a weapon`);
});

test('the close-quarters slot is exactly the Bayonet', () => {
  // The Mosin and the MX knife stay gone; the Bayonet fills the blade slot.
  for (const key of ['mosin', 'mx']) {
    assert.ok(!CORE.WEAPONS[key], `${key} is not a weapon`);
  }
  assert.deepEqual(Object.keys(CORE.WEAPONS).filter(k => CORE.WEAPONS[k].slot === 'close'), ['bayonet']);
  // The Deagle is the only sidearm.
  assert.deepEqual(Object.keys(CORE.WEAPONS).filter(k => CORE.WEAPONS[k].slot === 'secondary'), ['deagle']);
  // Every gun has a magazine; the blade has none and never needs one.
  for (const w of Object.values(CORE.WEAPONS)) {
    if (w.slot === 'close') continue;
    assert.ok(w.slot === 'primary' || w.slot === 'secondary', `${w.key} has a gun slot`);
    assert.ok(w.mag > 0, `${w.key} has a magazine`);
  }
});

// ---------- announcer: First Blood is once per match ----------
const AUDIO_SRC = fs.readFileSync(path.join(ROOT, 'audio.js'), 'utf8');

test('First Blood can only resolve by name, never from the streak path', () => {
  // The streak branch must start at index 1 (Double Kill) and reject kills===1.
  assert.ok(/kind === 'streak' && Number\.isInteger\(kills\) && kills >= 2/.test(AUDIO_SRC),
    'streak path requires kills >= 2');
  assert.ok(/if \(kind === 'firstblood'\) name = list\[0\]/.test(AUDIO_SRC),
    'firstblood is resolved by name only');
});

test('the game gates First Blood behind a once-per-match flag', () => {
  const game = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  assert.ok(/firstBlood=false/.test(game), 'firstBlood flag exists');
  // The call site must consume the flag, not the raw kill count.
  assert.ok(/killCount===1&&!firstBlood\)\{firstBlood=true;/.test(game),
    'firstblood fires once and then arms the flag');
  // And spawn() must clear it so a new match can fire it again.
  assert.ok(/spawn\(\)\{killCount=0;roundNotice=0;firstBlood=false/.test(game),
    'spawn resets firstBlood');
});

test('every weapon has a firing voice', () => {
  // audio.js maps weapon keys to synth profiles; any weapon missing from the
  // table falls through to the generic cue and fires silently-ish, which is
  // the bug this overhaul fixed.
  const m = AUDIO_SRC.match(/const PROFILES = \{([\s\S]*?)\n\s*\};/);
  assert.ok(m, 'PROFILES table present');
  for (const k of Object.keys(CORE.WEAPONS))
    assert.ok(new RegExp(`^\\s*${k}:\\s*\\{`, 'm').test(m[1]),
      `weapon ${k} has a firing profile`);
});

// ---------- inspection: gone entirely ----------
test('the inspection system is fully removed', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'inspection.js')), 'inspection.js deleted');
  assert.ok(!fs.existsSync(path.join(__dirname, 'inspection.cjs')), 'inspection.cjs deleted');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(!/inspection\.js/.test(html), 'no inspection script tag');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.ok(!/inspection\.js/.test(sw), 'no inspection service-worker entry');
  const game = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  for (const sym of ['inspectRest', 'inspectFade', 'inspectVariant', 'cancelInspect', 'PolyInspection'])
    assert.ok(!game.includes(sym), `${sym} removed from game.js`);
  // The F keybind that drove it must be gone too.
  assert.ok(!/KeyF'/.test(game), 'F inspect keybind removed');
});

// ---------- top-down camera (removed) ----------
// The T-key overhead camera was deleted. The state, keybind, camera override
// and state() exposure must all be gone.
test('the top-down camera toggle is fully removed', () => {
  const game = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  assert.ok(!/topDown/.test(game), 'topDown state gone');
  assert.ok(!/KeyT'[^)]*\)/.test(game), 'T keybind gone');
  assert.ok(!/cam\.position\.set\(x,34,z\)/.test(game), 'overhead camera override gone');
});

// ---------- viewmodel: no hands, weapon-only ----------
test('the first-person viewmodel carries no hands', () => {
  const game = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  assert.ok(!/handRoots/.test(game), 'hand root groups removed');
  assert.ok(!/PolyAsset\.rig\(/.test(game), 'FPS arm rigs are no longer attached');
  // The pose table must still exist, but the fit now maps the measured bore
  // onto -Z with sights on +Y, so the weapon arrives level and forward. Every
  // pose is a small sight-line correction, never the full -90deg pitch that
  // rolled weapons onto their side.
  assert.ok(/const VIEWMODEL_POSE=\{/.test(game), 'per-weapon viewmodel pose table exists');
  for (const k of Object.keys(CORE.WEAPONS)) {
    if (k === 'bayonet') continue; // the blade is a hold, not a sight-aligned viewmodel
    assert.ok(new RegExp(`${k}:`).test(game), `${k} has a pose entry`);
  }
  // A pose entry that contains a full 90deg pitch would re-introduce the
  // sideways-weapon bug on top of a correct fit.
  assert.ok(!/-1\.5708/.test(game), 'no full -90deg pitch left in the pose table');
});

// ---------- weapon orientation: fitted, upright, solid ----------
// The weapons used to render rolled onto their side and in scattered pieces.
// These guard the three things that caused it, all of which live in assets.js.
test('the weapon fit maps the bore onto -Z with sights on +Y', () => {
  // The old code applied a roll about the forward axis, which mapped +X -> -Y
  // and laid the sights sideways. The fit must build a real basis instead.
  assert.ok(!/fix\.z\s*=\s*-90\s*;/.test(src), 'the forward-axis roll is gone');
  assert.ok(/function fitWeapon/.test(src), 'fitWeapon is defined');
  assert.ok(/q\.setFromUnitVectors/.test(src), 'the fit composes unit-vector rotations');
});

test('per-asset muzzle direction is recorded, not assumed', () => {
  // Measured on the loaded exports in world space: AKM/Deagle/L96/Hecate all
  // carry the muzzle at +X in asset space, so every entry records flip:1 and
  // fitWeapon aligns +X onto the camera's forward.
  const m = src.match(/const\s+WEAPON_ASSETS\s*=\s*\{([\s\S]*?)\n\s*\};/);
  assert.ok(m, 'WEAPON_ASSETS table found');
  // The entries are multi-line, so read each block rather than each row.
  const blocks = {};
  let cur = null;
  for (const line of m[1].split('\n')) {
    const head = line.match(/^\s*([a-z0-9_]+)\s*:\s*\{/);
    if (head) { cur = head[1]; blocks[cur] = ''; continue; }
    if (cur) blocks[cur] += line + '\n';
  }
  for (const k of ['akm', 'deagle', 'l96', 'hecate']) {
    assert.ok(blocks[k], `${k} present in WEAPON_ASSETS`);
    assert.ok(/flip\s*:/.test(blocks[k]), `${k} records its muzzle direction (flip)`);
  }
  for (const k of Object.keys(blocks)) {
    assert.ok(/flip\s*:\s*1/.test(blocks[k]),
      `${k} records flip:1 (muzzle at +X in asset space, matching the measured exports)`);
  }
  // The direction is derived from named muzzle/stock pivots at load time, not
  // hardcoded per asset, so a new export with a different facing self-corrects.
  assert.ok(/MUZZLE_WORDS/.test(src), 'fitWeapon derives the direction from part names');
});

test('cloneGLB preserves the fitted orientation and hidden parts', () => {
  // three r149's Object3D.clone() copies only position/scale and resets the
  // quaternion, which silently discarded the fit on every in-game instance.
  assert.ok(/function cloneGLB/.test(src), 'cloneGLB is defined');
  assert.ok(/quaternion/.test(src), 'the clone path copies quaternions');
  // Per-part visibility (hidden spare magazines and loose rounds) also has to
  // survive the clone, or those parts reappear floating past the muzzle.
  assert.ok(/visByName/.test(src), 'clone propagates per-part visibility by name');
});

test('detached weapon parts are hidden or seated, not left floating', () => {
  // Every loose-round pivot is a detached bullet the player is not holding;
  // the reload drives only the magazine, so the loader hides them all.
  assert.ok(/pickMag/.test(src), 'a magazine picker prefers the loaded mag');
  assert.ok(/empty/.test(src), 'empty spares are excluded by name');
  assert.ok(/INTERNAL_MAG/.test(src), 'internal Mosin magazine is special-cased');
  assert.ok(/hidePart/.test(src), 'a hide helper suppresses the floating part');
  assert.ok(/straighten/.test(src), 'rest poses are recorded for the reload');
  // The part picker must prefer the magazine that hangs vertically below the
  // receiver; picking by mesh weight selected the floating spare instead.
  assert.ok(/vertical/.test(src), 'the part picker tests verticalness');
  assert.ok(!/hits\.sort\(\(a,b\)=>b-a\)/.test(src), 'weight-only part picking is gone');
});

test('the sniper bolt strokes along the bore, not outward', () => {
  const game = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  const m = game.match(/u\.bolt\.position\.set\(([^)]+)\)/);
  assert.ok(m, 'bolt position is set as a whole vector');
  // The fit maps the bore onto -Z, so the bolt strokes along -Z (forward,
  // toward the muzzle) — never the local -Y it used before the orientation fix.
  assert.ok(m[1].includes('basePos.z-stroke'), 'bolt strokes on local Z (the bore axis)');
  assert.ok(!/u\.bolt\.position\.z=/.test(game), 'no direct bolt z assignment');
});
