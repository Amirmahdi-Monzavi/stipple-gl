# Where settings live

There are two places to put a setting, and the difference is not cosmetic.

**Instance options** describe the field: how many particles there are, how they
move, what they do when a shape arrives. They are set once at construction and
changed with `setOptions`, and they outlive any particular shape.

**Shape options** describe one shape: where it sits, how big it is, how its ink
is sampled. They travel with the shape and stop mattering the moment it is
replaced.

```ts
// Instance: true for the whole field, for as long as it exists.
const field = new Stipple('#hero', {
  count: 4000,
  color: '#5ec8f2',
  transition: { enter: 'sweep' },
});

// Shape: true for this shape only.
field.morphTo(shapeFromString(svg, { scale: 0.7, detail: 'edges' }));
```

---

## What lives where

| Setting                      | Instance | Shape | Notes                                            |
| ---------------------------- | :------: | :---: | ------------------------------------------------ |
| `count`                      |    ●     |   ●   | The shape's value can only lower it — see below. |
| `minorCount`                 |    ●     |       | The ambient layer never morphs.                  |
| `color`                      |    ●     |   ●   | The shape's value tints rather than replaces.    |
| `minorColor`                 |    ●     |       |                                                  |
| `mode`, `background`         |    ●     |       | Changing `mode` rebuilds the engine.             |
| `transition.enter/exit/swap` |    ●     |       | Applies to every shape.                          |
| `assign`                     |    ●     |       | Applies every time a shape is set.               |
| `spread.*`                   |    ●     |       | Describes the dispersed state, not any shape.    |
| `major.*`, `minor.*`         |    ●     |       |                                                  |
| `pointer.*`, `jelly.*`       |    ●     |       |                                                  |
| `scale`, `position`          |          |   ●   | Where this shape sits in the canvas.             |
| `detail`, `detailStrength`   |          |   ●   | How this shape's budget is spread over its ink.  |
| `mask`, `threshold`          |          |   ●   | Raster sources only.                             |
| `viewBox`, `paths`, `image`  |          |   ●   | The shape itself.                                |

Nothing appears in both columns by accident. The three that do are the ones
worth knowing precisely.

---

## `count`: the shape can only ask for fewer

```ts
const count = Math.min(shape.count ?? instance.count, instance.count);
```

The instance count is the allocation — the number of particles that exist. A
shape's `count` selects how many of them take part, so it can leave some behind
in the spread, but it cannot conjure more.

```ts
const field = new Stipple('#hero', { count: 4000 });

field.morphTo(shapeFromString(svg, { count: 1200 })); // 1,200 form the shape
field.morphTo(shapeFromString(svg, { count: 9000 })); // still 4,000 — clamped
```

Use it when a sparse shape reads better than a crowded one. To genuinely change
how many particles exist, call `setCount` — that reallocates.

## `color`: the shape tints, it does not replace

A shape's `color` is blended toward as the morph progresses, in proportion to
`morph` itself. At rest you see the instance colour; fully morphed you see the
shape's; in between you see the crossfade.

```ts
new Stipple('#hero', { color: '#5ec8f2' });
field.morphTo(shapeFromString(svg, { color: '#f2b45e' }));
// morph 0.0 → #5ec8f2      morph 0.5 → halfway      morph 1.0 → #f2b45e
```

This is why a shape colour looks like the field _becoming_ the artwork rather
than snapping to it. It is a single flat tint — for per-particle colour taken
from the artwork's own pixels, use the instance-level
`color: { type: 'shape' }`, which is a different mechanism entirely and is
described in [Image sources](/images).

## `detail`: shape only, and it means re-sampling

`detail` and `detailStrength` decide how the budget is distributed across the
ink — uniformly, weighted toward edges, or weighted by density. They live on the
shape because they are applied when the shape is sampled, not while it runs.

That has a practical consequence: changing them means building the shape again.

```ts
// Not this — the shape on screen was already sampled.
field.setOptions({ detail: 'edges' }); // no such option; ignored

// This.
field.setShape(shapeFromString(svg, { detail: 'edges', detailStrength: 1 }));
```

---

## Which one do I want?

Ask whether the setting would still mean something after the shape is gone.

Speed, easing and stagger describe how _any_ arrival should feel, so they belong
to the instance — set them once and every shape inherits them. Scale and
position describe where _this_ artwork sits, so they belong to the shape; the
next one may want to sit somewhere else entirely.

The awkward case is a setting you want on most shapes but not all. Options do
not cascade, so make a helper rather than repeating yourself:

```ts
const detailed = (svg: string) =>
  shapeFromString(svg, { scale: 0.62, detail: 'edges', detailStrength: 0.85 });

field.morphTo(detailed(logo));
```

That is exactly what the playground does, which is why every shape it builds
picks up the current detail setting without the engine knowing anything about
it.
