# Changelog

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
