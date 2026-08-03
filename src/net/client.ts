/**
 * The browser side of the socket: connection, identity and auto-reconnect.
 *
 * Vercel closes a WebSocket when the underlying function hits its duration cap
 * (5 minutes on the free plan), so dropping and coming back is routine, not
 * exceptional. Reconnecting re-sends `hello` with the same stored id, which is
 * how the server puts the player back in their slot — the same path that
 * handles a real network drop mid-match.
 */

import type { ClientMsg, ServerMsg } from './protocol';
import { decode, encode } from './protocol';

const PLAYER_ID_KEY = 'claudeclash.playerId.v1';

/**
 * Stable per-browser id. Not an account — just "this is the same person",
 * so a reconnect lands back in the same slot.
 *
 * `?player=<name>` overrides it for that tab only. Two normal tabs share one
 * localStorage and would therefore be the *same* player (the newer one taking
 * the slot); the override is what lets you open two windows and play against
 * yourself, which is also how this gets tested.
 */
export function getPlayerId(): string {
  const override = new URLSearchParams(location.search).get('player');
  if (override && override.trim().length >= 1) return `url:${override.trim()}`;

  try {
    const saved = localStorage.getItem(PLAYER_ID_KEY);
    if (saved && saved.length >= 8) return saved;
    const fresh =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(PLAYER_ID_KEY, fresh);
    return fresh;
  } catch {
    // Private mode: a per-session id still works, it just won't survive reload.
    return `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export type NetStatus = 'idle' | 'connecting' | 'online' | 'reconnecting';

export interface NetCallbacks {
  onMessage: (msg: ServerMsg) => void;
  onStatus: (status: NetStatus) => void;
}

function serverUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/api/ws`;
}

export class NetworkClient {
  private ws: WebSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 500;
  /** True between `connect()` and `leave()` — gates the reconnect loop. */
  private wanted = false;
  private status: NetStatus = 'idle';
  readonly playerId = getPlayerId();

  constructor(private cb: NetCallbacks) {}

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect() {
    this.wanted = true;
    this.open();
  }

  private setStatus(s: NetStatus) {
    if (this.status === s) return;
    this.status = s;
    this.cb.onStatus(s);
  }

  private open() {
    if (!this.wanted) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.setStatus(this.retryDelay > 500 ? 'reconnecting' : 'connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(serverUrl());
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;

    ws.addEventListener('open', () => {
      // The socket may finish opening after `leave()` — ignore stale connects.
      if (!this.wanted || this.ws !== ws) return;
      this.retryDelay = 500;
      this.setStatus('online');
      // Identifying immediately is what makes a reconnect resume the slot.
      this.send({ t: 'hello', playerId: this.playerId });
    });

    ws.addEventListener('message', (ev) => {
      const msg = decode<ServerMsg>(typeof ev.data === 'string' ? ev.data : '');
      if (!msg) return;
      if (msg.t === 'ping') {
        this.send({ t: 'pong' });
        return;
      }
      // The server tells us to stop trying in these two cases.
      if (msg.t === 'roomFull' || msg.t === 'kicked') this.wanted = false;
      this.cb.onMessage(msg);
    });

    const dropped = () => {
      if (this.ws === ws) this.ws = null;
      if (this.wanted) this.scheduleRetry();
      else this.setStatus('idle');
    };
    ws.addEventListener('close', dropped);
    ws.addEventListener('error', () => {
      try {
        ws.close();
      } catch {
        /* already closing */
      }
    });
  }

  private scheduleRetry() {
    if (!this.wanted || this.retryTimer) return;
    this.setStatus('reconnecting');
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, 8000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, delay);
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encode(msg));
  }

  /** Deliberate exit: tell the server, stop retrying, close. */
  leave() {
    this.wanted = false;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.send({ t: 'leave' });
    try {
      this.ws?.close();
    } catch {
      /* already gone */
    }
    this.ws = null;
    this.retryDelay = 500;
    this.setStatus('idle');
  }

  /** Dev helper: kill the socket without a close frame, like a real drop. */
  debugKill() {
    this.ws?.close(4000, 'debug');
  }
}
