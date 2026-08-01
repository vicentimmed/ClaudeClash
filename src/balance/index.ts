import defaults from './cards.json';
import type { Balance, UnitShape } from '../sim/types';

/** Swarm cards use a group icon in the deck builder; arena units render individually. */
const CARD_ART_SHAPE: Record<string, UnitShape> = {
  minions: 'minions',
  goblins: 'goblins',
  skeleton_army: 'skeleton_army',
};

const STORAGE_KEY = 'claudeclash.balance.v1';

export const DEFAULT_BALANCE = defaults as unknown as Balance;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Shallow-merge saved values over the defaults so new fields keep working. */
function merge(base: Balance, saved: Partial<Balance>): Balance {
  const out = clone(base);
  if (saved.global) Object.assign(out.global, saved.global);
  if (typeof saved.deckSize === 'number') out.deckSize = saved.deckSize;
  if (Array.isArray(saved.deck)) {
    const valid = sanitizeDeck(out, saved.deck.filter((id) => out.cards[id]));
    if (valid.length === out.deckSize) out.deck = valid;
  }
  if (saved.towers) {
    Object.assign(out.towers.princess, saved.towers.princess ?? {});
    Object.assign(out.towers.king, saved.towers.king ?? {});
  }
  if (saved.cards) {
    for (const [id, card] of Object.entries(saved.cards)) {
      if (!out.cards[id] || !card) continue;
      const { visual, ...rest } = card;
      Object.assign(out.cards[id], rest);
      if (visual) Object.assign(out.cards[id].visual, visual);
    }
  }
  return migrateBalance(out);
}

/** Fix legacy saves that stored the arena unit shape on swarm card icons. */
function migrateBalance(balance: Balance): Balance {
  for (const [id, shape] of Object.entries(CARD_ART_SHAPE)) {
    const card = balance.cards[id];
    if (card && card.visual.shape !== shape) card.visual.shape = shape;
  }
  if (balance.cards.zap?.name === 'Choque') {
    balance.cards.zap.name = DEFAULT_BALANCE.cards.zap.name;
  }
  if (balance.cards.wizard?.name === 'Bruxo') {
    balance.cards.wizard.name = DEFAULT_BALANCE.cards.wizard.name;
  }
  return balance;
}

export function loadBalance(): Balance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return migrateBalance(clone(DEFAULT_BALANCE));
    return merge(DEFAULT_BALANCE, JSON.parse(raw) as Partial<Balance>);
  } catch {
    return migrateBalance(clone(DEFAULT_BALANCE));
  }
}

/** Shape used when rendering a card's icon (deck builder, HUD). */
export function cardArtShape(cardId: string, shape: UnitShape): UnitShape {
  return CARD_ART_SHAPE[cardId] ?? shape;
}

export function saveBalance(balance: Balance) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(balance));
}

export function resetBalance() {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasCustomBalance(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

const DECK_KEY = 'claudeclash.deck.v1';

/**
 * The deck the player last actually confirmed with "Jogar" — separate from
 * `balance.deck` so the deck builder can tell "never played before" (show
 * empty slots) from "played once" (show what they picked last time).
 */
export function loadSavedDeck(): string[] | null {
  try {
    const raw = localStorage.getItem(DECK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')
      ? (parsed as string[])
      : null;
  } catch {
    return null;
  }
}

export function saveDeck(deck: string[]) {
  try {
    localStorage.setItem(DECK_KEY, JSON.stringify(deck));
  } catch {
    /* private mode — just don't persist */
  }
}

/** Cards the player can pick in the deck builder — excludes internal spawn units. */
export function deckSelectableIds(balance: Balance): string[] {
  return Object.keys(balance.cards).filter((id) => !balance.cards[id].spawnOnly);
}

/** Strip spawn-only cards from a saved deck (e.g. legacy saves). */
export function sanitizeDeck(balance: Balance, deck: string[]): string[] {
  return deck.filter((id) => balance.cards[id] && !balance.cards[id].spawnOnly);
}
