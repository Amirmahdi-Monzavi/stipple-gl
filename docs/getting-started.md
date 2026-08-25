# Getting started

## Install

```bash
npm i stipple-gl
```

```bash
pnpm add stipple-gl
```

React is an optional peer dependency — you only need it if you import `stipple-gl/react`.

## Your first field

```ts
import { Stipple } from 'stipple-gl';

const stipple = new Stipple('#hero');
```

That gives you a dispersed, slowly drifting sphere covering the viewport. The constructor creates the canvas, sizes it, starts the loop, and wires up resize, visibility, and pointer handling.

## Morphing into a shape

A shape is sampled SVG geometry plus a scale and position:

```ts
import { Stipple, shapeFromURL } from 'stipple-gl';

const stipple = new Stipple('#hero');

const shield = await shapeFromURL('/shapes/shield.svg', {
  scale: 0.5,
  position: { x: 0.5, y: 0.5 },
});

stipple.setShape(shield);
stipple.setMorph(1);
```

`scale` is relative to a best-fit of the SVG viewBox inside the canvas — `0.5` means half the size it would be if it filled the canvas. `position` is fractional, `{ x: 0.5, y: 0.5 }` being dead centre.

`setMorph(1)` moves toward the shape, `setMorph(0)` disperses, and anything between holds a partial state. The transition is animated for you.

## Choosing a mode

```ts
new Stipple('#hero', { mode: 'background' });
```

**`background`** covers the viewport with `position: fixed`. This is the full-page hero case.

**`container`** fills its host element. The host needs a non-static position and a real height:

```html
<div id="card" style="position: relative; height: 400px"></div>
```

```ts
new Stipple('#card', { mode: 'container', count: 1500 });
```

Pointer listeners scope to the host in this mode, so several instances coexist safely.

**`page`** spans the full document width at the top, for effects that follow a long scrolling hero. Pair it with `setPageHeight()`:

```ts
const stipple = new Stipple('#page-bg', { mode: 'page' });
stipple.setPageHeight(document.documentElement.scrollHeight);
```

## Sizing the field

```ts
new Stipple('#hero', { count: 4000, minorCount: 300 });
```

`count` is the morphing pool, `minorCount` the ambient layer. Scale them to the device:

```ts
import { responsiveCount } from 'stipple-gl';

const count = responsiveCount(
  [
    [640, 2000],
    [1024, 2800],
    [1920, 3500],
  ],
  4600,
  window.innerWidth,
);
```

Change them later with `stipple.setCount(count, minorCount)`.

## Reacting to state

The morph scalar is the whole interface. Anything that produces a number between 0 and 1 can drive it:

```ts
checkbox.addEventListener('change', (e) => {
  stipple.setMorph(e.target.checked ? 1 : 0);
});

router.afterEach((to) => {
  stipple.setShape(shapes[to.name] ?? null);
  stipple.setMorph(shapes[to.name] ? 1 : 0);
});
```

## Cleaning up

```ts
stipple.destroy();
```

Removes every listener, deletes the GL objects, releases the context, and removes the canvas if it created it. Always call this in a SPA — the React binding does it for you.

## Handling unsupported browsers

The constructor throws if WebGL2 is unavailable:

```ts
let stipple;
try {
  stipple = new Stipple('#hero');
} catch {
  document.querySelector('#hero').classList.add('static-fallback');
}
```

Or pass `onError` to catch both construction failures and async shape-loading errors.

## Troubleshooting

### The canvas is black / nothing renders

Work through these in order:

1. **Does the host element have a height?** In `mode: 'container'` the canvas fills its host. A host with `height: auto` and no content collapses to zero, and the engine correctly refuses to allocate. Give it an explicit height and a non-`static` position.
2. **Is something painted over it?** The canvas sits at the start of its host. A sibling with a solid background and a higher stacking order will cover it. The canvas is `pointer-events: none` and `aria-hidden`, so it is meant to sit behind your content, not in front.
3. **Is the loop running?** Check `stipple.running` and `stipple.fps`. If `running` is `false`, the field is either offscreen (`autoPause`), in a hidden tab, or the user prefers reduced motion.
4. **Is the colour visible against the background?** A dark particle colour on a dark page is invisible. Try `color: '#ffffff'` to rule it out.
5. **Did the context actually come up?** `stipple.canvas.getContext('webgl2').isContextLost()` should be `false`.

If the pixels are there but the screen is not, the framebuffer will tell you:

```ts
const gl = stipple.canvas.getContext('webgl2');
const { width: w, height: h } = stipple.canvas;
const px = new Uint8Array(w * h * 4);
gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
console.log('lit pixels', px.filter((_, i) => i % 4 === 3 && px[i] > 8).length);
```

A high count with a black screen means the GL output is correct and the browser is failing to composite it — a context-attribute or stacking problem, not a simulation one.

### Colours look washed out or too dark

The engine requests a `premultipliedAlpha: true` context and emits premultiplied colour from the fragment shader, paired with `ONE / ONE_MINUS_SRC_ALPHA` blending. If you supply your own renderer or blend factors, they must agree — mixing premultiplied output with `SRC_ALPHA` blending under-accumulates the alpha channel and renders everything roughly three times too dark.

### The shape is off-centre or the wrong size

`scale` is relative to a best-fit of the viewBox in the canvas, and `position` is fractional, not pixels. A viewBox that is much larger than the artwork inside it will make the shape look small — trim it in your editor, or use `fitShapeToElement`.

## Next

- [Options reference](options.md)
- [React](react.md)
- [Shapes and SVG](shapes.md)
- [Performance](performance.md)
