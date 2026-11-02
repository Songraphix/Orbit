import { volumeToGain } from '@shared/sounds';
import type { SoundId, SoundState } from '@shared/sounds';

/**
 * Orbit's focus sounds, made with Web Audio: noise shaped by filters (rain, ocean, stream,
 * wind, fire, the noise colours), and oscillators (binaural beats, a drone, singing bowls).
 * Nothing is recorded or downloaded. Switching sounds cross-fades; Stop fades out.
 */

type Voice = { output: GainNode; stop: () => void };

const FADE = 1.5;
const NOISE_SECONDS = 8;

function noiseBuffer(ctx: AudioContext, colour: 'white' | 'pink' | 'brown'): AudioBuffer {
  const length = ctx.sampleRate * NOISE_SECONDS;
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let [b0, b1, b2, b3, b4, b5, b6] = [0, 0, 0, 0, 0, 0, 0];
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (colour === 'white') {
        data[i] = white * 0.5;
      } else if (colour === 'pink') {
        // Paul Kellet's refined filter: -3 dB per octave.
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else {
        // Brown: integrated white noise, leaking back to zero.
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    }
  }
  return buffer;
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voice: { id: SoundId; voice: Voice } | null = null;
  private buffers = new Map<string, AudioBuffer>();

  private suspendTimer: ReturnType<typeof setTimeout> | null = null;

  private chimed: number | null = null;

  apply(state: SoundState): void {
    // "Time's up": one bowl strike, if it's recent and not rung yet.
    if (state.chimeAt && state.chimeAt !== this.chimed && Date.now() - state.chimeAt < 5000) {
      this.chimed = state.chimeAt;
      this.chime(state.volume);
    }
    if (!state.playing && !this.ctx) return;
    const ctx = this.context();
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = null;
    if (state.paused) {
      // Fade out, then stop the clock (no CPU while paused); resuming picks up where it was.
      this.master!.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
      this.suspendTimer = setTimeout(() => void ctx.suspend(), 1200);
      return;
    }
    void ctx.resume();
    this.master!.gain.setTargetAtTime(volumeToGain(state.volume), ctx.currentTime, 0.08);
    if (state.playing === (this.voice?.id ?? null)) return;
    // Cross-fade: the old voice fades out while the new one fades in.
    if (this.voice) {
      const old = this.voice.voice;
      old.output.gain.cancelScheduledValues(ctx.currentTime);
      old.output.gain.setValueAtTime(old.output.gain.value, ctx.currentTime);
      old.output.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE);
      setTimeout(() => old.stop(), FADE * 1000 + 100);
      this.voice = null;
    }
    if (state.playing) {
      const voice = this.build(state.playing);
      voice.output.gain.setValueAtTime(0, ctx.currentTime);
      voice.output.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE);
      voice.output.connect(this.master!);
      this.voice = { id: state.playing, voice };
    }
  }

  /** One soft singing-bowl strike, on its own (it works with nothing else playing). */
  private chime(volume: number): void {
    const ctx = this.context();
    void ctx.resume();
    const out = ctx.createGain();
    out.gain.value = Math.max(0.25, volumeToGain(volume)) * 0.9;
    out.connect(ctx.destination);
    const at = ctx.currentTime + 0.05;
    for (const [ratio, level, decay] of [
      [1, 0.32, 6],
      [2.76, 0.14, 4],
      [5.4, 0.05, 2.5],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = 523.25 * ratio;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(level, at + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      osc.connect(env).connect(out);
      osc.start(at);
      osc.stop(at + decay + 0.1);
    }
  }

  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      // A gentle limiter keeps layered sounds from clipping.
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.ratio.value = 8;
      this.master.connect(limiter).connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private noise(colour: 'white' | 'pink' | 'brown'): AudioBufferSourceNode {
    const ctx = this.ctx!;
    let buffer = this.buffers.get(colour);
    if (!buffer) {
      buffer = noiseBuffer(ctx, colour);
      this.buffers.set(colour, buffer);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    // Each voice starts somewhere else in the loop, so layers never line up.
    source.start(0, Math.random() * NOISE_SECONDS);
    return source;
  }

  private filter(type: BiquadFilterType, frequency: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    return f;
  }

  private gain(value: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.value = value;
    return g;
  }

  /** A slow wobble: `target` moves by ±depth around its value, `rate` times a second. */
  private lfo(target: AudioParam, rate: number, depth: number): OscillatorNode {
    const osc = this.ctx!.createOscillator();
    osc.frequency.value = rate;
    const amount = this.gain(depth);
    osc.connect(amount).connect(target);
    osc.start();
    return osc;
  }

  private build(id: SoundId): Voice {
    const ctx = this.ctx!;
    const output = ctx.createGain();
    const sources: AudioScheduledSourceNode[] = [];
    const timers: ReturnType<typeof setInterval>[] = [];
    const add = <T extends AudioScheduledSourceNode>(node: T) => {
      sources.push(node);
      return node;
    };

    switch (id) {
      case 'white':
      case 'pink':
      case 'brown':
        add(this.noise(id))
          .connect(this.gain(id === 'white' ? 0.35 : 0.8))
          .connect(output);
        break;
      case 'rain': {
        // The hiss of drops, a softer patter, and a little low rumble.
        add(this.noise('white'))
          .connect(this.filter('highpass', 900))
          .connect(this.filter('lowpass', 7000))
          .connect(this.gain(0.28))
          .connect(output);
        const patter = this.gain(0.5);
        add(this.noise('pink'))
          .connect(this.filter('bandpass', 2400, 0.6))
          .connect(patter);
        patter.connect(output);
        add(this.lfo(patter.gain, 0.13, 0.12));
        add(this.noise('brown')).connect(this.gain(0.25)).connect(output);
        break;
      }
      case 'ocean': {
        // Waves: filtered noise swelling and ebbing every ~9 seconds.
        const swell = this.gain(0.45);
        const tone = this.filter('lowpass', 700);
        add(this.noise('brown')).connect(tone).connect(swell).connect(output);
        add(this.lfo(swell.gain, 0.11, 0.4));
        add(this.lfo(tone.frequency, 0.11, 450));
        const foam = this.gain(0.08);
        add(this.noise('pink'))
          .connect(this.filter('highpass', 2500))
          .connect(foam)
          .connect(output);
        add(this.lfo(foam.gain, 0.11, 0.07));
        break;
      }
      case 'stream': {
        // Bright, busy water: a few band-passed layers wobbling quickly.
        for (const [freq, rate, level] of [
          [1100, 3.1, 0.35],
          [2600, 4.7, 0.25],
          [5200, 6.3, 0.12],
        ] as const) {
          const band = this.filter('bandpass', freq, 1.4);
          const layer = this.gain(level);
          add(this.noise('white')).connect(band).connect(layer).connect(output);
          add(this.lfo(band.frequency, rate, freq * 0.25));
          add(this.lfo(layer.gain, rate / 3, level * 0.4));
        }
        add(this.noise('brown')).connect(this.gain(0.18)).connect(output);
        break;
      }
      case 'wind': {
        const band = this.filter('bandpass', 500, 1.2);
        const level = this.gain(0.7);
        add(this.noise('pink')).connect(band).connect(level).connect(output);
        add(this.lfo(band.frequency, 0.07, 280));
        add(this.lfo(level.gain, 0.05, 0.35));
        add(this.noise('brown')).connect(this.gain(0.2)).connect(output);
        break;
      }
      case 'fire': {
        // A low roar, and crackles: short bursts of filtered noise at random moments.
        add(this.noise('brown'))
          .connect(this.filter('lowpass', 500))
          .connect(this.gain(0.55))
          .connect(output);
        const crackle = () => {
          const at = ctx.currentTime + Math.random() * 0.25;
          const burst = this.noise('white');
          const env = this.gain(0);
          burst.connect(this.filter('highpass', 1500 + Math.random() * 3000)).connect(env);
          env.connect(output);
          const peak = 0.15 + Math.random() * 0.45;
          env.gain.setValueAtTime(0, at);
          env.gain.linearRampToValueAtTime(peak, at + 0.002);
          env.gain.exponentialRampToValueAtTime(0.0001, at + 0.02 + Math.random() * 0.06);
          burst.stop(at + 0.12);
        };
        timers.push(
          setInterval(() => {
            for (let i = 0; i < Math.floor(Math.random() * 4); i++) crackle();
          }, 180),
        );
        break;
      }
      case 'alpha':
      case 'theta': {
        // Binaural beat: a slightly different tone in each ear (10 Hz or 6 Hz apart), over a
        // quiet bed of pink noise.
        const beat = id === 'alpha' ? 10 : 6;
        const merger = ctx.createChannelMerger(2);
        for (const [channel, freq] of [
          [0, 200],
          [1, 200 + beat],
        ] as const) {
          const osc = add(ctx.createOscillator());
          osc.frequency.value = freq;
          osc.connect(this.gain(0.22)).connect(merger, 0, channel);
          osc.start();
        }
        merger.connect(output);
        add(this.noise('pink')).connect(this.gain(0.12)).connect(output);
        break;
      }
      case 'drone': {
        // A slow, warm A-minor-ish chord, each voice gently detuned and breathing.
        const tone = this.filter('lowpass', 900);
        tone.connect(output);
        for (const [freq, level] of [
          [110, 0.16],
          [164.81, 0.1],
          [220, 0.09],
          [261.63, 0.06],
          [329.63, 0.04],
        ] as const) {
          for (const detune of [-6, 6]) {
            const osc = add(ctx.createOscillator());
            osc.type = 'sine';
            osc.frequency.value = freq;
            osc.detune.value = detune;
            const voice = this.gain(level);
            osc.connect(voice).connect(tone);
            add(this.lfo(voice.gain, 0.03 + Math.random() * 0.05, level * 0.5));
            osc.start();
          }
        }
        add(this.lfo(tone.frequency, 0.02, 300));
        break;
      }
      case 'bowls': {
        // A bowl struck now and then: inharmonic partials ringing down over ~10 seconds.
        const strike = () => {
          const base = [196, 220, 261.63, 293.66, 329.63][Math.floor(Math.random() * 5)]!;
          const at = ctx.currentTime + 0.05;
          for (const [ratio, level, decay] of [
            [1, 0.3, 11],
            [2.76, 0.14, 7],
            [5.4, 0.06, 4],
            [8.93, 0.025, 2.5],
          ] as const) {
            for (const beatHz of [0, 1.3]) {
              const osc = ctx.createOscillator();
              osc.frequency.value = base * ratio + beatHz;
              const env = this.gain(0);
              osc.connect(env).connect(output);
              env.gain.setValueAtTime(0, at);
              env.gain.linearRampToValueAtTime(level / 2, at + 0.01);
              env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
              osc.start(at);
              osc.stop(at + decay + 0.1);
            }
          }
        };
        strike();
        timers.push(setInterval(strike, 9000));
        add(this.noise('pink')).connect(this.gain(0.04)).connect(output);
        break;
      }
    }

    return {
      output,
      stop: () => {
        for (const timer of timers) clearInterval(timer);
        for (const source of sources) {
          try {
            source.stop();
          } catch {
            // already stopped
          }
        }
        output.disconnect();
      },
    };
  }
}
