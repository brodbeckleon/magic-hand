import { create } from "zustand";
import type { CameraError } from "../../vision/camera.ts";
import type { Delegate } from "../../vision/landmarkers.ts";

export type EngineStatus =
  | { kind: "idle" }
  | { kind: "starting" }
  /** Camera runs, hand model still loading. */
  | { kind: "loading" }
  | { kind: "live" }
  | { kind: "error"; error: CameraError | "model" | "gpu" };

export type UiEventKind =
  | "calibrated" | "next" | "prev" | "ignored_dir" | "ignored_return" | "ignored_not_speaker" | "speaker" | "missed" | "false";

export interface UiEvent {
  id: number;
  kind: UiEventKind;
  /** Local wall-clock time HH:MM:SS. */
  clock: string;
  swipe?: "left" | "right";
  reactionMs?: number;
  /** Threshold frame captured -> key, ms. */
  detectMs?: number;
  /** Person concerned (speaker changes, ignored swipes); null = nobody has control. */
  person?: number | null;
}

interface EngineStore {
  status: EngineStatus;
  paused: boolean;
  /** Why the camera is off: the user paused, or nobody was in view for a while. */
  pausedReason: "user" | "idle";
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
  pausedReason: "user",
  calibrated: false,
  fps: 0,
  inferenceMs: 0,
  delegate: null,
  worker: false,
  recent: [],
  set: (patch) => set(patch),
  push: (e) => set((s) => ({ recent: [e, ...s.recent].slice(0, 5) })),
}));
