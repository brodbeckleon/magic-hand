/** Which models run on a frame. Hands always run; pose and face are spread out to save time. */
export interface Schedule {
  pose: boolean;
  face: boolean;
}

export interface ScheduleInput {
  /** Running frame counter. */
  frame: number;
  /** People currently tracked. */
  persons: number;
  /** Mouth activity is needed (automatic speaker selection by speaking). */
  wantFace: boolean;
  /** Recent average model time per frame, ms (hands + pose + face). */
  loadMs: number;
  /** Something needs pose on every frame (zone proposal, framing check). */
  forcePose: boolean;
}

/** Above this per-frame model time the extra models run less often; hand tracking never degrades. */
export const LOAD_BUDGET_MS = 30;

export function schedule(i: ScheduleInput): Schedule {
  const busy = i.loadMs > LOAD_BUDGET_MS;
  // With several people, poses keep hands bound to the right person; with one, they only count people.
  const posePeriod = (i.persons >= 2 ? 2 : 4) + (busy ? 2 : 0);
  const facePeriod = busy ? 12 : 6; // ~5 Hz at 30 fps
  const pose = i.forcePose || i.frame % posePeriod === 0;
  // Faces are found from pose head positions, so they run on pose frames only.
  const face = pose && i.wantFace && i.persons >= 2 && i.frame % facePeriod === 0;
  return { pose, face };
}
