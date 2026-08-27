---
layout: home

hero:
  name: stipple-gl
  text: Particles that become your artwork.
  tagline: A WebGL2 particle field that morphs into any SVG. Zero dependencies, 12.4 KB gzipped, and it will run the whole simulation on a worker if you ask it to.
  image:
    src: /hero.gif
    alt: A particle field dispersing, gathering into a hexagon, morphing into a spirograph, and dispersing again
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    # target forces a real navigation: these are static files, not routes, and
    # the SPA router would otherwise 404 on them. Same reason as the nav bar.
    - theme: alt
      text: Playground
      link: /playground/index.html
      target: _self
    - theme: alt
      text: Examples
      link: /examples/index.html
      target: _self

features:
  - title: One call to morph
    details: morphTo() takes a shape and returns a promise that resolves on arrival. Setting a new shape while one is on screen interpolates between them on its own clock, with its own choreography.
    link: /shapes
    linkText: Shapes and SVG

  - title: Any artwork the browser can decode
    details: SVG traced as paths, or rasterised through the browser's own renderer when the markup needs it. PNG, JPEG, WebP, AVIF, a canvas, or a live video frame. Particles can take their colour from the source pixels.
    link: /images
    linkText: Image sources

  - title: Choreography you control
    details: Entering from the spread, leaving it, and swapping between shapes are three separate slots. Speed, easing, stagger, wavefront order and turbulence on each — or one of four names if you would rather not think about it.
    link: /options
    linkText: Options reference

  - title: Off the main thread
    details: Hand it an OffscreenCanvas and the simulation runs in a worker, so scroll and input stay smooth no matter what the field is doing.
    link: /worker
    linkText: Worker mode
---

## Install

```bash
npm i stipple-gl
```

## The whole common case

```ts
import { Stipple, shapeFromURL } from 'stipple-gl';

const field = new Stipple('#hero');

await field.morphTo(await shapeFromURL('/logo.svg'));
```

That is the entire API surface for most uses. Everything else is opt-in — and if
you want to check before you build, `isSupported()` tells you whether WebGL2 is
available so an unsupported browser gets a fallback rather than an exception.

```ts
import { isSupported, Stipple } from 'stipple-gl';

if (isSupported()) new Stipple('#hero');
else document.querySelector('#hero').classList.add('static-fallback');
```

## In React

`stipple-gl/react` ships its own `'use client'` directive, so `Particles` drops
straight into a Next.js App Router server component with no wrapper and no
dynamic import.

```tsx
import { Particles } from 'stipple-gl/react';

export default function Hero() {
  return <Particles count={3500} shape="/logo.svg" />;
}
```

Props are compared structurally rather than by reference, so writing options
inline is fine — an idle re-render of the parent reaches the engine as nothing
at all. See [React](/react) for the detail.
