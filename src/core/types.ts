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
