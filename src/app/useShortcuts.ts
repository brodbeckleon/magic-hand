import { useEffect } from "react";
import type { Engine } from "./engine/Engine.ts";

/** Prototype keys: p pause, k recalibrate, m missed gesture, f false trigger; e exports the log. */
export function useShortcuts(engine: Engine): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const actions: Record<string, () => void> = {
        p: () => engine.togglePause(),
        k: () => engine.recalibrate(),
        m: () => engine.markMissed(),
        f: () => engine.markFalse(),
        e: () => void engine.exportCsv(),
      };
      const action = actions[e.key.toLowerCase()];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine]);
}
