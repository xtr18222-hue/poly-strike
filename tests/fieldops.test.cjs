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
  assert.ok(roster.length >= 7, 'suite has the full roster: primaries, sidearm and the blade');
  for (const k of roster) {
    const w = C.WEAPONS[k];
    assert.ok(typeof w.name === 'string' && w.name.length, k + ' has a name');
    if (w.slot === 'close') continue;   // the blade has no magazine
    assert.ok(w.mag > 0 && w.reserve > 0, k + ' has ammo');
    assert.ok(w.damage > 0, k + ' deals damage');
  }
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
  // Skirmish: buy phase, 90s rounds, first to five.
  const sk = mk('skirmish');
  assert.equal(sk.mode, 'skirmish');
  assert.ok(sk.buyClock > 0, 'skirmish has a buy window');
  assert.equal(sk.roundClock, 90, 'skirmish round is 90s');
  assert.ok(sk.phase === 'buy', 'skirmish starts in buy');
  // Unknown modes fall back to skirmish rather than throwing.
  const bad = mk('nope');
  assert.equal(bad.mode, 'skirmish', 'unknown mode falls back to skirmish');
});







test('the menu offers Skirmish only', () => {
  const html = src('index.html');
  assert.ok(/id="modeSelect"/.test(html), 'mode select control present');
  assert.ok(/value="skirmish"/.test(html), 'skirmish is a selectable mode');
  for (const k of ['ffa', 'search'])
    assert.ok(!new RegExp('value="' + k + '"').test(html), k + ' was removed from the menu');
  assert.ok(/id="modeDescription"/.test(html), 'mode description line present');
  assert.ok(src('game.js').includes('MODES'), 'the game reads the mode table');
});

test('announcer packs map every clip and the Clutch line is gone', () => {
  const fs = require('fs');
  const path = require('path');
  const audio = fs.readFileSync(path.join(ROOT, 'audio.js'), 'utf-8');
  const male = ['[audio]First......lood!','Mortal-Kombat-Announcer-2026-09-20-06-53-Double-Kill','Mortal-Kombat-Announcer-2026-09-20-07-07-Annihilation'];
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
  for (const f of ['game.js','core.js','visuals.js','maps.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf-8');
    assert.ok(!/clutch/i.test(src), f + ' has no clutch code');
  }
});






test('tick audio cue exists', () => {
  assert.ok(src('audio.js').includes('tick:'), 'audio.js must define a tick cue');
});

test('male announcer walks 14 sequential tiers, female caps at 9', () => {
  // The packs are capped separately. The male announcer must resolve every
  // tier 1..14 to a distinct clip with a real file; the female announcer stops
  // at 9 and must not be held to the male cap.
  const fs = require('fs');
  const path = require('path');
  const audio = src('audio.js');
  assert.ok(/const TIER_CAPS = \{ male: 14, female: 9 \}/.test(audio),
    'TIER_CAPS is split per pack (male 14, female 9)');
  assert.ok(!/\bTIER_CAP\b\s*=/.test(audio), 'the shared TIER_CAP constant is gone');

  const dir = path.join(ROOT, 'assets/audio');
  for (const [pack, cap] of [['male', 14], ['female', 9]]) {
    const m = new RegExp('    ' + pack + ': \\[([\\s\\S]*?)\\n    \\],').exec(audio);
    assert.ok(m, pack + ' pack found');
    const clips = m[1].split('\n').map(l => l.trim().replace(/,$/, '').replace(/^'|'$/g, '')).filter(x => x && !x.startsWith('//'));
    assert.equal(clips.length, cap, pack + ' pack lists exactly ' + cap + ' tiers, got ' + clips.length);
    assert.equal(new Set(clips).size, clips.length, pack + ' tiers are all distinct');
    for (const name of clips)
      assert.ok(fs.existsSync(path.join(dir, name + '.mp3')), name.slice(0, 28) + ' exists on disk');
  }
});



test('career stats seed and persist real values', () => {
  const game = src('game.js');
  assert.ok(game.includes('poly-career-seed'), 'one-time seed grant must exist');
  assert.ok(game.includes('recordCareer('), 'real match stats must be recorded');
});
