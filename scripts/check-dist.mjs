import { readFileSync, existsSync } from 'node:fs';

/**
 * Assertions about the built package that only the real output can answer.
 *
 * Runs after `build` rather than as a vitest file, because the unit suite runs
 * before the build in every script that chains them — a test would be checking
 * whatever `dist/` happened to be left over from last time, or skipping.
 */

const problems = [];

const read = (file) => {
  if (!existsSync(file)) {
    problems.push(file + ' is missing from the build');
    return null;
  }
  return readFileSync(file, 'utf8');
};

const startsWithUseClient = (source) => /^\s*(['"])use client\1/.test(source);

// The React entry has to declare itself a client module, or importing
// `Particles` from a Next.js server component fails on the hooks.
for (const file of ['dist/react.js', 'dist/react.cjs']) {
  const source = read(file);
  if (source !== null && !startsWithUseClient(source)) {
    problems.push(file + ' is missing the "use client" directive');
  }
}

// The other entries must not carry it: the directive pulls whatever declares it
// into the client graph, and the core is framework-agnostic.
for (const file of ['dist/index.js', 'dist/lite.js', 'dist/worker.js', 'dist/thread.js']) {
  const source = read(file);
  if (source !== null && startsWithUseClient(source)) {
    problems.push(file + ' should not carry a "use client" directive');
  }
}

// The script-tag build is the one audience that cannot pre-flight any other
// way: no bundler, often no build step, and a thrown constructor is all they
// would get. `isSupported` survives minification because it is a public
// property on the global object.
const global = read('dist/stipple.global.js');
if (global !== null && !global.includes('isSupported')) {
  problems.push('dist/stipple.global.js does not expose isSupported');
}

if (problems.length) {
  console.error('stipple-gl: built output is wrong\n');
  for (const problem of problems) console.error('  - ' + problem);
  process.exit(1);
}

console.log('dist looks right: react entries are client modules, the rest are not');
