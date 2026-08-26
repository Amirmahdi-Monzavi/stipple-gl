import { describe, expect, it, vi } from 'vitest';

import { Runtime } from '../src/core/runtime';
import { defaultOptions, mergeOptions, resolveOptions } from '../src/core/options';
import {
  resolveChoreography,
  mirrorChoreography,
  baseChoreography,
} from '../src/core/choreography';
import { behaviorOrder, sortBehaviors, PHASE_ORDER } from '../src/core/pipeline';
import { validateConfig } from '../src/core/validate';
import { createDefaultBehaviors } from '../src/behaviors';
import { assignTargets } from '../src/sources/assign';
import { shapeBounds } from '../src/sources/sample';
import type { AssignFn, Behavior, MajorState, ShapeConfig, ShapeSupport } from '../src/core/types';

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

const ringSampler = (radius: number, colors: number[] | null = null): ShapeSupport => ({
  sample(_shape, count, width, height) {
    const points = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      points[i * 2] = width * 0.5 + Math.cos(angle) * radius;
      points[i * 2 + 1] = height * 0.5 + Math.sin(angle) * radius;
    }
    return {
      points,
      colors: colors
        ? Uint32Array.from({ length: count }, (_, i) => colors[i % colors.length]!)
        : null,
    };
  },
  bounds: shapeBounds,
  assign: assignTargets,
});

const shape = (name: string): ShapeConfig => ({ paths: [{ d: 'M0 0', fill: name }] as never });

const boot = (radius = 200, support = ringSampler(radius)) => {
  const runtime = new Runtime(
    stubSurface,
    resolveOptions({
      count: 800,
      minorCount: 0,
      shapes: support,
      behaviors: createDefaultBehaviors(),
    }),
  );
  runtime.setResolution(1280, 720, 1);
  return runtime;
};

const majorOf = (runtime: Runtime): MajorState =>
  (runtime.backend as unknown as { major: MajorState }).major;

const settle = (runtime: Runtime, frames: number): void => {
  for (let f = 0; f < frames; f++) runtime.step(f * 16.667, 16.667);
};

// ---------------------------------------------------------------- API-1 / API-5

describe('choreography resolution', () => {
  it('expands every named choreography to a complete object', () => {
    for (const name of ['uniform', 'sweep', 'burst'] as const) {
      const resolved = resolveChoreography(name);
      for (const key of Object.keys(baseChoreography)) {
        expect(resolved[key as keyof typeof resolved], `${name}.${key}`).toBeDefined();
      }
    }
  });

  it('makes "uniform" actually turn the wavefront off', () => {
    expect(resolveChoreography('uniform').stagger).toBe(0);
  });

  it('lets a partial override only what it names', () => {
    const resolved = resolveChoreography({ stagger: 0.1 });
    expect(resolved.stagger).toBe(0.1);
    expect(resolved.order).toBe(baseChoreography.order);
    expect(resolved.speed).toBe(baseChoreography.speed);
  });

  it('mirrors the entry choreography at a gentler speed for the exit', () => {
    const enter = resolveChoreography('sweep');
    const exit = mirrorChoreography(enter);
    expect(exit.speed).toBeLessThan(enter.speed);
    expect(exit.order).toBe(enter.order);
    expect(exit.stagger).toBe(enter.stagger);
  });

  it('resolves the three slots onto frame state', () => {
    const runtime = boot();
    expect(runtime.state.choreo.enter.stagger).toBeGreaterThan(0);
    expect(runtime.state.choreo.exit.speed).toBeLessThan(runtime.state.choreo.enter.speed);
    expect(runtime.state.choreo.swap).not.toBeNull();
  });

  it('treats transition.swap "none" as no swap choreography', () => {
    const runtime = boot();
    runtime.setOptions({ transition: { swap: 'none' } });
    expect(runtime.state.choreo.swap).toBeNull();
  });
});

// ------------------------------------------------------------------------ API-2

