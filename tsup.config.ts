import { readFile, writeFile } from 'node:fs/promises';

import { defineConfig } from 'tsup';

/**
 * Mark the React entry as a client module.
 *
 * Without the directive, importing `Particles` from a Next.js App Router server
 * component fails on the hooks, and the caller has to wrap it themselves. Every
 * client-only React package ships this.
 *
 * It is prepended after the build rather than set as a `banner`, because the
 * banner applies to a whole tsup config and this one emits seven entries that
 * share chunks — stamping `index`, `worker` and `thread` as client modules
 * would be wrong, and splitting React into its own config to avoid that would
 * cost it a private copy of the core. The directive only has to sit on the
 * boundary module: whatever it imports joins the client graph on its own.
 */
const markReactAsClient = async (): Promise<void> => {
  for (const file of ['dist/react.js', 'dist/react.cjs']) {
    const source = await readFile(file, 'utf8');
    if (/^\s*(['"])use client\1/.test(source)) continue;
    await writeFile(file, "'use client';\n" + source);
  }
};

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
    onSuccess: markReactAsClient,
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
