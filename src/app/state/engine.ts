import { create } from "zustand";
import type { CameraError } from "../../vision/camera.ts";
import type { Side } from "../../core/types.ts";
import type { Delegate } from "../../vision/landmarkers.ts";
import type { RateMode } from "../../core/pipeline/governor.ts";

export type EngineStatus =
  | { kind: "idle" }
  | { kind: "starting" }
  /** Camera runs, hand model still loading. */
  | { kind: "loading" }
  | { kind: "live" }
  | { kind: "error"; error: CameraError | "model" | "gpu" };

export type UiEventKind =
  | "calibrated" | "next" | "prev" | "ignored_dir" | "ignored_return" | "ignored_windup" | "ignored_not_speaker" | "ignored_closed"
  | "ignored_weak" | "ignored_other_hand" | "speaker" | "missed" | "false"
  /** A swipe while Magic Hand itself had the focus: the key was not sent (it would land in our UI). */
  | "key_focus"
  /** Sending the key failed (e.g. no Accessibility permission): the slide did not change. */
  | "key_failed";

export interface UiEvent {
  id: number;
  kind: UiEventKind;
  /** Local wall-clock time HH:MM:SS. */
  clock: string;
  swipe?: "left" | "right";
  reactionMs?: number;
  /** Threshold frame captured -> key, ms. */
  detectMs?: number;
  /** Person concerned (speaker changes, ignored swipes), raw id; null = nobody has control. */
  person?: number | null;
  /** The number shown for that person (1..maxPeople); null if not known. */
  slot?: number | null;
  /** Hand concerned (ignored movements): where the overlay explains it. */
  side?: Side;
}

interface EngineStore {
  status: EngineStatus;
  paused: boolean;
  /** Why the camera is off: the user paused, or nobody was in view for a while. */
  pausedReason: "user" | "idle";
  calibrated: boolean;
  fps: number;
  inferenceMs: number;
  /** Analysis rate: every frame (active), 15 fps (watch: someone, no hand), 5 fps (empty). */
  rate: RateMode;
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
  rate: "watch",
  delegate: null,
  worker: false,
  recent: [],
  set: (patch) => set(patch),
  push: (e) => set((s) => ({ recent: [e, ...s.recent].slice(0, 5) })),
}));
