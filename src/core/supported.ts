/**
 * A pre-flight check callers can branch on before constructing anything.
 *
 * Without this the only way to discover that WebGL2 is unavailable is to
 * construct a `Stipple` and catch the throw, which forces a try/catch around
 * what is otherwise declarative setup and gives no way to render a static
 * fallback instead.
 */

let cached: boolean | null = null;

/**
 * Whether this environment can run the engine at all.
 *
 * The probe context is released immediately: browsers cap the number of live
 * WebGL contexts (commonly around sixteen), and a check that quietly consumed
 * one would be a poor trade for a boolean. The answer is memoised for the same
 * reason — repeated calls cost nothing and allocate nothing.
 */
export const isSupported = (): boolean => {
  if (cached !== null) return cached;

  if (typeof document === 'undefined') {
    // Server-side: report unsupported rather than throwing, so the same branch
    // works during SSR and after hydration. Not memoised — the same module may
    // be reused on the client in a bundler's dev server.
    return false;
  }

  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
    cached = gl !== null;
  } catch {
    // A browser with WebGL disabled by policy can throw rather than return null.
    cached = false;
  }

  return cached;
};
