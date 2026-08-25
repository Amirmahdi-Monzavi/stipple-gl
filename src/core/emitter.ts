import type { ShapeConfig, StippleEvent, StippleEventMap } from './types';

type Handler<E extends StippleEvent> = (payload: StippleEventMap[E]) => void;

/**
 * Event plumbing shared by both hosts.
 *
 * Also owns the morph bookkeeping that turns a continuously-changing progress
 * value into discrete start/end events, and resolves the promises `morphTo`
 * hands out. A morph that is superseded before it lands resolves as cancelled
 * rather than rejecting — being interrupted is normal, not exceptional.
 */
export class MorphEmitter {
  private handlers = new Map<StippleEvent, Set<Handler<never>>>();
  private inFlight = false;
  private pending: Array<() => void> = [];
  private startedFrom = 0;
  private target = 0;
  private shape: ShapeConfig | null = null;

  on<E extends StippleEvent>(event: E, handler: Handler<E>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  off<E extends StippleEvent>(event: E, handler: Handler<E>): void {
    this.handlers.get(event)?.delete(handler as Handler<never>);
  }

  emit<E extends StippleEvent>(event: E, payload: StippleEventMap[E]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    // Copy first: a handler is allowed to unsubscribe itself.
    for (const handler of [...set]) (handler as Handler<E>)(payload);
  }

  shapeChanged(shape: ShapeConfig | null): void {
    this.shape = shape;
    this.emit('shapechange', { shape });
  }

  /** Called when a new morph target is set. Returns a promise for its arrival. */
  begin(from: number, to: number, shape: ShapeConfig | null): Promise<void> {
    if (this.inFlight && to !== this.target) this.settle(true);

    this.shape = shape;
    this.target = to;

    if (from === to) return Promise.resolve();

    if (!this.inFlight) {
      this.inFlight = true;
      this.startedFrom = from;
      this.emit('morphstart', { from, to, shape });
    }

    return new Promise<void>((resolve) => {
      this.pending.push(resolve);
    });
  }

  progress(value: number): void {
    this.emit('morphprogress', { value });
  }

  /** Called when the morph value reaches its target. */
  arrived(value: number): void {
    if (!this.inFlight || value !== this.target) return;
    this.settle(false);
  }

  /** Resolve every waiter without emitting — used when the instance is torn down. */
  dispose(): void {
    this.settle(true);
    this.handlers.clear();
  }

  private settle(cancelled: boolean): void {
    if (!this.inFlight) return;
    this.inFlight = false;
    void this.startedFrom;
    this.emit('morphend', { shape: this.shape, cancelled });
    const waiters = this.pending;
    this.pending = [];
    for (const resolve of waiters) resolve();
  }
}
