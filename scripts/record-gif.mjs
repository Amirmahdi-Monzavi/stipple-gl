import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

/**
 * Records the README loop: spread, into a shape, into another, back to rest.
 *
 * The field is driven frame by frame with a frozen clock rather than recorded
 * in real time, so the result is identical on every machine and does not depend
 * on how fast the runner happens to be. Encoding happens in the page — see
 * scripts/gif-encoder.js for why.
 *
 *   pnpm playground        (in another terminal)
 *   node scripts/record-gif.mjs
 */

const PAGE_URL = process.env.PLAYGROUND_URL ?? 'http://localhost:5180/';
const OUT = fileURLToPath(new URL('../docs/hero.gif', import.meta.url));

const WIDTH = 520;
const HEIGHT = 320;
const STEP_MS = 16.667;

// Each entry is [shape chip to click, frames to hold]. `null` releases.
const TIMELINE = [
  [null, 10],
  ['hexagon', 30],
  ['spiro', 30],
  ['none', 16],
];

// Ticks advanced per captured frame: the engine runs at 60fps, the GIF at 20.
const TICKS_PER_FRAME = 3;
const DELAY_CS = 5;

const seed = () => {
  let state = 0x2f6e2b1;
  Math.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  // Stop real frames from advancing the field between our own ticks.
  window.requestAnimationFrame = () => 0;
  window.cancelAnimationFrame = () => undefined;
};

// Drive the Chrome already on the machine, matching playwright.config.ts —
// there is no bundled browser locally, and this needs no pinned version.
const browser = await chromium.launch(process.env.CI ? {} : { channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

await page.addInitScript(seed);
await page.addInitScript({ path: fileURLToPath(new URL('./gif-encoder.js', import.meta.url)) });
await page.goto(PAGE_URL);
await page.waitForFunction(() => Boolean(window.stipple));

await page.evaluate(() => {
  const field = window.stipple;
  field.stop();

  let now = 0;
  performance.now = () => now;
  window.__step = (ms) => {
    now += ms;
    field.tick(ms);
  };

  field.setOptions({ adaptiveQuality: false, dpr: 1, maxFps: 0, autoPause: false });
  field.resize();

  // The panel is chrome, not the subject.
  for (const selector of ['#panel', '.hint', '.masthead']) {
    const node = document.querySelector(selector);
    if (node instanceof HTMLElement) node.style.display = 'none';
  }
});

console.log(
  'recording ' + TIMELINE.reduce((n, [, f]) => n + f, 0) + ' frames at ' + WIDTH + 'x' + HEIGHT,
);

const frames = await page.evaluate(
  async ({ timeline, ticksPerFrame, stepMs }) => {
    const field = window.stipple;
    const canvas = field.canvas;
    const gl = canvas.getContext('webgl2');

    const click = (name) => {
      const chip = [...document.querySelectorAll('.chip')].find(
        (c) => c.textContent.trim() === name,
      );
      chip?.click();
    };

    const captured = [];

    for (const [shape, count] of timeline) {
      if (shape) click(shape);

      for (let f = 0; f < count; f++) {
        // Tick and read in the same task: the drawing buffer is not preserved,
        // so a read one turn later comes back empty.
        for (let t = 0; t < ticksPerFrame; t++) window.__step(stepMs);

        const raw = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, raw);

        // readPixels is bottom-up; GIF rows run top-down.
        const flipped = new Uint8Array(raw.length);
        const stride = canvas.width * 4;
        for (let y = 0; y < canvas.height; y++) {
          flipped.set(
            raw.subarray((canvas.height - 1 - y) * stride, (canvas.height - y) * stride),
            y * stride,
          );
        }
        captured.push(flipped);
      }
    }

    // The frames stay in the page. Sixty of these is tens of megabytes, and
    // shipping them back over the debug protocol only to ship a GIF is waste —
    // the encoder runs here instead.
    window.__frames = captured;
    return { count: captured.length, width: canvas.width, height: canvas.height };
  },
  { timeline: TIMELINE, ticksPerFrame: TICKS_PER_FRAME, stepMs: STEP_MS },
);

console.log('captured ' + frames.count + ' frames at ' + frames.width + 'x' + frames.height);
console.log('encoding...');

const base64 = await page.evaluate(
  ({ width, height, delay }) => {
    const gif = window.__encodeGif(window.__frames, width, height, delay, 64);
    let binary = '';
    for (let i = 0; i < gif.length; i += 8192) {
      binary += String.fromCharCode.apply(null, gif.subarray(i, i + 8192));
    }
    return btoa(binary);
  },
  { width: frames.width, height: frames.height, delay: DELAY_CS },
);

writeFileSync(OUT, Buffer.from(base64, 'base64'));
console.log(
  'wrote ' + OUT + ' (' + (Buffer.from(base64, 'base64').length / 1024).toFixed(0) + ' KB)',
);

await browser.close();
