import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'client',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } },
  preview: { port: 4173, proxy: { '/api': 'http://localhost:3001' } },
});
