export interface XY {
  x: number;
  y: number;
}

export interface XYZ extends XY {
  z: number;
}

export type RGB = [number, number, number];

export type RenderMode = 'background' | 'container' | 'page';

export type BlendMode = 'normal' | 'additive';

export type Matrix = [number, number, number, number, number, number];

export interface SVGPathData {
  d: string;
  evenOdd?: boolean;
  strokeWidth?: number;
  transform?: Matrix;
}

export interface SVGShapeData {
  paths: SVGPathData[];
  viewBox: string;
  width?: number;
  height?: number;
}

export interface ShapeConfig {
  paths: SVGPathData[];
  viewBox?: string;
  scale?: number;
  position?: XY;
  count?: number;
  color?: string;
}

export interface MajorOptions {
  size: number;
  sizeVariation: number;
  follow: number;
  followSpread: number;
  velocity: number;
  damping: number;
  twinkle: number;
  depth: number;
}

export interface MinorOptions {
  size: number;
  sizeJitter: number;
  sizeScale: number;
  speed: number;
  turbulence: number;
  drag: number;
  maxSpeed: number;
  opacity: XY;
  respawnChance: number;
}

export interface EmissionOptions {
  enabled: boolean;
  max: number;
  lifespan: number;
  speed: number;
  rate: number;
  burst: [number, number];
  spiral: number;
  turbulence: number;
}

export interface TransitionOptions {
  speed: number;
  easing: Easing;
  assign: 'angular' | 'index' | 'random';
  settle: number;
}

export interface SpreadOptions {
  radius: number;
  flow: number;
  breathe: number;
  zoom: number;
  pan: XY;
  drift: number;
  speed: number;
}

export interface JellyOptions {
  intensity: number;
  speed: number;
}

export interface PointerOptions {
  enabled: boolean;
  radius: number;
  force: number;
  falloff: number;
  press: number;
  shockwave: boolean;
  shockwaveForce: number;
  shockwaveSpeed: number;
  shockwaveLife: number;
  shockwaveThickness: number;
}

export interface StippleOptions {
  count: number;
  minorCount: number;
  mode: RenderMode;
  color: string;
  minorColor: string | null;
  background: string;
  opacity: number;
  blend: BlendMode;
  softness: number;
  dpr: number | 'auto';
  maxDpr: number;
  maxFps: number;
  autoPause: boolean;
  reducedMotion: 'respect' | 'ignore';
  adaptiveQuality: boolean;
  major: MajorOptions;
  minor: MinorOptions;
  emission: EmissionOptions;
  transition: TransitionOptions;
  spread: SpreadOptions;
  jelly: JellyOptions;
  pointer: PointerOptions;
  behaviors: Behavior[] | null;
  backend: BackendFactory | null;
  onReady: ((instance: StippleInstance) => void) | null;
  onError: ((error: Error) => void) | null;
}

export type StippleConfig = DeepPartial<StippleOptions>;

export type DeepPartial<T> = {
  [K in keyof T]?:
    | (T[K] extends (...args: never[]) => unknown
        ? T[K]
        : T[K] extends readonly unknown[]
          ? T[K]
          : T[K] extends object
            ? DeepPartial<T[K]>
            : T[K])
    | undefined;
};

export type Easing = (t: number) => number;

export interface Viewport {
  width: number;
  height: number;
  dpr: number;
}

export interface PointerState {
  x: number;
  y: number;
  active: boolean;
  down: boolean;
}

export interface Shockwave {
  x: number;
  y: number;
  time: number;
  strength: number;
}

export interface FrameState {
  time: number;
  dt: number;
  dtScale: number;
  frame: number;
  morph: number;
  targetMorph: number;
  hasShape: boolean;
  viewport: Viewport;
  pointer: PointerState;
  shockwaves: Shockwave[];
}

export interface SimContext {
  options: StippleOptions;
  state: FrameState;
  major: MajorState;
  minor: MinorState;
  emission: EmissionState;
}

export interface MajorState {
  count: number;
  capacity: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  seed: Float32Array;
  glow: Float32Array;
  tx: Float32Array;
  ty: Float32Array;
  tz: Float32Array;
  spreadX: Float32Array;
  spreadY: Float32Array;
  spreadZ: Float32Array;
  shapeX: Float32Array;
  shapeY: Float32Array;
  shapeZ: Float32Array;
  hasShape: boolean;
}

export interface MinorState {
  count: number;
  capacity: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  size: Float32Array;
  opacity: Float32Array;
  seed: Float32Array;
}

export interface EmissionState {
  count: number;
  capacity: number;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  size: Float32Array;
  baseSize: Float32Array;
  opacity: Float32Array;
  angle: Float32Array;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
}

export interface Behavior {
  name: string;
  order?: number;
  init?(ctx: SimContext): void;
  step(ctx: SimContext): void;
  dispose?(): void;
}

export interface BackendContext {
  gl: WebGL2RenderingContext;
  options: StippleOptions;
  viewport: Viewport;
}

export interface PackTarget {
  floats: Float32Array;
  colors: Uint32Array;
}

export interface SimulationBackend {
  readonly name: string;
  readonly capacity: number;
  init(ctx: BackendContext): void;
  reallocate(count: number, minorCount: number, viewport: Viewport): void;
  layout(viewport: Viewport): void;
  setShape(points: Float32Array | null, options: StippleOptions): void;
  step(state: FrameState, options: StippleOptions): void;
  pack(target: PackTarget, options: StippleOptions, state: FrameState): number;
  dispose(): void;
}

export type BackendFactory = () => SimulationBackend;

export interface StippleInstance {
  readonly canvas: HTMLCanvasElement;
  readonly options: StippleOptions;
  setMorph(value: number): void;
  getMorph(): number;
  setShape(shape: ShapeConfig | null): void;
  setOptions(config: StippleConfig): void;
  setCount(count: number, minorCount?: number): void;
  setPageHeight(height: number | null): void;
  pulse(x: number, y: number, strength?: number): void;
  start(): void;
  stop(): void;
  tick(dt?: number): void;
  resize(): void;
  destroy(): void;
  readonly running: boolean;
  readonly fps: number;
}
