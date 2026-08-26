import { expect, test } from '@playwright/test';

import { advance, canvas, chooseShape, openPlayground, setColourMode, setDetail } from './harness';

test.beforeEach(async ({ page }) => {
  await openPlayground(page);
});

test.describe('the field renders', () => {
  test('dispersed sphere', async ({ page }) => {
    await chooseShape(page, 'none');
    await expect(canvas(page)).toHaveScreenshot('spread.png');
  });

  test('morphed into a shape', async ({ page }) => {
    await chooseShape(page, 'shield');
    await expect(canvas(page)).toHaveScreenshot('shield.png');
  });

  test('mid-transition', async ({ page }) => {
    await chooseShape(page, 'none');
    await page.evaluate(() => {
      const chip = [...document.querySelectorAll('.chip')].find((c) => c.textContent === 'gear');
      (chip as HTMLButtonElement).click();
    });
    // Far enough in that the wavefront is visible, not so far that it has landed.
    await advance(page, 26);
    await expect(canvas(page)).toHaveScreenshot('mid-transition.png');
  });
});

test.describe('showpieces', () => {
  for (const name of ['hilbert', 'mandala', 'spiro', 'knot', 'sunflower', 'tree', 'waves']) {
    test(name, async ({ page }) => {
      await chooseShape(page, name);
      await expect(canvas(page)).toHaveScreenshot(`showpiece-${name}.png`);
    });
  }
});

test.describe('detail weighting', () => {
  test('uniform fills the mass', async ({ page }) => {
    await chooseShape(page, 'heart');
    await setDetail(page, 'uniform');
    await expect(canvas(page)).toHaveScreenshot('detail-uniform.png');
  });

  test('edges finds the contour', async ({ page }) => {
    await chooseShape(page, 'heart');
    await setDetail(page, 'edges', 1);
    await expect(canvas(page)).toHaveScreenshot('detail-edges.png');
  });
});

test.describe('colour', () => {
  test('a ramp across the field', async ({ page }) => {
    await chooseShape(page, 'ring');
    await setColourMode(page, 'ramp');
    await expect(canvas(page)).toHaveScreenshot('colour-ramp.png');
  });
});

test.describe('the canvas is not blank', () => {
  /**
   * A screenshot baseline catches a change. This catches the failure mode that
   * has actually happened in this project before: the canvas compositing black
   * while the simulation runs perfectly, which a first-run baseline would
   * happily record as correct.
   */
  test('draws a meaningful number of lit pixels', async ({ page }) => {
    await chooseShape(page, 'shield');

    const lit = await page.evaluate(() => {
      const element = document.querySelector('#stage canvas') as HTMLCanvasElement;
      const probe = document.createElement('canvas');
      probe.width = element.width;
      probe.height = element.height;
      const ctx = probe.getContext('2d')!;

      // Draw and read in the same task. The context is created without
      // `preserveDrawingBuffer`, so the buffer is discarded once the compositor
      // has taken it — a read on any later turn comes back all zeros, which
      // looks exactly like a rendering bug and is not one.
      (window as unknown as { stipple: { tick(dt: number): void } }).stipple.tick(16.667);
      ctx.drawImage(element, 0, 0);

      const { data } = ctx.getImageData(0, 0, probe.width, probe.height);

      let visible = 0;
      let brightest = 0;
      for (let i = 0; i < data.length; i += 4) {
        const value = Math.max(data[i]!, data[i + 1]!, data[i + 2]!);
        if (data[i + 3]! > 8 && value > 24) visible++;
        brightest = Math.max(brightest, value);
      }
      return { visible, brightest, total: probe.width * probe.height };
    });

    expect(lit.brightest).toBeGreaterThan(80);
    expect(lit.visible / lit.total).toBeGreaterThan(0.005);
  });
});
