/**
 * The room: presence, readiness, and the authoritative match loop.
 *
 * One fixed room, two slots. Slot 0 is simulation team 0 (bottom of the board),
 * slot 1 is team 1 — each client is shown its own side at the bottom, so
 * everything addressed to slot 1 is rotated 180° on the way out and its taps
 * are rotated back on the way in (see `src/net/perspective.ts`).
 *
 * Only one instance runs `world.step()` at a time, decided by a short lease in
 * the store. When both sockets happen to be on this instance — the normal case
 * for two friends — nothing touches the store in the per-tick path.
 */

import { DEFAULT_BALANCE, sanitizeDeck } from '../src/balance/index';
import { flipPoint } from '../src/net/perspective';
import { viewEffectsAs, viewSnapshotAs } from '../src/net/perspective';
import type { ClientMsg, NetWorldSnapshot, ServerMsg, Slot } from '../src/net/protocol';
import { encode } from '../src/net/protocol';
import type { Balance, Effect, MatchResult } from '../src/sim/types';
import { Hand, World } from '../src/sim/world';
import type { RelayMsg, RoomState, Store } from './store';

/** Anything we can push a message down. Keeps `ws` out of this file. */
export interface Conn {
  send(data: string): void;
  close(): void;
  readonly alive: boolean;
}

const LEASE_TTL_MS = 5000;
const LEASE_RENEW_MS = 2000;
const WATCHDOG_MS = 1000;
/** Snapshot broadcast cadence — matches the sim tick rate. */
const BALANCE: Balance = DEFAULT_BALANCE;
const STEP_SEC = 1 / BALANCE.global.tickRate;
/** 3-2-1 shown on both clients before the match clock actually starts. */
const COUNTDOWN_MS = 3000;

interface LiveMatch {
  world: World;
  hands: [Hand, Hand];
  matchId: number;
  timer: ReturnType<typeof setInterval> | null;
}

export class Hub {
  private sockets = new Map<Slot, Conn>();
  private playerOf = new Map<Conn, { slot: Slot; playerId: string }>();
  private match: LiveMatch | null = null;
  private holdsLease = false;
  private leaseTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(
    private store: Store,
    private instanceId: string,
  ) {}

  async start() {
    if (this.started) return;
    this.started = true;
    await this.store.subscribe((msg) => void this.onRelay(msg));
    // Runs for the life of the instance — no handle to keep.
    setInterval(() => void this.tickWatchdog(), WATCHDOG_MS);
    console.log(`[claudeclash] hub ${this.instanceId} up (store: ${this.store.label})`);
  }

  // -------------------------------------------------------------- messaging

  private sendTo(slot: Slot, msg: ServerMsg) {
    const local = this.sockets.get(slot);
    if (local?.alive) {
      local.send(encode(msg));
      return;
    }
    // Socket lives on another instance — relay it.
    void this.store.publish({
      from: this.instanceId,
      kind: 'hand',
      slot,
      payload: msg,
    });
  }

  private sendBoth(build: (slot: Slot) => ServerMsg) {
    this.sendTo(0, build(0));
    this.sendTo(1, build(1));
  }

  private async onRelay(msg: RelayMsg) {
    if (msg.from === this.instanceId) return;

    switch (msg.kind) {
      case 'input': {
        // Only the authority applies input.
        if (!this.holdsLease || !this.match) return;
        const { slot, cardId, x, y } = msg.payload as {
          slot: Slot;
          cardId: string;
          x: number;
          y: number;
        };
        this.applyDeploy(slot, cardId, x, y);
        break;
      }
      case 'roomChanged':
        await this.broadcastRoomState();
        break;
      default: {
        // A message addressed to a socket that might be ours.
        const slot = msg.slot;
        if (slot === undefined) return;
        const local = this.sockets.get(slot);
        if (local?.alive && msg.payload) local.send(encode(msg.payload as ServerMsg));
      }
    }
  }

  // ------------------------------------------------------------- connection

  async onMessage(conn: Conn, msg: ClientMsg) {
    switch (msg.t) {
      case 'hello':
        await this.onHello(conn, msg.playerId);
        break;
      case 'setReady':
        await this.onSetReady(conn, msg.ready, msg.deck);
        break;
      case 'deploy':
        await this.onDeploy(conn, msg.cardId, msg.x, msg.y);
        break;
      case 'leave':
        await this.onLeave(conn);
        break;
      case 'pong':
        break;
    }
  }

