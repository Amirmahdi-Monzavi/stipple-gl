import type { Locator, Page } from '@playwright/test';

/**
 * Pinning the field down so a screenshot means something.
 *
 * Three things make the playground non-deterministic, and all three have to go
 * before pixels can be compared:
 *
 *   1. Layout seeds particle velocity, glow and jitter from `Math.random`.
 *   2. Breathe, jelly and drift are driven by the wall clock.
 *   3. The rAF loop advances by however long the last frame took.
 *
 * So: seed the generator before any module runs, stop the loop, freeze the
 * clock, and advance an exact number of frames by hand.
 */

const SEED_SCRIPT = () => {
  // A plain LCG. Not good randomness — repeatable randomness, which is the point.
  let state = 0x2f6e2b1;
  Math.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };

  // Neutralise the frame loop before any module runs.
  //
  // Calling `stop()` after load is too late: however many real frames happen
  // between load and that call, each one draws `Math.random` for the ambient
  // respawn roll, which shifts the seeded sequence and moves every particle.
  // That showed up as a screenshot that failed and then passed.
  window.requestAnimationFrame = () => 0;
  window.cancelAnimationFrame = () => undefined;
};

/**
 * The playground already declares `window.stipple`, so re-declaring it here
 * would collide. These helpers reach for it inside `page.evaluate`, where the
 * code runs in the browser and is typed against the DOM lib only.
 */
interface StippleHandle {
  stop(): void;
  tick(dt?: number): void;
  resize(): void;
  setOptions(config: unknown): void;
}

type TestWindow = Window & {
  stipple: StippleHandle;
  __advance: (frames: number) => void;
};

export interface FieldOptions {
  /** Frames to advance after each state change. */
  settle?: number;
}

export const openPlayground = async (page: Page): Promise<void> => {
  await page.addInitScript(SEED_SCRIPT);
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as TestWindow).stipple));

  await page.evaluate(() => {
    (window as unknown as TestWindow).stipple.stop();

    // Freeze the clock and advance it only when we say so. `tick` reads
    // `performance.now()` for the animation phase, so a real clock would make
    // breathe and jelly land differently on every run.
    let now = 0;
    performance.now = () => now;
    (window as unknown as TestWindow).__advance = (frames: number) => {
      for (let i = 0; i < frames; i++) {
        now += 16.667;
        (window as unknown as TestWindow).stipple.tick(16.667);
      }
    };

    // Adaptive quality changes the render resolution based on frame timing, and
    // `dpr: 'auto'` would follow the runner's display. Both have to be nailed.
    (window as unknown as TestWindow).stipple.setOptions({
      adaptiveQuality: false,
      dpr: 1,
      maxFps: 0,
      autoPause: false,
    });
    (window as unknown as TestWindow).stipple.resize();
  });

  // The panel is chrome, not the thing under test, and its scroll position is
  // its own source of drift.
  await page.evaluate(() => {
    const panel = document.getElementById('panel');
    const footer = document.querySelector('.hint');
    const masthead = document.querySelector('.masthead');
    for (const node of [panel, footer, masthead]) {
      if (node instanceof HTMLElement) node.style.display = 'none';
    }
  });

  await advance(page, 40);
};

export const advance = async (page: Page, frames: number): Promise<void> => {
  await page.evaluate((count) => (window as unknown as TestWindow).__advance(count), frames);
};

export const canvas = (page: Page): Locator => page.locator('#stage canvas');

/** Apply a shape by clicking its chip, then settle. */
export const chooseShape = async (
  page: Page,
  name: string,
  { settle = 260 }: FieldOptions = {},
): Promise<void> => {
  await page.evaluate((shape) => {
    const chip = [...document.querySelectorAll('.chip')].find((c) => c.textContent === shape);
    (chip as HTMLButtonElement | undefined)?.click();
  }, name);
  await advance(page, settle);
};

export const setDetail = async (
  page: Page,
  detail: 'uniform' | 'edges' | 'density',
  strength?: number,
): Promise<void> => {
  await page.evaluate(
    ({ detail: mode, strength: value }) => {
      const selects = [...document.querySelectorAll('select')];
      const detailSelect = selects.find((s) => [...s.options].some((o) => o.value === 'density'));
      if (detailSelect) {
        detailSelect.value = mode;
        detailSelect.dispatchEvent(new Event('change'));
      }
      if (value !== undefined) {
        const labels = [...document.querySelectorAll('.row')];
        const row = labels.find((r) => r.querySelector('label')?.textContent === 'Detail strength');
        const slider = row?.querySelector('input[type=range]') as HTMLInputElement | undefined;
        if (slider) {
          slider.value = String(value);
          slider.dispatchEvent(new Event('input'));
        }
      }
    },
    { detail, strength },
  );
  await advance(page, 200);
};

export const setColourMode = async (
  page: Page,
  mode: 'solid' | 'shape' | 'ramp',
): Promise<void> => {
  await page.evaluate((value) => {
    const drawer = [...document.querySelectorAll<HTMLElement>('.group')].find(
      (g) => g.dataset.mode !== undefined,
    );
    const select = drawer?.querySelector('select');
    if (select) {
      select.value = value;
      select.dispatchEvent(new Event('change'));
    }
  }, mode);
  await advance(page, 200);
};
