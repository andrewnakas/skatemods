import { defineConfig } from 'vite';

// STUDIO_BASE is "/skatemods/" on GitHub Pages and "/studio/" when mounted on skatemods.com.
export default defineConfig({
  base: process.env.STUDIO_BASE ?? '/',
  build: {
    target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1500,
    rollupOptions: { input: { main: 'index.html', convert: 'convert.html' } },
  },
  worker: { format: 'es' },
});
