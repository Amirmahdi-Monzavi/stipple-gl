import type { ImageMask, ImageSource, SampledShape, ShapeConfig, ShapeDetail } from '../core/types';

export interface SampleSettings {
  maxRaster: number;
  jitter: number;
}

export const defaultSampleSettings: SampleSettings = {
  maxRaster: 512,
  jitter: 1,
};

type Raster = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  width: number;
  height: number;
};

let raster: Raster | null = null;
let hits = new Uint32Array(0);
let background = new Uint8Array(0);
let floodQueue = new Int32Array(0);

/**
 * Which pixels belong to the background, by flooding inward from the border.
 *
 * Luminance masking cannot tell a white glove from the white page behind it —
 * they are the same pixels, and the only thing separating them is that one is
 * reachable from the edge of the image and the other is walled in by an
 * outline. So walk in from the border and keep going while the colour stays
 * close to what the border is made of. Everything the walk cannot reach is
 * subject, whatever its brightness.
 *
 * Returns `null` when the result is not worth trusting: a flood that swallows
 * almost everything means the border colour appears throughout (a photograph),
 * and one that barely moves means the border is not uniform enough to seed
 * from. Both fall back to the luminance split.
 */
const floodBackground = (
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  rect: { x0: number; y0: number; x1: number; y1: number },
  tolerance: number,
): Uint8Array | null => {
  // Two rectangles are in play and conflating them is what puts a seam down the
  // edge of the picture.
  //
  // This one is the image rounded *inward*, so every pixel in it is certainly
  // image and never the margin beside it. It is what the border colour is read
  // from, and what coverage is judged against — both need a trustworthy sample.
  const ix0 = Math.max(0, Math.ceil(rect.x0));
  const iy0 = Math.max(0, Math.ceil(rect.y0));
  const ix1 = Math.min(width, Math.floor(rect.x1));
  const iy1 = Math.min(height, Math.floor(rect.y1));
  if (ix1 - ix0 < 4 || iy1 - iy0 < 4) return null;

  const total = width * height;
  if (background.length < total) background = new Uint8Array(total);
  else background.fill(0, 0, total);
  if (floodQueue.length < total) floodQueue = new Int32Array(total);

  // What the border is made of. Averaging it rather than taking one corner
  // survives a little noise or a gradient, and a border that is not one colour
  // produces a reference that matches nothing, which the coverage test catches.
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let n = 0;
  for (let x = ix0; x < ix1; x++) {
    for (const y of [iy0, iy1 - 1]) {
      const o = (y * width + x) * 4;
      sr += pixels[o]!;
      sg += pixels[o + 1]!;
      sb += pixels[o + 2]!;
      n++;
    }
  }
  for (let y = iy0; y < iy1; y++) {
    for (const x of [ix0, ix1 - 1]) {
      const o = (y * width + x) * 4;
      sr += pixels[o]!;
      sg += pixels[o + 1]!;
      sb += pixels[o + 2]!;
      n++;
    }
  }
  if (n === 0) return null;

  const br = sr / n;
  const bg = sg / n;
  const bb = sb / n;
  const limit = tolerance * 255;
  const limitSq = limit * limit * 3;

  const matches = (index: number): boolean => {
    const o = index * 4;
    // Transparent margin is background by definition.
    if (pixels[o + 3]! < 250) return true;
    const dr = pixels[o]! - br;
    const dg = pixels[o + 1]! - bg;
    const db = pixels[o + 2]! - bb;
    return dr * dr + dg * dg + db * db <= limitSq;
  };

  let head = 0;
  let tail = 0;
  const push = (x: number, y: number): void => {
    const index = y * width + x;
    if (background[index]) return;
    if (!matches(index)) return;
    background[index] = 1;
    floodQueue[tail++] = index;
  };

  // The second rectangle is the whole canvas, and the flood runs over all of it.
  //
  // An image centred on the raster rarely lands on whole pixels, so its outer
  // row or column is a half-covered blend of picture and empty canvas. Confine
  // the flood to the rounded rectangle above and that blend sits just outside
  // it, unreachable — it survives as ink and draws as a line down the edge of
  // the shape. Flooding the full canvas reaches it, and it is let through on
  // alpha, because a partly covered pixel is partly margin.
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (head < tail) {
    const index = floodQueue[head++]!;
    const x = index % width;
    const y = (index / width) | 0;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }

  // Coverage is judged inside the image alone. The empty margin around it is
  // background by definition and counting it would push every source past the
  // upper bound and refuse the mask outright.
  let inside = 0;
  for (let y = iy0; y < iy1; y++) {
    const row = y * width;
    for (let x = ix0; x < ix1; x++) if (background[row + x]) inside++;
  }
  const share = inside / ((ix1 - ix0) * (iy1 - iy0));
  // Under 8% the border never seeded properly; over 92% there was no subject
  // left standing. Neither is a background worth masking with.
  if (share < 0.08 || share > 0.92) return null;

  return background;
};

