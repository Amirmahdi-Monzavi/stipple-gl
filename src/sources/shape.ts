import type { ShapeConfig, SVGShapeData, XY } from '../core/types';
import { loadSVG, parseSVG } from './svg';

export interface ShapeOverrides {
  scale?: number;
  position?: XY;
  count?: number;
  color?: string;
}

export const shapeFromSVG = (data: SVGShapeData, overrides: ShapeOverrides = {}): ShapeConfig => {
  const shape: ShapeConfig = {
    paths: data.paths,
    viewBox: data.viewBox,
    scale: overrides.scale ?? 0.5,
    position: overrides.position ?? { x: 0.5, y: 0.5 },
  };
  if (overrides.count !== undefined) shape.count = overrides.count;
  if (overrides.color !== undefined) shape.color = overrides.color;
  return shape;
};

export const shapeFromString = (source: string, overrides: ShapeOverrides = {}): ShapeConfig =>
  shapeFromSVG(parseSVG(source), overrides);

export const shapeFromURL = async (
  url: string,
  overrides: ShapeOverrides = {},
): Promise<ShapeConfig> => shapeFromSVG(await loadSVG(url), overrides);

export const fitShapeToElement = (
  shape: ShapeConfig,
  slot: HTMLElement,
  canvas: HTMLElement,
  fill = 0.86,
): ShapeConfig => {
  const slotRect = slot.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  if (slotRect.width <= 0 || slotRect.height <= 0) return shape;
  if (canvasRect.width <= 0 || canvasRect.height <= 0) return shape;

  const parts = (shape.viewBox ?? '0 0 100 100').split(/[\s,]+/).map(Number);
  const vw = parts[2] || 1;
  const vh = parts[3] || 1;
  const base = Math.min(canvasRect.width / vw, canvasRect.height / vh);

  return {
    ...shape,
    position: {
      x: (slotRect.left - canvasRect.left + slotRect.width / 2) / canvasRect.width,
      y: (slotRect.top - canvasRect.top + slotRect.height / 2) / canvasRect.height,
    },
    scale: Math.min((slotRect.width * fill) / (vw * base), (slotRect.height * fill) / (vh * base)),
  };
};
