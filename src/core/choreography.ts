import { easeInOutCubic, easeOutExpo } from './math';
import type { Choreography, ChoreographyConfig, ChoreographyName } from './types';

/**
 * The baseline every named choreography and every partial is filled in from.
 * `sweep` is the shipped default for entering a shape.
 */
export const baseChoreography: Choreography = {
  speed: 0.014,
  easing: easeInOutCubic,
  stagger: 0.82,
  order: 'x',
  turbulence: 16,
  flash: 0,
  flashWidth: 0.22,
};

const NAMED: Record<ChoreographyName, Partial<Choreography>> = {
  // Everything moves together. `order` stops mattering at stagger 0.
  uniform: { stagger: 0, turbulence: 8 },
  // A directional wipe: launches spread wide, each flight short.
  sweep: { stagger: 0.82, order: 'x' },
  // Centre-out, fast out of the gate, with a flash on the wavefront.
  burst: { stagger: 0.6, order: 'radial', easing: easeOutExpo, turbulence: 28, flash: 0.55 },
};

export const isChoreographyName = (value: unknown): value is ChoreographyName =>
  value === 'uniform' || value === 'sweep' || value === 'burst';

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

/** The gentler return trip `exit: 'mirror'` produces from a resolved `enter`. */
export const mirrorChoreography = (enter: Choreography): Choreography => ({
  ...enter,
  speed: enter.speed * 0.45,
});
