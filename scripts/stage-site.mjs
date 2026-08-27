import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

/**
 * Assembles the parts of the site that are not markdown.
 *
 * VitePress serves anything under `docs/public` from the site root, so the
 * examples and the playground are staged there rather than rewritten to live
 * inside the docs tree. `examples/` stays the single source of truth: these are
 * copies, and `docs/public` is generated and ignored by git.
 *
 * The one edit made on the way through is the script tag. The examples load
 * `../dist/stipple.global.js`, which resolves when the repo root is served and
 * does not when the site is. Pointing it at the site root instead keeps the
 * originals openable during development, which is the point of them.
 */

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const publicDir = join(root, 'docs', 'public');

const say = (message) => console.log('  ' + message);

if (!existsSync(join(root, 'dist', 'stipple.global.js'))) {
  console.error('stipple-gl: dist/stipple.global.js is missing. Run `pnpm build` first.');
  process.exit(1);
}

rmSync(publicDir, { recursive: true, force: true });
mkdirSync(join(publicDir, 'examples'), { recursive: true });

// The script-tag build, at the path the staged examples will ask for.
cpSync(join(root, 'dist', 'stipple.global.js'), join(publicDir, 'stipple.global.js'));
say('stipple.global.js');

// The site's own icon, which the VitePress config points at.
cpSync(join(root, 'examples', 'favicon.svg'), join(publicDir, 'favicon.svg'));

// The recorded loop. It lives in `docs/` so the README can reach it by
// relative path from the repository root, but the site serves the root from
// `docs/public`, so the landing page needs a copy there to link to as /hero.gif.
const hero = join(root, 'docs', 'hero.gif');
if (existsSync(hero)) {
  cpSync(hero, join(publicDir, 'hero.gif'));
  say('hero.gif');
} else {
  say('hero.gif missing — run `pnpm record-gif` to include it');
}

let staged = 0;
for (const name of readdirSync(join(root, 'examples'))) {
  const from = join(root, 'examples', name);

  if (!name.endsWith('.html')) {
    if (name.endsWith('.svg')) cpSync(from, join(publicDir, 'examples', name));
    continue;
  }

  const source = readFileSync(from, 'utf8');
  const rewritten = source.replace('../dist/stipple.global.js', '/stipple.global.js');

  if (rewritten === source) {
    console.error('stipple-gl: ' + name + ' does not load ../dist/stipple.global.js as expected.');
    process.exit(1);
  }

  writeFileSync(join(publicDir, 'examples', name), rewritten);
  staged++;
}
say(staged + ' examples');

// The playground, if it has been built. Its own vite config uses a relative
// base, so it works from a subpath without being told where it lives.
const playground = join(root, 'dist-playground');
if (existsSync(playground)) {
  cpSync(playground, join(publicDir, 'playground'), { recursive: true });
  say('playground');
} else {
  say('playground skipped — run `pnpm playground:build` to include it');
}

console.log('staged into docs/public');
