# Changelog

## Unreleased

This release restructures the public API. Nothing is published yet, so the breaking changes are taken now rather than lived with.

### Breaking

- **`transition` is now three choreography slots**, not a flat bag. `enter` (spread to shape), `exit` (shape to spread) and `swap` (shape to shape) each take the same seven options, or one of the names `'condense'`, `'uniform'`, `'sweep'`, `'burst'`. `exit: 'mirror'` reuses `enter`; `swap: 'none'` retargets instantly.
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
- **`mask` and `threshold` on a shape** — `'auto'` (default), `'alpha'`, `'dark'` or `'light'`. See Fixed for what `auto` does.
- `imageFromURL`, `imageFromBlob`, `rasterizeSVG`, `shapeFromImage`, `shapeFromImageURL` and `shapeFromSVGImage`.
- **`detail` and `detailStrength` on a shape** — `'uniform'` (default), `'edges'` or `'density'`. Uniform sampling over a flat-filled illustration spends ~86% of the budget on featureless interior and reads as a silhouette; edge weighting puts 2.4x more particles on contours for a 3% loss of coverage.
- `docs/images.md`.

### Changed

- **New default choreography, `'condense'`.** The old default was a left-to-right wipe at `speed: 0.014`, which took about 5.4s to enter and 12.2s to leave. `condense` is centre-out with no direction to notice, and measured in the browser: enter 1.50s, swap 1.73s, exit 2.17s. `'sweep'` still exists and is still the directional wipe.

- `exit: 'mirror'` now runs at 70% of the entry speed rather than 45%.
- A swap finishes at 99.5% rather than 99.95% progress. The remainder is a sub-pixel move between two shapes and `major.follow` smooths the handover, so it costs nothing visible and keeps a swap as quick as an enter.
- Default colour is now `'#5ec8f2'`, a luminous cyan. The old `'#4f9c7d'` was dark enough that the depth and brightness falloff left particles looking muddy.

### Performance

- **Interpolated sine lookup for the per-particle behaviours.** `breathe` and `jelly` called `Math.sin`/`Math.cos` once per particle per frame; breathe alone was 31% of frame time, purely to compute a brightness value. Simulation cost at 25,000 particles drops from 4.73ms to 4.06ms per frame, and breathe halves. The table is interpolated so the error is ~3.2e-7 — below what the Float32Array holding these values can represent distinctly, so nothing looks different.

### Playground

- **A colour drawer** with three modes: solid, a ramp across the field, or the source artwork's own pixels. The last was already in the library and had no way to reach it — the Firefox logo renders in 1,901 of its own colours rather than one flat tint.
- **Seven generated showpieces** — a Hilbert curve, a mandala, a spirograph, a torus knot, a phyllotaxis spiral, a fractal tree and a wave interference pattern. Generated rather than hand-authored, because the point of them is intricacy and a few hundred hand-written path commands is not maintainable. They are stroked, so the field lands on the line rather than filling a silhouette.
- Shape chips are split into **Icons** and **Showpieces** rather than one undifferentiated run of 26.
- **The collapsible groups are real drawers now.** `<details>` hides everything but the summary the instant it closes, so there is nothing left on screen to animate. The panel uses a controlled section with a `grid-template-rows: 0fr -> 1fr` transition instead, which slides from the content's own height with nothing to measure. The trigger is a real button carrying `aria-expanded`, and collapsed content is `inert` — neither of which `<summary>` gives you.
- Accent retuned to match the new default particle colour, and every transition honours `prefers-reduced-motion`.
- **The collapsed panel could not be brought back.** The only control lived inside the panel, so it slid off screen with it. There is now a toggle in the masthead that stays put, the two stay in sync, and `P` toggles it too (ignored while a control has focus). A collapsed panel is `inert`, so it is out of the tab order.
- **Fixed a gap in the wordmark.** `.wordmark` is a flex container, so the bare text node "stipple" became its own anonymous flex item and the container's 9px gap landed between it and "-gl". The name is one span now.
- Scrollbar restyled and made cross-browser — `scrollbar-width`/`scrollbar-color` for Firefox alongside the WebKit pseudo-elements, with an inset thumb that keeps the full track grabbable.
- A real page title and an SVG favicon.
- A shape that fails to parse now surfaces as a toast instead of an uncaught error that takes the whole page down.

