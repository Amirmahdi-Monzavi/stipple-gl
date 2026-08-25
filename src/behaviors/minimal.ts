import type { Behavior } from '../core/types';
import { createDriftBehavior } from './drift';
import { createIntegrateBehavior } from './integrate';
import { createMorphBehavior } from './morph';

export const createMinimalBehaviors = (): Behavior[] => [
  createMorphBehavior(),
  createIntegrateBehavior(),
  createDriftBehavior(),
];
