# Changelog

## Unreleased

This release restructures the public API. Nothing is published yet, so the breaking changes are taken now rather than lived with.

### Breaking

- **`transition` is now three choreography slots**, not a flat bag. `enter` (spread to shape), `exit` (shape to spread) and `swap` (shape to shape) each take the same seven options, or one of the names `'uniform'`, `'sweep'`, `'burst'`. `exit: 'mirror'` reuses `enter`; `swap: 'none'` retargets instantly.
- **`transition.assign` moved to the top level as `assign`.** It is a property of the shape, not of the move — it applies every time a shape is set, including a swap. It also now accepts a function.
- **`transition.settle` moved to `major.settle`.** It is a steady state, not a transition.
- **`transition.sweep` renamed to `flash`** and `sweepWidth` to `flashWidth`, inside a choreography. It was never the sweep — it is a brightness flourish on the wavefront. The sweep is `stagger` plus `order`.
- **`order: 'angular'` renamed to `'radar'`**, because `assign: 'angular'` is an unrelated mechanism and the collision was a trap.
- **`transition.speed`/`easing`/`stagger`/`order`/`turbulence` moved inside a choreography.** `transition.returnSpeed` is gone; use `transition.exit.speed`.
- **`setMorph` returns a promise** and **`setShape` returns a boolean**.

### Added

- **`morphTo(shape, options?)` and `release()`** — one call each, awaitable, resolving on arrival. The two-step `setShape` + `setMorph` dance was order-sensitive and easy to get wrong; the playground itself had the bug.
- **Shape-to-shape choreography.** Setting a new shape while one is displayed now interpolates between them on its own progress clock, with its own stagger, easing, turbulence and flash. Previously every swap was an instant retarget and the particles just slid over.
- **Events** — `on`/`off` for `morphstart`, `morphprogress`, `morphend` and `shapechange`. `on` returns an unsubscribe function. A superseded morph settles as `cancelled`, it does not reject.
- **`resetOptions(config?)`** drops every runtime tweak and rebuilds from the defaults, keeping injected capabilities.
- **Per-particle colour.** `color` accepts a ramp (`by: 'depth' | 'radius' | 'index'`) or `{ type: 'shape' }`, which reads each particle's colour from the pixel of the source artwork it was sampled from.
- **Behaviour phases.** `Behavior.phase` (`'target' | 'deform' | 'force' | 'integrate' | 'ambient'`) replaces guessing at magic order numbers. An explicit `order` still wins.
- **Development-only validation.** Unknown keys with spelling suggestions, out-of-range values, bad choreography names, and configs that cannot do what they appear to ask. Folded out of production builds entirely.
- **A script-tag build.** `dist/stipple.global.js`, exposed through `unpkg` and `jsdelivr`, puts the common API on `window.stipple`. No bundler needed.
- `setShape` reports through `onError` and returns `false` when the field has no major particles, which is what made ambient presets look broken.
- `docs/presets.md` and `docs/events.md`.

- **Raster image sources.** PNG, JPEG, WebP, AVIF, GIF, a canvas, an ImageBitmap or a video frame can all be a shape. Decoding goes through `createImageBitmap`, so the supported list is whatever the browser decodes rather than anything hardcoded.
- **`shapeFromFile(file)`** picks the strategy for you: vector for plain SVG, rasterised for SVG that uses gradients, filters, patterns or stylesheets, and the image decoder for everything else. `svgNeedsRaster` exposes the test.
- **`mask` and `threshold` on a shape** — `'alpha'` (default), `'dark'` or `'light'`. An opaque photograph has no alpha to mask with, so under the default it would sample as a rectangle; the luminance masks make photographs usable.
- `imageFromURL`, `imageFromBlob`, `rasterizeSVG`, `shapeFromImage`, `shapeFromImageURL` and `shapeFromSVGImage`.
- **`detail` and `detailStrength` on a shape** — `'uniform'` (default), `'edges'` or `'density'`. Uniform sampling over a flat-filled illustration spends ~86% of the budget on featureless interior and reads as a silhouette; edge weighting puts 2.4x more particles on contours for a 3% loss of coverage.
- `docs/images.md`.

### Fixed

- **Switching presets froze the field.** `behaviors`, `shapes` and `backend` default to `null` and are injected at construction, so any config built from `defaultOptions` — every preset switch — wiped them. An empty pipeline froze every particle; a missing sampler made `setShape` a silent no-op.
- **Zooming out cropped the spread sphere.** Culling ran in raw viewport pixels while the shader applied the camera afterwards, so particles the camera would have pulled back into view had already been discarded. The cull now inverts the shader's transform.
- **Returning to the spread was instant.** Clearing the shape flipped `hasShape` false on the next frame, so the exit never animated. `release()` keeps the shape; `exit` runs at 45% of the entry speed by default.
- **The `dust` preset was invisible** — 183 particles at 0.06% ink coverage. Retuned to 0.92%, on par with `starfield`. A test now enforces a visibility floor for every preset.
- **The sweep read as a flash.** Defaults were `stagger: 0.38` with `flash: 0.9`, so nearly every particle was in flight nearly all the time and the flash was the only perceptible event. Now `stagger: 0.82`, `order: 'x'`, `flash: 0`.
- **Stroked SVG icons came out as blobs.** Presentation attributes cascade and `style` beats the attribute of the same name, but the parser read `fill` off the element alone. Nearly every outline icon set puts `fill="none"` once on the `<svg>` root, so its paths were treated as fills — and filling an open outline path is a blob, not an outline. Measured on a cloud icon: 42% of the bounding box inked as a stroke against 77% as a fill.
- **Colourful SVGs lost their colour.** Fills expressed as `url(#gradient)` or inside a `style` attribute were invisible to the parser, and `Path2D` cannot draw a gradient anyway. Such artwork is now rasterised through the browser's own SVG renderer instead.
- **`detail: 'edges'` at full strength collapsed flat shapes to a single point.** Edges were detected from luminance alone, which is blind to a flat black icon on transparent — luminance is 0 inside and out. Every weight came out zero and the whole field landed on one pixel. Edges now also read the alpha channel, so a silhouette registers, and a shape with nothing to weight falls back to uniform.
- Geometry that nothing paints is skipped rather than stamped into the silhouette, and `line`/`polyline` are always stroked since they have no interior.
- `pnpm install` failed on pnpm 11: `pnpm-workspace.yaml` carried an unfilled placeholder and the pnpm 10 spelling of the build allowlist.

## 0.1.0

First release.

Extracted from two production applications, rebuilt as a framework-agnostic engine.

### Added

- `Stipple` engine — WebGL2 point renderer, morph scalar, three particle layers.
- `SimulationBackend` interface with a bundled optimised `CpuBackend`.
- Tree-shakeable behaviour pipeline: morph, breathe, jelly, pointer, shockwave, integrate, drift, emission.
- SVG parsing with nested group transforms, primitive shape conversion, even-odd fills, and stroke sampling.
- Angular target assignment, reaching optimal pairing for radially symmetric morphs.
- Three render modes: `background`, `container`, `page`.
- React binding: `<Particles>`, `useStipple`, `useMorphOnScroll`.
- Scroll module built on native CSS scroll-snap, with no scroll hijacking.
- Six presets: morph, snap, starfield, constellation, nebula, dust.
- Adaptive quality, auto-pause, reduced-motion support, and WebGL context-loss recovery.
- `tick()` for driving the simulation from an external loop.
