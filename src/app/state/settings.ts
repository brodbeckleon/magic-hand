import { create } from "zustand";
import type { SwipeParams } from "../../core/swipe/params.ts";
import { deleteSettings, loadSettings, saveSettings } from "./persist.ts";
import { DEFAULT_SETTINGS, parseSettings, SENSITIVITY_PRESETS, sensitivityOf, type Sensitivity, type Settings } from "./schema.ts";

export type { Settings } from "./schema.ts";
export { DEFAULT_SETTINGS } from "./schema.ts";

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] };

interface SettingsStore extends Settings {
  loaded: boolean;
  /** Shallow-merges top-level fields and one level of nested objects. */
  update(patch: DeepPartial<Settings>): void;
  updateSwipe(patch: Partial<SwipeParams>): void;
  setSensitivity(s: Exclude<Sensitivity, "custom">): void;
  /** Deletes the stored settings and calibration (MHR08) and returns to defaults. */
  reset(): Promise<void>;
}

/** The persisted part of the store (zod drops the functions and runtime flags). */
const pick = (s: SettingsStore): Settings => parseSettings(s);

export const useSettings = create<SettingsStore>()((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,
  update: (patch) =>
    set((s) => {
      const next: Partial<Settings> = {};
      for (const [k, v] of Object.entries(patch) as [keyof Settings, unknown][]) {
        const cur = s[k];
        (next as Record<string, unknown>)[k] =
          v && typeof v === "object" && !Array.isArray(v) && cur && typeof cur === "object" ? { ...cur, ...v } : v;
      }
      return next;
    }),
  updateSwipe: (patch) =>
    set((s) => {
      const swipe = { ...s.swipe, ...patch };
      return { swipe, sensitivity: sensitivityOf(swipe) };
    }),
  setSensitivity: (sensitivity) =>
    set((s) => ({ sensitivity, swipe: { ...s.swipe, ...SENSITIVITY_PRESETS[sensitivity] } })),
  reset: async () => {
    clearTimeout(saveTimer);
    await deleteSettings();
    skipNextSave = true; // stay deleted until the user changes something again
    set({ ...DEFAULT_SETTINGS, dev: { ...DEFAULT_SETTINGS.dev, unlocked: get().dev.unlocked } });
  },
}));

let saveTimer = 0;
let skipNextSave = false;
/** Loads stored settings into the store and saves every later change (debounced). */
export async function initSettings(): Promise<void> {
  const loaded = await loadSettings();
  useSettings.setState({ ...loaded, loaded: true });
  useSettings.subscribe((s) => {
    if (!s.loaded) return;
    if (skipNextSave) {
      skipNextSave = false;
      return;
    }
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void saveSettings(pick(useSettings.getState())), 300);
  });
}
