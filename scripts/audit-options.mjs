import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full.split('\\').join('/'));
  }
  return out;
};

const files = walk('src');
const sources = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

const DECLARATIONS = new Set(['src/core/options.ts', 'src/core/types.ts']);

const optionsText = sources.get('src/core/options.ts');
const defaults = optionsText
  .split('export const defaultOptions')[1]
  .split('const isPlainObject')[0];

const leaves = [
  ...new Set([...defaults.matchAll(/^ {2,6}([a-zA-Z][a-zA-Z0-9]*):/gm)].map((m) => m[1])),
].sort();

const consumersFor = (name) => {
  const pattern = new RegExp('\\.' + name + '\\b');
  const hits = [];
  for (const [file, text] of sources) {
    if (DECLARATIONS.has(file)) continue;
    if (file.startsWith('src/presets')) continue;
    if (pattern.test(text)) hits.push(file.replace('src/', ''));
  }
  return hits;
};

const dead = [];
console.log(`option leaves declared: ${leaves.length}\n`);
for (const name of leaves) {
  const hits = consumersFor(name);
  if (hits.length === 0) dead.push(name);
}

console.log(dead.length ? 'OPTIONS WITH NO CONSUMER:' : 'every option has a consumer');
for (const name of dead) console.log('   ', name);

console.log('\nShapeConfig fields:');
for (const field of ['paths', 'viewBox', 'scale', 'position', 'count', 'color']) {
  const pattern = new RegExp('(shape|config|svgData)\\??\\.' + field + '\\b');
  const hits = [];
  for (const [file, text] of sources) {
    if (DECLARATIONS.has(file)) continue;
    if (pattern.test(text)) hits.push(file.replace('src/', ''));
  }
  console.log('   ', field.padEnd(10), hits.length ? hits.join(', ') : '*** NO CONSUMER ***');
}
