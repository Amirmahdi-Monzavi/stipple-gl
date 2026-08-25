# Shapes and SVG

A shape is geometry plus placement:

```ts
interface ShapeConfig {
  paths: SVGPathData[];
  viewBox?: string;
  scale?: number;
  position?: { x: number; y: number };
  count?: number;
  color?: string;
}
```

## Loading

```ts
import { shapeFromURL, shapeFromString, shapeFromSVG, parseSVG } from 'stipple-gl';

const a = await shapeFromURL('/shapes/shield.svg', { scale: 0.5 });
const b = shapeFromString('<svg viewBox="0 0 24 24"><path d="…" /></svg>');
const c = shapeFromSVG(parseSVG(rawMarkup), { scale: 0.4 });
```

`shapeFromURL` caches by URL, so the same file is fetched and parsed once no matter how many instances ask for it. A failed request is evicted so a retry can succeed.

## Placement

`scale` is relative to a best-fit of the viewBox inside the canvas. `1` means the shape fills the canvas along its constrained axis; `0.5` is half that. Values between `0.3` and `0.6` usually read best — a shape that fills the canvas leaves no room for the dispersed state to breathe.

`position` is fractional: `{ x: 0.5, y: 0.5 }` centres, `{ x: 0.25, y: 0.4 }` sits left of centre and slightly high.

`count` overrides how many particles the shape uses, clamped to the instance's `count`. Useful for detailed shapes that need more points than a simple one.

## Aligning a shape with your layout

To assemble the particles exactly where your layout has a gap — beside a headline, inside a card — mark the slot and let the shape fit itself to it:

```html
<div class="hero">
  <h1>Verify once. Trusted everywhere.</h1>
  <div data-particle-slot style="width: 320px; height: 320px"></div>
</div>
```

```ts
import { fitShapeToElement, shapeFromURL } from 'stipple-gl';

const slot = document.querySelector('[data-particle-slot]');
const base = await shapeFromURL('/shapes/shield.svg');

stipple.setShape(fitShapeToElement(base, slot, stipple.canvas, 0.86));
stipple.setMorph(1);
```

`fitShapeToElement` computes the `scale` and `position` that centre the shape in the slot at the given fill factor. Recompute it on resize and after `document.fonts.ready`, since text reflow moves the slot.

## What the parser handles

| element | support |
|---|---|
| `<path>` | full — any `d` string `Path2D` accepts |
| `<circle>`, `<ellipse>` | converted to arc paths |
| `<rect>` | converted, including `rx`/`ry` rounded corners |
| `<line>`, `<polyline>`, `<polygon>` | converted |
| `<g>` | traversed, with transforms composed |
| `transform` | `translate`, `scale`, `rotate` (with origin), `matrix`, `skewX`, `skewY` |
| `fill-rule="evenodd"` | honoured, so holes stay holes |
| stroke-only paths | `fill="none"` with a stroke and `stroke-width` samples the stroke |
| `<defs>`, `<mask>`, `<clipPath>`, `<style>` | skipped |

Not supported: `<use>` references, `<text>` (convert to outlines first), CSS-applied fills, gradients and patterns (only coverage matters — colour comes from options), and clipping.

If the file has no `viewBox`, one is synthesised from `width` and `height`.

## Preparing good source files

The sampler only cares about **coverage** — which pixels the shape covers.

- **Filled silhouettes work best.** A solid shield gives an even particle field. An outline-only shield gives a ring of particles, which can look great but is a different effect.
- **Thin strokes need weight.** A 1 px stroke in a 100-unit viewBox rasterises to almost nothing. Aim for stroke widths of at least 3% of the viewBox.
- **Flatten in your editor.** Convert text to outlines, expand strokes you want treated as fills, and flatten compound shapes. Figma's "Flatten" and Illustrator's "Expand" both do this.
- **Trim the viewBox** to the artwork so `scale` behaves predictably.
- **Detail is bounded by particle count.** At 3,000 particles you get a strong silhouette, not fine interior linework. Either raise `count` or simplify the artwork.

## Generating shapes in code

Nothing requires an SVG file — build the path strings yourself:

```ts
const star = (points: number, outer: number, inner: number) => {
  const at = (r: number, i: number) => {
    const a = ((i * 180) / points - 90) * (Math.PI / 180);
    return `${50 + r * Math.cos(a)} ${50 + r * Math.sin(a)}`;
  };
  let d = `M ${at(outer, 0)}`;
  for (let i = 1; i < points * 2; i++) d += ` L ${at(i % 2 ? inner : outer, i)}`;
  return d + ' Z';
};

stipple.setShape({
  paths: [{ d: star(5, 46, 19) }],
  viewBox: '0 0 100 100',
  scale: 0.6,
  position: { x: 0.5, y: 0.5 },
});
```

## Sampling controls

```ts
import { sampleShape } from 'stipple-gl';

const points = sampleShape(shape, 3000, width, height, {
  maxRaster: 512,
  jitter: 1,
});
```

`maxRaster` caps the offscreen raster's long edge. Raising it to `1024` sharpens very fine detail at roughly 4× the sampling cost; lowering it to `256` is faster and fine for bold silhouettes. `jitter` is the sub-pixel scatter applied to each sampled point — raise it to soften a shape's edges, set it to `0` for crisp alignment.
