import { build } from 'esbuild';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { writeFileSync, unlinkSync } from 'node:fs';

const cases = {
  'lite (particles only)': 'src/lite.ts',
  'index (full)': 'src/index.ts',
  react: 'src/react/index.ts',
  scroll: 'src/scroll/index.ts',
  presets: 'src/presets/index.ts',
};

const row = (name, bytes) =>
  [
    name.padEnd(24),
    (bytes.length / 1024).toFixed(2).padStart(8) + ' KB min',
    (gzipSync(bytes).length / 1024).toFixed(2).padStart(8) + ' KB gzip',
    (brotliCompressSync(bytes).length / 1024).toFixed(2).padStart(8) + ' KB br',
  ].join('  ');

const bundle = async (entry) => {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'esm',
    write: false,
    external: ['react', 'react-dom'],
    target: 'es2022',
  });
  return result.outputFiles[0].contents;
};

for (const [name, entry] of Object.entries(cases)) {
  console.log(row(name, await bundle(entry)));
}

const probes = {
  'engine, no SVG parser': ["export { Stipple } from './src/lite';"],
  'lite + starfield preset': [
    "export { Stipple } from './src/lite';",
    "export { starfield } from './src/presets';",
  ],
  'full + react': [
    "export { Stipple } from './src/stipple';",
    "export { Particles } from './src/react';",
  ],
};

for (const [name, lines] of Object.entries(probes)) {
  const file = '.probe.ts';
  writeFileSync(file, lines.join('\n'));
  try {
    console.log(row(name, await bundle(file)));
  } finally {
    unlinkSync(file);
  }
}
