# Changelog

## Unreleased

### Added

- `stipple-gl/worker` runs the whole simulation and all rendering on a Web Worker via `transferControlToOffscreen`. Same `StippleInstance` API.
- `stipple-gl/lite`, a 9.8 KB entry without the SVG parser, sampler, assignment or optional behaviours.
- `transition.stagger` and `transition.order` stagger particle departure by index or by position, turning a morph into a directional wipe.
- `transition.sweep` and `sweepWidth` add a travelling flash that brightens particles as the wave reaches them.
- `transition.turbulence` scatters particles mid-flight, fading to zero on arrival.
- `spread.rotation`, `spread.tilt` and `spread.volume` — the dispersed field is now a volume-distributed sphere that rotates for real depth parallax.
- `core` controls the bright centre of each particle sprite; `softness` now controls the halo width.
- `major.sizeBias` and `minor.sizeBias` skew the size distribution so most particles are small and a few are large.
- `transition.easing` accepts a name as well as a function, which is what makes it work across the worker boundary.
- `scripts/audit-options.mjs` fails CI if any option has no consumer.

### Fixed

- Presets did nothing: `setOptions` updated `count` before `setCount` compared against it, so the backend never reallocated. `setOptions` now owns reallocation and re-inits behaviours.
- `ShapeConfig.color` was written but never read. It now tints the field, cross-fading as the morph advances.
- Nothing rendered at all: the context requested `desynchronized: true`, which paints black on Windows Chrome.
- Overlapping particles composited about 3x too dark from mixing premultiplied output with `SRC_ALPHA` blending.
- The dispersed field was an ellipse that stretched with the viewport and had a hard rim.

### Changed

- Simulation extracted into a DOM-free `Runtime` shared by the main-thread and worker engines.

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