  private async onHello(conn: Conn, playerId: string) {
    if (typeof playerId !== 'string' || playerId.length < 4 || playerId.length > 100) {
      conn.send(encode({ t: 'error', message: 'invalid playerId' }));
      conn.close();
      return;
    }

    let assigned: Slot | null = null;
    let resuming = false;

    const room = await this.store.mutate((r) => {
      const existing = r.slots.findIndex((s) => s?.playerId === playerId);
      if (existing >= 0) {
        assigned = existing as Slot;
        resuming = r.phase === 'match';
        r.slots[existing]!.connected = true;
        return;
      }
      const free = r.slots.findIndex((s) => s === null);
      if (free >= 0) {
        assigned = free as Slot;
        r.slots[free] = { playerId, connected: true, ready: false, deck: null };
      }
    });

    if (assigned === null) {
      conn.send(encode({ t: 'roomFull' }));
      conn.close();
      return;
    }
    const slot: Slot = assigned;

    // Same browser opening a second tab: the newcomer takes the slot.
    const previous = this.sockets.get(slot);
    if (previous && previous !== conn && previous.alive) {
      previous.send(encode({ t: 'kicked', reason: 'Você abriu o jogo em outra aba.' }));
      previous.close();
      this.playerOf.delete(previous);
    }

    this.sockets.set(slot, conn);
    this.playerOf.set(conn, { slot, playerId });

    console.log(`[claudeclash] slot${slot} joined${resuming ? ' (resuming a match)' : ''}`);

    conn.send(encode({ t: 'helloAck', slot, balance: BALANCE, resuming }));
    await this.broadcastRoomState(room);

    if (room.phase === 'match') {
      // Rejoining a match in progress — push their hand and current frame now
      // rather than making them wait for the next tick.
      if (this.holdsLease && this.match) {
        this.sendHand(slot);
        this.broadcastSnapshot();
      }
    }
  }

  private async onSetReady(conn: Conn, ready: boolean, deck?: string[]) {
    const who = this.playerOf.get(conn);
    if (!who) return;

    let clean: string[] | null = null;
    if (ready) {
      // Never trust a client-supplied deck.
      const filtered = sanitizeDeck(BALANCE, Array.isArray(deck) ? deck : []);
      if (filtered.length !== BALANCE.deckSize) {
        conn.send(encode({ t: 'error', message: 'Deck inválido.' }));
        return;
      }
      clean = filtered;
    }

    const room = await this.store.mutate((r) => {
      const s = r.slots[who.slot];
      if (!s) return;
      s.ready = ready;
      if (clean) s.deck = clean;
    });

    await this.broadcastRoomState(room);
    await this.maybeStartMatch(room);
  }

  private async onDeploy(conn: Conn, cardId: string, x: number, y: number) {
    const who = this.playerOf.get(conn);
    if (!who) return;
    if (typeof cardId !== 'string' || !Number.isFinite(x) || !Number.isFinite(y)) return;

    if (this.holdsLease && this.match) {
      this.applyDeploy(who.slot, cardId, x, y);
    } else {
      await this.store.publish({
        from: this.instanceId,
        kind: 'input',
        payload: { slot: who.slot, cardId, x, y },
      });
    }
  }

  /** Coordinates arrive in the sender's own perspective. */
  private applyDeploy(slot: Slot, cardId: string, x: number, y: number) {
    if (!this.match) return;
    // Countdown still running (timer isn't set until it ends) — no deploys yet.
    if (!this.match.timer) return;
    const p = slot === 1 ? flipPoint(x, y) : { x, y };
    const hand = this.match.hands[slot];
    // Not in their hand — either a stale tap or a tampered client.
    const index = hand.hand.indexOf(cardId);
    if (index < 0) return;
    if (!this.match.world.deploy(slot, cardId, p.x, p.y)) return;
    hand.play(index);
    this.sendHand(slot);
  }

  private async onLeave(conn: Conn) {
    await this.dropConn(conn);
  }

  async onDisconnect(conn: Conn) {
    await this.dropConn(conn);
  }

