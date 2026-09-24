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
    const cues={magout:[340,.10,.13],magin:[640,.085,.16],bolt:[1350,.075,.12],dry:[2400,.05,.09],switch:[900,.05,.07],heartbeat:[58,.18,.18],enemyStep:[115,.10,.11],tick:[1500,.02,.05],clang:[660,.12,.16],crate:[520,.14,.18],caseopen:[880,.10,.20],death:[180,.45,.20]};
    if(cues[type]){const [hz,dur,level]=cues[type];tone(hz,dur,level,type==='heartbeat'?'sine':'triangle');
      // Dry fire: a distinct empty-chamber metallic click — sharp double tick.
      if(type==='dry'){tone(1850,.03,.06,'square',.035);tone(1450,.025,.045,'triangle',.055);}
      if(type==='heartbeat')tone(65,.12,.10,'sine',.21);if(type==='death')tone(90,.4,.10,'sine',.18);return;}
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
      mx:      { barrel:'melee',  dur:.10, hz:2400, punch:0,   crack:1800 },
      bayonet: { barrel:'melee',  dur:.10, hz:2400, punch:0,   crack:1800 },
      ak47:    { barrel:'rifle',  dur:.20, hz:1500, punch:120, crack:2100 },
      awp:     { barrel:'sniper', dur:.50, hz:900,  punch:70,  crack:2600 },
      kar98:   { barrel:'sniper', dur:.45, hz:1000, punch:85,  crack:2400 },
      enemy:   { barrel:'rifle',  dur:.20, hz:1300, punch:120, crack:2000 },
    };
    const prof = PROFILES[type];
    if (prof) {
      const now = ctx.currentTime;
      // Noise body: the ballistic crack, band-passed around the weapon's pitch.
      if (prof.barrel !== 'melee') {
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
        // Melee: a short metallic swish, no report.
        tone(prof.hz, prof.dur, .12, 'triangle');
        tone(prof.crack, prof.dur * .6, .06, 'sine', .02);
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
  // Kill streak -> clip, indexed from 1. Tiers stop at the last line in the
  // pack: beyond that the announcer goes silent (see TIER_CAPS in announce()).
  const PACKS = {
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
      'Mortal-Kombat-Announcer-2026-09-20-07-06-Devastation!',
      'Mortal-Kombat-Announcer-2026-09-20-07-07-Annihilation',
      '[audio]Monster-Kill !',
      '[audio]Godlike!',
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
      '[UT Sexy Female Announcer]Monster-Kill!',
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
  // Kill-count tiers stop at the last line in the pack: beyond it the
  // announcer goes completely silent rather than looping or replaying the top.
  // The packs are capped separately: the female announcer runs to 9 kills and
  // the male announcer to 14, so each pack is indexed by its own length and
  // the shared hard cap is gone.
  const TIER_CAPS = { male: 14, female: 9 };
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
    // index 0 through the top tier, so the cap is the pack's own length.
    else if (kind === 'streak' && Number.isInteger(kills) && kills >= 2 && kills <= cap) {
      name = list[Math.min(kills - 1, list.length - 1)];
    }
    if (!name) return;
    loadClip(name).then(playClip);
  }
  function setVoicePack(p) { if (PACKS[p]) voicePack = p; }
  function getVoicePack() { return voicePack; }
  function toggle() {muted=!muted;if(muted&&window.speechSynthesis)window.speechSynthesis.cancel();if(master)master.gain.setTargetAtTime(muted?0:.28,ctx.currentTime,.02);return muted;}
  function packFilenames(){
    // Verification accessor: the exact audio file each kill streak resolves to.
    // Male runs all 14 tiers, female caps at 9.
    return { male: PACKS.male.slice(0,14), female: PACKS.female.slice(0,9) };
  }

  return {start,sound,announce,setVoicePack,getVoicePack,toggle,get muted(){return muted;},get ready(){return !!ctx;},packFilenames};
})();
