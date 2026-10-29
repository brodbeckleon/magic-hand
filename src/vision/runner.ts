// All MediaPipe work for one frame: hands (always), pose, faces on head crops and hands on wrist
// crops (on request). Runs in the vision worker, or on the main thread where workers cannot do
// WebGL (WebKit before Safari 17). Frames arrive as ImageBitmaps already cropped to the zone.
import { FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { FaceObs, HandObs, PoseObs } from "../core/types.ts";
import { cropToFull, fullToCrop, type Rect } from "../core/zone/Zone.ts";
import { MODEL_PATHS, toHandObs, WASM_PATH, type Delegate, type DelegatePreference } from "./landmarkers.ts";

// MediaPipe loads its wasm loader with a dynamic import (preferring self.import if present) and
// reads globalThis.ModuleFactory, which it clears after creating each model. A module is only
// evaluated once, so a second model (pose, face, wrist crops) would find no factory: the hook
// sets it again from the module's default export on every load. In dev it also bypasses Vite's
// rewriting of dynamic imports (appended ?import), which breaks loading files from public/.
const dynamicImport: (url: string) => Promise<{ default: unknown }> = import.meta.env.DEV
  ? (new Function("u", "return import(u)") as (url: string) => Promise<{ default: unknown }>)
  : (url) => import(/* @vite-ignore */ url);
(globalThis as unknown as { import: (url: string) => Promise<unknown> }).import = async (url: string) => {
  const m = await dynamicImport(url);
  (globalThis as unknown as { ModuleFactory: unknown }).ModuleFactory = m.default;
  return m;
};

const CROP_PX = 224;
const FACE_PX = 256;

export interface DetectRequest {
  bitmap: ImageBitmap;
  /** Strictly increasing, ms. */
  ts: number;
  /** Which part of the full frame the bitmap shows (landmarks are mapped back with it). */
  crop: Rect;
  pose: boolean;
  face: boolean;
  wristCrops: Rect[];
}

export interface DetectResult {
  /** Landmarks normalised to the FULL frame. */
  hands: HandObs[];
  poses: PoseObs[] | null;
  /** Aligned with `poses`; null entries where no face was found. */
  faces: (FaceObs | null)[] | null;
  handMs: number;
  poseMs: number;
  faceMs: number;
  cropMs: number;
}

export class VisionRunner {
  private fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null = null;
  private hands: HandLandmarker | null = null;
  private pose = new LazyModel<PoseLandmarker>("pose");
  private face = new LazyModel<FaceLandmarker>("face");
  private cropHands = new LazyModel<HandLandmarker>("wrist-crop hands");
  private cropCanvas: OffscreenCanvas | null = null;
  private faceCanvas: OffscreenCanvas | null = null;
  private numHands = 2;
  delegate: Delegate = "GPU";

  async init(pref: DelegatePreference, numHands: number): Promise<Delegate> {
    this.numHands = numHands;
    // In workers MediaPipe imports its wasm loader (needs the ES-module build); on the main thread
    // it adds a classic <script> tag (needs the classic build).
    const inWorker = typeof (globalThis as { importScripts?: unknown }).importScripts === "function";
    this.fileset ??= await FilesetResolver.forVisionTasks(WASM_PATH, inWorker);
    const order: Delegate[] = pref === "auto" ? ["GPU", "CPU"] : [pref];
    let lastErr: unknown;
    for (const d of order) {
      try {
        this.hands = await HandLandmarker.createFromOptions(this.fileset, {
          baseOptions: { modelAssetPath: MODEL_PATHS.hand, delegate: d },
          runningMode: "VIDEO",
          numHands,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.5,
        });
        this.delegate = d;
        this.warmUp();
        return d;
      } catch (err) {
        lastErr = err;
        this.hands?.close();
        this.hands = null;
      }
    }
    throw lastErr;
  }

  async setNumHands(n: number): Promise<void> {
    this.numHands = n;
    await this.hands?.setOptions({ numHands: n });
  }

  /** The tracker's region of interest refers to the old crop; restart tracking. */
  async reset(): Promise<void> {
    await this.hands?.setOptions({ numHands: this.numHands });
  }

  close(): void {
    this.hands?.close();
    this.hands = null;
    for (const m of [this.pose, this.face, this.cropHands]) m.close();
  }

  async detect(req: DetectRequest): Promise<DetectResult> {
    const { bitmap, ts, crop } = req;
    const t0 = performance.now();
    const hands = this.hands ? toHandObs(this.hands.detectForVideo(bitmap, ts)) : [];
    const t1 = performance.now();
    let poses: PoseObs[] | null = null;
    let raw: NormalizedLandmark[][] = [];
    // Extra models load in the background on first use; until then the frame simply has no poses.
    const pose = req.pose ? this.pose.get(() => this.createPose()) : null;
    if (pose) {
      raw = pose.detectForVideo(bitmap, ts).landmarks;
      poses = raw.map((lms) => ({
        landmarks: lms.map((l) => cropToFull({ x: l.x, y: l.y, z: l.z, visibility: l.visibility }, crop)),
      }));
    }
    const t2 = performance.now();
    const face = req.face && raw.length ? this.face.get(() => this.createFace()) : null;
    const faces = face ? this.facesFor(face, bitmap, raw, crop) : null;
    const t3 = performance.now();
    for (const h of hands) h.landmarks = h.landmarks.map((l) => cropToFull(l, crop));
    const cropHands = req.wristCrops.length ? this.cropHands.get(() => this.createCropHands()) : null;
    const extra = cropHands ? this.handsInCrops(cropHands, bitmap, req.wristCrops, crop, hands) : [];
    const t4 = performance.now();
    return { hands: [...hands, ...extra], poses, faces, handMs: t1 - t0, poseMs: t2 - t1, faceMs: t3 - t2, cropMs: t4 - t3 };
  }

  /**
   * One detection on a blank image before reporting ready. MediaPipe needs WebGL for image
   * conversion even on the CPU delegate; engines without WebGL in workers (WebKit before Safari
   * 17, i.e. macOS 13) only fail on the first frame. Failing here makes the app fall back to the
   * main thread instead of silently detecting nothing.
   */
  private warmUp(): void {
    const canvas = new OffscreenCanvas(64, 64);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.fillRect(0, 0, 64, 64);
    const bitmap = canvas.transferToImageBitmap();
    try {
      this.hands!.detectForVideo(bitmap, 1);
    } finally {
      bitmap.close();
    }
  }

  private createPose(): Promise<PoseLandmarker> {
    return PoseLandmarker.createFromOptions(this.fileset!, {
      baseOptions: { modelAssetPath: MODEL_PATHS.pose, delegate: this.delegate },
      runningMode: "VIDEO",
      numPoses: 4,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  private createFace(): Promise<FaceLandmarker> {
    return FaceLandmarker.createFromOptions(this.fileset!, {
      baseOptions: { modelAssetPath: MODEL_PATHS.face, delegate: this.delegate },
      runningMode: "IMAGE",
      numFaces: 1,
      outputFaceBlendshapes: true,
    });
  }

  private createCropHands(): Promise<HandLandmarker> {
    return HandLandmarker.createFromOptions(this.fileset!, {
      baseOptions: { modelAssetPath: MODEL_PATHS.hand, delegate: this.delegate },
      runningMode: "IMAGE",
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
    });
  }

  /**
   * Mouth signal per person: the head region is cut out using the pose (nose, eyes, ears, mouth
   * corners = pose landmarks 0-10) and enlarged, which works at distances where full-frame face
   * detection gives up. Only jawOpen and four lip/face points are returned.
   */
  private facesFor(fl: FaceLandmarker, bitmap: ImageBitmap, posesRaw: NormalizedLandmark[][], crop: Rect): (FaceObs | null)[] {
    this.faceCanvas ??= new OffscreenCanvas(FACE_PX, FACE_PX);
    const canvas = this.faceCanvas;
    const ctx = canvas.getContext("2d")!;
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
      const r = fl.detect(canvas);
      const mesh = r.faceLandmarks[0];
      if (!mesh) return null;
      const jaw = r.faceBlendshapes[0]?.categories.find((c) => c.categoryName === "jawOpen")?.score ?? null;
      const pick = (i: number) => cropToFull({ x: (sx + mesh[i]!.x * side) / W, y: (sy + mesh[i]!.y * side) / H, z: 0 }, crop);
      return { jawOpen: jaw, lip: [pick(13), pick(14), pick(10), pick(152)] };
    });
  }

  /**
   * Far away the palm detector misses hands that are only a few pixels big in the whole picture.
   * Around a far presenter's wrist (from the pose) the hand fills a 224 px crop and is found again.
   * Skips crops where the regular pass already found a hand.
   */
  private handsInCrops(hl: HandLandmarker, bitmap: ImageBitmap, crops: Rect[], frameCrop: Rect, found: HandObs[]): HandObs[] {
    this.cropCanvas ??= new OffscreenCanvas(CROP_PX, CROP_PX);
    const canvas = this.cropCanvas;
    const ctx = canvas.getContext("2d")!;
    const out: HandObs[] = [];
    for (const c of crops) {
      if (found.some((h) => { const w = h.landmarks[0]!; return w.x >= c.x && w.x <= c.x + c.w && w.y >= c.y && w.y <= c.y + c.h; })) continue;
      // The crop in bitmap pixels (the bitmap shows `frameCrop` of the full frame).
      const tl = fullToCrop({ x: c.x, y: c.y, z: 0 }, frameCrop);
      const br = fullToCrop({ x: c.x + c.w, y: c.y + c.h, z: 0 }, frameCrop);
      const sw = (br.x - tl.x) * bitmap.width;
      const sh = (br.y - tl.y) * bitmap.height;
      if (sw < 4 || sh < 4) continue;
      ctx.clearRect(0, 0, CROP_PX, CROP_PX);
      ctx.drawImage(bitmap, tl.x * bitmap.width, tl.y * bitmap.height, sw, sh, 0, 0, CROP_PX, CROP_PX);
      for (const h of toHandObs(hl.detect(canvas))) {
        h.landmarks = h.landmarks.map((l) => ({ x: c.x + l.x * c.w, y: c.y + l.y * c.h, z: l.z }));
        out.push(h);
      }
    }
    return out;
  }
}

/**
 * A model that is created on first use without blocking the frame that asked for it. A failed
 * load (e.g. a slow disk or an aborted fetch) is retried a few seconds later.
 */
class LazyModel<T extends { close(): void }> {
  private model: T | null = null;
  private loading = false;
  private retryAt = 0;
  private closed = false;
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  /** The model if ready; otherwise starts loading it and returns null for now. */
  get(create: () => Promise<T>): T | null {
    if (this.model || this.loading || this.closed || performance.now() < this.retryAt) return this.model;
    this.loading = true;
    create().then(
      (m) => {
        this.loading = false;
        if (this.closed) m.close();
        else this.model = m;
      },
      (err) => {
        this.loading = false;
        this.retryAt = performance.now() + 3000;
        console.warn(`${this.name} model could not be loaded, retrying`, err);
      },
    );
    return null;
  }

  close(): void {
    this.closed = true;
    this.model?.close();
    this.model = null;
  }
}
