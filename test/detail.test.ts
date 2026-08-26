import { describe, expect, it, beforeAll } from 'vitest';

import { sampleShape } from '../src/sources/sample';
import { shapeFromImage } from '../src/sources/image';
import type { ImageSource, ShapeConfig, ShapeDetail } from '../src/core/types';

/** See image-source.test.ts — jsdom has no 2D canvas, so the raster is stubbed. */
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
      for (let py = 0; py < painted.height; py++) {
        for (let px = 0; px < painted.width; px++) {
          const u = (px - dx) / dw;
          const v = (py - dy) / dh;
          if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
          const [r, g, b, a] = image.__fill(
            Math.floor(u * image.width),
            Math.floor(v * image.height),
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

/**
 * A solid disc split into a dark half and a light half. Every pixel is ink, so
 * the only structure is the seam down the middle and the outer rim — exactly the
 * situation where uniform sampling produces a featureless blob.
 */
const splitDisc = stubImage(80, 80, (x, y) => {
  const dx = x - 40;
  const dy = y - 40;
  if (Math.hypot(dx, dy) > 34) return [0, 0, 0, 0];
  return x < 40 ? [20, 20, 20, 255] : [235, 235, 235, 255];
});

const sample = (detail: ShapeDetail, detailStrength?: number, count = 3000) => {
  const shape: ShapeConfig = { ...shapeFromImage(splitDisc, { scale: 1 }), detail };
  if (detailStrength !== undefined) shape.detailStrength = detailStrength;
  return sampleShape(shape, count, 256, 256, { maxRaster: 256, jitter: 0 });
};

/** Share of sampled points sitting within a few pixels of the seam. */
const nearSeam = (points: Float32Array): number => {
  let near = 0;
  let total = 0;
  for (let i = 0; i < points.length; i += 2) {
    total++;
    if (Math.abs(points[i]! - 128) < 6) near++;
  }
  return near / total;
};

/**
 * Share near *any* edge — the seam down the middle or the rim.
 *
 * The rim is a silhouette edge and a legitimate target, so measuring only the
 * seam understates the weighting: it is competing with a much longer boundary.
 */
const nearAnyEdge = (points: Float32Array): number => {
  let near = 0;
  let total = 0;
  for (let i = 0; i < points.length; i += 2) {
    total++;
    const radius = Math.hypot(points[i]! - 128, points[i + 1]! - 128);
    if (Math.abs(points[i]! - 128) < 3 || radius > 101) near++;
  }
  return near / total;
};

/** Distinct 4x4 cells touched — how much of the disc still has particles. */
const spread = (points: Float32Array): number => {
  const cells = new Set<number>();
  for (let i = 0; i < points.length; i += 2) {
    cells.add((Math.floor(points[i + 1]! / 4) << 8) | Math.floor(points[i]! / 4));
  }
  return cells.size;
};

/**
 * A flat black disc on transparent — the shape of every built-in icon, and the
 * degenerate case for edge detection: luminance is 0 inside *and* outside, so a
 * luminance-only gradient finds nothing and every weight comes out zero.
 */
const flatDisc = stubImage(80, 80, (x, y) =>
  Math.hypot(x - 40, y - 40) < 34 ? [0, 0, 0, 255] : [0, 0, 0, 0],
);

describe('flat single-colour shapes', () => {
  const sampleDisc = (detail: ShapeDetail, detailStrength: number) => {
    const shape: ShapeConfig = {
      ...shapeFromImage(flatDisc, { scale: 1 }),
      detail,
      detailStrength,
    };
    return sampleShape(shape, 2000, 256, 256, { maxRaster: 256, jitter: 0 });
  };

  const distinctPoints = (points: Float32Array): number => {
    const seen = new Set<string>();
    for (let i = 0; i < points.length; i += 2) {
      seen.add(points[i]!.toFixed(1) + ',' + points[i + 1]!.toFixed(1));
    }
    return seen.size;
  };

  it('does not collapse to a single point at full strength', () => {
    // Every built-in icon is flat black. Collapsing them all onto one pixel is
    // the failure this guards.
    expect(distinctPoints(sampleDisc('edges', 1).points)).toBeGreaterThan(50);
  });

  it('still finds the silhouette of a flat shape', () => {
    const { points } = sampleDisc('edges', 1);
    let nearRim = 0;
    let total = 0;
    for (let i = 0; i < points.length; i += 2) {
      total++;
      const r = Math.hypot(points[i]! - 128, points[i + 1]! - 128);
      if (r > 90) nearRim++;
    }
    // A flat disc's only edge is its rim, so that is where points should go.
    expect(nearRim / total).toBeGreaterThan(0.5);
  });

  it('falls back to uniform when nothing can be weighted', () => {
    const uniform = sampleDisc('uniform', 1);
    const density = sampleDisc('density', 0);
    expect(distinctPoints(density.points)).toBeGreaterThan(50);
    expect(density.points.length).toBe(uniform.points.length);
  });
});

describe('detail weighting', () => {
  it('spreads uniformly by default', () => {
    const a = sampleShape(shapeFromImage(splitDisc, { scale: 1 }), 3000, 256, 256, {
      maxRaster: 256,
      jitter: 0,
    });
    const b = sample('uniform');
    // No `detail` and `detail: 'uniform'` must agree.
    expect(Math.abs(nearSeam(a.points) - nearSeam(b.points))).toBeLessThan(0.05);
  });

  it('concentrates points on edges', () => {
    const uniform = nearAnyEdge(sample('uniform').points);
    const edges = nearAnyEdge(sample('edges').points);
    expect(edges).toBeGreaterThan(uniform * 1.5);
  });

  it('trades coverage for contour as strength rises', () => {
    const soft = sample('edges', 0.5);
    const strong = sample('edges', 1);

    expect(nearAnyEdge(strong.points)).toBeGreaterThan(nearAnyEdge(soft.points));
    // Full strength empties the flat interior; that is the point, and the cost.
    expect(spread(strong.points)).toBeLessThan(spread(soft.points));
  });

  it('keeps the field covered at the default strength', () => {
    const uniform = spread(sample('uniform').points);
    const dflt = spread(sample('edges').points);
    // The default is chosen to add contour without hollowing the shape out.
    expect(dflt).toBeGreaterThan(uniform * 0.8);
  });

  it('strength 0 is uniform whatever the mode', () => {
    const uniform = nearAnyEdge(sample('uniform').points);
    expect(Math.abs(nearAnyEdge(sample('edges', 0).points) - uniform)).toBeLessThan(0.05);
    expect(Math.abs(nearAnyEdge(sample('density', 0).points) - uniform)).toBeLessThan(0.05);
  });

  it('density favours the dark half', () => {
    const leftShare = (points: Float32Array): number => {
      let left = 0;
      for (let i = 0; i < points.length; i += 2) if (points[i]! < 128) left++;
      return left / (points.length / 2);
    };

    expect(leftShare(sample('density', 1).points)).toBeGreaterThan(
      leftShare(sample('uniform').points) + 0.1,
    );
  });

  it('still returns the full particle budget', () => {
    for (const detail of ['uniform', 'edges', 'density'] as const) {
      expect(sample(detail).points.length).toBe(6000);
    }
  });

  it('does not produce points outside the shape', () => {
    const { points } = sample('edges', 1);
    for (let i = 0; i < points.length; i += 2) {
      const dx = points[i]! - 128;
      const dy = points[i + 1]! - 128;
      expect(Math.hypot(dx, dy)).toBeLessThan(120);
    }
  });
});
