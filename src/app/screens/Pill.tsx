import { useEffect, useRef, useState } from "react";
import { classifyFocus, type FrontApp } from "../../core/focus/classify.ts";
import { useTranslation } from "react-i18next";
import { platform } from "../../platform/index.ts";
import type { PipelineSnapshot } from "../../core/pipeline/GesturePipeline.ts";
import { RecBadge } from "../debug/DevPanel.tsx";
import { Icon } from "../design/Icon.tsx";
import { useEngineInstance } from "../engine/context.ts";
import { useEngine } from "../state/engine.ts";
import { eventText } from "../state/eventText.ts";
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
  const setPillHidden = useUi((s) => s.setPillHidden);
  const camera = useSettings((s) => s.pill.camera);
  const last = useRef<HTMLSpanElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const handDot = useRef<HTMLSpanElement>(null);
  const ring = useRef<SVGCircleElement>(null);
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

  // Second line: what Magic Hand sees right now, briefly replaced by what just happened. Direct DOM
  // writes, and only when something changed (this runs on every analysed frame).
  useEffect(() => {
    let timer = 0;
    let back = 0;
    let eventUntil = 0;
    let statusKey = "";
    let statusText = "";
    const show = (text: string) => {
      if (last.current && last.current.textContent !== text) last.current.textContent = text;
    };
    const offEvents = engine.events.subscribe((e) => {
      if (!pill.current) return;
      const arrow = e.kind === "next" || e.kind === "prev" ? `${e.swipe === "left" ? "←" : "→"} ` : "";
      show(arrow + eventText(t, "pill.event", e));
      eventUntil = performance.now() + EVENT_SHOW_MS;
      pill.current.dataset.flash = e.kind;
      clearTimeout(timer);
      clearTimeout(back);
      timer = window.setTimeout(() => {
        if (pill.current) delete pill.current.dataset.flash;
      }, 900);
      // Back to the live status even if no frame comes (paused: the line stays empty).
      back = window.setTimeout(() => !useEngine.getState().paused && show(statusText), EVENT_SHOW_MS);
    });
    const offFrames = engine.frames.subscribe((s) => {
      if (handDot.current) handDot.current.dataset.seen = String(s.hands.length > 0);
      const status = liveStatus(s);
      updateRing(ring.current, status.claim);
      if (status.key !== statusKey) {
        statusKey = status.key;
        statusText = t(status.text, status.args);
      }
      if (performance.now() >= eventUntil) show(statusText);
    });
    return () => {
      offEvents();
      offFrames();
      clearTimeout(timer);
      clearTimeout(back);
    };
  }, [engine, t]);

  // Paused: the camera is off, so the last status would be stale.
  useEffect(() => {
    if (paused && last.current) last.current.textContent = "";
    updateRing(ring.current, 0);
  }, [paused]);

  useYieldFocusAfterDrag();

  // Clicking the pill activates our window on macOS; give the focus back to the presentation.
  const act = (fn: () => void) => () => {
    fn();
    void platform.yieldFocus();
  };

  // Camera off first (LED off, MHR08), then the app ends.
  const quit = () => {
    engine.dispose();
    void platform.quitApp();
  };

  const state = paused ? "paused" : calibrated ? "active" : "calibrating";
  return (
    <>
    {camera === "large" && <div className="pill-camera-drag" data-tauri-drag-region data-testid="pill-camera" />}
    <div ref={pill} className="pill glass" data-testid="pill" data-state={state} data-focus={focusKind} data-tauri-drag-region>
      <span className="pill-dot-wrap" data-tauri-drag-region>
        {/* Fills while someone holds up an open palm to take over (several people in view). */}
        <svg className="pill-ring" viewBox="0 0 24 24" aria-hidden data-testid="pill-takeover" data-progress="0" visibility="hidden">
          <circle ref={ring} cx="12" cy="12" r="10" fill="none" pathLength={100} strokeDasharray="100" strokeDashoffset="100" transform="rotate(-90 12 12)" />
        </svg>
        <span ref={handDot} className="pill-dot" data-state={state} data-seen="false" data-tauri-drag-region />
      </span>
      <div className="pill-text" data-tauri-drag-region>
        <strong data-tauri-drag-region>
          {paused ? t("pill.paused") : calibrated ? t("pill.ready") : t("pill.waiting")}
        </strong>
        {focusKind === "other" ? (
          <span className="pill-warn" data-testid="pill-focus-warning" title={t("pill.focusOtherHint")}>
            <Icon name="warning" size={13} /> {t("pill.focusOther", { app: focus!.name })}
          </span>
        ) : (
          <span ref={last} className="pill-last" data-testid="pill-status" aria-live="polite" data-tauri-drag-region />
        )}
      </div>
      <RecBadge />
      {!platform.native && <span className="pill-preview" title={t("main.browserPreview")}>{t("main.preview")}</span>}
      {camera === "small" && <div className="pill-thumb-slot" data-tauri-drag-region />}
      <div className="pill-actions">
        <button
          className="icon-btn"
          data-testid="pill-pause"
          aria-label={paused ? t("pill.resume") : t("pill.pause")}
          title={paused ? t("pill.resume") : t("pill.pause")}
          onClick={act(() => engine.togglePause())}
        >
          <Icon name={paused ? "play" : "pause"} />
        </button>
        {/* The window keeps running invisibly (gestures work); the focus goes back via the effect. */}
        <button className="icon-btn" data-testid="pill-hide" aria-label={t("pill.hide")} title={t("pill.hideHint")} onClick={() => setPillHidden(true)}>
          <Icon name="hide" />
        </button>
        <button className="icon-btn" data-testid="pill-expand" aria-label={t("pill.expand")} title={t("pill.expand")} onClick={() => setView("main")}>
          <Icon name="expand" />
        </button>
        <button className="icon-btn" data-testid="pill-quit" aria-label={t("pill.quit")} title={t("pill.quit")} onClick={quit}>
          <Icon name="quit" />
        </button>
      </div>
    </div>
    </>
  );
}