describe('shape-to-shape swap', () => {
  it('interpolates between shapes instead of retargeting instantly', () => {
    const runtime = boot(240);
    runtime.state.targetMorph = 1;
    runtime.setShape(shape('first'));
    settle(runtime, 700);

    const major = majorOf(runtime);
    const firstTargets = Float32Array.from(major.shapeX.subarray(0, major.count));

    runtime.opts.shapes = ringSampler(60);
    runtime.setShape(shape('second'));

    // The outgoing shape must be preserved to interpolate from.
    expect(Array.from(major.prevShapeX.subarray(0, 8))).toEqual(
      Array.from(firstTargets.subarray(0, 8)),
    );
    expect(runtime.state.swapping).toBe(true);
    expect(runtime.state.swap).toBe(0);

    // Mid-swap, particles sit between the two rings, not on either.
    settle(runtime, 20);
    expect(runtime.state.swap).toBeGreaterThan(0);
    expect(runtime.state.swap).toBeLessThan(1);

    settle(runtime, 600);
    expect(runtime.state.swapping).toBe(false);
    expect(runtime.state.swap).toBe(1);
  });

  it('does not swap when the field is still showing the spread', () => {
    const runtime = boot();
    runtime.state.targetMorph = 0;
    runtime.setShape(shape('first'));
    runtime.setShape(shape('second'));
    expect(runtime.state.swapping).toBe(false);
  });

  it('honours a per-call choreography override', () => {
    const runtime = boot();
    runtime.state.targetMorph = 1;
    runtime.setShape(shape('first'));
    settle(runtime, 400);

    runtime.setShape(shape('second'), 'uniform');
    expect(runtime.state.choreo.swap?.stagger).toBe(0);
  });

  it('retargets instantly when the caller asks for none', () => {
    const runtime = boot();
    runtime.state.targetMorph = 1;
    runtime.setShape(shape('first'));
    settle(runtime, 400);

    runtime.setShape(shape('second'), 'none');
    expect(runtime.state.swapping).toBe(false);
  });
});

// ------------------------------------------------------------------------ API-6

describe('stagger order vocabulary', () => {
  it('no longer collides with assign mode names', () => {
    const orders: string[] = ['random', 'x', 'y', 'radial', 'radar'];
    const assigns: string[] = ['angular', 'index', 'random'];
    const overlap = orders.filter((o) => assigns.includes(o));
    // `random` is the one deliberate survivor; `angular` became `radar`.
    expect(overlap).toEqual(['random']);
    expect(orders).not.toContain('angular');
  });
});

// ------------------------------------------------------------------------ API-7

describe('setShape on a field with no major particles', () => {
  it('returns false and reports through onError', () => {
    const onError = vi.fn();
    const runtime = new Runtime(
      stubSurface,
      resolveOptions({
        count: 0,
        minorCount: 100,
        shapes: ringSampler(100),
        behaviors: createDefaultBehaviors(),
        onError,
      }),
    );
    runtime.setResolution(1280, 720, 1);

    expect(runtime.setShape(shape('nope'))).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]![0].message).toMatch(/no major particles/);
  });

  it('still accepts clearing the shape', () => {
    const runtime = boot();
    expect(runtime.setShape(null)).toBe(true);
  });
});

// ------------------------------------------------------------------------ API-8

