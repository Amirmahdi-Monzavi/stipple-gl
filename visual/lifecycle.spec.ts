import { expect, test, type Page } from '@playwright/test';

/**
 * Failure modes a stub cannot reproduce.
 *
 * The unit suite runs in jsdom against a Proxy where every GL call answers and
 * every constant is 1. That keeps 261 tests fast, but it means nothing the
 * driver actually does is observable — there is no context limit to exhaust, no
 * context to lose, and no thread to transfer a canvas to. These are assertions
 * on values rather than pixels, so unlike the screenshot baselines next door
 * they do not churn when the design changes.
 */

interface LiveStipple {
  canvas: HTMLCanvasElement;
  stop(): void;
  tick(dt?: number): void;
  destroy(): void;
}

type LiveWindow = Window & {
  stipple: LiveStipple;
  stippleMode: string;
  __lit: (instance: LiveStipple) => number;
  __host: () => HTMLElement;
};

/**
 * Installed before any module runs, because a helper defined out here cannot be
 * referenced from inside `page.evaluate` — that callback is serialised and
 * arrives in the page without its closure.
 */
const HELPERS = () => {
  const scope = window as unknown as LiveWindow;

  /**
   * Lit pixels of a canvas the main thread owns. The drawing buffer is not
   * preserved, so the read has to happen in the same task as the draw — a
   * `readPixels` one tick later comes back all zeros.
   */
  scope.__lit = (instance: LiveStipple): number => {
    instance.stop();
    for (let i = 0; i < 12; i++) instance.tick(16.667);

    const canvas = instance.canvas;
    const gl = canvas.getContext('webgl2');
    if (!gl || gl.isContextLost()) return -1;

    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let lit = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 8) lit++;
    return lit;
  };

  scope.__host = (): HTMLElement => {
    const node = document.createElement('div');
    node.style.cssText = 'width:220px;height:160px;position:relative';
    document.body.appendChild(node);
    return node;
  };
};

const open = async (page: Page, url = '/'): Promise<void> => {
  await page.addInitScript(HELPERS);
  await page.goto(url);
};

test.describe('WebGL context lifecycle', () => {
  test('twenty mount/destroy cycles do not exhaust the context pool', async ({ page }) => {
    const noise: string[] = [];
    page.on('console', (message) => {
      if (/too many active webgl|context lost/i.test(message.text())) noise.push(message.text());
    });

    await open(page);
    await page.waitForFunction(() => Boolean((window as unknown as LiveWindow).stipple));

    const lit = await page.evaluate(() => {
      const scope = window as unknown as LiveWindow;
      const Live = scope.stipple.constructor as new (
        host: HTMLElement,
        config: unknown,
      ) => LiveStipple;

      // Browsers cap live contexts at around sixteen and silently drop the
      // oldest past that, so twenty cycles is comfortably over the line.
      for (let i = 0; i < 20; i++) {
        const node = scope.__host();
        new Live(node, { count: 120, mode: 'container' }).destroy();
        node.remove();
      }

      const node = scope.__host();
      const survivor = new Live(node, { count: 600, mode: 'container' });
      const result = scope.__lit(survivor);
      survivor.destroy();
      node.remove();
      return result;
    });

    expect(lit).toBeGreaterThan(0);

    // The real assertion. Chrome logs this exact warning when the pool
    // overflows, and disabling `loseContext()` in `dispose()` produces six of
    // them across these twenty cycles — so that line is load-bearing, not
    // defensive decoration.
    expect(noise).toEqual([]);
  });

  test('a lost context is rebuilt and draws again', async ({ page }) => {
    await open(page);
    await page.waitForFunction(() => Boolean((window as unknown as LiveWindow).stipple));

    const scoped = (): Promise<number> =>
      page.evaluate(() => {
        const scope = window as unknown as LiveWindow;
        return scope.__lit(scope.stipple);
      });

    const before = await scoped();

    const outcome = await page.evaluate(async () => {
      const instance = (window as unknown as LiveWindow).stipple;
      const gl = instance.canvas.getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_lose_context');
      if (!ext) return { supported: false, wasLost: false };

      ext.loseContext();
      await new Promise((resolve) => setTimeout(resolve, 60));
      const wasLost = Boolean(gl?.isContextLost());

      ext.restoreContext();
      await new Promise((resolve) => setTimeout(resolve, 250));
      return { supported: true, wasLost };
    });

    test.skip(!outcome.supported, 'WEBGL_lose_context is unavailable on this runner');

    expect(before).toBeGreaterThan(0);
    expect(outcome.wasLost).toBe(true);
    expect(await scoped()).toBeGreaterThan(0);
  });
});

test.describe('worker mode', () => {
  test('transfers the canvas and renders off the main thread', async ({ page }) => {
    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') failures.push(message.text());
    });

    await open(page, '/?worker');
    await page.waitForFunction(() => (window as unknown as LiveWindow).stippleMode === 'worker');

    // The worker owns the drawing buffer, so the main thread cannot read it
    // back through WebGL. The element is still a valid image source, which is
    // enough to prove something was actually painted.
    const lit = await page.evaluate(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));

      const source = document.querySelector<HTMLCanvasElement>('#stage canvas');
      if (!source) return -1;

      const copy = document.createElement('canvas');
      copy.width = Math.min(source.width, 400);
      copy.height = Math.min(source.height, 400);
      const ctx = copy.getContext('2d');
      if (!ctx) return -1;

      ctx.drawImage(source, 0, 0, copy.width, copy.height);
      const { data } = ctx.getImageData(0, 0, copy.width, copy.height);

      let lit = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 8) lit++;
      return lit;
    });

    expect(failures).toEqual([]);
    // Measured at ~12,000 on a 300×150 read-back. A threshold well above zero
    // and well below it catches a blank or near-blank transfer without being
    // sensitive to how the field happens to be arranged.
    expect(lit).toBeGreaterThan(1000);
  });
});
