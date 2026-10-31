// MediaPipe model locations and result conversion. Models and the wasm runtime are bundled and loaded
// from our own origin (see scripts/fetch-models.ts); nothing is downloaded at runtime (MHR08).
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";
import type { HandObs, Side } from "../core/types.ts";

export type Delegate = "GPU" | "CPU";
export type DelegatePreference = "auto" | Delegate;

export const WASM_PATH = "/mediapipe/wasm";
export const MODEL_PATHS = {
  hand: "/models/hand_landmarker.task",
  pose: "/models/pose_landmarker_lite.task",
  face: "/models/face_landmarker.task",
} as const;

/**
 * MediaPipe labels handedness assuming a mirrored (selfie) image. We feed the camera pixels
 * unmirrored, so the label names the opposite hand. Verified manually with "raise your right hand"
 * (see docs/testing.md); a recorded fixture locks it in.
 */
export const HANDEDNESS_SWAP = true;

export function toHandObs(result: HandLandmarkerResult): HandObs[] {
  return result.landmarks.map((landmarks, i) => {
    const cat = result.handedness[i]?.[0];
    let side: Side = cat?.categoryName === "Left" ? "left" : "right";
    if (HANDEDNESS_SWAP) side = side === "left" ? "right" : "left";
    return {
      landmarks: landmarks.map(({ x, y, z }) => ({ x, y, z })),
      side,
      sideScore: cat?.score ?? 0.5,
    };
  });
}
