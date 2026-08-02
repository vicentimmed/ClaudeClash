/**
 * Local dev entry point for the WebSocket server.
 *
 * On Vercel the same server is exported from `api/ws.ts` and the platform
 * hosts it; locally we just listen on a port and let Vite proxy `/api/ws`
 * across (see `vite.config.ts`), so the client code and URLs are identical in
 * both environments.
 *
 *   npm run dev        → client + server together
 *   npm run dev:server → this file on its own
 */

import server from '../api/ws';

const PORT = Number(process.env.WS_PORT ?? 7799);

server.listen(PORT, () => {
  console.log(`[claudeclash] dev WebSocket server on ws://localhost:${PORT}/api/ws`);
});
