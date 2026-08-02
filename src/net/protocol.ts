/**
 * The wire contract between browser and server.
 *
 * Types only — no runtime code — so both the Vite bundle and the Node function
 * import the exact same declarations and can never drift apart.
 *
 * Perspective rule: the server always presents the recipient as slot 0 (bottom
 * of the board). Everything team-indexed in a `snapshot`/`roomState`/`matchOver`
 * has already been rotated and relabelled for whoever receives it, so client
 * code can keep assuming "team 0 is me" exactly like the local bot match does.
 */

import type {
  Balance,
  Effect,
  Entity,
  MatchPhase,
  MatchResult,
  PendingSpell,
  Projectile,
  RageZone,
} from '../sim/types';

/** Room slots. Wire-level only — the recipient always sees itself as 0. */
export type Slot = 0 | 1;

export interface SlotView {
  connected: boolean;
  ready: boolean;
}

/** The fields of `World` a client needs in order to draw a frame. */
export interface NetWorldSnapshot {
  entities: Entity[];
  projectiles: Projectile[];
  pendingSpells: PendingSpell[];
  rageZones: RageZone[];
  elixir: [number, number];
  time: number;
  timeLeft: number;
  phase: MatchPhase;
  result: MatchResult | null;
  crowns: [number, number];
  lastPlayed: [string | null, string | null];
}

export type ClientMsg =
  /** First message on every (re)connection. Identifies the browser. */
  | { t: 'hello'; playerId: string }
  /** `deck` is required whenever `ready` is true. */
  | { t: 'setReady'; ready: boolean; deck?: string[] }
  /** Intent to play a card. Coordinates are in this client's own perspective. */
  | { t: 'deploy'; cardId: string; x: number; y: number }
  /** Deliberately leaving — frees the slot without waiting for a timeout. */
  | { t: 'leave' }
  /** Keepalive so the server can tell "still here" from "silently dead". */
  | { t: 'pong' };

export type ServerMsg =
  /** Sent once per connection. `balance` is the server's authoritative card data. */
  | { t: 'helloAck'; slot: Slot; balance: Balance; resuming: boolean }
  | { t: 'roomFull' }
  | {
      t: 'roomState';
      count: 0 | 1 | 2;
      you: SlotView;
      opponent: SlotView | null;
      phase: 'lobby' | 'match';
    }
  /** Private to the owning slot — never broadcast. */
  | { t: 'hand'; hand: string[]; next: string }
  | { t: 'matchStart' }
  | { t: 'snapshot'; world: NetWorldSnapshot; effects: Effect[] }
  | {
      t: 'matchOver';
      result: MatchResult;
      crowns: [number, number];
      routeTo: 'deckSelect' | 'home';
    }
  /** Server-initiated boot (e.g. the same playerId opened another tab). */
  | { t: 'kicked'; reason: string }
  | { t: 'ping' }
  | { t: 'error'; message: string };

export function encode(msg: ClientMsg | ServerMsg): string {
  return JSON.stringify(msg);
}

/** Returns null instead of throwing — network input is never trusted. */
export function decode<T extends ClientMsg | ServerMsg>(raw: string): T | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof (parsed as { t?: unknown }).t !== 'string') return null;
    return parsed as T;
  } catch {
    return null;
  }
}
