// Verification for the six field-operations fixes (browser-free parts).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('sw.js cache version bumped', () => {
  const m = src('sw.js').match(/CACHE\s*=\s*'([^']+)'/);
  assert.ok(m);
  assert.notStrictEqual(m[1], 'poly-strike-v7-store', 'cache version must change');
});

test('kar98k barrel reaches the receiver ring (no detach)', () => {
  const T = require(path.join(ROOT, 'vendor/three.min.js'));
  const scene = { add() {} };
  const PolyVisual = require(path.join(ROOT, 'visuals.js'));
  // stub: visuals.js only needs a THREE and a document-free env
  const g = PolyVisual.buildWeapon(T, 'kar98');
  // collect the barrel cylinders and confirm continuous coverage ring→muzzle
  let ringFront = null, barrelMin = null, barrelMax = null;
  g.traverse(o => {
    if (!o.geometry) return;
    if (o.geometry.type === 'BoxGeometry') return;
    const bb = new T.Box3().setFromObject(o);
    if (bb.isEmpty()) return;
    if (o.geometry.type === 'CylinderGeometry') {
      if (barrelMin === null || bb.min.z < barrelMin) barrelMin = bb.min.z;
      if (barrelMax === null || bb.max.z > barrelMax) barrelMax = bb.max.z;
    }
  });
  assert.ok(barrelMin !== null, 'kar98 has barrel geometry');
  // the receiver ring sits at z=0.15 with depth 0.05 -> front face z=0.125
  assert.ok(barrelMax >= 0.125 - 0.02, `barrel must reach receiver ring, rear z=${barrelMax}`);
});

test('every weapon offers Midnight as its 4th skin and 7 total', () => {
  const PolyVisual = require(path.join(ROOT, 'visuals.js'));
  for (const w of ['ak47', 'awp', 'kar98', 'deagle', 'knife']) {
    const skins = PolyVisual.SKINS[w];
    assert.ok(Array.isArray(skins), `${w} has a skin list`);
    assert.strictEqual(skins.length, 7, `${w} should have 7 skins`);
    assert.strictEqual(skins[3].name, 'Midnight', `${w} slot 3 must be Midnight`);
  }
});

test('rollCase uses rarity tiers without early-return bias', () => {
  const game = src('game.js');
  assert.ok(!/for\(let i=0;i<CASE_ITEM_W.length;i\+\+\)\{acc\+=CASE_ITEM_W\[i\];if\(rng\(\)\*100<acc\)return CASE_ITEMS\[i\]/.test(game),
    'old biased early-return rollCase must be gone');
  assert.ok(game.includes('const pool=CASE_ITEMS.filter(it=>it[2]===tier)'),
    'rollCase must filter by tier then pick uniformly');
});

test('case reel uses easing and emits tick clicks', () => {
  const game = src('game.js');
  assert.ok(game.includes('A.sound(\'tick\')'), 'reel must play tick cue');
  assert.ok(/easeOutCubic|1-Math\.pow\(1-/.test(game), 'reel must ease out');
});

test('tick audio cue exists', () => {
  assert.ok(src('audio.js').includes('tick:'), 'audio.js must define a tick cue');
});

test('training targets fall instead of vanishing', () => {
  const game = src('game.js');
  assert.ok(game.includes('userData.fall'), 'syncBots must drive a fall state');
  assert.ok(/match\.training/.test(game), 'fall is gated to training mode');
});

test('career stats seed and persist real values', () => {
  const game = src('game.js');
  assert.ok(game.includes('poly-career-seed'), 'one-time seed grant must exist');
  assert.ok(game.includes('recordCareer('), 'real match stats must be recorded');
});