describe('development validation', () => {
  const capture = (config: Parameters<typeof validateConfig>[0]): string[] => {
    const warnings: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
    validateConfig(config);
    spy.mockRestore();
    return warnings;
  };

  it('flags a misspelled option and suggests the real one', () => {
    const warnings = capture({ Count: 100 } as never);
    expect(warnings.join()).toMatch(/unknown option "Count"/);
    expect(warnings.join()).toMatch(/Did you mean "count"/);
  });

  it('flags an unknown nested option', () => {
    const warnings = capture({ major: { sizes: 4 } } as never);
    expect(warnings.join()).toMatch(/unknown option "major.sizes"/);
  });

  it('flags an out-of-range value', () => {
    expect(capture({ opacity: 4 }).join()).toMatch(/opacity is 4, outside the usable range 0..1/);
  });

  it('flags NaN', () => {
    expect(capture({ softness: Number.NaN }).join()).toMatch(/softness is NaN/);
  });

  it('flags a choreography name that does not exist', () => {
    expect(capture({ transition: { enter: 'swoosh' } } as never).join()).toMatch(
      /transition.enter is "swoosh"/,
    );
  });

  it('accepts the slot-specific keywords', () => {
    expect(capture({ transition: { exit: 'mirror', swap: 'none' } })).toEqual([]);
  });

  it('points at the rename when someone uses the old order name', () => {
    expect(capture({ transition: { enter: { order: 'angular' } } } as never).join()).toMatch(
      /"angular" was renamed to "radar"/,
    );
  });

  it('flags a stagger above the usable ceiling', () => {
    expect(capture({ transition: { enter: { stagger: 5 } } }).join()).toMatch(
      /transition.enter.stagger is 5/,
    );
  });

  it('warns that a zero-count field cannot form a shape', () => {
    expect(capture({ count: 0 }).join()).toMatch(/cannot form a shape/);
  });

  it('stays quiet on a valid config', () => {
    expect(
      capture({
        count: 2000,
        color: '#ffffff',
        transition: { enter: 'sweep', exit: 'mirror', swap: { speed: 0.02 } },
        major: { size: 5, settle: 0.1 },
      }),
    ).toEqual([]);
  });
});

// ------------------------------------------------------------------------ API-9

describe('resetOptions', () => {
  it('drops runtime tweaks but keeps injected capabilities', () => {
    const support = ringSampler(100);
    const behaviors = createDefaultBehaviors();
    const runtime = new Runtime(
      stubSurface,
      resolveOptions({ count: 800, shapes: support, behaviors }),
    );
    runtime.setResolution(1280, 720, 1);

    runtime.setOptions({ opacity: 0.2, major: { size: 20 }, transition: { enter: 'uniform' } });
    expect(runtime.opts.opacity).toBe(0.2);

    runtime.resetOptions();

    expect(runtime.opts.opacity).toBe(defaultOptions.opacity);
    expect(runtime.opts.major.size).toBe(defaultOptions.major.size);
    expect(runtime.state.choreo.enter.stagger).toBe(resolveChoreography('condense').stagger);
    expect(runtime.opts.shapes).toBe(support);
    expect(runtime.opts.behaviors).toBe(behaviors);
  });

  it('accepts a fresh config on the way back', () => {
    const runtime = boot();
    runtime.setOptions({ opacity: 0.1 });
    runtime.resetOptions({ opacity: 0.8 });
    expect(runtime.opts.opacity).toBe(0.8);
  });
});

// ----------------------------------------------------------------------- API-10

describe('behaviour phases', () => {
  it('maps every phase to a distinct slot in run order', () => {
    const values = Object.values(PHASE_ORDER);
    expect(new Set(values).size).toBe(values.length);
    expect(PHASE_ORDER.target).toBeLessThan(PHASE_ORDER.deform);
    expect(PHASE_ORDER.deform).toBeLessThan(PHASE_ORDER.force);
    expect(PHASE_ORDER.force).toBeLessThan(PHASE_ORDER.integrate);
    expect(PHASE_ORDER.integrate).toBeLessThan(PHASE_ORDER.ambient);
  });

  it('lets a custom behaviour pick a slot without knowing the numbers', () => {
    const custom: Behavior = { name: 'custom', phase: 'force', step: () => {} };
    expect(behaviorOrder(custom)).toBe(PHASE_ORDER.force);
  });

  it('prefers an explicit order over a phase', () => {
    expect(behaviorOrder({ name: 'x', phase: 'ambient', order: 5, step: () => {} })).toBe(5);
  });

  it('defaults an untagged behaviour to force, before integrate', () => {
    const untagged: Behavior = { name: 'untagged', step: () => {} };
    expect(behaviorOrder(untagged)).toBeLessThan(PHASE_ORDER.integrate);
  });

  it('keeps the built-in pipeline in its documented order', () => {
    expect(sortBehaviors(createDefaultBehaviors()).map((b) => b.name)).toEqual([
      'morph',
      'breathe',
      'jelly',
      'pointer',
      'shockwave',
      'integrate',
      'drift',
      'emission',
    ]);
  });

  it('is a stable sort for behaviours sharing a key', () => {
    const make = (name: string): Behavior => ({ name, phase: 'force', step: () => {} });
    const input = [make('a'), make('b'), make('c')];
    expect(sortBehaviors(input).map((b) => b.name)).toEqual(['a', 'b', 'c']);
  });
});

