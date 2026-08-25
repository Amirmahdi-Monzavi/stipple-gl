import type { ShapeSupport } from '../core/types';
import { assignTargets } from './assign';
import { sampleShape, shapeBounds } from './sample';

export const shapeSupport: ShapeSupport = {
  sample: sampleShape,
  bounds: shapeBounds,
  assign: assignTargets,
};
