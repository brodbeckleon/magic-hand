import { poseBox } from "../zone/proposeZone.ts";
import type { PoseObs } from "../types.ts";
import type { Rect } from "../zone/Zone.ts";

export interface PersonTrack {
  /** Raw id: unique for the session, never reused (log, recordings). */
  id: number;
  /**
   * Number shown to people: the lowest free of 1..maxSlots, given on the second matched pose frame
   * (a one-frame phantom never gets one), kept while the person is briefly gone. Null = not
   * confirmed yet (or all numbers in use).
   */
  slot: number | null;
  /** Pose frames this person was matched on. */
  hits: number;
  pose: PoseObs;
  /** All visible landmarks (drawn as the person's outline). */
  box: Rect;
  /** Shoulders and hips only: arms moving do not change it (used for matching). */
  torso: Rect;
  /** Shoulder width, normalised to the frame width/height. */
  shoulder: number;
  /** Shoulder width in frame heights (aspect-corrected), for distances between frames. */
  span: number;
  /** Centre between the shoulders (torso centre, box centre when shoulders are not visible). */
  cx: number;
  cy: number;
  firstSeen: number;
  lastSeen: number;
  /** Index into this frame's poses (to match per-pose data such as faces), null if not seen now. */
  poseIndex: number | null;
}

export interface PersonTrackerParams {
  /** Tracks survive this long without a detection, s. */
  maxAge: number;
  /** A person reappearing near where a track was lost within this time gets the old id back, s. */
  reidWindow: number;
  /** Matching gate: cost (1 - torso IoU + centre distance / shoulder width) above this never matches. */
  maxCost: number;
  /**
   * An unmatched detection this close to a track not seen on this frame (in shoulder widths)
   * continues that track instead of starting a new person: the gate alone missed people who
   * moved quickly or whose torso box changed (turning, leaning).
   */
  rematch: number;
  /** Person numbers 1..maxSlots (the "maximum people" setting). */
  maxSlots: number;
}

export const DEFAULT_PERSON_TRACKER: PersonTrackerParams = { maxAge: 1.0, reidWindow: 3.0, maxCost: 2.2, rematch: 1.5, maxSlots: 4 };

const VISIBLE = 0.5;

function iou(a: Rect, b: Rect): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

const seen = (pose: PoseObs, i: number) => {
  const l = pose.landmarks[i];
  return l && (l.visibility ?? 1) >= VISIBLE ? l : null;
};

/**
 * Centre between the shoulders: it barely moves while someone gestures or bends, unlike the box
 * centre (arms) or the hips (often hidden by a desk). Falls back to the torso, then the box.
 */
function centre(pose: PoseObs, box: Rect): [number, number] {
  const ls = seen(pose, 11);
  const rs = seen(pose, 12);
  if (ls && rs) return [(ls.x + rs.x) / 2, (ls.y + rs.y) / 2];
  const ids = [11, 12, 23, 24].map((i) => seen(pose, i)).filter((l) => l !== null);
  if (ids.length >= 2) return [ids.reduce((s, l) => s + l.x, 0) / ids.length, ids.reduce((s, l) => s + l.y, 0) / ids.length];
  return [box.x + box.w / 2, box.y + box.h / 2];
}

/**
 * Shoulders and hips; with the hips hidden the torso is taken as one shoulder width deep below the
 * shoulders. The whole box when the shoulders are not both visible.
 */
