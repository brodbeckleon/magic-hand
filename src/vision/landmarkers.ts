// MediaPipe model locations and result conversion. Models and the wasm runtime are bundled and loaded
// from our own origin (see scripts/fetch-models.ts); nothing is downloaded at runtime (MHR08).
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";
import type { HandObs, Side } from "../core/types.ts";

export type Delegate = "GPU" | "CPU";

/**
 * Inference runs on the GPU only; there is no CPU fallback. The e2e build alone may ask for the CPU
 * (?delegate=CPU): headless Chromium only has software WebGL. Production builds drop that branch.
 */
export function chosenDelegate(): Delegate {
  if (import.meta.env.MODE === "e2e" && new URLSearchParams(location.search).get("delegate") === "CPU") return "CPU";
  return "GPU";
}

/** Prefix of the error message when no hardware GPU is available (checked across the worker boundary). */
export const NO_GPU = "no-gpu";

export const isNoGpuError = (err: unknown): boolean => err instanceof Error && err.message.startsWith(NO_GPU);

/**
 * WebGL renderers that are really the CPU (Chromium's SwiftShader, Mesa, Windows WARP). WebKit always
 * reports "Apple GPU" here, which is right for the Macs it ships on.
 */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|lavapipe|basic render driver|software/i;

/**
 * Throws a NO_GPU error unless WebGL2 runs on a hardware GPU here. MediaPipe's GPU delegate would
 * otherwise run happily on software WebGL, i.e. on the CPU. Returns the renderer name.
 */
export function assertHardwareGpu(): string {
  const opts: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true };
  let gl: WebGL2RenderingContext | null = null;
  if (typeof OffscreenCanvas !== "undefined") gl = new OffscreenCanvas(1, 1).getContext("webgl2", opts);
  // WebKit before Safari 17 has OffscreenCanvas but no WebGL in it; the main thread still has <canvas>.
  if (!gl && typeof document !== "undefined") gl = document.createElement("canvas").getContext("webgl2", opts);
  if (!gl) throw new Error(`${NO_GPU}: WebGL2 is not available or would run in software`);
  try {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    if (SOFTWARE_RENDERER.test(renderer)) throw new Error(`${NO_GPU}: software renderer (${renderer})`);
    return renderer;
  } finally {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

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
