'use strict';
/* Static 76m arenas. Load before core.js in a classic browser script. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.POLY_MAPS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const desert = {
    id: 'desert', name: 'Sandline', theme: 'desert',
    spawnOpponent: { x: 0, z: -34 },
    size: 76,
    bounds: { hx: 38, hz: 38 },
    nav: [],
    spawnPlayer: { x: 0, z: 34 },
    spawnBots: [
      { x: 20, z: -16 }, { x: -20, z: 16 }, { x: 0, z: -34 },
      { x: 32, z: 0 }, { x: -32, z: 0 },
    ],
    solids: [
      // mid building
      { x: 0, z: 0, w: 10, d: 10, h: 6, kind: 'building' },
      // long-A style wall (west)
      { x: -16, z: -16, w: 1, d: 20, h: 3.5, kind: 'wall' },
      // long-B style wall (east)
      { x: 16, z: 16, w: 1, d: 20, h: 3.5, kind: 'wall' },
      // north wall with mid doors (gap at x -8..2)
      { x: -11, z: -24, w: 6, d: 1, h: 3.5, kind: 'wall' },
      { x: 4, z: -24, w: 4, d: 1, h: 3.5, kind: 'wall' },
      // A site: building + crates
      { x: 24, z: -24, w: 8, d: 8, h: 6, kind: 'building' },
      { x: 14, z: -28, w: 4, d: 4, h: 2, kind: 'crate' },
      { x: 30, z: -12, w: 4, d: 4, h: 2, kind: 'crate' },
      // B site: building + crates
      { x: -24, z: 24, w: 8, d: 8, h: 6, kind: 'building' },
      { x: -14, z: 28, w: 4, d: 4, h: 2, kind: 'crate' },
      { x: -30, z: 12, w: 4, d: 4, h: 2, kind: 'crate' },
      // south wall with door gap at x -2..2
      { x: -5, z: 32, w: 6, d: 1, h: 3.5, kind: 'wall' },
      { x: 5, z: 32, w: 6, d: 1, h: 3.5, kind: 'wall' },
      // north wall with door gap at x -8..8
      { x: -11, z: -32, w: 6, d: 1, h: 3.5, kind: 'wall' },
      { x: 11, z: -32, w: 6, d: 1, h: 3.5, kind: 'wall' },
    ],
  };


  // Warehouse: parallel cargo racks, broad cross-aisles, loading yards.
  const industrial = {
    id: 'industrial', name: 'Ironworks', theme: 'industrial',
    size: 76, bounds: { hx: 38, hz: 38 }, nav: [],
    spawnPlayer: { x: 0, z: 34 }, spawnOpponent: { x: 0, z: -34 },
    spawnBots: [{ x: -32, z: -28 }, { x: 32, z: -28 }, { x: 0, z: -34 }, { x: -32, z: 0 }, { x: 32, z: 0 }],
    solids: [
      { x: -24, z: -12, w: 5, d: 20, h: 4, kind: 'crate' },
      { x: -8, z: -12, w: 5, d: 20, h: 4, kind: 'crate' },
      { x: 8, z: -12, w: 5, d: 20, h: 4, kind: 'crate' },
      { x: 24, z: -12, w: 5, d: 20, h: 4, kind: 'crate' },
      { x: -24, z: 16, w: 5, d: 12, h: 3, kind: 'crate' },
      { x: -8, z: 16, w: 5, d: 12, h: 3, kind: 'crate' },
      { x: 8, z: 16, w: 5, d: 12, h: 3, kind: 'crate' },
      { x: 24, z: 16, w: 5, d: 12, h: 3, kind: 'crate' },
      { x: -20, z: 30, w: 12, d: 5, h: 7, kind: 'building' },
      { x: 20, z: 30, w: 12, d: 5, h: 7, kind: 'building' },
      { x: -16, z: -28, w: 12, d: 1, h: 3, kind: 'wall' },
      { x: 16, z: -28, w: 12, d: 1, h: 3, kind: 'wall' },
      { x: 0, z: 4, w: 5, d: 3, h: 2, kind: 'crate' },
    ],
  };
  // Urban: staggered city blocks create narrow alleys and offset junctions.
  const urban = {
    id: 'urban', name: 'Crossfire', theme: 'urban',
    size: 76, bounds: { hx: 38, hz: 38 }, nav: [],
    spawnPlayer: { x: -32, z: 32 }, spawnOpponent: { x: 32, z: -32 },
    spawnBots: [{ x: 32, z: -32 }, { x: 0, z: -32 }, { x: -32, z: -24 }, { x: 32, z: 8 }, { x: 8, z: 32 }],
    solids: [
      { x: -22, z: -22, w: 16, d: 16, h: 11, kind: 'building' },
      { x: 0, z: -22, w: 12, d: 12, h: 8, kind: 'building' },
      { x: 22, z: -20, w: 16, d: 20, h: 13, kind: 'building' },
      { x: -22, z: 2, w: 16, d: 16, h: 9, kind: 'building' },
      { x: 2, z: 0, w: 12, d: 16, h: 12, kind: 'building' },
      { x: 24, z: 4, w: 12, d: 12, h: 9, kind: 'building' },
      { x: -20, z: 24, w: 20, d: 12, h: 12, kind: 'building' },
      { x: 2, z: 24, w: 8, d: 12, h: 8, kind: 'building' },
      { x: 24, z: 24, w: 12, d: 12, h: 10, kind: 'building' },
      { x: -10, z: 0, w: 1, d: 6, h: 2.5, kind: 'wall' },
      { x: 12, z: 22, w: 1, d: 8, h: 2.5, kind: 'wall' },
      { x: 12, z: -4, w: 2, d: 3, h: 1.6, kind: 'crate' },
    ],
  };
  // Harbor: a coastal sawmill. A central dry-dock splits the map into a
  // cluttered west breakwater and an open east quay, with a crane gantry over
  // mid and a covered dock building on the south point.
  const harbor = {
    id: 'harbor', name: 'Drydock', theme: 'harbor',
    size: 76, bounds: { hx: 38, hz: 38 }, nav: [],
    spawnPlayer: { x: -32, z: 32 }, spawnOpponent: { x: 32, z: -32 },
    spawnBots: [
      { x: 32, z: -32 }, { x: 8, z: -28 }, { x: -26, z: -20 },
      { x: 30, z: 4 }, { x: 4, z: 26 },
    ],
    solids: [
      // mid dry-dock: two long seawalls with a gantry between them
      { x: -14, z: 0, w: 1, d: 26, h: 5, kind: 'wall' },
      { x: 14, z: 0, w: 1, d: 26, h: 5, kind: 'wall' },
      // gantry over mid: a tall crate block a bot can pass under
      { x: 0, z: 0, w: 10, d: 4, h: 9, kind: 'building' },
      // west breakwater: stacked timber, low and dense
      { x: -24, z: -16, w: 5, d: 5, h: 2, kind: 'crate' },
      { x: -24, z: -8, w: 5, d: 5, h: 3, kind: 'crate' },
      { x: -24, z: 0, w: 5, d: 5, h: 2, kind: 'crate' },
      { x: -24, z: 10, w: 5, d: 5, h: 3, kind: 'crate' },
      { x: -24, z: 18, w: 5, d: 5, h: 2, kind: 'crate' },
      // east quay: open yard with container stacks
      { x: 24, z: -16, w: 7, d: 12, h: 4, kind: 'crate' },
      { x: 24, z: 6, w: 7, d: 12, h: 4, kind: 'crate' },
      { x: 22, z: 24, w: 6, d: 5, h: 2, kind: 'crate' },
      // south dock building, flanked by low walls
      { x: -8, z: 28, w: 14, d: 7, h: 8, kind: 'building' },
      { x: 4, z: 30, w: 6, d: 1, h: 3, kind: 'wall' },
      { x: 22, z: 30, w: 10, d: 1, h: 3, kind: 'wall' },
      // north seawall with a gate gap at x -4..4
      { x: -14, z: -30, w: 8, d: 1, h: 4, kind: 'wall' },
      { x: 12, z: -30, w: 8, d: 1, h: 4, kind: 'wall' },
      // loose cover so the long lanes stay breakable
      { x: -6, z: 14, w: 3, d: 3, h: 1.5, kind: 'crate' },
      { x: 8, z: -12, w: 3, d: 3, h: 1.5, kind: 'crate' },
      { x: 4, z: 20, w: 2, d: 6, h: 2.5, kind: 'wall' },
    ],
  };
  // Training: open firing range with range lanes, cover and pop-up targets.
  // No match pressure: bots are static ducks/targets and never shoot back.
  const training = {
    id: 'training', name: 'Training Range', theme: 'training',
    size: 76, bounds: { hx: 38, hz: 38 }, nav: [],
    spawnPlayer: { x: 0, z: 34 },
    spawnOpponent: { x: 0, z: -34 },
    training: true,
    spawnBots: [
      { x: 0, z: 14 }, { x: -10, z: 6 }, { x: 10, z: 6 },
      { x: -18, z: -8 }, { x: 18, z: -8 },
    ],
    solids: [
      // perimeter sight line
      { x: 0, z: 0, w: 30, d: 1, h: 0.6, kind: 'wall' },
      // cover crates near the player
      { x: -10, z: 24, w: 4, d: 4, h: 2, kind: 'crate' },
      { x: 10, z: 24, w: 4, d: 4, h: 2, kind: 'crate' },
      { x: 0, z: 18, w: 4, d: 4, h: 2, kind: 'crate' },
      // mid cover, offset from the 4m nav grid so bots never clip a corner
      { x: -17, z: 1, w: 3, d: 3, h: 1.5, kind: 'crate' },
      { x: 17, z: 1, w: 3, d: 3, h: 1.5, kind: 'crate' },
      // back wall
      { x: -11, z: -32, w: 6, d: 1, h: 3.5, kind: 'wall' },
      { x: 11, z: -32, w: 6, d: 1, h: 3.5, kind: 'wall' },
    ],
  };

  // ==========================================================
  // Dedicated shooting range: interactive pop-up targets.
  // The existing Training Range above is untouched; this is a
  // separate arena built specifically for testing weapons.
  // ==========================================================
  const targetrange = {
    id: 'targetrange', name: 'Target Range', theme: 'training',
    size: 76, bounds: { hx: 38, hz: 38 }, nav: [],
    spawnPlayer: { x: 0, z: 34 },
    spawnOpponent: { x: 0, z: -34 },
    // A target range is for zeroing weapons, not for a firefight: the
    // targets are static and never shoot back.
    training: true,
    targets: true,
    spawnBots: [
      // Five pop-up target lanes at staggered depth.
      { x: -24, z: -22 }, { x: -12, z: -14 }, { x: 0, z: -26 },
      { x: 12, z: -14 }, { x: 24, z: -22 },
      // Two close reactive targets for shotgun/SMG work.
      { x: -8, z: 10 }, { x: 8, z: 10 },
    ],
    solids: [
      // The shooter's bench: a low barricade to brace over.
      { x: 0, z: 28, w: 24, d: 2, h: 1, kind: 'wall' },
      // Flanking cover so the walk forward is not a dead run.
      { x: -14, z: 20, w: 4, d: 4, h: 2, kind: 'crate' },
      { x: 14, z: 20, w: 4, d: 4, h: 2, kind: 'crate' },
      // Mid-lane baffles break up the crossfire between the lanes.
      { x: -18, z: 2, w: 6, d: 1, h: 1.2, kind: 'wall' },
      { x: 18, z: 2, w: 6, d: 1, h: 1.2, kind: 'wall' },
      { x: 0, z: 4, w: 1, d: 14, h: 1.2, kind: 'wall' },
      // Backstop wall behind the target line, with a gap so bots can cycle.
      { x: -20, z: -30, w: 12, d: 1, h: 4, kind: 'wall' },
      { x: 20, z: -30, w: 12, d: 1, h: 4, kind: 'wall' },
      // Target-line side walls frame the range lanes.
      { x: -34, z: -8, w: 1, d: 20, h: 3, kind: 'wall' },
      { x: 34, z: -8, w: 1, d: 20, h: 3, kind: 'wall' },
    ],
  };

  // ==========================================================
  // Shipment: a tight container maze on a dock. The classic
  // small-grid map: stacked containers as full-height cover and
  // shallow crates for the lanes between them.
  // ==========================================================
  const shipment = {
    id: 'shipment', name: 'Shipment', theme: 'industrial',
    size: 76, bounds: { hx: 38, hz: 38 }, nav: [],
    spawnPlayer: { x: 0, z: 34 },
    spawnOpponent: { x: 0, z: -34 },
    spawnBots: [
      { x: -12, z: -24 }, { x: 12, z: -24 }, { x: 0, z: -34 },
      { x: -24, z: -4 }, { x: 24, z: -4 },
    ],
    solids: [
      // Central container stack: the map's pivot. Two side-by-side
      // containers with a gap between them for the mid fight.
      { x: -8, z: 0, w: 14, d: 6, h: 5, kind: 'container' },
      { x: 8, z: 0, w: 14, d: 6, h: 5, kind: 'container' },
      // A stacked second tier over one side, for the height advantage.
      { x: -8, z: 0, w: 12, d: 4, h: 9, kind: 'container' },
      // North and south container rows close the ends, each with a lane gap.
      { x: -16, z: -20, w: 6, d: 12, h: 5, kind: 'container' },
      { x: 16, z: 20, w: 6, d: 12, h: 5, kind: 'container' },
      // East and west container walls with a centre lane.
      { x: -30, z: -12, w: 6, d: 16, h: 5, kind: 'container' },
      { x: 30, z: 12, w: 6, d: 16, h: 5, kind: 'container' },
      // Low crate cover so the lanes stay breakable and the short
      // sightlines are never a guaranteed death.
      { x: -16, z: 14, w: 4, d: 4, h: 2, kind: 'crate' },
      { x: 16, z: -14, w: 4, d: 4, h: 2, kind: 'crate' },
      { x: 0, z: 18, w: 4, d: 4, h: 2, kind: 'crate' },
      { x: 0, z: -18, w: 4, d: 4, h: 2, kind: 'crate' },
      // The perimeter is the dock wall, with gaps at both spawn corners.
      { x: -20, z: 34, w: 20, d: 1, h: 4, kind: 'wall' },
      { x: 20, z: 34, w: 20, d: 1, h: 4, kind: 'wall' },
      { x: -20, z: -34, w: 20, d: 1, h: 4, kind: 'wall' },
      { x: 20, z: -34, w: 20, d: 1, h: 4, kind: 'wall' },
    ],
  };

  // ==========================================================
  // Dust 2 variant: the classic three-lane layout (long A,
  // cat/short, tunnels-to-B) rebuilt from the existing low-poly
  // desert asset set. Reuses the desert theme so it slots into
  // the same arena builder.
  // ==========================================================
  const dust2 = {
    id: 'dust2', name: 'Dust 2', theme: 'desert',
    size: 76, bounds: { hx: 38, hz: 38 }, nav: [],
    spawnPlayer: { x: 0, z: 34 },
    spawnOpponent: { x: 0, z: -34 },
    spawnBots: [
      // T-spawn pressure: two holding long A, one mid, two pushing B.
      { x: 24, z: -14 }, { x: 28, z: -10 }, { x: 0, z: -24 },
      { x: -30, z: -2 }, { x: -22, z: -26 },
    ],
    solids: [
      // ---- T spawn area (north) ----
      // The back wall closes T spawn, with the classic left-side exit.
      { x: -20, z: -34, w: 16, d: 1, h: 4, kind: 'wall' },
      { x: 20, z: -34, w: 16, d: 1, h: 4, kind: 'wall' },
      // ---- Long A (the east corridor) ----
      // The outer east wall runs the full length of long A.
      { x: 33, z: 4, w: 1, d: 26, h: 4, kind: 'wall' },
      // Goose / long doors: a crate stack that blocks the lane's bend.
      { x: 26, z: 18, w: 6, d: 6, h: 4, kind: 'building' },
      { x: 24, z: 8, w: 4, d: 4, h: 2, kind: 'crate' },
      // The A-site platform: a raised building with crates on the site.
      { x: 22, z: -22, w: 10, d: 8, h: 5, kind: 'building' },
      { x: 12, z: -26, w: 4, d: 4, h: 2, kind: 'crate' },
      { x: 30, z: -30, w: 4, d: 4, h: 2, kind: 'crate' },
      // ---- Mid / catwalk ----
      // The mid divider splits long A from mid and gives the catwalk cover.
      { x: 16, z: -8, w: 1, d: 18, h: 4, kind: 'wall' },
      { x: 16, z: 8, w: 4, d: 6, h: 2, kind: 'crate' },
      // Mid doors: a wall pair with the classic centre gap.
      { x: 8, z: 2, w: 8, d: 1, h: 3, kind: 'wall' },
      { x: -4, z: 2, w: 8, d: 1, h: 3, kind: 'wall' },
      // Xbox / mid crates: the low box that hides the crosshair.
      { x: 4, z: 14, w: 4, d: 4, h: 2, kind: 'crate' },
      { x: -4, z: 18, w: 4, d: 4, h: 2, kind: 'crate' },
      // ---- Tunnels to B (the west lane) ----
      // The outer west wall closes upper tunnels.
      { x: -33, z: -6, w: 1, d: 28, h: 4, kind: 'wall' },
      // The tunnel corridor: a building shell with the elbow at mid.
      { x: -26, z: 0, w: 6, d: 14, h: 5, kind: 'building' },
      { x: -20, z: -12, w: 8, d: 8, h: 5, kind: 'building' },
      // The B tunnels entrance crate: the classic hide at the elbow.
      { x: -30, z: 6, w: 4, d: 4, h: 2, kind: 'crate' },
      // ---- B site ----
      // The B site platform and its car/crate cover.
      { x: -20, z: 20, w: 12, d: 8, h: 4, kind: 'building' },
      { x: -12, z: 28, w: 4, d: 4, h: 2, kind: 'crate' },
      { x: -30, z: 26, w: 4, d: 4, h: 2, kind: 'crate' },
      // ---- CT spawn (south) ----
      // The CT divider hides CT spawn from both sites.
      { x: -2, z: 24, w: 6, d: 1, h: 4, kind: 'wall' },
      { x: 12, z: 24, w: 10, d: 1, h: 4, kind: 'wall' },
      { x: -16, z: 24, w: 10, d: 1, h: 4, kind: 'wall' },
      // The south perimeter, with the CT exits left of B and right of A.
      { x: -24, z: 34, w: 20, d: 1, h: 4, kind: 'wall' },
      { x: 12, z: 34, w: 20, d: 1, h: 4, kind: 'wall' },
    ],
  };

  // Standard arenas only. The code-gated test maps (116791) and their authored
  // GLB geometry were removed: the rotation is the four core battlegrounds plus
  // the training range.
  return { desert, industrial, urban, harbor, training, targetrange, shipment, dust2 };
});
