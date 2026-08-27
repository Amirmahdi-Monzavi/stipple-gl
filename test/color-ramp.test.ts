import { describe, expect, it } from 'vitest';

import { Runtime } from '../src/core/runtime';
import { resolveOptions } from '../src/core/options';
import { createDefaultBehaviors } from '../src/behaviors';
import { assignTargets } from '../src/sources/assign';
import { shapeBounds } from '../src/sources/sample';
import type { ShapeConfig, ShapeSupport } from '../src/core/types';

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

const WIDTH = 1000;
const HEIGHT = 800;

/**
 * Half the particles land in a tight knot at the centre, half on a wide ring.
 *
 * A ramp `by: 'radius'` should therefore split cleanly into two groups: the
 * inner half near 0, the outer half near 1. Any shape where every particle sits
 * at the same distance would make the question unanswerable.
 */
const twoRingSampler: ShapeSupport = {
  sample(_shape, count, width, height) {
    const points = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 * 7;
      const radius = i < count / 2 ? 12 : 340;
      points[i * 2] = width * 0.5 + Math.cos(angle) * radius;
      points[i * 2 + 1] = height * 0.5 + Math.sin(angle) * radius;
    }
    return { points, colors: null };
  },
  bounds: shapeBounds,
  assign: assignTargets,
};

const boot = (
  color: unknown = { type: 'ramp', from: '#000000', to: '#ffffff', by: 'radius' },
): Runtime => {
  const runtime = new Runtime(
    stubSurface,
    resolveOptions({
      count: 800,
      minorCount: 0,
      shapes: twoRingSampler,
      behaviors: createDefaultBehaviors(),
      color: color as never,
      // Assign by index so a particle's destination does not depend on where it
      // happened to start; the question here is about colour, not routing.
      assign: 'index',
    }),
  );
  runtime.setResolution(WIDTH, HEIGHT, 1);
  return runtime;
};

const settle = (runtime: Runtime, frames: number): void => {
  for (let f = 0; f < frames; f++) runtime.step(f * 16.667, 16.667);
};

const shape = (): ShapeConfig => ({ paths: [{ d: 'M0 0', fill: '#fff' }] as never });

/**
 * How well the colour a particle is actually painted tracks where it actually is.
 *
 * Measured off `pack` — the buffer handed to the GPU — rather than off any
 * intermediate array, because the blend that makes a ramp follow its shape
 * happens in that pass. Reading `major.tint` measures the input to the
 * calculation instead of its result, which is how this test first passed
 * against a version of the fix that did nothing.
 *
 * The ramp runs black to white, so every channel carries the ramp position
 * directly and the low byte is as good as any.
 */
const paintedRampTracksPosition = (runtime: Runtime): number => {
  const backend = runtime.backend;
  const capacity = backend.capacity;
  const target = {
    floats: new Float32Array(capacity * 4),
    colors: new Uint32Array(capacity * 4),
  };

  const written = backend.pack(target, runtime.opts, runtime.state);
  expect(written).toBeGreaterThan(0);

  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;

  const tints: number[] = [];
  const radii: number[] = [];
  for (let n = 0; n < written; n++) {
    const o = n * 4;
    // pack stores positions normalised by the viewport.
    const x = target.floats[o]! * WIDTH;
    const y = target.floats[o + 1]! * HEIGHT;
    tints.push((target.colors[o + 3]! & 0xff) / 255);
    radii.push(Math.hypot(x - cx, y - cy));
  }

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const mt = mean(tints);
  const mr = mean(radii);

  let cov = 0;
  let vt = 0;
  let vr = 0;
  for (let n = 0; n < written; n++) {
    const dt = tints[n]! - mt;
    const dr = radii[n]! - mr;
    cov += dt * dr;
    vt += dt * dt;
    vr += dr * dr;
  }
  return cov / (Math.sqrt(vt * vr) || 1);
};

describe('a colour ramp follows the shape it is painting', () => {
  it('tracks position while dispersed', () => {
    const runtime = boot();
    settle(runtime, 60);

    // The control. In the spread the ramp is computed from exactly these
    // positions, so this establishes that the measurement can see agreement.
    expect(paintedRampTracksPosition(runtime)).toBeGreaterThan(0.9);
  });

  it('still tracks position once morphed into a shape', () => {
    const runtime = boot();
    runtime.state.targetMorph = 1;
    runtime.setShape(shape());
    settle(runtime, 900);

    expect(runtime.state.morph).toBe(1);

    // The particles now sit in two distinct rings. The gradient should describe
    // that, not the sphere they came from.
    expect(paintedRampTracksPosition(runtime)).toBeGreaterThan(0.9);
  });

  it('follows the shape when the ramp is switched on afterwards', () => {
    // The order the playground uses: pick a shape, then choose a colour mode.
    // Computing the shape-side ramp only inside setShape missed this entirely,
    // and the existing screenshot test is what caught it.
    const runtime = boot('#5ec8f2');
    runtime.state.targetMorph = 1;
    runtime.setShape(shape());
    settle(runtime, 900);

    runtime.setOptions({ color: { type: 'ramp', from: '#000000', to: '#ffffff', by: 'radius' } });
    settle(runtime, 10);

    expect(paintedRampTracksPosition(runtime)).toBeGreaterThan(0.9);
  });

  it('arrives gradually rather than snapping', () => {
    const runtime = boot();
    runtime.state.targetMorph = 1;
    runtime.setShape(shape());

    // Part-way in, the gradient should be neither the sphere's nor the shape's.
    settle(runtime, 14);
    expect(runtime.state.morph).toBeGreaterThan(0);
    expect(runtime.state.morph).toBeLessThan(1);

    const midway = paintedRampTracksPosition(runtime);
    settle(runtime, 900);
    const arrived = paintedRampTracksPosition(runtime);

    expect(arrived).toBeGreaterThan(midway);
  });
});
