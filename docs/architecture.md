# Architecture

## The shape of the thing

```
Stipple (engine)
├── PointRenderer          WebGL2, one program, one VAO, one buffer
├── SimulationBackend      swappable — CpuBackend ships by default
│   └── Behavior[]         morph → breathe → jelly → pointer → shockwave → integrate → drift → emission
└── sources/               SVG parse → rasterise → sample → assign
```

The engine owns the canvas, the frame loop, resize, pointer input, and the morph scalar. It knows nothing about how particles move. The backend owns all particle state and stepping. The renderer owns GL and knows nothing about particles beyond a packed vertex buffer.

That seam exists so the simulation can move to the GPU later without touching anything else.

---

## Data layout

Particle state is **structure-of-arrays**. Each population holds a set of parallel `Float32Array`s — `x`, `y`, `z`, `vx`, `vy`, `vz`, `seed`, and so on — allocated once at capacity and reused.

This matters for two reasons. Iterating `x[i]` over a contiguous `Float32Array` is cache-friendly and JIT-friendly in a way that iterating `particles[i].x` over an array of objects is not. And more importantly, nothing is allocated per frame, so the garbage collector never runs mid-animation.

The alternative — rebuilding an array of particle objects every frame and allocating a fresh `Float32Array` to upload — costs roughly 2 GB of garbage per minute at 4,000 particles and 60 fps. That is the single most expensive thing a particle system can do.

---

## The vertex format

Each particle is **16 bytes**:

| offset | bytes | attribute                         | type                |
| ------ | ----- | --------------------------------- | ------------------- |
| 0      | 8     | position (x, y) normalised to 0…1 | `vec2` float        |
| 8      | 4     | point size in device pixels       | `float`             |
| 12     | 4     | colour + alpha                    | `ubyte4` normalised |

Packing RGBA into a single 32-bit word instead of three floats plus an alpha float cuts the stride from 28 bytes to 16 — a 43% reduction in upload bandwidth every frame. The engine keeps a `Float32Array` and a `Uint32Array` as two views over the same `ArrayBuffer`, so both writes land in the same memory with no conversion step.

Attribute pointers are configured once when the buffer is allocated, not every frame. Uniform locations are looked up once at link time. The per-frame GL work is one `bufferSubData`, four `uniform` calls, and one `drawArrays`.

---

## The behaviour pipeline

A frame steps through ordered behaviours. Each one is a plain object with a `step(ctx)` method that loops over the typed arrays itself:

```ts
interface Behavior {
  name: string;
  order?: number;
  step(ctx: SimContext): void;
}
```

The critical design choice is that behaviours operate on **whole arrays**, not on individual particles. A per-particle callback would create a megamorphic call site executed millions of times a second and defeat inlining. A per-array loop stays monomorphic and gets optimised properly.

The default order:

| order | behaviour   | writes                                                        |
| ----- | ----------- | ------------------------------------------------------------- |
| 10    | `morph`     | target position from spread ↔ shape, flow noise into velocity |
| 15    | `breathe`   | per-particle glow                                             |
| 20    | `jelly`     | wobble offset onto the target                                 |
| 30    | `pointer`   | repulsion onto the target                                     |
| 40    | `shockwave` | ring displacement onto the target                             |
| 50    | `integrate` | moves actual position toward the target                       |
| 60    | `drift`     | ambient layer                                                 |
| 70    | `emission`  | spark spawn, update, and retire                               |

Everything from 10 to 40 accumulates into a scratch target (`tx`, `ty`, `tz`). Only `integrate` touches real positions. Adding a force means writing to the target and inserting your behaviour before order 50.

Behaviours are separate modules and separate exports, so a bundler drops the ones you never import.

---

## Sampling an SVG

Turning arbitrary SVG geometry into particle targets is a rasterise-and-sample problem.

