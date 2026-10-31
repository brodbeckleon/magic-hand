import { useEffect } from "react";
import type { Engine } from "./engine/Engine.ts";
import { useSettings } from "./state/settings.ts";

/**
 * In-window keys. Prototype keys: p pause, k recalibrate, m missed gesture, f false trigger.
 * Developer tools: Ctrl/Cmd+Shift+D shows/hides them, e exports the log while they are shown.
 */
export function useShortcuts(engine: Engine): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && key === "d") {
        e.preventDefault();
        const { dev, update } = useSettings.getState();
        update({ dev: { unlocked: !dev.unlocked } });
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const actions: Record<string, () => void> = {
        p: () => engine.togglePause(),
        k: () => engine.recalibrate(),
        m: () => engine.markMissed(),
        f: () => engine.markFalse(),
        e: () => useSettings.getState().dev.unlocked && void engine.exportCsv(),
      };
      const action = actions[key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine]);
}
