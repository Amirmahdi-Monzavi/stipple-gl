import type { Behavior, BehaviorPhase } from './types';

/**
 * Behaviour ordering, kept in `core` on purpose.
 *
 * The backend needs to sort a pipeline, but importing that from `behaviors/index`
 * would pull every built-in behaviour into the graph — which would drag jelly,
 * pointer, shockwave and emission into the `lite` entry that deliberately
 * excludes them. This module imports nothing but types.
 *
 * Base sort key per phase. Built-ins also carry an explicit `order` so their
 * relative position inside a phase is fixed; a custom behaviour that names only
 * a phase lands at the phase boundary, ahead of the built-ins in that phase.
 */
export const PHASE_ORDER: Record<BehaviorPhase, number> = {
  target: 10,
  deform: 15,
  force: 30,
  integrate: 50,
  ambient: 60,
};

/** Sort key for one behaviour: explicit `order` wins, then `phase`, then `force`. */
export const behaviorOrder = (behavior: Behavior): number =>
  behavior.order ?? PHASE_ORDER[behavior.phase ?? 'force'];

/** Stable sort of a pipeline into execution order. */
export const sortBehaviors = (behaviors: readonly Behavior[]): Behavior[] =>
  behaviors
    .map((behavior, index) => ({ behavior, index }))
    .sort((a, b) => behaviorOrder(a.behavior) - behaviorOrder(b.behavior) || a.index - b.index)
    .map((entry) => entry.behavior);
