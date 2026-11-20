import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In dev, the browser talks to Vite (5173), which proxies /api to the
// Express server (3001). Tokens never reach the browser.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': `http://127.0.0.1:${process.env.PORT || 3001}`,
    },
  },
});
