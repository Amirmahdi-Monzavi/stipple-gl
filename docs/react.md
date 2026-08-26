# React

```bash
npm i stipple-gl react react-dom
```

React is an optional peer dependency. The core has no dependencies at all — the React binding is a thin wrapper over the same engine, and it is a separate entry point so importing the core never pulls React in.

## `<Particles />`

```tsx
import { Particles } from 'stipple-gl/react';

export function Hero() {
  return <Particles mode="background" count={4000} color="#5ec8f2" shape="/shield.svg" morph={1} />;
}
```

The component renders a host `<div>` and manages the canvas, the engine, and teardown inside it. It accepts every core option as a prop, plus:

| prop         | type                            | description                                            |
| ------------ | ------------------------------- | ------------------------------------------------------ |
| `shape`      | `ShapeConfig \| string \| null` | A shape object, a URL to fetch, or `null` to disperse. |
| `morph`      | `number`                        | Target morph, 0 to 1.                                  |
| `paused`     | `boolean`                       | Stops the loop without tearing anything down.          |
| `onInstance` | `(instance) => void`            | Receives the engine on mount and `null` on unmount.    |
| `className`  | `string`                        | Applied to the host element.                           |
| `style`      | `CSSProperties`                 | Merged over the mode's default positioning.            |
| `children`   | `ReactNode`                     | Rendered inside the host, above the canvas.            |

Passing a string to `shape` fetches and parses the SVG, with the request cached across instances and cancelled if the prop changes mid-flight.

## Driving the morph from state

```tsx
function ConsentHero() {
  const [accepted, setAccepted] = useState(false);

  return (
    <>
      <Particles
        mode="background"
        shape={accepted ? '/check.svg' : '/shield.svg'}
        morph={1}
        color={accepted ? '#5ec8f2' : '#63748c'}
      />
      <label>
        <input type="checkbox" onChange={(e) => setAccepted(e.target.checked)} />I agree
      </label>
    </>
  );
}
```

## In a container

`mode="container"` sizes the canvas to the host, so give the host a height:

```tsx
<Particles
  mode="container"
  className="h-96 w-full overflow-hidden rounded-2xl bg-slate-950"
  count={1600}
  shape="/logo.svg"
  morph={1}
/>
```

Several containers on one page are fine — each scopes its own pointer listeners.

## `useStipple`

When you want the canvas somewhere the component cannot go, or need imperative control:

```tsx
import { useStipple } from 'stipple-gl/react';

function Custom() {
  const { ref, instance, pulse } = useStipple({
    count: 2400,
    shape: '/star.svg',
    morph: 1,
  });

  return (
    <div
      ref={ref}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        pulse(e.clientX - rect.left, e.clientY - rect.top, 0.8);
      }}
      style={{ position: 'relative', height: 480 }}
    />
  );
}
```

`instance` is `null` on the first render and set once the engine mounts, so guard before using it.

## `useMorphOnScroll`

Binds an engine to scroll position across a set of marked sections:

```tsx
import { Particles, useMorphOnScroll } from 'stipple-gl/react';
import { useState } from 'react';
import type { Stipple } from 'stipple-gl';

const shapes = {
  brain: '/shapes/brain.svg',
  gear: '/shapes/gear.svg',
  none: null,
};

function Page() {
  const [instance, setInstance] = useState<Stipple | null>(null);
  const active = useMorphOnScroll(instance, { shapes });

  return (
    <>
      <Particles mode="background" onInstance={setInstance} />
      <section data-stipple-shape="brain">…</section>
      <section data-stipple-shape="gear">…</section>
      <section data-stipple-shape="none">…</section>
      <nav>Currently: {active}</nav>
    </>
  );
}
```

See [scroll.md](scroll.md) for the underlying behaviour.

## Notes on re-renders

The engine is created once per host element and per `mode`. Changing `mode` recreates it; changing anything else applies through `setOptions` without a rebuild.

Option props are diffed by object identity, so an inline object like `major={{ size: 8 }}` re-applies on every render. That is a cheap merge rather than a rebuild, but memoising it is tidier:

```tsx
const major = useMemo(() => ({ size: 8 }), []);
<Particles major={major} />;
```

`count` and `minorCount` are handled separately and only reallocate when the number actually changes.

## StrictMode

The binding handles React 18+ StrictMode's double mount correctly — the engine is fully destroyed and rebuilt, with no leaked contexts or listeners.

## Server rendering

The engine requires `window` and throws if constructed on the server. The component only creates it inside an effect, so it is safe in Next.js, Remix, and React Router without a dynamic import. Nothing renders until hydration.
