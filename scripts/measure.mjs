import { build } from 'esbuild';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { writeFileSync, unlinkSync } from 'node:fs';

const cases = {
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
  'Stipple only': "export { Stipple } from './src/core/engine';",
  'starfield preset': "export { Stipple } from './src/core/engine';\nexport { starfield } from './src/presets';",
};

for (const [name, source] of Object.entries(probes)) {
  const file = '.probe.ts';
  writeFileSync(file, source);
  try {
    console.log(row(name, await bundle(file)));
  } finally {
    unlinkSync(file);
  }
}
