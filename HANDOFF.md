# Handoff

Working notes for picking this up on another machine. Not part of the published package — delete it before `npm publish` if you like, or keep it, it is excluded from `files` in package.json either way.

Last worked on: 2026-08-25 (evening session: full API redesign, see CHANGELOG).

---

## Getting running from the zip

```bash
pnpm install
```

If pnpm reports `ERR_PNPM_IGNORED_BUILDS` for esbuild, `pnpm-workspace.yaml` is wrong. pnpm 11 reads `allowBuilds` (a name-to-boolean map); `onlyBuiltDependencies` is the pnpm 10 spelling and is ignored by 11. Both are present now:

```yaml
allowBuilds:
  esbuild: true
onlyBuiltDependencies:
  - esbuild
```

If it still complains, run `pnpm rebuild esbuild` once.

Then:

```bash
pnpm validate      # lint + format + typecheck + tests + dead-option audit + build
pnpm visual        # Playwright screenshot tests against the playground
pnpm playground    # interactive playground on http://localhost:5180
```

Append `?worker=1` to the playground URL to run the same scene on a Web Worker. The status line in the top right says which thread is drawing.

Requires Node 22+ and pnpm 11. Built on Windows with Node 24.16 and pnpm 11.5.2.

---

## Where things stand

Everything below is committed. `git log` has the detail — the commit messages are written to be worth reading.

| commit        | what                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `711a6fd`     | Extracted the engine from `web_app1` and `sinafrontend` into a package                            |
| `09cb20b`     | Fixed the black canvas (`desynchronized` + premultiplied alpha)                                   |
| `7e7811b`     | Reworked sprite quality, sphere layout, morph transition                                          |
| `c2062c0`     | Sweep transition, per-frame optimisations, lite entry, dead-prop audit                            |
| `9807786`     | Worker mode via OffscreenCanvas, DOM-free runtime                                                 |
| _uncommitted_ | Full API redesign — see CHANGELOG "Unreleased". Twelve findings from the API review, all applied. |

**Nothing is published.** No GitHub remote, nothing on npm. That was deliberate.

---

## Architecture in one screen

```
core/runtime.ts     the engine. Touches NO DOM API. gl, renderer, backend,
                    frame state, step(), render(). Shared by both hosts.
core/engine.ts      StippleCore — the browser host. Canvas, observers,
                    pointer, rAF loop. Delegates all simulation to Runtime.
worker/index.ts     WorkerStipple — the same host, but forwards messages
                    to a worker instead of calling Runtime directly.
worker/thread.ts    runs Runtime against an OffscreenCanvas.
backends/cpu.ts     SimulationBackend implementation. SoA typed arrays.
behaviors/*.ts      ordered pipeline, each a tight loop over those arrays.
sources/*.ts        SVG parse -> rasterise -> sample -> assign.
```

Three tests guard the split and will fail loudly if it is broken:

- no `document` / `window` / `ResizeObserver` / `IntersectionObserver` in `runtime.ts`
- none of those plus no `DOMParser` in `worker/thread.ts`
- exactly one `getContext(` call in the whole codebase

---

## Decisions already made — do not re-litigate

- **Core is framework-agnostic; React is a thin binding.** The original was a React component. Inverting that was the point of the whole exercise.
- **`SimulationBackend` exists so a GPU transform-feedback backend can land later.** v1 ships an optimised CPU backend deliberately, to ship rather than slip.
- **The scroll module reads scroll position and composes with native CSS `scroll-snap`.** It deliberately does _not_ port the 707-line GSAP scroll-hijacker from sinafrontend. Reasoning is in `docs/scroll.md`.
- **`easing` accepts a name as well as a function.** The name form is the only one that survives the worker boundary, because `postMessage` cannot clone functions.
- **`spread.volume: 1` (volume-distributed sphere) is why there is no visible rim.** A shell distribution piles particles at the silhouette. Do not "simplify" this back to a shell.
- **`assign: 'angular'`** is why morphs read as condensing rather than scrambling. There is a test asserting it reaches the optimal pairing for concentric rings.
- **`transition` is three choreography slots (`enter`/`exit`/`swap`), and `assign` sits outside it.** They have different lifecycles: `assign` fires on every `setShape`, choreography only while something is moving, and `major.settle` only when nothing is. Do not flatten them back together.
- **The sweep is `stagger` + `order`. `flash` is a separate flourish, off by default.** A high `stagger` is what makes the wavefront narrow, because each particle's own flight lasts `1 - stagger`.
- **`behaviors`, `shapes` and `backend` default to `null` and are injected at construction.** `setOptions` treats `null` as unspecified, never remove — otherwise any defaults-derived config silently tears the engine down. This cost a whole debugging session once.
- **Culling in `pack` must invert the shader's camera transform.** Culling against the raw viewport crops the sphere the moment the camera zooms out.

