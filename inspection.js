/* Deterministic C2-eased inspection paths. Radians and metres.
 * Unified cinematic sequence for all five weapons: the weapon is brought
 * forward and out to the support side, tilted to present the receiver,
 * barrel and stock to the camera, then eased back to the ready position.
 * Endpoints are exactly identity so the blend back to aim is seamless. */
(function (root, f) { if (typeof module === 'object' && module.exports) module.exports = f(); else root.PolyInspection = f(); })(globalThis, () => {
  const durations = { ak47: 3.0, deagle: 2.5, awp: 3.2, kar98: 3.4, knife: 1.5 };
  const smooth = t => t * t * t * (10 + t * (-15 + 6 * t));
  const TAU = Math.PI * 2;

  function pose(key, t, variant) {
    if (variant === undefined) variant = 0;
    t = Math.max(0, Math.min(1, t));
    const e = smooth(t), w = Math.sin(Math.PI * e), b = w * w;
    const p = { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0, handleA: 0, handleB: 0, blade: 0, magX: 0, magY: 0, magZ: 0, magR: 0 };
    if (key === 'knife') {
      const sign = variant === 0 ? 1 : -1;
      p.dx = -0.07 * b;
      p.dy = 0.055 * b;
      p.dz = 0.035 * b;
      p.rz = sign * TAU * e;
      p.handleA = sign * TAU * b;
      p.handleB = -sign * TAU * b;
      p.blade = sign * 0.35 * b;
    } else {
      const isAK = key === 'ak47';
      const isRifle = isAK || key === 'awp' || key === 'kar98';
      // Two-lobed tilt: the gun lifts, settles, lifts the other way, settles.
      // Multiplied by b so the endpoints stay exactly at identity.
      const tilt = Math.sin(Math.PI * 2 * e);
      // Presentation sweep along the gun's length: receiver, barrel, stock.
      const sweep = Math.sin(Math.PI * 2 * e);
      p.dx = (isRifle ? -0.13 : -0.11) * b;
      p.dy = (isRifle ? 0.16 : 0.13) * b;
      p.dz = (isRifle ? 0.06 : 0.05) * b;
      p.rx = (isRifle ? 0.22 : 0.16) * b;
      p.ry = -0.34 * b + sweep * 0.22;
      p.rz = 0.55 * tilt * b;
      if (isAK) {
        // Tactical magazine handling: detach, carry alongside, reseat.
        const lift = t < 0.25 ? smooth(t / 0.25) : t > 0.75 ? smooth((1 - t) / 0.25) : 1;
        p.magY = -0.13 * lift;
        p.magX = -0.08 * b;
        p.magZ = 0.10 * b;
        p.magR = 0.6 * b;
      }
    }
    return p;
  }
  return { durations, pose };
});
