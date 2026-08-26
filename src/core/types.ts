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
  /** The path's own fill (or stroke), kept so `color: { type: 'shape' }` works. */
  color?: string;
}

export interface SVGShapeData {
  paths: SVGPathData[];
  viewBox: string;
  width?: number;
  height?: number;
}

/**
 * Anything the 2D canvas can draw. In worker mode only an ImageBitmap survives
 * the postMessage boundary — the DOM element types do not exist there.
 */
export type ImageSource =
  ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | HTMLVideoElement;

/**
 * Which pixels of a raster source count as ink.
 *
 * `auto` inspects the image: transparency means the alpha channel is the mask,
 * and an opaque image falls back to luminance, keeping whichever of dark or
 * light is the minority — ink is what there is less of. Alpha masking an opaque
 * image is never what anyone wants, because every pixel qualifies and the
 * "shape" comes out as the source rectangle.
 */
export type ImageMask = 'auto' | 'alpha' | 'dark' | 'light';

/**
 * How the particle budget is spread across the ink.
 *
 * `uniform` gives every ink pixel the same chance, which is right for line art
 * but turns a flat-filled illustration into a silhouette: the interior of a
 * solid region carries no information, and most of the budget lands there.
 */
export type ShapeDetail = 'uniform' | 'edges' | 'density';

export interface ShapeConfig {
  /** Vector geometry. Empty when the shape is raster-backed. */
  paths: SVGPathData[];
  /**
   * A raster source to sample instead of `paths` — PNG, JPEG, WebP, AVIF, GIF,
   * a canvas, a video frame, or an SVG that has been rasterised so gradients
   * and filters survive. Takes precedence over `paths` when both are present.
   */
  image?: ImageSource;
  /** How ink is decided for `image`. Defaults to `'auto'`. */
  mask?: ImageMask;
  /** Cutoff for `mask`, 0..1. Defaults to 0.03 for alpha, 0.5 otherwise. */
  threshold?: number;
  /**
   * How the particle budget is spread across the ink. Defaults to `'uniform'`.
   * Applies to both vector and raster sources.
   */
  detail?: ShapeDetail;
  /**
   * How hard `detail` is applied, 0..1. `0` is uniform regardless, `1` is the
   * full weighting. Defaults to `0.85` — a little uniform keeps flat regions
   * from emptying out completely.
   */
  detailStrength?: number;
  viewBox?: string;
  scale?: number;
  position?: XY;
  count?: number;
  color?: string;
}

export interface MajorOptions {
  size: number;
  sizeVariation: number;
  sizeBias: number;
  follow: number;
  followSpread: number;
  velocity: number;
  damping: number;
  twinkle: number;
  depth: number;
  /**
   * Follow strength once fully morphed and undisturbed. This is a steady state,
   * not a transition — it lives here rather than under `transition` because it
   * describes how particles hold position when nothing is moving.
   */
  settle: number;
}

