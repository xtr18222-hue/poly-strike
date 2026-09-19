/* Deterministic C2-eased inspection paths. Radians and metres.
 * The Butterfly Knife keeps its original two flip variants, untouched.
 * Firearms share one cinematic sequence: the weapon is brought forward and
 * out to the support side, tilted through a slow three-beat presentation that
 * shows the receiver, chamber and sides, then eased back to the ready
 * position. Endpoints are exactly identity so the blend back to aim is
 * seamless. */
(function (root, f) { if (typeof module === 'object' && module.exports) module.exports = f(); else root.PolyInspection = f(); })(globalThis, () => {
  const durations = { ak47: 3.4, deagle: 2.6, awp: 3.6, kar98: 3.8, knife: 1.5 };
  const smooth = t => t * t * t * (10 + t * (-15 + 6 * t));
  const TAU = Math.PI * 2;

  function pose(key, t, variant) {
    if (variant === undefined) variant = 0;
    t = Math.max(0, Math.min(1, t));
    const e = smooth(t), w = Math.sin(Math.PI * e), b = w * w;
    const p = { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0, handleA: 0, handleB: 0, blade: 0, magX: 0, magY: 0, magZ: 0, magR: 0 };
    if (key === 'knife') {
      // Butterfly knife: preserved exactly, two alternating flip variants.
      const sign = variant === 0 ? 1 : -1;
      p.dx = -0.07 * b;
      p.dy = 0.055 * b;
      p.dz = 0.035 * b;
      p.rz = sign * TAU * e;
      p.handleA = sign * TAU * b;
      p.handleB = -sign * TAU * b;
      p.blade = sign * 0.35 * b;
    } else {
      const isRifle = key === 'ak47' || key === 'awp' || key === 'kar98';
      /* Cinematic presentation. The weapon lifts and moves out to the support
       * side, then rolls through a slow three-beat tilt — receiver, chamber,
       * sides — carried by a continuous sweep so the camera travels the
       * length of the gun. Every channel is multiplied by b (or by envelope
       * windows that vanish at t=0 and t=1) so the pose lands exactly on the
       * identity at both endpoints. */
      const beat = Math.abs(Math.sin(Math.PI * 1.5 * e));       // three-beat tilt, one-sided
      const sweep = Math.sin(Math.PI * 2 * e) * b;              // length-wise presentation (fades at ends)
      const amp = isRifle ? 1 : 0.78;                    // pistols are more compact
      p.dx = -0.135 * amp * b;
      p.dy = 0.17 * amp * b;
      p.dz = 0.07 * amp * b;
      p.rx = 0.26 * amp * b + 0.1 * beat * b;
      p.ry = -0.36 * amp * b + sweep * 0.24 * amp;
      p.rz = 0.45 * amp * beat * b;
      if (key === 'ak47') {
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
