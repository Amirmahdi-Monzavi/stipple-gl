# Image sources

A shape is a cloud of sampled points, and there are two ways to produce one: trace vector paths, or read pixels. stipple-gl does both, and `shapeFromFile` picks for you.

```ts
import { shapeFromFile } from 'stipple-gl';

stipple.morphTo(await shapeFromFile(file));
```

---

## What is supported

| source                               | how                   | notes                                                                                      |
| ------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------ |
| SVG                                  | vector, or rasterised | Traced as paths by default. Rasterised automatically when the markup needs it — see below. |
| PNG                                  | raster                | Alpha channel is the mask. The obvious choice for a logo with transparency.                |
| WebP, AVIF, GIF                      | raster                | Same as PNG. Animated sources sample their first frame.                                    |
| JPEG                                 | raster                | No alpha, so use `mask: 'dark'` or `'light'` — see [Photographs](#photographs).            |
| `<canvas>`, `<video>`, `ImageBitmap` | raster                | Anything `drawImage` accepts. Sample a video frame to morph into live footage.             |

There is no format list in the library. Raster decoding goes through `createImageBitmap`, so **whatever the browser can decode, this can sample.**

---

## SVG: vector or raster

The vector route parses paths and traces them with `Path2D`. It samples cleanly at any size and needs no decode step.

Path2D draws flat fills and strokes and nothing else. Gradients, filters, patterns, `<use>`, `<text>` and embedded `<style>` blocks are all beyond it, so artwork that leans on them comes out as a flat silhouette. The raster route hands the markup to the browser's own SVG renderer instead and samples the result, which gets all of it right — and gives real per-particle colour.

`shapeFromFile` and `svgNeedsRaster` detect this from the source. You can also choose explicitly:

```ts
import { shapeFromString, shapeFromSVGImage, shapeFromFile } from 'stipple-gl';

shapeFromString(source); // always vector
await shapeFromSVGImage(source); // always raster
await shapeFromFile(file); // auto
await shapeFromFile(file, { forceRaster: true }); // auto, overridden
```

The Firefox logo is the clean example: 14 paths, every fill a `url(#radial-gradient)`. Vector gives a correct silhouette and **zero** colours; raster gives the same silhouette and **1,269**.

### Stroked icons

Feather, Lucide, Heroicons outline and most svgrepo exports are authored as `fill="none"` on the `<svg>` root with `stroke` on the paths. Presentation attributes cascade, and `style` beats the attribute of the same name — both are honoured, so a stroked icon is traced as a stroke.

This matters more than it sounds: filling an open outline path does not produce an outline, it produces a blob. Measured on a cloud icon, stroking covers 42% of the bounding box where filling covers 77%.

---

## Photographs

An opaque image has no alpha to mask with: every pixel qualifies, and the "shape" comes out as the source rectangle with a border around it. The default `mask: 'auto'` notices this and switches to luminance for you, so a photograph or a scan works with no configuration at all. You can still say it explicitly:

```ts
await shapeFromFile(photo, { mask: 'dark', threshold: 0.45 });
```

| `mask`    | ink is                                                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'auto'`  | **the default.** Inspects the image: real transparency means alpha, otherwise it falls through to luminance and keeps whichever of dark or light is the minority |
| `'alpha'` | anything not transparent — right for PNG and SVG with a cut-out background                                                                                       |
| `'dark'`  | opaque pixels **below** the luminance threshold — a dark subject on a light ground                                                                               |
| `'light'` | opaque pixels **above** it — a light subject on a dark ground                                                                                                    |

`threshold` runs 0 to 1 and defaults to `0.5` for the luminance masks. Push it toward 0 to keep only the deepest shadows, toward 1 to keep almost everything.

Pair a photo with `color: { type: 'shape' }` and the field takes the photograph's own palette.

```ts
new Stipple('#hero', { color: { type: 'shape', fallback: '#5ec8f2' } });
```

---

## Loading

```ts
import { imageFromURL, imageFromBlob, shapeFromImage, shapeFromImageURL } from 'stipple-gl';

await shapeFromImageURL('/logo.png', { scale: 0.7 });

const bitmap = await imageFromURL('/logo.png');
shapeFromImage(bitmap);

shapeFromImage(document.querySelector('video')); // a live frame
shapeFromImage(myCanvas);
```

`imageFromURL` fetches and decodes, and accepts an `AbortSignal`. Cross-origin sources need permissive CORS headers, because the sampler reads pixels back and a tainted canvas cannot be read.

---

## Worker mode

`postMessage` can clone an `ImageBitmap` but not a DOM element. A shape built from an `<img>`, `<canvas>` or `<video>` cannot cross the thread boundary; `setShape` returns `false` and reports through `onError` rather than failing with a bare `DataCloneError`.

Build the shape with `imageFromURL`, `imageFromBlob` or `rasterizeSVG` — all three return an `ImageBitmap`, and all three work inside the worker too.

---

## Cost

Sampling rasterises into an offscreen canvas capped at `maxRaster` (512px) on the long edge and reads it back once. That happens per `setShape`, not per frame, so the cost is a one-off decode plus one `getImageData`.

The decode is the expensive half and it is asynchronous, which is why the image helpers return promises while `shapeFromString` does not.

---

## Where the particles go

Sampling picks points from the ink with equal probability. For line art that is exactly right — the ink _is_ the drawing. For a flat-filled illustration it is not, and the result is a silhouette.

The reason is arithmetic. Measured on two typical illustrations:

| artwork       | ink pixels | edge pixels | largest flat region   |
| ------------- | ---------- | ----------- | --------------------- |
| line-art cat  | 1,352      | —           | one colour throughout |
| filled figure | 29,056     | 14% of ink  | 61% of ink            |
| filled scene  | 30,018     | 17% of ink  | 36% of ink            |

A filled illustration is mostly interior. Spread 6,000 particles evenly over it and roughly 86% land somewhere with nothing to see, so what reads is the outline of the whole mass. The line-art cat has no interior to waste budget on, which is why it looks right with no help.

`detail` moves the budget:

```ts
await shapeFromFile(file, { detail: 'edges' });
```

| `detail`    | budget goes to                                                                   |
| ----------- | -------------------------------------------------------------------------------- |
| `'uniform'` | every ink pixel equally — the default, right for line art and logos              |
| `'edges'`   | contours and colour boundaries — turns a filled illustration back into a drawing |
| `'density'` | dark ink, in the manner of traditional stippling                                 |

`detailStrength` (0 to 1, default `0.85`) sets how hard it is applied. The tradeoff is measured, and worth knowing before you reach for `1`:

| strength | points on edges | area still covered |
| -------- | --------------- | ------------------ |
| `0`      | 14%             | 1,525 cells        |
| `0.5`    | 19%             | 1,521 cells        |
| `0.85`   | 33%             | 1,474 cells        |
| `1`      | 62%             | 486 cells          |

At the default you get **2.4× the contour definition for a 3% loss of coverage**. At `1` you get true line art — and a hollow shape, because the interior is abandoned entirely. That is a legitimate look; just pick it deliberately.

A flat single-colour icon has exactly one edge — its outline. At strength `1` that is all you get: a hollow silhouette, correctly drawn but with an empty middle. On a flat shape the useful range is roughly `0.5` to `0.85`; strength `1` is for artwork with internal structure to find.

Edges are detected from two signals — luminance for internal colour boundaries, and alpha for the silhouette. A shape with neither (one flat colour filling the whole frame, no transparency) has nothing to weight, and sampling falls back to uniform rather than producing nothing.

`detail` applies to vector and raster sources alike, and it is a property of the shape, so changing it means building the shape again.