const acquireRaster = (width: number, height: number): Raster => {
  if (raster && raster.width === width && raster.height === height) {
    raster.ctx.clearRect(0, 0, width, height);
    return raster;
  }

  if (raster) {
    raster.canvas.width = width;
    raster.canvas.height = height;
    raster.width = width;
    raster.height = height;
    raster.ctx.clearRect(0, 0, width, height);
    return raster;
  }

  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });

  // The union of HTMLCanvasElement and OffscreenCanvas widens getContext's return
  // to RenderingContext, which is not what either branch actually yields. The
  // assertion is load-bearing, not decorative.
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

  if (!ctx) throw new Error('stipple-gl: 2D canvas context unavailable for shape sampling');

  raster = { canvas, ctx, width, height };
  return raster;
};

export const releaseRaster = (): void => {
  raster = null;
  hits = new Uint32Array(0);
  weightScratch = new Float32Array(0);
  fieldScratch = new Float32Array(0);
};

const parseViewBox = (viewBox: string | undefined): [number, number, number, number] => {
  const parts = (viewBox ?? '0 0 100 100').split(/[\s,]+/).map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] || 100, parts[3] || 100];
};

const imageWidth = (image: ImageSource): number =>
  (image as HTMLImageElement).naturalWidth ||
  (image as HTMLVideoElement).videoWidth ||
  (image as ImageBitmap).width ||
  0;

const imageHeight = (image: ImageSource): number =>
  (image as HTMLImageElement).naturalHeight ||
  (image as HTMLVideoElement).videoHeight ||
  (image as ImageBitmap).height ||
  0;

const drawPaths = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: ShapeConfig,
  fit: number,
  tx: number,
  ty: number,
  tinted: boolean,
): void => {
  for (const entry of shape.paths) {
    ctx.setTransform(fit, 0, 0, fit, tx, ty);
    if (entry.transform) {
      const m = entry.transform;
      ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    }

    let path: Path2D;
    try {
      path = new Path2D(entry.d);
    } catch {
      continue;
    }

    const paint = tinted ? (entry.color ?? '#000') : '#000';
    if (entry.strokeWidth) {
      ctx.strokeStyle = paint;
      ctx.lineWidth = entry.strokeWidth;
      ctx.stroke(path);
    } else {
      ctx.fillStyle = paint;
      ctx.fill(path, entry.evenOdd ? 'evenodd' : 'nonzero');
    }
  }
};

/**
 * Pick a mask by looking at the pixels.
 *
 * Real transparency means the alpha channel is the silhouette and nothing else
 * needs deciding. Without it — a JPEG, a scan, clipart on a white background —
 * alpha masking would call every pixel ink and hand back the source rectangle,
 * so fall through to luminance and keep whichever side is the minority. Ink is
 * the thing there is less of; a page is mostly not-ink.
 */