---

## Numbers that are measured, not estimated

Re-measure before changing any of these in the README.

| claim                                                            | how to reproduce                                                                                                                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lite 12.4 KB / full 17.9 KB gzipped, as a real import costs      | `node scripts/measure.mjs` measures the whole barrel (19.6 KB); a consumer importing `{ Stipple, shapeFromURL }` ships 17.9 KB. Quote the import, not the barrel. |
| npm package 119.9 KB packed / 439 KB unpacked                    | `npm pack --dry-run`. Sourcemaps are deliberately not built or shipped — they were 932 KB of a 1372 KB package.                                                   |
| 25,000 particles at ~4.1 ms CPU/frame (1920x1080, full pipeline) | benchmark `backend.step` + `backend.pack` directly; morph ~1.5ms, jelly ~0.76ms, breathe ~0.63ms                                                                  |
| per-module bundle attribution                                    | `node scripts/analyze.mjs stipple`                                                                                                                                |
| 25,000 particles at ~8 ms CPU/frame                              | snippet at the end of `docs/performance.md`                                                                                                                       |
| worker keeps 60 fps through a 900 ms main-thread block           | `docs/worker.md`                                                                                                                                                  |
| competitor sizes (tsparticles 52 KB, particles.js 8.8 KB)        | measured on published bundles; **particles.js is smaller than us and the README says so**                                                                         |

---

## Debugging tricks worth remembering

**Reading pixels back off the GPU.** Do it inside a _nested_ `requestAnimationFrame`, never `setTimeout`. With `preserveDrawingBuffer: false` the buffer is gone after compositing, and a `setTimeout` read returns all zeros — which looks exactly like a rendering bug and is not one. This cost time once already.

```js
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  }),
);
```

**Pixels present but screen black** means a compositing problem, not a simulation one. Check context attributes and stacking, not the particle code. See the troubleshooting section in `docs/getting-started.md`.

**The playground exposes `window.stipple`** and `window.stippleMode`, so you can drive the engine from the console.

---

## Not done

- **Publishing.** Needs `gh auth refresh -h github.com` (the keyring token was invalid) and `npm login`. Name `stipple-gl` was unclaimed on npm as of 2026-08-25 — re-check before announcing.
- **LinkedIn post.** Three drafts in `docs/launch-post.md`, links left as placeholders. Recommended draft leads with the target-assignment insight. Record a 10–20s playground clip to attach; video matters more than wording there.
- **Playground deployment.** `pnpm playground:build` outputs to `dist-playground/`. Not deployed anywhere yet.
- **React worker component.** `stipple-gl/worker` is imperative only; `docs/worker.md` shows the `useEffect` pattern. A `<WorkerParticles>` component would be a small, obvious addition.
- **Linked lines were deliberately skipped.** It is tsparticles' signature feature, it is CPU-expensive everywhere it exists, and chasing it fights on their ground. Shape morphing is the differentiator.
- **Visual tests need a browser.** `pnpm visual` uses the Chrome already installed locally; CI installs Playwright's own pinned Chromium, because screenshot comparison is only meaningful against a fixed build. Regenerate baselines with `pnpm visual:update` and _look at the diff_ before accepting it.
- **The visual harness has to freeze three things** to be deterministic: a seeded `Math.random`, a frozen `performance.now`, and `requestAnimationFrame` neutralised in an init script. Stopping the loop after load is not enough — `drift` rolls the generator once per ambient particle per frame, so stray real frames shift every particle.
- **The playground's worker toggle is dev-only.** It constructs the worker from `../../src/worker/thread.ts` so Vite can resolve the TS source. The published path uses `new URL('./thread.js', import.meta.url)`.

## Candidate next features, roughly in order of value

1. **GPU transform-feedback backend.** Slots behind the existing `SimulationBackend` interface. Makes "runs on the GPU" fully true and lifts the ceiling past 100k particles. Pointer forces, shockwaves and target assignment all need reformulating as texture lookups — that is the hard part.
2. **Linked lines between nearby particles.** The most visible feature gap versus tsparticles. Needs a spatial grid and a second draw call, and is CPU-expensive everywhere it exists.
3. **Playground deployment and the launch post.** The only things between here and publishing.
