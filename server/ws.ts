/**
 * WebSocket entry point (Vercel Function).
 *
 * Vercel serves WebSockets by letting a function export an `http.Server` with a
 * `ws` server attached — see https://vercel.com/docs/functions/websockets.
 * Requires Fluid compute, which is the default for projects created after
 * 2025-04-23.
 *
 * Source lives here; `npm run build:ws` bundles this file to `api/ws.js` for
 * deploy. Locally, `server/dev.ts` imports this module directly.
 */

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { decode, encode, type ClientMsg } from '../src/net/protocol';
import { Hub, type Conn } from './hub';
import { createStore } from './store';

const HEARTBEAT_MS = 15000;

const server = http.createServer((req, res) => {
  // A plain GET here is handy for checking the function is alive at all.
  if (req.url?.startsWith('/api/ws')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'claudeclash-ws' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });
const instanceId = randomUUID();

// Built once per instance and shared by every connection it serves.
const hubReady = (async () => {
  const store = await createStore();
  const hub = new Hub(store, instanceId);
  await hub.start();
  return hub;
})();

wss.on('connection', (ws: WebSocket) => {
  let closed = false;
  const conn: Conn = {
    send(data) {
      if (!closed && ws.readyState === ws.OPEN) ws.send(data);
    },
    close() {
      closed = true;
      try {
        ws.close();
      } catch {
        /* already gone */
      }
    },
    get alive() {
      return !closed && ws.readyState === ws.OPEN;
    },
  };

  let awaitingPong = false;
  const heartbeat = setInterval(() => {
    if (!conn.alive) return;
    if (awaitingPong) {
      // Missed a full cycle — treat as dead so the slot frees up.
      conn.close();
      return;
    }
    awaitingPong = true;
    conn.send(encode({ t: 'ping' }));
  }, HEARTBEAT_MS);

  void hubReady.then((hub) => {
    ws.on('message', (raw: Buffer | string) => {
      const msg = decode<ClientMsg>(typeof raw === 'string' ? raw : raw.toString('utf8'));
      if (!msg) return;
      if (msg.t === 'pong') {
        awaitingPong = false;
        return;
      }
      void hub.onMessage(conn, msg).catch((err) => {
        console.error('[claudeclash] message handler failed:', err);
      });
    });

    const teardown = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      void hub.onDisconnect(conn).catch(() => undefined);
    };

    ws.on('close', teardown);
    ws.on('error', teardown);
  });
});

export default server;
