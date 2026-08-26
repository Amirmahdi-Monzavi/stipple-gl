import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { POINT_FRAGMENT_SHADER, POINT_VERTEX_SHADER } from '../src/core/shaders';

const read = (relative: string): string => readFileSync(resolve(process.cwd(), relative), 'utf8');

const runtimeSource = read('src/core/runtime.ts');
const rendererSource = read('src/core/renderer.ts');

describe('WebGL context attributes', () => {
  it('never requests a desynchronized context', () => {
    expect(runtimeSource).not.toMatch(/desynchronized/);
  });

  it('requests a premultiplied-alpha context', () => {
    expect(runtimeSource).toMatch(/premultipliedAlpha:\s*true/);
  });

  it('does not allocate depth or stencil buffers it never uses', () => {
    expect(runtimeSource).toMatch(/depth:\s*false/);
    expect(runtimeSource).toMatch(/stencil:\s*false/);
  });
});

describe('alpha pipeline', () => {
  it('emits premultiplied colour from the fragment shader', () => {
    expect(POINT_FRAGMENT_SHADER).toMatch(
      /outColor\s*=\s*vec4\(\s*vColor\.rgb\s*\*\s*alpha\s*,\s*alpha\s*\)/,
    );
  });

  it('pairs premultiplied output with premultiplied blend factors', () => {
    expect(rendererSource).toMatch(/gl\.blendFunc\(gl\.ONE,\s*gl\.ONE_MINUS_SRC_ALPHA\)/);
    expect(rendererSource).toMatch(/gl\.blendFunc\(gl\.ONE,\s*gl\.ONE\)/);
    expect(rendererSource).not.toMatch(/gl\.blendFunc\(gl\.SRC_ALPHA/);
  });

  it('discards fragments outside the sprite disc', () => {
    expect(POINT_FRAGMENT_SHADER).toMatch(/discard/);
  });
});

describe('worker parity', () => {
  const engineSource = read('src/core/engine.ts');
  const threadSource = read('src/worker/thread.ts');

  it('creates the GL context in exactly one place', () => {
    expect(engineSource).not.toMatch(/getContext\(/);
    expect(threadSource).not.toMatch(/getContext\(/);
    expect(runtimeSource.match(/getContext\(/g)).toHaveLength(1);
  });

  it('keeps DOM APIs out of the worker thread', () => {
    for (const api of [
      'document',
      'window',
      'ResizeObserver',
      'IntersectionObserver',
      'DOMParser',
    ]) {
      expect(threadSource, api).not.toMatch(new RegExp('\b' + api + '\b'));
    }
  });

  it('keeps DOM APIs out of the shared runtime', () => {
    for (const api of ['document', 'window', 'ResizeObserver', 'IntersectionObserver']) {
      expect(runtimeSource, api).not.toMatch(new RegExp('\b' + api + '\b'));
    }
  });
});

describe('shader sources', () => {
  it('declare GLSL ES 300 on the first line', () => {
    expect(POINT_VERTEX_SHADER.startsWith('#version 300 es')).toBe(true);
    expect(POINT_FRAGMENT_SHADER.startsWith('#version 300 es')).toBe(true);
  });

  it('bind the vertex attributes to the locations the renderer configures', () => {
    expect(POINT_VERTEX_SHADER).toMatch(/layout\(location=0\) in vec2 aPos/);
    expect(POINT_VERTEX_SHADER).toMatch(/layout\(location=1\) in float aSize/);
    expect(POINT_VERTEX_SHADER).toMatch(/layout\(location=2\) in vec4 aColor/);
  });

  it('uses a 16-byte interleaved vertex stride', () => {
    expect(rendererSource).toMatch(/BYTES_PER_VERTEX = 16/);
    expect(rendererSource).toMatch(/vertexAttribPointer\(2, 4, gl\.UNSIGNED_BYTE, true/);
  });

  it('uploads with bufferSubData rather than reallocating each frame', () => {
    expect(rendererSource).toMatch(/bufferSubData/);
    const perFrameAlloc = /draw\([\s\S]*?bufferData\(/.test(rendererSource);
    expect(perFrameAlloc).toBe(false);
  });
});