function torsoBox(pose: PoseObs, box: Rect, shoulder: number): Rect {
  const ls = seen(pose, 11);
  const rs = seen(pose, 12);
  if (!ls || !rs) return box;
  const pts = [ls, rs, seen(pose, 23), seen(pose, 24)].filter((l) => l !== null);
  const xs = pts.map((l) => l.x);
  const ys = pts.map((l) => l.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const bottom = pts.length > 2 ? Math.max(...ys) : y + shoulder;
  return { x, y, w: Math.max(Math.max(...xs) - x, 1e-3), h: Math.max(bottom - y, 1e-3) };
}

/**
 * Minimum-cost one-to-one assignment: exhaustive for the small problems we have (4 people, 4 hands),
 * greedy beyond that so it can never blow up.
 */
export function assign(cost: number[][], maxCost: number): [number, number][] {
  const rows = cost.length;
  const cols = rows ? cost[0]!.length : 0;
  if (rows > 6 || Math.pow(cols + 1, rows) > 200_000) return greedyAssign(cost, maxCost);
  let best: [number, number][] = [];
  let bestScore = -Infinity;
  const used = new Array<boolean>(cols).fill(false);
  const pairs: [number, number][] = [];
  const rec = (r: number, sum: number) => {
    if (r === rows) {
      // Prefer more matches, then lower total cost.
      const score = pairs.length * 1000 - sum;
      if (score > bestScore) {
        bestScore = score;
        best = pairs.slice();
      }
      return;
    }
    rec(r + 1, sum); // row r unmatched
    for (let c = 0; c < cols; c++) {
      const v = cost[r]![c]!;
      if (used[c] || v > maxCost) continue;
      used[c] = true;
      pairs.push([r, c]);
      rec(r + 1, sum + v);
      pairs.pop();
      used[c] = false;
    }
  };
  rec(0, 0);
  return best;
}

function greedyAssign(cost: number[][], maxCost: number): [number, number][] {
  const all: [number, number, number][] = [];
  cost.forEach((row, r) => row.forEach((v, c) => v <= maxCost && all.push([v, r, c])));
  all.sort((a, b) => a[0] - b[0]);
  const ur = new Set<number>();
  const uc = new Set<number>();
  const out: [number, number][] = [];
  for (const [, r, c] of all) {
    if (ur.has(r) || uc.has(c)) continue;
    ur.add(r);
    uc.add(c);
    out.push([r, c]);
  }
  return out;
}

/**
 * Stable ids for the people in view (from pose landmarks). Call update() only on frames where the
 * pose model ran; tracks are kept for maxAge so skipped frames do not drop anyone.
 */
export class PersonTracker {
  private tracks: PersonTrack[] = [];
  /** Recently gone; they keep their id and person number for reidWindow. */
  private lost: PersonTrack[] = [];
  private nextId = 1;
  /** Raw ids handed out (a measure of id churn: one per person in a stable scene). */
  issued = 0;
  private firstT: number | null = null;
  private lastT = 0;
  readonly params: PersonTrackerParams;

  constructor(params: Partial<PersonTrackerParams> = {}) {
    this.params = { ...DEFAULT_PERSON_TRACKER, ...params };
  }

  get current(): readonly PersonTrack[] {
    return this.tracks;
  }

  /** Clears everyone (and every person number). Raw ids keep counting up, so they stay unique. */
  reset(): void {
    this.tracks = [];
    this.lost = [];
  }

  /** Changes how many person numbers exist; numbers above the new maximum are given up. */
  setMaxSlots(n: number): void {
    this.params.maxSlots = n;
    for (const tr of [...this.tracks, ...this.lost]) if (tr.slot !== null && tr.slot > n) tr.slot = null;
  }

  /** Person number of a raw id (also while briefly gone); null if unknown or not confirmed. */
  slotOf(id: number | null): number | null {
    if (id === null) return null;
    return (this.tracks.find((tr) => tr.id === id) ?? this.lost.find((tr) => tr.id === id))?.slot ?? null;
  }

  /** Raw ids handed out per minute since the first pose frame (id churn; ~0 in a stable scene). */
  idsPerMinute(): number {
    if (this.firstT === null) return 0;
    return this.issued / Math.max((this.lastT - this.firstT) / 60, 1 / 60);
  }

  update(t: number, poses: readonly PoseObs[], aspect = 4 / 3): PersonTrack[] {
    const p = this.params;
    this.firstT ??= t;
    this.lastT = t;
    // Distances in frame heights: x is stretched by the aspect ratio.
    const gap = (a: { cx: number; cy: number }, b: { cx: number; cy: number }) => Math.hypot((a.cx - b.cx) * aspect, a.cy - b.cy);
    const dets = poses.flatMap((pose, poseIndex) => {
      const b = poseBox(pose);
      if (!b) return [];
      const [cx, cy] = centre(pose, b.box);
      const shoulder = Math.max(b.shoulder, 0.02);
      const ls = seen(pose, 11);
      const rs = seen(pose, 12);
      const span = Math.max(ls && rs ? Math.hypot((ls.x - rs.x) * aspect, ls.y - rs.y) : shoulder * aspect, 0.02);
      return [{ pose, box: b.box, torso: torsoBox(pose, b.box, shoulder), shoulder, span, cx, cy, poseIndex }];
    });
    for (const tr of this.tracks) tr.poseIndex = null;
    const cost = this.tracks.map((tr) => dets.map((d) => 1 - iou(tr.torso, d.torso) + gap(tr, d) / tr.span));
    const matches = assign(cost, p.maxCost);
    const matchedDets = new Set<number>();
    const seenNow = new Set<PersonTrack>();
    const take = (tr: PersonTrack, d: (typeof dets)[number]) => {
      Object.assign(tr, d, { lastSeen: t, hits: tr.hits + 1 });
      seenNow.add(tr);
    };
    for (const [ti, di] of matches) {
      take(this.tracks[ti]!, dets[di]!);
      matchedDets.add(di);
    }
    dets.forEach((d, di) => {
      if (matchedDets.has(di)) return;
      // Still the same person if close to a track that was not seen on this frame.
      const near = this.tracks
        .filter((tr) => !seenNow.has(tr) && gap(tr, d) <= p.rematch * tr.span)
        .sort((a, b) => gap(a, d) - gap(b, d))[0];
      if (near) return take(near, d);
      // Re-identify someone who briefly left (occlusion, walking out of the zone).
      const back = this.lost
        .filter((l) => t - l.lastSeen <= p.reidWindow && gap(l, d) <= 1.5 * l.span)
        .sort((a, b) => gap(a, d) - gap(b, d))[0];
      if (back) this.lost = this.lost.filter((l) => l !== back);
      else this.issued++;
      const tr: PersonTrack = { id: back?.id ?? this.nextId++, slot: back?.slot ?? null, hits: back?.hits ?? 0, firstSeen: back?.firstSeen ?? t, lastSeen: t, ...d };
      this.tracks.push(tr);
      take(tr, d);
    });
    const alive: PersonTrack[] = [];
    for (const tr of this.tracks) {
      if (t - tr.lastSeen <= p.maxAge) alive.push(tr);
      else this.lost.push(tr);
    }
    this.tracks = alive;
    // Gone for longer than reidWindow: the person number becomes free again.
    this.lost = this.lost.filter((l) => t - l.lastSeen <= p.reidWindow);
    for (const tr of this.tracks) if (tr.slot === null && tr.hits >= 2) tr.slot = this.freeSlot();
    return this.tracks;
  }

  private freeSlot(): number | null {
    const used = new Set([...this.tracks, ...this.lost].map((tr) => tr.slot));
    for (let n = 1; n <= this.params.maxSlots; n++) if (!used.has(n)) return n;
    return null;
  }
}