  /** Same handling for a deliberate exit and a dropped connection. */
  private async dropConn(conn: Conn) {
    const who = this.playerOf.get(conn);
    this.playerOf.delete(conn);
    if (!who) return;
    if (this.sockets.get(who.slot) === conn) this.sockets.delete(who.slot);

    const room = await this.store.mutate((r) => {
      const s = r.slots[who.slot];
      if (!s || s.playerId !== who.playerId) return;
      s.connected = false;
      if (r.phase === 'match') {
        // Sticky for the whole match — decides where both players go afterwards.
        r.hadDisconnect = true;
      } else {
        s.ready = false;
      }
      // In the lobby any disconnect frees the slot — otherwise a closed tab
      // would hold a seat forever and nobody else could ever join. During a
      // match the seat is kept so the player can reconnect into it.
      if (r.phase !== 'match') r.slots[who.slot] = null;
    });

    await this.broadcastRoomState(room);
  }

  // ------------------------------------------------------------- room state

  private async broadcastRoomState(known?: RoomState) {
    const room = known ?? (await this.store.getRoom());
    const count = room.slots.filter((s) => s?.connected).length as 0 | 1 | 2;
    const view = (s: RoomState['slots'][number]) =>
      s ? { connected: s.connected, ready: s.ready } : { connected: false, ready: false };

    for (const slot of [0, 1] as Slot[]) {
      const other = room.slots[slot === 0 ? 1 : 0];
      this.sendTo(slot, {
        t: 'roomState',
        count,
        you: view(room.slots[slot]),
        opponent: other ? view(other) : null,
        phase: room.phase,
      });
    }
    // Let the other instance refresh its own players' view too.
    if (this.store.label !== 'memory') {
      void this.store.publish({ from: this.instanceId, kind: 'roomChanged' });
    }
  }

  // ------------------------------------------------------------------ match

  private async maybeStartMatch(room: RoomState) {
    const [a, b] = room.slots;
    const bothReady = Boolean(a?.connected && a.ready && b?.connected && b.ready);
    if (!bothReady || room.phase !== 'lobby') return;

    const gotLease = await this.store.acquireLease(this.instanceId, LEASE_TTL_MS);
    if (!gotLease) return; // the other instance will start it

    const updated = await this.store.mutate((r) => {
      // Re-check under the lock — the other side may have raced us.
      if (r.phase !== 'lobby') return;
      const [x, y] = r.slots;
      if (!(x?.connected && x.ready && y?.connected && y.ready)) return;
      r.phase = 'match';
      r.hadDisconnect = false;
      r.matchId += 1;
    });
    if (updated.phase !== 'match') return;

    this.becomeAuthority();
    this.startMatch(updated);
  }

  private startMatch(room: RoomState) {
    const deckA = room.slots[0]?.deck ?? BALANCE.deck;
    const deckB = room.slots[1]?.deck ?? BALANCE.deck;

    this.match = {
      world: new World(BALANCE),
      hands: [new Hand(deckA), new Hand(deckB)],
      matchId: room.matchId,
      timer: null,
    };

    this.sendBoth(() => ({ t: 'matchStart' }));
    this.sendHand(0);
    this.sendHand(1);

    // Both clients run their own local 3-2-1 over the same span; holding the
    // real tick (and therefore every deploy — see `applyDeploy`) back by the
    // same duration keeps the two in lockstep without needing a wire-level
    // clock sync.
    const matchId = room.matchId;
    setTimeout(() => {
      // A reconnect/disconnect may have torn this match down while we waited.
      if (!this.match || this.match.matchId !== matchId) return;
      this.match.timer = setInterval(() => this.tickMatch(), STEP_SEC * 1000);
    }, COUNTDOWN_MS);
  }

  private sendHand(slot: Slot) {
    if (!this.match) return;
    const h = this.match.hands[slot];
    this.sendTo(slot, { t: 'hand', hand: [...h.hand], next: h.next });
  }

  private tickMatch() {
    const m = this.match;
    if (!m || !this.holdsLease) return;

    m.world.step(STEP_SEC);
    this.broadcastSnapshot();

    if (m.world.phase === 'over') void this.endMatch(m.world.result ?? 'draw');
  }

