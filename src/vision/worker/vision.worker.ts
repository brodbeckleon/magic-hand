/// <reference lib="webworker" />
// Vision worker: runs the MediaPipe landmarkers off the UI thread (module worker; MediaPipe's
// ES-module wasm loader is imported dynamically, see runner.ts).
import { VisionRunner } from "../runner.ts";
import type { FromWorker, ToWorker } from "./protocol.ts";

declare const self: DedicatedWorkerGlobalScope;

const runner = new VisionRunner();
const post = (m: FromWorker) => self.postMessage(m);

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      post({ type: "ready", delegate: await runner.init(msg.delegate, msg.numHands) });
    } else if (msg.type === "options") {
      await runner.setNumHands(msg.numHands);
    } else if (msg.type === "reset") {
      await runner.reset();
    } else if (msg.type === "frame") {
      try {
        const r = await runner.detect(msg);
        post({ type: "result", id: msg.id, ...r });
      } finally {
        msg.bitmap.close();
      }
    }
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
