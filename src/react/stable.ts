/**
 * Identity stability for values a component rebuilds every render.
 *
 * `useStipple` receives its configuration as an object literal written in the
 * component body, so every render produces a structurally identical object with
 * a fresh identity. The engine compares several options by reference — `color`,
 * `transition` and `assign` among them — and a new reference reads as a change,
 * so an idle parent render would re-run a per-particle `precompute`, or
 * re-sample the shape outright.
 *
 * Holding the previous value whenever the new one is structurally equal keeps
 * those comparisons honest, and costs a walk of a small options object against
 * work proportional to the particle count.
 */

import { useRef } from 'react';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Structural equality, with functions compared by identity.
 *
 * Two closures cannot be shown to be equivalent, so an inline `assign`, `onReady`
 * or `onError` still reads as new every render. That is the safe direction to be
 * wrong in — a genuinely new callback must reach the engine — and only `assign`
 * carries a real cost, which is why the docs ask callers to memoize that one.
 */
export const sameValue = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => sameValue(item, b[index]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    return keys.every(
      (key) => Object.prototype.hasOwnProperty.call(b, key) && sameValue(a[key], b[key]),
    );
  }

  return false;
};

/**
 * Returns the previous value while the new one is structurally equal to it, so
 * downstream effect dependencies only change when something actually changed.
 *
 * Writing to the ref during render is safe here: it is idempotent, derives only
 * from the argument, and touches nothing outside the component.
 */
export const useStableValue = <T>(value: T): T => {
  const held = useRef(value);
  if (!sameValue(held.current, value)) held.current = value;
  return held.current;
};