  private broadcastSnapshot() {
    const m = this.match;
    if (!m) return;
    const w = m.world;

    const snap: NetWorldSnapshot = {
      entities: w.entities,
      projectiles: w.projectiles,
      pendingSpells: w.pendingSpells,
      rageZones: w.rageZones,
      elixir: w.elixir,
      time: w.time,
      timeLeft: w.timeLeft,
      phase: w.phase,
      result: w.result,
      crowns: w.crowns,
      lastPlayed: w.lastPlayed,
    };
    // The renderer drains effects, so the server owns the only copy — take it
    // once here and hand the same list to both sides.
    const effects: Effect[] = w.effects.splice(0, w.effects.length);

    for (const slot of [0, 1] as Slot[]) {
      const flip = slot === 1;
      this.sendTo(slot, {
        t: 'snapshot',
        world: viewSnapshotAs(snap, flip),
        effects: viewEffectsAs(effects, flip),
      });
    }
  }

  private async endMatch(trueResult: MatchResult) {
    const m = this.match;
    if (!m) return;
    if (m.timer) clearInterval(m.timer);
    this.match = null;

    const room = await this.store.mutate((r) => {
      if (r.hadDisconnect) {
        // Someone dropped at some point this match — reset the room entirely.
        r.slots = [null, null];
        r.phase = 'lobby';
      } else {
        r.phase = 'lobby';
        for (const s of r.slots) if (s) s.ready = false;
      }
    });

    const routeTo = room.slots[0] === null && room.slots[1] === null ? 'home' : 'deckSelect';
    const crowns = m.world.crowns;

    for (const slot of [0, 1] as Slot[]) {
      const flip = slot === 1;
      this.sendTo(slot, {
        t: 'matchOver',
        result: flip
          ? trueResult === 'win'
            ? 'lose'
            : trueResult === 'lose'
              ? 'win'
              : 'draw'
          : trueResult,
        crowns: flip ? [crowns[1], crowns[0]] : [crowns[0], crowns[1]],
        routeTo,
      });
    }

    await this.store.clearSnapshot();
    await this.releaseAuthority();
    // Broadcast before forgetting the sockets, otherwise the final room state
    // has nowhere to go and clients are left showing a stale player count.
    await this.broadcastRoomState(room);

    if (routeTo === 'home') {
      // The room is empty now; these sockets must say `hello` again to rejoin.
      this.sockets.clear();
      this.playerOf.clear();
    }
  }

  // -------------------------------------------------------------- authority

  private becomeAuthority() {
    if (this.holdsLease) return;
    this.holdsLease = true;
    this.leaseTimer = setInterval(() => {
      void this.store.acquireLease(this.instanceId, LEASE_TTL_MS).then((ok) => {
        if (!ok) void this.releaseAuthority();
      });
    }, LEASE_RENEW_MS);
  }

  private async releaseAuthority() {
    if (this.leaseTimer) {
      clearInterval(this.leaseTimer);
      this.leaseTimer = null;
    }
    if (this.match?.timer) clearInterval(this.match.timer);
    if (this.holdsLease) await this.store.releaseLease(this.instanceId);
    this.holdsLease = false;
  }

  /**
   * Keeps authority attached to an instance that actually has a player. If the
   * authority died mid-match its in-memory `World` is gone; rather than freeze
   * the survivor we end the match cleanly and send everyone home.
   */
  private async tickWatchdog() {
    const haveLocalPlayer = [...this.sockets.values()].some((c) => c.alive);
    if (!haveLocalPlayer) {
      if (this.holdsLease && !this.match) await this.releaseAuthority();
      return;
    }

    const room = await this.store.getRoom();
    if (room.phase !== 'match') return;
    if (this.match) return; // already simulating

    const got = await this.store.acquireLease(this.instanceId, LEASE_TTL_MS);
    if (!got) return;

    console.warn('[claudeclash] took over an orphaned match — ending it and resetting the room.');
    this.becomeAuthority();
    await this.store.mutate((r) => {
      r.slots = [null, null];
      r.phase = 'lobby';
      r.hadDisconnect = false;
    });
    this.sendBoth(() => ({
      t: 'matchOver',
      result: 'draw',
      crowns: [0, 0],
      routeTo: 'home',
    }));
    this.sockets.clear();
    this.playerOf.clear();
    await this.releaseAuthority();
  }
}
