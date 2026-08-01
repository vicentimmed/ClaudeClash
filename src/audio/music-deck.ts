/**
 * Card Lounge — trilha do Deck Builder.
 * Jazz lo-fi a 92 BPM (8 compassos), bem diferente da Arena Anthem de batalha:
 * acordes maj7/m7, Rhodes suave, contrabaixo melódico, percussão leve de escovinha.
 */

const A2 = 110;
export const deckNote = (semitonesAboveA2: number) => A2 * Math.pow(2, semitonesAboveA2 / 12);

/** Dm7 → G7 → Cmaj7 → Am7 → Dm7 → Bbmaj7 → A7 → Dm7 */
export const DECK_PROGRESSION = [
  { root: 5, triad: [5, 8, 12, 16] }, // Dm7
  { root: 10, triad: [10, 14, 17, 21] }, // G7
  { root: 3, triad: [3, 7, 11, 14] }, // Cmaj7
  { root: 0, triad: [0, 3, 7, 10] }, // Am7
  { root: 5, triad: [5, 8, 12, 16] }, // Dm7
  { root: -3, triad: [-3, 1, 5, 8] }, // Bbmaj7
  { root: -1, triad: [-1, 2, 6, 9] }, // A7
  { root: 5, triad: [5, 8, 12, 16] }, // Dm7
];

/** Melodia de vibraphone — espaçada, só nos offbeats. `null` = silêncio. */
export const DECK_MELODY: (number | null)[] = [
  null, 14, null, 17, null, 19, null, 17,
  null, 15, null, 14, null, 12, null, 10,
  null, 10, null, 12, null, 14, null, 17,
  null, 19, null, 17, null, 15, null, 14,
  null, 12, null, 10, null, 12, null, 14,
  null, 15, null, 17, null, 19, null, 17,
  null, 15, null, 14, null, 12, null, 10,
  null, 12, null, 14, null, 15, null, 12,
];

/** Baixo melódico — uma nota por compasso, tom de jazz suave. */
export const DECK_BASS: number[] = [5, 10, 3, 0, 5, -3, -1, 5];

export const MUSIC_DECK = {
  note: deckNote,
  PROGRESSION: DECK_PROGRESSION,
  MELODY: DECK_MELODY,
  BASS: DECK_BASS,
  bpm: 92,
  stepsPerLoop: 64,
};
