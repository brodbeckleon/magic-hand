import { DEFAULT_PIPELINE_SETTINGS, GesturePipeline } from "../../src/core/pipeline/GesturePipeline.ts";
import { encodeFrame, encodeLine, SCHEMA, type RecHeader } from "../../src/core/recording/format.ts";
import { toReplayEvent } from "../../src/core/recording/replay.ts";
import { toFrames } from "./landmarks.ts";
import { person } from "./poses.ts";
import type { TraceBuilder } from "./traces.ts";

const header = (): RecHeader => ({
  type: "header", schema: SCHEMA, app: "test", created: "2026-10-29T12:00:00", platform: "test",
  src: { w: 640, h: 480 }, mirror: true, handednessSwap: true, zone: null, settings: DEFAULT_PIPELINE_SETTINGS,
});

/** Records a synthetic session exactly like the app does: header, frames, live events. */
export function recordSession(trace: TraceBuilder): string {
  const frames = toFrames(trace.frames);
  const p = new GesturePipeline();
  let text = encodeLine(header());
  frames.forEach((raw, i) => {
    const f = i % 10 === 0 ? { ...raw, poses: [person(0.5, 0.3, 0.1)] } : raw;
    text += encodeLine(encodeFrame(i, f));
    for (const e of p.step(f).events) text += encodeLine({ type: "event", ...toReplayEvent(e) });
  });
  return text;
}
