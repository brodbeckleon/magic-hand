import { due, govern, initialGovernor, INTERVAL_S, type GovernorState, type RateMode } from "../pipeline/governor.ts";
import type { FrameObs } from "../types.ts";

/** What the governor needs from an analysed frame. */
export interface GovernedResult {
  hands: number;
  persons: number;
  pending: boolean;
}

export interface Decimated {
  analysed: number;
  skipped: number;
  /** Frames analysed in each mode. */
  modes: Record<RateMode, number>;
}

/**
 * Feeds `frames` to `analyse` the way the app does with the adaptive analysis rate: a frame that is
 * not due in the current mode is skipped, and every analysed frame updates the mode. `analyse`
 * runs the pipeline and reports what it saw (replays, tests).
 */
export function decimate(frames: readonly FrameObs[], analyse: (f: FrameObs) => GovernedResult): Decimated {
  const out: Decimated = { analysed: 0, skipped: 0, modes: { active: 0, watch: 0, empty: 0 } };
  let gov: GovernorState | null = null;
  let last = -Infinity;
  for (const f of frames) {
    const mode = (gov ?? initialGovernor(f.t)).mode;
    if (!due(f.t, last, INTERVAL_S[mode])) {
      out.skipped++;
      continue;
    }
    last = f.t;
    out.analysed++;
    out.modes[mode]++;
    gov = govern(gov, { t: f.t, ...analyse(f), force: false });
  }
  return out;
}
