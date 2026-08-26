/**
 * Entry for the script-tag build. Everything here lands on `window.stipple`.
 *
 * Kept deliberately small: the point of this build is that someone can paste a
 * script tag into an HTML file or a CodePen and have something on screen in
 * thirty seconds, not that they get the whole API surface.
 */
export { Stipple, createStipple } from './stipple';
export { defaultOptions, resolveOptions, mergeOptions, responsiveCount } from './core/options';
export { shapeFromSVG, shapeFromString, shapeFromURL, fitShapeToElement } from './sources/shape';
export { parseSVG, loadSVG } from './sources/svg';
export {
  easings,
  easeLinear,
  easeInOutCubic,
  easeInOutQuad,
  easeOutExpo,
  easeOutBack,
  easeInOutElastic,
} from './core/math';
export { morph, snap, starfield, constellation, nebula, dust, presets } from './presets/index';
