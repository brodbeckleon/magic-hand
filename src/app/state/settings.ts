import { create } from "zustand";
import { DEFAULT_SWIPE_PARAMS, type SwipeParams } from "../../core/swipe/params.ts";
import type { PreferredHand } from "../../core/types.ts";
import type { KeyMapping } from "../../platform/index.ts";
import type { DelegatePreference } from "../../vision/landmarkers.ts";

export interface Settings {
  /** Swipe right = next slide (default: swipe left = next, like a phone). */
  reverse: boolean;
  preferredHand: PreferredHand;
  keyMapping: KeyMapping;
  /** Recognise gestures but do not send keys (prototype --trocken). */
  dryRun: boolean;
  swipe: SwipeParams;
  /** Developer option: which MediaPipe delegate to use. */
  delegate: DelegatePreference;
}

export const DEFAULT_SETTINGS: Settings = {
  reverse: false,
  preferredHand: "either",
  keyMapping: "arrows",
  dryRun: false,
  swipe: { ...DEFAULT_SWIPE_PARAMS },
  delegate: "auto",
};

interface SettingsStore extends Settings {
  update(patch: Partial<Settings>): void;
  updateSwipe(patch: Partial<SwipeParams>): void;
}

export const useSettings = create<SettingsStore>()((set) => ({
  ...DEFAULT_SETTINGS,
  update: (patch) => set(patch),
  updateSwipe: (patch) => set((s) => ({ swipe: { ...s.swipe, ...patch } })),
}));
