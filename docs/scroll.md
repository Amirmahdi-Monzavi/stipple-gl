# Scroll and snap

A common use for this effect: each section of a long page has an icon, and the particle field reassembles into that icon as the section arrives.

```bash
# no extra install — it ships in the package
```

```ts
import { createScrollMorph } from 'stipple-gl/scroll';
```

## Markup

Mark each section with the shape it owns:

```html
<section data-stipple-shape="brain">…</section>
<section data-stipple-shape="gear">…</section>
<section data-stipple-shape="globe">…</section>
<section data-stipple-shape="none">…</section>
```

## Wiring

```ts
import { Stipple } from 'stipple-gl';
import { createScrollMorph } from 'stipple-gl/scroll';
import { snap } from 'stipple-gl/presets';

const stipple = new Stipple('#bg', { ...snap, mode: 'background' });

const controller = createScrollMorph(stipple, {
  sections: '[data-stipple-shape]',
  shapes: {
    brain: '/shapes/brain.svg',
    gear: '/shapes/gear.svg',
    globe: '/shapes/globe.svg',
    none: null,
  },
});
```

All shapes preload on creation, so the first transition into each one is instant.

## How the morph value is derived

On each scroll frame the controller finds the section whose centre is closest to the viewport centre, and computes how far off-centre it is as a fraction of its maximum possible offset. That distance maps to the morph scalar through `fadeRange`:

- Section centred → morph `1`, shape fully formed.
- Section drifting away → morph falls toward `0`, particles disperse.
- Boundary between two sections → both are far from centre, so morph is near `0`.

Because the shape swap happens exactly when the closest section changes — which is the moment morph is already near zero — the swap is invisible. Particles disperse, the target silently changes, and they reassemble into the next shape. There is no crossfade and no need for one.

## Options

| option | type | default | description |
|---|---|---|---|
| `sections` | `string \| HTMLElement[]` | — | Selector or explicit element list. |
| `shapes` | `Record<string, ShapeConfig \| string \| null>` | — | Maps attribute values to shapes. `null` disperses. |
| `attribute` | `string` | `'data-stipple-shape'` | Attribute read from each section. |
| `fadeRange` | `number` | `0.62` | Fraction of travel over which the morph fades. Lower holds the shape longer. |
| `root` | `HTMLElement \| null` | `null` | Scroll container. `null` uses the window. |
| `onChange` | `(key, section) => void` | — | Fires when the active section changes. |

Returns `{ refresh(), destroy(), activeKey }`. Call `refresh()` after adding or removing sections; always `destroy()` on teardown.

## Inheriting a neighbour's shape

Two adjacent sections that should share one shape — so the field holds steady instead of dispersing between them:

```html
<section data-stipple-shape="gear">…</section>
<section data-stipple-shape="inherit-prev">…</section>
```

`inherit-prev` and `inherit-next` resolve through chains and are cycle-safe.

## On scroll snapping

This module reads scroll position. It does not take it over.

Full-page scroll hijacking — intercepting `wheel` and `touchmove` and animating `scrollTop` yourself — is the usual way to build this, and it is worth being clear about why it is not here. It breaks keyboard scrolling and screen readers, fights browser momentum on trackpads and iOS, interacts badly with nested scrollable regions, and needs an animation library to do smoothly. It is a scroll library's job, not a particle library's.

Browsers now do the snapping natively:

```css
.page {
  height: 100vh;
  overflow-y: auto;
  scroll-snap-type: y mandatory;
}

.page section {
  height: 100vh;
  scroll-snap-align: start;
}
```

That gives you real snapping with correct momentum, keyboard support, and accessibility, and `createScrollMorph` reads it happily. A helper is included if you would rather apply it from JavaScript:

```ts
import { applyScrollSnap } from 'stipple-gl/scroll';

const restore = applyScrollSnap(document.querySelector('.page'));
```

It returns a function that puts the previous styles back.

If you genuinely need hijacking, drive the engine yourself — `setShape` and `setMorph` are the whole interface, and any scroll library can call them.

## Inner scrolling regions

A section taller than the viewport, or containing its own scrollable panel, works with `scroll-snap-align: start` and `scroll-snap-stop: normal`, letting the user scroll through the content before the next snap point engages. The morph tracks the section centre throughout, so a tall section holds its shape while its content scrolls.
