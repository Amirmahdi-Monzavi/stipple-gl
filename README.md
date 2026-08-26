# stipple-gl

A WebGL2 particle field that morphs into any SVG.

Zero dependencies. Framework agnostic. **12.4 KB gzipped** for a particle background, 17.9 KB with SVG morphing, raster image sources and every behaviour.

Optionally runs the whole simulation on a **Web Worker**, so it costs the main thread nothing.

```bash
npm i stipple-gl
```

```ts
import { Stipple, shapeFromURL } from 'stipple-gl';

const stipple = new Stipple('#hero');

await stipple.morphTo(await shapeFromURL('/shield.svg'));
```

That's the entire API surface for the common case. Everything else is opt-in.

---

## Why this exists

Most particle libraries give you drifting dots. This one gives you a **field with two states** — a dispersed 3D sphere and a target shape — and a single scalar that moves between them. Drive that scalar from a route change, a scroll position, a hover, a promise resolving, or a slider, and the particles reassemble into whatever SVG you hand it.

It renders in a **single draw call** with no scene graph, no three.js, and no runtime dependencies.

|                      | stipple-gl                       | tsparticles             | particles.js |
| -------------------- | -------------------------------- | ----------------------- | ------------ |
| gzipped              | **12.4 KB** lite · 17.9 KB full  | 22 KB core · 52 KB full | 8.8 KB       |
| dependencies         | **0**                            | 14 direct (52 packages) | 0            |
| renderer             | **WebGL2**                       | canvas 2D               | canvas 2D    |
| off-main-thread      | **yes, OffscreenCanvas**         | no                      | no           |
| SVG morphing         | **built in**                     | no                      | no           |
| raster image sources | **PNG, JPEG, WebP, AVIF, video** | no                      | no           |
| written in           | **TypeScript**                   | TypeScript              | JavaScript   |
| status               | active                           | active                  | unmaintained |

<sub>Measured with gzip on the published bundles: `tsparticles@4.3.2` (`tsparticles.bundle.min.js` and `@tsparticles/engine`), and `particles.js@2.0.0` (ships unminified). Reproduce with `node scripts/measure.mjs`.</sub>

To be straight about it: **particles.js is smaller.** It is also canvas 2D, unmaintained since 2016, and cannot morph. stipple-gl is not trying to be the smallest particle library — it is trying to be the smallest one that renders on the GPU _and_ morphs into arbitrary SVG geometry. If all you need is drifting dots and every kilobyte counts, the older libraries are a reasonable answer.

---

## The three layers

Every instance runs up to three particle populations, each independently configurable:

- **major** — the morph pool. Laid out on a Fibonacci sphere when dispersed, mapped onto sampled SVG points when shaped.
- **minor** — an ambient drift layer that never morphs. Value-noise flow field with wrap-around. This is the layer you keep if you just want a nice background.
- **emission** — short-lived sparks emitted from major particles, with spiral forces and life curves.

Set `count: 0` and you have a pure ambient particle background. Set `minorCount: 0` and you have a clean morph target. Both, and you get the full effect.

---

## Quick starts

### Vanilla

```ts
import { Stipple, shapeFromString } from 'stipple-gl';

const stipple = new Stipple(document.body, {
  count: 4000,
  color: '#5ec8f2',
  mode: 'background',
});

const shield = shapeFromString(`<svg viewBox="0 0 100 100">
  <path d="M50 6 L86 20 V48 C86 70 70 86 50 94 C30 86 14 70 14 48 V20 Z" />
</svg>`);

stipple.setShape(shield);
stipple.setMorph(1);
```

### React

```tsx
import { Particles } from 'stipple-gl/react';

export function Hero() {
  return <Particles mode="background" count={4000} shape="/shield.svg" morph={1} />;
}
```

The component owns the canvas and the lifecycle. Change `shape` or `morph` and it transitions.

### Inside a container

```tsx
<Particles
  mode="container"
  className="h-96 w-full rounded-xl"
  count={1800}
  shape="/logo.svg"
  morph={1}
/>
```

`mode: 'container'` scopes the canvas and its pointer listeners to the host element, so you can run several instances on one page without them fighting.

### Just particles, no morphing

```tsx
import { Particles } from 'stipple-gl/react';
import { starfield } from 'stipple-gl/presets';

<Particles {...starfield} color="#8ab4f8" />;
```

### Off the main thread

