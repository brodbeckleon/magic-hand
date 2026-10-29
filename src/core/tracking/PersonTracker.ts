import { poseBox } from "../zone/proposeZone.ts";
import type { PoseObs } from "../types.ts";
import type { Rect } from "../zone/Zone.ts";

export interface PersonTrack {
  id: number;
  pose: PoseObs;
  box: Rect;
  /** Shoulder width, normalised to the frame width/height. */
  shoulder: number;
  cx: number;
  cy: number;
  firstSeen: number;
  lastSeen: number;
}

export interface PersonTrackerParams {
  /** Tracks survive this long without a detection, s. */
  maxAge: number;
  /** A person reappearing near where a track was lost within this time gets the old id back, s. */
  reidWindow: number;
  /** Matching gate: cost (1 - IoU + centroid distance / shoulder width) above this never matches. */
  maxCost: number;
}

export const DEFAULT_PERSON_TRACKER: PersonTrackerParams = { maxAge: 1.0, reidWindow: 3.0, maxCost: 2.2 };

function iou(a: Rect, b: Rect): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/** Torso centre: midpoint of shoulders and hips when visible, else the box centre. */
function centre(pose: PoseObs, box: Rect): [number, number] {
  const ids = [11, 12, 23, 24].map((i) => pose.landmarks[i]).filter((l) => l && (l.visibility ?? 1) >= 0.5);
  if (ids.length >= 2) return [ids.reduce((s, l) => s + l!.x, 0) / ids.length, ids.reduce((s, l) => s + l!.y, 0) / ids.length];
  return [box.x + box.w / 2, box.y + box.h / 2];
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
  private lost: PersonTrack[] = [];
  private nextId = 1;
  readonly params: PersonTrackerParams;

  constructor(params: Partial<PersonTrackerParams> = {}) {
    this.params = { ...DEFAULT_PERSON_TRACKER, ...params };
  }

  get current(): readonly PersonTrack[] {
    return this.tracks;
  }

  reset(): void {
    this.tracks = [];
    this.lost = [];
  }

  update(t: number, poses: readonly PoseObs[]): PersonTrack[] {
    const p = this.params;
    const dets = poses.flatMap((pose) => {
      const b = poseBox(pose);
      if (!b) return [];
      const [cx, cy] = centre(pose, b.box);
      return [{ pose, box: b.box, shoulder: Math.max(b.shoulder, 0.02), cx, cy }];
    });
    const cost = this.tracks.map((tr) =>
      dets.map((d) => 1 - iou(tr.box, d.box) + Math.hypot(tr.cx - d.cx, tr.cy - d.cy) / tr.shoulder),
    );
    const matches = assign(cost, p.maxCost);
    const matchedDets = new Set<number>();
    for (const [ti, di] of matches) {
      Object.assign(this.tracks[ti]!, dets[di]!, { lastSeen: t });
      matchedDets.add(di);
    }
    dets.forEach((d, di) => {
      if (matchedDets.has(di)) return;
      // Re-identify someone who briefly left (occlusion, walking out of the zone).
      const back = this.lost
        .filter((l) => t - l.lastSeen <= p.reidWindow && Math.hypot(l.cx - d.cx, l.cy - d.cy) <= 1.5 * l.shoulder)
        .sort((a, b) => Math.hypot(a.cx - d.cx, a.cy - d.cy) - Math.hypot(b.cx - d.cx, b.cy - d.cy))[0];
      if (back) this.lost = this.lost.filter((l) => l !== back);
      this.tracks.push({ id: back?.id ?? this.nextId++, firstSeen: back?.firstSeen ?? t, lastSeen: t, ...d });
    });
    const alive: PersonTrack[] = [];
    for (const tr of this.tracks) {
      if (t - tr.lastSeen <= p.maxAge) alive.push(tr);
      else this.lost.push(tr);
    }
    this.tracks = alive;
    this.lost = this.lost.filter((l) => t - l.lastSeen <= p.reidWindow);
    return this.tracks;
  }
}
