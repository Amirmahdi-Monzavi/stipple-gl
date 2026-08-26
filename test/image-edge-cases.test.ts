import { describe, expect, it, beforeAll } from 'vitest';

import { sampleShape } from '../src/sources/sample';
import { shapeFromImage } from '../src/sources/image';
import type { ImageSource, ShapeConfig } from '../src/core/types';

/**
 * Degenerate raster input.
 *
 * The sampler runs on whatever a user drops on the page, so every one of these
 * has to come back with a usable answer or an empty result — never a throw, a
 * NaN coordinate, or a point outside the canvas.
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
    clearRect: () => painted.data.fill(0),
    drawImage: (
      image: { width: number; height: number; __fill: (x: number, y: number) => number[] },
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ) => {
      if (!(dw > 0) || !(dh > 0)) return;
      for (let py = 0; py < painted.height; py++) {
        for (let px = 0; px < painted.width; px++) {
          const u = (px - dx) / dw;
          const v = (py - dy) / dh;
          if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
          const [r, g, b, a] = image.__fill(
            Math.min(image.width - 1, Math.floor(u * image.width)),
            Math.min(image.height - 1, Math.floor(v * image.height)),
          );
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

  (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = class {
    constructor(w: number, h: number) {
      painted = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
      return { width: w, height: h, getContext: () => ctx };
    }
  };
});

const sample = (shape: ShapeConfig, count = 500) =>
  sampleShape(shape, count, 256, 256, { maxRaster: 256, jitter: 0 });

const sane = (points: Float32Array): boolean => {
  for (let i = 0; i < points.length; i++) {
    if (!Number.isFinite(points[i]!)) return false;
  }
  return true;
};

const opaque =
  (r = 0, g = 0, b = 0) =>
  (): number[] => [r, g, b, 255];

describe('degenerate image dimensions', () => {
  it('returns nothing for a zero-width image', () => {
    expect(sample(shapeFromImage(stubImage(0, 40, opaque()))).points.length).toBe(0);
  });

  it('returns nothing for a zero-height image', () => {
    expect(sample(shapeFromImage(stubImage(40, 0, opaque()))).points.length).toBe(0);
  });

  it('handles a 1x1 image', () => {
    const result = sample(shapeFromImage(stubImage(1, 1, opaque()), { scale: 1 }));
    expect(sane(result.points)).toBe(true);
  });

  it('handles an extreme aspect ratio', () => {
    const result = sample(shapeFromImage(stubImage(2000, 1, opaque()), { scale: 1 }));
    expect(sane(result.points)).toBe(true);
  });
});

describe('degenerate content', () => {
  it('returns nothing for a fully transparent image', () => {
    expect(sample(shapeFromImage(stubImage(40, 40, () => [0, 0, 0, 0]))).points.length).toBe(0);
  });

  it('returns nothing when the threshold excludes everything', () => {
    const black = shapeFromImage(stubImage(40, 40, opaque()), { mask: 'light', threshold: 0.9 });
    expect(sample(black).points.length).toBe(0);
  });

  it('falls back to uniform when a flat image has nothing to weight', () => {
    const flat: ShapeConfig = {
      ...shapeFromImage(stubImage(40, 40, opaque(128, 128, 128)), { scale: 1, mask: 'alpha' }),
      detail: 'density',
      detailStrength: 1,
    };
    const result = sample(flat);
    const distinct = new Set<string>();
    for (let i = 0; i < result.points.length; i += 2) {
      distinct.add(result.points[i]!.toFixed(1) + ',' + result.points[i + 1]!.toFixed(1));
    }
    expect(distinct.size).toBeGreaterThan(20);
  });
});

describe('mask auto-detection', () => {
  const detect = (fill: (x: number, y: number) => number[], width = 60, height = 60) =>
    sample(shapeFromImage(stubImage(width, height, fill), { scale: 1 }), 800);

  const spanOf = (points: Float32Array): number => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < points.length; i += 2) {
      min = Math.min(min, points[i]!);
      max = Math.max(max, points[i]!);
    }
    return max - min;
  };

  it('picks alpha when the image has real transparency', () => {
    // A disc cut out of a transparent field: the alpha channel is the shape.
    const disc = detect((x, y) =>
      Math.hypot(x - 30, y - 30) < 20 ? [10, 10, 10, 255] : [0, 0, 0, 0],
    );
    expect(spanOf(disc.points)).toBeLessThan(200);
  });

  it('picks a luminance mask for an opaque image, so it is not a rectangle', () => {
    // Dark mark on a white ground, fully opaque — the rose case.
    const mark = detect((x, y) =>
      Math.hypot(x - 30, y - 30) < 18 ? [20, 20, 20, 255] : [250, 250, 250, 255],
    );
    const everything = sample(
      shapeFromImage(
        stubImage(60, 60, (x, y) =>
          Math.hypot(x - 30, y - 30) < 18 ? [20, 20, 20, 255] : [250, 250, 250, 255],
        ),
        { scale: 1, mask: 'alpha' },
      ),
      800,
    );
    // Auto must find the mark; forced alpha finds the whole frame.
    expect(spanOf(mark.points)).toBeLessThan(spanOf(everything.points) * 0.75);
  });

  it('keeps the minority side when the ink is light on dark', () => {
    const mark = detect((x, y) =>
      Math.hypot(x - 30, y - 30) < 18 ? [245, 245, 245, 255] : [12, 12, 12, 255],
    );
    const forced = sample(
      shapeFromImage(
        stubImage(60, 60, (x, y) =>
          Math.hypot(x - 30, y - 30) < 18 ? [245, 245, 245, 255] : [12, 12, 12, 255],
        ),
        { scale: 1, mask: 'alpha' },
      ),
      800,
    );
    expect(spanOf(mark.points)).toBeLessThan(spanOf(forced.points) * 0.75);
  });

  it('is not fooled by a few antialiased edge pixels', () => {
    // Under 2% semi-transparent must not flip an otherwise opaque image to alpha,
    // and a light antialiased edge is not ink under a dark mask.
    const mark = detect((x, y) => {
      if (x === 0 && y < 36) return [250, 250, 250, 120];
      return Math.hypot(x - 30, y - 30) < 18 ? [20, 20, 20, 255] : [250, 250, 250, 255];
    });
    const forced = sample(
      shapeFromImage(
        stubImage(60, 60, (x, y) =>
          Math.hypot(x - 30, y - 30) < 18 ? [20, 20, 20, 255] : [250, 250, 250, 255],
        ),
        { scale: 1, mask: 'alpha' },
      ),
      800,
    );
    expect(spanOf(mark.points)).toBeLessThan(spanOf(forced.points) * 0.75);
  });

  it('honours an explicit mask over auto-detection', () => {
    const shape = shapeFromImage(
      stubImage(60, 60, (x, y) =>
        Math.hypot(x - 30, y - 30) < 18 ? [20, 20, 20, 255] : [250, 250, 250, 255],
      ),
      { scale: 1, mask: 'alpha' },
    );
    expect(shape.mask).toBe('alpha');
  });
});

describe('particle budget', () => {
  it('fills the requested count even from a single ink pixel', () => {
    const dot = stubImage(60, 60, (x, y) => (x === 30 && y === 30 ? [0, 0, 0, 255] : [0, 0, 0, 0]));
    const result = sample(shapeFromImage(dot, { scale: 1 }), 400);
    expect(result.points.length).toBe(800);
    expect(sane(result.points)).toBe(true);
  });

  it('handles a count of one', () => {
    const result = sample(shapeFromImage(stubImage(40, 40, opaque()), { scale: 1 }), 1);
    expect(result.points.length).toBe(2);
  });

  it('returns nothing for a count of zero', () => {
    expect(sample(shapeFromImage(stubImage(40, 40, opaque()), { scale: 1 }), 0).points.length).toBe(
      0,
    );
  });

  it('never places a point outside the canvas', () => {
    const result = sample(shapeFromImage(stubImage(60, 60, opaque()), { scale: 1 }), 600);
    for (let i = 0; i < result.points.length; i += 2) {
      expect(result.points[i]).toBeGreaterThanOrEqual(-2);
      expect(result.points[i]).toBeLessThanOrEqual(258);
      expect(result.points[i + 1]).toBeGreaterThanOrEqual(-2);
      expect(result.points[i + 1]).toBeLessThanOrEqual(258);
    }
  });
});

describe('out-of-range configuration', () => {
  it('survives a negative scale', () => {
    expect(() => sample(shapeFromImage(stubImage(40, 40, opaque()), { scale: -1 }))).not.toThrow();
  });

  it('survives a position outside the canvas', () => {
    const result = sample(
      shapeFromImage(stubImage(40, 40, opaque()), { scale: 1, position: { x: 5, y: -3 } }),
    );
    expect(sane(result.points)).toBe(true);
  });

  it('clamps a detailStrength outside 0..1', () => {
    for (const detailStrength of [-4, 9]) {
      const shape: ShapeConfig = {
        ...shapeFromImage(
          stubImage(60, 60, (x) => (x < 30 ? [0, 0, 0, 255] : [255, 255, 255, 255])),
          { scale: 1 },
        ),
        detail: 'edges',
        detailStrength,
      };
      const result = sample(shape, 300);
      expect(sane(result.points)).toBe(true);
      expect(result.points.length).toBe(600);
    }
  });
});
