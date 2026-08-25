import type { Behavior } from '../core/types';
import { createBreatheBehavior } from './breathe';
import { createDriftBehavior } from './drift';
import { createEmissionBehavior } from './emission';
import { createIntegrateBehavior } from './integrate';
import { createJellyBehavior } from './jelly';
import { createMorphBehavior } from './morph';
import { createPointerBehavior } from './pointer';
import { createShockwaveBehavior } from './shockwave';

export { createBreatheBehavior } from './breathe';
export { createDriftBehavior } from './drift';
export { createEmissionBehavior } from './emission';
export { createIntegrateBehavior } from './integrate';
export { createJellyBehavior } from './jelly';
export { createMorphBehavior } from './morph';
export { createPointerBehavior } from './pointer';
export { createShockwaveBehavior } from './shockwave';

export const createDefaultBehaviors = (): Behavior[] => [
  createMorphBehavior(),
  createBreatheBehavior(),
  createJellyBehavior(),
  createPointerBehavior(),
  createShockwaveBehavior(),
  createIntegrateBehavior(),
  createDriftBehavior(),
  createEmissionBehavior(),
];

export const createMinimalBehaviors = (): Behavior[] => [
  createMorphBehavior(),
  createIntegrateBehavior(),
  createDriftBehavior(),
];
