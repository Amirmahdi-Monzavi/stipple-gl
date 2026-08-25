import { describe, expect, it } from 'vitest';

import { droppedKeys, sanitizeConfig } from '../src/worker/protocol';
import { easings, resolveEasing, easeInOutCubic } from '../src/core/math';
import { resolveOptions } from '../src/core/options';

describe('sanitizeConfig', () => {
  it('keeps plain values intact', () => {
    const result = sanitizeConfig({
      count: 4000,
      color: '#ff0000',
      major: { size: 8, twinkle: 0.4 },
      spread: { pan: { x: 0.1, y: -0.2 } },
    });

    expect(result.count).toBe(4000);
    expect(result.color).toBe('#ff0000');
    expect(result.major).toEqual({ size: 8, twinkle: 0.4 });
    expect(result.spread).toEqual({ pan: { x: 0.1, y: -0.2 } });
  });

  it('survives structuredClone, which postMessage requires', () => {
    const result = sanitizeConfig({
      count: 1200,
      transition: { easing: 'outExpo', stagger: 0.4 },
      emission: { burst: [2, 5] },
    });

    expect(() => structuredClone(result)).not.toThrow();
    expect(structuredClone(result)).toEqual(result);
  });

  it('drops function-valued options and reports them', () => {
    const result = sanitizeConfig({
      count: 100,
      transition: { easing: (t: number) => t },
      onReady: () => undefined,
      onError: () => undefined,
    });

    expect(result.transition).toEqual({});
    expect('onReady' in result).toBe(false);
    expect(droppedKeys).toContain('transition.easing');
    expect(droppedKeys).toContain('onReady');
    expect(() => structuredClone(result)).not.toThrow();
  });

  it('drops the non-transferable capability slots', () => {
    const result = sanitizeConfig({
      behaviors: [{ name: 'x', step: () => undefined }],
      backend: () => ({}) as never,
    });

    expect('behaviors' in result).toBe(false);
    expect('backend' in result).toBe(false);
    expect(droppedKeys).toContain('behaviors');
    expect(droppedKeys).toContain('backend');
  });

  it('preserves a named easing so the worker can rebuild it', () => {
    const result = sanitizeConfig({ transition: { easing: 'outBack' } });
    expect(result.transition?.easing).toBe('outBack');
    expect(droppedKeys).not.toContain('transition.easing');
  });

  it('reports nothing dropped for an already-serialisable config', () => {
    sanitizeConfig({ count: 10, color: '#fff' });
    expect(droppedKeys).toEqual([]);
  });

  it('tolerates undefined input', () => {
    expect(() => sanitizeConfig(undefined)).not.toThrow();
    expect(sanitizeConfig(undefined)).toEqual({});
  });
});

describe('resolveEasing', () => {
  it('passes functions straight through', () => {
    const custom = (t: number) => t * t;
    expect(resolveEasing(custom)).toBe(custom);
  });

  it('resolves every documented name', () => {
    for (const name of Object.keys(easings) as Array<keyof typeof easings>) {
      expect(resolveEasing(name)).toBe(easings[name]);
    }
  });

  it('falls back for an unknown name rather than throwing', () => {
    expect(resolveEasing('nope' as never)).toBe(easeInOutCubic);
  });

  it('accepts a named easing through the options pipeline', () => {
    const options = resolveOptions({ transition: { easing: 'outExpo' } });
    expect(resolveEasing(options.transition.easing)).toBe(easings.outExpo);
  });
});
