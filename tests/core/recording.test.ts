import { gunzipSync, gzipSync } from "node:zlib";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PIPELINE_SETTINGS } from "../../src/core/pipeline/GesturePipeline.ts";
import { encodeFrame, encodeLine, parseRecording } from "../../src/core/recording/format.ts";
import { diffEvents, replay } from "../../src/core/recording/replay.ts";
import { toFrames } from "../support/landmarks.ts";
import { recordSession } from "../support/recording.ts";
import { TraceBuilder } from "../support/traces.ts";

describe("recording", () => {
  const session = () => new TraceBuilder().calibrated().move(-160, 0, 0.25).hold(1.2).move(160, 4, 0.25).hold(0.5).move(-100, 100, 0.25).hold(0.4);

  it("round-trips through gzip and replays to the recorded events", () => {
    const gz = gzipSync(recordSession(session()));
    const rec = parseRecording(gunzipSync(gz).toString("utf8"));
    expect(rec.frames.length).toBe(session().frames.length);
    expect(rec.frames[0]!.poses).toHaveLength(1);
    expect(rec.frames[1]!.poses).toBeNull();
    const events = replay(rec);
    expect(events.map((e) => e.command ?? e.event)).toEqual(["speaker", "calibrated", "next", "prev", "ignored_return"]);
    expect(diffEvents(rec.events, events)).toEqual([]);
  });

  it("stores landmarks only, quantised to 4 decimals", () => {
    const line = recordSession(new TraceBuilder().hold(0.1)).split("\n")[1]!;
    const f = JSON.parse(line);
    expect(Object.keys(f).sort()).toEqual(["hands", "i", "poses", "t", "type"]);
    expect(Object.keys(f.hands[0]).sort()).toEqual(["lm", "score", "side"]);
    for (const [x] of f.hands[0].lm) expect(String(x).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(4);
  });

  it("settings overrides change the outcome (what-if analysis)", () => {
    const rec = parseRecording(recordSession(session()));
    const strict = replay(rec, { swipe: { ...DEFAULT_PIPELINE_SETTINGS.swipe, distance: 5 } });
    expect(strict.filter((e) => e.event === "trigger")).toEqual([]);
    expect(diffEvents(rec.events, strict).length).toBeGreaterThan(0);
  });

  it("applies recorded live parameter changes at their time", () => {
    let text = recordSession(new TraceBuilder().calibrated());
    const trace = new TraceBuilder(30, 11.8).move(-160, 0, 0.25).hold(0.3);
    text += encodeLine({ type: "settings", t: 11.7, patch: { reverse: true } });
    toFrames(trace.frames).forEach((f, i) => (text += encodeLine(encodeFrame(1000 + i, f))));
    expect(replay(parseRecording(text)).filter((e) => e.event === "trigger").map((e) => e.command)).toEqual(["prev"]);
  });

  it("applies a change recorded at a frame's time from the next frame on (as live)", () => {
    const text = recordSession(session());
    const first = replay(parseRecording(text)).find((e) => e.event === "trigger")!;
    expect(first.command).toBe("next");
    // Live, the change came after the frame at `first.t` had triggered.
    const rec = parseRecording(text + encodeLine({ type: "settings", t: first.t, patch: { reverse: true } }));
    expect(replay(rec).find((e) => e.event === "trigger")!.command).toBe("next");
  });

  it("a swipe override keeps the other fields of a recorded swipe change", () => {
    let text = recordSession(new TraceBuilder().calibrated());
    const trace = new TraceBuilder(30, 11.8).move(-160, 0, 0.25).hold(0.3);
    text += encodeLine({ type: "settings", t: 11.7, patch: { swipe: { ...DEFAULT_PIPELINE_SETTINGS.swipe, distance: 50 } } });
    toFrames(trace.frames).forEach((f, i) => (text += encodeLine(encodeFrame(1000 + i, f))));
    // As the replay CLI passes it (pnpm replay --settings '{"swipe":{"window":0.5}}'): only some fields.
    const override = { swipe: { window: DEFAULT_PIPELINE_SETTINGS.swipe.window } } as Parameters<typeof replay>[1];
    expect(replay(parseRecording(text), override).some((e) => e.event === "trigger")).toBe(false); // distance 50 kept
  });

  it("rejects files that are not recordings", () => {
    expect(() => parseRecording('{"type":"frame"}')).toThrow(/recording/);
  });
});

describe("recorded fixtures (regression)", () => {
  const dir = join(import.meta.dirname, "..", "fixtures", "recordings");
  const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl.gz"));

  it("has at least one fixture", () => expect(files.length).toBeGreaterThan(0));

  it.each(files)("%s replays to its recorded events", (file) => {
    const rec = parseRecording(gunzipSync(readFileSync(join(dir, file))).toString("utf8"));
    expect(diffEvents(rec.events, replay(rec))).toEqual([]);
  });
});
