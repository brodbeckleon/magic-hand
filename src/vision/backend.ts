import type { Delegate } from "./landmarkers.ts";
import { VisionRunner, type DetectRequest, type DetectResult } from "./runner.ts";

/** Where frames are analysed: the vision worker, or the main thread as a fallback. */
export interface VisionBackend {
  readonly inWorker: boolean;
  init(delegate: Delegate, numHands: number): Promise<Delegate>;
  detect(req: DetectRequest): Promise<DetectResult>;
  reset(): void;
  setNumHands(n: number): void;
  terminate(): void;
}

/** Same analysis as the worker, on the main thread (WebKit without WebGL in workers). */
export class MainThreadVision implements VisionBackend {
  readonly inWorker = false;
  private readonly runner = new VisionRunner();

  init(delegate: Delegate, numHands: number): Promise<Delegate> {
    return this.runner.init(delegate, numHands);
  }

  async detect(req: DetectRequest): Promise<DetectResult> {
    try {
      return await this.runner.detect(req);
    } finally {
      req.bitmap.close();
    }
  }

  reset(): void {
    void this.runner.reset();
  }

  setNumHands(n: number): void {
    void this.runner.setNumHands(n);
  }

  terminate(): void {
    this.runner.close();
  }
}
