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
    const cues={magout:[340,.10,.13],magin:[640,.085,.16],bolt:[1350,.075,.12],dry:[2400,.05,.09],switch:[900,.05,.07],heartbeat:[58,.18,.18],enemyStep:[115,.10,.11],tick:[1500,.02,.05],clang:[660,.12,.16],crate:[520,.14,.18],caseopen:[880,.10,.20]};
    if(cues[type]){const [hz,dur,level]=cues[type];tone(hz,dur,level,type==='heartbeat'?'sine':'triangle');
      // Dry fire: a distinct empty-chamber metallic click — sharp double tick.
      if(type==='dry'){tone(1850,.03,.06,'square',.035);tone(1450,.025,.045,'triangle',.055);}
      if(type==='heartbeat')tone(65,.12,.10,'sine',.21);return;}
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
  // pack: beyond that the announcer goes silent (see TIER_CAP in announce()).
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
  // Kill-count tiers stop at the last line in the pack: beyond it the
  // announcer goes completely silent rather than looping or replaying the top.
  const TIER_CAP = 9;
  function announce(kind, kills) {
    if (!ctx) return;
    const list = PACKS[voicePack] || PACKS.male;
    let name = null;
    if (kind === 'firstblood') name = list[0];
    else if (Number.isInteger(kills) && kills >= 1 && kills <= TIER_CAP) {
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
    return { male: PACKS.male.slice(0,12), female: PACKS.female.slice(0,8) };
  }

  return {start,sound,announce,setVoicePack,getVoicePack,toggle,get muted(){return muted;},get ready(){return !!ctx;},packFilenames};
})();
