import { describe, expect, it, vi } from 'vitest';

import { MorphEmitter } from '../src/core/emitter';
import type { ShapeConfig } from '../src/core/types';

const shape = (name: string): ShapeConfig => ({ paths: [{ d: 'M0 0', fill: name }] as never });

describe('event subscription', () => {
  it('delivers payloads to every listener', () => {
    const emitter = new MorphEmitter();
    const a = vi.fn();
    const b = vi.fn();
    emitter.on('shapechange', a);
    emitter.on('shapechange', b);

    emitter.shapeChanged(shape('logo'));

    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    expect(a.mock.calls[0]![0].shape).toEqual(shape('logo'));
  });

  it('returns an unsubscribe function', () => {
    const emitter = new MorphEmitter();
    const handler = vi.fn();
    const stop = emitter.on('shapechange', handler);

    stop();
    emitter.shapeChanged(null);

    expect(handler).not.toHaveBeenCalled();
  });

  it('supports off()', () => {
    const emitter = new MorphEmitter();
    const handler = vi.fn();
    emitter.on('shapechange', handler);
    emitter.off('shapechange', handler);
    emitter.shapeChanged(null);
    expect(handler).not.toHaveBeenCalled();
  });

  it('lets a handler unsubscribe itself mid-dispatch', () => {
    const emitter = new MorphEmitter();
    const calls: string[] = [];
    const first = () => {
      calls.push('first');
      emitter.off('shapechange', first);
    };
    emitter.on('shapechange', first);
    emitter.on('shapechange', () => calls.push('second'));

    expect(() => emitter.shapeChanged(null)).not.toThrow();
    expect(calls).toEqual(['first', 'second']);
    emitter.shapeChanged(null);
    expect(calls).toEqual(['first', 'second', 'second']);
  });

  it('ignores events nobody is listening for', () => {
    expect(() => new MorphEmitter().progress(0.5)).not.toThrow();
  });
});

describe('morph lifecycle', () => {
  it('emits start, progress and end in order', async () => {
    const emitter = new MorphEmitter();
    const seen: string[] = [];
    emitter.on('morphstart', () => seen.push('start'));
    emitter.on('morphprogress', () => seen.push('progress'));
    emitter.on('morphend', () => seen.push('end'));

    const settled = emitter.begin(0, 1, shape('logo'));
    emitter.progress(0.5);
    emitter.arrived(1);
    await settled;

    expect(seen).toEqual(['start', 'progress', 'end']);
  });

  it('resolves the promise only on arrival', async () => {
    const emitter = new MorphEmitter();
    let resolved = false;
    const settled = emitter.begin(0, 1, null).then(() => {
      resolved = true;
    });

    emitter.progress(0.9);
    await Promise.resolve();
    expect(resolved).toBe(false);

    emitter.arrived(1);
    await settled;
    expect(resolved).toBe(true);
  });

  it('reports the direction it is travelling', async () => {
    const emitter = new MorphEmitter();
    const start = vi.fn();
    emitter.on('morphstart', start);

    const settled = emitter.begin(1, 0, shape('logo'));
    emitter.arrived(0);
    await settled;

    expect(start.mock.calls[0]![0]).toMatchObject({ from: 1, to: 0 });
  });

  it('resolves immediately when there is nowhere to travel', async () => {
    const emitter = new MorphEmitter();
    const start = vi.fn();
    emitter.on('morphstart', start);
    await emitter.begin(1, 1, null);
    expect(start).not.toHaveBeenCalled();
  });

  it('settles a superseded morph as cancelled rather than rejecting', async () => {
    const emitter = new MorphEmitter();
    const end = vi.fn();
    emitter.on('morphend', end);

    const first = emitter.begin(0, 1, shape('a'));
    const second = emitter.begin(0.4, 0, shape('b'));

    await expect(first).resolves.toBeUndefined();

    emitter.arrived(0);
    await second;

    expect(end.mock.calls[0]![0].cancelled).toBe(true);
    expect(end.mock.calls[1]![0].cancelled).toBe(false);
  });

  it('ignores an arrival at a value it is not aiming for', async () => {
    const emitter = new MorphEmitter();
    const end = vi.fn();
    emitter.on('morphend', end);

    const settled = emitter.begin(0, 1, null);
    emitter.arrived(0.5);
    expect(end).not.toHaveBeenCalled();

    emitter.arrived(1);
    await settled;
    expect(end).toHaveBeenCalledOnce();
  });

  it('does not leave awaiters hanging when disposed', async () => {
    const emitter = new MorphEmitter();
    const settled = emitter.begin(0, 1, null);
    emitter.dispose();
    await expect(settled).resolves.toBeUndefined();
  });

  it('carries the shape through to morphend', async () => {
    const emitter = new MorphEmitter();
    const end = vi.fn();
    emitter.on('morphend', end);

    const settled = emitter.begin(0, 1, shape('logo'));
    emitter.arrived(1);
    await settled;

    expect(end.mock.calls[0]![0].shape).toEqual(shape('logo'));
  });
});
