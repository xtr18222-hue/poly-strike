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

test('asset suite ships every weapon the game selects', () => {
  const C = require(path.join(ROOT, 'core.js'));
  // Every key the simulation balances must have a model file on disk, or the
  // game would spawn a weapon with no mesh.
  const fs = require('fs');
  const roster = Object.keys(C.WEAPONS);
  // The roster: the four primaries (AKM / L96 / Hecate / Mossberg), the Deagle,
  // the Glock, the bayonet and the M67 grenade.
  assert.equal(roster.length, 9, 'the roster: four primaries, two pistols, the knife, the grenade and the flashbang');
  for (const k of roster) {
    const w = C.WEAPONS[k];
    assert.ok(typeof w.name === 'string' && w.name.length, k + ' has a name');
    if (w.melee || w.throwable) continue;   // the bayonet has no magazine, the grenade no reserve
    assert.ok(w.mag > 0 && w.reserve > 0, k + ' has ammo');
    assert.ok(w.damage > 0, k + ' deals damage');
  }
  // The knife's model file is on disk, or the game would spawn a weapon with
  // no mesh.
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/models/low-poly_fa-03_bayonet.glb')), 'the bayonet GLB is shipped');
});

/* --------------------------------------------------------------- modes -- */
// The lobby offers Skirmish only. FFA and Search & Destroy were removed and
// the mode table and the match loop no longer carry their rulesets.
test('the lobby ships Skirmish only; FFA and Search & Destroy are gone', () => {
  const C = require(path.join(ROOT, 'core.js'));
  assert.deepEqual(Object.keys(C.MODES), ['skirmish']);
  for (const [key, mode] of Object.entries(C.MODES)) {
    assert.equal(mode.key, key, 'mode key matches');
    assert.ok(mode.name.length > 0, key + ' has a name');
    assert.ok(mode.desc.length > 0, key + ' has a description');
    assert.equal(typeof mode.clock, 'number', key + ' has a round clock');
  }
  // The removed modes must not resolve at all: unknown keys fall back.
  for (const k of ['ffa', 'search'])
    assert.equal(C.createMatch(C.MAPS.desert, k).mode, 'skirmish',
      k + ' no longer resolves to its own ruleset');
});

test('createMatch honours the selected mode', () => {
  const C = require(path.join(ROOT, 'core.js'));
  const mk = m => C.createMatch(C.MAPS.desert, m);
  // Skirmish starts live: the build has no buy menu, no money UI and no buy key,
  // so a 5-second buy phase only locked the controls after PLAY.
  const sk = mk('skirmish');
  assert.equal(sk.mode, 'skirmish');
  assert.equal(sk.buyClock, 0, 'skirmish has no buy window');
  assert.equal(sk.roundClock, 90, 'skirmish round is 90s');
  assert.ok(sk.phase === 'live', 'skirmish starts live');
  // Unknown modes fall back to skirmish rather than throwing.
  const bad = mk('nope');
  assert.equal(bad.mode, 'skirmish', 'unknown mode falls back to skirmish');
});







test('the menu has no mode selection: skirmish only', () => {
  const html = src('index.html');
  assert.ok(!/id="modeSelect"/.test(html), 'the mode dropdown was removed entirely');
  assert.ok(!/id="modeDescription"/.test(html), 'the mode description line was removed');
  for (const k of ['ffa', 'search'])
    assert.ok(!new RegExp('value="' + k + '"').test(html), k + ' stays removed from the menu');
  // The MODES table still drives the simulation; the UI layer just no longer
  // exposes a selector for it.
  assert.ok(require(path.join(ROOT, 'core.js')).MODES, 'the mode table still drives the match');
  assert.equal(Object.keys(require(path.join(ROOT, 'core.js')).MODES).join(), 'skirmish', 'skirmish is the only mode');
});

