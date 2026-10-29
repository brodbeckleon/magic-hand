import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { platform } from "../../platform/index.ts";
import { RecBadge } from "../debug/DevPanel.tsx";
import { Icon } from "../design/Icon.tsx";
import { useEngineInstance } from "../engine/context.ts";
import { useEngine } from "../state/engine.ts";
import { useUi } from "../state/ui.ts";

/**
 * The window while presenting: a small always-on-top bar with the state, the last action and an
 * optional camera thumbnail (the <video> of the main view, repositioned by CSS).
 */
export function Pill() {
  const { t } = useTranslation();
  const engine = useEngineInstance();
  const paused = useEngine((s) => s.paused);
  const calibrated = useEngine((s) => s.calibrated);
  const setView = useUi((s) => s.setView);
  const last = useRef<HTMLSpanElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const handDot = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let timer = 0;
    const offEvents = engine.events.subscribe((e) => {
      if (!last.current || !pill.current) return;
      const text = e.kind === "next" || e.kind === "prev" ? `${e.swipe === "left" ? "←" : "→"} ${t(`event.${e.kind}`)}` : t(`event.${e.kind}`, { n: e.person ?? "–" });
      last.current.textContent = text;
      pill.current.dataset.flash = e.kind;
      clearTimeout(timer);
      timer = window.setTimeout(() => pill.current && delete pill.current.dataset.flash, 900);
    });
    const offFrames = engine.frames.subscribe((s) => {
      if (handDot.current) handDot.current.dataset.seen = String(s.hands.length > 0);
    });
    return () => {
      offEvents();
      offFrames();
      clearTimeout(timer);
    };
  }, [engine, t]);

  // Clicking the pill activates our window on macOS; give the focus back to the presentation.
  const act = (fn: () => void) => () => {
    fn();
    void platform.yieldFocus();
  };

  const state = paused ? "paused" : calibrated ? "active" : "calibrating";
  return (
    <div ref={pill} className="pill glass" data-testid="pill" data-state={state} data-tauri-drag-region>
      <span ref={handDot} className="pill-dot" data-state={state} data-seen="false" data-tauri-drag-region />
      <div className="pill-text" data-tauri-drag-region>
        <strong data-tauri-drag-region>
          {paused ? t("pill.paused") : calibrated ? t("pill.ready") : t("pill.waiting")}
        </strong>
        <span ref={last} className="pill-last" data-tauri-drag-region />
      </div>
      <RecBadge />
      <div className="pill-thumb-slot" data-tauri-drag-region />
      <button
        className="icon-btn"
        data-testid="pill-pause"
        aria-label={paused ? t("pill.resume") : t("pill.pause")}
        title={paused ? t("pill.resume") : t("pill.pause")}
        onClick={act(() => engine.togglePause())}
      >
        <Icon name={paused ? "play" : "pause"} />
      </button>
      <button className="icon-btn" data-testid="pill-expand" aria-label={t("pill.expand")} title={t("pill.expand")} onClick={() => setView("main")}>
        <Icon name="expand" />
      </button>
    </div>
  );
}

/** Pill window size in logical pixels. */
export const pillSize = (thumbnail: boolean) => ({ width: thumbnail ? 384 : 300, height: 64 });
