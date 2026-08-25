import { describe, expect, it, beforeAll } from 'vitest';

import { sampleShape } from '../src/sources/sample';
import { shapeFromImage } from '../src/sources/image';
import type { ImageSource, ShapeConfig } from '../src/core/types';

/**
 * jsdom has no 2D canvas, so the sampler's raster is stubbed with a plain
 * typed-array painter. This exercises the real hit-detection and colour-reading
 * code; only the pixel *production* is synthetic.
 */
type Painted = { width: number; height: number; data: Uint8ClampedArray };

let painted: Painted;

const stubImage = (width: number, height: number, fill: (x: number, y: number) => number[]) =>
  ({ width, height, __fill: fill }) as unknown as ImageSource;

beforeAll(() => {
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineCap: '',
    lineJoin: '',
    lineWidth: 1,
    setTransform: () => {},
    transform: () => {},
    clearRect: () => {
      painted.data.fill(0);
    },
    drawImage: (
      image: ImageSource & { __fill: (x: number, y: number) => number[] },
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ) => {
      const iw = (image as unknown as { width: number }).width;
      const ih = (image as unknown as { height: number }).height;
      for (let py = 0; py < painted.height; py++) {
        for (let px = 0; px < painted.width; px++) {
          const u = (px - dx) / dw;
          const v = (py - dy) / dh;
          if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
          const [r, g, b, a] = image.__fill(Math.floor(u * iw), Math.floor(v * ih));
          const o = (py * painted.width + px) * 4;
          painted.data[o] = r!;
          painted.data[o + 1] = g!;
          painted.data[o + 2] = b!;
          painted.data[o + 3] = a!;
        }
      }
    },
    fill: () => {},
    stroke: () => {},
    getImageData: () => ({ data: painted.data }),
  };

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
  };

  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = class {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
      painted = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
      return canvas as never;
    }
  };
  // The sampler caches its raster, so prime it at the size the tests use.
  painted = { width: 256, height: 144, data: new Uint8ClampedArray(256 * 144 * 4) };
  canvas.getContext = () => ctx;
});

const sample = (shape: ShapeConfig, count = 400) =>
  sampleShape(shape, count, 1280, 720, { maxRaster: 256, jitter: 0 });

describe('raster sources', () => {
  it('samples an opaque disc out of a transparent PNG-style image', () => {
    const image = stubImage(64, 64, (x, y) => {
      const dx = x - 32;
      const dy = y - 32;
      return Math.hypot(dx, dy) < 24 ? [255, 0, 0, 255] : [0, 0, 0, 0];
    });

    const result = sample(shapeFromImage(image, { scale: 1 }));
    expect(result.points.length).toBe(800);
    expect(result.colors).not.toBeNull();
  });

  it('reads real colour off the image', () => {
    const image = stubImage(64, 64, (x) => (x < 32 ? [255, 0, 0, 255] : [0, 0, 255, 255]));
    const result = sample(shapeFromImage(image, { scale: 1 }));

    const seen = new Set(Array.from(result.colors!));
    // 0x00BBGGRR packing: pure red is 0x0000FF, pure blue is 0xFF0000.
    expect(seen.has(0x0000ff)).toBe(true);
    expect(seen.has(0xff0000)).toBe(true);
  });

  it('treats a fully opaque photo as a solid rectangle under the alpha mask', () => {
    const photo = stubImage(64, 64, (x) => [x * 4, x * 4, x * 4, 255]);
    const result = sample(shapeFromImage(photo, { scale: 1 }));
    // Everything is opaque, so every pixel is ink — the whole frame.
    expect(result.points.length).toBeGreaterThan(0);
  });

  it('uses luminance so a photo becomes its dark regions, not a rectangle', () => {
    const photo = stubImage(64, 64, (x) => {
      const value = x < 20 ? 20 : 240;
      return [value, value, value, 255];
    });

    const dark = sample(shapeFromImage(photo, { scale: 1, mask: 'dark' }));
    const light = sample(shapeFromImage(photo, { scale: 1, mask: 'light' }));

    const xs = (r: { points: Float32Array }) => {
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < r.points.length; i += 2) {
        min = Math.min(min, r.points[i]!);
        max = Math.max(max, r.points[i]!);
      }
      return { min, max };
    };

    // The dark band sits on the left of the image, the light band on the right.
    expect(xs(dark).max).toBeLessThan(xs(light).min);
  });

  it('honours an explicit threshold', () => {
    const ramp = stubImage(64, 1, (x) => {
      const v = Math.round((x / 63) * 255);
      return [v, v, v, 255];
    });

    const tight = sample(shapeFromImage(ramp, { scale: 1, mask: 'dark', threshold: 0.2 }), 200);
    const loose = sample(shapeFromImage(ramp, { scale: 1, mask: 'dark', threshold: 0.9 }), 200);

    const span = (r: { points: Float32Array }) => {
      let max = -Infinity;
      for (let i = 0; i < r.points.length; i += 2) max = Math.max(max, r.points[i]!);
      return max;
    };

    expect(span(tight)).toBeLessThan(span(loose));
  });

  it('returns nothing for a zero-sized image rather than throwing', () => {
    const empty = stubImage(0, 0, () => [0, 0, 0, 0]);
    expect(sample(shapeFromImage(empty)).points.length).toBe(0);
  });
});

describe('shapeFromImage', () => {
  it('produces a shape with no paths and an image', () => {
    const image = stubImage(10, 10, () => [0, 0, 0, 255]);
    const shape = shapeFromImage(image, { mask: 'dark', threshold: 0.4, count: 900 });
    expect(shape.paths).toEqual([]);
    expect(shape.image).toBe(image);
    expect(shape.mask).toBe('dark');
    expect(shape.threshold).toBe(0.4);
    expect(shape.count).toBe(900);
  });

  it('omits optional keys it was not given', () => {
    const shape = shapeFromImage(stubImage(4, 4, () => [0, 0, 0, 255]));
    expect('mask' in shape).toBe(false);
    expect('threshold' in shape).toBe(false);
    expect('count' in shape).toBe(false);
  });
});
