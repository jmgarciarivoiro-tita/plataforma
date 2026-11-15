import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// La API sirve index.html en "/" y los assets en "/shell/" (mismo origen que /auth, /api y /m).
export default defineConfig({
  base: '/shell/',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
});
