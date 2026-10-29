export type SpeakerMode = "manual" | "auto";
export type AutoSignal = "mouth" | "movement" | "both";

export interface Candidate {
  id: number;
  /** Seen in this frame (or within the tracker's grace period). */
  present: boolean;
  /** A palm claim completed on this frame; claimStart orders simultaneous claims. */
  claimed: boolean;
  claimStart: number | null;
  mouth: number | null;
  motion: number;
  /** One of this person's hands is in the middle of a swipe. */
  midSwipe: boolean;
}

export type SwitchReason = "claim" | "auto" | "only" | "lost";
export interface SpeakerChange {
  id: number | null;
  reason: SwitchReason;
}

export interface ArbiterParams {
  /** Auto: a challenger must beat the speaker by this factor ... */
  factor: number;
  margin: number;
  /** ... continuously for this long, s. */
  hold: number;
  /** Minimum time between automatic switches, s. */
  dwell: number;
  /** A palm claim blocks automatic switching for this long, s. */
  pin: number;
  /** The speaker may be out of view this long before losing control, s. */
  grace: number;
  /** Weight of the mouth signal in "both" mode. */
  mouthWeight: number;
}

export const DEFAULT_ARBITER: ArbiterParams = { factor: 1.3, margin: 0.05, hold: 1.5, dwell: 2.0, pin: 10, grace: 3, mouthWeight: 0.6 };

/**
 * Decides who may change slides when several people are in view.
 *   - A completed palm claim always wins (ties: the current speaker keeps it, else the earlier claim).
 *   - Never switches while the current speaker is mid-swipe.
 *   - A speaker out of view for longer than `grace` loses control; with exactly one person left,
 *     that person takes over.
 *   - Auto mode: normalised activity scores with hysteresis (factor, hold, dwell) and a pin after claims.
 */
export class Arbiter {
  active: number | null = null;
  readonly params: ArbiterParams;
  private pinnedUntil = -Infinity;
  private lastSwitch = -Infinity;
  private challenger: { id: number; since: number } | null = null;
  private lastSeen = new Map<number, number>();
  /** Normalised scores of the last update (developer view). */
  scores = new Map<number, number>();

  constructor(params: Partial<ArbiterParams> = {}) {
    this.params = { ...DEFAULT_ARBITER, ...params };
  }

  reset(): void {
    this.active = null;
    this.pinnedUntil = this.lastSwitch = -Infinity;
    this.challenger = null;
    this.lastSeen.clear();
    this.scores.clear();
  }

  /** Returns the change of speaker on this frame (id null: nobody has control any more), or null. */
  update(t: number, cands: readonly Candidate[], mode: SpeakerMode, signal: AutoSignal): SpeakerChange | null {
    const p = this.params;
    for (const c of cands) if (c.present) this.lastSeen.set(c.id, t);
    for (const id of [...this.lastSeen.keys()]) if (!cands.some((c) => c.id === id) && t - this.lastSeen.get(id)! > p.grace) this.lastSeen.delete(id);
    this.scores = this.normalisedScores(cands, signal);

    const current = cands.find((c) => c.id === this.active);
    if (current?.midSwipe) return null; // never switch during a swipe

    const claims = cands.filter((c) => c.claimed);
    if (claims.length) {
      const winner = claims.find((c) => c.id === this.active) ?? claims.sort((a, b) => (a.claimStart ?? t) - (b.claimStart ?? t))[0]!;
      this.pinnedUntil = t + p.pin;
      return this.switchTo(winner.id, t, "claim");
    }

    if (this.active !== null) {
      const seen = this.lastSeen.get(this.active);
      if (seen === undefined || t - seen > p.grace) {
        this.active = null;
        this.challenger = null;
        const present = cands.filter((c) => c.present);
        if (present.length === 1) return this.switchTo(present[0]!.id, t, "only");
        return { id: null, reason: "lost" };
      }
    }

    const present = cands.filter((c) => c.present);
    if (this.active === null && present.length === 1) return this.switchTo(present[0]!.id, t, "only");
    if (mode === "manual") return null;

    // Auto mode with hysteresis.
    const best = [...this.scores.entries()].filter(([id]) => present.some((c) => c.id === id)).sort((a, b) => b[1] - a[1])[0];
    if (!best) return null;
    const [bestId, bestScore] = best;
    if (this.active === null) {
      if (bestScore > 0) return this.track(bestId, t, true);
      return null;
    }
    if (bestId === this.active || t < this.pinnedUntil) {
      this.challenger = null;
      return null;
    }
    const activeScore = this.scores.get(this.active) ?? 0;
    if (bestScore > p.factor * activeScore + p.margin && t - this.lastSwitch >= p.dwell) return this.track(bestId, t, false);
    this.challenger = null;
    return null;
  }

  /** Switches once `id` has been the best challenger for `hold` seconds. */
  private track(id: number, t: number, noSpeaker: boolean): SpeakerChange | null {
    if (this.challenger?.id !== id) this.challenger = { id, since: t };
    if (t - this.challenger.since >= (noSpeaker ? this.params.hold / 2 : this.params.hold)) return this.switchTo(id, t, "auto");
    return null;
  }

  private switchTo(id: number, t: number, reason: SwitchReason): SpeakerChange | null {
    this.challenger = null;
    if (this.active === id) return null;
    this.active = id;
    this.lastSwitch = t;
    return { id, reason };
  }

  /** Activity relative to the most active person (0..1). Mouth falls back to movement without a face. */
  private normalisedScores(cands: readonly Candidate[], signal: AutoSignal): Map<number, number> {
    const norm = (vals: (number | null)[]) => {
      const max = Math.max(0, ...vals.filter((v): v is number => v !== null));
      return vals.map((v) => (v === null || max <= 0 ? null : v / max));
    };
    const mouth = norm(cands.map((c) => c.mouth));
    const motion = norm(cands.map((c) => c.motion)) as (number | null)[];
    const w = this.params.mouthWeight;
    const out = new Map<number, number>();
    cands.forEach((c, i) => {
      const m = mouth[i] ?? null;
      const v = motion[i] ?? 0;
      const s = signal === "movement" ? v : signal === "mouth" ? (m ?? v) : m === null ? v : w * m + (1 - w) * v;
      out.set(c.id, s);
    });
    return out;
  }
}
