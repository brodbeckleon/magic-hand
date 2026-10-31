import { useEffect, useRef, useState } from "react";
import { classifyFocus, type FrontApp } from "../../core/focus/classify.ts";
import { useTranslation } from "react-i18next";
import { platform } from "../../platform/index.ts";
import { RecBadge } from "../debug/DevPanel.tsx";
import { Icon } from "../design/Icon.tsx";
import { useEngineInstance } from "../engine/context.ts";
import { useEngine } from "../state/engine.ts";
import { useSettings } from "../state/settings.ts";
import { useUi } from "../state/ui.ts";

/**
 * The window while presenting: an always-on-top bar with the state and the last action, and the
 * live camera (the <video> and overlays of the main view, repositioned by CSS): none, a small
 * thumbnail, or a large view with the hand skeleton so you see that your hand is tracked.
 */
export function Pill() {
  const { t } = useTranslation();
  const engine = useEngineInstance();
  const paused = useEngine((s) => s.paused);
  const calibrated = useEngine((s) => s.calibrated);
  const setView = useUi((s) => s.setView);
  const camera = useSettings((s) => s.pill.camera);
  const last = useRef<HTMLSpanElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const handDot = useRef<HTMLSpanElement>(null);
  const [focus, setFocus] = useState<FrontApp | null>(null);

  // Warn when the slide keys would go to another app (a chat window popped up, wrong window clicked).
  useEffect(() => {
    let alive = true;
    const poll = () => void platform.frontmostApp().then((a) => alive && setFocus(a), () => undefined);
    poll();
    const id = window.setInterval(poll, 2000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  const focusKind = classifyFocus(focus);

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
    <>
    {camera === "large" && <div className="pill-camera-drag" data-tauri-drag-region data-testid="pill-camera" />}
    <div ref={pill} className="pill glass" data-testid="pill" data-state={state} data-focus={focusKind} data-tauri-drag-region>
      <span ref={handDot} className="pill-dot" data-state={state} data-seen="false" data-tauri-drag-region />
      <div className="pill-text" data-tauri-drag-region>
        <strong data-tauri-drag-region>
          {paused ? t("pill.paused") : calibrated ? t("pill.ready") : t("pill.waiting")}
        </strong>
        {focusKind === "other" ? (
          <span className="pill-warn" data-testid="pill-focus-warning" title={t("pill.focusOtherHint")}>
            <Icon name="warning" size={13} /> {t("pill.focusOther", { app: focus!.name })}
          </span>
        ) : (
          <span ref={last} className="pill-last" data-tauri-drag-region />
        )}
      </div>
      <RecBadge />
      {!platform.native && <span className="pill-preview" title={t("main.browserPreview")}>{t("main.preview")}</span>}
      {camera === "small" && <div className="pill-thumb-slot" data-tauri-drag-region />}
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
    </>
  );
}

export type PillCamera = "off" | "small" | "large";

const BAR_H = 64;
const LARGE_W = 360;
const GAP = 8;

/** Window size in logical pixels while presenting; the large camera keeps the camera's aspect ratio. */
export function pillSize(camera: PillCamera, aspect = 4 / 3): { width: number; height: number } {
  if (camera === "off") return { width: 300, height: BAR_H };
  if (camera === "small") return { width: 384, height: BAR_H };
  return { width: LARGE_W, height: Math.round((LARGE_W - 2 * GAP) / aspect) + 2 * GAP + BAR_H };
}
