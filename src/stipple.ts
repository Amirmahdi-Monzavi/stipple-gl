import { createDefaultBehaviors } from './behaviors';
import { StippleCore } from './core/engine';
import type { StippleTarget } from './core/engine';
import type { StippleConfig } from './core/types';
import { shapeSupport } from './sources/support';

export class Stipple extends StippleCore {
  constructor(target: StippleTarget, config?: StippleConfig) {
    super(target, {
      ...config,
      shapes: config?.shapes ?? shapeSupport,
      behaviors: config?.behaviors ?? createDefaultBehaviors(),
    });
  }
}

export const createStipple = (target: StippleTarget, config?: StippleConfig): Stipple =>
  new Stipple(target, config);
