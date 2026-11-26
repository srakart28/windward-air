// Synthesised sound, no audio files: a two-oscillator engine whose pitch follows the
// throttle, wind noise that rises with airspeed, and small chimes for rings, touchdowns and
// the end of a sortie. The context opens on the first user gesture, as browsers require.

/** Create the sound kit; every method is safe to call before the context exists. */
export function createAudio() {
  let ctx = null;
  let engine = null;
  let wind = null;
  let master = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.4;
      master.connect(ctx.destination);

      // Engine: a saw and a square an octave apart through a low-pass, pitch from the throttle.
      const oscA = ctx.createOscillator();
      oscA.type = 'sawtooth';
      const oscB = ctx.createOscillator();
      oscB.type = 'square';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      oscA.connect(filter);
      oscB.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      oscA.start();
      oscB.start();
      engine = { oscA, oscB, filter, gain };

      // Wind: looped white noise through a band-pass, gain from airspeed.
      const length = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 480;
      band.Q.value = 0.6;
      const windGain = ctx.createGain();
      windGain.gain.value = 0;
      source.connect(band);
      band.connect(windGain);
      windGain.connect(master);
      source.start();
      wind = { band, gain: windGain };
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function tone(freqA, freqB, at, dur, type = 'sine', vol = 0.22) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, ctx.currentTime + at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), ctx.currentTime + at + dur);
    gain.gain.setValueAtTime(0, ctx.currentTime + at);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(ctx.currentTime + at);
    osc.stop(ctx.currentTime + at + dur + 0.05);
  }

  return {
    /** Call from any click or keypress: opens the context and starts the engine idle. */
    unlock() {
      ensure();
    },
    /** Per-frame: engine pitch and loudness from the throttle, wind from the airspeed. */
    update(throttle, speed, running) {
      if (!ctx || !engine) return;
      const t = ctx.currentTime;
      const rpm = 42 + throttle * 68 + speed * 0.22;
      engine.oscA.frequency.setTargetAtTime(rpm, t, 0.08);
      engine.oscB.frequency.setTargetAtTime(rpm * 0.5 + 3, t, 0.08);
      engine.filter.frequency.setTargetAtTime(280 + throttle * 700, t, 0.1);
      engine.gain.gain.setTargetAtTime(running ? 0.05 + throttle * 0.13 : 0, t, 0.12);
      wind.gain.gain.setTargetAtTime(Math.min(0.2, speed * speed * 0.000045), t, 0.15);
      wind.band.frequency.setTargetAtTime(320 + speed * 7, t, 0.2);
    },
    /** Two bright notes: a ring threaded. */
    ringChime() {
      tone(880, 880, 0, 0.16);
      tone(1318, 1318, 0.09, 0.24);
    },
    /** One low note: a ring missed. */
    ringMissed() {
      tone(220, 196, 0, 0.25, 'triangle', 0.18);
    },
    /** A soft thud for a good touchdown, a crunch for a hard one. */
    touchdown(hard) {
      tone(hard ? 130 : 90, 45, 0, hard ? 0.4 : 0.22, 'sine', hard ? 0.4 : 0.25);
    },
    /** A burst of falling noise: the sortie ended against the ground. */
    crash() {
      tone(300, 38, 0, 0.8, 'sawtooth', 0.3);
      tone(140, 30, 0.05, 0.9, 'square', 0.2);
    },
    /** A small major arpeggio: down and complete. */
    fanfare() {
      tone(523, 523, 0, 0.18);
      tone(659, 659, 0.13, 0.18);
      tone(784, 784, 0.26, 0.32);
    },
  };
}
