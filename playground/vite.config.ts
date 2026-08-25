import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  resolve: {
    alias: [
      {
        find: 'stipple-gl/presets',
        replacement: fileURLToPath(new URL('../src/presets/index.ts', import.meta.url)),
      },
      {
        find: 'stipple-gl/scroll',
        replacement: fileURLToPath(new URL('../src/scroll/index.ts', import.meta.url)),
      },
      {
        find: 'stipple-gl/react',
        replacement: fileURLToPath(new URL('../src/react/index.ts', import.meta.url)),
      },
      {
        find: /^stipple-gl$/,
        replacement: fileURLToPath(new URL('../src/index.ts', import.meta.url)),
      },
    ],
  },
  build: {
    outDir: fileURLToPath(new URL('../dist-playground', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5180,
    open: true,
  },
});