/**
 * Dragging the pill (or clicking anywhere on it) activates our window on macOS. Swipes then send
 * no keys (they would land in our own UI), so once the mouse is released the focus goes back to
 * the presentation. Windows never activates the pill (WS_EX_NOACTIVATE).
 */
function useYieldFocusAfterDrag() {
  useEffect(() => {
    if (!platform.native) return;
    let pressed = false;
    let timer = 0;
    const check = () => {
      window.clearTimeout(timer);
      if (!document.hasFocus()) return;
      // A native window drag swallows the pointerup: keep checking until the button is up.
      if (pressed) timer = window.setTimeout(check, 300);
      else void platform.yieldFocus();
    };
    const onFocus = () => (timer = window.setTimeout(check, 300));
    const onDown = () => (pressed = true);
    const onUp = () => {
      pressed = false;
      if (document.hasFocus()) timer = window.setTimeout(check, 150);
    };
    const onMove = (e: PointerEvent) => e.buttons === 0 && (pressed = false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointermove", onMove, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointermove", onMove, true);
    };
  }, []);
}

/** How long an event replaces the live status in the bar. */
const EVENT_SHOW_MS = 1500;

/**
 * The live status line: who controls the slides with several people in view (or the progress of
 * someone taking over), otherwise whether a hand is seen. `key` changes only when the text does.
 */
export function liveStatus(s: PipelineSnapshot): { key: string; text: string; args?: Record<string, unknown>; claim: number } {
  const confirmed = s.persons.filter((p) => p.confirmed);
  if (confirmed.length >= 2) {
    // The speaker holding a hand still is not taking over (it is the same sign).
    const claim = Math.max(0, ...confirmed.filter((p) => !p.active).map((p) => p.claim));
    if (claim > 0.05) {
      const p = Math.round(claim * 10) * 10; // steps of 10 %: the text does not flicker every frame
      return { key: `t${p}`, text: "pill.takeover", args: { p }, claim };
    }
    const slot = confirmed.find((p) => p.active)?.slot;
    return slot ? { key: `c${slot}`, text: "pill.status.controls", args: { n: slot }, claim: 0 } : { key: "x", text: "pill.status.nobody", claim: 0 };
  }
  return s.hands.length ? { key: "h", text: "pill.status.handSeen", claim: 0 } : { key: "0", text: "pill.status.noHand", claim: 0 };
}

function updateRing(circle: SVGCircleElement | null, claim: number): void {
  const svg = circle?.ownerSVGElement;
  if (!circle || !svg) return;
  const visible = claim > 0.05 ? "visible" : "hidden";
  if (svg.getAttribute("visibility") !== visible) svg.setAttribute("visibility", visible);
  const p = String(Math.round(claim * 100));
  if (svg.dataset.progress !== p) {
    svg.dataset.progress = p;
    circle.setAttribute("stroke-dashoffset", String(100 - Number(p)));
  }
}

export type PillCamera = "off" | "small" | "large";

const BAR_H = 64;
const LARGE_W = 380;
const GAP = 8;

/**
 * Window size in logical pixels while presenting; the large camera keeps the camera's aspect ratio.
 * The widths leave the status text about as much room as before the Hide and Quit buttons.
 */
export function pillSize(camera: PillCamera, aspect = 4 / 3): { width: number; height: number } {
  if (camera === "off") return { width: 364, height: BAR_H };
  if (camera === "small") return { width: 448, height: BAR_H };
  return { width: LARGE_W, height: Math.round((LARGE_W - 2 * GAP) / aspect) + 2 * GAP + BAR_H };
}
