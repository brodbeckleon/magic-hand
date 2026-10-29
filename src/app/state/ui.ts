import { create } from "zustand";

export type Sheet = "preferences" | "help" | "calibrate";
export type HelpTab = "start" | "trouble" | "privacy" | "about";

interface UiStore {
  /** Full window, or the small always-on-top pill while presenting. */
  view: "main" | "pill";
  sheet: Sheet | null;
  helpTab: HelpTab;
  openSheet(sheet: Sheet, helpTab?: HelpTab): void;
  closeSheet(): void;
  setView(view: "main" | "pill"): void;
}

export const useUi = create<UiStore>()((set) => ({
  view: "main",
  sheet: null,
  helpTab: "start",
  openSheet: (sheet, helpTab) => set((s) => ({ sheet, helpTab: helpTab ?? s.helpTab })),
  closeSheet: () => set({ sheet: null }),
  setView: (view) => set({ view, sheet: null }),
}));