test('announcer packs map every clip and the Clutch line is gone', () => {
  const fs = require('fs');
  const path = require('path');
  const audio = fs.readFileSync(path.join(ROOT, 'audio.js'), 'utf-8');
  // The male pack is hard-capped at 10 tiers in v42, so Annihilation (tier 12)
  // is no longer shipped — it must not be referenced anywhere.
  const male = ['[audio]First......lood!','Mortal-Kombat-Announcer-2026-09-20-06-53-Double-Kill'];
  const female = ['[UT Sexy Female Announcer]First......Blood','[UT Sexy Female Announcer]holy ......op!!! (1)'];
  for (const name of male.concat(female)) {
    assert.ok(audio.includes(name), 'pack maps ' + name.slice(0, 30));
    assert.ok(fs.existsSync(path.join(ROOT, 'assets/audio', name + '.mp3')), name.slice(0, 30) + ' exists on disk');
  }
  // The Clutch announcement was removed: no pack entry, no trigger, no file
  // reference anywhere in the game code.
  for (const name of ['Clutch','Mortal-Kombat-Announcer-2026-09-20-06-52-Clutch']) {
    assert.ok(!audio.includes(name), 'audio.js no longer references ' + name);
  }
  // v42 hard cap: no tier above 10 may ship, because it can never play.
  for (const name of ['Devastation','Annihilation','Monster-Kill','Godlike']) {
    assert.ok(!audio.includes(name), 'audio.js ships no tier above the 10-kill cap: ' + name);
  }
  for (const f of ['game.js','core.js','visuals.js','maps.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf-8');
    assert.ok(!/clutch/i.test(src), f + ' has no clutch code');
  }
});






test('tick audio cue exists', () => {
  assert.ok(src('audio.js').includes('tick:'), 'audio.js must define a tick cue');
});

test('announcer hard cap at 10 kills for every pack', () => {
  // The v42 contract: the announcer calls kills 1..10 and NOTHING beyond.
  // Both packs share one cap, and there is no path that can exceed it.
  const fs = require('fs');
  const path = require('path');
  const audio = src('audio.js');
  assert.ok(/const TIER_CAPS = \{ male: 10, female: 10 \}/.test(audio),
    'TIER_CAPS is a shared hard cap of 10 (male 10, female 10)');
  assert.ok(!/\bTIER_CAP\b\s*=/.test(audio), 'the shared TIER_CAP constant is gone');
  assert.ok(/kills <= cap/.test(audio), 'announce() rejects kills above the cap');

  const dir = path.join(ROOT, 'assets/audio');
  for (const pack of ['male', 'female']) {
    const m = new RegExp('    ' + pack + ': \\[([\\s\\S]*?)\\n    \\],').exec(audio);
    assert.ok(m, pack + ' pack found');
    const clips = m[1].split('\n').map(l => l.trim().replace(/,$/, '').replace(/^'|'$/g, '')).filter(x => x && !x.startsWith('//'));
    // No pack may exceed the shared hard cap: anything beyond tier 10 is dead
    // code that can never play, so it must not be shipped.
    assert.ok(clips.length <= 10, pack + ' pack respects the 10-kill cap, got ' + clips.length);
    assert.equal(new Set(clips).size, clips.length, pack + ' tiers are all distinct');
    for (const name of clips)
      assert.ok(fs.existsSync(path.join(dir, name + '.mp3')), name.slice(0, 28) + ' exists on disk');
  }
  // The male pack is the reference: it must ship all ten tiers so every kill
  // 1..10 gets its own callout.
  const m10 = /    male: \[([\s\S]*?)\n    \],/.exec(audio);
  const male = m10[1].split('\n').map(l => l.trim().replace(/,$/, '').replace(/^'|'$/g, '')).filter(x => x && !x.startsWith('//'));
  assert.equal(male.length, 10, 'male pack ships exactly the 10 tiers, got ' + male.length);
});



test('career stats seed and persist real values', () => {
  const game = src('game.js');
  assert.ok(game.includes('poly-career-seed'), 'one-time seed grant must exist');
  assert.ok(game.includes('recordCareer('), 'real match stats must be recorded');
});
