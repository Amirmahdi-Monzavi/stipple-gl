import { describe, expect, it } from 'vitest';

import { Runtime } from '../src/core/runtime';
import { defaultOptions, mergeOptions, resolveOptions } from '../src/core/options';
import { createDefaultBehaviors } from '../src/behaviors';
import { assignTargets } from '../src/sources/assign';
import { shapeBounds } from '../src/sources/sample';
import { presets } from '../src/presets';
import type { MajorState, ShapeConfig, ShapeSupport } from '../src/core/types';

/** See test/behaviors.test.ts — a WebGL2 stand-in good enough to link and draw. */
const stubGl = new Proxy(
  {},
  {
    get(_target, prop) {
      if (typeof prop === 'string' && /^[A-Z][A-Z0-9_]*$/.test(prop)) return 1;
      return () => ({});
    },
  },
) as unknown as WebGL2RenderingContext;

const stubSurface = { getContext: () => stubGl } as unknown as HTMLCanvasElement;

/**
 * jsdom has no 2D canvas, so the real rasteriser cannot run here. Target
 * assignment and bounds are the genuine implementations; only the point cloud
 * is synthetic. SVG parsing and sampling are covered by svg.test.ts.
 */
const ringSampler = (radius: number): ShapeSupport => ({
  sample(_shape, count, width, height) {
    const points = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      points[i * 2] = width * 0.5 + Math.cos(angle) * radius;
      points[i * 2 + 1] = height * 0.5 + Math.sin(angle) * radius;
    }
    return { points, colors: null };
  },
  bounds: shapeBounds,
  assign: assignTargets,
});

const shape = (name: string): ShapeConfig => ({ paths: [{ d: 'M0 0', fill: name }] as never });

const boot = (radius = 200) => {
  const runtime = new Runtime(
    stubSurface,
    resolveOptions({
      count: 1200,
      minorCount: 0,
      shapes: ringSampler(radius),
      behaviors: createDefaultBehaviors(),
    }),
  );
  runtime.setResolution(1280, 720, 1);
  return runtime;
};

const majorOf = (runtime: Runtime): MajorState =>
  (runtime.backend as unknown as { major: MajorState }).major;

/** Mean distance from each particle to the shape target it was assigned. */
const meanDistanceToTarget = (runtime: Runtime): number => {
  const major = majorOf(runtime);
  let sum = 0;
  for (let i = 0; i < major.count; i++) {
    sum += Math.hypot(major.x[i]! - major.shapeX[i]!, major.y[i]! - major.shapeY[i]!);
  }
  return sum / major.count;
};

const settle = (runtime: Runtime, frames: number): void => {
  for (let f = 0; f < frames; f++) runtime.step(f * 16.667, 16.667);
};

describe('changing shape after a preset switch', () => {
  it('still converges on the new shape', () => {
    const runtime = boot(200);
    runtime.state.targetMorph = 1;
    runtime.setShape(shape('first'));
    settle(runtime, 900);

    expect(meanDistanceToTarget(runtime)).toBeLessThan(12);

    // Switch preset exactly the way the playground does.
    runtime.setOptions(mergeOptions(defaultOptions, { ...presets.snap, mode: 'background' }));
    runtime.setCount(presets.snap.count!, presets.snap.minorCount!);

    // Then pick a different shape.
    runtime.setShape(shape('second'));
    settle(runtime, 900);

    expect(meanDistanceToTarget(runtime)).toBeLessThan(12);
  });

  it('keeps morphing after switching back to the first preset', () => {
    const runtime = boot(200);
    runtime.state.targetMorph = 1;

    runtime.setOptions(mergeOptions(defaultOptions, { ...presets.snap, mode: 'background' }));
    runtime.setOptions(mergeOptions(defaultOptions, { ...presets.morph, mode: 'background' }));

    runtime.setShape(shape('after round trip'));
    settle(runtime, 900);

    expect(meanDistanceToTarget(runtime)).toBeLessThan(12);
  });

  it('moves particles at all after any preset switch', () => {
    for (const name of Object.keys(presets) as Array<keyof typeof presets>) {
      const runtime = boot();
      runtime.setOptions(mergeOptions(defaultOptions, { ...presets[name], mode: 'background' }));
      runtime.setCount(1200, 0);

      const major = majorOf(runtime);
      const beforeX = Float32Array.from(major.x.subarray(0, major.count));

      settle(runtime, 120);

      let moved = 0;
      for (let i = 0; i < major.count; i++) {
        if (Math.abs(major.x[i]! - beforeX[i]!) > 0.001) moved++;
      }
      expect(moved, `preset "${name}" left every particle frozen`).toBeGreaterThan(0);
    }
  });
});

describe('returning to the spread', () => {
  it('does not snap back in a single frame', () => {
    const runtime = boot(200);
    runtime.state.targetMorph = 1;
    runtime.setShape(shape('held'));
    settle(runtime, 900);

    runtime.state.targetMorph = 0;
    runtime.step(20_000, 16.667);

    expect(runtime.state.morph).toBeGreaterThan(0.9);
  });

  it('honours returnSpeed independently of speed', () => {
    const slow = boot(200);
    slow.state.morph = 1;
    slow.state.targetMorph = 0;
    slow.setOptions({ transition: { enter: { speed: 0.2 }, exit: { speed: 0.004 } } });

    const fast = boot(200);
    fast.state.morph = 1;
    fast.state.targetMorph = 0;
    fast.setOptions({ transition: { enter: { speed: 0.2 }, exit: { speed: 0.2 } } });

    for (let f = 0; f < 30; f++) {
      slow.step(f * 16.667, 16.667);
      fast.step(f * 16.667, 16.667);
    }

    expect(fast.state.morph).toBeLessThan(slow.state.morph);
    expect(slow.state.morph).toBeGreaterThan(0.8);
  });

  it('falls back to speed when returnSpeed is null', () => {
    const runtime = boot(200);
    runtime.state.morph = 1;
    runtime.state.targetMorph = 0;
    runtime.setOptions({ transition: { exit: { speed: 0.05 } } });

    const before = runtime.state.morph;
    runtime.step(16.667, 16.667);

    expect(runtime.state.morph).toBeCloseTo(before - before * 0.05, 5);
  });
});
