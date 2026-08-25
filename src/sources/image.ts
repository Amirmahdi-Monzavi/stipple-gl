import type { ImageMask, ImageSource, ShapeConfig, XY } from '../core/types';

export interface ImageShapeOverrides {
  scale?: number;
  position?: XY;
  count?: number;
  color?: string;
  /** Which pixels count as ink. Default `'alpha'`. */
  mask?: ImageMask;
  /** Cutoff for `mask`, 0..1. */
  threshold?: number;
}

const fail = (message: string): Error => new Error('stipple-gl: ' + message);

/**
 * Decode any image the browser understands into an ImageBitmap.
 *
 * PNG, JPEG, WebP, AVIF, GIF and SVG all work, because this defers to the
 * browser's own decoders rather than parsing anything ourselves. The result is
 * transferable, so it is also the only image form that reaches a worker.
 */
export const imageFromURL = async (url: string, signal?: AbortSignal): Promise<ImageBitmap> => {
  const init = signal ? { signal } : undefined;
  const response = await fetch(url, init);
  if (!response.ok) {
    throw fail('failed to load ' + url + ' (' + response.status + ')');
  }
  return imageFromBlob(await response.blob());
};

export const imageFromBlob = async (blob: Blob): Promise<ImageBitmap> => {
  if (typeof createImageBitmap !== 'function') {
    throw fail('createImageBitmap is unavailable in this environment');
  }
  try {
    return await createImageBitmap(blob);
  } catch {
    // Firefox refuses SVG blobs in createImageBitmap because they have no
    // intrinsic size. Route those through an <img>, which does size them.
    if (blob.type.includes('svg')) return decodeViaElement(URL.createObjectURL(blob), true);
    throw fail('could not decode image data');
  }
};

const decodeViaElement = async (src: string, revoke = false): Promise<ImageBitmap> => {
  if (typeof Image === 'undefined') throw fail('image decoding needs a browser environment');

  const element = new Image();
  element.crossOrigin = 'anonymous';
  element.decoding = 'async';

  try {
    await new Promise<void>((resolve, reject) => {
      element.onload = () => resolve();
      element.onerror = () => reject(fail('could not decode image data'));
      element.src = src;
    });
    return await createImageBitmap(element);
  } finally {
    if (revoke) URL.revokeObjectURL(src);
  }
};

/**
 * Rasterise SVG markup through the browser's SVG renderer.
 *
 * The path sampler reimplements a slice of SVG and necessarily falls short of
 * it: gradients, filters, patterns, clip paths and CSS blocks are all beyond
 * what Path2D can express. Going through an image gets every one of them right,
 * and gives real per-particle colour for `color: { type: 'shape' }`.
 *
 * `size` sets the rasterisation resolution for markup with no intrinsic size.
 */
export const rasterizeSVG = async (source: string, size = 512): Promise<ImageBitmap> => {
  let markup = source.trim();

  // An SVG with no width/height has no intrinsic size, and several browsers
  // then decode it at 0x0. Give it one without disturbing the viewBox.
  if (!/\swidth\s*=/.test(markup) || !/\sheight\s*=/.test(markup)) {
    markup = markup.replace(/<svg\b/, '<svg width="' + size + '" height="' + size + '"');
  }

  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  return imageFromBlob(blob);
};

/** Wrap an already-decoded image as a shape. */
export const shapeFromImage = (
  image: ImageSource,
  overrides: ImageShapeOverrides = {},
): ShapeConfig => {
  const shape: ShapeConfig = {
    paths: [],
    image,
    scale: overrides.scale ?? 0.7,
    position: overrides.position ?? { x: 0.5, y: 0.5 },
  };
  if (overrides.mask !== undefined) shape.mask = overrides.mask;
  if (overrides.threshold !== undefined) shape.threshold = overrides.threshold;
  if (overrides.count !== undefined) shape.count = overrides.count;
  if (overrides.color !== undefined) shape.color = overrides.color;
  return shape;
};

/** Load any image format and wrap it as a shape. */
export const shapeFromImageURL = async (
  url: string,
  overrides: ImageShapeOverrides = {},
): Promise<ShapeConfig> => shapeFromImage(await imageFromURL(url), overrides);

/**
 * Rasterise SVG markup and wrap it as a shape.
 *
 * Prefer this over `shapeFromString` for artwork with gradients, filters or
 * embedded CSS — anything where the drawing is more than flat paths.
 */
export const shapeFromSVGImage = async (
  source: string,
  overrides: ImageShapeOverrides & { size?: number } = {},
): Promise<ShapeConfig> => {
  const { size, ...rest } = overrides;
  return shapeFromImage(await rasterizeSVG(source, size), rest);
};

/**
 * Markup the path sampler cannot reproduce faithfully.
 *
 * Path2D draws flat fills and strokes and nothing else, so a paint server, a
 * filter or a stylesheet means the vector route would silently lose the look.
 * Detecting that is what lets `shapeFromFile` pick the right strategy instead of
 * asking the caller to know which one their artwork needs.
 */
export const svgNeedsRaster = (source: string): boolean =>
  /url\(\s*['"]?#/.test(source) ||
  /<(linear|radial)gradient|<pattern|<filter|<image|<use\b|<foreignobject|<text\b/i.test(source) ||
  /<style[\s>]/i.test(source);

const SVG_TYPES = /svg/i;

/**
 * Build a shape from a File or Blob of any supported kind.
 *
 * SVG takes the vector route, which samples cleanly at any size — unless the
 * markup uses gradients, filters or stylesheets, in which case it is rasterised
 * so the artwork survives. Everything else goes to the browser's image decoder.
 */
export const shapeFromFile = async (
  file: Blob,
  overrides: ImageShapeOverrides & { size?: number; forceRaster?: boolean } = {},
): Promise<ShapeConfig> => {
  const { size, forceRaster, ...rest } = overrides;
  const name = (file as File).name ?? '';
  const isSVG = SVG_TYPES.test(file.type) || /\.svg$/i.test(name);

  if (isSVG) {
    const source = await file.text();
    if (forceRaster || svgNeedsRaster(source)) {
      return shapeFromImage(await rasterizeSVG(source, size), rest);
    }
    const { shapeFromString } = await import('./shape');
    return shapeFromString(source, rest);
  }

  return shapeFromImage(await imageFromBlob(file), rest);
};
