import { VisionWorker } from "../../src/vision/worker/VisionWorker.ts";

/** Stand-in for the browser Worker: records posts, can be told to throw (e.g. a detached bitmap). */
class FakeWorker {
  posted: unknown[] = [];
  throwOnPost = false;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage(m: unknown): void {
    if (this.throwOnPost) throw new DOMException("detached", "DataCloneError");
    this.posted.push(m);
  }
  terminate(): void {}
}

let fake: FakeWorker;
beforeEach(() => {
  vi.stubGlobal("Worker", function () {
    fake = new FakeWorker();
    return fake;
  });
});
afterEach(() => vi.unstubAllGlobals());

const frame = () => {
  const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
  return { bitmap, req: { bitmap } as unknown as Parameters<VisionWorker["detect"]>[0] };
};

describe("VisionWorker.detect", () => {
  it("answers 'nothing found' after terminate instead of hanging, and frees the frame", async () => {
    const w = new VisionWorker();
    w.terminate();
    const f = frame();
    await expect(w.detect(f.req)).resolves.toMatchObject({ hands: [], poses: null });
    expect(f.bitmap.close).toHaveBeenCalled();
    expect(fake.posted).toEqual([]);
  });

  it("answers 'nothing found' when the frame cannot be posted, and frees the frame", async () => {
    const w = new VisionWorker();
    fake.throwOnPost = true;
    const f = frame();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(w.detect(f.req)).resolves.toMatchObject({ hands: [] });
    expect(f.bitmap.close).toHaveBeenCalled();
  });

  it("delivers the worker's answer for the frame", async () => {
    const w = new VisionWorker();
    const p = w.detect(frame().req);
    const id = (fake.posted[0] as { id: number }).id;
    fake.onmessage!({ data: { type: "result", id, hands: [], poses: [], faces: null, handMs: 3, poseMs: 0, faceMs: 0, cropMs: 0 } } as MessageEvent);
    await expect(p).resolves.toMatchObject({ handMs: 3 });
  });
});
