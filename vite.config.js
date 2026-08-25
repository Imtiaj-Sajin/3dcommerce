import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5174,
    open: true,
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
