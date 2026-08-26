import { describe, expect, it } from 'vitest';

import {
  clamp,
  clamp01,
  easeInOutCubic,
  easings,
  fibonacciSphere,
  hash2i,
  lerp,
  noise2,
  parseColor,
} from '../src/core/math';
import { packColor } from '../src/core/renderer';

describe('clamp', () => {
  it('bounds values on both sides', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(-2)).toBe(0);
  });
});

describe('lerp', () => {
  it('interpolates endpoints exactly', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});

describe('hash2i', () => {
  it('is deterministic for the same inputs', () => {
    expect(hash2i(3, 7)).toBe(hash2i(3, 7));
    expect(hash2i(-12, 900)).toBe(hash2i(-12, 900));
  });

  it('stays inside [0, 1)', () => {
    for (let x = -200; x < 200; x += 7) {
      for (let y = -200; y < 200; y += 11) {
        const value = hash2i(x, y);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  it('decorrelates neighbouring cells', () => {
    const a = hash2i(10, 10);
    const b = hash2i(11, 10);
    const c = hash2i(10, 11);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('noise2', () => {
  it('stays inside [0, 1]', () => {
    for (let i = 0; i < 2000; i++) {
      const value = noise2(i * 0.137, i * 0.061);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('is continuous across a cell boundary', () => {
    const left = noise2(3 - 1e-6, 2.4);
    const right = noise2(3 + 1e-6, 2.4);
    expect(Math.abs(left - right)).toBeLessThan(1e-4);
  });

  it('reproduces the same field for the same coordinates', () => {
    expect(noise2(12.5, 4.25)).toBe(noise2(12.5, 4.25));
  });

  it('uses no trigonometry in its hash', () => {
    const original = Math.sin;
    let calls = 0;
    Math.sin = (value: number) => {
      calls++;
      return original(value);
    };
    try {
      for (let i = 0; i < 100; i++) noise2(i * 0.3, i * 0.7);
    } finally {
      Math.sin = original;
    }
    expect(calls).toBe(0);
  });
});

describe('easings', () => {
  it('anchors every curve at 0 and 1', () => {
    for (const [name, fn] of Object.entries(easings)) {
      expect(fn(0), name).toBeCloseTo(0, 5);
      expect(fn(1), name).toBeCloseTo(1, 5);
    }
  });

  it('is monotonic for easeInOutCubic', () => {
    let previous = -Infinity;
    for (let t = 0; t <= 1; t += 0.01) {
      const value = easeInOutCubic(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('parseColor', () => {
  it('reads long hex', () => {
    expect(parseColor('#ff0000')).toEqual([1, 0, 0]);
    expect(parseColor('4f9c7d')).toEqual([79 / 255, 156 / 255, 125 / 255]);
  });

  it('expands short hex', () => {
    expect(parseColor('#0f0')).toEqual([0, 1, 0]);
  });

  it('reads rgb() and rgba()', () => {
    expect(parseColor('rgb(255, 0, 128)')).toEqual([1, 0, 128 / 255]);
    expect(parseColor('rgba(0, 255, 0, 0.5)')).toEqual([0, 1, 0]);
  });

  it('falls back on unparseable input', () => {
    expect(parseColor('not-a-color', [0.2, 0.3, 0.4])).toEqual([0.2, 0.3, 0.4]);
    expect(parseColor('')).toEqual([1, 1, 1]);
  });
});

describe('packColor', () => {
  it('round-trips through a Uint32Array as little-endian RGBA bytes', () => {
    const buffer = new ArrayBuffer(4);
    const words = new Uint32Array(buffer);
    const bytes = new Uint8Array(buffer);

    words[0] = packColor(1, 0.5, 0, 1);

    expect(bytes[0]).toBe(255);
    expect(bytes[1]).toBe(127);
    expect(bytes[2]).toBe(0);
    expect(bytes[3]).toBe(255);
  });
});

describe('fibonacciSphere', () => {
  it('produces unit-length vectors', () => {
    const out = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 200; i++) {
      fibonacciSphere(i, 200, out);
      const length = Math.hypot(out.x, out.y, out.z);
      expect(length).toBeCloseTo(1, 6);
    }
  });

  it('spreads points across both hemispheres', () => {
    const out = { x: 0, y: 0, z: 0 };
    let above = 0;
    for (let i = 0; i < 500; i++) {
      fibonacciSphere(i, 500, out);
      if (out.z > 0) above++;
    }
    expect(above).toBeGreaterThan(200);
    expect(above).toBeLessThan(300);
  });
});
