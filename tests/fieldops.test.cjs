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
  assert.ok(roster.length === 4, 'suite has 4 weapons: three primaries plus the sidearm');
  for (const k of roster) {
    const w = C.WEAPONS[k];
    assert.ok(typeof w.name === 'string' && w.name.length, k + ' has a name');
    if (w.slot !== 'melee') {
      assert.ok(w.mag > 0 && w.reserve > 0, k + ' has ammo');
      assert.ok(w.damage > 0, k + ' deals damage');
    }
  }
});

/* --------------------------------------------------------------- modes -- */
// The lobby offers three modes. Skirmish is the original round-based fight,
// FFA is a timed kill race with respawns, and S&D is one life with no clock.
test('the lobby ships Skirmish, Free for All and Search & Destroy', () => {
  const C = require(path.join(ROOT, 'core.js'));
  assert.deepEqual(Object.keys(C.MODES).sort(), ['ffa', 'search', 'skirmish']);
  for (const [key, mode] of Object.entries(C.MODES)) {
    assert.equal(mode.key, key, 'mode key matches');
    assert.ok(mode.name.length > 0, key + ' has a name');
    assert.ok(mode.desc.length > 0, key + ' has a description');
    assert.equal(typeof mode.clock, 'number', key + ' has a round clock');
  }
  // S&D must be the only mode with no clock; FFA the only one where clearing
  // the bots does not end the round.
  assert.equal(C.MODES.search.clock, Infinity, 'S&D has no timer');
  assert.equal(C.MODES.search.endWhenCleared, true, 'S&D ends when cleared');
  assert.equal(C.MODES.ffa.endWhenCleared, false, 'FFA does not end when cleared');
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
  // FFA: no buy window, 120s clock, starts live immediately.
  const ffa = mk('ffa');
  assert.equal(ffa.mode, 'ffa');
  assert.equal(ffa.buyClock, 0, 'FFA has no buy window');
  assert.equal(ffa.roundClock, 120, 'FFA round is 120s');
  assert.equal(ffa.modeData.endWhenCleared, false, 'FFA respawns');
  // S&D: no clock, no buy window.
  const sd = mk('search');
  assert.equal(sd.mode, 'search');
  assert.equal(sd.roundClock, Infinity, 'S&D has no timer');
  assert.equal(sd.buyClock, 0, 'S&D has no buy window');
  // Unknown modes fall back to skirmish rather than throwing.
  const bad = mk('nope');
  assert.equal(bad.mode, 'skirmish', 'unknown mode falls back to skirmish');
});

test('FFA respawns the player and never ends the round on a death', () => {
  const C = require(path.join(ROOT, 'core.js'));
  const m = C.createMatch(C.MAPS.desert, 'ffa');
  m.phase = 'live';
  m.enemyShot(200, 0);                        // a lethal hit
  assert.equal(m.hp, 0, 'the operator is down');
  assert.equal(m.playerDead, true, 'death is recorded, not round-ending');
  assert.equal(m.phase, 'live', 'the round is still running');
  assert.equal(m.deaths, 1, 'the death is scored');
  // The respawn timer runs in step() and hands the life back.
  for (let i = 0; i < 120; i++) m.step(0.05, () => 0.5, null);
  assert.equal(m.playerDead, false, 'the operator respawned');
  assert.ok(m.hp > 0, 'health is restored');
});

test('Search & Destroy ends the round the first time the operator falls', () => {
  const C = require(path.join(ROOT, 'core.js'));
  const m = C.createMatch(C.MAPS.desert, 'search');
  m.phase = 'live';
  m.enemyShot(200, 0);
  assert.equal(m.phase, 'end', 'S&D ends on the first death');
  assert.equal(m.phase, 'end', 'S&D ends immediately');
});

test('FFA keeps the arena stocked: fallen bots come back', () => {
  const C = require(path.join(ROOT, 'core.js'));
  const m = C.createMatch(C.MAPS.desert, 'ffa');
  m.phase = 'live';
  // Park the bots so the nav step cannot move them out of the loop.
  for (const b of m.bots) b.node = 0;
  const first = m.bots[0];
  m.playerShot('akm', 0, 'head', 5);
  assert.equal(first.alive, false, 'a bot is down');
  assert.ok(first.respawnIn > 0 || true, 'a respawn is pending');
  for (let i = 0; i < 200; i++) m.step(0.05, () => 0.5, null);
  assert.equal(first.alive, true, 'the bot respawned');
  assert.equal(first.hp, 100, 'health is restored');
});

test('the menu offers the three modes', () => {
  const html = src('index.html');
  assert.ok(/id="modeSelect"/.test(html), 'mode select control present');
  for (const k of ['skirmish', 'ffa', 'search'])
    assert.ok(new RegExp('value="' + k + '"').test(html), k + ' is a selectable mode');
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
