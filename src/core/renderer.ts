import { POINT_FRAGMENT_SHADER, POINT_VERTEX_SHADER } from './shaders';
import type { BlendMode, Viewport } from './types';

export const FLOATS_PER_VERTEX = 4;
export const BYTES_PER_VERTEX = 16;

const compile = (gl: WebGL2RenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '';
    gl.deleteShader(shader);
    throw new Error(`stipple-gl: shader compile failed: ${log}`);
  }
  return shader;
};

const link = (gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram => {
  const program = gl.createProgram();
  const vertex = compile(gl, gl.VERTEX_SHADER, vs);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? '';
    gl.deleteProgram(program);
    throw new Error(`stipple-gl: program link failed: ${log}`);
  }
  return program;
};

export class PointRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private uCamOffset: WebGLUniformLocation | null = null;
  private uCamScale: WebGLUniformLocation | null = null;
  private uAlpha: WebGLUniformLocation | null = null;
  private uSoftness: WebGLUniformLocation | null = null;
  private uCore: WebGLUniformLocation | null = null;
  private capacity = 0;
  private arrayBuffer: ArrayBuffer = new ArrayBuffer(0);

  floats: Float32Array = new Float32Array(0);
  colors: Uint32Array = new Uint32Array(0);
  maxPointSize = 64;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.setup();
  }

  private setup(): void {
    const gl = this.gl;
    this.program = link(gl, POINT_VERTEX_SHADER, POINT_FRAGMENT_SHADER);
    this.uCamOffset = gl.getUniformLocation(this.program, 'uCamOffset');
    this.uCamScale = gl.getUniformLocation(this.program, 'uCamScale');
    this.uAlpha = gl.getUniformLocation(this.program, 'uAlpha');
    this.uSoftness = gl.getUniformLocation(this.program, 'uSoftness');
    this.uCore = gl.getUniformLocation(this.program, 'uCore');

    this.vao = gl.createVertexArray();
    this.vbo = gl.createBuffer();

    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array | null;
    if (range && range.length > 1) this.maxPointSize = Math.min(range[1]!, 512);

    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
  }

  allocate(capacity: number): void {
    if (capacity <= this.capacity) return;
    const gl = this.gl;
    this.capacity = capacity;
    this.arrayBuffer = new ArrayBuffer(capacity * BYTES_PER_VERTEX);
    this.floats = new Float32Array(this.arrayBuffer);
    this.colors = new Uint32Array(this.arrayBuffer);

    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.arrayBuffer.byteLength, gl.DYNAMIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, BYTES_PER_VERTEX, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, BYTES_PER_VERTEX, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, BYTES_PER_VERTEX, 12);

    gl.bindVertexArray(null);
  }

  setBlend(mode: BlendMode): void {
    const gl = this.gl;
    if (mode === 'additive') {
      gl.blendFunc(gl.ONE, gl.ONE);
    } else {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
  }

  setViewport(viewport: Viewport): void {
    this.gl.viewport(0, 0, viewport.width * viewport.dpr, viewport.height * viewport.dpr);
  }

  clear(): void {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  draw(
    vertexCount: number,
    camOffsetX: number,
    camOffsetY: number,
    camScale: number,
    alpha: number,
    softness: number,
    core: number,
  ): void {
    if (vertexCount <= 0 || !this.program) return;
    const gl = this.gl;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.floats, 0, vertexCount * FLOATS_PER_VERTEX);

    gl.uniform2f(this.uCamOffset, camOffsetX, camOffsetY);
    gl.uniform1f(this.uCamScale, camScale);
    gl.uniform1f(this.uAlpha, alpha);
    gl.uniform1f(this.uSoftness, softness);
    gl.uniform1f(this.uCore, core);

    gl.drawArrays(gl.POINTS, 0, vertexCount);
    gl.bindVertexArray(null);
  }

  restore(): void {
    const capacity = this.capacity;
    this.capacity = 0;
    this.setup();
    if (capacity > 0) this.allocate(capacity);
  }

  dispose(): void {
    const gl = this.gl;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.vbo) gl.deleteBuffer(this.vbo);
    if (this.program) gl.deleteProgram(this.program);
    this.vao = null;
    this.vbo = null;
    this.program = null;
    this.arrayBuffer = new ArrayBuffer(0);
    this.floats = new Float32Array(0);
    this.colors = new Uint32Array(0);
    this.capacity = 0;
  }
}

export const packColor = (r: number, g: number, b: number, a: number): number =>
  ((a * 255) << 24) | ((b * 255) << 16) | ((g * 255) << 8) | (r * 255);
