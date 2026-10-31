// Replays developer recordings headlessly.
//
//   pnpm replay <file.jsonl.gz>...                 print the events
//   pnpm replay <file> --check                     compare with the events recorded live (exit 1 on drift)
//   pnpm replay <file> --settings override.json    what-if: other parameters, e.g. {"swipe":{"distance":3}}
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { PipelineSettings } from "../src/core/pipeline/GesturePipeline.ts";
import { parseRecording } from "../src/core/recording/format.ts";
import { diffEvents, replay } from "../src/core/recording/replay.ts";

const args = process.argv.slice(2);
const check = args.includes("--check");
const si = args.indexOf("--settings");
const override: Partial<PipelineSettings> = si >= 0 ? JSON.parse(readFileSync(args[si + 1]!, "utf8")) : {};
const files = args.filter((a, i) => !a.startsWith("--") && !(si >= 0 && i === si + 1));
if (!files.length) {
  console.error("usage: replay-cli <recording.jsonl.gz>... [--check] [--settings override.json]");
  process.exit(2);
}

let failed = false;
for (const file of files) {
  const raw = readFileSync(file);
  const text = (file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8");
  const rec = parseRecording(text);
  const events = replay(rec, override);
  const t0 = rec.frames[0]?.t ?? 0;
  const dur = (rec.frames.at(-1)?.t ?? t0) - t0;
  const triggers = events.filter((e) => e.event === "trigger");
  console.log(`\n${file}: ${rec.frames.length} frames, ${dur.toFixed(1)} s, ${triggers.length} triggers, ${rec.marks.length} marks`);
  for (const e of events) console.log(`  ${(e.t - t0).toFixed(3).padStart(8)} s  ${e.command ?? e.event}`);
  for (const m of rec.marks) console.log(`  ${(m.t - t0).toFixed(3).padStart(8)} s  [marked ${m.kind}]`);
  if (check) {
    const diff = diffEvents(rec.events, events);
    if (diff.length) {
      failed = true;
      console.log("  DIFFERS from the live session:");
      for (const d of diff) console.log(`    ${d}`);
    } else {
      console.log("  matches the live session");
    }
  }
}
process.exit(failed ? 1 : 0);
