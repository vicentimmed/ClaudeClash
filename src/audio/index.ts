/**
 * All sound is synthesised with the Web Audio API — no asset files.
 *
 * Layout: master -> { musicBus, sfxBus }. The context starts suspended until
 * the first user gesture (browser autoplay policy), so call `unlock()` from a
 * click/touch handler before expecting anything audible.
 */

import { MUSIC_V3_BACKUP } from './music-v3-backup';
import { MUSIC_DECK } from './music-deck';

const STORAGE_KEY = 'claudeclash.audio.v1';

/** Arena Anthem (v3) na partida; Card Lounge no deck builder. */
export type MusicTrack = 'battle' | 'deck';

/**
 * Quanto a partida está apertada. 0 = normal, 1 = elixir 2x, 2 = elixir 3x /
 * prorrogação. Não troca de música: mantém a mesma harmonia e melodia e vai
 * acelerando o andamento e empilhando camadas, para a virada soar como parte
 * do arranjo em vez de um corte.
 */
export type MusicIntensity = 0 | 1 | 2;

/** Multiplicador de BPM por nível — 136 → 152 → 164. */
const INTENSITY_BPM = [1, 1.12, 1.21] as const;

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
  | 'crowdCheer'
  | 'elixirFull'
  | 'win'
  | 'lose'
  | 'countdown'
  | 'matchCountdown3'
  | 'matchCountdown2'
  | 'matchCountdown1'
  | 'uiTap';

interface Prefs {
  music: boolean;
  sfx: boolean;
}