const resolveMask = (
  pixels: Uint8ClampedArray,
  width: number,
  rect: { x0: number; y0: number; x1: number; y1: number },
): Exclude<ImageMask, 'auto'> => {
  // Only the drawn rectangle counts. The raster is larger than the image — the
  // fit leaves transparent margin on two sides — and counting that margin makes
  // every source look like it has transparency, which is what this is deciding.
  const x0 = Math.max(0, Math.ceil(rect.x0));
  const y0 = Math.max(0, Math.ceil(rect.y0));
  const x1 = Math.min(width, Math.floor(rect.x1));
  const y1 = Math.min(pixels.length / 4 / width, Math.floor(rect.y1));
  if (x1 <= x0 || y1 <= y0) return 'alpha';

  // Sample rather than sweep: a few thousand pixels settle this, and the caller
  // is already paying for a decode.
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 4096)));
  let seen = 0;
  let transparent = 0;
  let dark = 0;

  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const o = (y * width + x) * 4;
      seen++;
      if (pixels[o + 3]! < 250) {
        transparent++;
        continue;
      }
      if (0.2126 * pixels[o]! + 0.7152 * pixels[o + 1]! + 0.0722 * pixels[o + 2]! < 128) dark++;
    }
  }

  if (seen === 0) return 'alpha';
  // 2% is enough to mean the artwork was authored with a cut-out background,
  // and low enough not to trip on a stray antialiased pixel.
  if (transparent / seen > 0.02) return 'alpha';

  const opaque = seen - transparent;
  if (opaque === 0) return 'alpha';

  // One flat colour has no figure to separate from ground. Splitting it by
  // luminance would put every pixel on one side and none on the other, and the
  // minority rule would then discard the entire image. The rectangle is the
  // honest answer for a source that contains nothing else.
  const darkShare = dark / opaque;
  if (darkShare < 0.005 || darkShare > 0.995) return 'alpha';

  return dark <= opaque - dark ? 'dark' : 'light';
};

let weightScratch = new Float32Array(0);
let fieldScratch = new Float32Array(0);

/**
 * Per-hit sampling weights, returned as a cumulative sum.
 *
 * A flat-filled illustration is mostly interior: on a typical one, edge pixels
 * are around 13% of the ink, so uniform sampling spends 87% of the budget where
 * there is nothing to see and the result reads as a silhouette. Weighting moves
 * the budget to where the picture actually is.
 */
const buildWeights = (
  pixels: Uint8ClampedArray,
  hits: Uint32Array,
  hitCount: number,
  width: number,
  height: number,
  detail: Exclude<ShapeDetail, 'uniform'>,
  strength: number,
): Float32Array | null => {
  const total = width * height;
  if (fieldScratch.length < total * 2) fieldScratch = new Float32Array(total * 2);
  if (weightScratch.length < hitCount) weightScratch = new Float32Array(hitCount);

  // Two fields, because a shape's edges live in two different places.
  //
  //   tone     premultiplied luminance — internal colour boundaries
  //   coverage alpha — the silhouette
  //
  // Tone alone is blind to the commonest case there is: a flat black icon on
  // transparent, where luminance is 0 inside *and* out. That found no gradient
  // at all, and at full strength every weight came out zero, which collapsed
  // the whole field onto one pixel.
  const tone = fieldScratch.subarray(0, total);
  const coverage = fieldScratch.subarray(total, total * 2);

  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const a = pixels[o + 3]! / 255;
    tone[i] = (0.2126 * pixels[o]! + 0.7152 * pixels[o + 1]! + 0.0722 * pixels[o + 2]!) * a;
    coverage[i] = a * 255;
  }

  const mix = strength < 0 ? 0 : strength > 1 ? 1 : strength;
  const weights = weightScratch;
  let running = 0;
  let weighted = 0;

  for (let h = 0; h < hitCount; h++) {
    const index = hits[h]!;
    const x = index % width;
    const y = (index / width) | 0;

    let value: number;

    if (detail === 'density') {
      // Classic stippling: darker ink earns more dots.
      const alpha = pixels[index * 4 + 3]! / 255;
      value = (1 - tone[index]! / 255) * alpha;
    } else {
      // Central differences over both fields. Border pixels clamp rather than
      // skip, since a silhouette running off the raster is still an edge.
      const left = x > 0 ? index - 1 : index;
      const right = x < width - 1 ? index + 1 : index;
      const up = y > 0 ? index - width : index;
      const down = y < height - 1 ? index + width : index;

      const gradient =
        Math.abs(tone[right]! - tone[left]!) +
        Math.abs(tone[down]! - tone[up]!) +
        Math.abs(coverage[right]! - coverage[left]!) +
        Math.abs(coverage[down]! - coverage[up]!);

      // Square-root compresses the range so a hard black-on-white border does
      // not take the entire budget and leave soft edges with nothing.
      value = Math.sqrt(gradient / 255);
    }

    if (value > 0) weighted++;
    running += 1 - mix + mix * (value > 1 ? 1 : value);
    weights[h] = running;
  }

  // Nothing to go on — a single flat colour with no alpha edge, say. Uniform is
  // the honest answer, and it is the only one that does not divide by zero.
  if (running <= 0 || weighted === 0) return null;

  return weights;
};

