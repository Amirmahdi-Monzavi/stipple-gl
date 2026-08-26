/**
 * Entry for the script-tag build. Everything here lands on `window.stipple`.
 *
 * Kept deliberately small: the point of this build is that someone can paste a
 * script tag into an HTML file or a CodePen and have something on screen in
 * thirty seconds, not that they get the whole API surface.
 *
 * `createScrollMorph` is the one deliberate exception to that. Scroll-driven
 * morphing is a headline feature and the audience for this build is precisely
 * the audience with no bundler to import it with. It costs 0.63 KB here rather
 * than its 2.64 KB standalone figure, because it shares the core already
 * present. The image helpers stay out: they pull in the whole raster path for a
 * job `shapeFromURL` already covers for most people.
 */
export { Stipple, createStipple } from './stipple';
export { isSupported } from './core/supported';
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
export { createScrollMorph } from './scroll/index';
export { morph, snap, starfield, constellation, nebula, dust, presets } from './presets/index';
