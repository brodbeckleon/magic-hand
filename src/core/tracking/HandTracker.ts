import { dist } from "../geometry.ts";
import type { Hand, HandObs, Side } from "../types.ts";

export interface HandTrack {
  id: number;
  obs: HandObs;
  hand: Hand;
  /** Side decided by majority vote over recent frames; frozen once it is clear. */
  side: Side;
  frozen: boolean;
  firstSeen: number;
  lastSeen: number;
}

export interface HandTrackerParams {
  /** Tracks survive this long without a detection, in s. */
  maxAge: number;
  /** Matching gate: hand lengths per frame, or per s for longer gaps ... */
  maxJump: number;
  maxSpeed: number;
  /** ... but a gap never allows more movement than this long at maxSpeed, s. Without this cap a
   *  stalled frame stream would let one person's hand inherit another person's hand track. */
  maxGapForSpeed: number;
  /** Votes kept for the side decision. */
  votes: number;
  /** Share of agreeing votes that freezes the side. */
  freezeAt: number;
}

export const DEFAULT_HAND_TRACKER: HandTrackerParams = { maxAge: 0.3, maxJump: 1.5, maxSpeed: 40, maxGapForSpeed: 0.12, votes: 15, freezeAt: 0.8 };

interface Internal extends HandTrack {
  votes: Side[];
}

/**
 * Gives hands a stable identity across frames (nearest palm centre within a physically plausible
 * distance) and a stable side. MediaPipe's left/right label flickers during fast sideways movement;
 * a flip must never split one swipe across two detectors.
 */
export class HandTracker {
  private tracks: Internal[] = [];
  private nextId = 1;
  readonly params: HandTrackerParams;

  constructor(params: Partial<HandTrackerParams> = {}) {
    this.params = { ...DEFAULT_HAND_TRACKER, ...params };
  }

  reset(): void {
    this.tracks = [];
  }

  /** The track still exists (seen within maxAge), even if this frame missed it. */
  has(id: number): boolean {
    return this.tracks.some((tr) => tr.id === id);
  }

  /** Returns the tracks seen in this frame. `hands` are the features of `observations` (same order). */
  update(t: number, observations: readonly HandObs[], hands: readonly Hand[]): HandTrack[] {
    const p = this.params;
    this.tracks = this.tracks.filter((tr) => t - tr.lastSeen <= p.maxAge);

    // Greedy assignment by distance; with at most a handful of hands this is optimal enough.
    const pairs: { ti: number; oi: number; d: number }[] = [];
    this.tracks.forEach((tr, ti) => {
      const allowed = Math.max(p.maxJump, p.maxSpeed * Math.min(t - tr.lastSeen, p.maxGapForSpeed)) * tr.hand.scale;
      hands.forEach((h, oi) => {
        const d = dist(h.cx, h.cy, tr.hand.cx, tr.hand.cy);
        if (d <= allowed) pairs.push({ ti, oi, d });
      });
    });
    pairs.sort((a, b) => a.d - b.d);
    const usedT = new Set<number>();
    const usedO = new Set<number>();
    const seen: Internal[] = [];
    for (const { ti, oi } of pairs) {
      if (usedT.has(ti) || usedO.has(oi)) continue;
      usedT.add(ti);
      usedO.add(oi);
      const tr = this.tracks[ti]!;
      tr.obs = observations[oi]!;
      tr.hand = hands[oi]!;
      tr.lastSeen = t;
      this.vote(tr, tr.obs.side);
      seen.push(tr);
    }
    observations.forEach((obs, oi) => {
      if (usedO.has(oi)) return;
      const tr: Internal = {
        id: this.nextId++, obs, hand: hands[oi]!, side: obs.side, frozen: false,
        firstSeen: t, lastSeen: t, votes: [obs.side],
      };
      this.tracks.push(tr);
      seen.push(tr);
    });

    // Two hands of one person cannot be on the same side: the older/clearer track keeps it. Only an
    // undecided (not frozen) track is flipped, so two people's right hands never get a sticky wrong
    // side (with people in view, the pose wrists decide the side anyway).
    if (seen.length === 2 && seen[0]!.side === seen[1]!.side) {
      const [a, b] = seen as [Internal, Internal];
      const keep = a.frozen !== b.frozen ? (a.frozen ? a : b) : a.firstSeen <= b.firstSeen ? a : b;
      const flip = keep === a ? b : a;
      if (!flip.frozen) {
        // Record the correction as its vote too, so the track settles on the corrected side.
        flip.side = flip.side === "left" ? "right" : "left";
        flip.votes[flip.votes.length - 1] = flip.side;
      }
    }
    return seen.map(({ votes: _votes, ...pub }) => pub);
  }

  private vote(tr: Internal, side: Side): void {
    if (tr.frozen) return;
    tr.votes.push(side);
    if (tr.votes.length > this.params.votes) tr.votes.shift();
    const lefts = tr.votes.filter((s) => s === "left").length;
    const rights = tr.votes.length - lefts;
    if (lefts !== rights) tr.side = lefts > rights ? "left" : "right";
    if (tr.votes.length >= this.params.votes && Math.max(lefts, rights) >= this.params.freezeAt * tr.votes.length) {
      tr.frozen = true;
    }
  }
}
