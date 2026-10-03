/* RADAR REGRESSION TEST
 *
 * The radar is a FIXED MAP: the disc never rotates. World north (map -Z) is
 * always at the top, the window follows the player, and only the player marker
 * turns to show heading. Geometry and contacts are plotted through one
 * axis-aligned helper, so a player who knows the map reads the disc instantly
 * instead of re-orienting with the camera.
 *
 * The previous contract (the whole disc rotating by +yaw) was correct geometry
 * for a rotating radar, but the fixed map is the shipped design now. This suite
 * proves the new contract:
 *   - the plotting helper is a pure axis-aligned translation+scale, no rotation
 *   - world -Z is always up, +X always right, at every yaw
 *   - distance is linear and never clamped
 *   - the player marker triangle points the way the camera actually faces
 *     (verified against the real three.js camera, not assumed)
 *
 * The last test is a source guard reading game.js itself, so a rotation can
 * never creep back into the plotting helper and the marker can never stop
 * tracking the camera's heading.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof self === 'undefined' && globalThis) globalThis.self = globalThis;
const THREE = await import('three');

const SCALE = 2, CENTRE = 170 / 2;

// Reproduce game.js's shipped helper verbatim: axis-aligned, the window follows
// the player. There is deliberately no yaw parameter — the map never turns.
function radarPoint(wx, wz, px, pz) {
  return [CENTRE + (wx - px) * SCALE, CENTRE + (wz - pz) * SCALE];
}

// Reproduce game.js's shipped marker: a triangle drawn pointing up inside a
// rotate(-yaw) canvas transform. This is the ONLY radar element that turns.
// Canvas space maps to the world as: canvas +X = world +X, canvas up (negative
// canvas y) = world -Z, so world.x = tip.x/6 and world.z = tip.y/6.
function markerTipDirection(yaw) {
  // Canvas rotate(a) applies [cos a, -sin a; sin a, cos a] to local coords.
  // The tip is at local (0,-6); canvas y grows downward, so screen-up is -y.
  const a = -yaw;
  return { x: 0 * Math.cos(a) - (-6) * Math.sin(a), y: 0 * Math.sin(a) + (-6) * Math.cos(a) };
}

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

const YAWS = [0, 0.4, 0.8, Math.PI / 2, 2.0, 2.3, Math.PI, -0.6, -Math.PI / 2, -2.1];

test('radar: the plotting helper is axis-aligned (the map never rotates)', () => {
  // A contact at a fixed world offset from the player must land at the SAME
  // disc position no matter which way the player faces — that is what "the map
  // is fixed" means. The old rotating disc moved every contact with yaw.
  const px = 3, pz = -7;
  const first = radarPoint(px + 5, pz - 9, px, pz);
  for (const yaw of YAWS) {
    // yaw is irrelevant to plotting; the helper has no yaw parameter, which is
    // the whole assertion.
    const [rx, ry] = radarPoint(px + 5, pz - 9, px, pz);
    assert.equal(rx, first[0], 'contact x is yaw-independent');
    assert.equal(ry, first[1], 'contact y is yaw-independent');
  }
});

test('radar: world -Z is always up and +X always right, at every yaw', () => {
  const px = 0, pz = 0;
  // A contact 10m along world -Z (map north) is 10m "north" on the disc.
  const [nx, ny] = radarPoint(0, -10, px, pz);
  assert.ok(ny < CENTRE, 'world -Z is above the centre (north at the top of the disc)');
  assert.ok(Math.abs(nx - CENTRE) < 1e-9, 'world -Z is horizontally centred');
  // A contact 10m along world +X is to the right of the disc.
  const [ex, ey] = radarPoint(10, 0, px, pz);
  assert.ok(ex > CENTRE, 'world +X is right of the centre');
  assert.ok(Math.abs(ey - CENTRE) < 1e-9, 'world +X is vertically centred');
  // A contact 10m along world +Z is below the centre.
  assert.ok(radarPoint(0, 10, px, pz)[1] > CENTRE, 'world +Z is below the centre');
  // A contact 10m along world -X is to the left.
  assert.ok(radarPoint(-10, 0, px, pz)[0] < CENTRE, 'world -X is left of the centre');
});

test('radar: the marker triangle points where the camera faces, at every yaw', () => {
  // The marker is the only thing that turns. Its tip direction, converted from
  // canvas space (y down) to world axes (canvas up = world -Z, canvas right =
  // world +X), must match the camera's real forward vector.
  for (const yaw of YAWS) {
    const f = forwardAt(yaw);
    const tip = markerTipDirection(yaw);
    const worldDir = { x: tip.x / 6, z: tip.y / 6 };
    const dot = worldDir.x * f.x + worldDir.z * f.z;
    assert.ok(dot > 0.999,
      'yaw=' + yaw.toFixed(2) + ': the marker must point along the camera forward ' +
      '(dot=' + dot.toFixed(4) + ', marker world dir (' + worldDir.x.toFixed(2) + ',' +
      worldDir.z.toFixed(2) + ') vs camera (' + f.x.toFixed(2) + ',' + f.z.toFixed(2) + '))');
  }
});

test('radar: at yaw=0 the marker points north, and north is the top of the disc', () => {
  // The disc is fixed, so "ahead of the player" only makes sense relative to
  // the marker. A bot 10m north of a player facing north is straight ahead of
  // them; verified through the marker, not through contact placement.
  const yaw = 0;
  const f = forwardAt(yaw);
  const tip = markerTipDirection(yaw);
  const worldDir = { x: tip.x / 6, z: tip.y / 6 };
  const dot = worldDir.x * f.x + worldDir.z * f.z;
  assert.ok(dot > 0.999, 'at yaw=0 the marker points along world -Z (north)');
  // And that north is where the radar puts "up".
  assert.ok(radarPoint(0, -10, 0, 0)[1] < CENTRE, 'so a north contact is at the top of the disc');
});

test('radar: distance is linear and never clamps for reasonable ranges', () => {
  const px = 0, pz = 0;
  for (const dist of [5, 10, 15, 20]) {
    const [rx, ry] = radarPoint(0, pz - dist, px, pz);
    const radial = Math.hypot(rx - CENTRE, ry - CENTRE);
    assert.ok(Math.abs(radial - dist * SCALE) < 1e-6,
      'a contact ' + dist + 'm away should sit ' + (dist * SCALE) + 'px from centre, got ' +
      radial.toFixed(1));
  }
});

test('radar: player movement moves contacts relative to the player, and the marker stays centred', () => {
  // The player marker is drawn at the hardcoded centre, so it can never drift;
  // what must change is every contact's relative position as the player walks.
  // Player at z=0, contact 10m north at z=-10. The player walks 5m north
  // (to z=-5), so the contact's remaining distance is 5m and its disc radius
  // shrinks from 20px to 10px — the contact moves DOWN the disc toward the
  // centre, i.e. ry increases.
  const [r1x, r1y] = radarPoint(0, -10, 0, 0);
  const [r2x, r2y] = radarPoint(0, -10, 0, -5);
  assert.ok(Math.abs((r2y - r1y) - 5 * SCALE) < 1e-6,
    'walking toward a contact should move it toward the disc centre by ' + (5 * SCALE) +
    'px, got ' + (r2y - r1y).toFixed(1));
  assert.ok(Math.abs(r2x - r1x) < 1e-6, 'walking straight at a contact must not shift it sideways');
});

test('radar: a stationary player sees a moving bot travel the correct relative path', () => {
  // Bot walks from west to east, 10m north of the player. On the fixed disc
  // that is a horizontal sweep 20px above the centre, left to right.
  const a = radarPoint(-10, -10, 0, 0);
  const b = radarPoint(10, -10, 0, 0);
  assert.ok(a[0] < CENTRE && b[0] > CENTRE, 'the sweep should cross the centre line');
  assert.ok(Math.abs(a[1] - b[1]) < 1e-6, 'a level walk should keep a constant radar height');
  assert.ok(a[1] < CENTRE && b[1] < CENTRE, 'a bot north of the player stays above the centre');
});

/* SOURCE GUARD: the tests above prove the transform is right, but they
 * reimplement the helper independently. This one reads game.js itself and fails
 * the moment a rotation creeps back into the radar plotting, or the marker
 * stops tracking the camera's heading.
 */
