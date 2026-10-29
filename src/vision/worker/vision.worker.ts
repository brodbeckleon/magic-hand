/// <reference lib="webworker" />
// Runs the MediaPipe landmarkers off the UI thread. Module worker: MediaPipe's ES-module wasm loader
// (forVisionTasks(path, true)) is imported dynamically. Frames arrive as ImageBitmaps already
// cropped to the presenter zone.
import { FilesetResolver, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { cropToFull } from "../../core/zone/Zone.ts";
import { MODEL_PATHS, toHandObs, WASM_PATH, type Delegate } from "../landmarkers.ts";
import type { FromWorker, ToWorker } from "./protocol.ts";

declare const self: DedicatedWorkerGlobalScope & { import?: (url: string) => Promise<unknown> };

// MediaPipe loads its wasm loader with a dynamic import, preferring self.import if present. Vite's
// dev server rewrites dynamic imports (appends ?import), which breaks loading files from public/;
// this hook bypasses the rewrite. Production builds leave the import untouched.
if (import.meta.env.DEV) self.import = new Function("u", "return import(u)") as (url: string) => Promise<unknown>;

let fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;
let hands: HandLandmarker | null = null;
let pose: PoseLandmarker | null = null;
let delegate: Delegate = "GPU";
let numHands = 2;

const post = (m: FromWorker) => self.postMessage(m);

async function createHands(pref: "auto" | Delegate): Promise<void> {
  fileset ??= await FilesetResolver.forVisionTasks(WASM_PATH, true);
  const order: Delegate[] = pref === "auto" ? ["GPU", "CPU"] : [pref];
  let lastErr: unknown;
  for (const d of order) {
    try {
      hands = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_PATHS.hand, delegate: d },
        runningMode: "VIDEO",
        numHands,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.5,
      });
      delegate = d;
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function getPose(): Promise<PoseLandmarker> {
  if (!pose) {
    pose = await PoseLandmarker.createFromOptions(fileset!, {
      baseOptions: { modelAssetPath: MODEL_PATHS.pose, delegate },
      runningMode: "VIDEO",
      numPoses: 4,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }
  return pose;
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      numHands = msg.numHands;
      await createHands(msg.delegate);
      post({ type: "ready", delegate });
    } else if (msg.type === "options") {
      numHands = msg.numHands;
      await hands?.setOptions({ numHands });
    } else if (msg.type === "reset") {
      // The tracker's region of interest refers to the old crop; restart tracking.
      await hands?.setOptions({ numHands });
    } else if (msg.type === "frame") {
      const { bitmap, ts, crop } = msg;
      const t0 = performance.now();
      const handObs = hands ? toHandObs(hands.detectForVideo(bitmap, ts)) : [];
      const t1 = performance.now();
      let poses = null;
      if (msg.pose) {
        const r = (await getPose()).detectForVideo(bitmap, ts);
        poses = r.landmarks.map((lms) => ({
          landmarks: lms.map((l) => cropToFull({ x: l.x, y: l.y, z: l.z, visibility: l.visibility }, crop)),
        }));
      }
      const t2 = performance.now();
      bitmap.close();
      for (const h of handObs) h.landmarks = h.landmarks.map((l) => cropToFull(l, crop));
      post({ type: "result", id: msg.id, hands: handObs, poses, handMs: t1 - t0, poseMs: t2 - t1 });
    }
  } catch (err) {
    if (msg.type === "frame") msg.bitmap.close();
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
