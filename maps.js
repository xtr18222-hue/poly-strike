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
  // Standard arenas only. The code-gated test maps (116791) and their authored
  // GLB geometry were removed: the rotation is the four core battlegrounds.
  return { desert, industrial, urban, training };
});
