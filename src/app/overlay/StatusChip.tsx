import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../design/Icon.tsx";
import { useEngineInstance } from "../engine/context.ts";
import { useEngine } from "../state/engine.ts";
import { useSettings } from "../state/settings.ts";

/** Mode and whether a hand is seen; developers also get frame rate, model time and lock state. */
export function StatusChip() {
  const { t } = useTranslation();
  const engine = useEngineInstance();
  const calibrated = useEngine((s) => s.calibrated);
  const fps = useEngine((s) => s.fps);
  const inferenceMs = useEngine((s) => s.inferenceMs);
  const delegate = useEngine((s) => s.delegate);
  const dev = useSettings((s) => s.dev);
  const handRef = useRef<HTMLSpanElement>(null);
  const lockRef = useRef<HTMLSpanElement>(null);

  useEffect(
    () =>
      engine.frames.subscribe((s) => {
        const seen = s.hands.length > 0;
        if (handRef.current) {
          handRef.current.dataset.seen = String(seen);
          handRef.current.title = t(seen ? "status.handSeen" : "status.handNone");
          handRef.current.setAttribute("aria-label", handRef.current.title);
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

  const state = calibrated ? "active" : "calibrating";
  return (
    <div className="status-chip glass" data-testid="status">
      <div className="mode">
        <span className="dot" data-state={state} />
        <span data-testid="mode">{t(`status.${state}`)}</span>
        <span ref={handRef} className="hand-seen" data-seen="false" data-testid="hand-seen">
          <Icon name="hand" size={16} />
        </span>
      </div>
      {dev.unlocked && (
        <div className="dev-stats" data-testid="dev-stats">
          <span>{t("status.fps", { fps: fps.toFixed(0) })}</span>
          <span>{inferenceMs.toFixed(0)} ms · {delegate ?? "–"}</span>
          <span ref={lockRef} className="lock" />
          {dev.dryRun && <span className="warn">{t("status.dryRun")}</span>}
        </div>
      )}
    </div>
  );
}
