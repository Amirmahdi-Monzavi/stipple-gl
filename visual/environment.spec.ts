import { expect, test, type Page } from '@playwright/test';

import { advance, canvas, chooseShape, openPlayground } from './harness';

/**
 * The field under conditions the other specs never put it in.
 *
 * Only one of these is a screenshot. A reduced-motion field looks exactly like
 * a settled one — the difference is that it is not animating, which no still
 * image can show — and the worker renders with its own generator, so pixel
 * equality is not on offer there either. Both are asserted on values instead.
 */

type TestWindow = Window & {
  stipple: { running: boolean; canvas: HTMLCanvasElement; tick(dt?: number): void };
  stippleMode: string;
};

/**
 * A coarse 4x4 occupancy grid, read back off the composited canvas.
 *
 * Insensitive to which particle went where, sensitive to where the field is as
 * a whole — which is the only comparison available between two runs that do not
 * share a random seed.
 */
const occupancy = (page: Page, driveAFrame = false): Promise<number[]> =>
  page.evaluate((shouldTick) => {
    // Draw and copy in the same task. The drawing buffer is not preserved, so a
    // copy taken one turn later reads an empty canvas — which on the main
    // thread made this compare a blank image against the worker and blame the
    // worker for the difference. The worker needs no tick: it draws its own.
    if (shouldTick) {
      (window as unknown as TestWindow).stipple.tick(16.667);
    }
    const source = document.querySelector<HTMLCanvasElement>('#stage canvas');
    if (!source) return [];

    const copy = document.createElement('canvas');
    copy.width = 240;
    copy.height = 240;
    const ctx = copy.getContext('2d');
    if (!ctx) return [];

    ctx.drawImage(source, 0, 0, copy.width, copy.height);
    const { data } = ctx.getImageData(0, 0, copy.width, copy.height);

    const grid = new Array<number>(16).fill(0);
    let lit = 0;
    for (let y = 0; y < copy.height; y++) {
      for (let x = 0; x < copy.width; x++) {
        if (data[(y * copy.width + x) * 4 + 3]! > 8) {
          const row = ((y * 4) / copy.height) | 0;
          const column = ((x * 4) / copy.width) | 0;
          grid[row * 4 + column] = (grid[row * 4 + column] ?? 0) + 1;
          lit++;
        }
      }
    }
    return lit ? grid.map((v) => v / lit) : grid;
  }, driveAFrame);

test('a portrait viewport lays the field out for the shorter axis', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openPlayground(page);
  await chooseShape(page, 'shield');
  await expect(canvas(page)).toHaveScreenshot('mobile-shield.png');
});

test('reduced motion draws the field once and then holds still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openPlayground(page);
  await chooseShape(page, 'shield');

  const state = await page.evaluate(() => {
    const field = (window as unknown as TestWindow).stipple;
    const canvasEl = field.canvas;
    const gl = canvasEl.getContext('webgl2');
    if (!gl) return { running: field.running, lit: -1 };

    field.tick(16.667);
    const pixels = new Uint8Array(canvasEl.width * canvasEl.height * 4);
    gl.readPixels(0, 0, canvasEl.width, canvasEl.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let lit = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 8) lit++;
    return { running: field.running, lit };
  });

  // Drawn, but not running: a still field rather than a blank canvas.
  expect(state.lit).toBeGreaterThan(0);
  expect(state.running).toBe(false);
});

test('worker mode puts the field in the same place as the main thread', async ({ page }) => {
  await openPlayground(page);
  await chooseShape(page, 'shield');
  await advance(page, 200);
  const main = await occupancy(page, true);
  expect(main.length).toBe(16);

  /*
    The worker owns its own global scope, so the seeded generator and frozen
    clock the harness installs never reach it and `tick` is refused — the worker
    drives its own loop. Pixel equality is therefore not available, and adding a
    seeding hook to the protocol to buy it would be production API existing only
    for a test. Comparing where the field ended up is the honest substitute.
  */
  await page.goto('/?worker');
  await page.waitForFunction(() => (window as unknown as TestWindow).stippleMode === 'worker');

  // The panel is chrome, but it is also layout: it takes width from the stage,
  // so leaving it up here and down on the main-thread run would compare two
  // differently shaped canvases and call the difference a worker problem.
  await page.evaluate(() => {
    for (const selector of ['#panel', '.hint', '.masthead']) {
      const node = document.querySelector(selector);
      if (node instanceof HTMLElement) node.style.display = 'none';
    }
  });

  await page.waitForTimeout(2500);
  const worker = await occupancy(page);
  expect(worker.length).toBe(16);

  const distance = Math.sqrt(main.reduce((sum, v, i) => sum + (v - worker[i]!) ** 2, 0));
  // Measured at 0.012 between the two. A threshold well clear of that still
  // catches a worker that lays the field out somewhere else entirely.
  expect(distance).toBeLessThan(0.06);
});
