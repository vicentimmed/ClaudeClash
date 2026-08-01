/**
 * Backup da música v2 (8 compassos, 128 BPM, Am–G–F–E | Am–C–F–G).
 * Extraída de index.ts antes da troca pela v3.
 * Não é importada em runtime — só referência para restaurar se precisar.
 */

const A2 = 110;
const note = (semitonesAboveA2: number) => A2 * Math.pow(2, semitonesAboveA2 / 12);

const PROGRESSION = [
  { root: 0, triad: [0, 3, 7, 12] }, // Am
  { root: -2, triad: [-2, 2, 5, 10] }, // G
  { root: -4, triad: [-4, 0, 3, 8] }, // F
  { root: -5, triad: [-5, -1, 2, 7] }, // E
  { root: 0, triad: [0, 3, 7, 12] }, // Am
  { root: 3, triad: [3, 7, 10, 15] }, // C
  { root: -4, triad: [-4, 0, 3, 8] }, // F
  { root: -2, triad: [-2, 2, 5, 10] }, // G
];

const MELODY: (number | null)[] = [
  12, null, 15, 12, 19, 17, 15, 12, 10, null, 12, 10, 17, 15, 14, 10,
  8, null, 12, 8, 15, 14, 12, 8, 7, 10, 14, 19, 17, 14, 12, 7,
  12, 15, 19, 24, 22, 19, 17, 15, 15, null, 17, 15, 22, 19, 17, 15,
  12, 8, 12, 15, 17, 15, 12, 8, 10, 14, 17, 22, 19, 17, 14, 12,
];

/**
 * scheduleStep v2 (resumo):
 * - bass triangle em even beats (+ syncopation bars 6–7)
 * - pad sawtooth root+5th + square stab no beat 0
 * - arpeggio square [0,2,1,3,2,0,3,1]
 * - lead triangle MELODY + sine oitava bars 4+
 * - kick 0/4, snare 4 (+6 no build), hats odd, fill bar 7
 */
export const MUSIC_V2_BACKUP = {
  note,
  PROGRESSION,
  MELODY,
  bpm: 128,
  stepsPerLoop: 64,
};
