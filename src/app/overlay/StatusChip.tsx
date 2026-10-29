import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useEngineInstance } from "../engine/context.ts";
import { useEngine } from "../state/engine.ts";
import { useSettings } from "../state/settings.ts";

/** Mode, whether a hand is seen, lock/return time and frame rate (prototype status line). */
export function StatusChip() {
  const { t } = useTranslation();
  const engine = useEngineInstance();
  const paused = useEngine((s) => s.paused);
  const calibrated = useEngine((s) => s.calibrated);
  const fps = useEngine((s) => s.fps);
  const dryRun = useSettings((s) => s.dryRun);
  const handRef = useRef<HTMLSpanElement>(null);
  const lockRef = useRef<HTMLSpanElement>(null);

  useEffect(
    () =>
      engine.frames.subscribe((s) => {
        const seen = s.hands.length > 0;
        if (handRef.current) {
          handRef.current.dataset.seen = String(seen);
          handRef.current.textContent = t(seen ? "status.handSeen" : "status.handNone");
        }
        if (lockRef.current) {
          lockRef.current.textContent = !s.calibrated
            ? ""
            : s.blocked
              ? t("status.blocked")
              : s.returnRemaining > 0
                ? t("status.returning", { s: s.returnRemaining.toFixed(1) })
                : "";
        }
      }),
    [engine, t],
  );

  const state = paused ? "paused" : calibrated ? "active" : "calibrating";
  return (
    <div className="status-chip glass" data-testid="status">
      <div className="mode">
        <span className="dot" data-state={state} />
        <span data-testid="mode">{t(`status.${state}`)}</span>
      </div>
      <div className="row">
        <span ref={handRef} className="hand-seen" data-seen="false">{t("status.handNone")}</span>
        <span>{t("status.fps", { fps: fps.toFixed(0) })}</span>
      </div>
      <div className="row">
        <span ref={lockRef} className="lock" />
        {dryRun && <span>{t("status.dryRun")}</span>}
      </div>
    </div>
  );
}
