// MediaPipe landmarker creation. Models and the wasm runtime are bundled with the app and loaded
// from our own origin (see scripts/fetch-models.ts); nothing is downloaded at runtime (MHR08).
import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from "@mediapipe/tasks-vision";
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

let fileset: Promise<Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>> | null = null;
const getFileset = () => (fileset ??= FilesetResolver.forVisionTasks(WASM_PATH));

/** "auto" tries the GPU delegate first and falls back to CPU (older WebKit, blocked WebGL). */
export async function createHandLandmarker(
  numHands = 2,
  preference: DelegatePreference = "auto",
): Promise<{ landmarker: HandLandmarker; delegate: Delegate }> {
  const fs = await getFileset();
  const order: Delegate[] = preference === "auto" ? ["GPU", "CPU"] : [preference];
  for (const delegate of order) {
    try {
      const landmarker = await HandLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: MODEL_PATHS.hand, delegate },
        runningMode: "VIDEO",
        numHands,
        // Same thresholds as the prototype.
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.5,
      });
      return { landmarker, delegate };
    } catch (err) {
      if (delegate === order[order.length - 1]) throw err;
      console.warn("GPU delegate unavailable, falling back to CPU", err);
    }
  }
  throw new Error("unreachable");
}

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
