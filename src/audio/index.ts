/**
 * All sound is synthesised with the Web Audio API — no asset files.
 *
 * Layout: master -> { musicBus, sfxBus }. The context starts suspended until
 * the first user gesture (browser autoplay policy), so call `unlock()` from a
 * click/touch handler before expecting anything audible.
 */

import { MUSIC_DECK } from './music-deck';

const STORAGE_KEY = 'claudeclash.audio.v1';

/** Arena Anthem (v3) na partida; Card Lounge no deck builder. */
export type MusicTrack = 'battle' | 'deck';

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
 * Arena Anthem (v3) — 16-bar battle theme at 136 BPM.
 * Form: verse → lift → chorus → bridge/build.
 * Backups: music-v1-backup.ts, music-v2-backup.ts.
 *
 * Semitone offsets from A2 (A=0, C=3, E=7, F=8, G=10…).
 */
const PROGRESSION = [
  // verse
  { root: 0, triad: [0, 3, 7, 12] }, // Am
  { root: -4, triad: [-4, 0, 3, 8] }, // F
  { root: 3, triad: [3, 7, 10, 15] }, // C
  { root: -2, triad: [-2, 2, 5, 10] }, // G
  // lift
  { root: 0, triad: [0, 3, 7, 12] }, // Am
  { root: -5, triad: [-5, -2, 2, 7] }, // Em
  { root: -4, triad: [-4, 0, 3, 8] }, // F
  { root: -2, triad: [-2, 2, 5, 10] }, // G
  // chorus (brighter)
  { root: 3, triad: [3, 7, 10, 15] }, // C
  { root: -2, triad: [-2, 2, 5, 10] }, // G
  { root: 0, triad: [0, 3, 7, 12] }, // Am
  { root: -4, triad: [-4, 0, 3, 8] }, // F
  // bridge → dominant pull
  { root: 5, triad: [5, 8, 12, 17] }, // Dm
  { root: 0, triad: [0, 3, 7, 12] }, // Am
  { root: -4, triad: [-4, 0, 3, 8] }, // F
  { root: -5, triad: [-5, -1, 2, 7] }, // E (V — epic resolve into Am)
];

/**
 * Main lead — singable game-hook. `null` = rest.
 * 128 eighths = 16 bars.
 */
const MELODY: (number | null)[] = [
  // bars 0–1  "call" — ascending punch
  12, null, 15, 12, 19, null, 17, 15, 15, 17, 19, 22, 20, 19, 17, 15,
  // bars 2–3  "answer"
  15, null, 17, 15, 22, null, 20, 19, 19, 17, 15, 14, 15, 17, 19, 15,
  // bars 4–5  lift with leap
  12, 15, 19, 24, null, 22, 19, 17, 17, null, 19, 17, 22, 20, 19, 17,
  // bars 6–7  run into chorus
  15, 17, 19, 22, 24, 22, 20, 19, 17, 15, 14, 12, 14, 15, 17, 19,
  // bars 8–9  CHORUS hook (big & catchy)
  27, null, 24, 22, 24, null, 22, 19, 22, 24, 27, 24, 22, 20, 19, 17,
  // bars 10–11 chorus resolve
  19, null, 22, 19, 24, null, 22, 20, 19, 17, 15, 17, 19, 22, 20, 19,
  // bars 12–13 bridge sequence (rising)
  17, 19, 20, 24, 22, 20, 19, 17, 15, 17, 19, 22, 24, 22, 20, 19,
  // bars 14–15 build + landing
  20, 22, 24, 27, 24, 22, 20, 19, 22, 24, 27, 31, 29, 27, 24, 22,
];

