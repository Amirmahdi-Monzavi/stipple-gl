import { describe, expect, it } from 'vitest';

import { CpuBackend } from '../src/backends/cpu';
import { defaultOptions, resolveOptions } from '../src/core/options';
import { resolveChoreography } from '../src/core/choreography';
import type { StaggerOrder, Viewport } from '../src/core/types';

const viewport: Viewport = { width: 1280, height: 720, dpr: 1 };
const COUNT = 2000;

const layoutWith = (order: StaggerOrder) => {
  const backend = new CpuBackend();
  const options = resolveOptions({ count: COUNT, transition: { enter: { order } } });
  backend.init({ gl: null as never, options, viewport });
  backend.reallocate(COUNT, 0, viewport);
  backend.precompute(options);
  return backend.major;
};

/** Fraction of pairs whose delay order matches their key order. */
const concordance = (delay: Float32Array, key: Float32Array, count: number): number => {
  let agree = 0;
  let total = 0;
  for (let i = 0; i < count; i += 7) {
    for (let j = i + 1; j < count; j += 11) {
      if (key[i] === key[j]) continue;
      total++;
      const keyAscending = key[i]! < key[j]!;
      const delayAscending = delay[i]! < delay[j]!;
      if (keyAscending === delayAscending) agree++;
    }
  }
  return agree / total;
};

describe('sweep ordering', () => {
  it('orders launches left to right under order "x"', () => {
    const major = layoutWith('x');
    expect(concordance(major.delay, major.spreadX, COUNT)).toBeGreaterThan(0.99);
  });

  it('orders launches top to bottom under order "y"', () => {
    const major = layoutWith('y');
    expect(concordance(major.delay, major.spreadY, COUNT)).toBeGreaterThan(0.99);
  });

  it('leaves launches uncorrelated with position under order "random"', () => {
    const major = layoutWith('random');
    const agreement = concordance(major.delay, major.spreadX, COUNT);
    expect(agreement).toBeGreaterThan(0.4);
    expect(agreement).toBeLessThan(0.6);
  });

  it('spans the full timeline so the wavefront crosses the whole field', () => {
    const major = layoutWith('x');
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < COUNT; i++) {
      min = Math.min(min, major.delay[i]!);
      max = Math.max(max, major.delay[i]!);
    }
    expect(min).toBeLessThan(0.02);
    expect(max).toBeGreaterThan(0.98);
  });
});

describe('sweep defaults read as a wipe, not a flash', () => {
  const { stagger, flash } = resolveChoreography(defaultOptions.transition.enter);

  it('ships with the wavefront flash off', () => {
    expect(flash).toBe(0);
  });

  it('gives each particle a short flight relative to the launch spread', () => {
    const span = 1 - stagger;
    expect(span).toBeLessThan(0.25);
    expect(stagger).toBeGreaterThan(span * 3);
  });

  // Launches are not spread uniformly across the timeline: the volume-distributed
  // sphere is denser near the centre in x, so they cluster around the middle and
  // concurrency peaks there. Measured peak is ~32% of the field at morph 0.5,
  // against 100% for an unstaggered transition.
  it('keeps only a narrow band of the field in flight at any instant', () => {
    const major = layoutWith(resolveChoreography(defaultOptions.transition.enter).order);
    const span = 1 - stagger;

    const share = (morph: number): number => {
      let inFlight = 0;
      for (let i = 0; i < COUNT; i++) {
        const launch = major.delay[i]! * stagger;
        const local = (morph - launch) / span;
        if (local > 0 && local < 1) inFlight++;
      }
      return inFlight / COUNT;
    };

    expect(share(0.5)).toBeLessThan(0.35);
    expect(share(0.25)).toBeLessThan(0.25);
    expect(share(0.75)).toBeLessThan(0.25);
  });
});
