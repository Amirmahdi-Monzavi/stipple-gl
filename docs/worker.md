# Worker mode

Run the entire particle system — simulation *and* rendering — on a Web Worker, so it costs the main thread nothing.

```ts
import { createWorkerStipple } from 'stipple-gl/worker';

const stipple = createWorkerStipple('#hero', { count: 8000 });
stipple.setMorph(1);
```

`WorkerStipple` implements the same `StippleInstance` interface as `Stipple`, so `setMorph`, `setShape`, `setOptions`, `setCount`, `pulse`, `start`, `stop` and `destroy` all behave the same.

## Why

The canvas is handed to the worker with `transferControlToOffscreen()`. From then on the main thread never touches WebGL, never runs the simulation, and never packs a vertex buffer. It only forwards resize, pointer and visibility events, which cost microseconds.

The difference shows up when your page is busy. Blocking the main thread for 900 ms and measuring how far a transition progressed:

| | main thread | worker |
|---|---|---|
| morph advanced during the block | 0.144 | **0.372** |
| frames rendered during the block | none | 60 fps throughout |

The main thread's 0.144 is the single catch-up step after the block ends, not animation during it. In worker mode the field never stopped moving.

That matters for a hydrating framework app, a heavy table render, a large JSON parse, or anything else that stalls the main thread — exactly the moments when a frozen background effect is most obvious.

## What it costs

**Options containing functions cannot cross the boundary.** `postMessage` uses structured clone, which cannot serialise functions. Four options are affected:

| option | in worker mode |
|---|---|
| `transition.easing` | use a **name**: `'linear'`, `'inOutCubic'`, `'inOutQuad'`, `'outExpo'`, `'outBack'`, `'inOutElastic'` |
| `behaviors` | not transferable; the worker builds the default pipeline |
| `backend` | not transferable; the worker uses `CpuBackend` |
| `onReady` / `onError` | stay on the main thread and still fire |

Anything non-serialisable is dropped rather than throwing. Pass `onDroppedOptions` to see what went:

```ts
createWorkerStipple('#hero', {
  transition: { easing: 'outExpo' },
  onDroppedOptions: (keys) => console.warn('not sent to worker:', keys),
});
```

Named easings work in both modes, so `easing: 'outExpo'` is the portable choice everywhere.

**`getMorph()` is sampled, not live.** The worker reports its state roughly twice a second, so `getMorph()` and `fps` lag by up to 500 ms. `setMorph()` is immediate — only reads are sampled.

**`tick()` is unavailable.** The worker drives its own loop.

**SVG parsing stays on the main thread.** `DOMParser` does not exist in workers, so `shapeFromURL` and `shapeFromString` run where you call them and the parsed geometry is sent across. That geometry is plain data and clones cleanly. Sampling and target assignment happen *in* the worker, using `OffscreenCanvas` and `Path2D`.

## Bundling

The default constructor resolves the worker relative to the module:

```ts
new Worker(new URL('./thread.js', import.meta.url), { type: 'module' });
```

Vite, webpack 5, Rollup, Parcel and Next.js all understand this pattern and emit the worker as its own chunk. No configuration needed.

If your setup does not, or you want control over the worker's lifetime, pass one in:

```ts
import { createWorkerStipple } from 'stipple-gl/worker';

createWorkerStipple('#hero', {
  worker: new Worker(new URL('stipple-gl/worker/thread', import.meta.url), { type: 'module' }),
});
```

`workerUrl` overrides just the URL and lets the class construct the worker itself.

## Feature detection

```ts
import { createWorkerStipple, workerModeSupported } from 'stipple-gl/worker';
import { Stipple } from 'stipple-gl';

const stipple = workerModeSupported()
  ? createWorkerStipple('#hero', config)
  : new Stipple('#hero', config);
```

`workerModeSupported()` checks for `Worker` and `transferControlToOffscreen`. Requires Chrome/Edge 69+, Firefox 105+, Safari 17+. Everywhere else, fall back to the main-thread engine — same API, same visuals.

## When not to use it

- **You need `tick()`** to drive the loop from your own animation system.
- **You need custom behaviours or a custom backend.** Those cannot cross the boundary. Use the main-thread engine.
- **You want a live `getMorph()`** every frame for something else in your UI.
- **The field is small.** At a few hundred particles the main-thread cost is already negligible and a worker adds a message hop and a second GL context.

## React

There is no dedicated component yet. Use `useEffect` with the imperative API:

```tsx
import { useEffect, useRef } from 'react';
import { createWorkerStipple } from 'stipple-gl/worker';
import type { StippleInstance } from 'stipple-gl';

function WorkerHero() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<StippleInstance | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const engine = createWorkerStipple(hostRef.current, {
      count: 8000,
      transition: { easing: 'outExpo' },
    });
    engineRef.current = engine;
    return () => engine.destroy();
  }, []);

  return <div ref={hostRef} style={{ position: 'fixed', inset: 0 }} />;
}
```

## Try it

The playground runs in either mode — append `?worker=1` to switch. The status line reports which thread is drawing.
