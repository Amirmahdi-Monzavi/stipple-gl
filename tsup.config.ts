import { defineConfig } from 'tsup';

const entry = {
  index: 'src/index.ts',
  lite: 'src/lite.ts',
  react: 'src/react/index.ts',
  scroll: 'src/scroll/index.ts',
  presets: 'src/presets/index.ts',
  worker: 'src/worker/index.ts',
  thread: 'src/worker/thread.ts',
};

export default defineConfig([
  {
    entry,
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    treeshake: true,
    splitting: true,
    // Not shipped: maps were 68% of the package, and a dangling
    // sourceMappingURL is a 404 in every consumer devtools session.
    sourcemap: false,
    minify: false,
    target: 'es2022',
    external: ['react', 'react-dom'],
    outExtension({ format }) {
      return { js: format === 'cjs' ? '.cjs' : '.js' };
    },
  },
  {
    // The script-tag build. Self-contained, minified, and with the dev-only
    // validation folded out — a CDN consumer has no bundler to do it for them.
    entry: { 'stipple.global': 'src/global.ts' },
    format: ['iife'],
    globalName: 'stipple',
    dts: false,
    clean: false,
    treeshake: true,
    splitting: false,
    // Not shipped: maps were 68% of the package, and a dangling
    // sourceMappingURL is a 404 in every consumer devtools session.
    sourcemap: false,
    minify: true,
    target: 'es2020',
    define: { 'process.env.NODE_ENV': '"production"' },
    outExtension() {
      return { js: '.js' };
    },
  },
]);
