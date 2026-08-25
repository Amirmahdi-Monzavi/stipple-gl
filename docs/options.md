# Options reference

Every option is optional. Anything you omit falls back to the default, and nested groups deep-merge — passing `{ major: { size: 8 } }` keeps every other `major` setting intact.

```ts
new Stipple('#hero', { count: 4000, major: { size: 8 } });
stipple.setOptions({ jelly: { intensity: 0 } });
```

---

## Top level

| option | type | default | description |
|---|---|---|---|
| `count` | `number` | `3500` | Major (morphing) particles. Set to `0` for an ambient-only field. |
| `minorCount` | `number` | `260` | Ambient drift particles. These never morph. |
| `mode` | `'background' \| 'container' \| 'page'` | `'background'` | Canvas positioning and pointer scope. See [Modes](#modes). |
| `color` | `string` | `'#4f9c7d'` | Hex, `rgb()`, or `rgba()`. Applies to major and emission particles. |
| `minorColor` | `string \| null` | `null` | Ambient layer colour. `null` inherits `color`. |
| `background` | `string` | `''` | CSS background applied to the canvas. Empty keeps it transparent. |
| `opacity` | `number` | `1` | Global multiplier over every particle's alpha. |
| `blend` | `'normal' \| 'additive'` | `'normal'` | `additive` makes overlapping particles glow. Best on dark backgrounds. |
| `softness` | `number` | `1.35` | Width of the glow halo around each particle. Higher is hazier, lower is tighter. |
| `core` | `number` | `0.72` | How much of a hard bright centre each particle gets. `0` is pure haze, `1` is a solid dot with a faint halo. |
| `dpr` | `number \| 'auto'` | `'auto'` | Device pixel ratio. `'auto'` reads `devicePixelRatio`. |
| `maxDpr` | `number` | `2` | Hard ceiling on DPR. The single biggest performance lever. |
| `maxFps` | `number` | `0` | Frame cap. `0` disables the cap and runs at display refresh. |
| `autoPause` | `boolean` | `true` | Stop the loop when the canvas is offscreen or the tab is hidden. |
| `reducedMotion` | `'respect' \| 'ignore'` | `'respect'` | `respect` renders one static frame when the user prefers reduced motion. |
| `adaptiveQuality` | `boolean` | `true` | Drop render resolution when frame time exceeds the budget. |
| `behaviors` | `Behavior[] \| null` | `null` | Replace the simulation pipeline. `null` uses the defaults. |
| `backend` | `() => SimulationBackend \| null` | `null` | Swap the simulation backend. |
| `onReady` | `(instance) => void \| null` | `null` | Fires once the instance is constructed. |
| `onError` | `(error) => void \| null` | `null` | Fires on WebGL2 failure and async shape-loading errors. |

### Modes

- **`background`** — `position: fixed`, covering the viewport. Pointer listeners attach to `window`. Use for full-page hero effects.
- **`container`** — `position: absolute`, filling the host element. Pointer listeners attach to the host, so multiple instances on one page stay independent. The host needs a non-`static` position and a real height.
- **`page`** — `position: absolute` at the top of the document, spanning the full page width. Combine with `setPageHeight(px)` to cover a scrolling region taller than the viewport.

---

## `major` — the morphing pool

| option | type | default | description |
|---|---|---|---|
| `size` | `number` | `6` | Base sprite diameter in CSS pixels, before DPR. |
| `sizeVariation` | `number` | `0.85` | Per-particle size spread. `0` makes every particle identical. |
| `sizeBias` | `number` | `1.8` | Skews the size distribution. `1` is uniform; above `1` makes most particles small with a few large, which is what reads as a starfield. |
| `follow` | `number` | `0.1` | How hard particles chase their target once shaped. Higher is snappier. |
| `followSpread` | `number` | `0.016` | Same, while dispersed. Low values give a loose floating feel. |
| `velocity` | `number` | `0.002` | Weight of residual per-particle velocity. |
| `damping` | `number` | `0.97` | Velocity retention while morphing. |
| `twinkle` | `number` | `0.18` | Brightness flicker amplitude when shaped. |
| `depth` | `number` | `0.8` | How strongly z position scales size and brightness while dispersed. |

`follow` and `followSpread` are frame-rate normalised, so the motion looks the same at 60 Hz and 144 Hz.

---

## `transition` — how the morph moves

| option | type | default | description |
|---|---|---|---|
| `speed` | `number` | `0.014` | Rate the morph scalar approaches its target. |
| `easing` | `(t: number) => number` | `easeInOutCubic` | Shapes the interpolation curve. |
| `assign` | `'angular' \| 'index' \| 'random'` | `'angular'` | How particles are paired with sampled shape points. |
| `settle` | `number` | `0.1` | Follow strength once fully morphed and undisturbed. |
| `stagger` | `number` | `0.38` | Spreads particle departure times across the transition, so the shape assembles progressively instead of every particle arriving at once. `0` disables it. |
| `order` | `'random' \| 'x' \| 'y' \| 'radial' \| 'angular'` | `'radial'` | How the stagger delays are ordered. `random` scatters them; the spatial orders turn the stagger into a directional wipe. |
| `sweep` | `number` | `0.9` | Brightness and size boost applied to particles as the stagger wave reaches them. `0` disables the flash. |
| `sweepWidth` | `number` | `0.22` | Width of the flashing band, in morph units. Narrow is a crisp wave, wide is a soft glow. |
| `turbulence` | `number` | `16` | Noise displacement applied to particles while in flight, peaking mid-transition and fading to zero on arrival. |

### The sweep

With `stagger` above zero and `sweep` above zero, a wave travels across the field in the direction set by `order`, and each particle launches toward the shape as the wave reaches it — brightening and swelling as it goes. The shape appears to be conjured rather than interpolated.

```ts
stipple.setOptions({
  transition: { stagger: 0.75, order: 'y', sweep: 1, sweepWidth: 0.15 },
});
```

`order: 'radial'` reads as the shape condensing from the centre out, `'y'` as a top-to-bottom wipe, `'angular'` as a radar sweep. Set `sweep: 0` to keep the staggered assembly without the flash.

### `assign` matters more than it looks

`random` pairs each particle with an arbitrary shape point, so a particle on the left of the sphere may fly to the right of the shape. The result is a scramble.

`angular` sorts both the dispersed particles and the sampled shape points by angle around their centroids, then pairs them in order. Particles travel far shorter distances and the shape snaps into focus instead of churning. For two concentric rings this reaches the mathematically optimal pairing.

`index` pairs by array order — cheapest, and useful when you generate shape points yourself in a meaningful sequence.

`easing` accepts either a function or the name of a built-in:

```ts
stipple.setOptions({ transition: { easing: 'outExpo' } });

import { easeOutExpo } from 'stipple-gl';
stipple.setOptions({ transition: { easing: easeOutExpo } });
```

Names: `linear` · `inOutCubic` · `inOutQuad` · `outExpo` · `outBack` · `inOutElastic`.

Prefer the name. It is shorter, it tree-shakes the same, and it is the only form that survives [worker mode](worker.md), where functions cannot cross the thread boundary.

---

## `spread` — the dispersed state

| option | type | default | description |
|---|---|---|---|
| `radius` | `number` | `0.62` | Sphere radius as a fraction of the canvas half-diagonal. Because density fades toward the edge, values above `1` still look natural. |
| `flow` | `number` | `0.0015` | Spatial frequency of the noise flow field. Higher is more turbulent. |
| `breathe` | `number` | `1` | Slow brightness pulsing. `0` disables it. |
| `zoom` | `number` | `1.1` | Camera zoom while dispersed. Returns to `1` when shaped. |
| `pan` | `{ x, y }` | `{ x: 0.02, y: -0.015 }` | Static camera offset while dispersed. |
| `drift` | `number` | `0.02` | Speed of the slow automatic camera wander. |
| `speed` | `number` | `0.01` | How quickly the camera eases toward its target. |
| `rotation` | `number` | `0.05` | Radians per second the dispersed sphere spins about its vertical axis. Negative reverses it; `0` holds it still. |
| `tilt` | `number` | `0.16` | Fixed tilt of the spin axis, in radians. Without a tilt the rotation reads as flat. |
| `volume` | `number` | `1` | `1` distributes particles evenly through the sphere's volume, so density fades smoothly to nothing at the edge. `0` places them on the shell, which produces a visible rim. |

---

## `minor` — the ambient layer

| option | type | default | description |
|---|---|---|---|
| `size` | `number` | `3.4` | Base size. |
| `sizeBias` | `number` | `2.4` | Size distribution skew, as with `major.sizeBias`. |
| `sizeJitter` | `number` | `1` | Per-particle size randomisation. |
| `sizeScale` | `number` | `1` | Multiplier applied at render time. |
| `speed` | `number` | `1` | Strength of the noise force. |
| `turbulence` | `number` | `0.4` | Chaos in the flow field. |
| `drag` | `number` | `0.99` | Velocity retention. Lower settles faster. |
| `maxSpeed` | `number` | `0.28` | Hard velocity clamp. |
| `opacity` | `{ x, y }` | `{ x: 0.22, y: 1 }` | Alpha range. The distribution is skewed toward the minimum, so most particles are dim and a few are bright. |
| `respawnChance` | `number` | `0.0005` | Per-particle chance per frame of teleporting elsewhere. |

---

## `emission` — sparks

| option | type | default | description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Turn the whole layer off. |
| `max` | `number` | `140` | Hard cap on live sparks. |
| `lifespan` | `number` | `62` | Base lifetime. |
| `speed` | `number` | `0.85` | Initial velocity multiplier. |
| `rate` | `number` | `0.016` | Spawn probability per sampled source particle per frame. |
| `burst` | `[number, number]` | `[1, 2]` | Min and max sparks per spawn event. |
| `spiral` | `number` | `0.0008` | Curl force that makes sparks orbit. |
| `turbulence` | `number` | `0.003` | Noise applied to spark velocity. |

Emission behaves differently by state: while shaped, sparks drift upward from the figure; while dispersed, they float outward slowly and live much longer.

---

## `pointer` — interaction

| option | type | default | description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Master switch. Disables listener registration entirely. |
| `radius` | `number` | `150` | Influence radius in CSS pixels. |
| `force` | `number` | `10` | Repulsion strength. |
| `falloff` | `number` | `1.6` | Falloff exponent. Higher concentrates the force near the cursor. |
| `press` | `number` | `1.25` | Force multiplier while the pointer is down. |
| `shockwave` | `boolean` | `true` | Emit an expanding ring on press. |
| `shockwaveForce` | `number` | `14` | Ring displacement strength. |
| `shockwaveSpeed` | `number` | `0.18` | Ring expansion rate in px/ms. |
| `shockwaveLife` | `number` | `1600` | Ring lifetime in ms. |
| `shockwaveThickness` | `number` | `110` | Ring band width in px. |

Pointer forces apply only when the field is fully morphed — a dispersed cloud does not react. Hit-testing uses the shape's bounding box, so cost does not scale with particle count.

Fire a wave programmatically with `stipple.pulse(x, y, strength)`.

---

## `jelly` — wobble

| option | type | default | description |
|---|---|---|---|
| `intensity` | `number` | `2.4` | Displacement amplitude. `0` freezes the shape solid. |
| `speed` | `number` | `1.35` | Oscillation rate. |

The wobble is depth-weighted, so particles further back move more, which reads as volume. It damps to 45% while the pointer is active so interaction stays legible.
