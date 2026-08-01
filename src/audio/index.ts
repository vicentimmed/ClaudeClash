/**
 * All sound is synthesised with the Web Audio API — no asset files.
 *
 * Layout: master -> { musicBus, sfxBus }. The context starts suspended until
 * the first user gesture (browser autoplay policy), so call `unlock()` from a
 * click/touch handler before expecting anything audible.
 */

const STORAGE_KEY = 'claudeclash.audio.v1';

export type SfxName =
  | 'select'
  | 'deploy'
  | 'melee'
  | 'shoot'
  | 'splash'
  | 'spellFire'
  | 'spellArrows'
  | 'spellZap'
  | 'death'
  | 'towerDown'
  | 'elixirFull'
  | 'win'
  | 'lose'
  | 'countdown'
  | 'uiTap';

interface Prefs {
  music: boolean;
  sfx: boolean;
}

/** Semitone offsets from A2 (110 Hz) for the notes we use. */
const A2 = 110;
const note = (semitonesAboveA2: number) => A2 * Math.pow(2, semitonesAboveA2 / 12);

/**
 * Four-bar loop in A minor: Am - F - C - G. Each entry is the chord root
 * (semitones above A2) plus the triad used by the arpeggio.
 */
const PROGRESSION = [
  { root: 0, triad: [0, 3, 7, 12] },
  { root: -4, triad: [-4, 0, 3, 8] },
  { root: 3, triad: [3, 7, 10, 15] },
  { root: -2, triad: [-2, 2, 5, 10] },
];

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noiseBuffer!: AudioBuffer;

  private prefs: Prefs = { music: true, sfx: true };
  private schedulerId: number | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private playingMusic = false;
  /** eighth notes at 104 bpm */
  private readonly stepDur = 60 / 104 / 2;

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.prefs = { ...this.prefs, ...(JSON.parse(raw) as Partial<Prefs>) };
    } catch {
      /* defaults are fine */
    }
  }

  get musicOn() {
    return this.prefs.music;
  }
  get sfxOn() {
    return this.prefs.sfx;
  }
  get enabled() {
    return this.prefs.music || this.prefs.sfx;
  }

  /** Must run inside a user gesture. Safe to call repeatedly. */
  async unlock() {
    if (!this.ctx) this.build();
    if (this.ctx!.state === 'suspended') await this.ctx!.resume();
  }

  private build() {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.prefs.music ? 0.22 : 0;
    this.musicBus.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.prefs.sfx ? 0.55 : 0;
    this.sfxBus.connect(this.master);

    // one second of white noise, reused by every percussive sound
    const frames = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  }

  // ------------------------------------------------------------- preferences

  setMusic(on: boolean) {
    this.prefs.music = on;
    this.save();
    if (this.ctx) {
      this.musicBus.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.05);
    }
  }

  setSfx(on: boolean) {
    this.prefs.sfx = on;
    this.save();
    if (this.ctx) {
      this.sfxBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.03);
    }
  }

  /** Cycles both flags together — what the speaker button in the HUD uses. */
  toggleAll(): boolean {
    const on = !this.enabled;
    this.setMusic(on);
    this.setSfx(on);
    return on;
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.prefs));
    } catch {
      /* private mode — just don't persist */
    }
  }

  // -------------------------------------------------------------------- music

  startMusic() {
    if (!this.ctx || this.playingMusic) return;
    this.playingMusic = true;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.schedulerId = window.setInterval(() => this.scheduleAhead(), 25);
  }

  stopMusic() {
    this.playingMusic = false;
    if (this.schedulerId !== null) {
      clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
  }

  /** Classic Web Audio lookahead scheduler: queue anything due in the next 120 ms. */
  private scheduleAhead() {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.nextNoteTime < ctx.currentTime + 0.12) {
      this.scheduleStep(this.step, this.nextNoteTime);
      this.nextNoteTime += this.stepDur;
      this.step = (this.step + 1) % 32;
    }
  }

  private scheduleStep(step: number, when: number) {
    const bar = Math.floor(step / 8) % PROGRESSION.length;
    const beat = step % 8;
    const chord = PROGRESSION[bar];

    // bass on the down beat and the half bar
    if (beat === 0 || beat === 4) {
      this.tone({
        freq: note(chord.root - 12),
        when,
        dur: 0.42,
        type: 'triangle',
        gain: 0.5,
        bus: this.musicBus,
      });
    }

    // arpeggio riding the eighths
    const arp = chord.triad[[0, 2, 1, 3, 2, 1, 3, 2][beat]];
    this.tone({
      freq: note(arp + 12),
      when,
      dur: 0.2,
      type: 'square',
      gain: beat % 2 === 0 ? 0.13 : 0.08,
      bus: this.musicBus,
    });

    // soft pad holding the chord through the bar
    if (beat === 0) {
      for (const semi of [chord.triad[0], chord.triad[2]]) {
        this.tone({
          freq: note(semi),
          when,
          dur: this.stepDur * 8,
          type: 'sine',
          gain: 0.1,
          attack: 0.12,
          bus: this.musicBus,
        });
      }
    }

    // light percussion
    if (beat === 0 || beat === 4) this.noise({ when, dur: 0.11, gain: 0.22, filter: 220, bus: this.musicBus });
    if (beat % 2 === 1) this.noise({ when, dur: 0.04, gain: 0.05, filter: 6500, bus: this.musicBus });
  }

  // ---------------------------------------------------------------------- sfx

  play(name: SfxName) {
    const ctx = this.ctx;
    if (!ctx || !this.prefs.sfx) return;
    const t = ctx.currentTime;

    switch (name) {
      case 'uiTap':
        this.tone({ freq: 660, when: t, dur: 0.05, type: 'square', gain: 0.18 });
        break;
      case 'select':
        this.tone({ freq: 520, when: t, dur: 0.06, type: 'square', gain: 0.2 });
        this.tone({ freq: 780, when: t + 0.05, dur: 0.07, type: 'square', gain: 0.16 });
        break;
      case 'deploy':
        this.noise({ when: t, dur: 0.22, gain: 0.35, filter: 900, sweepTo: 200 });
        this.tone({ freq: 180, when: t, dur: 0.18, type: 'sine', gain: 0.3, slideTo: 90 });
        break;
      case 'melee':
        this.noise({ when: t, dur: 0.07, gain: 0.3, filter: 2600 });
        this.tone({ freq: 160, when: t, dur: 0.07, type: 'triangle', gain: 0.22, slideTo: 80 });
        break;
      case 'shoot':
        this.tone({ freq: 900, when: t, dur: 0.07, type: 'triangle', gain: 0.16, slideTo: 300 });
        break;
      case 'splash':
        this.noise({ when: t, dur: 0.18, gain: 0.28, filter: 1500, sweepTo: 400 });
        break;
      case 'spellFire':
        this.noise({ when: t, dur: 0.55, gain: 0.6, filter: 1800, sweepTo: 120 });
        this.tone({ freq: 220, when: t, dur: 0.4, type: 'sawtooth', gain: 0.3, slideTo: 55 });
        break;
      case 'spellArrows':
        for (let i = 0; i < 5; i++) {
          this.noise({ when: t + i * 0.035, dur: 0.09, gain: 0.2, filter: 4200, sweepTo: 1400 });
        }
        break;
      case 'spellZap':
        this.tone({ freq: 1500, when: t, dur: 0.16, type: 'sawtooth', gain: 0.3, slideTo: 180 });
        this.noise({ when: t, dur: 0.2, gain: 0.28, filter: 5000, sweepTo: 800 });
        break;
      case 'death':
        this.tone({ freq: 300, when: t, dur: 0.22, type: 'triangle', gain: 0.2, slideTo: 110 });
        this.noise({ when: t, dur: 0.14, gain: 0.16, filter: 1200 });
        break;
      case 'towerDown':
        this.noise({ when: t, dur: 1.0, gain: 0.7, filter: 900, sweepTo: 90 });
        this.tone({ freq: 120, when: t, dur: 0.7, type: 'sine', gain: 0.5, slideTo: 40 });
        this.tone({ freq: 90, when: t + 0.1, dur: 0.6, type: 'triangle', gain: 0.3, slideTo: 35 });
        break;
      case 'elixirFull':
        this.tone({ freq: 880, when: t, dur: 0.1, type: 'sine', gain: 0.2 });
        this.tone({ freq: 1320, when: t + 0.08, dur: 0.14, type: 'sine', gain: 0.16 });
        break;
      case 'countdown':
        this.tone({ freq: 740, when: t, dur: 0.12, type: 'square', gain: 0.22 });
        break;
      case 'win':
        [0, 4, 7, 12].forEach((semi, i) => {
          this.tone({
            freq: note(semi + 12),
            when: t + i * 0.11,
            dur: 0.3,
            type: 'triangle',
            gain: 0.3,
          });
        });
        break;
      case 'lose':
        [0, -3, -5, -12].forEach((semi, i) => {
          this.tone({
            freq: note(semi + 12),
            when: t + i * 0.16,
            dur: 0.38,
            type: 'triangle',
            gain: 0.28,
          });
        });
        break;
    }
  }

  // ------------------------------------------------------------------ voices

  private tone(opts: {
    freq: number;
    when: number;
    dur: number;
    type: OscillatorType;
    gain: number;
    slideTo?: number;
    attack?: number;
    bus?: GainNode;
  }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.freq, opts.when);
    if (opts.slideTo) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, opts.slideTo),
        opts.when + opts.dur,
      );
    }
    const attack = opts.attack ?? 0.008;
    env.gain.setValueAtTime(0.0001, opts.when);
    env.gain.exponentialRampToValueAtTime(opts.gain, opts.when + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, opts.when + opts.dur);
    osc.connect(env).connect(opts.bus ?? this.sfxBus);
    osc.start(opts.when);
    osc.stop(opts.when + opts.dur + 0.02);
  }

  private noise(opts: {
    when: number;
    dur: number;
    gain: number;
    filter: number;
    sweepTo?: number;
    bus?: GainNode;
  }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const band = ctx.createBiquadFilter();
    band.type = 'lowpass';
    band.frequency.setValueAtTime(opts.filter, opts.when);
    if (opts.sweepTo) {
      band.frequency.exponentialRampToValueAtTime(
        Math.max(40, opts.sweepTo),
        opts.when + opts.dur,
      );
    }
    const env = ctx.createGain();
    env.gain.setValueAtTime(opts.gain, opts.when);
    env.gain.exponentialRampToValueAtTime(0.0001, opts.when + opts.dur);
    src.connect(band).connect(env).connect(opts.bus ?? this.sfxBus);
    src.start(opts.when);
    src.stop(opts.when + opts.dur + 0.02);
  }
}
