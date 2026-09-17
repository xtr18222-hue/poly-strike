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
    const gun = ['ak47','awp','deagle','enemy'].includes(type);
    const duration = type==='awp' ? .5 : gun ? .2 : .08;
    const now=ctx.currentTime, src=ctx.createBufferSource(), filter=ctx.createBiquadFilter(), gain=ctx.createGain();
    src.buffer=noise; filter.type='lowpass'; filter.frequency.value=gun ? 2100 : 3500;
    gain.gain.setValueAtTime(gun ? .8 : .12,now); gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    src.connect(filter);filter.connect(gain);gain.connect(master);src.start(now);src.stop(now+duration);
    src.onended=()=>{src.disconnect();filter.disconnect();gain.disconnect();};
    if (gun || type==='hit' || type==='kill') {
      const osc=ctx.createOscillator(), g=ctx.createGain();
      osc.type=gun?'triangle':'sine';osc.frequency.setValueAtTime(gun?120:type==='kill'?1200:780,now);
      osc.frequency.exponentialRampToValueAtTime(gun?35:500,now+duration);
      g.gain.setValueAtTime(gun?.7:.12,now);g.gain.exponentialRampToValueAtTime(.001,now+duration);
      osc.connect(g);g.connect(master);osc.start();osc.stop(now+duration);osc.onended=()=>{osc.disconnect();g.disconnect();};
    }
  } catch (_) {} }
  function toggle() {muted=!muted;if(master)master.gain.setTargetAtTime(muted?0:.28,ctx.currentTime,.02);return muted;}
  return {start,sound,toggle,get muted(){return muted;},get ready(){return !!ctx;}};
})();
