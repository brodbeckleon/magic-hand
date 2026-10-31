import type { Delegate, DelegatePreference } from "../landmarkers.ts";
import type { DetectRequest, DetectResult } from "../runner.ts";

export type ToWorker =
  | { type: "init"; delegate: DelegatePreference; numHands: number }
  | ({ type: "frame"; id: number } & DetectRequest)
  | { type: "reset" }
  | { type: "options"; numHands: number };

export type FromWorker =
  | { type: "ready"; delegate: Delegate }
  | { type: "error"; message: string }
  | ({ type: "result"; id: number } & DetectResult);
