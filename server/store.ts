/**
 * Shared room state + cross-instance messaging.
 *
 * Vercel doesn't guarantee that both players' WebSockets land on the same
 * function instance, so anything two instances must agree on lives here.
 *
 * Two implementations:
 *  - `MemoryStore`  — single process. Used for local dev and as the fallback
 *                     when no REDIS_URL is configured. Correct whenever both
 *                     players happen to share one instance (the normal case at
 *                     this scale), and needs zero setup.
 *  - `RedisStore`   — correct across instances. Enabled by setting REDIS_URL.
 *
 * The hot path avoids the store entirely: when both sockets are on this
 * instance, snapshots are written straight to them (see `server/hub.ts`).
 */

import type { Slot } from '../src/net/protocol';

export interface SlotState {
  playerId: string;
  connected: boolean;
  ready: boolean;
  deck: string[] | null;
}

export interface RoomState {
  slots: [SlotState | null, SlotState | null];
  phase: 'lobby' | 'match';
  /** Sticky for the duration of one match — drives post-match routing. */
  hadDisconnect: boolean;
  /** Bumped on every match start so stale messages can be discarded. */
  matchId: number;
}

export const EMPTY_ROOM: RoomState = {
  slots: [null, null],
  phase: 'lobby',
  hadDisconnect: false,
  matchId: 0,
};

/** Envelope for anything relayed between instances. */
export interface RelayMsg {
  /** Instance that published it, so we can ignore our own echo. */
  from: string;
  kind: 'input' | 'snapshot' | 'roomChanged' | 'hand' | 'matchStart' | 'matchOver' | 'kick';
  /** Which slot this concerns / is addressed to. */
  slot?: Slot;
  payload?: unknown;
}

export interface Store {
  readonly label: string;
  getRoom(): Promise<RoomState>;
  /** Read–modify–write under a lock so concurrent updates can't clobber. */
  mutate(fn: (room: RoomState) => void | Promise<void>): Promise<RoomState>;
  /** Try to become the sim authority. Returns true if held. */
  acquireLease(owner: string, ttlMs: number): Promise<boolean>;
  releaseLease(owner: string): Promise<void>;
  saveSnapshot(json: string): Promise<void>;
  loadSnapshot(): Promise<string | null>;
  clearSnapshot(): Promise<void>;
  publish(msg: RelayMsg): Promise<void>;
  subscribe(handler: (msg: RelayMsg) => void): Promise<void>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------- in-memory

export class MemoryStore implements Store {
  readonly label = 'memory';
  private room: RoomState = structuredClone(EMPTY_ROOM);
  private lease: { owner: string; expires: number } | null = null;
  private snapshot: string | null = null;
  private handlers: Array<(msg: RelayMsg) => void> = [];
  private chain: Promise<unknown> = Promise.resolve();

  async getRoom(): Promise<RoomState> {
    return structuredClone(this.room);
  }

  /** Serialised through a promise chain so mutations can't interleave. */
  async mutate(fn: (room: RoomState) => void | Promise<void>): Promise<RoomState> {
    const run = this.chain.then(async () => {
      await fn(this.room);
      return structuredClone(this.room);
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  async acquireLease(owner: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    if (this.lease && this.lease.owner !== owner && this.lease.expires > now) return false;
    this.lease = { owner, expires: now + ttlMs };
    return true;
  }

  async releaseLease(owner: string): Promise<void> {
    if (this.lease?.owner === owner) this.lease = null;
  }

  async saveSnapshot(json: string): Promise<void> {
    this.snapshot = json;
  }
  async loadSnapshot(): Promise<string | null> {
    return this.snapshot;
  }
  async clearSnapshot(): Promise<void> {
    this.snapshot = null;
  }

  // Single process: nothing to relay, everything is already local.
  async publish(): Promise<void> {}
  async subscribe(handler: (msg: RelayMsg) => void): Promise<void> {
    this.handlers.push(handler);
  }
  async close(): Promise<void> {
    this.handlers = [];
  }
}

// -------------------------------------------------------------------- redis

const KEY = {
  room: 'cc:room',
  lease: 'cc:lease',
  snapshot: 'cc:snapshot',
  channel: 'cc:events',
} as const;

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, val: string, ...args: unknown[]): Promise<unknown>;
  del(key: string): Promise<unknown>;
  eval(script: string, numKeys: number, ...args: unknown[]): Promise<unknown>;
  publish(channel: string, message: string): Promise<unknown>;
  subscribe(channel: string): Promise<unknown>;
  on(event: string, cb: (...args: never[]) => void): unknown;
  quit(): Promise<unknown>;
  duplicate(): RedisLike;
}

export class RedisStore implements Store {
  readonly label = 'redis';
  private sub: RedisLike | null = null;

