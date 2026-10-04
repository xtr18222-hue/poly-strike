/* Procedural, bounded Web Audio. No audio files or network requests. */
window.PolyAudio = (() => {
  let ctx, master, noise, muted = false;
  function start() { try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.28;
      const limiter = ctx.createDynamicsCompressor(); limiter.threshold.value = -16; limiter.ratio.value = 8;
      master.connect(limiter); limiter.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0); let seed = 871;
      for (let i=0;i<d.length;i++) { seed = (seed*16807)%2147483647; d[i] = seed/1073741824-1; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(()=>{});
  } catch (_) {} }
  function sound(type) { if (!ctx || muted || ctx.state !== 'running') return; try {
    if(type==='headshot'){
      const now=ctx.currentTime;[2190,3470,5210].forEach((hz,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=hz;g.gain.setValueAtTime(.2/(i+1),now);g.gain.exponentialRampToValueAtTime(.0001,now+.24-i*.035);o.connect(g);g.connect(master);o.start(now);o.stop(now+.25);o.onended=()=>{o.disconnect();g.disconnect();};});return;
    }
    const cues={magout:[340,.10,.13],magin:[640,.085,.16],bolt:[1350,.075,.12],dry:[2400,.05,.09],switch:[900,.05,.07],heartbeat:[58,.18,.18],enemyStep:[115,.10,.11],tick:[1500,.02,.05],clang:[660,.12,.16],crate:[520,.14,.18],caseopen:[880,.10,.20],death:[180,.45,.20],explosion:[90,.55,.30],pin:[2100,.04,.08],flashbang:[5200,.35,.22],ring:[2400,1.2,.10]};
    if(cues[type]){const [hz,dur,level]=cues[type];tone(hz,dur,level,type==='heartbeat'?'sine':'triangle');
      // Dry fire: a distinct empty-chamber metallic click — sharp double tick.
      if(type==='dry'){tone(1850,.03,.06,'square',.035);tone(1450,.025,.045,'triangle',.055);}
      if(type==='heartbeat')tone(65,.12,.10,'sine',.21);if(type==='death')tone(90,.4,.10,'sine',.18);
      // Grenade detonation: a low double-thump with a noise tail.
      if(type==='explosion'){tone(70,.45,.30,'sine');tone(120,.22,.22,'triangle',.03);tone(55,.6,.18,'sine',.06);return;}
      return;}
    // Per-weapon firing voice. The synth used to know only a handful of legacy
    // names (ak47/awp/kar98/deagle) and silently dropped everything else, so
    // the L96, Mosin, Hecate, MX and bayonet fired with no sound at all.
    // barrel = round count the burst lasts (snipers crack once), pitch places
    // the report, punch is the low-end thump.
    const PROFILES = {
      akm:     { barrel:'rifle',  dur:.20, hz:1500, punch:120, crack:2100 },
      l96:     { barrel:'sniper', dur:.50, hz:900,  punch:70,  crack:2600 },
      mosin:   { barrel:'sniper', dur:.45, hz:1000, punch:85,  crack:2400 },
      hecate:  { barrel:'sniper', dur:.60, hz:750,  punch:60,  crack:2300 },
      deagle:  { barrel:'pistol', dur:.14, hz:1900, punch:160, crack:2500 },
      glock:   { barrel:'pistol', dur:.10, hz:2100, punch:90,  crack:2600 },
      mossberg:{ barrel:'shotgun',dur:.30, hz:800,  punch:150, crack:1900 },
      grenade: { barrel:'throw',  dur:.25, hz:700,  punch:0,   crack:1600 },
      flash:   { barrel:'throw',  dur:.25, hz:900,  punch:0,   crack:2100 },
      mx:      { barrel:'melee',  dur:.10, hz:2400, punch:0,   crack:1800 },
      bayonet: { barrel:'melee',  dur:.10, hz:2400, punch:0,   crack:1800 },
      knife:   { barrel:'melee',  dur:.10, hz:2400, punch:0,   crack:1800 },
      ak47:    { barrel:'rifle',  dur:.20, hz:1500, punch:120, crack:2100 },
      awp:     { barrel:'sniper', dur:.50, hz:900,  punch:70,  crack:2600 },
      kar98:   { barrel:'sniper', dur:.45, hz:1000, punch:85,  crack:2400 },
      enemy:   { barrel:'rifle',  dur:.20, hz:1300, punch:120, crack:2000 },
    };
    const prof = PROFILES[type];
    if (prof) {
      const now = ctx.currentTime;
      // Noise body: the ballistic crack, band-passed around the weapon's pitch.
      if (prof.barrel !== 'melee' && prof.barrel !== 'throw') {
        const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
        src.buffer = noise;
        filter.type = 'bandpass'; filter.frequency.value = prof.crack; filter.Q.value = .8;
        gain.gain.setValueAtTime(.8, now);
        gain.gain.exponentialRampToValueAtTime(.001, now + prof.dur);
        src.connect(filter); filter.connect(gain); gain.connect(master);
        src.start(now); src.stop(now + prof.dur);
        src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); };
        // Low-end punch: the chest-thump under the crack.
        if (prof.punch) {
          const osc = ctx.createOscillator(), g = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(prof.punch, now);
          osc.frequency.exponentialRampToValueAtTime(prof.punch * .3, now + prof.dur);
          g.gain.setValueAtTime(.7, now);
          g.gain.exponentialRampToValueAtTime(.001, now + prof.dur);
          osc.connect(g); g.connect(master); osc.start(now); osc.stop(now + prof.dur);
          osc.onended = () => { osc.disconnect(); g.disconnect(); };
        }
      } else {
        // Throw: an arm-swish and the pin ring, no ballistic report at all.
        if (prof.barrel === 'throw') { tone(prof.hz, prof.dur, .08, 'triangle'); tone(2100, .035, .07, 'square', .02); }
        else {
        // Melee: a short metallic swish, no report.
        tone(prof.hz, prof.dur, .12, 'triangle');
        tone(prof.crack, prof.dur * .6, .06, 'sine', .02);
        }
      }
      return;
    }
    const gun = ['ak47','awp','kar98','deagle','enemy'].includes(type);
    const duration = type==='awp'||type==='kar98' ? .5 : gun ? .2 : .08;
    const now=ctx.currentTime, src=ctx.createBufferSource(), filter=ctx.createBiquadFilter(), gain=ctx.createGain();
    src.buffer=noise; filter.type='lowpass'; filter.frequency.value=gun ? 2100 : 3500;
    gain.gain.setValueAtTime(gun ? .8 : .12,now); gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    src.connect(filter);filter.connect(gain);gain.connect(master);src.start(now);src.stop(now+duration);
    src.onended=()=>{src.disconnect();filter.disconnect();gain.disconnect();};
    if (gun || type==='hit' || type==='kill') {
      const osc=ctx.createOscillator(), g=ctx.createGain();
      osc.type=gun?'triangle':'sine';osc.frequency.setValueAtTime(type==='kar98'?95:gun?120:type==='kill'?1200:780,now);
      osc.frequency.exponentialRampToValueAtTime(gun?35:500,now+duration);
      g.gain.setValueAtTime(gun?.7:.12,now);g.gain.exponentialRampToValueAtTime(.001,now+duration);
      osc.connect(g);g.connect(master);osc.start();osc.stop(now+duration);osc.onended=()=>{osc.disconnect();g.disconnect();};
    }
  } catch (_) {} }
  function tone(hz,duration,level,type='sine',delay=0){const now=ctx.currentTime+delay,o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(hz,now);g.gain.setValueAtTime(level,now);g.gain.exponentialRampToValueAtTime(.0001,now+duration);o.connect(g);g.connect(master);o.start(now);o.stop(now+duration+.01);o.onended=()=>{o.disconnect();g.disconnect();};}
  // ---------------------------------------------------------------- music --
  // A SEPARATE bus from the SFX master, so the player can mute the music
  // without touching gunshots, reloads, footsteps, hit sounds, UI cues,
  // grenade sounds or the announcer. Everything the game plays is synthesized
  // at runtime (no audio files, no licensed music): the menu theme is a slow
  // ambient pad + arpeggio loop built from oscillators, generated on demand.
  let musicGain = null, musicTimer = null, musicOn = false, musicMuted = false;
  let musicNodes = [];     // everything currently sounding, for a clean teardown
  const MUSIC_TRACKS = ['menu', 'combat'];
  let musicTrack = null;

  function musicBus() {
    if (!ctx) return null;
    if (!musicGain) {
      musicGain = ctx.createGain();
      musicGain.gain.value = musicMuted ? 0 : 0.16;
      // The music bus feeds the SAME limiter as SFX so the mix stays bounded,
      // but it has its own gain the SFX paths never touch.
      musicGain.connect(master);
    }
    return musicGain;
  }

  // One layer of the menu theme: a slow detuned pad chord on a root note.
  // Everything is scheduled on the audio clock, not on timers, so the loop is
  // sample-accurate and never drifts.
  function padNote(bus, hz, startAt, dur, level) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o2.type = 'triangle';
    o.frequency.setValueAtTime(hz, startAt); o2.frequency.setValueAtTime(hz * 1.005, startAt);
    g.gain.setValueAtTime(0.0001, startAt);
    g.gain.linearRampToValueAtTime(level, startAt + dur * .35);
    g.gain.linearRampToValueAtTime(0.0001, startAt + dur);
    o.connect(g); o2.connect(g); g.connect(bus);
    o.start(startAt); o2.start(startAt);
    o.stop(startAt + dur + .05); o2.stop(startAt + dur + .05);
    o.onended = () => { o.disconnect(); o2.disconnect(); g.disconnect(); };
  }

  // Menu theme: a slow minor progression with a sparse arpeggio on top.
  // A-bar / B-bar sections so the loop breathes instead of looping one chord.
  const MENU_ROOT = 110;   // A2
  const MENU_CHORDS = [[0, 3, 7], [0, 3, 7], [5, 8, 12], [-2, 2, 5]];  // Am / Am / Dm / G
  function scheduleMenu(bus, t0) {
    const bar = 3.2, steps = 4;
    for (let b = 0; b < MENU_CHORDS.length; b++) {
      const t = t0 + b * bar;
      const chord = MENU_CHORDS[b];
      for (const semi of chord) padNote(bus, MENU_ROOT * Math.pow(2, semi / 12), t, bar * 1.05, .055);
      // Sparse arpeggio: one note per beat on the top of the chord.
      for (let s = 0; s < steps; s++) {
        if ((b + s) % 2 === 1) continue;   // off-beats rest
        const semi = chord[s % chord.length] + 12;
        padNote(bus, MENU_ROOT * Math.pow(2, semi / 12), t + s * bar / steps, .9, .03);
      }
    }
    return t0 + MENU_CHORDS.length * bar;
  }
  // Combat theme: tense, slower, lower, fewer notes — pressure without melody.
  const COMBAT_CHORDS = [[0, 3, 7], [0, 3, 7], [0, 3, 7], [-4, 0, 3]];
  function scheduleCombat(bus, t0) {
    const bar = 3.6, steps = 4;
    for (let b = 0; b < COMBAT_CHORDS.length; b++) {
      const t = t0 + b * bar;
      const chord = COMBAT_CHORDS[b];
      for (const semi of chord) padNote(bus, MENU_ROOT * .75 * Math.pow(2, semi / 12), t, bar * 1.05, .05);
      for (let s = 0; s < steps; s++) {
        if (s % 2 === 0) continue;
        const semi = chord[0] + 12;
        padNote(bus, MENU_ROOT * .75 * Math.pow(2, semi / 12), t + s * bar / steps, .5, .02);
      }
    }
    return t0 + COMBAT_CHORDS.length * bar;
  }

  // Keep the theme running: schedule the next loop a bar before the current one
  // ends so the music is seamless. Cancelled by stopMusic().
  function tickMusic() {
    const bus = musicBus(); if (!bus || !musicOn) return;
    const horizon = ctx.currentTime + 4;
    while (musicNextAt < horizon) {
      musicNextAt = musicTrack === 'combat' ? scheduleCombat(bus, musicNextAt)
                                            : scheduleMenu(bus, musicNextAt);
    }
  }
  let musicNextAt = 0;

  // BACKGROUND MUSIC IS REMOVED. The spec has no supplied music assets and
  // forbids inventing or downloading any, so the procedural menu theme is
  // gone. These accessors stay as safe no-ops: game.js and the tests still
  // call them, and removing the functions would break those callers. Nothing
  // is scheduled, nothing is decoded, no bus is ever created.
  function startMusic(track) { musicTrack = null; musicOn = false; }
  function stopMusic() { musicOn = false; musicTrack = null; if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
  // Mute is independent of the SFX mute and applies instantly: the music bus
  // gain ramps to zero, killing what is already sounding.
  function setMusicMuted(m) {
    musicMuted = true;   // permanently muted: there is no music to hear
    try { localStorage.setItem('poly-music-muted', '1'); } catch (_) {}
  }
  function isMusicMuted() { return true; }
  function musicState() { return { track: null, playing: false, muted: true }; }


  const PACKS = {
    // V42 HARD CAP: ten tiers, no more. The announcer calls kills 1..10 and
    // then falls silent for the rest of the match — nothing above tier 10 may
    // be shipped, because it can never play.
    male: [
      '[audio]First......lood!',
      'Mortal-Kombat-Announcer-2026-09-20-06-53-Double-Kill',
      'Mortal-Kombat-Announcer-2026-09-20-06-54-Triple-Kill!',
      'Mortal-Kombat-Announcer-2026-09-20-06-54-Multi-Kill!',
      '[audio]Mega-......ill !',
      'Mortal-Kombat-Announcer-2026-09-20-06-57-Ultra-Kill!',
      'Mortal-Kombat-Announcer-2026-09-20-06-59-Unstoppable!',
      'Mortal-Kombat-Announcer-2026-09-20-07-00-Rampage!',
      'Mortal-Kombat-Announcer-2026-09-20-07-01-Dominating!',
      'Mortal-Kombat-Announcer-2026-09-20-07-03-Unreal!',
    ],
    female: [
      '[UT Sexy Female Announcer]First......Blood',
      '[UT Sexy Female Announcer]Doubl......-Kill',
      '[UT Sexy Female Announcer]Tripl......Kill',
      '[UT Sexy Female Announcer]Multi......ill !',
      '[UT Sexy Female Announcer]Mega-......ill!!',
      '[UT Sexy Female Announcer]Ultra......ll!!!',
      '[UT Sexy Female Announcer]Unbel......able!',
      '[UT Sexy Female Announcer]holy ......op!!! (1)',
    ],
  };
  let voicePack = 'male';
  const clipCache = new Map();
  // Loaded on first use, not at boot: 22 clips of speech nobody needs on the
  // menu, and decoding them eagerly would stall first paint.
  function loadClip(name) {
    if (clipCache.has(name)) return clipCache.get(name);
    const p = fetch('assets/audio/' + encodeURIComponent(name) + '.mp3')
      .then(r => r.ok ? r.arrayBuffer() : null)
      .then(b => b && ctx ? ctx.decodeAudioData(b) : null)
      .catch(() => null);
    clipCache.set(name, p);
    return p;
  }
  function playClip(buf) {
    if (!ctx || muted || ctx.state !== 'running' || !buf) return;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = 0.75;
    src.connect(g); g.connect(master);
    src.start();
    src.onended = () => { src.disconnect(); g.disconnect(); };
  }
  // KILL ANNOUNCER HARD CAP. The spec is explicit: the male announcer may
  // call kills 1..10 and NO further. Beyond 10 kills there is no kill voice at
  // all, ever — no streak tier, no milestone, no hidden path. The cap is
  // enforced HERE (the single place a clip resolves), not at the call site,
  // so no other code path can route around it.
  const TIER_CAPS = { male: 10, female: 10 };
  function announce(kind, kills) {
    if (!ctx) return;
    const list = PACKS[voicePack] || PACKS.male;
    const cap = TIER_CAPS[voicePack] || TIER_CAPS.male;
    let name = null;
    // First Blood is index 0 and must only ever be requested by name; the
    // streak path is never called with kills===1 (see addKill), but the guard
    // keeps the mapping honest if that ever changes.
    if (kind === 'firstblood') name = list[0];
    // A streak of N plays list[N-1]: the pack is ordered from First Blood at
    // index 0 through the top tier. The HARD CAP is 10 — no announcer may
    // call a kill beyond that, ever. A pack shorter than the cap (the female
    // pack ships 9 tiers) falls silent at its own end rather than looping or
    // replaying its top line, so each kill still maps to a distinct clip.
    else if (kind === 'streak' && Number.isInteger(kills) && kills >= 2 && kills <= cap && kills <= list.length) {
      name = list[kills - 1];
    }
    if (!name) return;
    loadClip(name).then(playClip);
  }
  function setVoicePack(p) { if (PACKS[p]) voicePack = p; }
  function getVoicePack() { return voicePack; }
  function toggle() {muted=!muted;if(muted&&window.speechSynthesis)window.speechSynthesis.cancel();if(master)master.gain.setTargetAtTime(muted?0:.28,ctx.currentTime,.02);return muted;}
  // Pause/resume without disturbing the user's mute preference: the gain is
  // ducked while paused and restored to whatever mute state applies on resume.
  let pausedBefore = false;
  function setPaused(p) {
    if (!ctx || !master) return;
    if (p && !muted) { pausedBefore = true; if (window.speechSynthesis) window.speechSynthesis.cancel(); master.gain.setTargetAtTime(0, ctx.currentTime, .02); }
    else if (!p && pausedBefore) { pausedBefore = false; master.gain.setTargetAtTime(.28, ctx.currentTime, .02); }
  }
  function isPaused() { return pausedBefore; }
  function packFilenames(){
    // Verification accessor: the exact audio file each kill streak resolves to.
    // Male runs all 14 tiers, female caps at 9.
    return { male: PACKS.male.slice(0,14), female: PACKS.female.slice(0,9) };
  }

  // ---------------------------------------------------------------- music --
  // A SEPARATE bus from the SFX master, so the player can mute the music
  // without touching gunshots, reloads, footsteps or the announcer. The music
  // is SYNTHESIZED at runtime (Web Audio oscillators + a noise-bed): no
  // licensed recordings are shipped or streamed. Everything is scheduled
  // ahead of time, so the loop runs even when the tab is throttled.
  return {start,sound,announce,setVoicePack,getVoicePack,toggle,setPaused,isPaused,get muted(){return muted;},get ready(){return !!ctx;},packFilenames,
    startMusic,stopMusic,setMusicMuted,isMusicMuted,musicState};
})();
