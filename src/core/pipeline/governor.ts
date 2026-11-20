/**
 * Adaptive analysis rate: analyse every camera frame only while gestures can happen, fewer frames
 * while someone stands without a hand up, and few while nobody is there. Pure, so recordings
 * replay the same way (scripts/replay-cli.ts --governor).
 *
 * The lower rates are chosen so no swipe is lost: a hand in view switches to ACTIVE on the next
 * analysed frame. Simulation showed that 15 fps (WATCH) still catches a fast swipe that starts the
 * moment the hand appears; 8-10 fps did not. EMPTY (5 fps) only applies after nobody and no hand
 * were seen for EMPTY_AFTER_S; raising a hand from there takes longer than one EMPTY interval.
 */
export type RateMode = "active" | "watch" | "empty";

export interface GovernorState {
  mode: RateMode;
  /** Last time a hand was seen (or a gesture was pending), s. */
  lastHand: number;
  /** Last time anybody (a hand or a person) was seen, s. */
  lastSomeone: number;
}

export interface GovernorInput {
  /** Time of the analysed frame, s. */
  t: number;
  /** Hands seen on it. */
  hands: number;
  /** Confirmed people seen. */
  persons: number;
  /** A trigger is held back (wind-up check) or a gesture is otherwise still running. */
  pending: boolean;
  /** Analyse every frame regardless (a wizard is open, recording, benchmark pin). */
  force: boolean;
}

/** A hand seen within this time keeps the full rate (the next swipe may follow), s. */
export const ACTIVE_HOLD_S = 1.5;
/** Nobody and no hand for this long: the lowest rate, s. */
export const EMPTY_AFTER_S = 5;
export const WATCH_FPS = 15;
export const EMPTY_FPS = 5;

/** Seconds between analysed frames in each mode (0 = every camera frame). */
export const INTERVAL_S: Record<RateMode, number> = { active: 0, watch: 1 / WATCH_FPS, empty: 1 / EMPTY_FPS };

/** Start of a camera session: nobody seen yet, but not "empty" before EMPTY_AFTER_S. */
export function initialGovernor(t: number): GovernorState {
  return { mode: "watch", lastHand: -Infinity, lastSomeone: t };
}

/** The mode after an analysed frame. */
export function govern(prev: GovernorState | null, i: GovernorInput): GovernorState {
  const base = prev ?? initialGovernor(i.t);
  const lastHand = i.hands > 0 || i.pending ? i.t : base.lastHand;
  const lastSomeone = i.hands > 0 || i.persons > 0 || i.pending ? i.t : base.lastSomeone;
  let mode: RateMode;
  if (i.force || i.t - lastHand <= ACTIVE_HOLD_S) mode = "active";
  else if (i.t - lastSomeone >= EMPTY_AFTER_S) mode = "empty";
  else mode = "watch";
  return { mode, lastHand, lastSomeone };
}

/**
 * Is a camera frame at `t` due when the last analysed one was at `last`? `period` is the camera's
 * frame period. A frame is taken when waiting for the next one would leave a gap longer than the
 * interval, so the analysed rate never drops below the mode's rate whatever the camera delivers:
 * a 30 fps camera gives 15 fps (every 2nd frame) and 5 fps (every 6th); a 20 or 24 fps camera
 * gives every frame while watching (skipping one would mean 10 or 12 fps). 15 % of a period of
 * slack absorbs timing jitter (with ±10 % jitter the rate still never drops below 15 fps; 20 %
 * would, for 27 fps cameras).
 */
export function due(t: number, last: number, interval: number, period = 1 / 30): boolean {
  return interval <= 0 || t - last >= interval - 0.85 * period;
}

/** Smoothed camera frame period from the time between frames, s (clamped to 5..120 fps). */
export function nextPeriod(prev: number, dt: number): number {
  if (!(dt > 0)) return prev;
  return 0.9 * prev + 0.1 * Math.min(Math.max(dt, 1 / 120), 1 / 5);
}
