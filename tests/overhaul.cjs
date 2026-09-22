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

test('every map spawn anim resolves to a registered clip', () => {
  const keys = new Set(clipKeys());
  const refs = mapAnimRefs();
  assert.ok(refs.size >= 8, 'spawn tables reference a healthy clip spread');
  for (const ref of refs)
    assert.ok(keys.has(ref), `map anim '${ref}' has no CLIP_FILES entry`);
});

test('test maps are stationary and peaceful so the suite can be reviewed', () => {
  for (const id of ['range', 'depot']) {
    const m = MAPS[id];
    assert.ok(m, `test map ${id} exists`);
    assert.equal(m.stationaryBots, true, `${id} bots stay on their pads`);
    assert.equal(m.peaceful, true, `${id} bots do not shoot back`);
    assert.equal(m.test, true, `${id} is a 116791 map`);
    // One clip per pad, all distinct, so nothing is duplicated.
    const anims = m.spawnBots.map(b => b.anim);
    assert.equal(new Set(anims).size, anims.length, `${id} anims are unique`);
  }
});

// ---------- training mode: the player is not locked to the Mosin ----------
const CORE = require(path.join(ROOT, 'core.js'));

test('training does not force the Mosin: every primary stays selectable', () => {
  const game = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  // The old lock assigned the Mosin on every training deploy; if it returns,
  // the player is welded to one gun in the range.
  assert.ok(!/MAP\.training[^;]*primary\s*=\s*['"]mosin['"]/.test(game),
    'no training -> mosin primary assignment');
  // The inventory the wheel cycles must keep all three slots.
  assert.ok(/const inventory=\(\)=>dropped?\?\[secondary,melee\]:\[primary,secondary,melee\]/.test(game),
    'inventory exposes primary, secondary and melee');
  // And the primaries list still has the four real rifles.
  const prim = game.match(/const primaries=\[([^\]]+)\]/);
  assert.ok(prim, 'primaries list present');
  for (const k of ['akm', 'l96', 'mosin', 'hecate'])
    assert.ok(prim[1].includes(`'${k}'`), `${k} is a selectable primary`);
});

test('the knife occupies the melee slot, not the buy menu', () => {
  for (const key of ['mx', 'bayonet']) {
    const w = CORE.WEAPONS[key];
    assert.ok(w, `${key} is a weapon`);
    assert.equal(w.slot, 'melee', `${key} is melee-slot`);
    assert.equal(w.mag, 0, `${key} carries no magazine`);
  }
  // Melee keys must not appear in the buy menu.
  const buy = JSON.stringify(CORE.BUY_ITEMS || {});
  assert.ok(!/["']mx["']/.test(buy), 'mx is not purchasable');
  assert.ok(!/["']bayonet["']/.test(buy), 'bayonet is not purchasable');
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

// ---------- top-down camera ----------
test('the training map has a top-down camera toggle', () => {
  const game = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
  assert.ok(/let .*topDown=false/.test(game), 'topDown state exists');
  assert.ok(/KeyT'&&mapId!=='desert'\)\{topDown=!topDown/.test(game),
    'T toggles top-down on any non-default map');
  // The override must apply a downward-looking camera, not just a flag.
  assert.ok(/if\(topDown\)\{cam\.position\.set\(x,34,z\);cam\.rotation\.set\(-Math\.PI\/2/.test(game),
    'top-down positions the camera overhead looking down');
  assert.ok(/topDown,/.test(game), 'topDown exposed in Game.state()');
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
    if (k === 'mx') continue; // mx is a melee alt-skin, not a viewmodel key
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
  // Measured by vertex slicing: AKM/Deagle/L96/Mosin/Bayonet point +X, but
  // Hecate and MX point -X. A universal assumption flips those two.
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
  for (const k of ['akm', 'deagle', 'l96', 'mosin', 'hecate', 'bayonet']) {
    assert.ok(blocks[k], `${k} present in WEAPON_ASSETS`);
    assert.ok(/flip\s*:/.test(blocks[k]), `${k} records its muzzle direction (flip)`);
  }
  assert.ok(/flip\s*:\s*-1/.test(blocks.hecate), 'hecate is flipped (muzzle at -X)');
  assert.ok(/flip\s*:\s*-1/.test(blocks.mx), 'mx is flipped (muzzle at -X)');
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
  // Every rounds_ pivot is a detached loose bullet; the reload drives only the
  // magazine, so there is no "real" rounds pivot to keep.
  assert.ok(/hideExtras/.test(src), 'hideExtras exists for detached parts');
  assert.ok(/seatParts/.test(src), 'seatParts closes stock/magazine gaps');
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
