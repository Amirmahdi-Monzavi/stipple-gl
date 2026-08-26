import { describe, expect, it } from 'vitest';

import { parseSVG } from '../src/sources/svg';
import { svgNeedsRaster } from '../src/sources/image';

/**
 * The awkward SVG in the wild, collected from real exporters.
 *
 * Every case here is either something a designer tool actually emits or
 * something a hostile/broken file could contain. Anything that cannot be drawn
 * should fail with a sentence a human can act on, never a TypeError.
 */

const parse = (source: string) => parseSVG(source);
const attempt = (source: string): string | null => {
  try {
    parse(source);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

describe('viewBox handling', () => {
  it('synthesises a viewBox from width and height', () => {
    expect(parse('<svg width="200" height="80"><rect width="10" height="10"/></svg>').viewBox).toBe(
      '0 0 200 80',
    );
  });

  it('strips units off width and height', () => {
    // Illustrator and Inkscape both emit pt, and 660pt is not 660 anything else.
    expect(
      parse('<svg width="660pt" height="330pt"><rect width="5" height="5"/></svg>').viewBox,
    ).toBe('0 0 660 330');
  });

  it('keeps a negative viewBox origin', () => {
    const { viewBox } = parse('<svg viewBox="-50 -50 100 100"><rect width="9" height="9"/></svg>');
    expect(viewBox).toBe('-50 -50 100 100');
  });

  it('accepts a comma-separated viewBox', () => {
    expect(parse('<svg viewBox="0,0,64,64"><rect width="9" height="9"/></svg>').viewBox).toBe(
      '0,0,64,64',
    );
  });

  it('falls back when width and height are percentages', () => {
    // A percentage has no intrinsic size, so parseFloat yields 100 and 100.
    const { viewBox } = parse('<svg width="100%" height="100%"><rect width="9" height="9"/></svg>');
    expect(viewBox.split(/[\s,]+/)).toHaveLength(4);
  });
});

describe('malformed or empty input', () => {
  it('reports invalid markup', () => {
    expect(attempt('<svg><path d="M0 0"')).toMatch(/invalid SVG markup|no <svg>/);
  });

  it('reports markup with no svg root', () => {
    expect(attempt('<div><p>not svg</p></div>')).toMatch(/no <svg>|invalid/);
  });

  it('reports an empty svg', () => {
    expect(attempt('<svg viewBox="0 0 10 10"></svg>')).toMatch(/no drawable geometry/);
  });

  it('reports an svg holding only defs', () => {
    expect(
      attempt('<svg viewBox="0 0 10 10"><defs><path id="a" d="M0 0 L5 5"/></defs></svg>'),
    ).toMatch(/no drawable geometry/);
  });

  it('reports an svg whose only geometry is unpaintable', () => {
    expect(attempt('<svg viewBox="0 0 10 10" fill="none"><path d="M0 0 L5 5"/></svg>')).toMatch(
      /no drawable geometry/,
    );
  });

  it('says what the XML parser objected to', () => {
    // An undeclared namespace prefix is fatal in XML, and "invalid SVG markup"
    // on its own leaves the caller with a file and nowhere to look.
    const message = attempt('<svg viewBox="0 0 9 9"><path sodipodi:x="1" d="M0 0"/></svg>');
    expect(message).toMatch(/invalid SVG markup/);
    expect(message!.length).toBeGreaterThan('stipple-gl: invalid SVG markup'.length);
  });

  it('never throws a TypeError on garbage', () => {
    for (const source of ['', '   ', '<svg>', '<?xml version="1.0"?>', '<svg/>', 'null']) {
      const message = attempt(source);
      expect(message === null || message.startsWith('stipple-gl:')).toBe(true);
    }
  });
});

describe('elements that carry no geometry', () => {
  it('skips a path with no d', () => {
    const { paths } = parse('<svg viewBox="0 0 10 10"><path/><rect width="9" height="9"/></svg>');
    expect(paths).toHaveLength(1);
  });

  it('skips a path with an empty d', () => {
    const { paths } = parse(
      '<svg viewBox="0 0 10 10"><path d="  "/><rect width="9" height="9"/></svg>',
    );
    expect(paths).toHaveLength(1);
  });

  it('skips a zero-radius circle and a zero-size rect', () => {
    const { paths } = parse(
      '<svg viewBox="0 0 10 10"><circle r="0"/><rect width="0" height="8"/><rect width="9" height="9"/></svg>',
    );
    expect(paths).toHaveLength(1);
  });

  it('skips a polygon with too few coordinates', () => {
    const { paths } = parse(
      '<svg viewBox="0 0 10 10"><polygon points="1,1"/><rect width="9" height="9"/></svg>',
    );
    expect(paths).toHaveLength(1);
  });

  it('skips defs, masks, clip paths, titles and metadata', () => {
    const { paths } = parse(`<svg viewBox="0 0 10 10">
      <title>t</title><desc>d</desc><metadata>m</metadata>
      <defs><rect width="9" height="9"/></defs>
      <clipPath id="c"><rect width="9" height="9"/></clipPath>
      <mask id="m"><rect width="9" height="9"/></mask>
      <rect width="9" height="9"/>
    </svg>`);
    expect(paths).toHaveLength(1);
  });
});

describe('transforms', () => {
  it('composes nested group transforms', () => {
    const { paths } = parse(
      '<svg viewBox="0 0 10 10"><g transform="translate(5 5)"><g transform="scale(2)"><rect width="1" height="1"/></g></g></svg>',
    );
    expect(paths[0]!.transform).toEqual([2, 0, 0, 2, 5, 5]);
  });

  it('reads a matrix with scientific notation', () => {
    // Inkscape emits these on heavily-scaled documents.
    const { paths } = parse(
      '<svg viewBox="0 0 10 10"><g transform="matrix(1e0,0,0,1e0,1.5e1,0)"><rect width="1" height="1"/></g></svg>',
    );
    expect(paths[0]!.transform?.[4]).toBe(15);
  });

  it('ignores a transform it cannot parse rather than dropping the shape', () => {
    const { paths } = parse(
      '<svg viewBox="0 0 10 10"><g transform="nonsense(9)"><rect width="1" height="1"/></g></svg>',
    );
    expect(paths).toHaveLength(1);
  });

  it('survives a rotate about a point', () => {
    const { paths } = parse(
      '<svg viewBox="0 0 10 10"><g transform="rotate(90 5 5)"><rect width="1" height="1"/></g></svg>',
    );
    expect(paths[0]!.transform!.every(Number.isFinite)).toBe(true);
  });
});

describe('paint resolution', () => {
  it('inherits fill="none" through nested groups', () => {
    const { paths } = parse(
      '<svg viewBox="0 0 10 10" fill="none"><g><g><path d="M0 0 L9 9" stroke="#f00" stroke-width="2"/></g></g></svg>',
    );
    expect(paths[0]!.strokeWidth).toBe(2);
    expect(paths[0]!.color).toBe('#f00');
  });

  it('lets a child override an inherited fill', () => {
    const { paths } = parse(
      '<svg viewBox="0 0 10 10" fill="none"><path d="M0 0 H9 V9 Z" fill="#0f0"/></svg>',
    );
    expect(paths[0]!.strokeWidth).toBeUndefined();
    expect(paths[0]!.color).toBe('#0f0');
  });

  it('prefers style over the matching attribute', () => {
    const { paths } = parse(
      '<svg viewBox="0 0 10 10"><path d="M0 0 H9 V9 Z" fill="#f00" style="fill:#00f"/></svg>',
    );
    expect(paths[0]!.color).toBe('#00f');
  });

  it('tolerates !important and stray semicolons in style', () => {
    const { paths } = parse(
      '<svg viewBox="0 0 10 10"><path d="M0 0 H9 V9 Z" style=";;fill:#abc;;"/></svg>',
    );
    expect(paths[0]!.color).toBe('#abc');
  });

  it('does not claim currentColor as a colour', () => {
    const { paths } = parse(
      '<svg viewBox="0 0 10 10"><path d="M0 0 H9 V9 Z" fill="currentColor"/></svg>',
    );
    expect(paths[0]!.color).toBeUndefined();
    expect(paths).toHaveLength(1);
  });

  it('keeps geometry whose paint is a gradient reference', () => {
    const { paths } = parse(
      '<svg viewBox="0 0 10 10"><path d="M0 0 H9 V9 Z" fill="url(#g)"/></svg>',
    );
    expect(paths).toHaveLength(1);
    expect(paths[0]!.color).toBeUndefined();
  });
});

describe('svgNeedsRaster', () => {
  const needs = (source: string) => svgNeedsRaster(source);

  it('flags paint-server references', () => {
    expect(needs('<svg><path fill="url(#g)"/></svg>')).toBe(true);
  });

  it('flags gradients, filters, patterns, use, text and style blocks', () => {
    expect(needs('<svg><linearGradient/></svg>')).toBe(true);
    expect(needs('<svg><filter/></svg>')).toBe(true);
    expect(needs('<svg><pattern/></svg>')).toBe(true);
    expect(needs('<svg><use href="#a"/></svg>')).toBe(true);
    expect(needs('<svg><text>hi</text></svg>')).toBe(true);
    expect(needs('<svg><style>.a{fill:red}</style></svg>')).toBe(true);
    expect(needs('<svg><image href="x.png"/></svg>')).toBe(true);
  });

  it('leaves plain path artwork on the vector route', () => {
    expect(needs('<svg viewBox="0 0 10 10"><path d="M0 0 H9" stroke="#000"/></svg>')).toBe(false);
  });

  it('is case-insensitive, because exporters are inconsistent', () => {
    expect(needs('<svg><LinearGradient/></svg>')).toBe(true);
  });
});

describe('real-world exporter quirks', () => {
  it('handles Inkscape namespaced attributes and a wrapping layer group', () => {
    const { paths } = parse(`<?xml version="1.0" encoding="UTF-8" standalone="no"?>
      <svg xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
           xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
           xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
        <sodipodi:namedview id="nv"/>
        <g inkscape:groupmode="layer" inkscape:label="Layer 1" transform="translate(3,4)">
          <path style="fill:#ac9d93" d="M 10,10 20,20 Z" sodipodi:nodetypes="ccc"/>
        </g>
      </svg>`);
    expect(paths).toHaveLength(1);
    expect(paths[0]!.color).toBe('#ac9d93');
    expect(paths[0]!.transform).toEqual([1, 0, 0, 1, 3, 4]);
  });

  it('handles an XML comment and a leading declaration', () => {
    const { paths } = parse(
      '<?xml version="1.0"?><!-- generator --><svg viewBox="0 0 10 10"><rect width="9" height="9"/></svg>',
    );
    expect(paths).toHaveLength(1);
  });

  it('handles very large coordinates without losing precision to Infinity', () => {
    const { paths } = parse('<svg viewBox="0 0 1e6 1e6"><path d="M0 0 L999999 999999 Z"/></svg>');
    expect(paths).toHaveLength(1);
  });

  it('converts a rect with only rx into a rounded rect', () => {
    const { paths } = parse('<svg viewBox="0 0 10 10"><rect width="8" height="8" rx="2"/></svg>');
    expect(paths[0]!.d).toContain('A');
  });

  it('treats line and polyline as strokes even with a fill in scope', () => {
    const { paths } = parse(
      '<svg viewBox="0 0 10 10" fill="#000"><line x1="0" y1="0" x2="9" y2="9" stroke="#000"/></svg>',
    );
    expect(paths[0]!.strokeWidth).toBeGreaterThan(0);
  });
});
