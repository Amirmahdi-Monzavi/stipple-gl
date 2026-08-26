/* eslint-disable @typescript-eslint/require-await -- React's act() only returns an awaitable thenable when handed an async callback, so `await act(async () => ...)` is the documented pattern even where the body has nothing of its own to await. */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState, type FC } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useStipple } from '../src/react/useStipple';
import type { Stipple } from '../src/stipple';
import type { ShapeSupport } from '../src/core/types';
import { assignTargets } from '../src/sources/assign';
import { shapeBounds } from '../src/sources/sample';
import { installDomStubs, type DomStubHandle } from './support/dom-stub';

let stubs: DomStubHandle;

beforeAll(() => {
  stubs = installDomStubs();
  (globalThis as unknown as Record<string, unknown>)['IS_REACT_ACT_ENVIRONMENT'] = true;
});

afterAll(() => stubs.restore());

/**
 * A sampler that needs no 2D canvas, so the shape path can be exercised under
 * jsdom. Defined once at module scope: it is passed through the config, and a
 * fresh object here would read as a change like any other.
 */
const ringSampler: ShapeSupport = {
  sample(_shape, count, width, height) {
    const points = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      points[i * 2] = width * 0.5 + Math.cos(angle) * 180;
      points[i * 2 + 1] = height * 0.5 + Math.sin(angle) * 180;
    }
    return { points, colors: null };
  },
  bounds: shapeBounds,
  assign: assignTargets,
};

type AnyFn = (...args: never[]) => unknown;

/** Reach past `protected runtime` to the backend the engine is really driving. */
const backendOf = (instance: Stipple): Record<string, unknown> =>
  (instance as unknown as { runtime: { backend: Record<string, unknown> } }).runtime.backend;

/** Replace a backend method with a counting stand-in that still does the work. */
const watch = (instance: Stipple, method: string) => {
  const backend = backendOf(instance);
  const spy = vi.fn(backend[method] as AnyFn);
  backend[method] = spy;
  return spy;
};

interface Harness {
  instance: Stipple;
  rerender: () => Promise<void>;
  unmount: () => Promise<void>;
}

/**
 * Mounts a component whose `useStipple` config is written the way a caller
 * naturally writes it — as a literal in the component body — and hands back a
 * way to re-render the parent without changing a single value.
 */
const mountProbe = async (config: () => Record<string, unknown>): Promise<Harness> => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  let captured: Stipple | null = null;
  let bump: (() => void) | null = null;

  const Probe: FC = () => {
    const [, setTick] = useState(0);
    bump = () => setTick((tick) => tick + 1);
    const { ref, instance } = useStipple(config());
    captured = instance;
    return createElement('div', { ref });
  };

  await act(async () => {
    root.render(createElement(Probe));
  });

  if (!captured) throw new Error('useStipple never produced an instance');

  return {
    instance: captured,
    rerender: async () => {
      await act(async () => {
        bump?.();
      });
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
    },
  };
};

const active: Harness[] = [];

const probe = async (config: () => Record<string, unknown>): Promise<Harness> => {
  const harness = await mountProbe(config);
  active.push(harness);
  return harness;
};

afterEach(async () => {
  while (active.length) await active.pop()?.unmount();
  document.body.innerHTML = '';
});

describe('useStipple does not reconfigure the engine on an idle re-render', () => {
  it('mounts a real engine under jsdom', async () => {
    const { instance } = await probe(() => ({ count: 400, minorCount: 0 }));
    expect(instance).toBeTruthy();
    expect(typeof backendOf(instance)['precompute']).toBe('function');
  });

  it('leaves the backend alone when only scalars are passed', async () => {
    const { instance, rerender } = await probe(() => ({ count: 400, minorCount: 0 }));
    const spy = watch(instance, 'precompute');

    for (let i = 0; i < 5; i++) await rerender();

    expect(spy.mock.calls.length).toBe(0);
  });

  it('leaves the backend alone when an object-valued option is written inline', async () => {
    const { instance, rerender } = await probe(() => ({
      count: 400,
      minorCount: 0,
      color: { type: 'ramp', from: '#ffffff', to: '#000000', by: 'depth' },
    }));
    const spy = watch(instance, 'precompute');

    for (let i = 0; i < 5; i++) await rerender();

    expect(spy.mock.calls.length).toBe(0);
  });

  it('still applies a change when a value genuinely differs', async () => {
    let tone = '#ffffff';
    const { instance, rerender } = await probe(() => ({
      count: 400,
      minorCount: 0,
      color: { type: 'ramp', from: tone, to: '#000000', by: 'depth' },
    }));
    const spy = watch(instance, 'precompute');

    tone = '#ff0000';
    await rerender();

    expect(spy.mock.calls.length).toBeGreaterThan(0);
  });

  it('does not re-apply a shape written inline', async () => {
    const { instance, rerender } = await probe(() => ({
      count: 400,
      minorCount: 0,
      shapes: ringSampler,
      shape: { paths: [{ d: 'M0 0 L10 10', fill: '#ffffff' }] },
    }));
    const spy = vi.spyOn(instance, 'setShape');

    for (let i = 0; i < 5; i++) await rerender();

    expect(spy.mock.calls.length).toBe(0);
  });

  it('re-applies the shape when its contents genuinely change', async () => {
    let path = 'M0 0 L10 10';
    const { instance, rerender } = await probe(() => ({
      count: 400,
      minorCount: 0,
      shapes: ringSampler,
      shape: { paths: [{ d: path, fill: '#ffffff' }] },
    }));
    const spy = vi.spyOn(instance, 'setShape');

    path = 'M0 0 L20 20';
    await rerender();

    expect(spy.mock.calls.length).toBe(1);
  });
});
