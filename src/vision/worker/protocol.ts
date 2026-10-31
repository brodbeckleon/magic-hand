import type { Delegate } from "../landmarkers.ts";
import type { DetectRequest, DetectResult } from "../runner.ts";

export type ToWorker =
  | { type: "init"; delegate: Delegate; numHands: number }
  | ({ type: "frame"; id: number } & DetectRequest)
  | { type: "reset" }
  | { type: "options"; numHands: number };

export type FromWorker =
  | { type: "ready"; delegate: Delegate }
  | { type: "error"; message: string }
  | ({ type: "result"; id: number } & DetectResult);
