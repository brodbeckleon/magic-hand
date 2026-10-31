import type { Hand, PreferredHand, Side } from "../types.ts";
import { DEFAULT_SWIPE_PARAMS, type SwipeParams } from "./params.ts";
import { SwipeDetector, type SwipeEvent } from "./SwipeDetector.ts";

/** |progress| above which a hand takes the lock in "either" mode. */
export const LOCK_PROGRESS = 0.3;
/** The lock is released after this long without noticeable progress. */
export const LOCK_IDLE_RELEASE = 0.6;
const IDLE_PROGRESS = 0.1;

export interface SideEvent {
  side: Side;
  event: SwipeEvent;
  detector: SwipeDetector;
}

/**
 * One presenter's two hands. Each hand has its own SwipeDetector so that swapping hands never mixes
 * two trajectories. The preferred-hand setting decides which hands may trigger:
 *   - "left" / "right": only that hand is fed; the other one is ignored entirely,
 *   - "either": the first hand that clearly starts a swipe takes the lock; the other hand's partial
 *     movement is discarded until the lock is released (trigger, or no progress for a while).
 * A trigger on one hand starts the return period on both, so bringing the other hand back after a
 * swipe does not fire either. Calibration with one hand arms both.
 */
export class HandLock {
  readonly detectors: Record<Side, SwipeDetector>;
  preferred: PreferredHand;
  locked: Side | null = null;
  private lastProgressAt = -Infinity;
  private lastSeenSide: Side = "right";

  constructor(preferred: PreferredHand = "either", params: Partial<SwipeParams> = DEFAULT_SWIPE_PARAMS) {
    this.preferred = preferred;
    this.detectors = { left: new SwipeDetector(params), right: new SwipeDetector(params) };
  }

  get calibrated(): boolean {
    return this.detectors.left.calibrated || this.detectors.right.calibrated;
  }

  /** The detector to show in the UI (trail, progress, calibration). */
  get primary(): SwipeDetector {
    if (this.locked) return this.detectors[this.locked];
    if (this.preferred !== "either") return this.detectors[this.preferred];
    return this.detectors[this.lastSeenSide];
  }

  setParams(patch: Partial<SwipeParams>): void {
    this.detectors.left.setParams(patch);
    this.detectors.right.setParams(patch);
  }

  setPreferred(preferred: PreferredHand): void {
    if (preferred === this.preferred) return;
    this.preferred = preferred;
    this.locked = null;
  }

  resetCalibration(): void {
    this.detectors.left.resetCalibration();
    this.detectors.right.resetCalibration();
    this.locked = null;
  }

  /** Arms both hands without the hold-still step (e.g. after a palm claim, which is also a hold). */
  forceCalibrated(t: number): void {
    this.detectors.left.forceCalibrated(t);
    this.detectors.right.forceCalibrated(t);
  }

  isAllowed(side: Side): boolean {
    return this.preferred === "either" || this.preferred === side;
  }

  update(t: number, hands: Partial<Record<Side, Hand>>): SideEvent[] {
    const out: SideEvent[] = [];
    const wasCalibrated = this.calibrated;
    if (hands.left && !hands.right) this.lastSeenSide = "left";
    else if (hands.right && !hands.left) this.lastSeenSide = "right";

    for (const side of ["left", "right"] as const) {
      const det = this.detectors[side];
      let hand = hands[side] ?? null;
      if (!this.isAllowed(side)) hand = null;
      if (this.locked && this.locked !== side) hand = null; // other hand's movement does not count
      const event = det.update(t, hand);
      if (event) out.push({ side, event, detector: det });
    }

    // Calibrating one hand arms the person (MHR01 is about the person, not a specific hand).
    const cal = out.find((e) => e.event === "calibrated");
    if (cal && !wasCalibrated) {
      const other = this.detectors[cal.side === "left" ? "right" : "left"];
      if (!other.calibrated) other.forceCalibrated(t);
    }

    // At most one trigger per frame; a trigger starts the return period on the other hand.
    const triggers = out.filter((e) => e.event === "next" || e.event === "prev");
    if (triggers.length) {
      const winner = triggers.find((e) => e.side === this.locked) ?? triggers[0]!;
      const otherSide: Side = winner.side === "left" ? "right" : "left";
      this.detectors[otherSide].enterReturn(t);
      this.locked = null;
      return out.filter((e) => !(e.event === "next" || e.event === "prev") || e === winner);
    }

    this.updateLock(t, out);
    return out;
  }

  private updateLock(t: number, events: SideEvent[]): void {
    if (this.preferred !== "either") {
      this.locked = null;
      return;
    }
    if (this.locked) {
      const det = this.detectors[this.locked];
      if (events.some((e) => e.side === this.locked)) {
        this.locked = null; // ignored_dir / ignored_return ended the gesture
        return;
      }
      if (Math.abs(det.progress) > IDLE_PROGRESS) this.lastProgressAt = t;
      if (t - this.lastProgressAt > LOCK_IDLE_RELEASE) this.locked = null;
      return;
    }
    const candidates = (["left", "right"] as const).filter(
      (s) => Math.abs(this.detectors[s].progress) > LOCK_PROGRESS,
    );
    if (candidates.length) {
      this.locked = candidates.sort(
        (a, b) => Math.abs(this.detectors[b].progress) - Math.abs(this.detectors[a].progress),
      )[0]!;
      this.lastProgressAt = t;
    }
  }
}
