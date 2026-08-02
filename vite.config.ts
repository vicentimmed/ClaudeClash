import { defineConfig } from 'vite';

/**
 * `npm run dev` serves the client and proxies /api/ws to the local WebSocket
 * server (`npm run dev:server`), so the online mode works the same way it will
 * on Vercel, where /api/ws is a Function on the same origin.
 */
export default defineConfig({
  server: {
    proxy: {
      '/api/ws': {
        target: 'http://localhost:7799',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
