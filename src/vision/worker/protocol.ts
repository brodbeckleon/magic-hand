import type { FaceObs, HandObs, PoseObs } from "../../core/types.ts";
import type { Rect } from "../../core/zone/Zone.ts";
import type { Delegate, DelegatePreference } from "../landmarkers.ts";

export type ToWorker =
  | { type: "init"; delegate: DelegatePreference; numHands: number }
  | {
      type: "frame";
      id: number;
      bitmap: ImageBitmap;
      /** Strictly increasing, ms. */
      ts: number;
      /** Which part of the full frame the bitmap shows (landmarks are mapped back with it). */
      crop: Rect;
      pose: boolean;
      /** Face landmarks on pose-derived head crops (requires pose). */
      face: boolean;
      /** Full-frame rects around far presenters' wrists: run the hand model on these enlarged. */
      wristCrops: Rect[];
    }
  | { type: "reset" }
  | { type: "options"; numHands: number };

export type FromWorker =
  | { type: "ready"; delegate: Delegate }
  | { type: "error"; message: string }
  | {
      type: "result";
      id: number;
      /** Landmarks normalised to the FULL frame. */
      hands: HandObs[];
      poses: PoseObs[] | null;
      /** Aligned with `poses`; null entries where no face was found. */
      faces: (FaceObs | null)[] | null;
      handMs: number;
      poseMs: number;
      faceMs: number;
      cropMs: number;
    };