  constructor(private redis: RedisLike) {}

  async getRoom(): Promise<RoomState> {
    const raw = await this.redis.get(KEY.room);
    if (!raw) return structuredClone(EMPTY_ROOM);
    try {
      return JSON.parse(raw) as RoomState;
    } catch {
      return structuredClone(EMPTY_ROOM);
    }
  }

  /**
   * Optimistic lock via a short-lived mutex key. At two players contention is
   * effectively nil, but this still rules out one instance clobbering the
   * other's `ready` flag — which would silently hang the match start.
   */
  async mutate(fn: (room: RoomState) => void | Promise<void>): Promise<RoomState> {
    const token = `${Date.now()}-${Math.random()}`;
    const lockKey = `${KEY.room}:lock`;
    for (let attempt = 0; attempt < 50; attempt++) {
      const got = await this.redis.set(lockKey, token, 'PX', 2000, 'NX');
      if (got) {
        try {
          const room = await this.getRoom();
          await fn(room);
          await this.redis.set(KEY.room, JSON.stringify(room));
          return room;
        } finally {
          await this.redis.eval(
            `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`,
            1,
            lockKey,
            token,
          );
        }
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    // Lock never freed (a crashed holder); proceed unlocked rather than hang.
    const room = await this.getRoom();
    await fn(room);
    await this.redis.set(KEY.room, JSON.stringify(room));
    return room;
  }

  async acquireLease(owner: string, ttlMs: number): Promise<boolean> {
    const held = await this.redis.eval(
      `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("pexpire",KEYS[1],ARGV[2]) else return 0 end`,
      1,
      KEY.lease,
      owner,
      String(ttlMs),
    );
    if (held) return true;
    const got = await this.redis.set(KEY.lease, owner, 'PX', ttlMs, 'NX');
    return Boolean(got);
  }

  async releaseLease(owner: string): Promise<void> {
    await this.redis.eval(
      `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`,
      1,
      KEY.lease,
      owner,
    );
  }

  async saveSnapshot(json: string): Promise<void> {
    await this.redis.set(KEY.snapshot, json, 'PX', 60000);
  }
  async loadSnapshot(): Promise<string | null> {
    return this.redis.get(KEY.snapshot);
  }
  async clearSnapshot(): Promise<void> {
    await this.redis.del(KEY.snapshot);
  }

  async publish(msg: RelayMsg): Promise<void> {
    await this.redis.publish(KEY.channel, JSON.stringify(msg));
  }

  async subscribe(handler: (msg: RelayMsg) => void): Promise<void> {
    // A connection in subscribe mode can't run commands, so it needs its own.
    const sub = this.redis.duplicate();
    this.sub = sub;
    sub.on('message', ((_channel: string, raw: string) => {
      try {
        handler(JSON.parse(raw) as RelayMsg);
      } catch {
        /* ignore malformed relay traffic */
      }
    }) as never);
    await sub.subscribe(KEY.channel);
  }

  async close(): Promise<void> {
    await this.sub?.quit().catch(() => undefined);
    await this.redis.quit().catch(() => undefined);
  }
}

/**
 * Picks the store from the environment. Any of the usual Vercel/Upstash Redis
 * URL variables switches on the cross-instance implementation.
 */
export async function createStore(): Promise<Store> {
  const url =
    process.env.REDIS_URL ??
    process.env.KV_URL ??
    process.env.UPSTASH_REDIS_URL ??
    process.env.STORAGE_REDIS_URL;

  if (!url) {
    console.warn(
      '[claudeclash] No REDIS_URL — using in-memory room state. Fine for local dev and ' +
        'for two players on one instance; set REDIS_URL to make it correct across instances.',
    );
    return new MemoryStore();
  }

  try {
    const { default: Redis } = (await import('ioredis')) as unknown as {
      default: new (url: string, opts?: Record<string, unknown>) => RedisLike;
    };
    const client = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: false });
    console.log('[claudeclash] Redis store enabled.');
    return new RedisStore(client);
  } catch (err) {
    console.error('[claudeclash] Redis unavailable, falling back to memory:', err);
    return new MemoryStore();
  }
}