/** Harmony / counter — enters from bar 4. Often a 3rd below the lead. */
const COUNTER: (number | null)[] = [
  // 0–3 silent (verse sparse)
  null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
  // 4–7 thirds under lift
  8, 12, 15, 19, null, 17, 15, 12, 12, null, 15, 12, 17, 15, 14, 12,
  12, 14, 15, 17, 19, 17, 15, 14, 12, 10, 8, 7, 8, 10, 12, 14,
  // 8–11 chorus harmony
  22, null, 19, 17, 19, null, 17, 15, 17, 19, 22, 19, 17, 15, 14, 12,
  15, null, 17, 15, 19, null, 17, 15, 14, 12, 10, 12, 14, 17, 15, 14,
  // 12–15 bridge echo (delay-ish, sparser)
  null, 15, null, 19, null, 17, null, 14, null, 12, null, 17, null, 19, null, 15,
  15, null, 19, null, 20, null, 17, null, 17, 19, 22, 24, 22, 20, 19, 17,
];

/**
 * Gallop bass offsets from chord root, per eighth in a bar.
 * Pattern: root . root 5th | root . root oct  — classic game-battle drive.
 */
const BASS_PATTERN: (number | null)[] = [-12, null, -12, -5, -12, null, -12, 0];

const BATTLE_STEPS_PER_LOOP = 128;

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
  private track: MusicTrack = 'deck';

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

  startMusic(track?: MusicTrack) {
    if (!this.ctx) return;
    if (track !== undefined && track !== this.track) {
      this.stopMusic();
      this.track = track;
    }
    if (this.playingMusic) return;
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
    const stepDur = this.stepDur;
    const stepsPerLoop = this.stepsPerLoop;
    while (this.nextNoteTime < ctx.currentTime + 0.12) {
      if (this.track === 'deck') this.scheduleDeckStep(this.step, this.nextNoteTime);
      else this.scheduleBattleStep(this.step, this.nextNoteTime);
      this.nextNoteTime += stepDur;
      this.step = (this.step + 1) % stepsPerLoop;
    }
  }

  private get stepDur() {
    return this.track === 'deck' ? 60 / MUSIC_DECK.bpm / 2 : 60 / 136 / 2;
  }

  private get stepsPerLoop() {
    return this.track === 'deck' ? MUSIC_DECK.stepsPerLoop : BATTLE_STEPS_PER_LOOP;
  }

  /** Card Lounge — jazz lo-fi para montar o deck. */
  private scheduleDeckStep(step: number, when: number) {
    const vol = 1.75;
    const bar = Math.floor(step / 8) % MUSIC_DECK.PROGRESSION.length;
    const beat = step % 8;
    const chord = MUSIC_DECK.PROGRESSION[bar];
    const stepDur = this.stepDur;

    // Rhodes suave nos offbeats (swing leve)
    if (beat === 2 || beat === 6) {
      for (const semi of [chord.triad[0], chord.triad[1], chord.triad[2]]) {
        this.tone({
          freq: note(semi + 12),
          when,
          dur: stepDur * 3,
          type: 'sine',
          gain: 0.042 * vol,
          attack: 0.05,
          bus: this.musicBus,
        });
      }
      if (chord.triad[3] !== undefined) {
        this.tone({
          freq: note(chord.triad[3] + 12),
          when,
          dur: stepDur * 3,
          type: 'sine',
          gain: 0.028 * vol,
          attack: 0.06,
          bus: this.musicBus,
        });
      }
    }

    // Pad quente no início do compasso
    if (beat === 0) {
      this.tone({
        freq: note(chord.root),
        when,
        dur: stepDur * 8,
        type: 'sine',
        gain: 0.032 * vol,
        attack: 0.3,
        bus: this.musicBus,
      });
    }

    // Contrabaixo melódico — compasso inteiro, nota por bar
    if (beat === 0) {
      this.tone({
        freq: note(MUSIC_DECK.BASS[bar] - 12),
        when,
        dur: stepDur * 7,
        type: 'sine',
        gain: 0.14 * vol,
        attack: 0.04,
        bus: this.musicBus,
      });
    }

    // Vibraphone — melodia espaçada
    const mel = MUSIC_DECK.MELODY[step % MUSIC_DECK.MELODY.length];
    if (mel !== null) {
      this.tone({
        freq: note(mel),
        when,
        dur: 0.38,
        type: 'sine',
        gain: 0.11 * vol,
        attack: 0.025,
        bus: this.musicBus,
      });
      this.tone({
        freq: note(mel) * 1.003,
        when: when + 0.07,
        dur: 0.32,
        type: 'sine',
        gain: 0.045 * vol,
        attack: 0.04,
        bus: this.musicBus,
      });
    }

    // Escovinha suave nos offbeats
    if (beat === 2 || beat === 6) {
      this.noise({
        when,
        dur: 0.055,
        gain: 0.038 * vol,
        filter: 2400,
        sweepTo: 1100,
        bus: this.musicBus,
      });
    }

    // Kick bem leve a cada dois compassos
    if (beat === 0 && bar % 2 === 0) {
      this.tone({
        freq: 58,
        when,
        dur: 0.14,
        type: 'sine',
        gain: 0.07 * vol,
        bus: this.musicBus,
      });
    }

    // Shaker nos tempos fracos
    if (beat % 2 === 1) {
      this.noise({ when, dur: 0.012, gain: 0.016 * vol, filter: 8800, bus: this.musicBus });
    }
  }

  /** v3 — Arena Anthem for in-match gameplay. */
  private scheduleBattleStep(step: number, when: number) {
    const bar = Math.floor(step / 8) % PROGRESSION.length;
    const beat = step % 8;
    const chord = PROGRESSION[bar];
    const verse = bar < 4;
    const chorus = bar >= 8 && bar < 12;
    const bridge = bar >= 12;
    const build = bar >= 14;

    // ---- gallop bass -------------------------------------------------
    const bassOff = BASS_PATTERN[beat];
    if (bassOff !== null) {
      const accent = beat === 0 || beat === 4;
      this.tone({
        freq: note(chord.root + bassOff),
        when,
        dur: accent ? 0.26 : 0.12,
        type: 'triangle',
        gain: accent ? 0.52 : 0.3,
        bus: this.musicBus,
      });
      if (accent) {
        // sub sine for body
        this.tone({
          freq: note(chord.root - 12),
          when,
          dur: 0.2,
          type: 'sine',
          gain: 0.22,
          bus: this.musicBus,
        });
      }
    }
    // bridge: add walking fifths on offbeats for urgency
    if (bridge && (beat === 1 || beat === 5)) {
      this.tone({
        freq: note(chord.root - 5),
        when,
        dur: 0.1,
        type: 'triangle',
        gain: 0.22,
        bus: this.musicBus,
      });
    }

    // ---- pads / brass ------------------------------------------------
    if (beat === 0) {
      const padGain = verse ? 0.04 : chorus ? 0.09 : 0.065;
      this.tone({
        freq: note(chord.root),
        when,
        dur: this.stepDur * 8,
        type: 'sawtooth',
        gain: padGain,
        attack: 0.1,
        bus: this.musicBus,
      });
      this.tone({
        freq: note(chord.root + 7),
        when,
        dur: this.stepDur * 8,
        type: 'sawtooth',
        gain: padGain * 0.75,
        attack: 0.12,
        bus: this.musicBus,
      });
      // soft third for color (minor/major from triad)
      this.tone({
        freq: note(chord.triad[1]),
        when,
        dur: this.stepDur * 8,
        type: 'sine',
        gain: padGain * 0.55,
        attack: 0.15,
        bus: this.musicBus,
      });
    }
    // brass stab on downs — bigger in chorus & on E dominant
    if (beat === 0 && (chorus || bar === 15 || (!verse && bar % 2 === 0))) {
      this.tone({
        freq: note(chord.root + 12),
        when,
        dur: 0.14,
        type: 'square',
        gain: chorus || bar === 15 ? 0.14 : 0.09,
        bus: this.musicBus,
      });
      this.tone({
        freq: note(chord.root + 19),
        when,
        dur: 0.12,
        type: 'square',
        gain: chorus || bar === 15 ? 0.08 : 0.05,
        bus: this.musicBus,
      });
    }

    // ---- arpeggio sparkle --------------------------------------------
    if (!verse || beat % 2 === 0) {
      const arpIdx = [0, 2, 1, 3, 2, 0, 3, 1][beat];
      const arpGain = verse ? 0.04 : chorus ? 0.08 : 0.06;
      this.tone({
        freq: note(chord.triad[arpIdx] + (chorus ? 24 : 12)),
        when,
        dur: 0.11,
        type: 'square',
        gain: beat % 2 === 0 ? arpGain : arpGain * 0.65,
        bus: this.musicBus,
      });
    }

    // ---- lead melody (with chorus thickness) -------------------------
    const mel = MELODY[step % MELODY.length];
    if (mel !== null) {
      const leadGain = chorus ? 0.22 : bridge ? 0.18 : 0.16;
      const leadDur = beat === 0 || beat === 4 ? 0.28 : 0.18;
      this.tone({
        freq: note(mel),
        when,
        dur: leadDur,
        type: 'triangle',
        gain: leadGain,
        bus: this.musicBus,
      });
      // slight detune twin for "gamey" width
      this.tone({
        freq: note(mel) * 1.004,
        when,
        dur: leadDur,
        type: 'triangle',
        gain: leadGain * 0.45,
        bus: this.musicBus,
      });
      // octave shimmer from lift onward
      if (!verse) {
        this.tone({
          freq: note(mel + 12),
          when,
          dur: leadDur * 0.85,
          type: 'sine',
          gain: chorus ? 0.08 : 0.05,
          bus: this.musicBus,
        });
      }
    }

    // ---- counter / harmony -------------------------------------------
    const ctr = COUNTER[step % COUNTER.length];
    if (ctr !== null) {
      this.tone({
        freq: note(ctr),
        when,
        dur: 0.16,
        type: 'square',
        gain: chorus ? 0.09 : 0.06,
        bus: this.musicBus,
      });
    }

    // ---- drums -------------------------------------------------------
    // kick on 1 & 3; extra kicks on build
    if (beat === 0 || beat === 4 || (build && (beat === 2 || beat === 6))) {
      this.noise({ when, dur: 0.11, gain: 0.26, filter: 160, bus: this.musicBus });
      this.tone({
        freq: 95,
        when,
        dur: 0.11,
        type: 'sine',
        gain: 0.38,
        slideTo: 42,
        bus: this.musicBus,
      });
    }
    // snare on 2 & 4; denser in chorus/bridge
    if (beat === 4 || (chorus && beat === 6) || (bridge && (beat === 2 || beat === 6))) {
      this.noise({
        when,
        dur: 0.09,
        gain: 0.2,
        filter: 3200,
        sweepTo: 800,
        bus: this.musicBus,
      });
    }
    // hats — light in verse, busy later
    if (verse) {
      if (beat % 2 === 1) {
        this.noise({ when, dur: 0.025, gain: 0.04, filter: 7500, bus: this.musicBus });
      }
    } else {
      this.noise({
        when,
        dur: beat % 2 === 0 ? 0.035 : 0.022,
        gain: beat % 2 === 0 ? 0.055 : 0.075,
        filter: 8000,
        bus: this.musicBus,
      });
    }
    // clap-ish layer on chorus downs
    if (chorus && (beat === 0 || beat === 4)) {
      this.noise({ when, dur: 0.06, gain: 0.12, filter: 4500, sweepTo: 1500, bus: this.musicBus });
    }

    // ---- fills -------------------------------------------------------
    // bar 7 → into chorus
    if (bar === 7 && beat >= 4) {
      this.noise({ when, dur: 0.045, gain: 0.1, filter: 3500, bus: this.musicBus });
      this.tone({
        freq: note(chord.triad[beat % 4] + 24),
        when,
        dur: 0.07,
        type: 'square',
        gain: 0.08,
        bus: this.musicBus,
      });
    }
    // bar 15 — snare roll + rising fanfare into loop restart
    if (bar === 15) {
      this.noise({
        when,
        dur: 0.04,
        gain: 0.08 + beat * 0.015,
        filter: 2800 + beat * 400,
        bus: this.musicBus,
      });
      if (beat >= 4) {
        this.tone({
          freq: note(chord.root + 12 + beat),
          when,
          dur: 0.08,
          type: 'square',
          gain: 0.1,
          bus: this.musicBus,
        });
      }
    }
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
