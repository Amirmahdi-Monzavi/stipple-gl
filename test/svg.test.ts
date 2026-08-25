import { describe, expect, it } from 'vitest';

import { parseSVG, parseTransform, shapeElementToPath } from '../src/sources/svg';

const svg = (body: string, attrs = 'viewBox="0 0 100 100"') =>
  '<svg xmlns="http://www.w3.org/2000/svg" ' + attrs + '>' + body + '</svg>';

const element = (markup: string): Element => {
  const doc = new DOMParser().parseFromString(svg(markup), 'image/svg+xml');
  return doc.querySelector('svg')!.firstElementChild!;
};

describe('parseSVG', () => {
  it('extracts path data and viewBox', () => {
    const result = parseSVG(svg('<path d="M0 0 L10 10 Z" />'));
    expect(result.viewBox).toBe('0 0 100 100');
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0]!.d).toBe('M0 0 L10 10 Z');
  });

  it('synthesises a viewBox from width and height when missing', () => {
    const result = parseSVG(svg('<path d="M0 0 L1 1" />', 'width="64" height="32"'));
    expect(result.viewBox).toBe('0 0 64 32');
  });

  it('marks even-odd fills', () => {
    const result = parseSVG(svg('<path d="M0 0 L1 1" fill-rule="evenodd" />'));
    expect(result.paths[0]!.evenOdd).toBe(true);
  });

  it('treats an unfilled stroked path as a stroke', () => {
    const result = parseSVG(
      svg('<path d="M0 0 L1 1" fill="none" stroke="#000" stroke-width="4" />'),
    );
    expect(result.paths[0]!.strokeWidth).toBe(4);
    expect(result.paths[0]!.evenOdd).toBeUndefined();
  });

  it('converts primitive shapes into paths', () => {
    const result = parseSVG(
      svg('<circle cx="5" cy="5" r="3" /><rect x="0" y="0" width="10" height="4" />'),
    );
    expect(result.paths).toHaveLength(2);
    expect(result.paths[0]!.d.startsWith('M 2 5 A 3 3')).toBe(true);
    expect(result.paths[1]!.d).toBe('M 0 0 H 10 V 4 H 0 Z');
  });

  it('walks into groups and composes nested transforms', () => {
    const result = parseSVG(
      svg('<g transform="translate(10 0)"><g transform="scale(2)"><path d="M0 0 L1 1"/></g></g>'),
    );
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0]!.transform).toEqual([2, 0, 0, 2, 10, 0]);
  });

  it('ignores defs, masks and clip paths', () => {
    const result = parseSVG(
      svg('<defs><path d="M9 9 L9 9"/></defs><clipPath><rect width="4" height="4"/></clipPath><path d="M0 0 L1 1"/>'),
    );
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0]!.d).toBe('M0 0 L1 1');
  });

  it('rejects markup with no drawable geometry', () => {
    expect(() => parseSVG(svg('<title>empty</title>'))).toThrow(/no drawable geometry/);
  });

  it('rejects a document without an svg root', () => {
    expect(() => parseSVG('<div></div>')).toThrow();
  });
});

describe('parseTransform', () => {
  it('returns identity for null and empty input', () => {
    expect(parseTransform(null)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(parseTransform('')).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('parses translate', () => {
    expect(parseTransform('translate(4 8)')).toEqual([1, 0, 0, 1, 4, 8]);
  });

  it('parses uniform scale from a single argument', () => {
    expect(parseTransform('scale(3)')).toEqual([3, 0, 0, 3, 0, 0]);
  });

  it('parses matrix', () => {
    expect(parseTransform('matrix(1 2 3 4 5 6)')).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('composes several transforms left to right', () => {
    const result = parseTransform('translate(10 0) scale(2)');
    expect(result).toEqual([2, 0, 0, 2, 10, 0]);
  });

  it('rotates about a given origin', () => {
    const result = parseTransform('rotate(90 5 5)');
    expect(result[0]).toBeCloseTo(0, 6);
    expect(result[1]).toBeCloseTo(1, 6);
    expect(result[4]).toBeCloseTo(10, 6);
    expect(result[5]).toBeCloseTo(0, 6);
  });
});

describe('shapeElementToPath', () => {
  it('rejects degenerate geometry', () => {
    expect(shapeElementToPath(element('<circle cx="1" cy="1" r="0" />'))).toBeNull();
    expect(shapeElementToPath(element('<rect width="0" height="5" />'))).toBeNull();
    expect(shapeElementToPath(element('<polygon />'))).toBeNull();
  });

  it('closes polygons but leaves polylines open', () => {
    const polygon = shapeElementToPath(element('<polygon points="0,0 1,0 1,1" />'));
    const polyline = shapeElementToPath(element('<polyline points="0,0 1,0 1,1" />'));
    expect(polygon!.endsWith(' Z')).toBe(true);
    expect(polyline!.endsWith(' Z')).toBe(false);
  });

  it('mirrors rx onto ry when ry is absent', () => {
    const path = shapeElementToPath(element('<rect width="10" height="10" rx="2" />'));
    expect(path).toContain('A 2 2');
  });

  it('clamps corner radii to half the side length', () => {
    const path = shapeElementToPath(element('<rect width="10" height="10" rx="50" />'));
    expect(path).toContain('A 5 5');
  });
});
