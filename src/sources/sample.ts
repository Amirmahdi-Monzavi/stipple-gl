import type { ShapeConfig } from '../core/types';

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

  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;

  if (!ctx) throw new Error('stipple-gl: 2D canvas context unavailable for shape sampling');

  raster = { canvas, ctx, width, height };
  return raster;
};

export const releaseRaster = (): void => {
  raster = null;
  hits = new Uint32Array(0);
};

const parseViewBox = (viewBox: string | undefined): [number, number, number, number] => {
  const parts = (viewBox ?? '0 0 100 100').split(/[\s,]+/).map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] || 100, parts[3] || 100];
};

export const sampleShape = (
  shape: ShapeConfig,
  count: number,
  canvasWidth: number,
  canvasHeight: number,
  settings: Partial<SampleSettings> = {},
): Float32Array => {
  if (count <= 0 || canvasWidth <= 0 || canvasHeight <= 0 || shape.paths.length === 0) {
    return new Float32Array(0);
  }

  const { maxRaster, jitter } = { ...defaultSampleSettings, ...settings };

  const rasterScale = Math.min(1, maxRaster / Math.max(canvasWidth, canvasHeight));
  const rw = Math.max(1, Math.round(canvasWidth * rasterScale));
  const rh = Math.max(1, Math.round(canvasHeight * rasterScale));
  const inverseScale = 1 / rasterScale;

  const { ctx } = acquireRaster(rw, rh);

  const [vbx, vby, vbw, vbh] = parseViewBox(shape.viewBox);
  const scale = shape.scale ?? 1;
  const position = shape.position ?? { x: 0.5, y: 0.5 };

  const fit = Math.min(rw / vbw, rh / vbh) * scale;
  const tx = rw * position.x - (vbw * fit) / 2 - vbx * fit;
  const ty = rh * position.y - (vbh * fit) / 2 - vby * fit;

  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

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

    if (entry.strokeWidth) {
      ctx.lineWidth = entry.strokeWidth;
      ctx.stroke(path);
    } else {
      ctx.fill(path, entry.evenOdd ? 'evenodd' : 'nonzero');
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const pixels = ctx.getImageData(0, 0, rw, rh).data;
  const total = rw * rh;

  if (hits.length < total) hits = new Uint32Array(total);

  let hitCount = 0;
  for (let i = 0; i < total; i++) {
    if (pixels[i * 4 + 3]! > 8) hits[hitCount++] = i;
  }

  if (hitCount === 0) return new Float32Array(0);

  const out = new Float32Array(count * 2);
  const step = hitCount / count;
  let cursor = Math.random() * step;

  for (let i = 0; i < count; i++) {
    const jittered = cursor + (Math.random() - 0.5) * step;
    let index = jittered < 0 ? 0 : jittered | 0;
    if (index >= hitCount) index = hitCount - 1;

    const pixel = hits[index]!;
    const px = pixel % rw;
    const py = (pixel / rw) | 0;

    out[i * 2] = (px + 0.5 + (Math.random() - 0.5) * jitter) * inverseScale;
    out[i * 2 + 1] = (py + 0.5 + (Math.random() - 0.5) * jitter) * inverseScale;

    cursor += step;
  }

  return out;
};

export const shapeBounds = (points: Float32Array): {
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