/** Semitone offsets from A2 (110 Hz) for the notes we use. */
const A2 = 110;
const note = (semitonesAboveA2: number) => A2 * Math.pow(2, semitonesAboveA2 / 12);

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
  private pendingStart = false;
  /** Nível em vigor no arranjo — só muda no início de um compasso. */
  private intensity: MusicIntensity = 0;
  /** Nível pedido pelo jogo, aguardando a próxima barra para entrar. */
  private wantedIntensity: MusicIntensity = 0;

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
    if (this.pendingStart) {
      this.pendingStart = false;
      this.startMusic(this.track, { force: true });
    }
  }

  /** Identificador da trilha de batalha (útil para confirmar no console). */
  get battleMusicId() {
    return 'arena-anthem-v3';
  }

  get currentTrack() {
    return this.track;
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

  startMusic(track?: MusicTrack, opts?: { force?: boolean }) {
    if (track !== undefined) this.track = track;
    if (!this.ctx) {
      this.pendingStart = true;
      return;
    }
    const force = opts?.force ?? false;
    if (this.playingMusic && !force) return;
    this.stopMusic();
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

  // --------------------------------------------------------------- intensity

  /**
   * Sobe (ou desce) a tensão da trilha de batalha. A mudança fica pendente e só
   * entra na próxima barra, para cair no downbeat; um riser preenche exatamente
   * o intervalo até lá, avisando o jogador antes da virada.
   */
  setMusicIntensity(level: MusicIntensity) {
    if (level === this.wantedIntensity) return;
    const rising = level > this.wantedIntensity;
    this.wantedIntensity = level;

    // fora da batalha (ou sem áudio ainda) não há o que anunciar: aplica direto
    if (!this.ctx || !this.playingMusic || this.track !== 'battle') {
      this.intensity = level;
      return;
    }
    if (rising) this.scheduleRiser();
  }

  get musicIntensity(): MusicIntensity {
    return this.intensity;
  }

  /** Ruído + tom subindo que ocupa o tempo restante até a próxima barra. */
  private scheduleRiser() {
    const ctx = this.ctx;
    if (!ctx || !this.prefs.music) return;
    const stepsToBar = (8 - (this.step % 8)) % 8 || 8;
    const landsAt = this.nextNoteTime + (stepsToBar - 1) * this.stepDur;
    const dur = landsAt - ctx.currentTime;
    if (dur <= 0.05) return;

    this.noise({
      when: ctx.currentTime,
      dur,
      gain: 0.09,
      filter: 300,
      sweepTo: 6000,
      bus: this.musicBus,
    });
    this.tone({
      freq: note(-12),
      when: ctx.currentTime,
      dur,
      type: 'sawtooth',
      gain: 0.07,
      slideTo: note(12),
      attack: dur * 0.7,
      bus: this.musicBus,
    });
    // crash marcando o downbeat da virada
    this.noise({ when: landsAt, dur: 0.5, gain: 0.16, filter: 7000, sweepTo: 1200, bus: this.musicBus });
  }

  /** Classic Web Audio lookahead scheduler: queue anything due in the next 120 ms. */
  private scheduleAhead() {
    const ctx = this.ctx;
    if (!ctx) return;
    const stepsPerLoop = this.stepsPerLoop;
    while (this.nextNoteTime < ctx.currentTime + 0.12) {
      // a virada de intensidade sempre cai no primeiro tempo de um compasso
      if (this.step % 8 === 0) this.intensity = this.wantedIntensity;
      if (this.track === 'deck') this.scheduleDeckStep(this.step, this.nextNoteTime);
      else this.scheduleBattleStep(this.step, this.nextNoteTime);
      this.nextNoteTime += this.stepDur;
      this.step = (this.step + 1) % stepsPerLoop;
    }
  }

  private get stepDur() {
    if (this.track === 'deck') return 60 / MUSIC_DECK.bpm / 2;
    return 60 / (MUSIC_V3_BACKUP.bpm * INTENSITY_BPM[this.intensity]) / 2;
  }

  private get stepsPerLoop() {
    return this.track === 'deck' ? MUSIC_DECK.stepsPerLoop : MUSIC_V3_BACKUP.stepsPerLoop;
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
    const bar = Math.floor(step / 8) % MUSIC_V3_BACKUP.PROGRESSION.length;
    const beat = step % 8;
    const chord = MUSIC_V3_BACKUP.PROGRESSION[bar];
    const verse = bar < 4;
    const chorus = bar >= 8 && bar < 12;
    const bridge = bar >= 12;
    const build = bar >= 14;

    // ---- gallop bass -------------------------------------------------
    const bassOff = MUSIC_V3_BACKUP.BASS_PATTERN[beat];
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

    // ---- lead melody -------------------------------------------------
    const mel = MUSIC_V3_BACKUP.MELODY[step % MUSIC_V3_BACKUP.MELODY.length];
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
      this.tone({
        freq: note(mel) * 1.004,
        when,
        dur: leadDur,
        type: 'triangle',
        gain: leadGain * 0.45,
        bus: this.musicBus,
      });
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

    const ctr = MUSIC_V3_BACKUP.COUNTER[step % MUSIC_V3_BACKUP.COUNTER.length];
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
    if (chorus && (beat === 0 || beat === 4)) {
      this.noise({ when, dur: 0.06, gain: 0.12, filter: 4500, sweepTo: 1500, bus: this.musicBus });
    }

    // ---- fills -------------------------------------------------------
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

    // ---- camadas de tensão (elixir 2x / 3x) --------------------------
    // A harmonia e a melodia não mudam; o que entra aqui é pressão rítmica.
    if (this.intensity >= 1) {
      // bumbo nos tempos que antes ficavam vazios — pulso constante
      if (beat === 2 || beat === 6) {
        this.tone({
          freq: 88,
          when,
          dur: 0.09,
          type: 'sine',
          gain: 0.28,
          slideTo: 40,
          bus: this.musicBus,
        });
      }
      // baixo preenche os buracos do padrão de galope
      if (bassOff === null) {
        this.tone({
          freq: note(chord.root - 12),
          when,
          dur: 0.09,
          type: 'triangle',
          gain: 0.16,
          bus: this.musicBus,
        });
      }
      // trêmolo na quinta: é daqui que vem a sensação de aperto
      this.tone({
        freq: note(chord.root + 7),
        when,
        dur: this.stepDur * 1.1,
        type: 'sawtooth',
        gain: beat % 2 === 0 ? 0.05 : 0.028,
        bus: this.musicBus,
      });
      // chimbal em todas as semicolcheias
      this.noise({ when, dur: 0.02, gain: 0.045, filter: 9000, bus: this.musicBus });
    }

    if (this.intensity >= 2) {
      // pedal na dominante (E) que nunca resolve
      if (beat === 0 || beat === 3 || beat === 6) {
        this.tone({
          freq: note(7),
          when,
          dur: 0.12,
          type: 'square',
          gain: 0.06,
          bus: this.musicBus,
        });
      }
      // tons graves sincopados
      if (beat === 3 || beat === 7) {
        this.noise({ when, dur: 0.08, gain: 0.13, filter: 420, sweepTo: 150, bus: this.musicBus });
      }
      // melodia dobrada uma oitava acima
      if (mel !== null) {
        this.tone({
          freq: note(mel + 12),
          when,
          dur: 0.14,
          type: 'square',
          gain: 0.065,
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
      case 'crowdCheer': {
        // Plateia eufórica em três camadas: o rugido de fundo, as palmas e um
        // "uhhh" de multidão desafinado por cima. Entra logo depois do
        // estrondo da torre, como uma reação — não junto com ele.
        const t0 = t + 0.12;
        this.noise({ when: t0, dur: 2.4, gain: 0.5, filter: 500, sweepTo: 1500 });
        this.noise({ when: t0 + 0.15, dur: 1.9, gain: 0.3, filter: 1800, sweepTo: 900 });
        // palmas: grãos curtos de ruído rareando ao longo da cauda
        for (let i = 0; i < 46; i++) {
          const k = i / 46;
          const when = t0 + 0.1 + k * 1.8 + Math.random() * 0.06;
          this.noise({ when, dur: 0.035, gain: 0.14 * (1 - k * 0.7), filter: 4200 });
        }
        // vozes: quatro parciais desafinadas, entrando escalonadas
        [262, 318, 392, 466].forEach((freq, i) => {
          this.tone({
            freq: freq * (0.97 + Math.random() * 0.06),
            when: t0 + 0.14 + i * 0.05,
            dur: 1.5,
            type: 'triangle',
            gain: 0.09,
            attack: 0.28,
            slideTo: freq * 0.86,
          });
        });
        break;
      }
      case 'elixirFull':
        this.tone({ freq: 880, when: t, dur: 0.1, type: 'sine', gain: 0.2 });
        this.tone({ freq: 1320, when: t + 0.08, dur: 0.14, type: 'sine', gain: 0.16 });
        break;
      case 'countdown':
        this.tone({ freq: 740, when: t, dur: 0.12, type: 'square', gain: 0.22 });
        break;
      case 'matchCountdown3':
        this.tone({ freq: note(0), when: t, dur: 0.2, type: 'square', gain: 0.26 });
        this.tone({ freq: note(0) * 2, when: t, dur: 0.16, type: 'sine', gain: 0.12 });
        break;
      case 'matchCountdown2':
        this.tone({ freq: note(3), when: t, dur: 0.2, type: 'square', gain: 0.28 });
        this.tone({ freq: note(3) * 2, when: t, dur: 0.16, type: 'sine', gain: 0.13 });
        break;
      case 'matchCountdown1':
        this.tone({ freq: note(7), when: t, dur: 0.24, type: 'square', gain: 0.3 });
        this.tone({ freq: note(7) * 2, when: t, dur: 0.2, type: 'sine', gain: 0.15 });
        this.tone({ freq: note(19), when: t + 0.05, dur: 0.35, type: 'triangle', gain: 0.22 });
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
