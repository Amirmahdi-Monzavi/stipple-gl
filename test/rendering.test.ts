import { describe, expect, it } from 'vitest';

import { CpuBackend } from '../src/backends/cpu';
import { resolveOptions } from '../src/core/options';
import { createDefaultBehaviors } from '../src/behaviors';
import { baseChoreography } from '../src/core/choreography';
import { presets } from '../src/presets';
import type { FrameState, StippleConfig, StippleOptions, Viewport } from '../src/core/types';

const viewport: Viewport = { width: 1280, height: 720, dpr: 1 };

const frameState = (): FrameState => ({
  time: 0,
  dt: 16.667,
  dtScale: 1,
  frame: 0,
  spin: 0,
  morph: 0,
  targetMorph: 0,
  hasShape: false,
  shapeColor: null,
  viewport,
  pointer: { x: 0, y: 0, active: false, down: false },
  shockwaves: [],
  camera: { scale: 1, offsetX: 0, offsetY: 0 },
  swap: 1,
  swapping: false,
  choreo: { enter: baseChoreography, exit: baseChoreography, swap: null },
});

const boot = (config: StippleConfig): { backend: CpuBackend; options: StippleOptions } => {
  const options = resolveOptions({
    ...config,
    behaviors: config.behaviors ?? createDefaultBehaviors(),
  });
  const backend = new CpuBackend();
  backend.init({ gl: null as never, options, viewport });
  backend.reallocate(options.count, options.minorCount, viewport);
  backend.precompute(options);
  return { backend, options };
};

const packAll = (backend: CpuBackend, options: StippleOptions, state: FrameState) => {
  const cap = backend.capacity;
  const target = { floats: new Float32Array(cap * 4), colors: new Uint32Array(cap * 4) };
  const count = backend.pack(target, options, state);
  return { target, count };
};

describe('camera-aware culling', () => {
  // The spread sphere's radius is hypot(w, h) * 0.5 * spread.radius, which at the
  // default 0.62 is ~455px against a 360px half-height: it genuinely extends past
  // the top and bottom of the viewport. Culling against the raw viewport rect used
  // to drop those particles permanently, so zooming out revealed a hard horizontal
  // crop instead of the rest of the sphere.
  it('keeps particles the camera will pull back into view when zoomed out', () => {
    // Pinned rather than inherited: the assertions below depend on the sphere
    // overflowing the viewport, and that is a default which can legitimately move.
    const { backend, options } = boot({ count: 4000, minorCount: 0, spread: { radius: 0.62 } });
    const state = frameState();
    backend.step(state, options);

    const atRest = packAll(backend, options, state).count;

    state.camera.scale = 0.5;
    const zoomedOut = packAll(backend, options, state).count;

    expect(atRest).toBeLessThan(4000);
    expect(zoomedOut).toBeGreaterThan(atRest);
    expect(zoomedOut).toBe(4000);
  });

  it('culls more aggressively when zoomed in', () => {
    // Pinned rather than inherited: the assertions below depend on the sphere
    // overflowing the viewport, and that is a default which can legitimately move.
    const { backend, options } = boot({ count: 4000, minorCount: 0, spread: { radius: 0.62 } });
    const state = frameState();
    backend.step(state, options);

    const atRest = packAll(backend, options, state).count;

    state.camera.scale = 2;
    expect(packAll(backend, options, state).count).toBeLessThan(atRest);
  });

  it('follows the camera offset', () => {
    // Pinned rather than inherited: the assertions below depend on the sphere
    // overflowing the viewport, and that is a default which can legitimately move.
    const { backend, options } = boot({ count: 4000, minorCount: 0, spread: { radius: 0.62 } });
    const state = frameState();
    backend.step(state, options);

    state.camera.offsetX = 0.6;
    const shifted = packAll(backend, options, state);

    let maxX = -Infinity;
    for (let i = 0; i < shifted.count; i++) {
      maxX = Math.max(maxX, shifted.target.floats[i * 4]! * viewport.width);
    }
    // Panning right brings content from the left edge in, so the surviving set
    // must not extend as far right as an unpanned frame.
    expect(maxX).toBeLessThan(viewport.width + 64);
  });

  it('survives a degenerate camera scale', () => {
    const { backend, options } = boot({ count: 500, minorCount: 0 });
    const state = frameState();
    backend.step(state, options);

    state.camera.scale = 0;
    expect(() => packAll(backend, options, state)).not.toThrow();
  });
});

describe('every preset puts something visible on screen', () => {
  // `dust` once shipped at 0.06% ink — 183 faint 2px dots on a 1280x720 canvas,
  // which read as an empty screen. This is the floor that catches that.
  it.each(Object.keys(presets) as Array<keyof typeof presets>)('%s', (name) => {
    const { backend, options } = boot(presets[name]);
    const state = frameState();
    for (let f = 0; f < 60; f++) {
      state.time = f * 16.667;
      state.frame = f;
      backend.step(state, options);
    }

    const { target, count } = packAll(backend, options, state);
    expect(count).toBeGreaterThan(0);

    let visible = 0;
    let sizeSum = 0;
    for (let i = 0; i < count; i++) {
      const alpha = ((target.colors[i * 4 + 3]! >>> 24) / 255) * options.opacity;
      sizeSum += target.floats[i * 4 + 2]!;
      if (alpha > 0.08) visible++;
    }

    const meanSize = sizeSum / count;
    const inked = (visible * Math.PI * (meanSize / 2) ** 2) / (viewport.width * viewport.height);

    expect(visible, `${name} packs particles but none are above the alpha floor`).toBeGreaterThan(
      0,
    );
    expect(inked, `${name} inks only ${(inked * 100).toFixed(3)}% of the canvas`).toBeGreaterThan(
      0.004,
    );
  });
});
