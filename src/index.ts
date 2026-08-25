export { Stipple, createStipple } from './core/engine';
export type { StippleTarget } from './core/engine';

export { defaultOptions, resolveOptions, mergeOptions, responsiveCount } from './core/options';

export {
  clamp,
  clamp01,
  lerp,
  rand,
  noise2,
  snoise2,
  hash2i,
  parseColor,
  easings,
  easeLinear,
  easeInOutCubic,
  easeInOutQuad,
  easeOutExpo,
  easeOutBack,
  easeInOutElastic,
} from './core/math';
export type { EasingName } from './core/math';

export { CpuBackend, createCpuBackend } from './backends/cpu';

export {
  createDefaultBehaviors,
  createMinimalBehaviors,
  createMorphBehavior,
  createBreatheBehavior,
  createJellyBehavior,
  createPointerBehavior,
  createShockwaveBehavior,
  createIntegrateBehavior,
  createDriftBehavior,
  createEmissionBehavior,
} from './behaviors';

export { parseSVG, loadSVG, clearSVGCache, parseTransform, shapeElementToPath } from './sources/svg';
export { sampleShape, shapeBounds, releaseRaster, defaultSampleSettings } from './sources/sample';
export type { SampleSettings } from './sources/sample';
export { assignTargets, releaseAssignScratch } from './sources/assign';
export type { AssignMode } from './sources/assign';

export { shapeFromSVG, shapeFromString, shapeFromURL, fitShapeToElement } from './sources/shape';

export type {
  Behavior,
  BlendMode,
  DeepPartial,
  Easing,
  EmissionOptions,
  FrameState,
  JellyOptions,
  MajorOptions,
  Matrix,
  MinorOptions,
  PackTarget,
  PointerOptions,
  PointerState,
  RGB,
  RenderMode,
  SVGPathData,
  SVGShapeData,
  ShapeConfig,
  Shockwave,
  SimContext,
  SimulationBackend,
  SpreadOptions,
  StippleConfig,
  StippleInstance,
  StippleOptions,
  TransitionOptions,
  Viewport,
  XY,
  XYZ,
} from './core/types';
