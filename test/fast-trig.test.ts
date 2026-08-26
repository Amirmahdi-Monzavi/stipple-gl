import { describe, expect, it } from 'vitest';

import { fastCos, fastSin } from '../src/core/math';

/**
 * The lookup exists to make `breathe` and `jelly` cheaper, and it is only
 * acceptable if it changes nothing anyone can see. These bounds are the
 * contract: the error must stay below what a Float32Array can represent
 * distinctly, so storing the result quantises the difference away.
 */
const FLOAT32_EPSILON = 1.19e-7;
const TOLERANCE = 5e-7;

const maxError = (
  fn: (x: number) => number,
  native: (x: number) => number,
  lo: number,
  hi: number,
) => {
  let worst = 0;
  for (let i = 0; i <= 200_000; i++) {
    const x = lo + ((hi - lo) * i) / 200_000;
    worst = Math.max(worst, Math.abs(native(x) - fn(x)));
  }
  return worst;
};

describe('fastSin / fastCos', () => {
  it('matches Math.sin across a full period', () => {
    expect(maxError(fastSin, Math.sin, 0, Math.PI * 2)).toBeLessThan(TOLERANCE);
  });

  it('matches Math.cos across a full period', () => {
    expect(maxError(fastCos, Math.cos, 0, Math.PI * 2)).toBeLessThan(TOLERANCE);
  });

  it('stays accurate far from the origin, where the phases actually live', () => {
    // `breathe` feeds it `seed * 10` with seeds up to 1000.
    expect(maxError(fastSin, Math.sin, 0, 10_000)).toBeLessThan(TOLERANCE);
  });

  it('stays accurate for negative input', () => {
    // Truncating instead of flooring the table index breaks exactly here.
    expect(maxError(fastSin, Math.sin, -10_000, 0)).toBeLessThan(TOLERANCE);
  });

  it('is exact enough that float32 storage cannot tell the difference', () => {
    const store = new Float32Array(1);
    let differing = 0;
    for (let i = 0; i < 50_000; i++) {
      const x = (i / 50_000) * 400;
      store[0] = Math.sin(x);
      const native = store[0];
      store[0] = fastSin(x);
      if (store[0] !== native) differing++;
    }
    // Some values land either side of a float32 boundary; the point is that the
    // gap is that small, not that it is literally zero.
    expect(maxError(fastSin, Math.sin, 0, 400)).toBeLessThan(FLOAT32_EPSILON * 5);
    expect(differing / 50_000).toBeLessThan(1);
  });

  it('hits the cardinal points', () => {
    expect(fastSin(0)).toBeCloseTo(0, 6);
    expect(fastSin(Math.PI / 2)).toBeCloseTo(1, 6);
    expect(fastSin(Math.PI)).toBeCloseTo(0, 6);
    expect(fastCos(0)).toBeCloseTo(1, 6);
    expect(fastCos(Math.PI)).toBeCloseTo(-1, 6);
  });

  it('wraps cleanly rather than reading off the end of the table', () => {
    for (const x of [Math.PI * 2 - 1e-9, Math.PI * 2, Math.PI * 2 + 1e-9, 1e6]) {
      expect(Number.isFinite(fastSin(x))).toBe(true);
      expect(Math.abs(fastSin(x))).toBeLessThanOrEqual(1);
    }
  });
});
