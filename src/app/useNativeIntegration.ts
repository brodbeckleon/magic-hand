import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import i18n, { systemLanguage } from "../i18n/index.ts";
import { platform } from "../platform/index.ts";
import type { Engine } from "./engine/Engine.ts";
import { learnedKey } from "./hints/registry.ts";
import { pillSize } from "./screens/Pill.tsx";
import { useEngine } from "./state/engine.ts";
import { useSettings } from "./state/settings.ts";
import { useUi } from "./state/ui.ts";

/** Keeps language, window mode, tray and the global shortcut in sync with the app state. */
export function useNativeIntegration(engine: Engine): void {
  const { t } = useTranslation();
  const language = useSettings((s) => s.language);
  const shortcut = useSettings((s) => s.pauseShortcut);
  const pillCamera = useSettings((s) => s.pill.camera);
  const view = useUi((s) => s.view);
  const paused = useEngine((s) => s.paused);
  const calibrated = useEngine((s) => s.calibrated);
  const live = useEngine((s) => s.status.kind === "live");
  const firstRunDone = useSettings((s) => s.firstRunDone);
  const openWizard = useUi((s) => s.openWizard);
  const dev = useSettings((s) => s.dev.unlocked);

  useEffect(() => {
    document.documentElement.dataset.dev = String(dev);
  }, [dev]);

  // First start (or "show the introduction again"): guided setup once the camera runs.
  useEffect(() => {
    if (live && !firstRunDone && !useUi.getState().wizard) openWizard("firstRun");
  }, [live, firstRunDone, openWizard]);

  useEffect(() => {
    const lng = language === "system" ? systemLanguage() : language;
    void i18n.changeLanguage(lng);
    document.documentElement.lang = lng;
  }, [language]);

  useEffect(() => {
    document.documentElement.dataset.view = view;
    document.documentElement.dataset.pillCamera = pillCamera;
    if (view === "pill") {
      // Using presenting mode means the "present" hint is no longer needed.
      const { hints, update } = useSettings.getState();
      if (!hints[learnedKey("present")]) update({ hints: { [learnedKey("present")]: 1 } });
      const video = document.querySelector<HTMLVideoElement>("video.camera");
      const aspect = video?.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3;
      const { width, height } = pillSize(pillCamera, aspect);
      void platform.setPillMode(true, width, height).then(() => platform.yieldFocus());
    } else {
      void platform.setPillMode(false, 0, 0);
    }
  }, [view, pillCamera]);

  useEffect(() => {
    void platform.updateTray({
      pause: t(paused ? "tray.resume" : "tray.pause"),
      show: t("tray.show"),
      recalibrate: t("tray.recalibrate"),
      quit: t("tray.quit"),
      tooltip: t(paused ? "tray.tooltipPaused" : calibrated ? "tray.tooltipActive" : "tray.tooltipCalibrating"),
    });
  }, [t, paused, calibrated]);

  useEffect(() => {
    platform.setPauseShortcut(shortcut).catch((err) => console.warn("pause shortcut not available", err));
  }, [shortcut]);

  useEffect(() => {
    const offTray = platform.onTrayAction((a) => (a === "pause" ? engine.togglePause() : engine.recalibrate()));
    const offShortcut = platform.onPauseShortcut(() => engine.togglePause());
    return () => {
      offTray();
      offShortcut();
    };
  }, [engine]);
}
