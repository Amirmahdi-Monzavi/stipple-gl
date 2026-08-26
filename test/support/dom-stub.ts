/**
 * Enough of a browser for the React bindings to mount under jsdom.
 *
 * jsdom has no WebGL, no ResizeObserver, no IntersectionObserver, and reports
 * every element as zero-sized — all four of which `StippleCore` touches during
 * construction. Rather than mock the bindings themselves (which would test the
 * mock), this stands up the smallest environment in which the real engine will
 * build, so the React tests exercise the real `Runtime`.
 *
 * Opt-in rather than a global vitest setup: the other 247 tests construct their
 * own `Runtime` directly and must keep running against untouched globals.
 */

/** Every GL call answers; every uppercase constant is a number. */
const stubGl = new Proxy(
  {},
  {
    get(_target, prop) {
      if (typeof prop === 'string' && /^[A-Z][A-Z0-9_]*$/.test(prop)) return 1;
      // `dispose()` chains `getExtension(...)?.loseContext()`, so a method has
      // to return something callable rather than a bare object.
      return () => new Proxy({}, { get: () => () => undefined });
    },
  },
) as unknown as WebGL2RenderingContext;

class StubObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

export interface DomStubHandle {
  restore(): void;
}

export const installDomStubs = (width = 1280, height = 720): DomStubHandle => {
  const canvasProto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  const elementProto = Element.prototype as unknown as Record<string, unknown>;
  const win = globalThis as unknown as Record<string, unknown>;

  const previous = {
    getContext: canvasProto['getContext'],
    getBoundingClientRect: elementProto['getBoundingClientRect'],
    ResizeObserver: win['ResizeObserver'],
    IntersectionObserver: win['IntersectionObserver'],
    requestAnimationFrame: win['requestAnimationFrame'],
    cancelAnimationFrame: win['cancelAnimationFrame'],
  };

  canvasProto['getContext'] = (kind: string) => (kind === 'webgl2' ? stubGl : null);

  elementProto['getBoundingClientRect'] = () => ({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });

  win['ResizeObserver'] = StubObserver;
  win['IntersectionObserver'] = StubObserver;

  // No frames: these tests assert on calls, not on motion. A live rAF loop
  // would step the engine underneath the assertions.
  win['requestAnimationFrame'] = () => 0;
  win['cancelAnimationFrame'] = () => undefined;

  return {
    restore(): void {
      canvasProto['getContext'] = previous.getContext;
      elementProto['getBoundingClientRect'] = previous.getBoundingClientRect;
      win['ResizeObserver'] = previous.ResizeObserver;
      win['IntersectionObserver'] = previous.IntersectionObserver;
      win['requestAnimationFrame'] = previous.requestAnimationFrame;
      win['cancelAnimationFrame'] = previous.cancelAnimationFrame;
    },
  };
};
