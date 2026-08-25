import type { ColorSpec } from './types';

/**
 * Collapse any colour spec to a single CSS colour.
 *
 * Per-particle colour lives in the packing loop; everything that needs one
 * representative colour — ambient particles, emission sparks — comes here rather
 * than duplicating the union check.
 */
export const solidColor = (spec: ColorSpec): string => {
  if (typeof spec === 'string') return spec;
  return spec.type === 'ramp' ? spec.from : spec.fallback;
};

export const isRamp = (spec: ColorSpec): spec is Extract<ColorSpec, { type: 'ramp' }> =>
  typeof spec !== 'string' && spec.type === 'ramp';

export const isShapeColor = (spec: ColorSpec): spec is Extract<ColorSpec, { type: 'shape' }> =>
  typeof spec !== 'string' && spec.type === 'shape';
