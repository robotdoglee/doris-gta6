// Sound, synthesized: there are no audio files in Solmaris. A lazy WebAudio context
// (browsers only let it start after a gesture, so main calls resume() on the first
// confirm) backs a handful of small effects — a door's double thunk, a two-tone horn,
// a crash thud — and the player's car engine, one sawtooth oscillator whose pitch and
// growl follow the speed. Everything is wrapped so a missing or blocked audio stack
// never breaks the game: it just plays silent.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.16;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freqA, freqB, seconds, type, volume, when = 0) {
    if (!ensure()) return;
    try {
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqA, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), t0 + seconds);
      gain.gain.setValueAtTime(volume, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
      osc.connect(gain).connect(master);
      osc.start(t0);
      osc.stop(t0 + seconds + 0.02);
    } catch {
      // A failed effect is silence, not an error.
    }
  }

  function noise(seconds, volume, cutoff) {
    if (!ensure()) return;
    try {
      const t0 = ctx.currentTime;
      const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.connect(filter).connect(gain).connect(master);
      src.start(t0);
    } catch {
      // Silence again.
    }
  }

  return {
    /** Start (or wake) the context; call from a user gesture. */
    resume() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    uiClick() {
      tone(660, 520, 0.07, 'triangle', 0.25);
    },
    door() {
      tone(140, 70, 0.09, 'square', 0.3);
      tone(110, 60, 0.1, 'square', 0.3, 0.11);
    },
    horn() {
      tone(392, 392, 0.28, 'square', 0.16);
      tone(494, 494, 0.28, 'square', 0.16);
    },
    crash(strength = 1) {
      noise(0.22, Math.min(0.6, 0.25 + strength * 0.3), 900);
      tone(90, 40, 0.2, 'sine', 0.4);
    },
    /** A pistol shot: a bright crack over a low thump. */
    gunshot() {
      noise(0.14, 0.5, 2600);
      tone(150, 45, 0.12, 'sine', 0.5);
    },
    /** A swung fist: a short swish and a soft landing. */
    melee() {
      noise(0.08, 0.3, 900);
      tone(220, 90, 0.07, 'triangle', 0.25);
    },
    /** Money changing hands: two bright little notes. */
    cash() {
      tone(880, 880, 0.07, 'square', 0.16);
      tone(1318, 1318, 0.11, 'square', 0.16, 0.07);
    },
    /** The law, or the hospital, collecting: a short descending sting. */
    sting() {
      tone(392, 392, 0.16, 'sawtooth', 0.18);
      tone(311, 311, 0.16, 'sawtooth', 0.18, 0.16);
      tone(233, 220, 0.3, 'sawtooth', 0.18, 0.32);
    },
    splash() {
      noise(0.35, 0.2, 1400);
    },
    /** Begin the engine loop for the player's car. */
    engineStart() {
      if (!ensure() || engineOsc) return;
      try {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 55;
        engineFilter = ctx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 320;
        engineGain = ctx.createGain();
        engineGain.gain.value = 0.0;
        engineOsc.connect(engineFilter).connect(engineGain).connect(master);
        engineOsc.start();
      } catch {
        engineOsc = null;
      }
    },
    /** `ratio` is |speed| / top speed, 0..1; throttle lifts the growl. */
    engineUpdate(ratio, throttle) {
      if (!engineOsc) return;
      try {
        const t = ctx.currentTime;
        engineOsc.frequency.setTargetAtTime(52 + ratio * 120 + (throttle > 0 ? 12 : 0), t, 0.06);
        engineFilter.frequency.setTargetAtTime(300 + ratio * 700, t, 0.08);
        engineGain.gain.setTargetAtTime(0.05 + ratio * 0.1, t, 0.09);
      } catch {
        // Keep driving; the engine just goes quiet.
      }
    },
    engineStop() {
      if (!engineOsc) return;
      try {
        engineGain.gain.setTargetAtTime(0.0, ctx.currentTime, 0.05);
        const osc = engineOsc;
        window.setTimeout(() => {
          try { osc.stop(); } catch { /* already stopped */ }
        }, 200);
      } catch {
        // Nothing to stop cleanly.
      }
      engineOsc = null;
      engineGain = null;
      engineFilter = null;
    },
  };
}