```ts
import { createWorkerStipple } from 'stipple-gl/worker';

const stipple = createWorkerStipple('#hero', { count: 8000 });
```

The canvas is transferred to a Web Worker with `transferControlToOffscreen()`, so simulation and rendering never touch the main thread. Blocking the main thread for 900 ms, a transition kept advancing at 60 fps in worker mode and rendered nothing at all on the main thread. Same API either way — see [docs/worker.md](docs/worker.md).

### Scroll-driven morphing

```html
<section data-stipple-shape="brain">…</section>
<section data-stipple-shape="gear">…</section>
<section data-stipple-shape="none">…</section>
```

```ts
import { createScrollMorph } from 'stipple-gl/scroll';

createScrollMorph(stipple, {
  sections: '[data-stipple-shape]',
  shapes: {
    brain: '/shapes/brain.svg',
    gear: '/shapes/gear.svg',
    none: null,
  },
});
```

Particles disperse as a section leaves the viewport and reassemble into the next section's shape. It reads scroll position rather than hijacking it, so it composes with native CSS `scroll-snap` and does not break keyboard or accessibility behaviour. See [docs/scroll.md](docs/scroll.md).

---

## Three ways to import

| entry               | gzipped     | what you get                                                                                                                                 |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `stipple-gl/lite`   | **12.4 KB** | The engine and the ambient layer. No SVG parser, no morph sampling, no emission, pointer or shockwave behaviours. For a particle background. |
| `stipple-gl`        | **17.9 KB** | Everything: SVG parsing and sampling, raster image sources, angular assignment, all behaviours.                                              |
| `stipple-gl/worker` | +2 KB       | The main-thread proxy. The engine itself ships in the worker chunk.                                                                          |

Those are what a real import costs, measured on a production bundle — `stipple-gl` is `import { Stipple, shapeFromURL }`. Take only `Stipple` and it is 16.0 KB. Importing the whole barrel is 19.6 KB, which nobody does.

`stipple-gl/react`, `stipple-gl/scroll` and `stipple-gl/presets` are separate entries too, so you only pay for what you import.

## Any image, not just SVG

Raster decoding goes through the browser, so whatever it can decode, this can sample — PNG, JPEG, WebP, AVIF, GIF, a canvas, even a video frame.

```ts
import { shapeFromFile, shapeFromImageURL } from 'stipple-gl';

await stipple.morphTo(await shapeFromImageURL('/logo.png'));
await stipple.morphTo(await shapeFromFile(droppedFile));
```

`shapeFromFile` picks the strategy. SVG is traced as vector paths, which sample cleanly at any size — unless the markup leans on gradients, filters or stylesheets, which `Path2D` cannot reproduce, in which case it is rasterised so the artwork survives. On the Firefox logo that is the difference between zero colours and 1,269.

A photograph has no alpha to mask with, so use luminance:

```ts
await shapeFromFile(photo, { mask: 'dark', threshold: 0.45 });
```

Pair any of it with `color: { type: 'shape' }` and the field takes the source artwork's own palette. See [docs/images.md](docs/images.md).

---

## Drop it in a page

No bundler, no install — the script-tag build puts everything on `window.stipple`.

```html
<div id="hero" style="height:100vh"></div>
<script src="https://unpkg.com/stipple-gl"></script>
<script>
  const s = stipple.createStipple('#hero');
  s.morphTo(stipple.shapeFromString(document.querySelector('#logo').outerHTML));
</script>
```

---

## Transitions

A move between states is a **choreography**, and there are three places one can run:

```ts
new Stipple('#hero', {
  transition: {
    enter: 'condense', // spread → shape
    exit: 'mirror', // shape → spread (reuses enter, gentler)
    swap: 'burst', // shape → shape
  },
});
```

`condense` (the default), `uniform`, `sweep` and `burst` are shorthand for full objects you can also write out:

```ts
transition: {
  enter: { speed: 0.05, easing: "outExpo", stagger: 0.68, order: "radial", turbulence: 14 },
}
```

`stagger` and `order` are the wipe; `flash` is an optional glow on the wavefront, off by default. `uniform` turns the wipe off entirely. See [docs/options.md](docs/options.md).

---

## Presets

```ts
import { presets, nebula, starfield } from 'stipple-gl/presets';
```

`morph` · `snap` · `starfield` · `constellation` · `nebula` · `dust`

Each is a plain config object — spread it and override whatever you want.

---

## API

### `new Stipple(target, config?)`

