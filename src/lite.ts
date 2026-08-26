import { createMinimalBehaviors } from './behaviors/minimal';
import { StippleCore } from './core/engine';
import type { StippleTarget } from './core/engine';
import type { StippleConfig } from './core/types';

export class Stipple extends StippleCore {
  constructor(target: StippleTarget, config?: StippleConfig) {
    super(target, {
      ...config,
      behaviors: config?.behaviors ?? createMinimalBehaviors(),
    });
  }
}

export const createStipple = (target: StippleTarget, config?: StippleConfig): Stipple =>
  new Stipple(target, config);

export { createMinimalBehaviors } from './behaviors/minimal';
export { createMorphBehavior } from './behaviors/morph';
export { createIntegrateBehavior } from './behaviors/integrate';
export { createDriftBehavior } from './behaviors/drift';

export { isSupported } from './core/supported';
export { defaultOptions, resolveOptions, mergeOptions, responsiveCount } from './core/options';
export { clamp, clamp01, lerp, rand, noise2, hash2i, parseColor } from './core/math';

export type {
  Behavior,
  BlendMode,
  RenderMode,
  StippleConfig,
  StippleInstance,
  StippleOptions,
  Viewport,
} from './core/types';
