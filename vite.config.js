import { defineConfig } from 'vite';

const API = process.env.VITE_API_TARGET || 'http://localhost:8787';

export default defineConfig({
  server: {
    port: 5174,
    open: true,
    // In dev the 3D client runs on Vite and the API on Express; proxying
    // keeps every fetch same-origin so no CORS or absolute URLs are needed.
    // Product photos live in public/products, which Vite already serves.
    proxy: { '/api': { target: API, changeOrigin: true } },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    // main.js awaits the catalogue before building the room, so the bundle
    // needs a target where top-level await exists.
    target: 'es2022',
  },
});
