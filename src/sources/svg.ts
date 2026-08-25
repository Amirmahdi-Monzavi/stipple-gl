import type { Matrix, SVGPathData, SVGShapeData } from '../core/types';

const num = (element: Element, name: string, fallback = 0): number => {
  const raw = element.getAttribute(name);
  if (raw === null) return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export type { Matrix };

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

const isIdentity = (m: Matrix): boolean =>
  m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;

const TRANSFORM_TOKEN = /(\w+)\s*\(([^)]*)\)/g;

export const parseTransform = (input: string | null): Matrix => {
  if (!input) return IDENTITY;
  let result: Matrix = IDENTITY;
  TRANSFORM_TOKEN.lastIndex = 0;
  let token: RegExpExecArray | null;

  while ((token = TRANSFORM_TOKEN.exec(input)) !== null) {
    const name = token[1]!;
    const args = token[2]!
      .split(/[\s,]+/)
      .map(Number)
      .filter((value) => Number.isFinite(value));

    if (name === 'translate') {
      result = multiply(result, [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0]);
    } else if (name === 'scale') {
      const sx = args[0] ?? 1;
      result = multiply(result, [sx, 0, 0, args[1] ?? sx, 0, 0]);
    } else if (name === 'rotate') {
      const angle = ((args[0] ?? 0) * Math.PI) / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const cx = args[1] ?? 0;
      const cy = args[2] ?? 0;
      if (cx || cy) result = multiply(result, [1, 0, 0, 1, cx, cy]);
      result = multiply(result, [cos, sin, -sin, cos, 0, 0]);
      if (cx || cy) result = multiply(result, [1, 0, 0, 1, -cx, -cy]);
    } else if (name === 'matrix' && args.length === 6) {
      result = multiply(result, args as Matrix);
    } else if (name === 'skewX') {
      result = multiply(result, [1, 0, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 1, 0, 0]);
    } else if (name === 'skewY') {
      result = multiply(result, [1, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0]);
    }
  }
  return result;
};

const arc = (cx: number, cy: number, rx: number, ry: number): string =>
  'M ' +
  (cx - rx) +
  ' ' +
  cy +
  ' A ' +
  rx +
  ' ' +
  ry +
  ' 0 1 0 ' +
  (cx + rx) +
  ' ' +
  cy +
  ' A ' +
  rx +
  ' ' +
  ry +
  ' 0 1 0 ' +
  (cx - rx) +
  ' ' +
  cy +
  ' Z';

export const shapeElementToPath = (element: Element): string | null => {
  const tag = element.tagName.toLowerCase();

  if (tag === 'circle') {
    const r = num(element, 'r');
    return r > 0 ? arc(num(element, 'cx'), num(element, 'cy'), r, r) : null;
  }

  if (tag === 'ellipse') {
    const rx = num(element, 'rx');
    const ry = num(element, 'ry');
    return rx > 0 && ry > 0 ? arc(num(element, 'cx'), num(element, 'cy'), rx, ry) : null;
  }

  if (tag === 'rect') {
    const x = num(element, 'x');
    const y = num(element, 'y');
    const w = num(element, 'width');
    const h = num(element, 'height');
    if (w <= 0 || h <= 0) return null;

    const rxRaw = num(element, 'rx');
    const ryRaw = element.getAttribute('ry') === null ? rxRaw : num(element, 'ry');
    const rx = Math.min(rxRaw, w / 2);
    const ry = Math.min(ryRaw, h / 2);

    if (rx <= 0 && ry <= 0) {
      return 'M ' + x + ' ' + y + ' H ' + (x + w) + ' V ' + (y + h) + ' H ' + x + ' Z';
    }

    return (
      'M ' +
      (x + rx) +
      ' ' +
      y +
      ' H ' +
      (x + w - rx) +
      ' A ' +
      rx +
      ' ' +
      ry +
      ' 0 0 1 ' +
      (x + w) +
      ' ' +
      (y + ry) +
      ' V ' +
      (y + h - ry) +
      ' A ' +
      rx +
      ' ' +
      ry +
      ' 0 0 1 ' +
      (x + w - rx) +
      ' ' +
      (y + h) +
      ' H ' +
      (x + rx) +
      ' A ' +
      rx +
      ' ' +
      ry +
      ' 0 0 1 ' +
      x +
      ' ' +
      (y + h - ry) +
      ' V ' +
      (y + ry) +
      ' A ' +
      rx +
      ' ' +
      ry +
      ' 0 0 1 ' +
      (x + rx) +
      ' ' +
      y +
      ' Z'
    );
  }

  if (tag === 'line') {
    return (
      'M ' +
      num(element, 'x1') +
      ' ' +
      num(element, 'y1') +
      ' L ' +
      num(element, 'x2') +
      ' ' +
      num(element, 'y2')
    );
  }

  if (tag === 'polyline' || tag === 'polygon') {
    const points = element.getAttribute('points');
    if (!points) return null;
    const coords = points.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
    if (coords.length < 4) return null;
    let path = 'M ' + coords[0] + ' ' + coords[1];
    for (let i = 2; i < coords.length - 1; i += 2) {
      path += ' L ' + coords[i] + ' ' + coords[i + 1];
    }
    return tag === 'polygon' ? path + ' Z' : path;
  }

  return null;
};

const SHAPE_SELECTOR = 'path,circle,ellipse,rect,line,polyline,polygon';
const SKIP_TAGS = new Set(['defs', 'clippath', 'mask', 'style', 'title', 'desc', 'metadata']);

