import { useEffect, useRef } from "react";
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
  const pillHidden = useUi((s) => s.pillHidden);
  /** The last window-mode change: hiding the bar has to wait until the window is the pill. */
  const pillMode = useRef<Promise<void>>(Promise.resolve());
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
      pillMode.current = platform.setPillMode(true, width, height).catch(logError);
      void pillMode.current.then(() => platform.yieldFocus());
    } else {
      pillMode.current = platform.setPillMode(false, 0, 0).catch(logError);
    }
  }, [view, pillCamera]);

  // Hidden bar: nothing is drawn (CSS) and the window lets clicks through, but it stays on screen so
  // the camera keeps delivering frames and gestures keep working.
  useEffect(() => {
    const hidden = view === "pill" && pillHidden;
    document.documentElement.dataset.pillHidden = String(hidden);
    if (view !== "pill") return;
    void pillMode.current
      .then(() => platform.setPillGhost(hidden))
      .then(() => platform.yieldFocus())
      .catch(logError);
  }, [view, pillHidden]);

  useEffect(() => {
    void platform.updateTray({
      pause: t(paused ? "tray.resume" : "tray.pause"),
      show: t("tray.show"),
      toggle: view === "pill" ? t(pillHidden ? "tray.showBar" : "tray.hideBar") : "",
      recalibrate: t("tray.recalibrate"),
      quit: t("tray.quit"),
      tooltip: t(paused ? "tray.tooltipPaused" : calibrated ? "tray.tooltipActive" : "tray.tooltipCalibrating"),
    });
  }, [t, paused, calibrated, view, pillHidden]);

  useEffect(() => {
    const setOk = useUi.getState().setPauseShortcutOk;
    platform.setPauseShortcut(shortcut).then(
      () => setOk(true),
      (err) => {
        console.warn("pause shortcut not available", err);
        setOk(false);
      },
    );
  }, [shortcut]);

  useEffect(() => {
    const offTray = platform.onTrayAction((a) => {
      const ui = useUi.getState();
      if (a === "pause") engine.togglePause();
      else if (a === "recalibrate") engine.recalibrate();
      else if (a === "toggle") ui.setPillHidden(!ui.pillHidden);
      else ui.setPillHidden(false); // "show": the window was asked to come back (tray, second launch)
    });
    const offShortcut = platform.onPauseShortcut(() => engine.togglePause());
    return () => {
      offTray();
      offShortcut();
    };
  }, [engine]);
}

const logError = (err: unknown) => console.error("window mode failed", err);