export interface MinorOptions {
  size: number;
  sizeBias: number;
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

/**
 * How one change of state is performed. The same seven knobs describe entering a
 * shape, leaving it, and swapping one shape for another — learn them once.
 */
export interface Choreography {
  /** Rate the progress value approaches its target, per frame at 60fps. */
  speed: number;
  /** Curve applied to each particle's own flight. */
  easing: Easing | EasingName;
  /**
   * How far apart particle launch times are pushed, 0 to 0.9. Each particle's
   * flight then lasts `1 - stagger`, so a high value means only a narrow band is
   * ever moving — that is what reads as a wipe. `0` means everything moves
   * together and `order` stops mattering.
   */
  stagger: number;
  /** Which direction the wavefront travels. Ignored when `stagger` is 0. */
  order: StaggerOrder;
  /** Noise displacement while in flight, peaking mid-move and fading on arrival. */
  turbulence: number;
  /** Brightness and size boost on particles the wavefront is currently crossing. */
  flash: number;
  /** Width of the flashing band, in progress units. */
  flashWidth: number;
}

/** Ready-made choreographies. Expand to a full {@link Choreography} at resolve time. */
export type ChoreographyName = 'condense' | 'uniform' | 'sweep' | 'burst';

export type ChoreographyConfig = ChoreographyName | DeepPartial<Choreography>;

export interface ResolvedChoreographies {
  enter: Choreography;
  exit: Choreography;
  /** `null` when `transition.swap` is `'none'` — retarget instantly. */
  swap: Choreography | null;
}

export interface TransitionOptions {
  /** Spread to shape. */
  enter: ChoreographyConfig;
  /** Shape back to spread. `'mirror'` reuses `enter` at a gentler speed. */
  exit: ChoreographyConfig | 'mirror';
  /** One shape to another. `'none'` retargets instantly, as v0 always did. */
  swap: ChoreographyConfig | 'none';
}

export type StaggerOrder = 'random' | 'x' | 'y' | 'radial' | 'radar';

export type AssignMode = 'angular' | 'index' | 'random';

/**
 * Pairs particles with sampled shape points. Write positions into `outX`/`outY`/
 * `outZ` at the index of the particle that should own each target.
 */
export type AssignFn = (
  points: Float32Array,
  count: number,
  spreadX: Float32Array,
  spreadY: Float32Array,
  outX: Float32Array,
  outY: Float32Array,
  outZ: Float32Array,
  depth: number,
) => void;

/** Solid colour, a ramp across the field, or the source SVG's own fills. */
export type ColorSpec =
  | string
  | { type: 'ramp'; from: string; to: string; by: 'depth' | 'radius' | 'index' }
  | { type: 'shape'; fallback: string };

export interface SpreadOptions {
  radius: number;
  flow: number;
  breathe: number;
  zoom: number;
  pan: XY;
  drift: number;
  speed: number;
  rotation: number;
  tilt: number;
  volume: number;
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

export interface SampledShape {
  points: Float32Array;
  /** Packed 0x00RRGGBB per point, or `null` when the source carried no fills. */
  colors: Uint32Array | null;
}

export interface ShapeSupport {
  sample(shape: ShapeConfig, count: number, width: number, height: number): SampledShape;
  bounds(points: Float32Array): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    cx: number;
    cy: number;
  };
  assign(
    mode: AssignMode | AssignFn,
    points: Float32Array,
    count: number,
    spreadX: Float32Array,
    spreadY: Float32Array,
    outX: Float32Array,
    outY: Float32Array,
    outZ: Float32Array,
    depth: number,
    order?: Uint32Array,
  ): void;
}

export interface StippleOptions {
  count: number;
  minorCount: number;
  mode: RenderMode;
  color: ColorSpec;
  minorColor: ColorSpec | null;
  background: string;
  opacity: number;
  blend: BlendMode;
  softness: number;
  core: number;
  dpr: number | 'auto';
  maxDpr: number;
  maxFps: number;
  autoPause: boolean;
  reducedMotion: 'respect' | 'ignore';
  adaptiveQuality: boolean;
  major: MajorOptions;
  minor: MinorOptions;
  emission: EmissionOptions;
  /**
   * How particles are paired with sampled shape points. A property of the shape,
   * not of the move, so it lives outside `transition` — it applies every time a
   * shape is set, including a swap.
   */
  assign: AssignMode | AssignFn;
  transition: TransitionOptions;
  spread: SpreadOptions;
  jelly: JellyOptions;
  pointer: PointerOptions;
  behaviors: Behavior[] | null;
  shapes: ShapeSupport | null;
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

export type EasingName =
  'linear' | 'inOutCubic' | 'inOutQuad' | 'outExpo' | 'outBack' | 'inOutElastic';

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
  spin: number;
  morph: number;
  targetMorph: number;
  hasShape: boolean;
  shapeColor: string | null;
  /**
   * Progress of a shape-to-shape swap, 0 at the outgoing shape and 1 at the
   * incoming one. Sits alongside `morph` rather than inside it: a swap can run
   * while the field is only half-morphed, and the two compose.
   */
  swap: number;
  swapping: boolean;
  /**
   * Choreographies resolved from `transition`, refreshed whenever options
   * change. Behaviours read these rather than re-expanding names every frame.
   */
  choreo: ResolvedChoreographies;
  viewport: Viewport;
  pointer: PointerState;
  shockwaves: Shockwave[];
  /**
   * Camera the renderer will apply this frame. `pack` needs it: culling happens
   * in viewport pixels, but the camera can pull off-viewport particles back into
   * view, and anything already culled would leave a visible rectangular crop.
   */
  camera: Camera;
}

export interface Camera {
  scale: number;
  offsetX: number;
  offsetY: number;
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
  flash: Float32Array;
  sizeRoll: Float32Array;
  brightRoll: Float32Array;
  delay: Float32Array;
  tx: Float32Array;
  ty: Float32Array;
  tz: Float32Array;
  spreadX: Float32Array;
  spreadY: Float32Array;
  spreadZ: Float32Array;
  shapeX: Float32Array;
  shapeY: Float32Array;
  shapeZ: Float32Array;
  /** Targets of the shape being swapped away from. */
  prevShapeX: Float32Array;
  prevShapeY: Float32Array;
  prevShapeZ: Float32Array;
  /** Ramp position 0..1 per particle, precomputed for `color` ramps. */
  tint: Float32Array;
  /** Packed 0x00RRGGBB sampled from the source SVG, when it carried fills. */
  shapeTint: Uint32Array;
  prevShapeTint: Uint32Array;
  hasShapeTint: boolean;
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
  sizeRoll: Float32Array;
  brightRoll: Float32Array;
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

/**
 * Coarse slot in the per-frame pipeline. Phases run in the order listed here.
 *
 * - `target`   decides where each particle is trying to be
 * - `deform`   warps those targets (breathing, jelly)
 * - `force`    pushes particles around (pointer, shockwaves)
 * - `integrate` turns velocity into position — anything after this writes
 *   positions directly and will not be damped
 * - `ambient`  everything independent of the major field (drift, emission)
 */
export type BehaviorPhase = 'target' | 'deform' | 'force' | 'integrate' | 'ambient';

export interface Behavior {
  name: string;
  /** Coarse slot. Prefer this over `order`. Defaults to `'force'`. */
  phase?: BehaviorPhase;
  /** Exact sort key. Wins over `phase` when both are given. */
  order?: number;
  init?(ctx: SimContext): void;
  step(ctx: SimContext): void;
  dispose?(): void;
}

export interface StippleEventMap {
  morphstart: { from: number; to: number; shape: ShapeConfig | null };
  morphprogress: { value: number };
  morphend: { shape: ShapeConfig | null; cancelled: boolean };
  shapechange: { shape: ShapeConfig | null };
}

export type StippleEvent = keyof StippleEventMap;

export interface MorphOptions {
  enter?: ChoreographyConfig;
  swap?: ChoreographyConfig | 'none';
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
  readonly majorCount: number;
  readonly minorCount: number;
  init(ctx: BackendContext): void;
  reallocate(count: number, minorCount: number, viewport: Viewport): void;
  layout(viewport: Viewport): void;
  precompute(options: StippleOptions): void;
  /**
   * Install a new shape. When `keepPrevious` is set the outgoing targets are
   * copied into the previous-shape buffers first, so a swap can interpolate
   * between them instead of retargeting instantly.
   */
  setShape(
    points: Float32Array | null,
    options: StippleOptions,
    colors?: Uint32Array | null,
    keepPrevious?: boolean,
  ): void;
  step(state: FrameState, options: StippleOptions): void;
  pack(target: PackTarget, options: StippleOptions, state: FrameState): number;
  dispose(): void;
}

export type BackendFactory = () => SimulationBackend;

export interface StippleInstance {
  readonly canvas: HTMLCanvasElement;
  readonly options: StippleOptions;
  setMorph(value: number): Promise<void>;
  getMorph(): number;
  setShape(shape: ShapeConfig | null, choreography?: ChoreographyConfig | 'none'): boolean;
  /** Set a shape and morph into it. Resolves on arrival, or when superseded. */
  morphTo(shape: ShapeConfig | null, options?: MorphOptions): Promise<void>;
  /** Return to the spread, animated. Resolves on arrival. */
  release(): Promise<void>;
  setOptions(config: StippleConfig): void;
  /** Drop every runtime tweak and rebuild from the defaults. */
  resetOptions(config?: StippleConfig): void;
  on<E extends StippleEvent>(event: E, handler: (payload: StippleEventMap[E]) => void): () => void;
  off<E extends StippleEvent>(event: E, handler: (payload: StippleEventMap[E]) => void): void;
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