### Tooling

- **Visual regression tests.** 14 Playwright cases screenshot the playground: the dispersed sphere, a morphed shape, a transition caught mid-flight, all seven showpieces, uniform against edges detail, and a colour ramp. Determinism took three things — a seeded `Math.random` injected before any module runs, a frozen `performance.now`, and `requestAnimationFrame` neutralised at load so no uncounted frames slip through. Stopping the loop after load was not enough: `drift` rolls the generator once per ambient particle per frame, so a handful of real frames shifted every particle and produced a test that failed and then passed.
- A separate assertion reads the canvas back and fails on a black frame. A screenshot baseline records whatever it first sees, so on its own it would happily bless a canvas that composites black — a failure this project has actually had.
- **ESLint and Prettier.** Type-aware rules for correctness, formatting left entirely to Prettier so the two never argue. Tests and scripts get a looser block, since reaching into internals is what they are for. `pnpm validate` and CI now run both, and CI runs the visual suite against Playwright's own pinned Chromium with the diff images uploaded on failure.
- `tsconfig` covers `visual`, `scripts`, `examples` and the config files, so the linter can see everything and a broken example fails the build.

### Fixed by the new linter, immediately

- **Three dropped promises.** `setMorph` became awaitable in this release and `useStipple`, the scroll module and the playground all still called it fire-and-forget. A rejection there would have vanished silently.
- `CpuBackend.setShape` pulled `assign` off the sampler before calling it, which would lose the receiver for any class-based `ShapeSupport`. It now calls through the object.

### Packaging

- **Sourcemaps are no longer built or published.** They were 932 KB of a 1372 KB package. The published tarball is now 119.9 KB packed and 439 KB unpacked, down from 322.5 KB and 1372 KB.
- `files` is an explicit allowlist rather than the whole `dist` directory.
- README size claims corrected: they quoted the whole barrel and were also stale. A real `import { Stipple, shapeFromURL }` is 17.9 KB gzipped; the barrel is 19.6 KB.

### Fixed

- **`mask: 'auto'` is the new default for raster sources.** An opaque image — a JPEG, a scan, clipart on a white background — has no alpha to mask with, so the old default called every pixel ink and handed back the source rectangle with a border around it. `auto` inspects the pixels: real transparency keeps the alpha channel, otherwise it falls through to luminance and keeps whichever of dark or light is the minority. Measured on a black-and-white rose JPEG: 753x503 (the whole frame) before, 325x310 (the rose) after, with no configuration.
- A single flat colour resolves to `alpha` rather than a luminance split. There is no figure to separate from ground, and the minority rule would otherwise discard the entire image.
- **Invalid SVG now says what the XML parser objected to.** SVG is parsed strictly, so an undeclared namespace prefix or an unclosed tag is fatal; "invalid SVG markup" alone left the caller with a file and nowhere to look.
- Two edge-case suites — 36 cases for SVG (units on width/height, negative viewBox origins, scientific notation in transforms, undeclared namespaces, empty and unpaintable documents, Inkscape and Illustrator quirks) and 19 for raster (zero-size images, 1x1, extreme aspect ratios, fully transparent, single flat colour, thresholds that exclude everything, counts of 0 and 1, out-of-range scale, position and detailStrength).
- **A tagged union in a config merged instead of replacing.** `setOptions` deep-merges plain objects, so switching `color` from a ramp to `{ type: 'shape' }` produced a shape spec still carrying the ramp's `from`, `to` and `by`. Nothing read them, but `options.color` no longer reflected what the caller passed. Objects whose `type` differs now replace.
- **Switching presets froze the field.** `behaviors`, `shapes` and `backend` default to `null` and are injected at construction, so any config built from `defaultOptions` — every preset switch — wiped them. An empty pipeline froze every particle; a missing sampler made `setShape` a silent no-op.
- **Zooming out cropped the spread sphere.** Culling ran in raw viewport pixels while the shader applied the camera afterwards, so particles the camera would have pulled back into view had already been discarded. The cull now inverts the shader's transform.
- **Returning to the spread was instant.** Clearing the shape flipped `hasShape` false on the next frame, so the exit never animated. `release()` keeps the shape; `exit` runs at 70% of the entry speed by default.
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
