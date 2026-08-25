import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { writeFileSync, unlinkSync } from 'node:fs';

const entry = process.argv[2] ?? 'src/index.ts';
const probe = '.analyze.ts';
writeFileSync(probe, `export { Stipple } from './src/core/engine';\n`);

const target = entry === 'stipple' ? probe : entry;

const result = await build({
  entryPoints: [target],
  bundle: true,
  minify: true,
  format: 'esm',
  write: false,
  metafile: true,
  external: ['react', 'react-dom'],
  target: 'es2022',
  define: { 'process.env.NODE_ENV': '"production"' },
});

const out = Object.values(result.metafile.outputs)[0];
const rows = Object.entries(out.inputs)
  .map(([file, info]) => [file.replace(/\\/g, '/'), info.bytesInOutput])
  .sort((a, b) => b[1] - a[1]);

const total = rows.reduce((sum, [, bytes]) => sum + bytes, 0);

console.log(`entry: ${target}`);
console.log(`minified total: ${(total / 1024).toFixed(2)} KB`);
console.log(
  `gzipped: ${(gzipSync(result.outputFiles[0].contents).length / 1024).toFixed(2)} KB\n`,
);

for (const [file, bytes] of rows) {
  const pct = ((bytes / total) * 100).toFixed(1);
  console.log(
    file.padEnd(34),
    String(bytes).padStart(6) + ' B',
    pct.padStart(5) + '%',
    '█'.repeat(Math.round(bytes / 250)),
  );
}

unlinkSync(probe);
