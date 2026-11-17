// Every sound is synthesized live with the Web Audio API: oscillators, filtered noise and
// gain envelopes, no audio files at all. The context is built lazily on the first user
// gesture (browsers refuse sound before one) and every call is guarded, so a page without
// audio — a headless screenshot run, a muted tab — simply plays silent.

/** Quiet enough to sit under the game, loud enough to feel. */
const MASTER = 0.35;

/**
 * A tiny synth: one-shot blips for the action plus a slow generative pad underneath.
 * All times are in seconds and all frequencies in hertz.
 */
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let padNodes = null;
  let muted = false;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER;
      master.connect(ctx.destination);
      const length = Math.floor(ctx.sampleRate * 0.5);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  /** A tone that slides from one pitch to another and fades out. */
  function tone({ type = 'sine', from = 440, to = 440, dur = 0.15, vol = 0.5, at = 0 }) {
    if (!ensure() || muted) return;
    try {
      const t0 = ctx.currentTime + at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      // Sound is garnish; a failure here must never break the game.
    }
  }

  /** A burst of filtered noise: hits, pops and roars. */
  function noise({ dur = 0.2, vol = 0.4, freq = 1200, at = 0, type = 'lowpass' }) {
    if (!ensure() || muted || !noiseBuffer) return;
    try {
      const t0 = ctx.currentTime + at;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    } catch {
      // Sound is garnish; a failure here must never break the game.
    }
  }

  return {
    /** Build (or resume) the context after a user gesture. */
    unlock() {
      if (!ensure()) return;
      try {
        if (ctx.state === 'suspended') void ctx.resume();
      } catch {
        // Nothing to do: the game plays on without sound.
      }
    },
    setMuted(value) {
      muted = value;
      if (master && ctx) {
        try {
          master.gain.value = muted ? 0 : MASTER;
        } catch {
          // Nothing to do.
        }
      }
    },
    isMuted() {
      return muted;
    },
    shoot() {
      tone({ type: 'square', from: 880, to: 520, dur: 0.07, vol: 0.12 });
    },
    hit() {
      noise({ dur: 0.06, vol: 0.18, freq: 2600, type: 'highpass' });
    },
    enemyDie() {
      noise({ dur: 0.18, vol: 0.3, freq: 900 });
      tone({ type: 'triangle', from: 320, to: 90, dur: 0.16, vol: 0.22 });
    },
    bossDie() {
      noise({ dur: 0.6, vol: 0.5, freq: 500 });
      tone({ type: 'sawtooth', from: 220, to: 40, dur: 0.55, vol: 0.3 });
    },
    pickup() {
      tone({ type: 'sine', from: 660, to: 1320, dur: 0.14, vol: 0.3 });
    },
    ember() {
      tone({ type: 'sine', from: 1180, to: 1560, dur: 0.06, vol: 0.08 });
    },
    levelUp() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', from: f, to: f, dur: 0.16, vol: 0.3, at: i * 0.09 }));
    },
    waveStart() {
      tone({ type: 'sawtooth', from: 98, to: 196, dur: 0.5, vol: 0.25 });
      tone({ type: 'sine', from: 196, to: 392, dur: 0.4, vol: 0.18, at: 0.1 });
    },
    bossRoar() {
      tone({ type: 'sawtooth', from: 65, to: 130, dur: 0.9, vol: 0.35 });
      noise({ dur: 0.8, vol: 0.25, freq: 300 });
    },
    hurt() {
      tone({ type: 'sawtooth', from: 180, to: 55, dur: 0.25, vol: 0.4 });
      noise({ dur: 0.2, vol: 0.3, freq: 700 });
    },
    gameOver() {
      [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', from: f, to: f * 0.94, dur: 0.3, vol: 0.3, at: i * 0.22 }));
    },
    victory() {
      [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', from: f, to: f, dur: 0.22, vol: 0.3, at: i * 0.13 }));
    },
    click() {
      tone({ type: 'sine', from: 700, to: 900, dur: 0.06, vol: 0.2 });
    },
    nova() {
      tone({ type: 'sine', from: 220, to: 880, dur: 0.3, vol: 0.3 });
      noise({ dur: 0.25, vol: 0.2, freq: 1800, type: 'highpass' });
    },
    dash() {
      noise({ dur: 0.16, vol: 0.28, freq: 2400, type: 'highpass' });
      tone({ type: 'sine', from: 300, to: 720, dur: 0.14, vol: 0.2 });
    },
    milestone() {
      [880, 1175].forEach((f, i) => tone({ type: 'triangle', from: f, to: f, dur: 0.12, vol: 0.25, at: i * 0.08 }));
    },
    /** A slow two-voice pad that breathes under the whole game. */
    startPad() {
      if (!ensure() || padNodes) return;
      try {
        const gain = ctx.createGain();
        gain.gain.value = 0.05;
        gain.connect(master);
        const voices = [110, 164.8].map((freq) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = freq;
          const lfo = ctx.createOscillator();
          lfo.frequency.value = 0.07 + freq * 0.0002;
          const lfoGain = ctx.createGain();
          lfoGain.gain.value = 0.02;
          lfo.connect(lfoGain);
          lfoGain.connect(gain);
          osc.connect(gain);
          osc.start();
          lfo.start();
          return { osc, lfo };
        });
        padNodes = { gain, voices };
      } catch {
        padNodes = null;
      }
    },
    stopPad() {
      if (!padNodes) return;
      try {
        padNodes.voices.forEach(({ osc, lfo }) => {
          osc.stop();
          lfo.stop();
        });
        padNodes.gain.disconnect();
      } catch {
        // Already gone.
      }
      padNodes = null;
    },
  };
}
