# Performance

## What it costs

Per frame the engine does one pass over each particle population in the behaviour pipeline, one pass to pack the vertex buffer, and one `drawArrays`. There is no per-frame allocation, so the garbage collector stays out of the animation.

The dominant cost is the CPU simulation, not the GPU. Draw time is effectively flat with particle count at these scales; step time is linear.

## Tuning, in order of impact

### 1. `maxDpr`

The single biggest lever. Rendering at `devicePixelRatio: 3` on a phone means shading nine times the pixels of DPR 1. Point sprites are fill-heavy, so this dominates GPU time.

```ts
new Stipple('#hero', { maxDpr: 1.5 });
```

`2` is the default and looks sharp everywhere. `1.5` is usually indistinguishable in motion and much cheaper on high-density displays.

### 2. `count`

Step time scales linearly. Scale it to the device rather than shipping one number:

```ts
import { responsiveCount } from 'stipple-gl';

const count = responsiveCount(
  [
    [640, 1800],
    [1024, 2600],
    [1920, 3500],
  ],
  4600,
  window.innerWidth,
);
```

Below roughly 1,500 particles a detailed shape starts to read as sparse. Simplify the artwork rather than pushing the count lower.

### 3. Turn off what you are not using

Each behaviour is a full pass. If you cannot see an effect, do not pay for it:

```ts
new Stipple('#hero', {
  emission: { enabled: false },
  jelly: { intensity: 0 },
  pointer: { enabled: false },
});
```

`pointer: { enabled: false }` also skips registering listeners entirely.

For a hard floor, replace the pipeline:

```ts
import { createMinimalBehaviors } from 'stipple-gl';

new Stipple('#hero', { behaviors: createMinimalBehaviors() });
```

### 4. `maxFps`

Capping to 30 halves the work and, for a slow ambient background, is often imperceptible:

```ts
new Stipple('#hero', { maxFps: 30 });
```

Leave it at `0` for anything the user interacts with.

## What runs automatically

**Adaptive quality** watches a rolling 45-frame average. Above ~22 ms it steps render resolution down (to a floor of half the requested DPR); below ~13 ms it steps back up. Resolution degrades before motion does, which is far less noticeable than dropping frames. Disable with `adaptiveQuality: false`.

**Auto-pause** stops the loop when the canvas leaves the viewport (`IntersectionObserver`) or the tab is hidden (`visibilitychange`). A background you scroll past costs nothing once it is gone. Disable with `autoPause: false`.

**Reduced motion** renders one static frame and never starts the loop when the user has `prefers-reduced-motion: reduce`. It reacts live if they change the setting. `reducedMotion: 'ignore'` opts out — think carefully before doing that.

## Measuring

```ts
console.log(stipple.fps);
```

Populated from the same rolling average adaptive quality uses, updated roughly every 45 frames. It reads `0` until the first window closes.

For real profiling use the browser's performance panel. `step` time appears under the rAF callback; if it dominates, reduce `count` or drop behaviours. If GPU time dominates, reduce `maxDpr` or `major.size`.

## Several instances on one page

Each instance is a separate WebGL context, and browsers cap concurrent contexts (commonly around 16, with the oldest discarded). Two or three is fine. If you need more, share one `mode: 'background'` instance and drive its shape from whatever is in view, rather than creating one per card.

Always `destroy()` instances you no longer need — a leaked context counts against the limit until it is garbage collected.

## Cost of a shape change

`setShape` rasterises, scans, samples, and assigns. At the default 512 px raster and a few thousand particles this is a low-single-digit millisecond operation — fine for a route change or a scroll section, and fine on resize.

It is not something to call every frame. To animate between shapes, animate the morph scalar, not the shape.

Resize triggers a resample because sampling is resolution-dependent. The `ResizeObserver` has a 2 px dead-band so sub-pixel jitter and mobile toolbar show/hide do not thrash it.

## Mobile

Phones are fill-rate limited more than compute limited. In order: lower `maxDpr`, lower `major.size`, then lower `count`.

Mobile browsers resize the viewport when the URL bar hides. For `mode: 'page'`, measure against a `100svh` probe element rather than `window.innerHeight` so the field does not jump while scrolling.

## Measured cost

Simulation step plus vertex packing and buffer upload, at a 1280×720 canvas with the full default behaviour pipeline and a shape applied. Median of 60 frames after warm-up, on a Windows laptop.

| particles | median step | of a 60 fps frame | p95     |
| --------- | ----------- | ----------------- | ------- |
| 1,000     | 1.0 ms      | 6%                | 2.2 ms  |
| 3,000     | 2.5 ms      | 15%               | 3.6 ms  |
| 6,000     | 2.2 ms      | 13%               | 6.7 ms  |
| 10,000    | 5.7 ms      | 34%               | 10.8 ms |
| 15,000    | 5.2 ms      | 31%               | 15.7 ms |
| 25,000    | 8.0 ms      | 48%               | 23.6 ms |
| 50,000    | 24.5 ms     | over budget       | 40.3 ms |

Two caveats worth stating plainly. This measures CPU time — the simulation, the packing loop, and issuing the GL calls. GPU rasterisation happens asynchronously and is not included, so on a fill-rate-limited device (most phones) the real ceiling is lower and `maxDpr` matters more than this table suggests. And the non-monotonic rows are JIT warm-up noise, not a real effect.

The practical reading: **the working range is a few thousand particles, and there is real headroom to 25,000** if you need it. Past that the CPU simulation is the wall, which is what the planned GPU backend addresses.

Reproduce these numbers yourself — `stop()` the engine and drive it manually:

```ts
stipple.stop();
for (let i = 0; i < 30; i++) stipple.tick();

const samples = [];
for (let i = 0; i < 60; i++) {
  const t = performance.now();
  stipple.tick();
  samples.push(performance.now() - t);
}
samples.sort((a, b) => a - b);
console.log('median', samples[30]);
```
