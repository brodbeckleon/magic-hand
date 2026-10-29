import type { DelegatePreference, Delegate } from "../landmarkers.ts";
import type { FromWorker, ToWorker } from "./protocol.ts";

type Result = Extract<FromWorker, { type: "result" }>;

/** Promise-based handle to the vision worker. */
export class VisionWorker {
  private readonly worker: Worker;
  private pending = new Map<number, (r: Result) => void>();
  private onReady: ((d: Delegate) => void) | null = null;
  private onInitError: ((e: Error) => void) | null = null;
  private nextId = 1;
  lastError: string | null = null;

  constructor() {
    this.worker = new Worker(new URL("./vision.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === "ready") this.onReady?.(m.delegate);
      else if (m.type === "error") {
        this.lastError = m.message;
        if (this.onInitError) this.onInitError(new Error(m.message));
        else console.error("vision worker:", m.message);
        // A failed frame must not block the pipeline forever.
        for (const [id, resolve] of this.pending) resolve({ type: "result", id, hands: [], poses: null, faces: null, handMs: 0, poseMs: 0, faceMs: 0 });
        this.pending.clear();
      } else if (m.type === "result") {
        this.pending.get(m.id)?.(m);
        this.pending.delete(m.id);
      }
    };
  }

  init(delegate: DelegatePreference, numHands: number): Promise<Delegate> {
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

  detect(frame: Omit<Extract<ToWorker, { type: "frame" }>, "type" | "id">): Promise<Result> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage({ type: "frame", id, ...frame } satisfies ToWorker, [frame.bitmap]);
    });
  }

  reset(): void {
    this.send({ type: "reset" });
  }

  setNumHands(numHands: number): void {
    this.send({ type: "options", numHands });
  }

  terminate(): void {
    this.worker.terminate();
  }

  private send(m: ToWorker): void {
    this.worker.postMessage(m);
  }
}
