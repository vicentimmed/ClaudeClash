/**
 * Backup da música v1 (loop Am–F–C–G a 104 BPM).
 * Extraída de index.ts antes da troca pela v2 épica.
 * Não é importada em runtime — só referência para restaurar se precisar.
 */

/** Semitone offsets from A2 (110 Hz). */
const A2 = 110;
const note = (semitonesAboveA2: number) => A2 * Math.pow(2, semitonesAboveA2 / 12);

/** Four-bar loop in A minor: Am - F - C - G. */
const PROGRESSION = [
  { root: 0, triad: [0, 3, 7, 12] },
  { root: -4, triad: [-4, 0, 3, 8] },
  { root: 3, triad: [3, 7, 10, 15] },
  { root: -2, triad: [-2, 2, 5, 10] },
];

/** eighth notes at 104 bpm */
const STEP_DUR = 60 / 104 / 2;

/**
 * Pseudocódigo do scheduleStep antigo (copiar de volta em GameAudio se restaurar):
 *
 * step % 32, bar = floor(step/8) % 4, beat = step % 8
 * - bass triangle em beat 0 e 4 (root - 12)
 * - arpeggio square em todos os eighths: [0,2,1,3,2,1,3,2]
 * - pad sine no beat 0 (triad[0] e triad[2])
 * - kick noise em 0/4; hat noise em odd beats
 */
export const MUSIC_V1_BACKUP = {
  note,
  PROGRESSION,
  STEP_DUR,
  bpm: 104,
  stepsPerLoop: 32,
};
