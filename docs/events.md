# Events and sequencing

Driving a morph used to take two calls in an order nothing documented. It now takes one, and it tells you when it lands.

```ts
await stipple.morphTo(logo);
await stipple.release();
```

---

## `morphTo(shape, options?)`

Sets the shape and morphs into it. The promise resolves when the field arrives.

```ts
await stipple.morphTo(logoA);
await stipple.morphTo(logoB); // swaps between shapes
await stipple.morphTo(logoC, { swap: 'burst' });
await stipple.morphTo(logoD, { enter: { speed: 0.04 } });
```

`options.swap` overrides `transition.swap` for this one call. `options.enter` sets `transition.enter` for this call and after.

`morphTo(null)` is the same as `release()`.

### It resolves, it does not reject

A morph interrupted by a later one resolves as normal — interruption is ordinary, not exceptional. If you need to know which happened, listen for `morphend` and read `cancelled`.

```ts
stipple.on('morphend', ({ shape, cancelled }) => {
  if (!cancelled) analytics.track('logo_settled', { shape });
});
```

---

## `release()`

Returns the field to the dispersed sphere, animated with `transition.exit`. The shape is kept, so the return trip has something to travel _from_ — this is why `release()` exists rather than `setShape(null)`.

`setShape(null)` still works and still clears immediately. Use it when you want the shape gone, not returned from.

---

## Events

| event           | payload                | fires                                          |
| --------------- | ---------------------- | ---------------------------------------------- |
| `morphstart`    | `{ from, to, shape }`  | a morph begins moving                          |
| `morphprogress` | `{ value }`            | every frame the morph value changes            |
| `morphend`      | `{ shape, cancelled }` | the morph reaches its target, or is superseded |
| `shapechange`   | `{ shape }`            | a shape is set or cleared                      |

`on` returns an unsubscribe function:

```ts
const stop = stipple.on('morphprogress', ({ value }) => {
  caption.style.opacity = String(value);
});

stop();
```

`off(event, handler)` does the same thing if you prefer to hold the handler.

A handler may unsubscribe itself during dispatch; the listener set is copied before it is walked.

### Sequencing a scroll story

```ts
const logos = [await shapeFromURL('/a.svg'), await shapeFromURL('/b.svg')];

for (const logo of logos) {
  await stipple.morphTo(logo);
  await wait(2000);
}
await stipple.release();
```

Because each `morphTo` resolves on arrival, this reads as a sequence rather than a pile of timers.

---

## Worker mode

Everything above works identically through `stipple-gl/worker`. Arrival gets its own message across the thread boundary rather than riding the twice-a-second stats packet, so promises resolve promptly.

The one difference: a choreography's `easing` cannot cross a `postMessage` boundary as a function. Use the name form (`'outExpo'`) and it survives; a function is dropped and the worker falls back to its default. See [worker.md](worker.md).