test('radar: game.js plots an axis-aligned map and rotates only the marker (source guard)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync((await import('node:path')).join(import.meta.dirname, '..', 'game.js'), 'utf8');
  // The shipped helper: a pure world-offset translation and scale, no yaw.
  assert.ok(/function rp\(wx,wz\)\{return \[85\+\(wx-x\)\*2,85\+\(wz-z\)\*2\];\}/.test(src),
    'the radar plotting helper must be axis-aligned: [85+(wx-x)*2, 85+(wz-z)*2]');
  // No cos(yaw)/sin(yaw) rotation may remain anywhere in the radar block.
  const radarStart = src.indexOf("radar').getContext");
  assert.ok(radarStart > -1, 'the radar draw block exists');
  const radarEnd = src.indexOf("rc.textAlign='left';", src.indexOf(' North marker at the top', radarStart));
  assert.ok(radarEnd > -1, 'the radar block ends at the north-marker statement');
  const block = src.slice(radarStart, radarEnd);
  assert.ok(!/Math\.cos\(yaw\)|Math\.sin\(yaw\)/.test(block),
    'the radar block must not rotate the map by yaw; only the marker turns');
  // The marker must rotate by -yaw and be drawn as a heading triangle.
  assert.ok(/rc\.rotate\(-yaw\)/.test(block), 'the player marker rotates by -yaw');
  assert.ok(/rc\.moveTo\(0,-6\);rc\.lineTo\(4,4\);rc\.lineTo\(-4,4\)/.test(block),
    'the marker is a triangle, not a centre dot');
  // The fixed disc needs a north reference or it is unreadable.
  assert.ok(/fillText\('N',85,10\)/.test(block), 'the fixed disc has a north marker');
});
