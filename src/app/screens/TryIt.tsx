import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../design/Icon.tsx";
import { useEngineInstance } from "../engine/context.ts";
import { useEngine } from "../state/engine.ts";
import { useSettings } from "../state/settings.ts";

const SHOWN = ["next", "prev", "ignored_dir", "ignored_closed", "ignored_return", "ignored_windup", "ignored_weak", "ignored_other_hand", "ignored_not_speaker"] as const;
type Result = { id: number; kind: (typeof SHOWN)[number]; swipe?: "left" | "right" };
const isShown = (k: string): k is Result["kind"] => (SHOWN as readonly string[]).includes(k);

/**
 * "Try it now" inside Help: swipe in front of the camera and see what Magic Hand understood, with
 * no key sent (so the presentation does not move while reading the help).
 */
export function TryIt() {
  const { t } = useTranslation();
  const engine = useEngineInstance();
  const calibrated = useEngine((s) => s.calibrated);
  const reverse = useSettings((s) => s.reverse);
  const [active, setActive] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!active) return;
    const release = engine.suppressKeys();
    const off = engine.events.subscribe((e) => {
      if (isShown(e.kind)) {
        setResult({ id: e.id, kind: e.kind, swipe: e.swipe });
        if (e.kind === "next" || e.kind === "prev") setCount((c) => c + 1);
      }
    });
    return () => {
      off();
      release();
    };
  }, [active, engine]);

  if (!active) {
    return (
      <button className="btn primary try-start" data-testid="try-it" onClick={() => setActive(true)}>
        <Icon name="hand" size={18} />{t("help.try.start")}
      </button>
    );
  }
  const nextDir = t(reverse ? "help.dirRight" : "help.dirLeft");
  return (
    <div className="try-panel" data-testid="try-panel">
      <div className="try-head">
        <strong>{t("help.try.title")}</strong>
        <button className="link" onClick={() => setActive(false)}>{t("help.try.stop")}</button>
      </div>
      <p className="dim">
        {calibrated ? t("help.try.lead", { dir: nextDir }) : t("help.try.armFirst")}
      </p>
      <div className="try-result" aria-live="polite">
        <AnimatePresence mode="wait">
          {result && (
            <motion.div key={result.id} className={`try-fb ${result.kind === "next" || result.kind === "prev" ? "ok" : "warn"}`}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} data-testid="try-result">
              {result.kind === "next" || result.kind === "prev" ? <Icon name={result.swipe === "left" ? "arrowLeft" : "arrowRight"} size={28} /> : <Icon name="warning" size={24} />}
              <span>{t(`help.try.result.${result.kind}`)}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {count > 0 && <p className="dim small">{t("help.try.count", { count })}</p>}
    </div>
  );
}
