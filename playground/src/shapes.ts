const polar = (cx: number, cy: number, radius: number, degrees: number): string => {
  const radians = ((degrees - 90) * Math.PI) / 180;
  const x = cx + radius * Math.cos(radians);
  const y = cy + radius * Math.sin(radians);
  return x.toFixed(3) + ' ' + y.toFixed(3);
};

const starPath = (points: number, outer: number, inner: number, cx = 50, cy = 50): string => {
  const step = 360 / points;
  const segments: string[] = ['M ' + polar(cx, cy, outer, 0)];
  for (let i = 0; i < points; i++) {
    segments.push('L ' + polar(cx, cy, inner, i * step + step / 2));
    segments.push('L ' + polar(cx, cy, outer, (i + 1) * step));
  }
  segments.push('Z');
  return segments.join(' ');
};

const ringPath = (cx: number, cy: number, outer: number, inner: number): string => {
  const circle = (r: number) =>
    'M ' +
    (cx - r) +
    ' ' +
    cy +
    ' A ' +
    r +
    ' ' +
    r +
    ' 0 1 0 ' +
    (cx + r) +
    ' ' +
    cy +
    ' A ' +
    r +
    ' ' +
    r +
    ' 0 1 0 ' +
    (cx - r) +
    ' ' +
    cy +
    ' Z';
  return circle(outer) + ' ' + circle(inner);
};

const wrap = (body: string, viewBox = '0 0 100 100'): string =>
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + viewBox + '">' + body + '</svg>';

const path = (d: string, evenOdd = false): string =>
  '<path d="' + d + '"' + (evenOdd ? ' fill-rule="evenodd"' : '') + ' />';

export const shapes: Record<string, string> = {
  shield: wrap(
    path(
      'M50 6 L86 20 V48 C86 70 70 86 50 94 C30 86 14 70 14 48 V20 Z',
    ),
  ),

  lock: wrap(
    path('M22 46 H78 A6 6 0 0 1 84 52 V88 A6 6 0 0 1 78 94 H22 A6 6 0 0 1 16 88 V52 A6 6 0 0 1 22 46 Z') +
      path('M32 46 V30 A18 18 0 0 1 68 30 V46 H56 V30 A6 6 0 0 0 44 30 V46 Z', true),
  ),

  bolt: wrap(path('M56 4 L20 56 H44 L38 96 L80 40 H54 Z')),

  heart: wrap(
    path(
      'M50 92 C50 92 8 64 8 36 A22 22 0 0 1 50 26 A22 22 0 0 1 92 36 C92 64 50 92 50 92 Z',
    ),
  ),

  star: wrap(path(starPath(5, 46, 19))),

  burst: wrap(path(starPath(12, 46, 26))),

  ring: wrap(path(ringPath(50, 50, 44, 27), true)),

  droplet: wrap(path('M50 6 C50 6 84 44 84 62 A34 34 0 0 1 16 62 C16 44 50 6 50 6 Z')),

  hexagon: wrap(path('M50 5 L89 27 V73 L50 95 L11 73 V27 Z')),

  play: wrap(path('M24 12 L88 50 L24 88 Z')),

  cursor: wrap(path('M22 10 L82 46 L54 52 L70 84 L56 92 L40 60 L22 78 Z')),

  eye: wrap(
    path('M4 50 C22 24 78 24 96 50 C78 76 22 76 4 50 Z') +
      path('M50 34 A16 16 0 1 0 50 66 A16 16 0 1 0 50 34 Z', true),
  ),

  cloud: wrap(
    path(
      'M28 76 A20 20 0 0 1 30 36 A24 24 0 0 1 74 34 A18 18 0 0 1 76 76 Z',
    ),
  ),

  brackets: wrap(
    '<path d="M34 22 L12 50 L34 78" fill="none" stroke="#000" stroke-width="11" />' +
      '<path d="M66 22 L88 50 L66 78" fill="none" stroke="#000" stroke-width="11" />',
  ),

  spiral: wrap(
    '<path d="M50 50 A6 6 0 0 1 56 44 A14 14 0 0 1 70 58 A24 24 0 0 1 46 82 A34 34 0 0 1 12 48 A44 44 0 0 1 56 4" fill="none" stroke="#000" stroke-width="8" />',
  ),
};

export type ShapeName = keyof typeof shapes;

export const shapeNames = Object.keys(shapes);
