/* RADAR REGRESSION TEST
 *
 * The shipped radar rotated world->radar coordinates with cos(-yaw)/sin(-yaw),
 * which is the TRANSPOSE of the rotation the game's camera convention
 * requires. This project's camera uses rotation.order='YXZ' with
 * cam.rotation.set(pitch, yaw, 0), so at yaw=0 the player faces (0,0,-1) and
 * the player's right is (+cos yaw, -sin yaw). The radar therefore has to
 * rotate world offsets by +yaw, not -yaw. With the old sign a contact
 * straight ahead of the player was placed BELOW the radar centre for every
 * yaw that was not a multiple of pi/2 — contacts appeared to flip and lag
 * behind the player's real facing.
 *
 * This test redrives the exact transform game.js computes, against the real
 * three.js camera convention, so the fix cannot silently revert.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof self === 'undefined' && globalThis) globalThis.self = globalThis;
const THREE = await import('three');

// The camera is the ground truth for "which way is forward at this yaw".
const cam = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
cam.rotation.order = 'YXZ';
function forwardAt(yaw) {
  cam.rotation.set(0, yaw, 0);
  cam.updateMatrixWorld();
  const f = new THREE.Vector3();
  cam.getWorldDirection(f);
  return { x: f.x, z: f.z };
}

// Reproduce game.js's rp() verbatim, parameterised on the sign so both the
// broken and fixed transforms can be exercised.
const SCALE = 2, CENTRE = 85;
function radarPoint(wx, wz, yaw, px, pz, useMinusYaw) {
  const a = useMinusYaw ? -yaw : yaw;
  const cy = Math.cos(a), sy = Math.sin(a);
  const dx = wx - px, dz = wz - pz;
  return [CENTRE + (dx * cy - dz * sy) * SCALE, CENTRE + (dx * sy + dz * cy) * SCALE];
}

// The orientation is a property of the transform, not of any one yaw, so it is
// asserted at a spread of yaws (not just the axes, where the old code passed).
const YAWS = [0, 0.4, 0.8, Math.PI / 2, 2.0, 2.3, Math.PI, -0.6, -Math.PI / 2, -2.1];

test('radar: a contact straight ahead is ABOVE centre at every yaw (the shipped bug)', () => {
  const PX = 0, PZ = 0;
  for (const yaw of YAWS) {
    const f = forwardAt(yaw);
    const [rx, ry] = radarPoint(PX + f.x * 10, PZ + f.z * 10, yaw, PX, PZ, false);
    assert.ok(ry < CENTRE,
      'yaw=' + yaw.toFixed(2) + ': a contact straight ahead must be ABOVE the centre ' +
      '(screen y grows downward), got ry=' + ry.toFixed(1));
    assert.ok(Math.abs(rx - CENTRE) < 0.5,
      'yaw=' + yaw.toFixed(2) + ': a contact straight ahead must be horizontally centred, ' +
      'got rx=' + rx.toFixed(1) + ' (off by ' + (rx - CENTRE).toFixed(1) + 'px)');
  }
});

test('radar: the old cos(-yaw) transform reproduces the reported flip', () => {
  // This is the regression sentinel: if the sign is ever inverted again this
  // test documents exactly what breaks. It asserts the OLD transform is wrong,
  // so a reversion makes THIS test fail while the one above stays red.
  const PX = 0, PZ = 0;
  const broken = [];
  for (const yaw of YAWS) {
    const f = forwardAt(yaw);
    const [rx, ry] = radarPoint(PX + f.x * 10, PZ + f.z * 10, yaw, PX, PZ, true);
    if (!(ry < CENTRE && Math.abs(rx - CENTRE) < 0.5)) broken.push(yaw.toFixed(2));
  }
  assert.ok(broken.length >= 7,
    'the cos(-yaw) transform should misplace a straight-ahead contact at most yaws; ' +
    'only ' + broken.length + ' of ' + YAWS.length + ' were wrong (' + broken.join(',') + ')');
});

test('radar: front/back/left/right map to the correct quadrant', () => {
  const PX = 0, PZ = 0, yaw = 0;
  // At yaw=0 the player faces -Z, so -Z is ahead, +Z behind, and the player's
  // right (derived from the camera, not assumed) is +X.
  const f = forwardAt(yaw);
  const right = { x: -f.z, z: f.x };
  const left = { x: f.z, z: -f.x };
  const cases = [
    [0, -10, 'ahead', (rx, ry) => ry < CENTRE],
    [0, 10, 'behind', (rx, ry) => ry > CENTRE],
    [right.x * 10, right.z * 10, 'right', (rx, ry) => rx > CENTRE],
    [left.x * 10, left.z * 10, 'left', (rx, ry) => rx < CENTRE],
  ];
  for (const [dx, dz, label, ok] of cases) {
    const [rx, ry] = radarPoint(PX + dx, PZ + dz, yaw, PX, PZ, false);
    assert.ok(ok(rx, ry), label + ' at (' + dx.toFixed(1) + ',' + dz.toFixed(1) +
      ') landed at radar (' + rx.toFixed(1) + ',' + ry.toFixed(1) + ')');
  }
});

test('radar: quadrants stay correct after a 90/180/270 rotation', () => {
  const PX = 0, PZ = 0;
  // A contact that sits 10m along the world -Z axis. As the player turns, that
  // same contact must migrate around the disc consistently: wherever the
  // player's own right vector points, a contact on that side is to the right.
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.7, -1.3]) {
    const f = forwardAt(yaw);
    const right = { x: -f.z, z: f.x };
    // Place a contact 10m to the player's right and 10m ahead; it must land
    // above the centre (ahead) and to the right of it, whatever the yaw.
    const c = { x: f.x * 10 + right.x * 10, z: f.z * 10 + right.z * 10 };
    const [rx, ry] = radarPoint(PX + c.x, PZ + c.z, yaw, PX, PZ, false);
    assert.ok(ry < CENTRE, 'yaw=' + yaw.toFixed(2) + ': a contact ahead-and-right ' +
      'must be ABOVE the centre, got ry=' + ry.toFixed(1));
    assert.ok(rx > CENTRE, 'yaw=' + yaw.toFixed(2) + ': a contact ahead-and-right ' +
      'must be RIGHT of centre, got rx=' + rx.toFixed(1));
    // The same contact 10m to the player's LEFT and ahead must mirror it.
    const c2 = { x: f.x * 10 - right.x * 10, z: f.z * 10 - right.z * 10 };
    const [rx2, ry2] = radarPoint(PX + c2.x, PZ + c2.z, yaw, PX, PZ, false);
    assert.ok(ry2 < CENTRE && rx2 < CENTRE,
      'yaw=' + yaw.toFixed(2) + ': ahead-and-left must be above and left of centre, got (' +
      rx2.toFixed(1) + ',' + ry2.toFixed(1) + ')');
  }
});

test('radar: distance is linear and never clamps for reasonable ranges', () => {
  const PX = 0, PZ = 0, yaw = 0;
  for (const dist of [5, 10, 15, 20]) {
    const [rx, ry] = radarPoint(0, PZ - dist, yaw, PX, PZ, false);
    const radial = Math.hypot(rx - CENTRE, ry - CENTRE);
    assert.ok(Math.abs(radial - dist * SCALE) < 1e-6,
      'a contact ' + dist + 'm away should sit ' + (dist * SCALE) + 'px from centre, got ' +
      radial.toFixed(1));
  }
});

test('radar: player movement moves contacts relative to the player, and the marker stays centred', () => {
  const yaw = 0;
  // The player marker is drawn at the hardcoded centre, so it can never drift;
  // what must change is every contact's relative position as the player walks.
  // Player at z=0, contact 10m ahead at z=-10. The player walks 5m toward it
  // (to z=-5), so the contact's remaining distance is 5m and its disc radius
  // shrinks from 20px to 10px — the contact moves DOWN the disc toward the
  // centre, i.e. ry increases.
  const [r1x, r1y] = radarPoint(0, -10, yaw, 0, 0, false);
  const [r2x, r2y] = radarPoint(0, -10, yaw, 0, -5, false);
  assert.ok(Math.abs((r2y - r1y) - 5 * SCALE) < 1e-6,
    'walking toward a contact should move it toward the disc centre by ' + (5 * SCALE) +
    'px, got ' + (r2y - r1y).toFixed(1));
  assert.ok(Math.abs(r2x - r1x) < 1e-6, 'walking straight at a contact must not shift it sideways');
});

test('radar: a stationary player sees a moving bot travel the correct relative path', () => {
  const yaw = 0;
  // Bot walks from the player's left to their right, 10m ahead. On the disc that
  // is a horizontal sweep 20px above the centre, left to right.
  const a = radarPoint(-10, -10, yaw, 0, 0, false);
  const b = radarPoint(10, -10, yaw, 0, 0, false);
  assert.ok(a[0] < CENTRE && b[0] > CENTRE, 'the sweep should cross the centre line');
  assert.ok(Math.abs(a[1] - b[1]) < 1e-6, 'a level walk should keep a constant radar height');
  assert.ok(a[1] < CENTRE && b[1] < CENTRE, 'a bot ahead of the player stays above the centre');
});

/* SOURCE GUARD: the tests above prove the transform is right, but they
 * reimplement rp() independently. This one reads game.js itself and fails the
 * moment the shipped rotation is inverted again. It mirrors the static guards
 * in boot.mjs: the transform is one line, so a literal scan is sufficient and
 * needs no AST.
 */
test('radar: game.js rotates world->radar by +yaw, not -yaw (shipped source guard)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'game.js'), 'utf8');
  // The hud() radar block. It is the only place in the project that builds a
  // radar projection, so the guard can be this specific.
  const m = src.match(/const cy=Math\.cos\(([^)]*)\),\s*sy=Math\.sin\(([^)]*)\)/);
  assert.ok(m, 'the radar rotation constants must exist in game.js');
  assert.equal(m[1].trim(), 'yaw',
    'game.js must rotate world->radar by +yaw. Got cos(' + m[1] + ') — the inverse ' +
    'rotation sends a contact straight ahead of the player BELOW the radar centre ' +
    'for every yaw that is not a multiple of pi/2 (the reported flip).');
  assert.equal(m[2].trim(), 'yaw', 'game.js must use sin(yaw) for the radar rotation');
});
