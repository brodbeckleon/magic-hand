/** Which models run on a frame. Hands always run; pose and face are spread out to save time. */
export interface Schedule {
  pose: boolean;
  face: boolean;
}

export interface ScheduleInput {
  /** People currently tracked. */
  persons: number;
  /** Mouth activity is needed (automatic speaker selection by speaking). */
  wantFace: boolean;
  /** Recent average model time per frame, ms (hands + pose + face). */
  loadMs: number;
  /** Something needs pose on every frame (zone proposal, framing check). */
  forcePose: boolean;
  /** A presenter is far away: hands may come from pose wrists, so pose runs more often. */
  far?: boolean;
  /** Seconds since the face model last ran (Infinity = never). */
  sinceFace?: number;
  /** Seconds since the pose model last ran (Infinity = never). */
  sincePose?: number;
  /** No hand in view (lower analysis rate): pose still runs at least every POSE_INTERVAL_S. */
  watching?: boolean;
}

/**
 * Seconds between pose runs: one person (or nobody yet) and several people. By time, not frame
 * count: with the adaptive analysis rate, frames are 33, 67 or 200 ms apart.
 */
export const POSE_INTERVAL_S = 0.2;
export const POSE_INTERVAL_MULTI_S = 1 / 15;

/** Above this per-frame model time the extra models run less often; hand tracking never degrades. */
export const LOAD_BUDGET_MS = 30;
/**
 * Seconds between face runs (~5 Hz, ~2.5 Hz under load). By time, not frames: with dropped frames a
 * frame period spread the samples so far that mouth activity (3 samples per second) never scored.
 */
export const FACE_INTERVAL_S = 0.2;
export const FACE_INTERVAL_BUSY_S = 0.4;
/**
 * Longest gap between pose runs while someone is far away. Their palm may come only from the pose
 * wrists, and the swipe detector drops its history after a 0.2 s gap (maxGap): at 15 fps a frame
 * period of 4 left 0.27 s between pose frames and no far swipe ever fired.
 */
export const FAR_POSE_INTERVAL_S = 0.09;

/**
 * Average model time per analysed frame (hands + whatever else ran on it). Updated once per new
 * result: averaging on every request added the last pose and face times again on frames where
 * those models did not run, so the load looked far higher than it was and "busy" set in early.
 */
export class LoadMeter {
  ms = 0;
  private seen = 0;

  /** `results`: results received so far; `lastMs`: model time of the newest one. */
  observe(results: number, lastMs: number): number {
    if (results !== this.seen) {
      this.seen = results;
      this.ms = 0.9 * this.ms + 0.1 * lastMs;
    }
    return this.ms;
  }
}

export function schedule(i: ScheduleInput): Schedule {
  const busy = i.loadMs > LOAD_BUDGET_MS;
  // With several people, poses keep hands bound to the right person; with one, they only notice
  // someone joining or the presenter stepping back (far), which ~5 Hz is quick enough for.
  let poseInterval = (i.persons >= 2 || i.far ? POSE_INTERVAL_MULTI_S : POSE_INTERVAL_S) + (busy ? POSE_INTERVAL_MULTI_S : 0);
  // Without a hand the poses are all there is to notice somebody: never less than ~5 Hz.
  if (i.watching) poseInterval = Math.min(poseInterval, POSE_INTERVAL_S);
  const since = i.sincePose ?? Infinity;
  const farDue = !!i.far && since >= FAR_POSE_INTERVAL_S - 0.01;
  const pose = i.forcePose || farDue || since >= poseInterval - 0.01;
  // Faces are found from pose head positions, so they run on pose frames only. Slightly early is
  // fine (pose frames do not line up with the interval).
  const due = (i.sinceFace ?? Infinity) >= (busy ? FACE_INTERVAL_BUSY_S : FACE_INTERVAL_S) - 0.02;
  const face = pose && i.wantFace && i.persons >= 2 && due;
  return { pose, face };
}
