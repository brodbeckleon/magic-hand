import { create } from "zustand";
import type { CameraError } from "../../vision/camera.ts";
import type { Delegate } from "../../vision/landmarkers.ts";

export type EngineStatus =
  | { kind: "idle" }
  | { kind: "starting" }
  /** Camera runs, hand model still loading. */
  | { kind: "loading" }
  | { kind: "live" }
  | { kind: "error"; error: CameraError | "model" };

export type UiEventKind = "calibrated" | "next" | "prev" | "ignored_dir" | "ignored_return" | "missed" | "false";

export interface UiEvent {
  id: number;
  kind: UiEventKind;
  /** Local wall-clock time HH:MM:SS. */
  clock: string;
  swipe?: "left" | "right";
  reactionMs?: number;
}

interface EngineStore {
  status: EngineStatus;
  paused: boolean;
  calibrated: boolean;
  fps: number;
  inferenceMs: number;
  delegate: Delegate | null;
  /** Inference runs in the vision worker (false: main-thread fallback). */
  worker: boolean;
  /** Newest first, at most 5 (prototype overlay list). */
  recent: UiEvent[];
  set(patch: Partial<Omit<EngineStore, "set" | "push">>): void;
  push(e: UiEvent): void;
}

export const useEngine = create<EngineStore>()((set) => ({
  status: { kind: "idle" },
  paused: false,
  calibrated: false,
  fps: 0,
  inferenceMs: 0,
  delegate: null,
  worker: false,
  recent: [],
  set: (patch) => set(patch),
  push: (e) => set((s) => ({ recent: [e, ...s.recent].slice(0, 5) })),
}));
