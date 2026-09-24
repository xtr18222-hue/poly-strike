'use strict';
/* ============================================================================
 * POLY-STRIKE deterministic simulation core.
 *
 * UMD module: loaded by node --test (module.exports) and by the browser as a
 * classic <script> (window.POLY_CORE). No DOM access lives here — this module
 * owns the map layout, collision, line of sight, nav graph, weapon stats,
 * spray patterns, spread model, economy and the match/round state machine.
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./maps.js'));
  else root.POLY_CORE = factory(root.POLY_MAPS);
})(typeof self !== 'undefined' ? self : this, function (MAPS) {

  /* ---------------------------------------------------------------- rng -- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------ weapons -- */
  // The new low-poly weapon suite from poly-strike-assets. Stats live in
  // assets.js (PolyAsset.WEAPON_DEFS) so a weapon's balance and its model are
  // defined in one place; core re-exports them so the rest of the game keeps
  // reading C.WEAPONS.
  // Strict roster: AKM assault rifle, L96 A1 and PGM Hecate II snipers, plus
  // the Desert Eagle sidearm. The Mosin and the melee slots (MX Knife / Bayonet)
  // were removed per the loadout reduction. The AKM no longer has an ADS
  // mechanic - it is a hip-fire rifle, so `ads` is false and right-click does
  // nothing while it is equipped.
  // Resolved lazily: core.js parses before assets.js, so PolyAsset is not
  // defined yet at module scope. WEAPON_DEFS is stable after first load.
  // The balance table is the single source of truth: assets.js reads it for
  // weaponDef(), and the game reads C.WEAPONS. Stats and model live together so
  // a weapon cannot drift out of sync with its own file.
  const WEAPONS = {
    akm: { key:'akm', name:'AKM', slot:'primary', auto:true, mag:30, reserve:90, damage:36, headMult:4, legMult:0.75, fireInterval:0.1, reloadTime:1.35, spreadBase:0.0065, spreadScoped:0.0065, zoomFov:null, ads:false, price:2700, killAward:300, falloff:0.004, recoil:1.0 },
    l96: { key:'l96', name:'L96 A1', slot:'primary', auto:false, mag:5, reserve:40, damage:110, headMult:2.5, legMult:0.75, fireInterval:1.5, reloadTime:3.2, spreadBase:0.0009, spreadScoped:0.0002, zoomFov:12, ads:true, price:4750, killAward:300, falloff:0.001, recoil:1.6 },
    hecate: { key:'hecate', name:'PGM Hecate II', slot:'primary', auto:false, mag:7, reserve:35, damage:130, headMult:2.4, legMult:0.75, fireInterval:1.8, reloadTime:3.6, spreadBase:0.0008, spreadScoped:0.00015, zoomFov:10, ads:true, price:5600, killAward:300, falloff:0.0008, recoil:1.9 },
    deagle: { key:'deagle', name:'Desert Eagle', slot:'secondary', auto:false, mag:7, reserve:35, damage:58, headMult:3.5, legMult:0.75, fireInterval:0.4, reloadTime:1.8, spreadBase:0.0045, spreadScoped:0.003, zoomFov:null, ads:true, price:700, killAward:300, falloff:0.006, recoil:0.85 },
    // The close-quarters blade: no magazine, no reserve, never needs a reload.
    // It lives in the secondary slot alongside the Deagle rather than its own
    // cycle, so the loadout stays two slots: primary + secondary.
    bayonet: { key:'bayonet', name:'Bayonet', slot:'secondary', auto:false, mag:0, reserve:0, damage:75, headMult:2.0, legMult:0.8, fireInterval:0.5, reloadTime:0, spreadBase:0, spreadScoped:0, zoomFov:null, ads:false, price:0, killAward:0, falloff:0, recoil:0 },
  };
  const BUY_ITEMS = ['akm', 'l96', 'hecate', 'deagle', 'armor'];



  /* ------------------------------------------------------------- spread -- */
  // moveFactor: 0 standing .. 1 full sprint. crouch tightens, air wrecks,
  // scoped collapses AWP spread. Returns {yaw, pitch} aim offsets in radians.
  function pickSpread(weaponKey, moveFactor, crouch, air, scoped, rng) {
    const w = WEAPONS[weaponKey];
    if (!w || w.slot === 'melee') return { yaw: 0, pitch: 0 };
    let s;
    if (air) s = w.spreadBase * 6;
    else {
      s = w.spreadBase * (1 + Math.max(0, moveFactor) * 2.5);
      if (crouch) s *= 0.6;
      // The AKM has no ADS mechanic: aiming down its sights only frames the
      // target, it never tightens the spread, so scoped is ignored for it.
      if (scoped && w.ads) {
        if (w.zoomFov) s = w.spreadScoped;
        else s *= w.spreadScoped / w.spreadBase;
      }
    }
    return { yaw: (rng() * 2 - 1) * s, pitch: (rng() * 2 - 1) * s * 0.8 };
  }

  /* ------------------------------------------------------------- damage -- */
  // Per-hit damage. Headshots use the head multiplier with no falloff and no
  // variance, so a Kar98k headshot is a guaranteed kill at any range. Body and
  // leg hits roll deterministic damage variance per weapon: rollVariance() is a
  // pure hash of distance, so host and client always settle the same number.
  // Existing weapons declare no variance and behave exactly as before.
  function rollVariance(dist) {
    let h = (Math.round(dist * 1000) + 0x9e3779b9) | 0;
    h = Math.imul(h, 2654435761);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
    return ((h >>> 10) & 2047) / 2047;    // 0 .. 1
  }
  function shotDamage(weapon, part, dist) {
    const w = WEAPONS[weapon];
    const mult = part === 'head' ? w.headMult : (part === 'legs' ? w.legMult : 1);
    let dmg;
    if (part === 'head' || !w.variance) {
      dmg = w.damage * mult * Math.max(0.4, 1 - dist * w.falloff);
    } else {
      const v = (rollVariance(dist) * 2 - 1) * w.variance;
      dmg = w.damage * mult * Math.max(0.4, 1 - dist * w.falloff) * (1 + v);
    }
    return Math.max(0, dmg);
  }

  // Shotguns fire several pellets per report; each pellet rolls its own damage
  // against the part it actually hit. Rifles and pistols fire one projectile.
  function pelletCount(weapon) {
    const w = WEAPONS[weapon];
    return (w && w.pellets) || 1;
  }

  // Classic AK spray: hard vertical climb for the first ~8 bullets, then the
  // pattern flattens and drifts sideways. Deterministic per seed.
  function buildSprayPattern(seed, count) {
    const rng = mulberry32(seed);
    const out = [];
    for (let i = 0; i < count; i++) {
      let up;
      if (i < 8) up = 2.0 - 1.1 * (i / 8);            // 2.0 -> 0.9 strong climb
      else up = 0.9 - 0.55 * Math.min(1, (i - 8) / 10); // flattens to ~0.35
      up += (rng() - 0.5) * 0.12;
      const sideAmp = i < 10 ? 0.35 : 0.95;
      const side = (rng() * 2 - 1) * sideAmp;
      out.push({
        up: Math.max(-2.2, Math.min(2.2, up)),
        side: Math.max(-2.2, Math.min(2.2, side)),
      });
    }
    return out;
  }

  /* ---------------------------------------------------------------- map -- */
  // Top-down: x east, z south. Bounds clamp the arena; solids are AABBs.
  if (!MAPS) throw new Error('Load maps.js before core.js');
  const MAP = MAPS.desert;
  // Navigation uses a 4m grid with clearance for 0.4m-radius actors.
  for (const map of Object.values(MAPS)) {
    for (let x = -36; x <= 36; x += 4) {
      for (let z = -36; z <= 36; z += 4) {
        if (!map.solids.some(s => Math.abs(x - s.x) < s.w / 2 + 0.5 && Math.abs(z - s.z) < s.d / 2 + 0.5)) map.nav.push({ x, z });
      }
    }
  }

  /* ---------------------------------------------------------- collision -- */
  function collideCircle(pos, radius, solids, bounds) {
    let x = pos.x, z = pos.z;
    for (let pass = 0; pass < 2; pass++) {
      for (const s of solids) {
        const hw = s.w / 2, hd = s.d / 2;
        const cx = Math.max(s.x - hw, Math.min(x, s.x + hw));
        const cz = Math.max(s.z - hd, Math.min(z, s.z + hd));
        const dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * radius;
          z = cz + (dz / d) * radius;
        } else {
          // center inside the box: eject through the nearest face
          const left = x - (s.x - hw), right = s.x + hw - x;
          const top = z - (s.z - hd), bottom = s.z + hd - z;
          const m = Math.min(left, right, top, bottom);
          if (m === left) x = s.x - hw - radius;
          else if (m === right) x = s.x + hw + radius;
          else if (m === top) z = s.z - hd - radius;
          else z = s.z + hd + radius;
        }
      }
    }
    if (bounds) {
      x = Math.max(-bounds.hx + radius, Math.min(bounds.hx - radius, x));
      z = Math.max(-bounds.hz + radius, Math.min(bounds.hz - radius, z));
    }
    return { x, z };
  }

  /* ------------------------------------------------------ line of sight -- */
  // True when the XZ segment a->b hits NO solid. Boundary grazing does not
  // count as a hit (strict inequality slabs).
  function segmentIntersectsBox(ax, az, bx, bz, s) {
    const hx = s.w / 2, hz = s.d / 2;
    const minx = s.x - hx, maxx = s.x + hx, minz = s.z - hz, maxz = s.z + hz;
    const dx = bx - ax, dz = bz - az;
    let tmin = 0, tmax = 1;
    if (Math.abs(dx) < 1e-9) {
      if (ax <= minx || ax >= maxx) return false;
    } else {
      let t1 = (minx - ax) / dx, t2 = (maxx - ax) / dx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
    if (Math.abs(dz) < 1e-9) {
      if (az <= minz || az >= maxz) return false;
    } else {
      let t1 = (minz - az) / dz, t2 = (maxz - az) / dz;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
    return tmin < tmax;
  }
  function segmentClear(a, b, solids) {
    for (const s of solids) {
      if (segmentIntersectsBox(a.x, a.z, b.x, b.z, s)) return false;
    }
    return true;
  }

  /* ---------------------------------------------------------------- nav -- */
  const NAV_LINK_DIST = 6;
  function buildNavGraph(nav, solids) {
    const n = nav.length;
    const inflated = solids.map(s => ({ ...s, w: s.w + 0.9, d: s.d + 0.9 }));
    const g = new Array(n);
    for (let i = 0; i < n; i++) g[i] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = nav[i].x - nav[j].x, dz = nav[i].z - nav[j].z;
        if (dx * dx + dz * dz > NAV_LINK_DIST * NAV_LINK_DIST) continue;
        if (segmentClear(nav[i], nav[j], inflated)) {
          g[i].push(j); g[j].push(i);
        }
      }
    }
    return g;
  }
  function nearestNav(p, map = MAP) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < map.nav.length; i++) {
      const dx = map.nav[i].x - p.x, dz = map.nav[i].z - p.z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  const graphCache = new WeakMap();
  function graphFor(map) {
    if (!graphCache.has(map)) graphCache.set(map, buildNavGraph(map.nav, map.solids));
    return graphCache.get(map);
  }
  function resolveMap(value = MAP) {
    if (typeof value === 'string') {
      if (!Object.prototype.hasOwnProperty.call(MAPS, value)) throw new Error('Unknown map: ' + value);
      return MAPS[value];
    }
    return value.MAP || value;
  }

  /* ------------------------------------------------------------ economy -- */
  const ECON = {
    start: 800, winRound: 3250, lossBase: 1400, lossStep: 500,
    lossMax: 3400, max: 16000,
  };

  /* ------------------------------------------------------------- match -- */
  const BUY_TIME = 5, ROUND_TIME = 90, END_TIME = 4, WIN_ROUNDS = 5;
  const BOT_COUNT = 5;

  // Skirmish is the sole core standard mode: clear every bot to take the round,
  // first to WIN_ROUNDS wins the match. FFA and Search & Destroy were removed.
  const MODES = {
    skirmish: { key:'skirmish', name:'Skirmish', desc:'Eliminate every hostile. First to 5 rounds wins.', rounds:true, clock:ROUND_TIME, lives:Infinity, toWin:WIN_ROUNDS, bots:true, buy:true },
  };

  function createMatch(mapOrContext = MAP, modeKey) {
    const MAP = resolveMap(mapOrContext);
    const MODE = MODES[modeKey] || MODES.skirmish;
    const NAVGRAPH = graphFor(MAP);
    const nearestNav = p => api.nearestNav(p, MAP);
    let cachedPlayerNode = -1, navSearches = 0;
    const distances = new Array(MAP.nav.length).fill(Infinity);
    const m = {
      phase: MODE.buy ? 'buy' : 'live',  // buy | live | end | matchover
      playerDead: false,       // the operator is down, waiting on the round to end
      mode: MODE.key,
      modeData: MODE,
      buyClock: MODE.buy ? BUY_TIME : 0,
      roundClock: MODE.clock,
      endClock: 0,
      round: 1,
      score: { player: 0, enemy: 0 },
      money: ECON.start,
      lossStreak: 0,
      hp: 100, armor: 0,
      kills: 0, deaths: 0, shotsFired: 0, shotsHit: 0, headshots: 0,
      owned: { primary: null, secondary: 'deagle' },
      lastWinner: null,
      bots: [],
      events: [],              // transient feed events for the HUD
    };
    Object.defineProperties(m, {
      MAP: { value: MAP, enumerable: true },
      navGraph: { value: NAVGRAPH },
      navSearches: { get: () => navSearches },
    });
    // A map may stage more targets than the standard five (the dedicated range
  // adds reactive close targets), so take the bot count from the map itself.
  const count = Math.max(1, Math.min(MAP.spawnBots.length, 12));
  for (let i = 0; i < count; i++) {
      const rng = mulberry32(0xC0FFEE + i * 7919);
      const sp = MAP.spawnBots[i];
      m.bots.push({
        id: i,
        pos: { x: sp.x, z: sp.z },
        node: nearestNav(sp),
        hp: 100, alive: true, shots: 0, kills: 0, deaths: 0,
        cool: 0.6 + rng() * 0.8,
        speed: 3.9 + rng() * 0.6,
        name: 'BOT Phoenix ' + (i + 1),
        // Pro Rifle Pack locomotion state. The bot's own frame-to-frame
        // displacement decides the clip, not a hand-authored animation table:
        // prevPos tracks the last position so step() can report real speed and
        // facing, and anim is the clip key the game layer renders (idle, walk,
        // run, sprint, crouch, crouchWalk, or a death). synced each tick.
        prevPos: { x: sp.x, z: sp.z },
        anim: 'idle',
        animClock: 0,
      });
    }

    m.aliveBots = function () { return this.bots.filter(b => b.alive); };

    Object.defineProperty(m, 'matchWinner', { get() {
      if (this.score.player >= WIN_ROUNDS) return 'player';
      if (this.score.enemy >= WIN_ROUNDS) return 'enemy';
      return null;
    } });

    m.endRound = function (winner) {
      if (this.phase !== 'live') return;
      this.phase = 'end';
      this.lastWinner = winner;
      this.endClock = END_TIME;
    };

    m.winRound = function () {
      this.lossStreak = 0;
      this.money = Math.min(ECON.max, this.money + ECON.winRound);
    };
    m.loseRound = function () {
      this.lossStreak++;
      const bonus = Math.min(ECON.lossBase + (this.lossStreak - 1) * ECON.lossStep, ECON.lossMax);
      this.money = Math.min(ECON.max, this.money + bonus);
    };

    m.resetRound = function () {
      this.playerDead = false;
      this.phase = MODE.buy ? 'buy' : 'live';
      this.buyClock = MODE.buy ? BUY_TIME : 0;
      this.roundClock = MODE.clock;
      this.hp = 100;                 // armor persists, damaged
      this.lastWinner = null;
      for (const b of this.bots) {
        const sp = MAP.spawnBots[b.id];
        b.pos = { x: sp.x, z: sp.z };
        b.node = nearestNav(sp);
        b.hp = 100; b.alive = true; b.shots = 0; b.cool = 1.4;
      }
    };

    m.buy = function (item) {
      if (this.phase !== 'buy' && this.phase !== 'end') return false;
      if (item === 'armor') {
        if (this.armor >= 100 || this.money < 650) return false;
        this.money -= 650; this.armor = 100; return true;
      }
      const w = WEAPONS[item];
      if (!w || w.slot === 'melee') return false;
      if (w.slot === 'primary' && this.owned.primary) return false;
      if (w.slot === 'secondary' && this.owned.secondary) return false;
      if (this.money < w.price) return false;
      this.money -= w.price;
      if (w.slot === 'primary') this.owned.primary = item;
      else this.owned.secondary = item;
      return true;
    };

    m.playerShot = function (weaponKey, botId, part, dist) {
      const w = WEAPONS[weaponKey];
      const b = this.bots.find(b => b.id === botId);
      if (!w || !b || !b.alive || this.phase === 'end' || this.phase === 'matchover') {
        return { dmg: 0, killed: false };
      }
      const dmg = shotDamage(weaponKey, part, dist);
      b.hp -= dmg;
      let killed = false;
      if (b.hp <= 0 && b.alive) {
        b.alive = false; b.deaths++; killed = true;
        this.kills++;
        if (part === 'head') this.headshots++;
        // Death clip for the rig: the pack ships direction-specific deaths;
        // the angle of the incoming shot picks one, falling back to the prone
        // 'lay' pose. Plays once and clamps on the final frame.
        b.deathAnim = part === 'head' ? (Math.random() < 0.5 ? 'deathFrontHead' : 'deathBackHead')
                                     : (Math.random() < 0.5 ? 'deathFront' : 'deathBack');
        this.money = Math.min(ECON.max, this.money + w.killAward);
      this.lastVictim = b.name;
        this.events.push({ type: 'kill', who: 'player', weapon: weaponKey, head: part === 'head', name: b.name });
        if (this.phase === 'live' && this.aliveBots().length === 0) {
          // This kill eliminated the final remaining hostile: the round ends.
          this.endRound('player');
        }
      }
      return { dmg, killed };
    };

    m.enemyShot = function (dmg, botId = null) {
      if(this.hp<=0)return {dmg:0};
      this.lastAttacker=botId;
      let hpLost;
      if (this.armor > 0) {
        const absorbed = Math.min(this.armor, dmg * (2 / 3));
        this.armor = Math.max(0, this.armor - absorbed);
        hpLost = dmg - absorbed;
      } else {
        hpLost = dmg;
      }
      this.hp = Math.max(0, this.hp - hpLost);
      if (this.hp <= 0 && this.phase === 'live') {
        this.deaths++;
        if (this.bots[botId]) this.bots[botId].kills++;
        this.endRound('enemy');
      }
      return { dmg: hpLost };
    };

    m.step = function (dt, rng, sense) {
      if (this.phase === 'buy') {
        if (this.modeData && !this.modeData.buy) { this.phase = 'live'; return; }
        this.buyClock -= dt;
        if (this.buyClock <= 0) this.phase = 'live';
        return;
      }
      if (this.phase === 'live') {
        if (!(this.modeData && this.modeData.clock === Infinity)) {
          this.roundClock -= dt;
          if (this.roundClock <= 0) { this.endRound('enemy'); return; }
        }
        const px = sense && sense.px !== undefined ? sense.px : null;
        const pz = sense && sense.pz !== undefined ? sense.pz : null;
        const playerNode = Number.isFinite(px) && Number.isFinite(pz) ? nearestNav({ x: px, z: pz }) : -1;
        // Distance field is match-local; static graph is shared per arena.
        if (playerNode >= 0 && playerNode !== cachedPlayerNode) {
          cachedPlayerNode = playerNode;
          navSearches++;
          distances.fill(Infinity);
          distances[playerNode] = 0; const queue = [playerNode];
          for (let q = 0; q < queue.length; q++) for (const n of NAVGRAPH[queue[q]]) {
            if (distances[n] === Infinity) { distances[n] = distances[queue[q]] + 1; queue.push(n); }
          }
        }
        for (let i = 0; i < this.bots.length; i++) {
          const b = this.bots[i];
          if (this.phase !== 'live') continue;
          const perBot = sense && sense.bots ? sense.bots[i] : (Array.isArray(sense) ? sense[i] : sense);
          // --- movement: greedy step toward the player through the nav graph.
          // Test arenas pin their bots in place so the player can inspect the
          // animations and line up shots; standard maps chase as before.
          const target = MAP.nav[b.node];
          const tdx = target.x - b.pos.x, tdz = target.z - b.pos.z;
          const tdist = Math.hypot(tdx, tdz);
          if (MAP.stationaryBots) {
            // Locked to the spawn node: still turns to track the player, but
            // never leaves its spot.
          } else if (tdist < 0.5) {
            // pick the neighbor node closest to the player (or wander)
            const opts = NAVGRAPH[b.node];
            if (opts.length) {
              let next = opts[0], bestScore = Infinity;
              for (const cand of opts) {
                const score = playerNode >= 0
                  ? distances[cand]
                  : rng() * 1000;
                if (score < bestScore) { bestScore = score; next = cand; }
              }
              b.node = next;
            }
          } else {
            const stepLen = Math.min(b.speed * dt, tdist);
            b.pos.x += (tdx / tdist) * stepLen;
            b.pos.z += (tdz / tdist) * stepLen;
          }
          // --- firing: only when the game layer reports LOS and range.
          // Test maps are peaceful demonstrators: bots there never shoot
          // back, so the player can study animations and target practice.
          if (perBot && perBot.los && perBot.dist < 34 && !MAP.peaceful) {
            b.cool -= dt;
            if (b.cool <= 0) {
              b.shots++;
              b.cool = 0.45 + rng() * 0.8;
              const dmg = 7 + Math.floor(rng() * 9);
              this.enemyShot(dmg, b.id);
            }
          } else {
            b.cool = Math.min(b.cool + dt * 0.5, 1.4);
          }
          // --- locomotion: derive the Pro Rifle Pack clip from the real
          // frame-to-frame displacement. Measuring speed instead of trusting
          // the intended step length keeps the clip honest when the bot is
          // blocked by a solid or arrives at its node.
          const vx = b.pos.x - b.prevPos.x, vz = b.pos.z - b.prevPos.z;
          const moved = Math.hypot(vx, vz);
          const hz = moved > 1e-5 ? moved / Math.max(dt, 1e-4) : 0;
          // Advance toward the player = forward; away = backward; the sign of
          // the dot with the bot->player vector splits them.
          const toPx = (px !== null ? px : 0) - b.pos.x;
          const toPz = (pz !== null ? pz : 0) - b.pos.z;
          const forward = moved > 1e-5 ? (vx * toPx + vz * toPz) / (moved * Math.max(1e-5, Math.hypot(toPx, toPz)) + 1e-9) : 1;
          let key = 'idle';
          if (hz > 6.4) key = forward < -0.25 ? 'runBack' : 'run';
          else if (hz > 1.3) key = forward < -0.25 ? 'walkBack' : 'walk';
          // The bot's own chase speed rarely exceeds walk, so a sprint clip is
          // reserved for the rare long open lane; crouch is not part of the
          // bot AI yet, so idle/walk/run cover every real state.
          if (key !== b.anim) { b.anim = key; b.animClock = 0; }
          b.animClock += dt;
          b.prevPos.x = b.pos.x; b.prevPos.z = b.pos.z;
        }
        return;
      }
      if (this.phase === 'end') {
        this.endClock -= dt;
        if (this.endClock <= 0) {
          if (this.lastWinner === 'player') { this.score.player++; this.winRound(); }
          else { this.score.enemy++; this.loseRound(); }
          if (this.matchWinner) { this.phase = 'matchover'; }
          else { this.round++; this.resetRound(); }
        }
      }
    };

    return m;
  }

  /* -------------------------------------------------------- training --- */
  // Training range: no match pressure. Bots start as static metal pop-up range
  // targets that clang and fall when hit and never shoot back; the clock never
  // ends the round and the score is not tracked. Shooting the red switch box in
  // the arena flips the range to live moving bots, and back again.
  function createTrainingMatch(mapOrContext = MAP, modeKey) {
    const base = createMatch(mapOrContext, modeKey);
    // Capture the base match's hostile-AI step before we override it, so
    // active trainer mode can delegate to the real bot logic.
    const hostileStep = base.step;
    base.training = true;
    base.roundClock = Infinity;
    base.respawnClock = [0, 0, 0, 0, 0];
    // 'static' = metal pop-up targets, 'active' = hostile moving bots.
    base.mode = 'static';
    base.switchFlash = 0;
    // Static pop-up targets idle from the very first frame, before the first
    // step runs, so the range never shows walking dummies on entry.
    for (const b of base.bots) { b.cool = 999; b.speed = 0; }
    base.toggleMode = function () {
      this.mode = this.mode === 'static' ? 'active' : 'static';
      this.switchFlash = 1;
      // Live bots need real cooldowns/speed again; static targets idle.
      for (const b of this.bots) {
        b.cool = this.mode === 'active' ? 0.5 + Math.random() * 1.5 : 999;
        b.speed = this.mode === 'active' ? 3 : 0;
      }
      return this.mode;
    };
    const staticStep = function (dt, rng, sense) {
      if (this.phase === 'buy') { this.buyClock = 0; this.phase = 'live'; }
      if (this.phase !== 'live') return;
      // Targets stay put; keep their nav node valid but idle.
      for (const b of this.bots) { b.cool = 999; b.speed = 0; }
      for (let i = 0; i < this.bots.length; i++) {
        if (!this.bots[i].alive) {
          this.respawnClock[i] = (this.respawnClock[i] || 0) + dt;
          if (this.respawnClock[i] >= 2.5) {
            this.bots[i].alive = true;
            this.bots[i].hp = 100;
            this.respawnClock[i] = 0;
            // Clear the client-side fall pose so the reset target stands up
            // cleanly instead of snapping out of a tipped-over pose.
            const view = this.botViews && this.botViews[i];
            if (view) delete view.userData.fall;
          }
        }
      }
    };
    base.playerShot = function (weaponKey, botId, part, dist) {
      const w = WEAPONS[weaponKey];
      const b = this.bots.find(b => b.id === botId);
      if (!w || !b || !b.alive) return { dmg: 0, killed: false };
      const dmg = shotDamage(weaponKey, part, dist);
      b.hp -= dmg;
      let killed = false;
      if (b.hp <= 0) {
        b.alive = false; b.deaths++; killed = true;
        this.kills++;
        if (part === 'head') this.headshots++;
        this.events.push({ type: 'kill', who: 'player', weapon: weaponKey, head: part === 'head', name: b.name });
        this.respawnClock[b.id] = 0;
      }
      return { dmg, killed };
    };
    // Dispatch on the current range mode: static pop-ups idle and respawn,
    // active bots run the normal hostile AI (m.step).
    base.step = function (dt, rng, sense) {
      if (this.switchFlash > 0) this.switchFlash = Math.max(0, this.switchFlash - dt * 1.6);
      if (this.mode === 'active') {
        const prev = this.training;
        this.training = false;                 // hostile AI only runs when not training-flagged
        hostileStep.call(this, dt, rng, sense); // full hostile AI
        this.training = prev;
        return;
      }
      staticStep.call(this, dt, rng, sense);
    };
    return base;
  }

  const api = {
    MAPS, forMap, NAVGRAPH: graphFor(MAP),
    mulberry32, WEAPONS, ECON, BUY_ITEMS,
    buildSprayPattern, pickSpread, shotDamage, rollVariance, pelletCount,
    MAP, collideCircle, segmentClear, buildNavGraph, nearestNav,
    createMatch, createTrainingMatch, MODES, NAV_TIME: BUY_TIME, ROUND_TIME,
  };
  function forMap(id = 'desert') {
    const map = resolveMap(id);
    return { ...api, MAP: map, NAVGRAPH: graphFor(map),
      // game.js calls this as createMatch(C.MAP, modeKey) AND as createMatch(modeKey):
      // take the last string argument as the mode so a map object passed
      // positionally cannot shadow it and silently resolve to the default.
      createMatch: (...a) => createMatch(map, a.filter(x => typeof x === 'string').pop()),
      createTrainingMatch: (...a) => createTrainingMatch(map, a.filter(x => typeof x === 'string').pop()),
      nearestNav: p => nearestNav(p, map) };
  }
  return api;
});
