import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEngineInstance } from "../engine/context.ts";
import type { UiEvent } from "../state/engine.ts";

const SHOW_MS = 800;

/** Large arrow when a slide changes. The arrow follows the hand, not the key. */
export function ArrowFlash() {
  const { t } = useTranslation();
  const engine = useEngineInstance();
  const [flash, setFlash] = useState<UiEvent | null>(null);

  useEffect(() => {
    let timer = 0;
    const unsubscribe = engine.events.subscribe((e) => {
      if (e.kind !== "next" && e.kind !== "prev") return;
      setFlash(e);
      clearTimeout(timer);
      timer = window.setTimeout(() => setFlash(null), SHOW_MS);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [engine]);

  const dir = flash?.swipe === "left" ? -1 : 1;
  return (
    <div className="arrow-flash" aria-live="polite">
      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash.id}
            className="card glass"
            data-testid="arrow-flash"
            data-kind={flash.kind}
            initial={{ opacity: 0, x: -40 * dir, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60 * dir }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          >
            <svg viewBox="0 0 200 80" style={{ transform: `scaleX(${dir})` }} aria-hidden>
              <path d="M10 40 H160 M120 8 L176 40 L120 72" fill="none" stroke="var(--coral)" strokeWidth="16"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="text">{t(`flash.${flash.kind}`)}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
