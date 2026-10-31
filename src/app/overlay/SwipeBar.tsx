import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useEngineInstance } from "../engine/context.ts";
import { useEngine } from "../state/engine.ts";
import { useSettings } from "../state/settings.ts";

/**
 * Before calibration: progress of holding the hand still. Afterwards: how far the current
 * movement is from the trigger threshold (centre = at rest, full left/right = threshold reached).
 */
export function SwipeBar() {
  const { t } = useTranslation();
  const engine = useEngineInstance();
  const calibrated = useEngine((s) => s.calibrated);
  const reverse = useSettings((s) => s.reverse);
  const fill = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      engine.frames.subscribe((s) => {
        const el = fill.current;
        if (!el) return;
        if (!s.calibrated) {
          el.style.left = "0";
          el.style.width = `${(s.calibProgress * 100).toFixed(1)}%`;
          return;
        }
        const p = s.progress;
        el.style.left = `${50 + Math.min(0, p) * 50}%`;
        el.style.width = `${Math.abs(p) * 50}%`;
        el.dataset.hot = String(Math.abs(p) > 0.8);
      }),
    [engine, calibrated],
  );

  if (!calibrated) {
    return (
      <div className="swipe-bar calibrating glass" data-testid="swipe-bar">
        <span>{t("hint.holdStill")}</span>
        <div className="track"><div ref={fill} className="fill" /></div>
      </div>
    );
  }
  const [left, right] = reverse ? [t("hint.prev"), t("hint.next")] : [t("hint.next"), t("hint.prev")];
  return (
    <div className="swipe-bar glass" data-testid="swipe-bar">
      <span className="label">← {left}</span>
      <div className="track">
        <div ref={fill} className="fill" />
        <div className="center" />
      </div>
      <span className="label">{right} →</span>
    </div>
  );
}
