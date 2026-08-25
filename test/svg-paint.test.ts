import { describe, expect, it } from 'vitest';

import { parseSVG } from '../src/sources/svg';

/**
 * Stroked icon sets — Feather, Lucide, Heroicons outline, svgrepo's "Mixer
 * Tools" exports — all put `fill="none"` on the <svg> root and stroke on the
 * paths. Reading `fill` off the path alone returns null, so the path used to be
 * treated as a fill; filling an open outline path produces a blob.
 */
const STROKED_ICON = `<svg width="800px" height="800px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M4 14.75C3.37 13.87 3 12.8 3 11.64C3 9.2 4.8 6.93 7.5 6.5M12.5 12.99L10.5 21" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const STYLE_FILL = `<svg viewBox="0 0 100 100"><path d="M0 0 H100 V100 H0 Z" style="fill: #ff8800"/></svg>`;

const GRADIENT_FILL = `<svg viewBox="0 0 100 100">
<defs><radialGradient id="g"><stop offset="0" stop-color="#fff"/></radialGradient></defs>
<g><path d="M0 0 H100 V100 H0 Z" style="fill: url(#g)"/></g>
</svg>`;

const GROUP_INHERIT = `<svg viewBox="0 0 100 100">
<g fill="none" stroke="#0af" stroke-width="3">
  <path d="M10 10 L90 90"/>
</g>
</svg>`;

const INVISIBLE = `<svg viewBox="0 0 100 100" fill="none">
<path d="M10 10 L90 90"/>
<rect x="0" y="0" width="10" height="10" fill="#000"/>
</svg>`;

describe('presentation attribute inheritance', () => {
  it('treats a root fill="none" icon as stroked, not filled', () => {
    const { paths } = parseSVG(STROKED_ICON);
    expect(paths).toHaveLength(1);
    expect(paths[0]!.strokeWidth).toBe(2);
    expect(paths[0]!.evenOdd).toBeUndefined();
    expect(paths[0]!.color).toBe('#000000');
  });

  it('inherits paint from an intermediate group', () => {
    const { paths } = parseSVG(GROUP_INHERIT);
    expect(paths[0]!.strokeWidth).toBe(3);
    expect(paths[0]!.color).toBe('#0af');
  });

  it('reads fill out of a style attribute', () => {
    const { paths } = parseSVG(STYLE_FILL);
    expect(paths[0]!.color).toBe('#ff8800');
    expect(paths[0]!.strokeWidth).toBeUndefined();
  });

  it('keeps gradient geometry but does not claim a colour it cannot resolve', () => {
    const { paths } = parseSVG(GRADIENT_FILL);
    expect(paths).toHaveLength(1);
    expect(paths[0]!.color).toBeUndefined();
    expect(paths[0]!.strokeWidth).toBeUndefined();
  });

  it('drops geometry that nothing paints', () => {
    const { paths } = parseSVG(INVISIBLE);
    // The unpainted line is skipped; the filled rect survives.
    expect(paths).toHaveLength(1);
    expect(paths[0]!.color).toBe('#000');
  });

  it('always strokes a line or polyline, which have no interior', () => {
    const { paths } = parseSVG(
      '<svg viewBox="0 0 100 100"><polyline points="0,0 50,50 100,0" stroke="#333" stroke-width="4"/></svg>',
    );
    expect(paths[0]!.strokeWidth).toBe(4);
  });

  it('falls back to a visible stroke width when none is given', () => {
    const { paths } = parseSVG(
      '<svg viewBox="0 0 100 100" fill="none"><path d="M0 0 L100 100" stroke="#333"/></svg>',
    );
    expect(paths[0]!.strokeWidth).toBe(1);
  });
});
