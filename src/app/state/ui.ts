import { create } from "zustand";
import type { Rect } from "../../core/zone/Zone.ts";
import { useSettings } from "./settings.ts";

export type Sheet = "preferences" | "help";
export type WizardKind = "firstRun" | "calibrate";
export type HelpTab = "start" | "trouble" | "privacy" | "about";

interface UiStore {
  /** Full window, or the small always-on-top pill while presenting. */
  view: "main" | "pill";
  /**
   * Presenting with the bar hidden: the window stays on screen (the camera loop needs a visible
   * webview) but draws nothing and lets clicks through. The tray / menu-bar icon shows it again.
   */
  pillHidden: boolean;
  setPillHidden(hidden: boolean): void;
  sheet: Sheet | null;
  helpTab: HelpTab;
  /** Guided flow over the live view (replaces the main chrome while open). */
  wizard: WizardKind | null;
  /** Zone being edited in a wizard: shown instead of the stored one (undefined = not editing). */
  zoneDraft: Rect | null | undefined;
  setZoneDraft(z: Rect | null | undefined): void;
  openWizard(kind: WizardKind): void;
  closeWizard(): void;
  openSheet(sheet: Sheet, helpTab?: HelpTab): void;
  closeSheet(): void;
  setView(view: "main" | "pill"): void;
  /** False when the system refused the global pause shortcut (another app owns it). */
  pauseShortcutOk: boolean;
  setPauseShortcutOk(ok: boolean): void;
}

export const useUi = create<UiStore>()((set) => ({
  view: "main",
  pillHidden: false,
  setPillHidden: (pillHidden) => set((s) => (s.view === "pill" ? { pillHidden } : {})),
  sheet: null,
  helpTab: "start",
  wizard: null,
  zoneDraft: undefined,
  setZoneDraft: (zoneDraft) => set({ zoneDraft }),
  openWizard: (wizard) => set({ wizard, sheet: null }),
  closeWizard: () => set({ wizard: null, zoneDraft: undefined }),
  openSheet: (sheet, helpTab) => set((s) => ({ sheet, helpTab: helpTab ?? s.helpTab })),
  closeSheet: () => set({ sheet: null }),
  setView: (view) => set({ view, sheet: null, pillHidden: view === "pill" && useSettings.getState().pill.start === "hidden" }),
  pauseShortcutOk: true,
  setPauseShortcutOk: (pauseShortcutOk) => set({ pauseShortcutOk }),
}));
