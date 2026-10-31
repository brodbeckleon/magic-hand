// Replays the traces from prototype/tools/gen_golden.py through the TS port and compares every
// frame with what the original Python SwipeDetector produced.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PROTOTYPE_SWIPE_PARAMS } from "../../src/core/swipe/params.ts";
import { SwipeDetector } from "../../src/core/swipe/SwipeDetector.ts";
import type { Hand } from "../../src/core/types.ts";

interface Golden {
  name: string;
  frames: { t: number; hand: Hand | null }[];
  expected: {
    event: string | null;
    progress: number;
    calibrated: boolean;
    blocked: boolean;
    returning: boolean;
    calibProgress: number;
    historyLen: number;
    onset?: number;
    lastDx?: number;
  }[];
}

const dir = join(import.meta.dirname, "..", "fixtures", "golden");
const fixtures: Golden[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));

const EPS = 1e-9;

it("has golden fixtures", () => {
  expect(fixtures.length).toBeGreaterThanOrEqual(25);
});

describe.each(fixtures.map((f) => [f.name, f] as const))("golden %s", (_name, fx) => {
  it("matches the Python prototype frame by frame", () => {
    const det = new SwipeDetector(PROTOTYPE_SWIPE_PARAMS);
    fx.frames.forEach(({ t, hand }, i) => {
      const exp = fx.expected[i]!;
      const where = `frame ${i} (t=${t})`;
      const ev = det.update(t, hand);
      expect(ev, where).toBe(exp.event);
      expect(Math.abs(det.progress - exp.progress), `${where} progress`).toBeLessThan(EPS);
      expect(det.calibrated, where).toBe(exp.calibrated);
      expect(det.isBlocked(t), where).toBe(exp.blocked);
      expect(det.isReturning(t), where).toBe(exp.returning);
      expect(Math.abs(det.calibProgress(t) - exp.calibProgress), `${where} calibProgress`).toBeLessThan(EPS);
      expect(det.history.length, where).toBe(exp.historyLen);
      if (exp.onset !== undefined) {
        expect(Math.abs(det.onset - exp.onset), `${where} onset`).toBeLessThan(EPS);
        expect(Math.abs(det.lastDx - exp.lastDx!), `${where} lastDx`).toBeLessThan(EPS);
      }
    });
  });
});
