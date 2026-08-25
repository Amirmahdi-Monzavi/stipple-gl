import { describe, expect, it } from 'vitest';

import { Runtime } from '../src/core/runtime';
import { defaultOptions, mergeOptions, resolveOptions } from '../src/core/options';
import { createDefaultBehaviors } from '../src/behaviors';
import { presets } from '../src/presets';
import type {
  BackendContext,
  Behavior,
  SimulationBackend,
  StippleOptions,
} from '../src/core/types';

/**
 * A WebGL2 stand-in. Every constant reads as a number, every call returns a
 * truthy handle, which is enough for PointRenderer to link and configure.
 */
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

class RecordingBackend implements SimulationBackend {
  readonly name = 'recording';
  readonly capacity = 0;
  readonly majorCount = 0;
  readonly minorCount = 0;

  inits: Array<Behavior[] | null> = [];

  init(ctx: BackendContext): void {
    this.inits.push(ctx.options.behaviors);
  }
  reallocate(): void {}
  layout(): void {}
  precompute(): void {}
  setShape(): void {}
  step(): void {}
  pack(): number {
    return 0;
  }
  dispose(): void {}
}

const makeRuntime = (): { runtime: Runtime; backend: RecordingBackend; pipeline: Behavior[] } => {
  const backend = new RecordingBackend();
  const pipeline = createDefaultBehaviors();
  const options: StippleOptions = resolveOptions({
    behaviors: pipeline,
    backend: () => backend,
  });
  return { runtime: new Runtime(stubSurface, options), backend, pipeline };
};

describe('behaviour pipeline survives setOptions', () => {
  it('starts with the pipeline it was constructed with', () => {
    const { runtime, backend, pipeline } = makeRuntime();
    expect(runtime.opts.behaviors).toBe(pipeline);
    expect(backend.inits).toEqual([pipeline]);
  });

  it('does not let a defaults-derived config wipe the pipeline', () => {
    const { runtime, backend, pipeline } = makeRuntime();

    // This is exactly what the playground's preset switcher builds.
    runtime.setOptions(mergeOptions(defaultOptions, { ...presets.snap, mode: 'background' }));

    expect(runtime.opts.behaviors).toBe(pipeline);
    expect(backend.inits).toHaveLength(1);
  });

  it.each(Object.keys(presets) as Array<keyof typeof presets>)(
    'never ends up with an empty pipeline after switching to the %s preset',
    (name) => {
      const { runtime } = makeRuntime();
      runtime.setOptions(mergeOptions(defaultOptions, { ...presets[name], mode: 'background' }));

      const behaviors = runtime.opts.behaviors;
      expect(behaviors).not.toBeNull();
      expect(behaviors!.length).toBeGreaterThan(0);
    },
  );

  it('still honours a preset that supplies its own pipeline', () => {
    const { runtime, backend, pipeline } = makeRuntime();

    runtime.setOptions(mergeOptions(defaultOptions, { ...presets.starfield, mode: 'background' }));

    expect(runtime.opts.behaviors).not.toBe(pipeline);
    expect(backend.inits).toHaveLength(2);
    expect(backend.inits[1]).toBe(presets.starfield.behaviors);
  });

  it('keeps the SVG sampler a defaults-derived config would have nulled', () => {
    const backend = new RecordingBackend();
    const shapes = { sample: () => new Float32Array(0), bounds: () => ({}), assign: () => {} };
    const runtime = new Runtime(
      stubSurface,
      resolveOptions({
        behaviors: createDefaultBehaviors(),
        backend: () => backend,
        shapes: shapes as never,
      }),
    );

    runtime.setOptions(mergeOptions(defaultOptions, { ...presets.snap, mode: 'background' }));

    // Without this, setShape silently becomes a no-op after any preset switch.
    expect(runtime.opts.shapes).toBe(shapes);
  });

  it('accepts an explicit empty pipeline as a real request', () => {
    const { runtime, backend } = makeRuntime();

    runtime.setOptions({ behaviors: [] });

    expect(runtime.opts.behaviors).toEqual([]);
    expect(backend.inits).toHaveLength(2);
  });
});