1. **Parse** — walk the DOM, convert `circle`/`rect`/`polygon`/etc. into path data, compose nested `<g>` transforms into a single matrix per path, and record fill rule and stroke width.
2. **Rasterise** — draw the paths into an offscreen canvas via `Path2D`, at a **bounded resolution** (512 px on the long edge by default) rather than at canvas size and DPR.
3. **Scan** — read the alpha channel once and record the index of every covered pixel into a reusable `Uint32Array`.
4. **Sample** — walk the hit list with a fixed stride plus jitter to pull out exactly `count` points, then scale back to canvas coordinates with sub-pixel jitter.

The bounded raster is the important part. Scanning at full size and DPR on a 1920×1080 display means touching 2 million pixels and allocating a multi-megabyte array on **every shape change and every resize**. Capping the raster makes the cost independent of display size — roughly 16× less work at 1080p — and the sampled result is visually identical because you are only ever extracting a few thousand points.

Systematic sampling with jitter also beats collect-everything-then-shuffle: it is O(n) instead of O(n log n), allocates nothing beyond the reusable hit buffer, and distributes points evenly across the figure rather than clumping.

---

## The dispersed state

Two details decide whether the dispersed field reads as a cloud or as a flat blob with a hard edge.

**Volume, not shell.** Placing particles on a sphere's _surface_ and projecting to 2D piles them up at the silhouette, because the projected density diverges where the surface turns edge-on. The result is a solid disc with a bright rim. Distributing through the _volume_ instead — radius scaled by the cube root of a uniform value — gives a projected density that peaks at the centre and falls smoothly to zero, with no boundary at all. `spread.volume` interpolates between the two.

**A sphere, not an ellipse.** Scaling the layout by canvas width and height independently turns the sphere into an ellipse that stretches with the viewport. The radius is a single value derived from the canvas diagonal, so the field stays round at any aspect ratio.

The sphere also rotates. Particle positions are stored in local coordinates centred on the origin and rotated about a tilted vertical axis each frame before the morph blend. Because z drives both point size and brightness, the rotation produces real parallax — particles at the front are larger and brighter than those behind. This is the part a 2D canvas library cannot reproduce.

## Target assignment

Sampling gives you a bag of points. Deciding _which particle goes to which point_ determines whether a morph reads as elegant or as noise.

Assign randomly and the average particle crosses most of the canvas, paths cross constantly, and the transition looks like static resolving. The usual fix is to paper over it with a swirl or a blur.

`assign: 'angular'` sorts the dispersed particles by their angle around the field centroid, sorts the sampled points by their angle around the shape centroid, and pairs the two sorted orders. Particles keep their rough angular position through the transition, so the shape appears to _condense_ rather than reshuffle. Total travel distance drops sharply — for two concentric rings it reaches the optimal assignment exactly, and it costs one O(n log n) sort per shape change rather than anything per frame.

A true optimal transport solution would be better still for pathological cases, and far too slow to be worth it.

---

## Frame-rate independence

Naive interpolation (`x += (target - x) * 0.1`) runs twice as fast on a 120 Hz display as on a 60 Hz one. Every interpolation rate in the engine is corrected:

```
factor = 1 - (1 - rate) ^ (dt / 16.667)
```

so `follow`, `settle`, and the morph scalar itself all describe the same motion regardless of refresh rate.

---

## Noise

The classic one-liner GLSL-style hash — `fract(sin(dot(p, k)) * 43758.5453)` — costs a `Math.sin` per sample. Value noise needs four hashes per sample, and behaviours call it several times per particle per frame. At a few thousand particles that is hundreds of thousands of transcendental calls a frame.

`hash2i` replaces it with integer mixing via `Math.imul` — multiply, xor, shift, no trigonometry. Same statistical quality for this purpose, a fraction of the cost. There is a test asserting `Math.sin` is never called during noise evaluation, so this cannot silently regress.

---

## Lifecycle

The engine handles the things that separate a demo from a library:

