import defaults from './cards.json';
import type { Balance } from '../sim/types';

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
    const valid = saved.deck.filter((id) => out.cards[id]);
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
  return out;
}

export function loadBalance(): Balance {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULT_BALANCE);
    return merge(DEFAULT_BALANCE, JSON.parse(raw) as Partial<Balance>);
  } catch {
    return clone(DEFAULT_BALANCE);
  }
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
