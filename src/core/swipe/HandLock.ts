import type { Hand, PreferredHand, Side } from "../types.ts";
import { DEFAULT_SWIPE_PARAMS, type SwipeParams } from "./params.ts";
import { SwipeDetector, type HistoryEntry, type SwipeEvent } from "./SwipeDetector.ts";

/** |progress| above which a hand takes the lock in "either" mode. */
export const LOCK_PROGRESS = 0.3;
/** The lock is released after this long without noticeable progress. */
export const LOCK_IDLE_RELEASE = 0.6;
const IDLE_PROGRESS = 0.1;

export interface SideEvent {
  side: Side;
  event: SwipeEvent;
  detector: SwipeDetector;
  /** Triggers: start of the movement and its distance in hand lengths (the detector may have moved on). */
  onset?: number;
  lastDx?: number;
}

/** Palm positions kept per hand for the wind-up check (s). */
const TRAIL_S = 1.5;

/** A trigger held back to see whether it was only a wind-up. */
interface Held {
  ev: SideEvent;
  t: number;
  /** +1 = the swipe went right, -1 = left. */
  dir: number;
  /** Farthest palm position in the swipe's direction since it triggered. */
  extreme: HistoryEntry;
  /** Top speed of the swipe, hand lengths per s. */
  peak: number;
  /** Set once the hand turned around: from then on the movement back is watched. */
  turnedAt: number | null;
}

const isTrigger = (e: SideEvent) => e.event === "next" || e.event === "prev";

/** Top horizontal palm speed between t0 and t1, in hand lengths per s. */
export function peakSpeed(trail: readonly HistoryEntry[], t0: number, t1: number): number {
  let peak = 0;
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1]!;
    const b = trail[i]!;
    if (a.t < t0 - 1e-9 || b.t > t1 + 1e-9 || b.t <= a.t) continue;
    peak = Math.max(peak, Math.abs(b.hand.cx - a.hand.cx) / ((b.t - a.t) * b.hand.scale));
  }
  return peak;
}

/**
 * One presenter's two hands. Each hand has its own SwipeDetector so that swapping hands never mixes
 * two trajectories. The preferred-hand setting decides which hands may trigger:
 *   - "left" / "right": only that hand is fed; the other one is ignored entirely,
 *   - "either": the first hand that clearly starts a swipe takes the lock; the other hand's partial
 *     movement is discarded until the lock is released (trigger, or no progress for a while).
 * A trigger on one hand starts the return period on both, so bringing the other hand back after a
 * swipe does not fire either. Calibration with one hand arms both.
 *
 * Wind-ups: people often swing the other way before a swipe (most of all before "back"). A big
 * enough swing triggers on its own, so each trigger is held back for `windupHold`. If the hand
 * turns around at once (`windupReverse`), the movement back is watched like a new swipe; it wins
 * when it is at least `windupRatio` times as fast, otherwise the first swipe is sent after all.
 */
export class HandLock {
  readonly detectors: Record<Side, SwipeDetector>;
  preferred: PreferredHand;
  locked: Side | null = null;
  private lastProgressAt = -Infinity;
  private lastSeenSide: Side = "right";
  private readonly trail: Record<Side, HistoryEntry[]> = { left: [], right: [] };
  private held: Held | null = null;

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
    this.held = null;
  }

  /** A trigger is being held back (wind-up check): the gesture is not over yet. */
  get holding(): boolean {
    return this.held !== null;
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
    return this.gate(t, this.step(t, hands));
  }

  private step(t: number, hands: Partial<Record<Side, Hand>>): SideEvent[] {
    const out: SideEvent[] = [];
    const wasCalibrated = this.calibrated;
    if (hands.left && !hands.right) this.lastSeenSide = "left";
    else if (hands.right && !hands.left) this.lastSeenSide = "right";

    for (const side of ["left", "right"] as const) {
      const det = this.detectors[side];
      let hand = hands[side] ?? null;
      if (!this.isAllowed(side)) hand = null;
      if (this.locked && this.locked !== side) hand = null; // other hand's movement does not count
      const trail = this.trail[side];
      if (hand) trail.push({ t, hand });
      while (trail.length && trail[0]!.t < t - TRAIL_S) trail.shift();
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

  /** Holds triggers back for the wind-up check and releases them (or the swipe after the turn). */
  private gate(t: number, out: SideEvent[]): SideEvent[] {
    const res: SideEvent[] = [];
    for (const e of out) {
      if (!isTrigger(e)) {
        res.push(e);
        continue;
      }
      const d = e.detector;
      const ev: SideEvent = { ...e, onset: d.onset, lastDx: d.lastDx };
      const h = this.held;
      if (h && h.turnedAt !== null && h.ev.side === e.side) {
        // The movement after the turn is a swipe too: the stronger one is meant.
        this.held = null;
        if (peakSpeed(this.trail[e.side], h.turnedAt, t) >= d.params.windupRatio * h.peak) {
          res.push({ ...h.ev, event: "ignored_windup" }, ev);
        } else {
          d.enterReturn(t);
          res.push(h.ev, { side: e.side, event: "ignored_return", detector: d });
        }
        continue;
      }
      if (h) {
        // The other hand (rare: it is in its return period): the held swipe goes first.
        this.held = null;
        res.push(h.ev);
      }
      if (d.params.windupHold <= 0) {
        res.push(ev);
        continue;
      }
      const trail = this.trail[e.side];
      this.held = { ev, t, dir: Math.sign(d.lastDx), extreme: trail[trail.length - 1]!, peak: peakSpeed(trail, d.onset, t), turnedAt: null };
    }
    const h = this.held;
    if (!h || h.t === t) return res;
    const d = h.ev.detector;
    const p = d.params;
    if (h.turnedAt === null) {
      const trail = this.trail[h.ev.side];
      const last = trail[trail.length - 1];
      if (last && last.t > h.extreme.t) {
        if ((last.hand.cx - h.extreme.hand.cx) * h.dir > 0) h.extreme = last; // still going
        const back = ((h.extreme.hand.cx - last.hand.cx) * h.dir) / last.hand.scale;
        if (back >= p.windupReverse * p.distance && t - h.t <= p.windupHold) {
          h.turnedAt = h.extreme.t;
          d.reopen(trail.filter((x) => x.t >= h.extreme.t));
          return res;
        }
      }
      if (t - h.t >= p.windupHold) {
        this.held = null;
        res.push(h.ev);
      }
    } else if (t - h.turnedAt > p.window + p.maxGap) {
      // Nothing came of the movement back: the first swipe was meant after all.
      this.held = null;
      d.enterReturn(t);
      res.push(h.ev);
    }
    return res;
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
