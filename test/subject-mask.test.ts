import { describe, expect, it, beforeAll } from 'vitest';

import { sampleShape } from '../src/sources/sample';
import { shapeFromImage } from '../src/sources/image';
import type { ImageSource, ShapeConfig } from '../src/core/types';

/**
 * Separating a subject from its background on opaque artwork.
 *
 * Luminance masking cannot tell a white glove from the white page behind it —
 * the pixels are identical. The only thing that distinguishes them is that one
 * is reachable from the edge of the image and the other is walled in by an
 * outline, which is what the flood measures.
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

const SIZE = 120;
const CENTRE = SIZE / 2;
const inside = (x: number, y: number, radius: number): boolean =>
  Math.hypot(x - CENTRE, y - CENTRE) < radius;

/**
 * A cartoon in the shape of the ones that prompted this: a dark outline, a
 * mid-tone body, and a white region sealed inside it. `background` is what
 * surrounds the figure — white for an opaque export, transparent for a cut-out.
 */
const cartoon =
  (background: number[]) =>
  (x: number, y: number): number[] => {
    // The white "glove", high in the body and fully enclosed.
    if (Math.hypot(x - CENTRE, y - CENTRE * 0.7) < 12) return [255, 255, 255, 255];
    if (inside(x, y, 40)) return [220, 30, 30, 255];
    if (inside(x, y, 44)) return [0, 0, 0, 255];
    return background;
  };

const WHITE_BACKGROUND = [255, 255, 255, 255];
const TRANSPARENT = [0, 0, 0, 0];

const sample = (shape: ShapeConfig, count = 3000) =>
  sampleShape(shape, count, SIZE * 2, SIZE * 2, { maxRaster: SIZE * 2, jitter: 0 });

/** How many sampled particles were painted white by the source artwork. */
const whiteShare = (shape: ShapeConfig): number => {
  const out = sample(shape);
  if (!out.colors || out.colors.length === 0) return 0;
  let white = 0;
  for (let i = 0; i < out.colors.length; i++) {
    const v = out.colors[i]!;
    if ((v & 0xff) > 220 && ((v >> 8) & 0xff) > 220 && ((v >> 16) & 0xff) > 220) white++;
  }
  return white / out.colors.length;
};

const build = (background: number[], mask?: ShapeConfig['mask']): ShapeConfig => {
  const shape = shapeFromImage(stubImage(SIZE, SIZE, cartoon(background)), {
    scale: 1,
    position: { x: 0.5, y: 0.5 },
  });
  if (mask) shape.mask = mask;
  return shape;
};

describe('an enclosed light region survives an opaque background', () => {
  it('keeps the white region when the artwork has transparency', () => {
    // The reference. Alpha masking has always handled this correctly.
    expect(whiteShare(build(TRANSPARENT))).toBeGreaterThan(0.03);
  });

  it('keeps it on an opaque background too, without being asked', () => {
    // The defect: luminance masking dropped every white pixel, glove included,
    // because it cannot tell the glove from the page. `auto` now floods first.
    expect(whiteShare(build(WHITE_BACKGROUND))).toBeGreaterThan(0.03);
  });

  it('samples the same artwork the same way either way', () => {
    // The two exports differ only in what surrounds the figure, so the figure
    // should come out the same. This is the assertion that would fail if the
    // flood leaked into the subject or stopped short of the border.
    const cutOut = whiteShare(build(TRANSPARENT));
    const opaqueExport = whiteShare(build(WHITE_BACKGROUND));
    expect(Math.abs(cutOut - opaqueExport)).toBeLessThan(0.02);
  });

  it('does not drag the background in with it', () => {
    // A filled rectangle is the other way to score well on the test above.
    const out = sample(build(WHITE_BACKGROUND));
    const rect = SIZE * 2;
    let corners = 0;
    for (let i = 0; i < out.points.length; i += 2) {
      const x = out.points[i]!;
      const y = out.points[i + 1]!;
      if (Math.hypot(x - rect / 2, y - rect / 2) > rect * 0.42) corners++;
    }
    expect(corners / (out.points.length / 2)).toBeLessThan(0.02);
  });
});

describe('the flood declines when it should', () => {
  it('falls back to a luminance split when the border is not one colour', () => {
    // A photograph has no uniform edge to seed from. Flooding anyway would
    // either swallow the image or stop dead, so it refuses and the previous
    // behaviour stands.
    const noisy = (x: number, y: number): number[] => {
      if (inside(x, y, 40)) return [220, 30, 30, 255];
      const n = ((x * 37 + y * 91) % 200) + 30;
      return [n, (n * 3) % 255, (n * 7) % 255, 255];
    };
    const shape = shapeFromImage(stubImage(SIZE, SIZE, noisy), {
      scale: 1,
      position: { x: 0.5, y: 0.5 },
    });
    const out = sample(shape);
    expect(out.points.length).toBeGreaterThan(0);
    expect(Number.isFinite(out.points[0]!)).toBe(true);
  });

  it('an explicit subject request still returns a shape when the flood refuses', () => {
    const flat = (): number[] => [128, 128, 128, 255];
    const shape = shapeFromImage(stubImage(SIZE, SIZE, flat), {
      scale: 1,
      position: { x: 0.5, y: 0.5 },
    });
    shape.mask = 'subject';
    const out = sample(shape);
    expect(Number.isFinite(out.points[0] ?? 0)).toBe(true);
  });
});
