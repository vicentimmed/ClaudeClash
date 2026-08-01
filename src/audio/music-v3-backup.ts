/**
 * Arena Anthem v3 (16 compassos, 136 BPM) — trilha de batalha na partida.
 * Backup da v4 (Clash Storm): music-battle.ts foi removida.
 */

const A2 = 110;
const note = (semitonesAboveA2: number) => A2 * Math.pow(2, semitonesAboveA2 / 12);

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

const COUNTER: (number | null)[] = [
  null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
  null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
  8, 12, 15, 19, null, 17, 15, 12, 12, null, 15, 12, 17, 15, 14, 12,
  12, 14, 15, 17, 19, 17, 15, 14, 12, 10, 8, 7, 8, 10, 12, 14,
  22, null, 19, 17, 19, null, 17, 15, 17, 19, 22, 19, 17, 15, 14, 12,
  15, null, 17, 15, 19, null, 17, 15, 14, 12, 10, 12, 14, 17, 15, 14,
  null, 15, null, 19, null, 17, null, 14, null, 12, null, 17, null, 19, null, 15,
  15, null, 19, null, 20, null, 17, null, 17, 19, 22, 24, 22, 20, 19, 17,
];

const BASS_PATTERN: (number | null)[] = [-12, null, -12, -5, -12, null, -12, 0];

export const MUSIC_V3_BACKUP = {
  note,
  PROGRESSION,
  MELODY,
  COUNTER,
  BASS_PATTERN,
  bpm: 136,
  stepsPerLoop: 128,
};
