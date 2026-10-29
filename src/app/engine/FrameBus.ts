/** Minimal pub/sub for per-frame data. Overlays subscribe and update the DOM directly, so a 30 fps
 *  stream does not re-render React. */
export class FrameBus<T> {
  private listeners = new Set<(value: T) => void>();
  latest: T | null = null;
  /** `replay`: new subscribers get the latest value at once (state); off for event streams. */
  private readonly replay: boolean;

  constructor(opts: { replay?: boolean } = {}) {
    this.replay = opts.replay ?? true;
  }

  subscribe(fn: (value: T) => void): () => void {
    this.listeners.add(fn);
    if (this.replay && this.latest !== null) fn(this.latest);
    return () => this.listeners.delete(fn);
  }

  publish(value: T): void {
    this.latest = value;
    for (const fn of this.listeners) fn(value);
  }
}
