import { easeInOutCubic, easeOutExpo } from './math';
import type { Choreography, ChoreographyConfig, ChoreographyName } from './types';

/**
 * The baseline every named choreography and every partial is filled in from.
 * `sweep` is the shipped default for entering a shape.
 */
/**
 * The baseline every named choreography and every partial is filled in from.
 *
 * Tuned to read as a move rather than a wipe: `radial` has no arbitrary
 * direction to notice, and `easeOutExpo` gives each particle a quick departure
 * and a soft landing. At this speed a morph completes in a little over a
 * second, which is brisk enough to feel responsive on a hover or a route change.
 */
export const baseChoreography: Choreography = {
  speed: 0.05,
  easing: easeOutExpo,
  stagger: 0.68,
  order: 'radial',
  turbulence: 14,
  flash: 0,
  flashWidth: 0.22,
};

const NAMED: Record<ChoreographyName, Partial<Choreography>> = {
  // The baseline itself: centre-out, quick, no direction to notice. The default.
  condense: {},
  // Everything moves together. `order` stops mattering at stagger 0.
  uniform: { stagger: 0, turbulence: 8, easing: easeInOutCubic },
  // A directional wipe: launches spread wide, each flight short.
  sweep: { stagger: 0.82, order: 'x', easing: easeInOutCubic, speed: 0.03 },
  // Centre-out, hard out of the gate, with a flash on the wavefront.
  burst: { stagger: 0.55, order: 'radial', turbulence: 28, flash: 0.55, speed: 0.07 },
};

export const isChoreographyName = (value: unknown): value is ChoreographyName =>
  value === 'condense' || value === 'uniform' || value === 'sweep' || value === 'burst';

/**
 * Expand a name or a partial into a complete Choreography.
 *
 * `base` lets `exit: 'mirror'` reuse whatever `enter` resolved to, and lets a
 * partial override only the fields it names.
 */
export const resolveChoreography = (
  config: ChoreographyConfig | undefined,
  base: Choreography = baseChoreography,
): Choreography => {
  if (config === undefined) return base;
  if (isChoreographyName(config)) return { ...base, ...NAMED[config] };
  return { ...base, ...(config as Partial<Choreography>) };
};

/**
 * The return trip `exit: 'mirror'` produces from a resolved `enter`.
 *
 * Leaving reads better a little slower than arriving — the field should drift
 * apart rather than snap back — but only a little. At much below this it stops
 * feeling like a response to the thing that triggered it.
 */
export const mirrorChoreography = (enter: Choreography): Choreography => ({
  ...enter,
  speed: enter.speed * 0.7,
});
