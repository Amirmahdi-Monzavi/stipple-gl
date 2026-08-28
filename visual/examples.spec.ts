import { expect, test, type Page } from '@playwright/test';

/**
 * The examples are the only place several documented capabilities are actually
 * exercised — `mode: 'container'`, `fitShapeToElement`, `createScrollMorph` and
 * `responsiveCount` have no other coverage. They also load the built
 * `dist/stipple.global.js`, so these double as a smoke test of the script-tag
 * build that nothing else touches.
 *
 * Assertions are on values, not pixels: an example is allowed to be redesigned.
 */

const ROOT = 'http://localhost:5181/examples/';

interface LiveStipple {
  canvas: HTMLCanvasElement;
  options: { count: number };
  stop(): void;
  tick(dt?: number): void;
  runtime: { backend: { major: { x: Float32Array; y: Float32Array } } };
}

type ExampleWindow = Window & {
  field: LiveStipple;
  controller: { activeKey: string | null; refresh(): void };
};

/** Settle the field by hand and count what is actually drawn. */
const litPixels = (page: Page, frames = 160): Promise<number> =>
  page.evaluate((count) => {
    const field = (window as unknown as ExampleWindow).field;
    field.stop();
    for (let i = 0; i < count; i++) field.tick(16.667);

    const canvas = field.canvas;
    const gl = canvas.getContext('webgl2');
    if (!gl) return -1;

    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let lit = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 8) lit++;
    return lit;
  }, frames);

const ready = async (page: Page, file: string): Promise<string[]> => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });

  await page.goto(ROOT + file);
  await page.waitForFunction(() => Boolean((window as unknown as ExampleWindow).field));
  return problems;
};

test('the index links to every example', async ({ page }) => {
  await page.goto(ROOT);
  const links = await page
    .locator('a.card')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).getAttribute('href')));
  expect(links.sort()).toEqual(
    ['container.html', 'mobile.html', 'positioned.html', 'scroll-snap.html'].sort(),
  );
});

test('container: the field is bounded by its host, not the viewport', async ({ page }) => {
  const problems = await ready(page, 'container.html');

  const box = await page.evaluate(() => {
    const host = document.getElementById('field')!.getBoundingClientRect();
    const canvas = (window as unknown as ExampleWindow).field.canvas.getBoundingClientRect();
    return {
      hostHeight: Math.round(host.height),
      canvasHeight: Math.round(canvas.height),
      viewportHeight: window.innerHeight,
    };
  });

  expect(problems).toEqual([]);
  expect(box.canvasHeight).toBeCloseTo(box.hostHeight, -1);
  expect(box.canvasHeight).toBeLessThan(box.viewportHeight);
  expect(await litPixels(page)).toBeGreaterThan(0);
});

test('positioned: the field gathers on the slot, not the centre', async ({ page }) => {
  const problems = await ready(page, 'positioned.html');
  await litPixels(page, 220);

  const offsets = await page.evaluate(() => {
    const field = (window as unknown as ExampleWindow).field;
    const major = field.runtime.backend.major;
    const canvas = field.canvas.getBoundingClientRect();
    const slot = document.getElementById('slot')!.getBoundingClientRect();

    let sx = 0;
    let sy = 0;
    for (let i = 0; i < major.x.length; i++) {
      sx += major.x[i]!;
      sy += major.y[i]!;
    }
    const cx = sx / major.x.length;
    const cy = sy / major.y.length;

    return {
      fromSlot: Math.hypot(
        cx - (slot.left - canvas.left + slot.width / 2),
        cy - (slot.top - canvas.top + slot.height / 2),
      ),
      fromCentre: Math.hypot(cx - canvas.width / 2, cy - canvas.height / 2),
    };
  });

  expect(problems).toEqual([]);
  // Sitting on the slot, and demonstrably not merely sitting in the middle.
  expect(offsets.fromSlot).toBeLessThan(40);
  expect(offsets.fromCentre).toBeGreaterThan(120);
});

