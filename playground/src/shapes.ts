const polar = (cx: number, cy: number, radius: number, degrees: number): string => {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return (
    (cx + radius * Math.cos(radians)).toFixed(2) +
    ' ' +
    (cy + radius * Math.sin(radians)).toFixed(2)
  );
};

const starPath = (points: number, outer: number, inner: number, cx = 50, cy = 50): string => {
  const step = 360 / points;
  const segments = ['M ' + polar(cx, cy, outer, 0)];
  for (let i = 0; i < points; i++) {
    segments.push('L ' + polar(cx, cy, inner, i * step + step / 2));
    segments.push('L ' + polar(cx, cy, outer, (i + 1) * step));
  }
  return segments.join(' ') + ' Z';
};

const gearPath = (teeth: number, outer: number, root: number, cx = 50, cy = 50): string => {
  const step = 360 / teeth;
  const half = step * 0.26;
  const segments: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const base = i * step;
    segments.push((i === 0 ? 'M ' : 'L ') + polar(cx, cy, root, base - half * 1.5));
    segments.push('L ' + polar(cx, cy, outer, base - half));
    segments.push('L ' + polar(cx, cy, outer, base + half));
    segments.push('L ' + polar(cx, cy, root, base + half * 1.5));
  }
  return segments.join(' ') + ' Z';
};

const circlePath = (cx: number, cy: number, r: number): string =>
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

const wrap = (body: string, viewBox = '0 0 100 100'): string =>
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + viewBox + '">' + body + '</svg>';

const fill = (d: string, evenOdd = false): string =>
  '<path d="' + d + '"' + (evenOdd ? ' fill-rule="evenodd"' : '') + ' />';

const stroke = (d: string, width: number): string =>
  '<path d="' + d + '" fill="none" stroke="#000" stroke-width="' + width + '" />';

const menorah = (): string => {
  const parts: string[] = [];
  const stemTop = 40;

  parts.push(fill('M 32 92 H 68 L 60 84 H 40 Z'));
  parts.push(fill('M 46 84 V 44 H 54 V 84 Z'));

  for (let i = 1; i <= 4; i++) {
    const spread = i * 11;
    const rise = stemTop - i * 3;
    parts.push(
      stroke(
        'M 50 ' +
          (66 - i * 4) +
          ' Q ' +
          (50 - spread) +
          ' ' +
          (64 - i * 6) +
          ' ' +
          (50 - spread) +
          ' ' +
          rise,
        3,
      ),
    );
    parts.push(
      stroke(
        'M 50 ' +
          (66 - i * 4) +
          ' Q ' +
          (50 + spread) +
          ' ' +
          (64 - i * 6) +
          ' ' +
          (50 + spread) +
          ' ' +
          rise,
        3,
      ),
    );
  }

  const candles = [50, 39, 61, 28, 72, 17, 83, 6, 94];
  for (let i = 0; i < candles.length; i++) {
    const x = candles[i]!;
    const top = i === 0 ? 40 : 40 - Math.floor((i + 1) / 2) * 3;
    parts.push(
      fill(
        'M ' +
          (x - 2.4) +
          ' ' +
          top +
          ' H ' +
          (x + 2.4) +
          ' V ' +
          (top - 9) +
          ' H ' +
          (x - 2.4) +
          ' Z',
      ),
    );
    parts.push(
      fill(
        'M ' +
          x +
          ' ' +
          (top - 10) +
          ' C ' +
          (x + 3.2) +
          ' ' +
          (top - 14) +
          ' ' +
          (x + 2.4) +
          ' ' +
          (top - 18) +
          ' ' +
          x +
          ' ' +
          (top - 20) +
          ' C ' +
          (x - 2.4) +
          ' ' +
          (top - 18) +
          ' ' +
          (x - 3.2) +
          ' ' +
          (top - 14) +
          ' ' +
          x +
          ' ' +
          (top - 10) +
          ' Z',
      ),
    );
  }

  return wrap(parts.join(''), '0 0 100 100');
};

