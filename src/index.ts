export { Stipple, createStipple } from './stipple';
export { StippleCore } from './core/engine';
export type { StippleTarget } from './core/engine';

export { defaultOptions, resolveOptions, mergeOptions, responsiveCount } from './core/options';
export {
  baseChoreography,
  resolveChoreography,
  mirrorChoreography,
  isChoreographyName,
} from './core/choreography';
export { solidColor, isRamp, isShapeColor } from './core/color';
export { PHASE_ORDER, behaviorOrder, sortBehaviors } from './core/pipeline';

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
  resolveEasing,
} from './core/math';

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

export { shapeFromSVG, shapeFromString, shapeFromURL, fitShapeToElement } from './sources/shape';
export {
  imageFromURL,
  imageFromBlob,
  rasterizeSVG,
  shapeFromImage,
  shapeFromImageURL,
  shapeFromSVGImage,
  shapeFromFile,
  svgNeedsRaster,
} from './sources/image';
export type { ImageShapeOverrides } from './sources/image';
export { shapeSupport } from './sources/support';

export type {
  AssignFn,
  AssignMode,
  Behavior,
  BehaviorPhase,
  BlendMode,
  Camera,
  Choreography,
  ChoreographyConfig,
  ChoreographyName,
  ColorSpec,
  ImageMask,
  ImageSource,
  DeepPartial,
  Easing,
  EasingName,
  EmissionOptions,
  FrameState,
  JellyOptions,
  MajorOptions,
  Matrix,
  MinorOptions,
  MorphOptions,
  PackTarget,
  PointerOptions,
  PointerState,
  RGB,
  RenderMode,
  ResolvedChoreographies,
  SVGPathData,
  SampledShape,
  SVGShapeData,
  ShapeConfig,
  Shockwave,
  StippleEvent,
  StippleEventMap,
  SimContext,
  ShapeSupport,
  SimulationBackend,
  SpreadOptions,
  StaggerOrder,
  StippleConfig,
  StippleInstance,
  StippleOptions,
  TransitionOptions,
  Viewport,
  XY,
  XYZ,
} from './core/types';
