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
  update: (patch) => {
    if (patch.firstRunDone) afterDelete = false; // the setup wizard ran again
    set((s) => {
      const next: Partial<Settings> = {};
      for (const [k, v] of Object.entries(patch) as [keyof Settings, unknown][]) {
        const cur = s[k];
        (next as Record<string, unknown>)[k] =
          v && typeof v === "object" && !Array.isArray(v) && cur && typeof cur === "object" ? { ...cur, ...v } : v;
      }
      return next;
    });
  },
  updateSwipe: (patch) =>
    set((s) => {
      const swipe = { ...s.swipe, ...patch };
      return { swipe, sensitivity: sensitivityOf(swipe) };
    }),
  setSensitivity: (sensitivity) =>
    set((s) => ({ sensitivity, swipe: { ...s.swipe, ...SENSITIVITY_PRESETS[sensitivity] } })),
  reset: async () => {
    resetting = true;
    try {
      dirty = false;
      await saving;
      await deleteSettings();
      skipNextSave = true; // stay deleted until the user changes something again
      afterDelete = true;
      // The file is gone; keep the session usable (the setup wizard comes back at the next launch).
      set({ ...DEFAULT_SETTINGS, firstRunDone: get().firstRunDone, dev: { ...DEFAULT_SETTINGS.dev, unlocked: get().dev.unlocked } });
    } finally {
      // A failed delete must not stop all later saves.
      resetting = false;
    }
  },
}));

let skipNextSave = false;
/**
 * Since "Delete data": hint counters (written automatically) are not saved, so the file stays
 * deleted until the user changes something. Saves then store firstRunDone = false, so the setup
 * wizard still comes back at the next launch unless it ran again in this session.
 */
let afterDelete = false;
/** While deleting, changes must not write the old settings back. */
let resetting = false;
let saving: Promise<void> | null = null;
let dirty = false;

/** Saves right away; changes made while a save is running are written once it finishes. */
function scheduleSave(): void {
  if (resetting) return;
  dirty = true;
  if (saving) return;
  saving = (async () => {
    while (dirty) {
      dirty = false;
      const s = pick(useSettings.getState());
      await saveSettings(afterDelete ? { ...s, firstRunDone: false } : s).catch((err) => console.error("saving settings failed", err));
    }
    saving = null;
  })();
}
/** Loads stored settings into the store and saves every later change. */
export async function initSettings(): Promise<void> {
  const loaded = await loadSettings();
  useSettings.setState({ ...loaded, loaded: true });
  useSettings.subscribe((s, prev) => {
    if (!s.loaded) return;
    if (skipNextSave) {
      skipNextSave = false;
      return;
    }
    if (afterDelete && onlyHintsChanged(s, prev)) return;
    scheduleSave();
  });
}

const onlyHintsChanged = (s: Settings, prev: Settings): boolean =>
  (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).every((k) => k === "hints" || s[k] === prev[k]);
