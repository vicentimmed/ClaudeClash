/**
 * Decks prontos da CPU.
 *
 * Um deck sorteado carta a carta quase nunca tem um plano — pode sair sem
 * condição de vitória, sem defesa aérea, ou com três cartas de 7 elixir. Estes
 * aqui são arquétipos fechados, e a IA joga bem melhor com eles porque as
 * sinergias de `knowledge.ts` finalmente têm com o que casar.
 *
 * A escolha é uniforme entre os cinco, e o deck vale para a partida inteira.
 * Uma parte das partidas ainda usa deck aleatório — ver `RANDOM_DECK_CHANCE`.
 */

import type { Balance } from '../types';

export interface BotDeck {
  id: string;
  name: string;
  /** Como a IA conduz a partida com esse deck. */
  archetype: 'cycle' | 'air_control' | 'heavy_beatdown' | 'control_counterpush' | 'siege_cycle';
  /** A carta em volta da qual o plano de ataque gira. */
  winCondition: string;
  cards: string[];
}

/** O deck usado quando o sorteio falha — o mais estável dos cinco. */
const DEFAULT_DECK_ID = 'hog_cycle_control';

export const BOT_DECKS: BotDeck[] = [
  {
    id: 'hog_cycle_control',
    name: 'Corredor Ciclo Rápido',
    archetype: 'cycle',
    winCondition: 'hogrider',
    cards: ['hogrider', 'skeletons', 'goblins', 'cannon', 'archers', 'knight', 'zap', 'fireball'],
  },
  {
    id: 'balloon_freeze_control',
    name: 'Balão + Congelamento',
    archetype: 'air_control',
    winCondition: 'balloon',
    cards: ['balloon', 'freeze', 'tesla', 'musketeer', 'knight', 'skeletons', 'tombstone', 'arrows'],
  },
  {
    id: 'golem_heavy_beatdown',
    name: 'Golem Beatdown Pesado',
    archetype: 'heavy_beatdown',
    winCondition: 'golem',
    cards: ['golem', 'witch', 'babydragon', 'wizard', 'minipekka', 'archers', 'zap', 'fireball'],
  },
  {
    id: 'pekka_control_counterpush',
    name: 'P.E.K.K.A Controle e Contra-Ataque',
    archetype: 'control_counterpush',
    winCondition: 'pekka',
    cards: ['pekka', 'musketeer', 'babydragon', 'archers', 'knight', 'tombstone', 'zap', 'arrows'],
  },
  {
    id: 'xbow_defensive_siege',
    name: 'X-Besta Cerco Defensivo',
    archetype: 'siege_cycle',
    winCondition: 'xbow',
    cards: ['xbow', 'tesla', 'knight', 'archers', 'skeletons', 'goblins', 'fireball', 'zap'],
  },
];

/** Com que frequência a CPU abre mão dos decks prontos e monta um na hora. */
const RANDOM_DECK_CHANCE = 0.25;

/** O deck que a CPU leva para a partida, com o plano que ele implica. */
export interface BotLoadout {
  /** id do preset, ou 'random' quando foi montado na hora */
  id: string;
  name: string;
  cards: string[];
  /** Null só num deck aleatório que saiu sem nenhuma carta de pressão. */
  winCondition: string | null;
  archetype: BotDeck['archetype'] | 'random';
}

/** Cartas que podem entrar num deck — as invocadas internamente ficam de fora. */
function selectable(balance: Balance): string[] {
  return Object.keys(balance.cards).filter((id) => !balance.cards[id].spawnOnly);
}

/**
 * Um preset só serve se todas as cartas existirem no balanceamento atual e o
 * tamanho bater — o painel de admin pode ter mexido em qualquer um dos dois.
 */
function usable(deck: BotDeck, balance: Balance): boolean {
  return (
    deck.cards.length === balance.deckSize &&
    deck.cards.every((id) => balance.cards[id] && !balance.cards[id].spawnOnly)
  );
}

function loadout(deck: BotDeck): BotLoadout {
  return {
    id: deck.id,
    name: deck.name,
    cards: [...deck.cards],
    winCondition: deck.winCondition,
    archetype: deck.archetype,
  };
}

export function randomDeck(balance: Balance): BotLoadout {
  const ids = selectable(balance);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const cards = ids.slice(0, balance.deckSize);
  // Mesmo sem plano pronto, a IA precisa saber em cima de que carta atacar:
  // a mais cara que ataca construções, ou a mais cara que sobrou.
  const pressure = cards
    .filter((id) => balance.cards[id].targets === 'buildings')
    .sort((a, b) => balance.cards[b].cost - balance.cards[a].cost);
  return {
    id: 'random',
    name: 'Deck aleatório',
    cards,
    winCondition: pressure[0] ?? null,
    archetype: 'random',
  };
}

/**
 * O deck com que a CPU entra na partida: um dos cinco prontos, ou um sorteado.
 * Se todos os presets estiverem inválidos para o balanceamento atual, cai no
 * deck aleatório em vez de entrar em campo com uma mão quebrada.
 */
export function pickBotDeck(balance: Balance): BotLoadout {
  const ready = BOT_DECKS.filter((d) => usable(d, balance));
  if (ready.length === 0) return randomDeck(balance);
  if (Math.random() < RANDOM_DECK_CHANCE) return randomDeck(balance);

  const pick = ready[Math.floor(Math.random() * ready.length)];
  if (pick) return loadout(pick);
  // Sorteio falhou (Math.random fora da faixa esperada): volta para o padrão.
  return loadout(ready.find((d) => d.id === DEFAULT_DECK_ID) ?? ready[0]);
}
