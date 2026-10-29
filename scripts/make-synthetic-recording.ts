// Writes a synthetic recording fixture (until real team recordings are added).
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { recordSession } from "../tests/support/recording.ts";
import { TraceBuilder } from "../tests/support/traces.ts";

const t = new TraceBuilder().calibrated();
for (let i = 0; i < 4; i++) t.move(-170, 6, 0.3).hold(1.2).move(160, -4, 0.3).hold(1.2);
t.move(-80, 90, 0.4).hold(0.5).move(60, -40, 0.6).hold(0.5);
writeFileSync(join(import.meta.dirname, "..", "tests", "fixtures", "recordings", "synthetic-session.jsonl.gz"), gzipSync(recordSession(t)));
console.log("written");
