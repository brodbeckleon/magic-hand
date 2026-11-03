import type { VisionBackend } from "../backend.ts";
import type { Delegate } from "../landmarkers.ts";
import type { DetectRequest, DetectResult } from "../runner.ts";
import type { FromWorker, ToWorker } from "./protocol.ts";

type Result = Extract<FromWorker, { type: "result" }>;

const emptyResult = (id: number): Result =>
  ({ type: "result", id, hands: [], poses: null, faces: null, handMs: 0, poseMs: 0, faceMs: 0, cropMs: 0 });

/** Promise-based handle to the vision worker. */
export class VisionWorker implements VisionBackend {
  readonly inWorker = true;
  private readonly worker: Worker;
  private pending = new Map<number, (r: Result) => void>();
  private terminated = false;
  private onReady: ((d: Delegate) => void) | null = null;
  private onInitError: ((e: Error) => void) | null = null;
  private nextId = 1;
  lastError: string | null = null;

  constructor() {
    this.worker = new Worker(new URL("./vision.worker.ts", import.meta.url), { type: "module" });
    // The script itself failed to load or evaluate (bundle error, unsupported engine): only an
    // error event fires, no message. Treat it like a failed init so the main-thread fallback runs.
    this.worker.onerror = (e) => this.fail(e.message || "vision worker failed to load");
    this.worker.onmessageerror = () => this.fail("vision worker message could not be read");
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === "ready") this.onReady?.(m.delegate);
      else if (m.type === "error") this.fail(m.message);
      else if (m.type === "result") {
        this.pending.get(m.id)?.(m);
        this.pending.delete(m.id);
      }
    };
  }

  private fail(message: string): void {
    this.lastError = message;
    if (this.onInitError) this.onInitError(new Error(message));
    else console.error("vision worker:", message);
    // A failed frame must not block the pipeline forever.
    this.resolvePending();
  }

  private resolvePending(): void {
    for (const [id, resolve] of this.pending) resolve(emptyResult(id));
    this.pending.clear();
  }

  init(delegate: Delegate, numHands: number): Promise<Delegate> {
    return new Promise((resolve, reject) => {
      this.onReady = (d) => {
        this.onReady = this.onInitError = null;
        resolve(d);
      };
      this.onInitError = (err) => {
        this.onReady = this.onInitError = null;
        reject(err);
      };
      this.send({ type: "init", delegate, numHands });
    });
  }

  detect(frame: DetectRequest): Promise<DetectResult> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      // A terminated worker would never answer, and a frame that cannot be posted never arrives:
      // either way answer "nothing found" so the caller is not stuck busy, and free the bitmap.
      if (this.terminated) {
        frame.bitmap.close();
        return resolve(emptyResult(id));
      }
      this.pending.set(id, resolve);
      try {
        this.worker.postMessage({ type: "frame", id, ...frame } satisfies ToWorker, [frame.bitmap]);
      } catch (err) {
        this.pending.delete(id);
        frame.bitmap.close();
        console.error("vision worker: frame not sent", err);
        resolve(emptyResult(id));
      }
    });
  }

  reset(): void {
    this.send({ type: "reset" });
  }

  setNumHands(numHands: number): void {
    this.send({ type: "options", numHands });
  }

  terminate(): void {
    this.terminated = true;
    this.worker.terminate();
    // A terminated worker never answers: callers awaiting detect() must not hang.
    this.resolvePending();
  }

  private send(m: ToWorker): void {
    this.worker.postMessage(m);
  }
}
