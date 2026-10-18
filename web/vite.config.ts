import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = process.env.PANEL_SERVER ?? 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Saat pengembangan, API dan terminal diteruskan ke server panel.
    proxy: {
      '/api': { target, changeOrigin: true },
      '/preview': { target, changeOrigin: true },
      '/ws': { target, ws: true, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
