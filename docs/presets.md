# Presets

Presets are plain `StippleConfig` objects. Nothing in them is special — every value is one you could set yourself, and spreading one into your own config and overriding a field is the intended way to use them.

```ts
import { Stipple } from 'stipple-gl';
import { nebula } from 'stipple-gl/presets';

new Stipple('#stage', { ...nebula, color: '#8ab4f8' });
```

They fall into two families, and the split matters more than any individual setting.

## Shape presets

These carry major particles (`count > 0`) and the full behaviour pipeline. They are the ones that morph into an SVG. Use these with `setShape`.

### `morph`

The reference configuration, and what the README screenshots use. 3,500 major particles at size 5, angular target assignment, the default `condense` choreography, and mid-strength flight turbulence. Emission and pointer interaction are both on. If you want "the thing this library does", start here and change the colour.

### `snap`

`morph` with the patience removed. Its `enter` choreography runs faster still than the default and holds a stiffer jelly, so particles arrive hard and stop dead rather than gliding in. Slightly fewer, slightly larger particles, and a stiffer jelly. Good for a logo that should land on scroll rather than unfold.

## Ambient presets

These set `count: 0` — **no major particles at all** — and swap in `createMinimalBehaviors()`, a three-behaviour pipeline instead of eight. They cannot morph into a shape; there is nothing to morph. They exist to be a background.

If you switch to one of these and then set a shape, `setShape` returns `false` and reports through `onError`. Switch back to `morph` or `snap` first.

### `starfield`

900 ambient particles, heavily size-biased (`sizeBias: 3`) so a few are large and most are small, with a wide opacity range for twinkle. Slow drift, no pointer, no jelly. A night sky.

### `dust`

700 ambient particles, larger and softer than `starfield` and moving slower. Reads as motes in a light beam rather than stars. Deliberately understated — it inks under 1% of the canvas — but it should be clearly visible; if it looks like an empty screen, that is a bug.

### `constellation`

The odd one out: it keeps 1,200 major particles and the full pipeline, so it _can_ morph, but it is tuned as a background — small particles, gentle breathing, no pointer, no emission. Use it when you want an ambient field that can still occasionally form a shape.

### `nebula`

2,600 major particles with `blend: 'additive'` and large soft sprites, so overlapping particles accumulate into brightness. The most expensive preset by fill rate — it inks around 10% of the canvas against `morph`'s 6%. Also morph-capable.

## What a preset does not do

A preset is applied with `setOptions`, which merges. It does not reset anything it does not mention, so switching presets is not the same as constructing a fresh instance. In particular the current shape, the current morph value, and any option you set by hand all survive a preset switch.

The one exception is deliberate: `behaviors`, `shapes` and `backend` are capabilities injected at construction, and a preset that omits them will never clear them.
