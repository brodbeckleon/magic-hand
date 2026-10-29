import type { HandObs, PoseObs } from "../../core/types.ts";
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
      handMs: number;
      poseMs: number;
    };