/** Presentation attributes that cascade from an ancestor to its children. */
interface Painted {
  fill: string | null;
  stroke: string | null;
  strokeWidth: string | null;
  fillRule: string | null;
}

const STYLE_DECL = /([\w-]+)\s*:\s*([^;]+)/g;

/** Read one property from a `style` attribute. Inline style beats the attribute. */
const styleProp = (style: string | null, property: string): string | null => {
  if (!style) return null;
  STYLE_DECL.lastIndex = 0;
  let match: RegExpExecArray | null;
  let found: string | null = null;
  while ((match = STYLE_DECL.exec(style)) !== null) {
    if (match[1]!.toLowerCase() === property) found = match[2]!.trim();
  }
  return found;
};

/**
 * Resolve an element's painted state against what it inherits.
 *
 * SVG presentation attributes cascade, and `style` wins over the attribute of
 * the same name. Reading only `getAttribute('fill')` off the element misses
 * both, which is why an icon that sets `fill="none"` once on the root — the
 * overwhelmingly common shape of a stroked icon — used to come out filled, and
 * an outline path filled is a blob rather than a shape.
 */
const paintOf = (element: Element, inherited: Painted): Painted => {
  const style = element.getAttribute('style');
  const pick = (property: string, attribute = property): string | null =>
    styleProp(style, property) ?? element.getAttribute(attribute);

  return {
    fill: pick('fill') ?? inherited.fill,
    stroke: pick('stroke') ?? inherited.stroke,
    strokeWidth: pick('stroke-width') ?? inherited.strokeWidth,
    fillRule: pick('fill-rule') ?? inherited.fillRule,
  };
};

/** `url(#gradient)` and friends cannot be resolved outside the SVG's own DOM. */
const isPaintServer = (value: string): boolean => value.startsWith('url(');

const usableColor = (value: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed === 'none' || trimmed === 'currentColor' || trimmed === 'transparent') return undefined;
  if (isPaintServer(trimmed)) return undefined;
  return trimmed;
};

const collect = (
  root: Element,
  inherited: Matrix,
  out: SVGPathData[],
  paint: Painted,
): void => {
  for (const child of Array.from(root.children)) {
    const tag = child.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) continue;

    const matrix = multiply(inherited, parseTransform(child.getAttribute('transform')));
    const painted = paintOf(child, paint);

    if (!child.matches(SHAPE_SELECTOR)) {
      collect(child, matrix, out, painted);
      continue;
    }

    const d = tag === 'path' ? (child.getAttribute('d')?.trim() ?? null) : shapeElementToPath(child);
    if (!d) continue;

    const fill = painted.fill;
    const stroke = painted.stroke;
    const strokeWidth = parseFloat(painted.strokeWidth ?? '');
    const entry: SVGPathData = { d };

    // A `line` or `polyline` has no interior to fill, so it is always a stroke.
    const strokeOnly = tag === 'line' || tag === 'polyline';
    // An unspecified fill is not an absent one: SVG's initial value is black.
    // Only an explicit `none` means the interior is unpainted.
    const declared = fill === null ? 'black' : fill.trim();
    const noFill = declared === 'none' || declared === 'transparent';
    const hasStroke = !!stroke && stroke.trim() !== 'none';

    if ((noFill || strokeOnly) && hasStroke) {
      entry.strokeWidth = Number.isFinite(strokeWidth) && strokeWidth > 0 ? strokeWidth : 1;
      const color = usableColor(stroke);
      if (color) entry.color = color;
    } else if (noFill && !hasStroke) {
      // Nothing paints this element. Skipping keeps invisible geometry out of
      // the silhouette instead of stamping it as a solid blob.
      continue;
    } else {
      entry.evenOdd = painted.fillRule === 'evenodd';
      const color = usableColor(fill);
      if (color) entry.color = color;
    }

    if (!isIdentity(matrix)) entry.transform = matrix;
    out.push(entry);
  }
};

export const parseSVG = (source: string): SVGShapeData => {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('stipple-gl: invalid SVG markup');

  const svg = doc.querySelector('svg');
  if (!svg) throw new Error('stipple-gl: no <svg> root element found');

  let viewBox = svg.getAttribute('viewBox')?.trim() ?? '';
  if (!viewBox) {
    const w = parseFloat((svg.getAttribute('width') ?? '100').replace(/[^\d.-]/g, '')) || 100;
    const h = parseFloat((svg.getAttribute('height') ?? '100').replace(/[^\d.-]/g, '')) || 100;
    viewBox = '0 0 ' + w + ' ' + h;
  }

  const paths: SVGPathData[] = [];
  // The root can carry the paint everything inherits —  on <svg>
  // is how nearly every stroked icon set is authored.
  collect(svg, IDENTITY, paths, paintOf(svg, { fill: null, stroke: null, strokeWidth: null, fillRule: null }));
  if (paths.length === 0) throw new Error('stipple-gl: no drawable geometry found in SVG');

  const result: SVGShapeData = { paths, viewBox };
  const width = svg.getAttribute('width');
  const height = svg.getAttribute('height');
  if (width) result.width = parseFloat(width);
  if (height) result.height = parseFloat(height);
  return result;
};

const cache = new Map<string, Promise<SVGShapeData>>();

export const loadSVG = (url: string): Promise<SVGShapeData> => {
  const hit = cache.get(url);
  if (hit) return hit;

  const request = fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error('stipple-gl: failed to load ' + url + ' (' + response.status + ')');
      }
      return response.text();
    })
    .then(parseSVG)
    .catch((error: unknown) => {
      cache.delete(url);
      throw error;
    });

  cache.set(url, request);
  return request;
};

export const clearSVGCache = (): void => cache.clear();