// ---------------------------------------------------------------------------
// Showpieces
//
// Generated rather than hand-authored, because the point of these is intricacy
// and a few hundred hand-written path commands is not maintainable. Each is a
// closed-form curve sampled into a polyline, which the sampler traces as a
// stroke — so the particle field lands on the line itself rather than filling
// a silhouette.
// ---------------------------------------------------------------------------

const polyline = (points: Array<[number, number]>, close = false): string => {
  if (points.length === 0) return '';
  let d = 'M ' + points[0]![0].toFixed(2) + ' ' + points[0]![1].toFixed(2);
  for (let i = 1; i < points.length; i++) {
    d += ' L ' + points[i]![0].toFixed(2) + ' ' + points[i]![1].toFixed(2);
  }
  return close ? d + ' Z' : d;
};

/** Sample a parametric curve over [0, turns * 2PI]. */
const curve = (
  steps: number,
  turns: number,
  fn: (t: number) => [number, number],
): Array<[number, number]> => {
  const points: Array<[number, number]> = [];
  const span = turns * Math.PI * 2;
  for (let i = 0; i <= steps; i++) points.push(fn((i / steps) * span));
  return points;
};

/** Hilbert curve: one continuous line that visits every cell of a 2^n grid. */
const hilbert = (order: number): string => {
  const size = 1 << order;
  const total = size * size;
  const points: Array<[number, number]> = [];

  for (let index = 0; index < total; index++) {
    // d2xy: walk the quadrants from the smallest, rotating as we go.
    let t = index;
    let x = 0;
    let y = 0;
    for (let s = 1; s < size; s *= 2) {
      const rx = 1 & (t / 2);
      const ry = 1 & (t ^ rx);
      if (ry === 0) {
        if (rx === 1) {
          x = s - 1 - x;
          y = s - 1 - y;
        }
        const swap = x;
        x = y;
        y = swap;
      }
      x += s * rx;
      y += s * ry;
      t = Math.floor(t / 4);
    }
    const step = 92 / (size - 1);
    points.push([4 + x * step, 4 + y * step]);
  }
  return polyline(points);
};

/** Hypotrochoid — the shape a spirograph pen traces. */
const spirograph = (R: number, r: number, d: number): string => {
  const ratio = (R - r) / r;
  const turns = r / gcd(R, r);
  return polyline(
    curve(1800, turns, (t) => [
      50 + (R - r) * Math.cos(t) + d * Math.cos(ratio * t),
      50 + (R - r) * Math.sin(t) - d * Math.sin(ratio * t),
    ]),
    true,
  );
};

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** A (p, q) torus knot flattened to two dimensions. */
const torusKnot = (p: number, q: number): string =>
  polyline(
    curve(1400, q, (t) => {
      const r = 24 + 12 * Math.cos((p / q) * t);
      return [50 + r * Math.cos(t), 50 + r * Math.sin(t)];
    }),
    true,
  );

/** Superformula — one equation, an unreasonable number of organic outlines. */
const superformula = (
  m: number,
  n1: number,
  n2: number,
  n3: number,
  scale: number,
): Array<[number, number]> =>
  curve(900, 1, (t) => {
    const a = Math.pow(Math.abs(Math.cos((m * t) / 4)), n2);
    const b = Math.pow(Math.abs(Math.sin((m * t) / 4)), n3);
    const r = Math.pow(a + b, -1 / n1);
    const radius = Number.isFinite(r) ? Math.min(r, 6) * scale : 0;
    return [50 + radius * Math.cos(t), 50 + radius * Math.sin(t)];
  });

