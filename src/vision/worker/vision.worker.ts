/// <reference lib="webworker" />
// Runs the MediaPipe landmarkers off the UI thread. Module worker: MediaPipe's ES-module wasm loader
// (forVisionTasks(path, true)) is imported dynamically. Frames arrive as ImageBitmaps already
// cropped to the presenter zone.
import { FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { FaceObs } from "../../core/types.ts";
import { cropToFull } from "../../core/zone/Zone.ts";
import { MODEL_PATHS, toHandObs, WASM_PATH, type Delegate } from "../landmarkers.ts";
import type { FromWorker, ToWorker } from "./protocol.ts";

declare const self: DedicatedWorkerGlobalScope & { import?: (url: string) => Promise<unknown> };

// MediaPipe loads its wasm loader with a dynamic import (preferring self.import if present) and
// reads globalThis.ModuleFactory, which it clears after creating each model. A module is only
// evaluated once, so a second model (e.g. pose) would find no factory: the hook sets it again from
// the module's default export on every load. In dev it also bypasses Vite's rewriting of dynamic
// imports (appended ?import), which breaks loading files from public/.
const dynamicImport: (url: string) => Promise<{ default: unknown }> = import.meta.env.DEV
  ? (new Function("u", "return import(u)") as (url: string) => Promise<{ default: unknown }>)
  : (url) => import(/* @vite-ignore */ url);
self.import = async (url: string) => {
  const m = await dynamicImport(url);
  (globalThis as unknown as { ModuleFactory: unknown }).ModuleFactory = m.default;
  return m;
};

let fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;
let hands: HandLandmarker | null = null;
let pose: PoseLandmarker | null = null;
let face: FaceLandmarker | null = null;
let faceCanvas: OffscreenCanvas | null = null;
const FACE_PX = 256;
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

async function getFace(): Promise<FaceLandmarker> {
  face ??= await FaceLandmarker.createFromOptions(fileset!, {
    baseOptions: { modelAssetPath: MODEL_PATHS.face, delegate },
    runningMode: "IMAGE",
    numFaces: 1,
    outputFaceBlendshapes: true,
  });
  return face;
}

/**
 * Mouth signal per person: the head region is cut out using the pose (nose, eyes, ears, mouth
 * corners = pose landmarks 0-10) and enlarged, which works at distances where full-frame face
 * detection gives up. Only jawOpen and four lip/face points leave the worker.
 */
async function facesFor(bitmap: ImageBitmap, posesRaw: NormalizedLandmark[][], crop: { x: number; y: number; w: number; h: number }): Promise<(FaceObs | null)[]> {
  const fl = await getFace();
  faceCanvas ??= new OffscreenCanvas(FACE_PX, FACE_PX);
  const ctx = faceCanvas.getContext("2d")!;
  const W = bitmap.width;
  const H = bitmap.height;
  return posesRaw.map((lms) => {
    const head = lms.slice(0, 11).filter((l) => (l.visibility ?? 1) > 0.5);
    if (head.length < 4) return null;
    const xs = head.map((l) => l.x * W);
    const ys = head.map((l) => l.y * H);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const side = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 2.2;
    if (side < 8) return null;
    const sx = cx - side / 2;
    const sy = cy - side / 2;
    ctx.clearRect(0, 0, FACE_PX, FACE_PX);
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, FACE_PX, FACE_PX);
    const r = fl.detect(faceCanvas!);
    const mesh = r.faceLandmarks[0];
    if (!mesh) return null;
    const jaw = r.faceBlendshapes[0]?.categories.find((c) => c.categoryName === "jawOpen")?.score ?? null;
    const toFull = (l: NormalizedLandmark) =>
      cropToFull({ x: (sx + l.x * side) / W, y: (sy + l.y * side) / H, z: 0 }, crop);
    const pick = (i: number) => toFull(mesh[i]!);
    return { jawOpen: jaw, lip: [pick(13), pick(14), pick(10), pick(152)] };
  });
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
      let raw: NormalizedLandmark[][] = [];
      if (msg.pose) {
        raw = (await getPose()).detectForVideo(bitmap, ts).landmarks;
        poses = raw.map((lms) => ({
          landmarks: lms.map((l) => cropToFull({ x: l.x, y: l.y, z: l.z, visibility: l.visibility }, crop)),
        }));
      }
      const t2 = performance.now();
      const faces = msg.face && raw.length ? await facesFor(bitmap, raw, crop) : null;
      const t3 = performance.now();
      bitmap.close();
      for (const h of handObs) h.landmarks = h.landmarks.map((l) => cropToFull(l, crop));
      post({ type: "result", id: msg.id, hands: handObs, poses, faces, handMs: t1 - t0, poseMs: t2 - t1, faceMs: t3 - t2 });
    }
  } catch (err) {
    if (msg.type === "frame") msg.bitmap.close();
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