// ----------------------------------------------------------------------- API-11

describe('per-particle colour', () => {
  it('precomputes a ramp position spanning the field', () => {
    const runtime = new Runtime(
      stubSurface,
      resolveOptions({
        count: 1000,
        minorCount: 0,
        color: { type: 'ramp', from: '#000000', to: '#ffffff', by: 'radius' },
        behaviors: createDefaultBehaviors(),
      }),
    );
    runtime.setResolution(1280, 720, 1);

    const major = majorOf(runtime);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < major.count; i++) {
      min = Math.min(min, major.tint[i]!);
      max = Math.max(max, major.tint[i]!);
    }
    expect(min).toBeLessThan(0.15);
    expect(max).toBeGreaterThan(0.85);
  });

  it('carries sampled SVG colours through target assignment', () => {
    const red = 0x0000ff; // packed 0x00BBGGRR
    const blue = 0xff0000;
    const runtime = boot(200, ringSampler(200, [red, blue]));
    runtime.setShape(shape('tinted'));

    const major = majorOf(runtime);
    expect(major.hasShapeTint).toBe(true);

    const seen = new Set<number>();
    for (let i = 0; i < major.count; i++) seen.add(major.shapeTint[i]!);
    expect(seen).toEqual(new Set([red, blue]));
  });

  it('reports no tint when the source carried no fills', () => {
    const runtime = boot();
    runtime.setShape(shape('plain'));
    expect(majorOf(runtime).hasShapeTint).toBe(false);
  });
});

// -------------------------------------------------------------- assign function

describe('custom assign function', () => {
  it('is given full control of the pairing', () => {
    const custom: AssignFn = (points, count, _sx, _sy, outX, outY, outZ) => {
      for (let i = 0; i < count; i++) {
        outX[i] = points[0]!;
        outY[i] = points[1]!;
        outZ[i] = 0;
      }
    };

    const runtime = boot();
    runtime.setOptions({ assign: custom });
    runtime.setShape(shape('custom'));

    const major = majorOf(runtime);
    for (let i = 1; i < major.count; i++) {
      expect(major.shapeX[i]).toBe(major.shapeX[0]);
    }
  });
});

// ---------------------------------------------------------------- tagged unions

describe('merging a tagged union', () => {
  it('replaces a colour variant rather than merging its keys', () => {
    const ramp = { type: 'ramp' as const, from: '#000', to: '#fff', by: 'radius' as const };
    const merged = mergeOptions({ color: ramp }, { color: { type: 'shape', fallback: '#123' } });
    expect(merged.color).toEqual({ type: 'shape', fallback: '#123' });
    expect('from' in merged.color).toBe(false);
  });

  it('still merges two members of the same variant', () => {
    const ramp = { type: 'ramp' as const, from: '#000', to: '#fff', by: 'radius' as const };
    const merged = mergeOptions({ color: ramp }, { color: { type: 'ramp', to: '#f0f' } });
    expect(merged.color).toEqual({ type: 'ramp', from: '#000', to: '#f0f', by: 'radius' });
  });

  it('replaces a string colour with an object and back', () => {
    const toObject = mergeOptions(
      { color: '#abc' },
      { color: { type: 'shape', fallback: '#123' } },
    );
    expect(toObject.color).toEqual({ type: 'shape', fallback: '#123' });

    const toString = mergeOptions(toObject, { color: '#def' });
    expect(toString.color).toBe('#def');
  });

  it('leaves ordinary nested option groups merging as before', () => {
    const merged = mergeOptions({ major: { size: 6, twinkle: 0.2 } }, { major: { size: 9 } });
    expect(merged.major).toEqual({ size: 9, twinkle: 0.2 });
  });
});