/** Concentric superformula rings with a rosette of petals through them. */
const mandala = (): string => {
  const parts: string[] = [];
  parts.push(stroke(polyline(superformula(12, 0.4, 1.1, 1.6, 12), true), 1.6));
  parts.push(stroke(polyline(superformula(6, 0.6, 1.4, 1.2, 22), true), 1.6));
  parts.push(stroke(polyline(superformula(18, 0.5, 1.2, 1.5, 33), true), 1.4));
  parts.push(stroke(circlePath(50, 50, 44), 1.2));

  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const inner = 26;
    const outer = 42;
    const spread = 0.13;
    parts.push(
      stroke(
        'M ' +
          (50 + inner * Math.cos(angle)).toFixed(2) +
          ' ' +
          (50 + inner * Math.sin(angle)).toFixed(2) +
          ' Q ' +
          (50 + 36 * Math.cos(angle - spread)).toFixed(2) +
          ' ' +
          (50 + 36 * Math.sin(angle - spread)).toFixed(2) +
          ' ' +
          (50 + outer * Math.cos(angle)).toFixed(2) +
          ' ' +
          (50 + outer * Math.sin(angle)).toFixed(2) +
          ' Q ' +
          (50 + 36 * Math.cos(angle + spread)).toFixed(2) +
          ' ' +
          (50 + 36 * Math.sin(angle + spread)).toFixed(2) +
          ' ' +
          (50 + inner * Math.cos(angle)).toFixed(2) +
          ' ' +
          (50 + inner * Math.sin(angle)).toFixed(2) +
          ' Z',
        1.3,
      ),
    );
  }
  return wrap(parts.join(''));
};

