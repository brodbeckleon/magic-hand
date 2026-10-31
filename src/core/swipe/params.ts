/** Tunable SwipeDetector parameters. Defaults are the prototype's (magic_hand.py). */
export interface SwipeParams {
  /** Minimum swipe distance in hand lengths (independent of camera distance, MHR03). */
  distance: number;
  /** Maximum duration of a swipe in s. */
  window: number;
  /** Return period after a trigger in s: moving the hand back does nothing. */
  returnTime: number;
  /** Maximum |dy| / |dx| for a swipe to count as horizontal (MHR07). */
  maxSlope: number;
  /** How long the hand must be held still to calibrate, in s (MHR01). */
  calibTime: number;
  /** How far the hand may drift while calibrating, in hand lengths. */
  calibStill: number;
  /** Frames without a hand up to this many s do not interrupt a swipe. */
  maxGap: number;
  /** Hand lengths the palm may move per frame before the swipe restarts. */
  maxJump: number;
  /** Hand lengths per s, for longer pauses between frames. */
  maxSpeed: number;
}

export const DEFAULT_SWIPE_PARAMS: Readonly<SwipeParams> = Object.freeze({
  distance: 2.5,
  window: 0.5,
  returnTime: 1.0,
  maxSlope: 0.6,
  calibTime: 1.0,
  calibStill: 0.4,
  maxGap: 0.2,
  maxJump: 1.5,
  maxSpeed: 40.0,
});

/** Slider ranges for the developer tools and bounds for auto-tuning. */
export const SWIPE_PARAM_RANGES: Readonly<Record<keyof SwipeParams, { min: number; max: number; step: number }>> = {
  distance: { min: 1.0, max: 5.0, step: 0.1 },
  window: { min: 0.2, max: 1.2, step: 0.05 },
  returnTime: { min: 0.2, max: 2.5, step: 0.1 },
  maxSlope: { min: 0.2, max: 1.2, step: 0.05 },
  calibTime: { min: 0.3, max: 3.0, step: 0.1 },
  calibStill: { min: 0.1, max: 1.0, step: 0.05 },
  maxGap: { min: 0.0, max: 0.6, step: 0.02 },
  maxJump: { min: 0.5, max: 4.0, step: 0.1 },
  maxSpeed: { min: 10, max: 80, step: 1 },
};
