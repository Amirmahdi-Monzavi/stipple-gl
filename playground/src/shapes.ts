const polar = (cx: number, cy: number, radius: number, degrees: number): string => {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return (cx + radius * Math.cos(radians)).toFixed(2) + ' ' + (cy + radius * Math.sin(radians)).toFixed(2);
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
  'M ' + (cx - r) + ' ' + cy +
  ' A ' + r + ' ' + r + ' 0 1 0 ' + (cx + r) + ' ' + cy +
  ' A ' + r + ' ' + r + ' 0 1 0 ' + (cx - r) + ' ' + cy + ' Z';

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
      stroke('M 50 ' + (66 - i * 4) + ' Q ' + (50 - spread) + ' ' + (64 - i * 6) + ' ' + (50 - spread) + ' ' + rise, 3),
    );
    parts.push(
      stroke('M 50 ' + (66 - i * 4) + ' Q ' + (50 + spread) + ' ' + (64 - i * 6) + ' ' + (50 + spread) + ' ' + rise, 3),
    );
  }

  const candles = [50, 39, 61, 28, 72, 17, 83, 6, 94];
  for (let i = 0; i < candles.length; i++) {
    const x = candles[i]!;
    const top = i === 0 ? 40 : 40 - Math.floor((i + 1) / 2) * 3;
    parts.push(fill('M ' + (x - 2.4) + ' ' + top + ' H ' + (x + 2.4) + ' V ' + (top - 9) + ' H ' + (x - 2.4) + ' Z'));
    parts.push(
      fill(
        'M ' + x + ' ' + (top - 10) +
        ' C ' + (x + 3.2) + ' ' + (top - 14) + ' ' + (x + 2.4) + ' ' + (top - 18) + ' ' + x + ' ' + (top - 20) +
        ' C ' + (x - 2.4) + ' ' + (top - 18) + ' ' + (x - 3.2) + ' ' + (top - 14) + ' ' + x + ' ' + (top - 10) + ' Z',
      ),
    );
  }

  return wrap(parts.join(''), '0 0 100 100');
};

export const shapes: Record<string, string> = {
  shield: wrap(fill('M50 6 L86 20 V48 C86 70 70 86 50 94 C30 86 14 70 14 48 V20 Z')),

  eye: wrap(
    fill(
      'M 4 50 Q 50 10 96 50 Q 50 90 4 50 Z M 16 50 Q 50 24 84 50 Q 50 76 16 50 Z',
      true,
    ) +
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
        arms.push(stroke('M ' + polar(50, 50, 26, angle) + ' L ' + polar(50, 50, 38, angle - 26), 3));
        arms.push(stroke('M ' + polar(50, 50, 26, angle) + ' L ' + polar(50, 50, 38, angle + 26), 3));
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
    fill('M22 46 H78 A6 6 0 0 1 84 52 V88 A6 6 0 0 1 78 94 H22 A6 6 0 0 1 16 88 V52 A6 6 0 0 1 22 46 Z') +
      fill('M32 46 V30 A18 18 0 0 1 68 30 V46 H56 V30 A6 6 0 0 0 44 30 V46 Z', true),
  ),

  bolt: wrap(fill('M56 4 L20 56 H44 L38 96 L80 40 H54 Z')),

  heart: wrap(fill('M50 92 C50 92 8 64 8 36 A22 22 0 0 1 50 26 A22 22 0 0 1 92 36 C92 64 50 92 50 92 Z')),

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
};

export const shapeNames = Object.keys(shapes);
