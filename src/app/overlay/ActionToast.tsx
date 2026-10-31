import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEngineInstance } from "../engine/context.ts";
import { useSettings } from "../state/settings.ts";
import type { UiEvent } from "../state/engine.ts";

/** How often each explanation is shown before the user is assumed to know it. */
const MAX_SHOWS: Partial<Record<UiEvent["kind"], number>> = { ignored_dir: 5, ignored_return: 3, ignored_not_speaker: 5, speaker: Infinity };

/**
 * Explains why a movement did not change the slide, a few times only (guided, not nagging).
 * Developers with the event list see every event there instead.
 */
export function ActionToast() {
  const { t } = useTranslation();
  const engine = useEngineInstance();
  const [toast, setToast] = useState<UiEvent | null>(null);

  useEffect(() => {
    let timer = 0;
    const off = engine.events.subscribe((e) => {
      const max = MAX_SHOWS[e.kind];
      if (max === undefined) return;
      const { hints, update, dev } = useSettings.getState();
      if (dev.unlocked && dev.showEvents) return;
      const key = `toast.${e.kind}`;
      const shown = hints[key] ?? 0;
      if (shown >= max) return;
      if (Number.isFinite(max)) update({ hints: { [key]: shown + 1 } });
      setToast(e);
      clearTimeout(timer);
      timer = window.setTimeout(() => setToast(null), 1800);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [engine]);

  return (
    <div className="toast-slot" aria-live="polite">
      {/* One toast at a time: the next waits until the previous has faded out. */}
      <AnimatePresence mode="wait">
        {toast && (
          <motion.div
            key={toast.id}
            className="toast glass"
            data-testid="toast"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
          >
            {t(`toast.${toast.kind}`, { n: toast.person ?? "–" })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