export const sampleShape = (
  shape: ShapeConfig,
  count: number,
  canvasWidth: number,
  canvasHeight: number,
  settings: Partial<SampleSettings> = {},
): SampledShape => {
  const hasImage = !!shape.image;
  if (count <= 0 || canvasWidth <= 0 || canvasHeight <= 0) {
    return { points: new Float32Array(0), colors: null };
  }
  if (!hasImage && shape.paths.length === 0) {
    return { points: new Float32Array(0), colors: null };
  }

  const { maxRaster, jitter } = { ...defaultSampleSettings, ...settings };

  const rasterScale = Math.min(1, maxRaster / Math.max(canvasWidth, canvasHeight));
  const rw = Math.max(1, Math.round(canvasWidth * rasterScale));
  const rh = Math.max(1, Math.round(canvasHeight * rasterScale));
  const inverseScale = 1 / rasterScale;

  const { ctx } = acquireRaster(rw, rh);

  const scale = shape.scale ?? 1;
  const position = shape.position ?? { x: 0.5, y: 0.5 };

  // A raster source carries its own colour, so it is always sampled tinted.
  let tinted = hasImage;
  // Where the image actually landed, for mask auto-detection.
  let drawn = { x0: 0, y0: 0, x1: rw, y1: rh };

  if (hasImage) {
    const image = shape.image!;
    const iw = imageWidth(image);
    const ih = imageHeight(image);
    if (iw <= 0 || ih <= 0) return { points: new Float32Array(0), colors: null };

    const fit = Math.min(rw / iw, rh / ih) * scale;
    const dw = iw * fit;
    const dh = ih * fit;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dx = rw * position.x - dw / 2;
    const dy = rh * position.y - dh / 2;
    drawn = { x0: dx, y0: dy, x1: dx + dw, y1: dy + dh };
    ctx.drawImage(image, dx, dy, dw, dh);
  } else {
    const [vbx, vby, vbw, vbh] = parseViewBox(shape.viewBox);
    const fit = Math.min(rw / vbw, rh / vbh) * scale;
    const tx = rw * position.x - (vbw * fit) / 2 - vbx * fit;
    const ty = rh * position.y - (vbh * fit) / 2 - vby * fit;

    tinted = shape.paths.some((entry) => entry.color);
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawPaths(ctx, shape, fit, tx, ty, tinted);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Reading back a canvas that has had a cross-origin image drawn onto it
  // throws a SecurityError naming nothing useful. Sampling is the only thing
  // this library does with an image, so the failure is total and the caller
  // needs to know it is a CORS problem rather than a bad image.
  let pixels: Uint8ClampedArray;
  try {
    pixels = ctx.getImageData(0, 0, rw, rh).data;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'SecurityError') {
      throw new Error(
        'stipple-gl: cannot read the pixels of this image because it tainted ' +
          'the canvas. It was loaded from another origin without CORS. Set ' +
          'crossOrigin="anonymous" on the <img> before it loads and make sure ' +
          'the server sends Access-Control-Allow-Origin, or load it through ' +
          'shapeFromImageURL, which fetches it instead.',
        { cause: error },
      );
    }
    throw error;
  }
  const total = rw * rh;

  if (hits.length < total) hits = new Uint32Array(total);

  // Which pixels count as ink. Alpha is right for anything with transparency;
  // a photo or a JPEG is opaque everywhere, so it needs a luminance cutoff or
  // the whole rectangle becomes the shape.
  const requested = shape.mask ?? 'auto';
  let mask = requested === 'auto' ? resolveMask(pixels, rw, drawn) : requested;

  /*
    Try the flood whenever the alternative is a luminance split.

    `auto` reaching a luminance mask means the source is opaque, which is
    exactly the case where enclosed light regions — a white glove inside a black
    outline, a shirt, a muzzle — get thrown away with the background because
    luminance cannot tell them apart. The flood can, when the border is one
    colour, and declines when it is not, so `auto` is never made worse by
    asking: a photograph falls straight back to the split it would have used.
  */
  const luminanceSplit = mask === 'dark' || mask === 'light';
  let backgroundMap: Uint8Array | null = null;

  if (mask === 'subject' || (requested === 'auto' && luminanceSplit)) {
    backgroundMap = floodBackground(pixels, rw, rh, drawn, shape.threshold ?? 0.12);
    // Asked for explicitly and refused: the luminance split is still better
    // than nothing, and matches what `auto` would have chosen anyway.
    if (!backgroundMap && mask === 'subject') mask = 'dark';
  }

  const threshold = shape.threshold ?? (mask === 'alpha' ? 0.03 : 0.5);
  const alphaFloor = mask === 'alpha' ? threshold * 255 : 8;
  const lumCutoff = threshold * 255;

  let hitCount = 0;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    if (pixels[o + 3]! <= alphaFloor) continue;
    if (backgroundMap) {
      if (backgroundMap[i]) continue;
    } else if (mask !== 'alpha') {
      const lum = 0.2126 * pixels[o]! + 0.7152 * pixels[o + 1]! + 0.0722 * pixels[o + 2]!;
      if (mask === 'dark' ? lum > lumCutoff : lum < lumCutoff) continue;
    }
    hits[hitCount++] = i;
  }

  if (hitCount === 0) return { points: new Float32Array(0), colors: null };

  const out = new Float32Array(count * 2);
  const tints = tinted ? new Uint32Array(count) : null;

  const detail = shape.detail ?? 'uniform';
  const weights =
    detail === 'uniform'
      ? null
      : buildWeights(pixels, hits, hitCount, rw, rh, detail, shape.detailStrength ?? 0.85);

  // Stratified inverse-CDF sampling. With no weights the running total is just
  // the index, so this reduces exactly to the even stride it replaces.
  const totalWeight = weights ? weights[hitCount - 1]! : hitCount;
  const step = totalWeight / count;
  let cursor = Math.random() * step;
  let walker = 0;

  for (let i = 0; i < count; i++) {
    const jittered = cursor + (Math.random() - 0.5) * step;
    const target = jittered < 0 ? 0 : jittered;

    let index: number;
    if (weights) {
      // The targets ascend, so the walker never needs to go backwards.
      while (walker < hitCount - 1 && weights[walker]! < target) walker++;
      index = walker;
    } else {
      index = target | 0;
      if (index >= hitCount) index = hitCount - 1;
    }

    const pixel = hits[index]!;
    const px = pixel % rw;
    const py = (pixel / rw) | 0;

    out[i * 2] = (px + 0.5 + (Math.random() - 0.5) * jitter) * inverseScale;
    out[i * 2 + 1] = (py + 0.5 + (Math.random() - 0.5) * jitter) * inverseScale;

    if (tints) {
      const o = pixel * 4;
      tints[i] = pixels[o]! | (pixels[o + 1]! << 8) | (pixels[o + 2]! << 16);
    }

    cursor += step;
  }

  return { points: out, colors: tints };
};

export const shapeBounds = (
  points: Float32Array,
): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
} => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < points.length; i += 2) {
    const x = points[i]!;
    const y = points[i + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, cx: 0, cy: 0 };
  }

  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
};