test('scroll-snap: each section applies the shape it declares', async ({ page }) => {
  const problems = await ready(page, 'scroll-snap.html');

  const seen = await page.evaluate(async () => {
    const scope = window as unknown as ExampleWindow;
    const doc = document.documentElement;
    // Smooth scrolling and snapping animate, which makes the assertion depend
    // on timing rather than on the controller.
    doc.style.scrollBehavior = 'auto';
    doc.style.scrollSnapType = 'none';

    const out: Array<{ wants: string | null; got: string | null }> = [];
    for (const section of [...document.querySelectorAll('section')]) {
      doc.scrollTop = section.offsetTop;
      await new Promise((resolve) => setTimeout(resolve, 50));
      scope.controller.refresh();
      out.push({
        wants: section.getAttribute('data-stipple-shape'),
        got: scope.controller.activeKey,
      });
    }
    return out;
  });

  expect(problems).toEqual([]);
  expect(seen).toEqual([
    { wants: 'none', got: 'none' },
    { wants: 'hex', got: 'hex' },
    { wants: 'bolt', got: 'bolt' },
    { wants: 'none', got: 'none' },
  ]);
});

test('mobile: the layout reflows on the panel, and the field follows', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const problems = await ready(page, 'mobile.html');

  /**
   * Everything that should move when the panel narrows. The example's
   * ResizeObserver drives all of it, so this doubles as proof that it fires.
   */
  const state = () =>
    page.evaluate(() => {
      const field = (window as unknown as ExampleWindow).field;
      const scene = document.getElementById('scene')!;
      const slot = document.getElementById('slot')!;
      const rect = scene.getBoundingClientRect();
      const slotRect = slot.getBoundingClientRect();

      // Let the swap finish before measuring where the field ended up: a shape
      // change animates, and reading mid-flight measures the journey.
      field.stop();
      for (let i = 0; i < 220; i++) field.tick(16.667);

      const major = field.runtime.backend.major;
      // Bounded by the active count, not the array length: setCount lowers the
      // count without shrinking the allocation, so the tail holds stale
      // positions from the previous layout.
      const live = field.options.count;
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < live; i++) {
        sx += major.x[i]!;
        sy += major.y[i]!;
      }

      return {
        columns: getComputedStyle(scene).gridTemplateColumns.split(' ').length,
        count: field.options.count,
        // Stacked means the slot has dropped below the copy.
        stacked: slotRect.top - rect.top > rect.height * 0.35,
        toSlot: Math.hypot(
          sx / live - (slotRect.left - rect.left + slotRect.width / 2),
          sy / live - (slotRect.top - rect.top + slotRect.height / 2),
        ),
      };
    });

  const wide = await state();
  expect(problems).toEqual([]);
  expect(wide.columns).toBe(2);
  expect(wide.stacked).toBe(false);

  await page.getByRole('button', { name: 'Phone' }).click();
  // The panel animates its width; wait for it to settle rather than guessing.
  await page.waitForFunction(
    () => Math.round(document.getElementById('scene')!.getBoundingClientRect().width) <= 392,
  );
  await page.waitForTimeout(200);
  const phone = await state();

  expect(phone.columns).toBe(1);
  expect(phone.stacked).toBe(true);
  expect(phone.count).toBeLessThan(wide.count);
  // The shape travelled with the slot rather than staying where it was.
  expect(phone.toSlot).toBeLessThan(60);
  expect(await litPixels(page, 120)).toBeGreaterThan(0);
});