`target` is an element, a CSS selector, or an existing `<canvas>`. If you pass a canvas, stipple-gl renders into it and leaves its styling alone.

| method                         | description                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `morphTo(shape, options?)`     | Set a shape and morph into it. Returns a promise that resolves on arrival, or immediately if a later call supersedes it. |
| `release()`                    | Return to the spread, animated. Returns the same kind of promise.                                                        |
| `setMorph(0…1)`                | Move toward dispersed (0) or shaped (1). Returns a promise for arrival.                                                  |
| `getMorph()`                   | Current interpolated value.                                                                                              |
| `setShape(shape                | null, choreography?)`                                                                                                    | Swap the target without touching the morph value. Returns `false` if the field has no major particles. |
| `on(event, handler)`           | Subscribe to `morphstart`, `morphprogress`, `morphend` or `shapechange`. Returns an unsubscribe function.                |
| `off(event, handler)`          | Unsubscribe.                                                                                                             |
| `setOptions(config)`           | Deep-merge new options at runtime.                                                                                       |
| `resetOptions(config?)`        | Drop every runtime tweak and rebuild from the defaults.                                                                  |
| `setCount(count, minorCount?)` | Resize the particle pools.                                                                                               |
| `pulse(x, y, strength?)`       | Fire a shockwave ring from a point.                                                                                      |
| `tick(dt?)`                    | Advance one frame manually, for driving your own loop.                                                                   |
| `start()` / `stop()`           | Control the internal loop.                                                                                               |
| `resize()`                     | Force a re-measure.                                                                                                      |
| `destroy()`                    | Full teardown — listeners, GL objects, canvas.                                                                           |

Read-only: `canvas`, `options`, `running`, `fps`.

### Shape helpers

```ts
import { shapeFromURL, shapeFromString, shapeFromSVG, fitShapeToElement } from 'stipple-gl';
```

The parser handles `path`, `circle`, `ellipse`, `rect` (including rounded), `line`, `polyline`, `polygon`, nested `<g>` transforms, `fill-rule="evenodd"`, and stroke-only paths. `fitShapeToElement` positions and scales a shape to line up with a DOM element, so the particles can assemble exactly where your layout has a gap.

Full option reference: **[docs/options.md](docs/options.md)**.

---

## Performance

- Zero allocation per frame. All state lives in preallocated `Float32Array`s; the vertex buffer is written in place and uploaded with `bufferSubData`.
- 16-byte vertex stride — position, size, and an RGBA byte-packed colour.
- Integer-hash value noise, no trigonometry in the hash.
- Angular target assignment, so particles take short paths into the shape instead of scrambling across the canvas.
- SVG sampling rasterises to a bounded bitmap and samples systematically, independent of canvas size or DPR.
- Volume-distributed rotating sphere, so the dispersed field has depth parallax and no visible boundary.
- Auto-pauses when scrolled offscreen or when the tab is hidden.
- Adaptive quality reduces render resolution under frame-budget pressure.
- Honours `prefers-reduced-motion` by rendering a single static frame.
- Recovers from `webglcontextlost`.

Details and tuning advice: **[docs/performance.md](docs/performance.md)**.

---

## Pluggable simulation

The simulation sits behind a `SimulationBackend` interface. The bundled `CpuBackend` runs a pipeline of small, tree-shakeable behaviours (`morph`, `jelly`, `pointer`, `shockwave`, `integrate`, `drift`, `emission`, `breathe`), each a tight loop over typed arrays.

```ts
import { createMorphBehavior, createIntegrateBehavior } from 'stipple-gl';

new Stipple('#hero', {
  behaviors: [createMorphBehavior(), createIntegrateBehavior(), myCustomBehavior],
});
```

A GPU backend using transform feedback is planned behind the same interface — see [docs/architecture.md](docs/architecture.md).

---

## Browser support

Requires **WebGL2** — Chrome/Edge 56+, Firefox 51+, Safari 15+. The constructor throws if WebGL2 is unavailable; pass `onError` to render your own fallback.

---

## Documentation

- [Getting started](docs/getting-started.md)
- [Options reference](docs/options.md)
- [React](docs/react.md)
- [Scroll and snap](docs/scroll.md)
- [Shapes and SVG](docs/shapes.md)
- [Performance](docs/performance.md)
- [Worker mode](docs/worker.md)
- [Architecture](docs/architecture.md)

## Licence

MIT
