import { describe, expect, it } from 'vitest';

import { assignTargets } from '../src/sources/assign';
import { defaultOptions, mergeOptions, resolveOptions } from '../src/core/options';
import { resolveChoreography } from '../src/core/choreography';

const ring = (count: number, cx: number, cy: number, radius: number): Float32Array => {
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    out[i * 2] = cx + Math.cos(angle) * radius;
    out[i * 2 + 1] = cy + Math.sin(angle) * radius;
  }
  return out;
};

const spread = (count: number, cx: number, cy: number, radius: number) => {
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    x[i] = cx + Math.cos(angle) * radius;
    y[i] = cy + Math.sin(angle) * radius;
  }
  return { x, y };
};

const totalTravel = (
  sx: Float32Array,
  sy: Float32Array,
  tx: Float32Array,
  ty: Float32Array,
  count: number,
): number => {
  let sum = 0;
  for (let i = 0; i < count; i++) sum += Math.hypot(tx[i]! - sx[i]!, ty[i]! - sy[i]!);
  return sum;
};

describe('assignTargets', () => {
  const count = 256;

  it('fills every target slot', () => {
    const points = ring(count, 500, 500, 100);
    const src = spread(count, 500, 500, 300);
    const tx = new Float32Array(count);
    const ty = new Float32Array(count);
    const tz = new Float32Array(count);

    assignTargets('angular', points, count, src.x, src.y, tx, ty, tz, 4);

    for (let i = 0; i < count; i++) {
      expect(Number.isFinite(tx[i]!)).toBe(true);
      expect(Number.isFinite(ty[i]!)).toBe(true);
      expect(tx[i]).not.toBe(0);
    }
  });

  it('assigns every point exactly once when counts match', () => {
    const points = ring(count, 500, 500, 100);
    const src = spread(count, 500, 500, 300);
    const tx = new Float32Array(count);
    const ty = new Float32Array(count);
    const tz = new Float32Array(count);

    assignTargets('angular', points, count, src.x, src.y, tx, ty, tz, 0);

    const seen = new Set<string>();
    for (let i = 0; i < count; i++) seen.add(tx[i]!.toFixed(3) + ':' + ty[i]!.toFixed(3));
    expect(seen.size).toBe(count);
  });

  it('travels far less than random assignment', () => {
    const points = ring(count, 500, 500, 120);
    const src = spread(count, 500, 500, 320);

    const ax = new Float32Array(count);
    const ay = new Float32Array(count);
    const az = new Float32Array(count);
    assignTargets('angular', points, count, src.x, src.y, ax, ay, az, 0);

    const rx = new Float32Array(count);
    const ry = new Float32Array(count);
    const rz = new Float32Array(count);
    assignTargets('random', points, count, src.x, src.y, rx, ry, rz, 0);

    const angular = totalTravel(src.x, src.y, ax, ay, count);
    const random = totalTravel(src.x, src.y, rx, ry, count);

    expect(angular).toBeLessThan(random);
  });

  it('reaches the optimal pairing for two concentric rings', () => {
    const inner = 120;
    const outer = 320;
    const points = ring(count, 500, 500, inner);
    const src = spread(count, 500, 500, outer);

    const tx = new Float32Array(count);
    const ty = new Float32Array(count);
    const tz = new Float32Array(count);
    assignTargets('angular', points, count, src.x, src.y, tx, ty, tz, 0);

    const travel = totalTravel(src.x, src.y, tx, ty, count);
    const optimal = count * (outer - inner);

    expect(travel).toBeLessThan(optimal * 1.001);
  });

  it('handles fewer sampled points than particles by cycling', () => {
    const points = ring(10, 500, 500, 100);
    const src = spread(count, 500, 500, 300);
    const tx = new Float32Array(count);
    const ty = new Float32Array(count);
    const tz = new Float32Array(count);

    assignTargets('index', points, count, src.x, src.y, tx, ty, tz, 0);

    for (let i = 0; i < count; i++) expect(Number.isFinite(tx[i]!)).toBe(true);
  });

  it('spreads z within the requested depth', () => {
    const points = ring(count, 500, 500, 100);
    const src = spread(count, 500, 500, 300);
    const tx = new Float32Array(count);
    const ty = new Float32Array(count);
    const tz = new Float32Array(count);

    assignTargets('angular', points, count, src.x, src.y, tx, ty, tz, 8);

    for (let i = 0; i < count; i++) {
      expect(Math.abs(tz[i]!)).toBeLessThanOrEqual(4);
    }
  });

  it('is a no-op for empty input', () => {
    const tx = new Float32Array(4);
    expect(() =>
      assignTargets(
        'angular',
        new Float32Array(0),
        4,
        new Float32Array(4),
        new Float32Array(4),
        tx,
        new Float32Array(4),
        new Float32Array(4),
        1,
      ),
    ).not.toThrow();
    expect(tx[0]).toBe(0);
  });
});

describe('mergeOptions', () => {
  it('merges nested groups without dropping siblings', () => {
    const merged = resolveOptions({ major: { size: 12 } });
    expect(merged.major.size).toBe(12);
    expect(merged.major.follow).toBe(defaultOptions.major.follow);
    expect(merged.minor.size).toBe(defaultOptions.minor.size);
  });

  it('replaces arrays and tuples wholesale', () => {
    const merged = resolveOptions({ emission: { burst: [4, 9] } });
    expect(merged.emission.burst).toEqual([4, 9]);
  });

  it('keeps functions intact', () => {
    const easing = (t: number) => t;
    const merged = resolveOptions({ transition: { enter: { easing } } });
    expect((merged.transition.enter as { easing: unknown }).easing).toBe(easing);
    expect(resolveChoreography(merged.transition.enter).speed).toBe(resolveChoreography(defaultOptions.transition.enter).speed);
  });

  it('ignores undefined but honours explicit null', () => {
    const merged = resolveOptions({ minorColor: null, color: undefined });
    expect(merged.minorColor).toBeNull();
    expect(merged.color).toBe(defaultOptions.color);
  });

  it('does not mutate the base object', () => {
    const base = resolveOptions();
    const size = base.major.size;
    mergeOptions(base, { major: { size: 99 } });
    expect(base.major.size).toBe(size);
  });
});
