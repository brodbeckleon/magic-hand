import type { Landmark, Side } from "../types.ts";
import type { HandTrack } from "./HandTracker.ts";
import { assign, type PersonTrack } from "./PersonTracker.ts";

/** MediaPipe pose: 15 = left wrist, 16 = right wrist (the person's own left/right). */
export const POSE_WRIST: Record<Side, number> = { left: 15, right: 16 };
/** Hand wrist farther than this many shoulder widths from a pose wrist never matches. */
export const ASSOC_GATE = 0.6;
/** A binding only changes after this many pose frames in a row disagree. */
export const STICKY_FRAMES = 3;

export interface Binding {
  personId: number;
  /** Anatomical side from the pose wrist that matched (more reliable than the hand classifier). */
  side: Side;
  /** Consecutive pose frames suggesting another person. */
  disagree: number;
  candidate: number | null;
}

/**
 * Binds hand tracks to people by matching each hand's wrist to the nearest pose wrist. Bindings are
 * sticky so a single bad pose frame cannot hand a swipe to someone else.
 */
export class HandAssociator {
  private bindings = new Map<number, Binding>();

  reset(): void {
    this.bindings.clear();
  }

  binding(handId: number): Binding | undefined {
    return this.bindings.get(handId);
  }

  /**
   * Call on frames where the pose model ran. `aspect` = width / height of the frame. `alive` tells
   * which tracks still exist: a hand the detector missed on this one frame keeps its binding.
   */
  update(hands: readonly HandTrack[], persons: readonly PersonTrack[], aspect: number, alive?: (handId: number) => boolean): void {
    const seen = new Set(hands.map((h) => h.id));
    for (const id of this.bindings.keys()) if (!seen.has(id) && !alive?.(id)) this.bindings.delete(id);

    const wrists: { personId: number; side: Side; lm: Landmark; shoulder: number }[] = [];
    for (const p of persons) {
      for (const side of ["left", "right"] as const) {
        const lm = p.pose.landmarks[POSE_WRIST[side]];
        if (lm && (lm.visibility ?? 1) >= 0.3) wrists.push({ personId: p.id, side, lm, shoulder: p.shoulder });
      }
    }
    const dist = (a: Landmark, b: Landmark) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
    const cost = hands.map((h) => wrists.map((w) => dist(h.obs.landmarks[0]!, w.lm) / (w.shoulder * aspect)));
    const pairs = assign(cost, ASSOC_GATE);
    for (const [hi, wi] of pairs) {
      const hand = hands[hi]!;
      const w = wrists[wi]!;
      const b = this.bindings.get(hand.id);
      if (!b) {
        this.bindings.set(hand.id, { personId: w.personId, side: w.side, disagree: 0, candidate: null });
      } else if (b.personId === w.personId) {
        b.side = w.side;
        b.disagree = 0;
        b.candidate = null;
      } else {
        b.disagree = b.candidate === w.personId ? b.disagree + 1 : 1;
        b.candidate = w.personId;
        if (b.disagree >= STICKY_FRAMES) this.bindings.set(hand.id, { personId: w.personId, side: w.side, disagree: 0, candidate: null });
      }
    }
  }
}