- `ResizeObserver` on the canvas, with a dead-band so sub-pixel jitter does not trigger resampling.
- **Degenerate-size recovery.** A canvas constructed inside a hidden or unlaid-out container measures zero. The engine detects that, defers allocation, and reallocates properly once real dimensions arrive.
- `IntersectionObserver` pauses the loop when scrolled out of view; `visibilitychange` pauses it for hidden tabs.
- `webglcontextlost` / `webglcontextrestored` rebuilds the program, buffers, and VAO.
- `prefers-reduced-motion` renders one static frame instead of animating, and reacts live if the user changes the setting.
- Adaptive quality watches a rolling frame-time average and trades render resolution for smoothness.
- `destroy()` removes every listener, deletes every GL object, and calls `WEBGL_lose_context`.

---

## Running off the main thread

The engine splits in two:

```
Runtime        no DOM at all - gl, renderer, backend, frame state, step, render
StippleCore    the browser half - canvas, observers, pointer, rAF loop
WorkerStipple  the same browser half, forwarding messages instead of calling directly
```

`Runtime` never touches `document`, `window`, `ResizeObserver` or `IntersectionObserver`, which is what lets the identical simulation run inside a worker against an `OffscreenCanvas`. There are tests asserting that separation holds, and that the GL context is created in exactly one place.

The split of labour in worker mode:

| main thread                                        | worker                                   |
| -------------------------------------------------- | ---------------------------------------- |
| resize, pointer, visibility observation            | simulation, packing, all GL              |
| SVG parsing (`DOMParser` has no worker equivalent) | rasterising, sampling, target assignment |
| forwarding messages                                | the frame loop                           |

Parsed SVG geometry is plain data — path strings, a fill rule, a stroke width, a six-number matrix — so it clones across the boundary without special handling. Functions do not, which is why `transition.easing` also accepts a name.

## Why the CPU backend, for now

The rendering is genuinely GPU work. The simulation is not — it is JavaScript on the main thread, and the honest description of this release is _GPU-rendered, CPU-simulated_.

The obvious next step is a transform-feedback backend: keep positions and velocities in ping-pong vertex buffers, run integration in a vertex shader, and never touch particle data from JavaScript. That lifts the ceiling from tens of thousands of particles to hundreds of thousands.

It is not free. Pointer forces, shockwaves, and morph target assignment all have to be reformulated as texture lookups or uniform arrays, and debugging moves into the shader. Shipping that first would have delayed everything else.

So the `SimulationBackend` interface exists now, the CPU implementation is optimised to the point where allocation is zero and the noise is cheap, and the GPU backend can drop in behind the same interface without changing a line of application code.

---

## Extending the pipeline

`Behavior` entries run in phase order. Declare a `phase` rather than guessing a number:

| phase       | runs  | what belongs here                                              |
| ----------- | ----- | -------------------------------------------------------------- |
| `target`    | first | decides where each particle is trying to be (`morph`)          |
| `deform`    |       | warps those targets (`breathe`, `jelly`)                       |
| `force`     |       | pushes particles around (`pointer`, `shockwave`) — the default |
| `integrate` |       | turns velocity into position (`integrate`)                     |
| `ambient`   | last  | independent of the major field (`drift`, `emission`)           |

Anything after `integrate` writes positions directly and will not be damped, which is usually not what you want — that is the one ordering rule worth remembering.

```ts
import { createDefaultBehaviors } from 'stipple-gl';

new Stipple('#hero', {
  behaviors: [
    ...createDefaultBehaviors(),
    {
      name: 'gravity',
      phase: 'force',
      step: ({ major }) => {
        for (let i = 0; i < major.count; i++) major.vy[i] += 0.02;
      },
    },
  ],
});
```

An explicit `order` number still wins over `phase`, so the built-ins keep their fixed relative positions inside a phase. Behaviours sharing a key keep the order you listed them in.

## Dev-only validation

`validateConfig` runs from both hosts behind `process.env.NODE_ENV !== 'production'`. It warns about unknown keys (with a spelling suggestion), out-of-range numbers, choreography names that do not exist, and configs that cannot do what they appear to ask for. Nothing throws.

Bundlers fold the guard in production and the module drops out entirely — verified by `node scripts/measure.mjs`, which bundles with `NODE_ENV=production` exactly as a real consumer would.