/** Golden-angle spiral — the packing a sunflower head uses. */
const phyllotaxis = (): string => {
  const parts: string[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const total = 260;
  for (let i = 0; i < total; i++) {
    const radius = 45 * Math.sqrt(i / total);
    const angle = i * golden;
    const r = 0.9 + 2.2 * (i / total);
    parts.push(fill(circlePath(50 + radius * Math.cos(angle), 50 + radius * Math.sin(angle), r)));
  }
  return wrap(parts.join(''));
};

/** Recursive branching, thinning as it goes. */
const fractalTree = (): string => {
  const parts: string[] = [];
  const branch = (x: number, y: number, angle: number, length: number, depth: number): void => {
    if (depth === 0 || length < 1.5) return;
    const x2 = x + Math.cos(angle) * length;
    const y2 = y + Math.sin(angle) * length;
    parts.push(
      stroke(
        'M ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' L ' + x2.toFixed(2) + ' ' + y2.toFixed(2),
        Math.max(0.7, depth * 0.72),
      ),
    );
    branch(x2, y2, angle - 0.42, length * 0.74, depth - 1);
    branch(x2, y2, angle + 0.38, length * 0.72, depth - 1);
    if (depth % 2 === 0) branch(x2, y2, angle + 0.02, length * 0.62, depth - 1);
  };
  branch(50, 96, -Math.PI / 2, 22, 8);
  return wrap(parts.join(''));
};

/** Standing-wave interference, drawn as a stack of phase-shifted lines. */
const interference = (): string => {
  const parts: string[] = [];
  const lines = 22;
  for (let i = 0; i < lines; i++) {
    const y = 8 + (i / (lines - 1)) * 84;
    const phase = (i / lines) * Math.PI * 2;
    const points: Array<[number, number]> = [];
    for (let s = 0; s <= 120; s++) {
      const x = 6 + (s / 120) * 88;
      const wave =
        Math.sin(x * 0.09 + phase) * 4 * Math.sin(phase * 0.5) +
        Math.sin(x * 0.21 - phase * 1.7) * 2.4;
      points.push([x, y + wave]);
    }
    parts.push(stroke(polyline(points), 1.3));
  }
  return wrap(parts.join(''));
};

export const shapes: Record<string, string> = {
  shield: wrap(fill('M50 6 L86 20 V48 C86 70 70 86 50 94 C30 86 14 70 14 48 V20 Z')),

  eye: wrap(
    fill('M 4 50 Q 50 10 96 50 Q 50 90 4 50 Z M 16 50 Q 50 24 84 50 Q 50 76 16 50 Z', true) +
      fill(circlePath(50, 50, 16) + ' ' + circlePath(55, 44, 5), true),
  ),

  menorah: menorah(),

  gear: wrap(fill(gearPath(10, 47, 33) + ' ' + circlePath(50, 50, 15), true)),

  key: wrap(
    fill(circlePath(30, 34, 20) + ' ' + circlePath(30, 34, 8), true) +
      fill('M 40 46 L 82 88 L 74 96 L 66 88 L 60 94 L 52 86 L 58 80 L 32 54 Z'),
  ),

  snowflake: wrap(
    (() => {
      const arms: string[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = i * 60;
        arms.push(stroke('M 50 50 L ' + polar(50, 50, 44, angle), 4));
        arms.push(
          stroke('M ' + polar(50, 50, 26, angle) + ' L ' + polar(50, 50, 38, angle - 26), 3),
        );
        arms.push(
          stroke('M ' + polar(50, 50, 26, angle) + ' L ' + polar(50, 50, 38, angle + 26), 3),
        );
      }
      return arms.join('');
    })(),
  ),

  atom: wrap(
    '<g transform="translate(50 50)">' +
      '<ellipse cx="0" cy="0" rx="44" ry="17" fill="none" stroke="#000" stroke-width="5" />' +
      '<ellipse cx="0" cy="0" rx="44" ry="17" fill="none" stroke="#000" stroke-width="5" transform="rotate(60)" />' +
      '<ellipse cx="0" cy="0" rx="44" ry="17" fill="none" stroke="#000" stroke-width="5" transform="rotate(120)" />' +
      '<circle cx="0" cy="0" r="9" />' +
      '</g>',
  ),

  lock: wrap(
    fill(
      'M22 46 H78 A6 6 0 0 1 84 52 V88 A6 6 0 0 1 78 94 H22 A6 6 0 0 1 16 88 V52 A6 6 0 0 1 22 46 Z',
    ) + fill('M32 46 V30 A18 18 0 0 1 68 30 V46 H56 V30 A6 6 0 0 0 44 30 V46 Z', true),
  ),

  bolt: wrap(fill('M56 4 L20 56 H44 L38 96 L80 40 H54 Z')),

  heart: wrap(
    fill('M50 92 C50 92 8 64 8 36 A22 22 0 0 1 50 26 A22 22 0 0 1 92 36 C92 64 50 92 50 92 Z'),
  ),

  star: wrap(fill(starPath(5, 46, 19))),

  burst: wrap(fill(starPath(12, 46, 26))),

  ring: wrap(fill(circlePath(50, 50, 44) + ' ' + circlePath(50, 50, 27), true)),

  droplet: wrap(fill('M50 6 C50 6 84 44 84 62 A34 34 0 0 1 16 62 C16 44 50 6 50 6 Z')),

  hexagon: wrap(fill('M50 5 L89 27 V73 L50 95 L11 73 V27 Z')),

  play: wrap(fill('M24 12 L88 50 L24 88 Z')),

  cloud: wrap(fill('M28 76 A20 20 0 0 1 30 36 A24 24 0 0 1 74 34 A18 18 0 0 1 76 76 Z')),

  brackets: wrap(stroke('M34 22 L12 50 L34 78', 11) + stroke('M66 22 L88 50 L66 78', 11)),

  spiral: wrap(
    stroke(
      'M50 50 A6 6 0 0 1 56 44 A14 14 0 0 1 70 58 A24 24 0 0 1 46 82 A34 34 0 0 1 12 48 A44 44 0 0 1 56 4',
      8,
    ),
  ),

  // Showpieces — intricate enough to be worth looking at.
  hilbert: wrap(stroke(hilbert(4), 1.6)),

  mandala: mandala(),

  spiro: wrap(stroke(spirograph(34, 9, 20), 1.4)),

  knot: wrap(stroke(torusKnot(3, 8), 1.5)),

  sunflower: phyllotaxis(),

  tree: fractalTree(),

  waves: interference(),
};

export const shapeNames = Object.keys(shapes);

/** The intricate ones, kept separate so they are easy to find in the panel. */
export const showpieces = ['hilbert', 'mandala', 'spiro', 'knot', 'sunflower', 'tree', 'waves'];

export const icons = shapeNames.filter((name) => !showpieces.includes(name));