test('mobile: the field stays inside the panel at every width', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await ready(page, 'mobile.html');

  /**
   * Measured on the major particles, not on lit pixels.
   *
   * `minorCount` defaults to 260 ambient particles that never morph and are
   * meant to drift to the edges — counting pixels would call that a crop, which
   * is how this assertion was wrong the first time.
   */
  const overflow = () =>
    page.evaluate(() => {
      const field = (window as unknown as ExampleWindow).field;
      field.stop();
      for (let i = 0; i < 200; i++) field.tick(16.667);

      const rect = field.canvas.getBoundingClientRect();
      const major = field.runtime.backend.major;

      // Only the live particles: the array keeps its old length after setCount.
      const live = field.options.count;
      let outside = 0;
      for (let i = 0; i < live; i++) {
        const x = major.x[i]!;
        const y = major.y[i]!;
        if (x < 0 || x > rect.width || y < 0 || y > rect.height) outside++;
      }
      return outside / live;
    });

  // `fitRadius` derives the spread from the panel's short axis, so a wide
  // shallow panel should not lose the top and bottom of the field.
  expect(await overflow()).toBe(0);

  for (const width of ['Phone', 'Tablet']) {
    await page.getByRole('button', { name: width }).click();
    await page.waitForTimeout(600);
    expect(await overflow(), width).toBe(0);
  }
});

test('mobile: the shape travels to its new slot in one move, not two', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await ready(page, 'mobile.html');
  await page.waitForTimeout(600);

  /**
   * Samples the real animation loop rather than driving it, because the defect
   * this guards against was only visible in motion: the engine re-applies the
   * outgoing shape on resize — its position being a fraction of a canvas that
   * has just changed proportions — so a correction that arrives even one frame
   * late reads as the shape jumping to a wrong place and then fixing itself.
   */
  const trace = (index: number) =>
    page.evaluate(async (button) => {
      const field = (window as unknown as ExampleWindow).field;
      const scene = document.getElementById('scene')!;
      const slot = document.getElementById('slot')!;

      const distance = () => {
        const major = field.runtime.backend.major;
        const live = field.options.count;
        let sx = 0;
        let sy = 0;
        for (let i = 0; i < live; i++) {
          sx += major.x[i]!;
          sy += major.y[i]!;
        }
        const rect = scene.getBoundingClientRect();
        const slotRect = slot.getBoundingClientRect();
        return Math.hypot(
          sx / live - (slotRect.left - rect.left + slotRect.width / 2),
          sy / live - (slotRect.top - rect.top + slotRect.height / 2),
        );
      };

      const buttons = document.querySelectorAll('#widths button');
      (buttons[button] as HTMLButtonElement).click();

      const samples: number[] = [];
      const counts: number[] = [];
      for (let i = 0; i < 90; i++) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        samples.push(distance());
        counts.push(field.options.count);
      }

      let worstBacktrack = 0;
      for (let i = 1; i < samples.length; i++) {
        worstBacktrack = Math.max(worstBacktrack, samples[i]! - samples[i - 1]!);
      }
      return {
        start: samples[0]!,
        end: samples[samples.length - 1]!,
        worstBacktrack,
        grew: counts[counts.length - 1]! > counts[0]!,
      };
    }, index);

  const toPhone = await trace(0);
  expect(toPhone.start).toBeGreaterThan(100);
  expect(toPhone.end).toBeLessThan(60);
  // Never further from the slot than the frame before: one approach, not two.
  expect(toPhone.worstBacktrack).toBeLessThan(2);

  /*
    Coming back, only the destination is asserted.

    Widening re-budgets upward, from 1,400 particles to 4,000, and the 2,600
    that appear start in the spread and fly in over about ten frames. The mean
    drifts while they travel — measured as a decaying rise of 1.7px a frame,
    beginning the frame *after* the count settles, so it is the new particles'
    journey rather than the shape being placed twice. A backtrack measured over
    a population that grew is not measuring what this test is named after.

    The narrowing leg above keeps the check: there the count only falls, every
    particle measured was already travelling, and it reads a clean zero.
  */
  const backToFull = await trace(2);
  expect(backToFull.grew).toBe(true);
  expect(backToFull.end).toBeLessThan(60);
});
