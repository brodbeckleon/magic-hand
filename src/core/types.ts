// Shared data types for the pure gesture core. Times are in seconds, passed in by the caller.

/** One MediaPipe landmark, normalised to the (unmirrored) source frame: x, y in 0..1. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/** Palm centre and hand length in pixels of the mirrored view (prototype: `Hand` namedtuple). */
export interface Hand {
  cx: number;
  cy: number;
  scale: number;
}

/** Anatomical side of a hand (already corrected for MediaPipe's mirrored-input assumption). */
export type Side = "left" | "right";

export interface HandObs {
  /** 21 landmarks, normalised to the full source frame. */
  landmarks: Landmark[];
  side: Side;
  /** Confidence of the side classification, 0..1. */
  sideScore: number;
  /** Found in a wrist crop (far assist), not by the full-frame pass. */
  fromCrop?: boolean;
}

export interface PoseObs {
  /** 33 pose landmarks, normalised to the full source frame. */
  landmarks: (Landmark & { visibility?: number })[];
}

export interface FaceObs {
  /** Blendshape jawOpen 0..1, if the model ran with blendshapes. */
  jawOpen: number | null;
  /** Upper lip, lower lip, forehead, chin (face mesh 13, 14, 10, 152). */
  lip: [Landmark, Landmark, Landmark, Landmark] | null;
}

/** Everything the vision layer saw in one camera frame. `null` = model did not run on this frame. */
export interface FrameObs {
  t: number;
  /** Source frame size in pixels. */
  width: number;
  height: number;
  hands: HandObs[];
  poses?: PoseObs[] | null;
  /** Aligned with `poses` (null entries: no face found for that person). */
  faces?: (FaceObs | null)[] | null;
}

export type Command = "next" | "prev";
export type PreferredHand = Side | "either";
