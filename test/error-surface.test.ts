import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isSupported } from '../src/core/supported';
import { releaseRaster, sampleShape } from '../src/sources/sample';
import type { ImageSource } from '../src/core/types';
import { Stipple } from '../src/stipple';
import { installDomStubs, type DomStubHandle } from './support/dom-stub';

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('isSupported', () => {
  let stubs: DomStubHandle | null = null;

  afterEach(() => {
    stubs?.restore();
    stubs = null;
  });

  it('reports true when a WebGL2 context can be created', () => {
    stubs = installDomStubs();
    expect(isSupported()).toBe(true);
  });

  it('does not leave the probe context alive', () => {
    stubs = installDomStubs();
    const created: string[] = [];
    const lost: string[] = [];

    const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
    const real = proto['getContext'] as (kind: string) => unknown;
    proto['getContext'] = (kind: string) => {
      created.push(kind);
      const gl = real.call(HTMLCanvasElement.prototype, kind) as Record<string, unknown> | null;
      if (!gl) return null;
      return {
        ...gl,
        getExtension: () => ({ loseContext: () => lost.push(kind) }),
      };
    };

    // Defeat the module-level memo so the probe actually runs here.
    vi.resetModules();
    return import('../src/core/supported').then(({ isSupported: fresh }) => {
      expect(fresh()).toBe(true);
      expect(created).toContain('webgl2');
      expect(lost).toContain('webgl2');
    });
  });
});

/**
 * `mode: 'container'` throughout, because that is the only mode where this can
 * actually happen. The default `background` mode fixes the canvas to the
 * viewport with `position: fixed`, so a collapsed host does not affect it —
 * verified in a real browser, where the same code with the default mode
 * correctly stays silent. jsdom reports every element as zero-sized regardless
 * of CSS, so a test written against the default here would pass while
 * describing something the browser never does.
 */
describe('a host element with no size', () => {
  let stubs: DomStubHandle;
  let warn: ReturnType<typeof vi.spyOn>;
  const built: Stipple[] = [];

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    while (built.length) built.pop()?.destroy();
    warn.mockRestore();
    stubs.restore();
  });

  const build = (): Stipple => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const instance = new Stipple(host, { count: 200, minorCount: 0, mode: 'container' });
    built.push(instance);
    return instance;
  };

  it('warns, naming the element and its measured size', async () => {
    stubs = installDomStubs(0, 0);
    build();

    await flush();

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain('0×0');
    expect(String(warn.mock.calls[0]?.[0])).toContain('height');
  });

  it('stays quiet when the element has a size', async () => {
    stubs = installDomStubs(800, 600);
    build();

    await flush();

    expect(warn).not.toHaveBeenCalled();
  });

  it('does not cry wolf when the size arrives a beat after mount', async () => {
    stubs = installDomStubs(0, 0);
    const instance = build();

    // Stands in for a flex or grid pass that resolves after the effect runs.
    stubs.restore();
    stubs = installDomStubs(800, 600);
    instance.resize();

    await flush();

    expect(warn).not.toHaveBeenCalled();
  });

  it('says nothing after the instance is destroyed', async () => {
    stubs = installDomStubs(0, 0);
    const instance = build();
    instance.destroy();

    await flush();

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('an image that taints the canvas', () => {
  const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
    releaseRaster();
  });

  /** A 2D context that answers every call but refuses the pixel read-back. */
  const refuseReadback = (thrown: unknown): void => {
    const previous = proto['getContext'];
    restore = () => {
      proto['getContext'] = previous;
    };
    proto['getContext'] = (kind: string) =>
      kind === '2d'
        ? new Proxy(
            {},
            {
              get: (_target, prop) =>
                prop === 'getImageData'
                  ? () => {
                      throw thrown;
                    }
                  : () => undefined,
              set: () => true,
            },
          )
        : null;
  };

  const sampleTainted = (): void => {
    sampleShape(
      { paths: [], image: { width: 64, height: 64 } as unknown as ImageSource },
      100,
      400,
      300,
    );
  };

  it('explains that it is a CORS problem and how to fix it', () => {
    refuseReadback(new DOMException('The operation is insecure.', 'SecurityError'));

    expect(sampleTainted).toThrow(/crossOrigin/);
    expect(sampleTainted).toThrow(/Access-Control-Allow-Origin/);
  });

  it('leaves any other failure exactly as it was', () => {
    const original = new RangeError('canvas is too large');
    refuseReadback(original);

    expect(sampleTainted).toThrow(original);
  });
});
