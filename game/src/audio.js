// audio.js — Web Audio synth only. No audio files, no network.
export function createAudio() {
  let ctx = null, master = null, noiseBuf = null, _muted = false;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = _muted ? 0 : 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  // Short oscillator blip with pitch slide + exponential decay.
  function tone(f0, f1, dur, type, vol, when) {
    if (!ensure()) return;
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // Filtered noise burst (gunshots, impacts, footsteps).
  function noise(dur, freq, vol, type, when, q) {
    if (!ensure()) return;
    const t = ctx.currentTime + (when || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass';
    f.frequency.value = freq; f.Q.value = q || 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  // Per-weapon shot signatures: pitch / body / noise differ by class.
  const SHOTS = {
    kx45:  { n: [0.09, 1800, 0.55], t: [220, 70, 0.08, 'square', 0.25] },
    ar7:   { n: [0.11, 1400, 0.6],  t: [160, 55, 0.1, 'sawtooth', 0.3] },
    vex9:  { n: [0.07, 2400, 0.45], t: [300, 90, 0.06, 'square', 0.2] },
    br12:  { n: [0.22, 900, 0.9],   t: [110, 40, 0.2, 'sawtooth', 0.45] },
    m40:   { n: [0.3, 700, 0.95],   t: [90, 32, 0.28, 'sawtooth', 0.5] },
  };

  return {
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    shot(id) {
      const s = SHOTS[id] || SHOTS.ar7;
      noise(s.n[0], s.n[1], s.n[2]);
      tone(s.t[0], s.t[1], s.t[2], s.t[3], s.t[4]);
    },
    reload() { tone(500, 300, 0.07, 'square', 0.12); tone(700, 450, 0.08, 'square', 0.14, 0.18); noise(0.06, 3000, 0.1, 'highpass', 0.32); },
    dryFire() { tone(900, 500, 0.04, 'square', 0.15); },
    hit(head) { tone(head ? 1400 : 950, head ? 900 : 700, 0.06, 'sine', 0.3); },
    kill() { tone(660, 660, 0.08, 'sine', 0.3); tone(990, 990, 0.12, 'sine', 0.3, 0.09); },
    plant() { tone(440, 440, 0.1, 'square', 0.2); tone(440, 440, 0.1, 'square', 0.2, 0.16); },
    defuse() { tone(880, 880, 0.1, 'square', 0.2); tone(660, 660, 0.14, 'square', 0.2, 0.16); },
    beep() { tone(1200, 1200, 0.07, 'square', 0.22); },
    roundStart() { tone(392, 392, 0.12, 'triangle', 0.3); tone(523, 523, 0.16, 'triangle', 0.3, 0.13); },
    roundWin(win) {
      if (win) { tone(523, 523, 0.12, 'triangle', 0.3); tone(659, 659, 0.12, 'triangle', 0.3, 0.12); tone(784, 784, 0.22, 'triangle', 0.3, 0.24); }
      else { tone(392, 392, 0.14, 'triangle', 0.28); tone(311, 311, 0.24, 'triangle', 0.28, 0.15); }
    },
    footstep() { noise(0.05, 500, 0.07, 'lowpass'); },
    explode() { noise(0.9, 300, 1.0); tone(70, 28, 0.7, 'sine', 0.8); noise(0.4, 1200, 0.4, 'bandpass', 0.05); },
    click() { tone(1000, 700, 0.04, 'square', 0.12); },
    setMuted(m) { _muted = !!m; if (master) master.gain.value = _muted ? 0 : 0.5; },
    get muted() { return _muted; },
  };
}
