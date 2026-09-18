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
    const cues={magout:[340,.10,.13],magin:[640,.085,.16],bolt:[1350,.075,.12],dry:[2400,.05,.09],switch:[900,.05,.07],heartbeat:[58,.18,.18],enemyStep:[115,.10,.11]};
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
  function announce(kind){if(!ctx||muted||ctx.state!=='running')return;const words={double:'Double kill',triple:'Triple kill',multi:'Multi kill',clutch:'Clutch'};if(!words[kind])return;try{const n=kind==='double'?2:kind==='triple'?3:4;for(let i=0;i<n;i++)tone(440+i*160,.15,.12,'sine',i*.12);
    // Prefer installed local voices, never request cloud speech for offline play.
    const synth=window.speechSynthesis,voice=synth&&synth.getVoices().find(v=>v.localService&&v.lang.startsWith('en'));
    if(voice&&window.SpeechSynthesisUtterance){synth.cancel();const u=new window.SpeechSynthesisUtterance(words[kind]);u.voice=voice;u.rate=.95;u.pitch=.85;u.volume=.65;synth.speak(u);}
  }catch(_){} }
  function toggle() {muted=!muted;if(muted&&window.speechSynthesis)window.speechSynthesis.cancel();if(master)master.gain.setTargetAtTime(muted?0:.28,ctx.currentTime,.02);return muted;}
  return {start,sound,announce,toggle,get muted(){return muted;},get ready(){return !!ctx;}};
})();
